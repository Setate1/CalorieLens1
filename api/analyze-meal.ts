import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import crypto from "crypto";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { 
  rateLimitCache, 
  PRESET_SAMPLE_MEALS, 
  mealAnalysisCache, 
  getGeminiClient, 
  mealAnalysisResponseSchema, 
  normalizeServerCacheKey, 
  serverDb, 
  CACHE_COLLECTION_NAME 
} from "../server.js";
import {
  validateAndSanityCheckItem,
  evaluateMealConfidenceSafeguard,
} from "../server/sanityChecker.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { imageBase64, mimeType = "image/jpeg", forceRefresh = false, sampleId } = req.body;
    
    // Auth & Rate Limiting
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing or invalid Authorization header." });
      return;
    }
    const token = authHeader.split("Bearer ")[1];
    let decodedToken;
    try {
      decodedToken = await getAdminAuth().verifyIdToken(token);
    } catch (e) {
      res.status(401).json({ error: "Invalid token." });
      return;
    }
    
    const uid = decodedToken.uid;
    const now = Date.now();
    let rl = rateLimitCache.get(uid);
    if (!rl || now > rl.resetTime) {
      rl = { count: 0, resetTime: now + 3600 * 1000 };
    }
    rl.count++;
    rateLimitCache.set(uid, rl);
    if (rl.count > 25) { // 25 requests per hour limit
      res.status(429).json({ error: "Rate limit exceeded." });
      return;
    }
    
    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
      res.status(400).json({ error: "Unsupported MIME type." });
      return;
    }

    // Fast-path: Verified sample meal preset
    if (sampleId && PRESET_SAMPLE_MEALS[sampleId]) {
      console.log(`[Sample Preset Fast-Path] Returning verified baseline for: ${sampleId}`);
      res.json(PRESET_SAMPLE_MEALS[sampleId]);
      return;
    }

    if (!imageBase64) {
      res.status(400).json({ error: "Missing imageBase64 in request body." });
      return;
    }

    // Strip data URL prefix if present
    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, "");

    // Compute SHA-256 hash for deterministic result consistency
    const imageHash = crypto.createHash("sha256").update(cleanBase64).digest("hex");
    if (forceRefresh) {
      mealAnalysisCache.delete(imageHash);
    } else if (mealAnalysisCache.has(imageHash)) {
      console.log(`[Cache Hit] Serving identical deterministic result for hash: ${imageHash.slice(0, 12)}`);
      res.json(mealAnalysisCache.get(imageHash));
      return;
    }

    const ai = getGeminiClient();

    // Check in-memory recognized foods cache for quick instant hits
    if (!forceRefresh) {
      const cached = mealAnalysisCache.get(imageHash);
      if (cached) {
        console.log(`[Cache Hit] Serving identical deterministic result for hash: ${imageHash.slice(0, 12)}`);
        res.json(cached);
        return;
      }
    }

    const prompt = `You are an expert clinical nutrition metrology AI. Your top priority is REALISTIC ESTIMATION, ACCURACY, and INTEGRITY over guessing.

CRITICAL ACCURACY RULE:
Never pretend that a single photo can determine the exact weight of food. The AI must provide an ESTIMATE, not a guaranteed measurement. Never claim "exact weight" or "100% precision" unless numbers were read directly off a visible Nutrition Facts label.

Analyze this image following these STRICT RULES:

### 1. FOOD ITEMS DETECTED & MULTI-ITEM SEGMENTATION:
- Detect and separate each distinct food item on the plate/container (e.g. "Cooked white rice", "Chicken breast, grilled", "Steamed broccoli", "Tahini sauce").
- Do NOT lump everything into one generic item unless it is an inseparable mixed casserole/stew.
- Name each item accurately in item_name matching standard food taxonomy.

### 2. REALISTIC PORTION & WEIGHT ESTIMATION:
- Estimate portion volume from visual cues in portion_description (e.g. "حوالي كوب ونصف (وعاء متوسط)", "قطعة صدر دجاج متوسطة").
- Estimate a realistic weight range in grams:
  * weight_range_min_g (lower plausible bound)
  * weight_range_max_g (upper plausible bound)
  * best_estimate_weight_g & weight_g (most likely midpoint weight)
- Provide portion preset weights:
  * small_weight_g (~65% of typical portion)
  * medium_weight_g (100% of typical portion)
  * large_weight_g (~140% of typical portion)

### 3. CONFIDENCE SCORE TIERS:
- 90–100%: Direct readable Nutrition Facts label OR clear single food with verified standard size/package.
- 75–89%: Good visual identification, clear dish separation, and reliable size reference (plate, utensil, hand).
- 50–74%: Food is identifiable but portion volume, thickness, or density has moderate visual uncertainty.
- Below 50%: Uncertain portion/weight or partially obscured ingredients. If confidence < 40%, trigger RULE 0.

### 4. REFERENCE OBJECT DETECTION:
- Check for reference objects in reference_object_detected: standard dinner plate (26cm), bowl (16cm), fork/spoon (19cm/15cm), cup/glass, beverage can (330ml), hand/fingers, or packaging.

### 5. HIDDEN FATS, OILS, AND SAUCES:
- Check if food is cooked, sautéed, fried, or dressed with potential hidden oils, butter, mayonnaise, tahini, sugar, or cheese.
- If present or suspected, set has_hidden_fats_or_sauces = true, describe in hidden_fats_description, and estimate cooking_oil_estimate_kcal (e.g. 45-90 kcal).

### 6. MACRONUTRIENTS & CALORIC RECONCILIATION:
- Calculate calories, protein_g, carbs_g, fat_g, and fiber_g based on the estimated edible portion and clinical USDA nutritional standards.
- CRITICAL: Calculate genuine, non-zero carbs_g for any food containing starches, grains, flour, sugar, bread, flatbreads, pasta, rice, fruits, legumes, vegetables, coatings, or dairy (e.g. Hawawshi, bread, rice, potatoes, pastries, sauces, fruits). Do not return 0 for carbs_g unless the food is confirmed zero-carb (such as plain unbreaded grilled meat, pure cooking oil, or zero-calorie black coffee).
- Ensure calories reconcile with the Atwater formula (P*4 + C*4 + F*9).

### 7. UNRECOGNIZED / LOW CONFIDENCE SAFEGUARD:
- If image does NOT show recognizable food, or is too dark/blurry to identify with >= 40% confidence, set is_unrecognized_or_low_confidence = true and items = [].

Return STRICTLY a JSON object conforming to the schema.`;

    let responseText = "";
    // Supported Gemini models with fallback hierarchy:
    const modelsToTry = [
      "gemini-3.8-flash",
      "gemini-flash-latest",
      "gemini-3.1-flash-lite",
    ];
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      // Try model with up to 2 attempts on 503 / high demand spikes
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: cleanBase64,
                  },
                },
                {
                  text: prompt,
                },
              ],
            },
            config: {
              systemInstruction:
                "You are an expert clinical nutritionist and metrology AI. Prioritize ACCURACY and INTEGRITY over speed. Follow Strict Nutrition Rules: Unrecognized/Low-Confidence Safeguard (Rule 0: return is_unrecognized_or_low_confidence=true and items=[] for non-food, blurry or <40% confidence), Label First, Variant Detection, Sanity Checking, Confidence Honesty (cap 60% for packaged estimates, 70% for homemade), Blurry Label handling, Fiber & Sugar Alcohols Adjusted Net Carbs, Serving Size breakdown vs Total Container, Language-Agnostic parsing (Arabic/English), and Weight verification against standard category bounds. Return strictly valid JSON object conforming to schema.",
              responseMimeType: "application/json",
              responseSchema: mealAnalysisResponseSchema,
              temperature: 0.0,
            },
          });

          if (response.text) {
            responseText = response.text;
            break;
          }
        } catch (err: any) {
          lastError = err;
          const errStr = String(err?.message || err);
          console.warn(`Model ${modelName} (attempt ${attempt + 1}) encountered error:`, errStr.slice(0, 150));

          // If 503 unavailable (spikes in demand), wait before retrying
          if (errStr.includes("503") || errStr.includes("UNAVAILABLE") || errStr.includes("high demand")) {
            if (attempt === 0) {
              await new Promise((resolve) => setTimeout(resolve, 1200 + Math.random() * 400));
              continue;
            }
          }
          // On other errors (like 429 quota or 404), break immediately to next model
          break;
        }
      }

      if (responseText) {
        break;
      }
    }

    if (!responseText) {
      const errStr = String(lastError?.message || lastError || "");
      const isQuotaOrDemandExhausted =
        errStr.includes("429") ||
        errStr.includes("RESOURCE_EXHAUSTED") ||
        errStr.includes("Quota exceeded") ||
        errStr.includes("503") ||
        errStr.includes("UNAVAILABLE") ||
        errStr.includes("high demand");

      if (isQuotaOrDemandExhausted) {
        console.warn("[Quota/Demand Fallback] Gemini API rate limit or high demand reached. Returning error to user.");
        res.status(503).json({
          error: true,
          error_code: "AI_UNAVAILABLE",
          message: "تعذر تحليل الصورة حالياً. حاول مرة أخرى."
        });
        return;
      }

      throw lastError || new Error("Failed to get analysis from Gemini models.");
    }

    // Strip Markdown JSON fences if present
    let cleanJson = responseText.trim();
    if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    }

    const rawData = JSON.parse(cleanJson);

    // Check Safeguard Requirement 1 & 2:
    const isUnrecognizedFlag =
      rawData.is_unrecognized_or_low_confidence === true ||
      rawData.unrecognized === true;

    const rawList = Array.isArray(rawData)
      ? rawData
      : Array.isArray(rawData.items)
      ? rawData.items
      : Array.isArray(rawData.foods)
      ? rawData.foods
      : [];

    if (isUnrecognizedFlag || rawList.length === 0) {
      console.log("[Safeguard Triggered] Unrecognized food or low-confidence scan from model.");
      res.json({
        unrecognized: true,
        message: "لم نتمكن من التعرف على الطعام بدقة كافية. حاول تصوير الطبق بوضوح أكبر أو من زاوية مختلفة.",
        reason: rawData.unrecognized_reason || "Low confidence / unrecognized food image",
      });
      return;
    }

    // Process and verify through the biological Sanity Check Engine & USDA verification
    const items = rawList.map((item: any, idx: number) => {
      return validateAndSanityCheckItem(item, idx);
    });

    // Check Safeguard Requirement 1 & 5:
    const safeguardResult = evaluateMealConfidenceSafeguard(items);
    if (safeguardResult.isUnrecognized) {
      console.log(`[Safeguard Triggered] Confidence/Sanity safeguard failed: ${safeguardResult.reason}`);
      res.json({
        unrecognized: true,
        message: safeguardResult.message,
        reason: safeguardResult.reason,
      });
      return;
    }

    // Save packaged/branded products to recognized_foods_cache in Firestore
    for (const item of items) {
      if (item.data_source === "label_read" || item.data_source === "product_estimate") {
        const name = item.item_name;
        if (name && name.length >= 3) {
          const cacheKey = normalizeServerCacheKey(name);
          if (cacheKey) {
            const docRef = doc(serverDb, CACHE_COLLECTION_NAME, cacheKey);
            getDoc(docRef).then((docSnap) => {
              if (docSnap.exists()) {
                const existing = docSnap.data();
                updateDoc(docRef, {
                  usageCount: (Number(existing.usageCount) || 1) + 1,
                  calories: Number(item.calories) || existing.calories,
                  protein: Number(item.protein_g) || existing.protein,
                  carbs: Number(item.carbs_g) || existing.carbs,
                  fat: Number(item.fat_g) || existing.fat,
                  weight: Number(item.weight_g) || existing.weight,
                  confidence: Number(item.confidence_score) || existing.confidence,
                  updatedAt: serverTimestamp(),
                }).catch(() => {});
              } else {
                setDoc(docRef, {
                  foodName: name,
                  calories: Number(item.calories) || 0,
                  protein: Number(item.protein_g) || 0,
                  carbs: Number(item.carbs_g) || 0,
                  fat: Number(item.fat_g) || 0,
                  weight: Number(item.weight_g) || 100,
                  confidence: Number(item.confidence_score) || 90,
                  category: item.food_category || "packaged_product",
                  usageCount: 1,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                }).catch(() => {});
              }
            }).catch(() => {});
          }
        }
      }
    }

    // Save to cache for 100% deterministic re-scans of identical photo (only valid, confidence-passing results)
    mealAnalysisCache.set(imageHash, items);

    res.json(items);
  } catch (error: any) {
    console.error("Error analyzing meal:", error);
    const errStr = error?.message || String(error);

    let friendlyMessage = "Failed to analyze meal photo. Please try again.";
    let statusCode = 500;

    if (
      errStr.includes("429") ||
      errStr.includes("RESOURCE_EXHAUSTED") ||
      errStr.includes("Quota exceeded")
    ) {
      statusCode = 429;
      const match = errStr.match(/retry in ([0-9.]+)s/i) || errStr.match(/"retryDelay":\s*"(\d+)s"/i);
      const seconds = match ? Math.ceil(parseFloat(match[1])) : 45;
      friendlyMessage = `Gemini AI Vision rate limit reached. Please wait ${seconds} seconds before scanning again, or test with one of our sample plates.`;
    } else if (
      errStr.includes("503") ||
      errStr.includes("UNAVAILABLE") ||
      errStr.includes("high demand")
    ) {
      statusCode = 503;
      friendlyMessage = "Gemini AI Vision is experiencing a temporary spike in traffic. Please retry in a few seconds.";
    } else if (errStr.includes("404") || errStr.includes("NOT_FOUND")) {
      friendlyMessage = "AI service model route unavailable. Please retry.";
    }

    res.status(statusCode).json({
      error: friendlyMessage,
      statusCode,
    });
  }
}
