/**
 * CalorieLens Shared Public Cache Service
 * Collection: recognized_foods_cache/{mealKey}
 * 
 * Rules:
 * - Public read for all users
 * - Authenticated write for signed-in users
 * - Completely anonymous (no userId, no personal weight overrides)
 * - Anti-drift 15% divergence filter
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  limit,
  orderBy,
  serverTimestamp,
  increment,
  Timestamp,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { DetectedFood, KnownMealItemsSummary, SharedRecognizedFood } from "../types";
import {
  normalizeMealTitle,
  buildMealKey,
  hammingDistance,
} from "../utils/mealKey";
import { calculateItemsSummary } from "./knownMealsService";
import { sanitizeForFirestore } from "./firestoreService";

const COLLECTION_NAME = "recognized_foods_cache";

/**
 * Checks if a new AI result diverges by more than 15% from existing cached macros.
 * Compares energy (calories) and macro densities scaled to the same baseline.
 */
export function isWithinDivergenceThreshold(
  cachedSummary: KnownMealItemsSummary,
  newSummary: KnownMealItemsSummary,
  thresholdPct = 0.15
): { isWithin: boolean; maxDivergence: number; reason?: string } {
  const cachedWeight = Math.max(1, cachedSummary.weight || 100);
  const newWeight = Math.max(1, newSummary.weight || 100);

  // Normalize both to per-100g basis for fair comparison across portion sizes
  const cachedCalPer100 = (cachedSummary.calories / cachedWeight) * 100;
  const newCalPer100 = (newSummary.calories / newWeight) * 100;

  const cachedPPer100 = (cachedSummary.protein / cachedWeight) * 100;
  const newPPer100 = (newSummary.protein / newWeight) * 100;

  const cachedCPer100 = (cachedSummary.carbs / cachedWeight) * 100;
  const newCPer100 = (newSummary.carbs / newWeight) * 100;

  const cachedFPer100 = (cachedSummary.fat / cachedWeight) * 100;
  const newFPer100 = (newSummary.fat / newWeight) * 100;

  // Calorie difference relative to cached
  const calDiff = Math.abs(newCalPer100 - cachedCalPer100) / Math.max(20, cachedCalPer100);

  // Macro differences relative to cached (with floor to avoid division by near-zero)
  const pDiff = Math.abs(newPPer100 - cachedPPer100) / Math.max(3, cachedPPer100);
  const cDiff = Math.abs(newCPer100 - cachedCPer100) / Math.max(3, cachedCPer100);
  const fDiff = Math.abs(newFPer100 - cachedFPer100) / Math.max(3, cachedFPer100);

  const maxDivergence = Math.max(calDiff, pDiff, cDiff, fDiff);
  const isWithin = maxDivergence <= thresholdPct;

  return {
    isWithin,
    maxDivergence: Math.round(maxDivergence * 1000) / 10,
    reason: isWithin
      ? undefined
      : `Divergence ${(maxDivergence * 100).toFixed(1)}% exceeds threshold ${(thresholdPct * 100).toFixed(0)}% (Cal: ${(calDiff * 100).toFixed(1)}%, P: ${(pDiff * 100).toFixed(1)}%, C: ${(cDiff * 100).toFixed(1)}%, F: ${(fDiff * 100).toFixed(1)}%)`,
  };
}

/**
 * Sanitizes detected food items for public shared storage.
 * Strips any user identifiers, correction markers, or personalized metadata.
 */
function sanitizeItemsForPublicCache(items: DetectedFood[]): DetectedFood[] {
  return items.map((item, idx) => ({
    id: `shared-item-${idx}`,
    item_name: String(item.item_name || "").slice(0, 150),
    weight_g: Math.max(1, Math.round(Number(item.weight_g) || 100)),
    calories: Math.max(0, Math.round(Number(item.calories) || 0)),
    protein_g: Math.round((Number(item.protein_g) || 0) * 10) / 10,
    carbs_g: Math.round((Number(item.carbs_g) || 0) * 10) / 10,
    fat_g: Math.round((Number(item.fat_g) || 0) * 10) / 10,
    confidence_score: Math.max(10, Math.min(100, Math.round(Number(item.confidence_score) || 85))),
    food_category: item.food_category || "mixed",
    reference_object_detected: item.reference_object_detected || undefined,
    usda_matched_name: item.usda_matched_name || undefined,
    usda_source: item.usda_source || undefined,
    per_100g: item.per_100g
      ? {
          calories: Math.round(Number(item.per_100g.calories) || 0),
          protein_g: Math.round((Number(item.per_100g.protein_g) || 0) * 10) / 10,
          carbs_g: Math.round((Number(item.per_100g.carbs_g) || 0) * 10) / 10,
          fat_g: Math.round((Number(item.per_100g.fat_g) || 0) * 10) / 10,
        }
      : undefined,
  }));
}

/**
 * Look up a meal in the public shared cache `recognized_foods_cache`.
 * 1. Checks exact mealKey from normalized title.
 * 2. Checks image hash perceptual match (Hamming distance <= 5).
 */
export async function lookupSharedMeal(options: {
  title?: string;
  imageSignature?: string | null;
}): Promise<SharedRecognizedFood | null> {
  const { title, imageSignature } = options;
  const normTitle = title ? normalizeMealTitle(title) : "";
  const targetMealKey = normTitle ? buildMealKey(normTitle) : "";

  // 1. Direct document lookup by deterministic mealKey
  if (targetMealKey) {
    try {
      const docRef = doc(db, COLLECTION_NAME, targetMealKey);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const items = Array.isArray(data.items) ? data.items : [];
        const itemsSummary = data.itemsSummary || calculateItemsSummary(items);
        const sourceCount = Number(data.sourceCount) || 1;

        console.log(`[SharedCache] Hit by mealKey "${targetMealKey}" (sources: ${sourceCount}, confidence: ${data.confidence || "ai_single"})`);

        return {
          mealKey: docSnap.id,
          normalizedTitle: data.normalizedTitle || normTitle,
          title: data.title || title || "وجبة من المجتمع",
          items,
          itemsSummary,
          defaultWeightGrams: Number(data.defaultWeightGrams) || itemsSummary.weight || 200,
          imageSignature: data.imageSignature || null,
          sourceCount,
          confidence: data.confidence || (sourceCount >= 3 ? "ai_multi_agreement" : "ai_single"),
          lastUpdatedAt: data.lastUpdatedAt instanceof Timestamp ? data.lastUpdatedAt.toMillis() : Date.now(),
        };
      }
    } catch (err) {
      console.warn("[SharedCache] Lookup by key error:", err);
    }
  }

  // 2. Lookup by perceptual image hash (Hamming distance <= 5)
  if (imageSignature && imageSignature !== "0000000000000000") {
    try {
      // Query recent/top entries to match perceptual image signature
      const q = query(
        collection(db, COLLECTION_NAME),
        orderBy("lastUpdatedAt", "desc"),
        limit(50)
      );
      const querySnap = await getDocs(q);

      let closestMatch: SharedRecognizedFood | null = null;
      let minDistance = 999;

      querySnap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.imageSignature && typeof data.imageSignature === "string") {
          const dist = hammingDistance(data.imageSignature, imageSignature);
          if (dist <= 5 && dist < minDistance) {
            minDistance = dist;
            const items = Array.isArray(data.items) ? data.items : [];
            const itemsSummary = data.itemsSummary || calculateItemsSummary(items);
            const sourceCount = Number(data.sourceCount) || 1;

            closestMatch = {
              mealKey: docSnap.id,
              normalizedTitle: data.normalizedTitle || "",
              title: data.title || "وجبة من المجتمع",
              items,
              itemsSummary,
              defaultWeightGrams: Number(data.defaultWeightGrams) || itemsSummary.weight || 200,
              imageSignature: data.imageSignature,
              sourceCount,
              confidence: data.confidence || (sourceCount >= 3 ? "ai_multi_agreement" : "ai_single"),
              lastUpdatedAt: data.lastUpdatedAt instanceof Timestamp ? data.lastUpdatedAt.toMillis() : Date.now(),
            };
          }
        }
      });

      if (closestMatch) {
        console.log(`[SharedCache] Hit by image hash: "${(closestMatch as SharedRecognizedFood).title}" (distance: ${minDistance})`);
        return closestMatch;
      }
    } catch (err) {
      console.warn("[SharedCache] Lookup by image hash error:", err);
    }
  }

  return null;
}

/**
 * Contributes a fresh uncorrected AI analysis to the public `recognized_foods_cache`.
 * 
 * Rules:
 * - Only signed-in users can write (per Firestore security rules).
 * - Never called for user manual corrections (only raw AI predictions).
 * - If document is new: creates with sourceCount: 1, confidence: "ai_single".
 * - If document exists:
 *     - If new result is within 15% macro threshold: increments sourceCount, keeps existing cached values, upgrades to "ai_multi_agreement" when count >= 3.
 *     - If divergence > 15%: ignores new result and logs warning to prevent pollution.
 * - Non-blocking: failures are logged and swallowed without interrupting user flow.
 */
export async function contributeToSharedCache(mealData: {
  title: string;
  items: DetectedFood[];
  defaultWeightGrams?: number;
  imageSignature?: string | null;
}): Promise<void> {
  // Only authenticated users can write per firestore.rules
  if (!auth.currentUser) {
    console.log("[SharedCache] Skipping contribute: user not authenticated");
    return;
  }

  if (!mealData.title || !mealData.items || mealData.items.length === 0) {
    return;
  }

  const normTitle = normalizeMealTitle(mealData.title);
  if (!normTitle) return;

  const mealKey = buildMealKey(normTitle);
  const cleanItems = sanitizeItemsForPublicCache(mealData.items);
  const newSummary = calculateItemsSummary(cleanItems);
  const defaultWeight =
    mealData.defaultWeightGrams ||
    newSummary.weight ||
    200;

  try {
    const docRef = doc(db, COLLECTION_NAME, mealKey);
    const existingSnap = await getDoc(docRef);

    if (!existingSnap.exists()) {
      // Document does not exist yet: create new entry
      const payload = sanitizeForFirestore({
        normalizedTitle: normTitle,
        title: mealData.title,
        items: cleanItems,
        itemsSummary: newSummary,
        defaultWeightGrams: defaultWeight,
        imageSignature: mealData.imageSignature || null,
        sourceCount: 1,
        confidence: "ai_single",
        lastUpdatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });

      await setDoc(docRef, payload);
      console.log(`[SharedCache] Created new shared entry for "${mealData.title}" (${mealKey}) with sourceCount: 1`);
    } else {
      // Document exists: verify against 15% divergence threshold
      const existingData = existingSnap.data();
      const existingSummary: KnownMealItemsSummary =
        existingData.itemsSummary || calculateItemsSummary(existingData.items || []);
      const existingSourceCount = Number(existingData.sourceCount) || 1;

      const divergenceCheck = isWithinDivergenceThreshold(existingSummary, newSummary, 0.15);

      if (!divergenceCheck.isWithin) {
        console.info(
          `[SharedCache] Divergent result ignored for "${mealData.title}": ${divergenceCheck.reason}`
        );
        return;
      }

      // Result agrees within 15%: increment sourceCount and upgrade confidence if threshold reached
      const nextCount = existingSourceCount + 1;
      const nextConfidence = nextCount >= 3 ? "ai_multi_agreement" : "ai_single";

      // Preserve existing cached items and values to prevent single-run drift
      await setDoc(
        docRef,
        {
          sourceCount: increment(1),
          confidence: nextConfidence,
          lastUpdatedAt: serverTimestamp(),
          // Merge imageSignature if existing lacked one
          ...(existingData.imageSignature ? {} : { imageSignature: mealData.imageSignature || null }),
        },
        { merge: true }
      );

      console.log(
        `[SharedCache] Reinforced agreement for "${mealData.title}" (${mealKey}): sourceCount -> ${nextCount}, confidence -> ${nextConfidence}`
      );
    }
  } catch (err) {
    // Non-critical background write: swallow error to not disrupt user experience
    console.warn("[SharedCache] Failed to contribute to public cache (non-critical):", err);
  }
}
