/**
 * CalorieLens Meal Memory (Recognition Cache) Service
 * Manages persistent storage, lookup, offline caching, and corrections for known meals
 * Collection: users/{userId}/knownMeals/{mealKey}
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  increment,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { DetectedFood, KnownMeal, KnownMealItemsSummary } from "../types";
import {
  normalizeMealTitle,
  buildMealKey,
  hammingDistance,
} from "../utils/mealKey";
import { sanitizeForFirestore } from "./firestoreService";

const LOCAL_STORAGE_PREFIX = "calorielens:knownMeals:";
const MAX_LOCAL_MIRROR_ENTRIES = 200;

function getLocalStorageKey(userId: string): string {
  return `${LOCAL_STORAGE_PREFIX}${userId}`;
}

/**
 * Reads known meals from the local mirror.
 */
export function getKnownMealsLocal(userId: string): KnownMeal[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(getLocalStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (err) {
    console.warn("[MealMemory] Failed to read local mirror:", err);
    return [];
  }
}

/**
 * Saves known meals to the local mirror, capped at MAX_LOCAL_MIRROR_ENTRIES (200).
 */
export function saveKnownMealsLocal(userId: string, meals: KnownMeal[]): void {
  if (!userId) return;
  try {
    // Sort by lastUsedAt desc or useCount desc, capped at 200
    const sorted = [...meals].sort((a, b) => {
      const timeA = typeof a.lastUsedAt === "number" ? a.lastUsedAt : 0;
      const timeB = typeof b.lastUsedAt === "number" ? b.lastUsedAt : 0;
      return (b.useCount || 0) - (a.useCount || 0) || timeB - timeA;
    });

    const capped = sorted.slice(0, MAX_LOCAL_MIRROR_ENTRIES);
    localStorage.setItem(getLocalStorageKey(userId), JSON.stringify(capped));
  } catch (err) {
    console.warn("[MealMemory] Failed to save local mirror:", err);
  }
}

/**
 * Calculates macro and calorie totals for a list of detected food items.
 */
export function calculateItemsSummary(
  items: DetectedFood[]
): KnownMealItemsSummary {
  const calories = Math.round(
    items.reduce((s, it) => s + (Number(it.calories) || 0), 0)
  );
  const protein =
    Math.round(
      items.reduce((s, it) => s + (Number(it.protein_g) || 0), 0) * 10
    ) / 10;
  const carbs =
    Math.round(items.reduce((s, it) => s + (Number(it.carbs_g) || 0), 0) * 10) /
    10;
  const fat =
    Math.round(items.reduce((s, it) => s + (Number(it.fat_g) || 0), 0) * 10) / 10;
  const weight = Math.round(
    items.reduce((s, it) => s + (Number(it.weight_g) || 0), 0)
  );

  return { calories, protein, carbs, fat, weight };
}

/**
 * Reconciles local mirror with Firestore on app load.
 */
export async function reconcileKnownMeals(
  userId: string
): Promise<KnownMeal[]> {
  if (!userId) return [];
  try {
    const knownMealsRef = collection(db, "users", userId, "knownMeals");
    const q = query(
      knownMealsRef,
      orderBy("lastUsedAt", "desc"),
      limit(MAX_LOCAL_MIRROR_ENTRIES)
    );

    const snapshot = await getDocs(q);
    const remoteMeals: KnownMeal[] = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      remoteMeals.push({
        mealKey: docSnap.id,
        title: data.title || "",
        normalizedTitle: data.normalizedTitle || "",
        aliases: Array.isArray(data.aliases) ? data.aliases : [],
        items: Array.isArray(data.items) ? data.items : [],
        itemsSummary: data.itemsSummary || calculateItemsSummary(data.items || []),
        defaultWeightGrams: Number(data.defaultWeightGrams) || 200,
        imageSignature: data.imageSignature || null,
        useCount: Number(data.useCount) || 1,
        lastUsedAt:
          data.lastUsedAt instanceof Timestamp
            ? data.lastUsedAt.toMillis()
            : data.lastUsedAt || Date.now(),
        createdAt:
          data.createdAt instanceof Timestamp
            ? data.createdAt.toMillis()
            : data.createdAt || Date.now(),
        isUserCorrected: Boolean(data.isUserCorrected),
      });
    });

    // Merge with any local entries not yet in remote
    const localMeals = getKnownMealsLocal(userId);
    const mealMap = new Map<string, KnownMeal>();

    // Remote entries take precedence
    remoteMeals.forEach((m) => mealMap.set(m.mealKey, m));
    localMeals.forEach((m) => {
      if (!mealMap.has(m.mealKey)) {
        mealMap.set(m.mealKey, m);
      }
    });

    const merged = Array.from(mealMap.values());
    saveKnownMealsLocal(userId, merged);
    return merged;
  } catch (err) {
    console.warn("[MealMemory] Failed to reconcile with Firestore (using local):", err);
    return getKnownMealsLocal(userId);
  }
}

export const syncKnownMealsForUser = reconcileKnownMeals;

export interface MealLookupResult {
  meal: KnownMeal;
  matchType: "title" | "alias" | "image";
}

/**
 * Core lookup function:
 * 1. Checks local mirror first (fast & offline).
 * 2. Checks exact mealKey match, then aliases array-contains, then imageSignature Hamming distance <= 5.
 * 3. Fallbacks to Firestore query if local mirror has a miss.
 */
export async function lookupKnownMeal(
  userId: string,
  options: {
    title?: string;
    imageSignature?: string | null;
  }
): Promise<MealLookupResult | null> {
  const { title, imageSignature } = options;
  const normTitle = title ? normalizeMealTitle(title) : "";
  const targetMealKey = normTitle ? buildMealKey(normTitle) : "";

  // 1. Check local mirror first
  const localMeals = getKnownMealsLocal(userId);

  if (targetMealKey) {
    // Exact mealKey match
    const exact = localMeals.find((m) => m.mealKey === targetMealKey);
    if (exact) {
      return { meal: exact, matchType: "title" };
    }

    // Normalized title match
    const titleMatch = localMeals.find(
      (m) => m.normalizedTitle === normTitle || normalizeMealTitle(m.title) === normTitle
    );
    if (titleMatch) {
      return { meal: titleMatch, matchType: "title" };
    }

    // Aliases match
    const aliasMatch = localMeals.find((m) =>
      m.aliases?.some((a) => normalizeMealTitle(a) === normTitle)
    );
    if (aliasMatch) {
      return { meal: aliasMatch, matchType: "alias" };
    }
  }

  // Check perceptual imageSignature hash (Hamming distance <= 5)
  if (imageSignature && imageSignature !== "0000000000000000") {
    let closestMeal: KnownMeal | null = null;
    let minDistance = 999;

    for (const m of localMeals) {
      if (m.imageSignature) {
        const dist = hammingDistance(m.imageSignature, imageSignature);
        if (dist <= 5 && dist < minDistance) {
          minDistance = dist;
          closestMeal = m;
        }
      }
    }

    if (closestMeal) {
      console.log(
        `[MealMemory] Image hash hit: "${closestMeal.title}" (distance: ${minDistance})`
      );
      return { meal: closestMeal, matchType: "image" };
    }
  }

  // 2. If not found locally and user is authenticated, query Firestore
  if (userId) {
    try {
      if (targetMealKey) {
        const docRef = doc(db, "users", userId, "knownMeals", targetMealKey);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const remoteMeal: KnownMeal = {
            mealKey: docSnap.id,
            title: data.title || title || "",
            normalizedTitle: data.normalizedTitle || normTitle,
            aliases: Array.isArray(data.aliases) ? data.aliases : [],
            items: Array.isArray(data.items) ? data.items : [],
            itemsSummary: data.itemsSummary || calculateItemsSummary(data.items || []),
            defaultWeightGrams: Number(data.defaultWeightGrams) || 200,
            imageSignature: data.imageSignature || null,
            useCount: Number(data.useCount) || 1,
            lastUsedAt: Date.now(),
            createdAt: data.createdAt?.toMillis?.() || Date.now(),
            isUserCorrected: Boolean(data.isUserCorrected),
          };

          // Cache in local mirror
          saveKnownMealsLocal(userId, [remoteMeal, ...localMeals]);
          return { meal: remoteMeal, matchType: "title" };
        }

        // Check aliases in Firestore
        const qAliases = query(
          collection(db, "users", userId, "knownMeals"),
          where("aliases", "array-contains", normTitle),
          limit(1)
        );
        const aliasSnap = await getDocs(qAliases);
        if (!aliasSnap.empty) {
          const docSnap = aliasSnap.docs[0];
          const data = docSnap.data();
          const remoteMeal: KnownMeal = {
            mealKey: docSnap.id,
            title: data.title || "",
            normalizedTitle: data.normalizedTitle || "",
            aliases: Array.isArray(data.aliases) ? data.aliases : [],
            items: Array.isArray(data.items) ? data.items : [],
            itemsSummary: data.itemsSummary || calculateItemsSummary(data.items || []),
            defaultWeightGrams: Number(data.defaultWeightGrams) || 200,
            imageSignature: data.imageSignature || null,
            useCount: Number(data.useCount) || 1,
            lastUsedAt: Date.now(),
            createdAt: data.createdAt?.toMillis?.() || Date.now(),
            isUserCorrected: Boolean(data.isUserCorrected),
          };

          saveKnownMealsLocal(userId, [remoteMeal, ...localMeals]);
          return { meal: remoteMeal, matchType: "alias" };
        }
      }
    } catch (err) {
      console.warn("[MealMemory] Remote lookup error:", err);
    }
  }

  return null;
}

/**
 * Saves or updates a known meal in Firestore and local mirror.
 * Respects user corrections: if a meal is user-corrected, a fresh AI result cannot overwrite it
 * unless forceOverwrite is explicitly specified.
 */
export async function saveOrUpdateKnownMeal(
  userId: string,
  mealData: {
    title: string;
    items: DetectedFood[];
    defaultWeightGrams?: number;
    imageSignature?: string | null;
    isUserCorrected?: boolean;
    aliasTitle?: string;
    forceOverwrite?: boolean;
  }
): Promise<KnownMeal> {
  const normTitle = normalizeMealTitle(mealData.title);
  const mealKey = buildMealKey(normTitle);
  const itemsSummary = calculateItemsSummary(mealData.items);
  const defaultWeight =
    mealData.defaultWeightGrams ||
    itemsSummary.weight ||
    (mealData.items.length > 0
      ? mealData.items.reduce((s, it) => s + (Number(it.weight_g) || 0), 0)
      : 200);

  const localMeals = getKnownMealsLocal(userId);
  const existing = localMeals.find((m) => m.mealKey === mealKey);

  // Protection: User-corrected entries always win over a fresh AI result
  const shouldPreserveUserCorrection =
    existing?.isUserCorrected && !mealData.isUserCorrected && !mealData.forceOverwrite;

  const nowMs = Date.now();
  const currentUseCount = (existing?.useCount || 0) + 1;

  // Build combined aliases list
  const aliasesSet = new Set<string>(existing?.aliases || []);
  if (mealData.aliasTitle) {
    const normAlias = normalizeMealTitle(mealData.aliasTitle);
    if (normAlias && normAlias !== normTitle) {
      aliasesSet.add(mealData.aliasTitle);
    }
  }

  const updatedKnownMeal: KnownMeal = {
    mealKey,
    title: existing?.title || mealData.title,
    normalizedTitle: normTitle,
    aliases: Array.from(aliasesSet),
    items: shouldPreserveUserCorrection ? existing.items : mealData.items,
    itemsSummary: shouldPreserveUserCorrection
      ? existing.itemsSummary
      : itemsSummary,
    defaultWeightGrams: shouldPreserveUserCorrection
      ? existing.defaultWeightGrams
      : defaultWeight,
    imageSignature: mealData.imageSignature || existing?.imageSignature || null,
    useCount: currentUseCount,
    lastUsedAt: nowMs,
    createdAt: existing?.createdAt || nowMs,
    isUserCorrected: Boolean(
      mealData.isUserCorrected || existing?.isUserCorrected
    ),
  };

  // 1. Update local mirror immediately
  const filtered = localMeals.filter((m) => m.mealKey !== mealKey);
  saveKnownMealsLocal(userId, [updatedKnownMeal, ...filtered]);

  // 2. Persist to Firestore if userId is present
  if (userId) {
    try {
      const docRef = doc(db, "users", userId, "knownMeals", mealKey);
      const payload = sanitizeForFirestore({
        ...updatedKnownMeal,
        lastUsedAt: serverTimestamp(),
        createdAt: existing?.createdAt
          ? Timestamp.fromMillis(Number(existing.createdAt) || nowMs)
          : serverTimestamp(),
      });

      await setDoc(docRef, payload, { merge: true });
      console.log(`[MealMemory] Successfully cached "${updatedKnownMeal.title}" in Firestore (${mealKey})`);
    } catch (err) {
      console.error("[MealMemory] Failed to write knownMeal to Firestore:", err);
      // Re-throw so caller knows if Firestore failed, but local is updated
    }
  }

  return updatedKnownMeal;
}

/**
 * Upserts a user-corrected meal into knownMeals.
 * Marks isUserCorrected: true so this version always wins over fresh AI predictions.
 */
export async function upsertKnownMealCorrection(
  userId: string,
  title: string,
  items: DetectedFood[],
  totals?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    weight?: number;
  }
): Promise<void> {
  if (!userId || !title) return;

  const defaultWeight =
    totals?.weight ||
    items.reduce((s, it) => s + (Number(it.weight_g) || 0), 0) ||
    200;

  try {
    await saveOrUpdateKnownMeal(userId, {
      title,
      items,
      defaultWeightGrams: defaultWeight,
      isUserCorrected: true,
      forceOverwrite: true,
    });
    console.log(`[MealMemory] Saved user correction for "${title}" with isUserCorrected: true`);
  } catch (err) {
    console.error("[MealMemory] Failed to save correction to knownMeals:", err);
  }
}

/**
 * Increments useCount and updates lastUsedAt for an existing known meal.
 */
export async function recordKnownMealUsage(
  userId: string,
  mealKey: string
): Promise<void> {
  if (!userId || !mealKey) return;

  // Local update
  const localMeals = getKnownMealsLocal(userId);
  const foundIdx = localMeals.findIndex((m) => m.mealKey === mealKey);
  if (foundIdx !== -1) {
    localMeals[foundIdx].useCount = (localMeals[foundIdx].useCount || 0) + 1;
    localMeals[foundIdx].lastUsedAt = Date.now();
    saveKnownMealsLocal(userId, localMeals);
  }

  // Firestore update
  try {
    const docRef = doc(db, "users", userId, "knownMeals", mealKey);
    await setDoc(
      docRef,
      {
        useCount: increment(1),
        lastUsedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn("[MealMemory] Failed to increment knownMeal usage in Firestore:", err);
  }
}

/**
 * Deletes a meal from knownMeals (both Firestore and local mirror).
 */
export async function deleteKnownMeal(
  userId: string,
  mealKey: string
): Promise<void> {
  if (!userId || !mealKey) return;

  // 1. Remove from local mirror
  const localMeals = getKnownMealsLocal(userId);
  const remaining = localMeals.filter((m) => m.mealKey !== mealKey);
  saveKnownMealsLocal(userId, remaining);

  // 2. Remove from Firestore
  try {
    const docRef = doc(db, "users", userId, "knownMeals", mealKey);
    await deleteDoc(docRef);
    console.log(`[MealMemory] Deleted known meal: ${mealKey}`);
  } catch (err) {
    console.error("[MealMemory] Failed to delete known meal from Firestore:", err);
    throw err;
  }
}

/**
 * Returns top frequent meals for the Quick-add UI:
 * Ordered by useCount desc, then lastUsedAt desc.
 */
export function getTopFrequentMeals(
  userId: string,
  limitCount = 8
): KnownMeal[] {
  const localMeals = getKnownMealsLocal(userId);

  return [...localMeals]
    .sort((a, b) => {
      const countDiff = (b.useCount || 0) - (a.useCount || 0);
      if (countDiff !== 0) return countDiff;
      const timeA = typeof a.lastUsedAt === "number" ? a.lastUsedAt : 0;
      const timeB = typeof b.lastUsedAt === "number" ? b.lastUsedAt : 0;
      return timeB - timeA;
    })
    .slice(0, limitCount);
}
