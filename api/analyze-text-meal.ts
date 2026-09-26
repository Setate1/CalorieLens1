import type { VercelRequest, VercelResponse } from '@vercel/node';
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { 
  mealAnalysisCache, 
  getGeminiClient, 
  mealAnalysisResponseSchema, 
  normalizeServerCacheKey, 
  serverDb, 
  CACHE_COLLECTION_NAME 
} from "../server.js";
import { validateAndSanityCheckItem } from "../server/sanityChecker.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const textDescription = req.body?.textDescription?.trim();
    if (!textDescription || typeof textDescription !== "string") {
      res.status(400).json({ error: "وصف الوجبة مطلوب (Food description is required)" });
      return;
    }

    console.log(`[Text Food Analysis] Processing description: "${textDescription.slice(0, 80)}"`);

    // Check in-memory cache for exact identical description
    const textHash = `text_${Buffer.from(textDescription.toLowerCase()).toString("base64").slice(0, 32)}`;
    if (mealAnalysisCache.has(textHash)) {
      console.log("[Cache HIT] Serving cached text analysis");
      res.json(mealAnalysisCache.get(textHash));
      return;
    }

    // Check recognized_foods_cache in Firestore for exact or simple product names
    const cacheKey = normalizeServerCacheKey(textDescription);
    if (cacheKey && cacheKey.length >= 2) {
      try {
        const docRef = doc(serverDb, CACHE_COLLECTION_NAME, cacheKey);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const cachedData = docSnap.data();
          await updateDoc(docRef, {
            usageCount: (Number(cachedData.usageCount) || 1) + 1,
            updatedAt: serverTimestamp(),
          }).catch(() => {});

          const resultItem = {
            id: `cache-${cacheKey}`,
            item_name: cachedData.foodName,
            weight_g: Number(cachedData.weight) || 100,
            calories: Number(cachedData.calories) || 0,
            protein_g: Number(cachedData.protein) || 0,
            carbs_g: Number(cachedData.carbs) || 0,
            fat_g: Number(cachedData.fat) || 0,
            confidence_score: 60, // Capped at 60% for text
            food_category: cachedData.category || "packaged_product",
            data_source: "product_estimate",
            is_cached_memory: true,
            is_text_entry: true,
            portion_description: "تقدير تقريبي بناءً على الوصف النصي",
            weight_range_min_g: Math.round((Number(cachedData.weight) || 100) * 0.85),
            weight_range_max_g: Math.round((Number(cachedData.weight) || 100) * 1.15),
            best_estimate_weight_g: Number(cachedData.weight) || 100,
            small_weight_g: Math.round((Number(cachedData.weight) || 100) * 0.7),
            medium_weight_g: Number(cachedData.weight) || 100,
            large_weight_g: Math.round((Number(cachedData.weight) || 100) * 1.3),
            has_hidden_fats_or_sauces: false,
            usda_source: "USDA Verified / Saved Profile",
            reference_object_detected: "وصف نصي بدون صورة (Text Entry)",
          };
          console.log(`[Text Analysis] Found exact product in Firestore cache: ${cachedData.foodName}`);
          const cachedResult = [resultItem];
          mealAnalysisCache.set(textHash, cachedResult);
          res.json(cachedResult);
          return;
        }
      } catch (cacheErr) {
        console.warn("Firestore text cache check error, continuing to AI:", cacheErr);
      }
    }

    const prompt = `You are an expert clinical nutrition metrology AI. Your top priority is REALISTIC ESTIMATION, ACCURACY, and INTEGRITY.

The user is describing their meal/food via text:
"${textDescription}"

Follow these STRICT RULES:
### 1. FOOD ITEMS DETECTED & MULTI-ITEM SEGMENTATION:
- If the description describes multiple foods (e.g., "طبق أرز مع صدر دجاج وسلطة" or "2 eggs, whole wheat toast, and black coffee"), segment each distinct item into its own object in the items array.
- Name each item accurately in item_name matching standard food taxonomy.

### 2. REALISTIC PORTION & WEIGHT ESTIMATION:
- If the user specified an explicit portion, volume, or weight (e.g., "150g", "كوب أرز", "2 بيضة", "قطعتين", "ملعقة زيت"), honor that portion for weight_g and best_estimate_weight_g.
- If no portion was specified, use realistic standard serving sizes.
- Set portion_description explaining the portion (e.g., "تقدير تقريبي بناءً على الوصف النصي: حوالي 150 جرام").
- Provide realistic weight_range_min_g, weight_range_max_g, small_weight_g, medium_weight_g, and large_weight_g.

### 3. CONFIDENCE SCORE CAP (CRITICAL MANDATE):
- Since this is a manual text entry with NO visual camera image or reference object to calibrate portion size, confidence_score MUST BE CAPPED AT MAXIMUM 60% (e.g. 50-60%). NEVER return confidence above 60 for text estimates.

### 4. MACRONUTRIENTS & CALORIC RECONCILIATION:
- Calculate calories, protein_g, carbs_g, fat_g, and fiber_g based on the estimated portion and USDA standards.
- CRITICAL: Calculate genuine, non-zero carbs_g for any food containing starches, grains, flour, bread, flatbreads, rice, pasta, legumes, fruits, vegetables, pastries, or sauces (e.g. Hawawshi, bread, rice, potatoes). Do not return 0 for carbs_g unless the food is verified zero-carb (such as plain unbreaded grilled meat, pure cooking oil, or zero soda).
- Reconcile with the Atwater formula (P*4 + C*4 + F*9).

### 5. GIBBERISH / NON-FOOD SAFEGUARD:
- If the text is gibberish, not related to food, or impossible to identify, set is_unrecognized_or_low_confidence = true and items = [].

Return STRICTLY a JSON object conforming to the schema.`;

    const ai = getGeminiClient();
    let responseText = "";
    const modelsToTry = [
      "gemini-3.8-flash",
      "gemini-flash-latest",
      "gemini-3.1-flash-lite",
    ];
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: {
              parts: [{ text: prompt }],
            },
            config: {
              systemInstruction:
                "You are an expert clinical nutritionist and metrology AI. Prioritize ACCURACY and INTEGRITY. Follow Strict Nutrition Rules: Unrecognized safeguard (Rule 0: return is_unrecognized_or_low_confidence=true and items=[] for non-food or gibberish), Sanity Checking, Confidence Honesty (cap at 60% max for text entries without image), Fiber & Sugar Alcohols Adjusted Net Carbs, Language-Agnostic parsing (Arabic/English), and Weight verification against standard USDA bounds. Return strictly valid JSON object conforming to schema.",
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
          console.warn(`Text model ${modelName} (attempt ${attempt + 1}) error:`, String(err?.message || err).slice(0, 150));
        }
      }
      if (responseText) break;
    }

    if (!responseText) {
      throw lastError || new Error("Failed to get text analysis from Gemini models.");
    }

    let cleanJson = responseText.trim();
    if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    }

    const rawData = JSON.parse(cleanJson);

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
      res.json({
        unrecognized: true,
        message: "لم نتمكن من التعرف على مكونات الوجبة من الوصف المدخل. يرجى توضيح اسم الطعام أو المكونات بمزيد من التفصيل.",
        reason: rawData.unrecognized_reason || "Unrecognized text description",
      });
      return;
    }

    // Process and verify through the biological Sanity Check Engine
    const items = rawList.map((item: any, idx: number) => {
      const validated: any = validateAndSanityCheckItem(item, idx);
      // Ensure confidence is strictly capped at 60% for text entry
      validated.confidence_score = Math.min(60, Number(validated.confidence_score) || 55);
      validated.is_text_entry = true;
      validated.reference_object_detected = "وصف نصي بدون صورة (Text Entry)";
      if (!validated.portion_description || !validated.portion_description.includes("الوصف النصي")) {
        validated.portion_description = "تقدير تقريبي بناءً على الوصف النصي";
      }
      validated.is_approximate_estimate = true;
      return validated;
    });

    // Cache valid text results
    mealAnalysisCache.set(textHash, items);

    res.json(items);
  } catch (error: any) {
    console.error("Error analyzing text meal:", error);
    const errStr = error?.message || String(error);
    let friendlyMessage = "تعذر تحليل الوصف النصي للوجبة. يرجى المحاولة مرة أخرى.";
    let statusCode = 500;

    if (errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED")) {
      statusCode = 429;
      friendlyMessage = "تم الوصول للحد المؤقت لخدمة الذكاء الاصطناعي. يرجى الانتظار بضع ثوانٍ والمحاولة ثانية.";
    }

    res.status(statusCode).json({
      error: friendlyMessage,
      statusCode,
    });
  }
}
