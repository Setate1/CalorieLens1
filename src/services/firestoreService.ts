import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  doc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot,
  Timestamp,
  FieldValue,
} from "firebase/firestore";
import { db, auth, handleFirestoreError, OperationType } from "../firebase";
import { NutritionLogRecord, FoodAnalysisResponse, DetectedFood, LoggedMeal, MealType } from "../types";
import { getTodayDateString, getLocalDateBoundaries } from "../utils/dailyStorage";

const COLLECTION_NAME = "nutrition_logs";

/**
 * Normalizes FoodAnalysisResponse into aggregated values for Firestore nutrition_logs
 */
export function extractLogDataFromAnalysis(
  uid: string,
  analysis: FoodAnalysisResponse,
  previewUrl?: string,
  mealType?: MealType
): Omit<NutritionLogRecord, "id"> {
  let items: DetectedFood[] = [];
  let overallConfidence = 90;

  if (Array.isArray(analysis)) {
    items = analysis;
  } else if (analysis && !("unrecognized" in analysis && analysis.unrecognized) && "items" in analysis && Array.isArray(analysis.items)) {
    items = analysis.items;
    overallConfidence = (analysis as any).meta?.overall_confidence ?? 90;
  }

  const foodNames = items.map((i) => i.item_name).filter(Boolean);
  const foodName =
    foodNames.length > 0
      ? foodNames.join(" + ")
      : "وجبة محللة (Food Analysis)";

  const calories = Math.round(
    items.reduce((sum, item) => sum + (Number(item.calories) || 0), 0)
  );
  const protein = Math.round(
    items.reduce((sum, item) => sum + (Number(item.protein_g ?? (item as any).protein) || 0), 0) * 10
  ) / 10;
  const carbs = Math.round(
    items.reduce((sum, item) => sum + (Number(item.carbs_g ?? (item as any).carbs) || 0), 0) * 10
  ) / 10;
  const fat = Math.round(
    items.reduce((sum, item) => sum + (Number(item.fat_g ?? (item as any).fat) || 0), 0) * 10
  ) / 10;
  const weight = Math.round(
    items.reduce((sum, item) => sum + (Number(item.weight_g) || 0), 0)
  );

  const hasManualCorrection = items.some((i) => i.is_manually_corrected);
  const hasFullyManualCorrection = items.some((i) => i.is_fully_manually_corrected);
  const isTextEntry = items.some((i) => i.is_text_entry);
  const originalWeightSum = items.reduce(
    (sum, item) => sum + (Number(item.original_estimated_weight_g) || Number(item.weight_g) || 0),
    0
  );

  const avgConfidence =
    items.length > 0
      ? Math.round(
          items.reduce((sum, item) => sum + (Number(item.confidence_score) || overallConfidence), 0) /
            items.length
        )
      : overallConfidence;

  return {
    uid,
    foodName,
    calories,
    protein,
    carbs,
    fat,
    weight,
    confidence: avgConfidence,
    createdAt: serverTimestamp(),
    date: getTodayDateString(),
    mealType: mealType || undefined,
    is_manually_corrected: hasManualCorrection,
    is_fully_manually_corrected: hasFullyManualCorrection,
    is_text_entry: isTextEntry,
    original_weight: hasManualCorrection ? originalWeightSum : undefined,
    itemsSummary: items
      .map((i) => `${i.item_name} (${Math.round(i.calories)} kcal)`)
      .join(", "),
    items,
    imageUrl: previewUrl,
  };
}

/**
 * Deeply sanitizes an object or array for Firestore storage by:
 * 1. Removing any keys whose values are `undefined`
 * 2. Converting null/empty string appropriately
 * 3. Preserving Date, Timestamp, and FieldValue (e.g. serverTimestamp) instances
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === undefined) {
    return null as any;
  }
  if (data === null || typeof data !== "object") {
    return data;
  }
  if (
    data instanceof Timestamp ||
    data instanceof Date ||
    data instanceof FieldValue ||
    (typeof (data as any)?._methodName === "string")
  ) {
    return data;
  }
  if (Array.isArray(data)) {
    return data
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item)) as any;
  }
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data as Record<string, any>)) {
    if (value !== undefined) {
      result[key] = sanitizeForFirestore(value);
    }
  }
  return result as any;
}

/**
 * Helper to prevent any Firestore promise from hanging indefinitely behind network proxies
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 8000,
  timeoutMessage = "انتهت مهلة الاتصال بقاعدة البيانات السحابية. يرجى التحقق من اتصال الإنترنت."
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, timeoutMs);
    }),
  ]);
}

/**
 * Saves a new nutrition log to Firestore 'nutrition_logs' collection
 */
export async function saveNutritionLogToFirestore(
  logData: {
    uid: string;
    foodName: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    weight: number;
    confidence: number;
    createdAt?: any;
    date?: string;
    mealType?: MealType;
    itemsSummary?: string;
    imageUrl?: string;
    is_manually_corrected?: boolean;
    is_fully_manually_corrected?: boolean;
    is_text_entry?: boolean;
    original_weight?: number;
    items?: DetectedFood[];
  }
): Promise<string> {
  if (!logData.uid) {
    throw new Error("Cannot save nutrition log without valid user ID (uid)");
  }

  try {
    const todayDateStr = getTodayDateString();
    const logDate = logData.date || todayDateStr;

    // Resolve createdAt:
    // 1. If explicit Timestamp or Date or number passed, convert/use it
    // 2. If for a different date, place it at noon local time on that date
    // 3. Otherwise for today, use Timestamp.now() for immediate local alignment
    let resolvedCreatedAt: any;
    if (logData.createdAt) {
      if (logData.createdAt instanceof Timestamp) {
        resolvedCreatedAt = logData.createdAt;
      } else if (logData.createdAt instanceof Date) {
        resolvedCreatedAt = Timestamp.fromDate(logData.createdAt);
      } else if (typeof logData.createdAt === "number" && !isNaN(logData.createdAt)) {
        resolvedCreatedAt = Timestamp.fromMillis(logData.createdAt);
      } else {
        resolvedCreatedAt = logData.createdAt;
      }
    } else if (logDate !== todayDateStr) {
      const [y, m, d] = logDate.split("-").map(Number);
      resolvedCreatedAt = Timestamp.fromDate(new Date(y, m - 1, d, 12, 0, 0));
    } else {
      resolvedCreatedAt = Timestamp.now();
    }

    // Keep Firestore document payload light: if imageUrl is a huge raw base64 data URL (>35KB),
    // do not send 500KB through the Firestore WebChannel. Local storage retains the full preview.
    let sanitizedImageUrl: string | undefined = undefined;
    if (logData.imageUrl) {
      if (logData.imageUrl.startsWith("data:") && logData.imageUrl.length > 35000) {
        // Omitting oversized base64 to keep Firestore document feather-light (<10KB)
        sanitizedImageUrl = undefined;
      } else {
        sanitizedImageUrl = String(logData.imageUrl);
      }
    }

    const payload: any = {
      uid: logData.uid,
      foodName: String(logData.foodName || "وجبة محللة").slice(0, 500),
      calories: Math.max(0, Math.round(Number(logData.calories) || 0)),
      protein: Math.max(0, Math.round((Number(logData.protein ?? (logData as any).protein_g) || 0) * 10) / 10),
      carbs: Math.max(0, Math.round((Number(logData.carbs ?? (logData as any).carbs_g) || 0) * 10) / 10),
      fat: Math.max(0, Math.round((Number(logData.fat ?? (logData as any).fat_g) || 0) * 10) / 10),
      weight: Math.max(0, Math.round(Number(logData.weight) || 0)),
      confidence: Math.max(0, Math.min(100, Math.round(Number(logData.confidence) || 85))),
      createdAt: resolvedCreatedAt,
      date: logDate,
      ...(logData.mealType ? { mealType: logData.mealType } : {}),
      is_manually_corrected: Boolean(logData.is_manually_corrected),
      is_fully_manually_corrected: Boolean(logData.is_fully_manually_corrected),
      is_text_entry: Boolean(logData.is_text_entry),
      ...(logData.original_weight ? { original_weight: Number(logData.original_weight) } : {}),
      ...(logData.itemsSummary ? { itemsSummary: String(logData.itemsSummary).slice(0, 1000) } : {}),
      ...(sanitizedImageUrl ? { imageUrl: sanitizedImageUrl } : {}),
      ...(Array.isArray(logData.items) ? { items: logData.items } : {}),
    };

    const sanitizedPayload = sanitizeForFirestore(payload);
    
    // Allocate Document Reference upfront for deterministic local-first caching and instant ID assignment
    const docRef = doc(collection(db, COLLECTION_NAME));
    const docId = docRef.id;

    // Perform optimistic local-first write: setDoc writes to Firestore's local cache immediately,
    // firing onSnapshot listeners and queuing the cloud mutation for synchronization.
    try {
      const writePromise = setDoc(docRef, sanitizedPayload);
      const raceResult = await Promise.race([
        writePromise.then(() => "synced"),
        new Promise<string>((resolve) => setTimeout(() => resolve("queued"), 3500)),
      ]);

      if (raceResult === "synced") {
        console.log(`[Firestore] Successfully created and synced document ${docId} for "${logData.foodName}" (date: ${logDate}, mealType: ${logData.mealType || 'auto'})`);
      } else {
        console.log(`[Firestore] Document ${docId} committed to local offline cache; background cloud sync in progress.`);
      }
      return docId;
    } catch (writeErr: any) {
      const msg = writeErr?.message || String(writeErr);
      if (
        writeErr?.code === "permission-denied" ||
        msg.includes("permission-denied") ||
        msg.includes("PERMISSION_DENIED") ||
        msg.includes("Missing or insufficient permissions")
      ) {
        handleFirestoreError(writeErr, OperationType.CREATE, COLLECTION_NAME);
      }
      // If backend connection is temporarily unavailable or client in offline mode,
      // the mutation remains queued in Firestore's offline cache
      if (writeErr?.code === "unavailable" || msg.includes("unavailable") || msg.includes("offline")) {
        console.warn(`[Firestore] Backend connection unavailable; document ${docId} queued in offline cache.`);
        return docId;
      }
      handleFirestoreError(writeErr, OperationType.CREATE, COLLECTION_NAME);
    }
  } catch (error) {
    console.error("[Firestore] saveNutritionLogToFirestore error:", error);
    handleFirestoreError(error, OperationType.CREATE, COLLECTION_NAME);
  }
}

/**
 * Updates an existing nutrition log record in Firestore
 */
export async function updateNutritionLogInFirestore(
  docId: string,
  updateData: Partial<NutritionLogRecord>
): Promise<void> {
  if (!docId || typeof docId !== "string" || docId.trim().length === 0) {
    console.error("[Firestore] updateNutritionLogInFirestore called with invalid docId:", docId);
    throw new Error("Missing or invalid document ID for Firestore update");
  }

  try {
    const docRef = doc(db, COLLECTION_NAME, docId);
    const sanitizedUpdate = sanitizeForFirestore(updateData);
    console.log(`[Firestore] Updating document: ${docId}`, sanitizedUpdate);

    const updatePromise = updateDoc(docRef, sanitizedUpdate);
    const raceResult = await Promise.race([
      updatePromise.then(() => "synced"),
      new Promise<string>((resolve) => setTimeout(() => resolve("queued"), 3500)),
    ]);

    if (raceResult === "synced") {
      console.log(`[Firestore] Successfully updated and synced document: ${docId}`);
    } else {
      console.log(`[Firestore] Update for document ${docId} committed to local offline cache; background sync in progress.`);
    }
  } catch (error: any) {
    const msg = error?.message || String(error);
    if (
      error?.code === "permission-denied" ||
      msg.includes("permission-denied") ||
      msg.includes("PERMISSION_DENIED") ||
      msg.includes("Missing or insufficient permissions")
    ) {
      handleFirestoreError(error, OperationType.UPDATE, `${COLLECTION_NAME}/${docId}`);
    }
    if (error?.code === "unavailable" || msg.includes("unavailable") || msg.includes("offline")) {
      console.warn(`[Firestore] Backend connection unavailable; update for ${docId} queued in offline cache.`);
      return;
    }
    console.error(`[Firestore] Failed to update document ${docId}:`, error);
    handleFirestoreError(error, OperationType.UPDATE, `${COLLECTION_NAME}/${docId}`);
  }
}

/**
 * Synchronizes meal component edits with Firestore nutrition_logs
 */
export async function syncMealComponentUpdate(
  meal: LoggedMeal,
  updatedItems: DetectedFood[],
  totals: { calories: number; protein: number; carbs: number; fat: number; weight: number }
): Promise<string> {
  const itemsSummary = updatedItems
    .map((i) => `${i.item_name} (${Math.round(i.calories)} kcal)`)
    .join(", ");

  const updatePayload: Partial<NutritionLogRecord> = {
    calories: Math.round(totals.calories),
    protein: Math.round(totals.protein * 10) / 10,
    carbs: Math.round(totals.carbs * 10) / 10,
    fat: Math.round(totals.fat * 10) / 10,
    weight: Math.round(totals.weight),
    is_manually_corrected: true,
    items: updatedItems,
    itemsSummary,
  };

  // 1. Check direct docId resolution from firestoreDocId or meal.id if it's a valid Firestore document ID
  const directDocId =
    meal.firestoreDocId ||
    (meal.id && !meal.id.startsWith("meal-") && !meal.id.startsWith("f-") ? meal.id : null);

  if (directDocId) {
    console.log(`[Firestore] syncMealComponentUpdate using direct docId: ${directDocId}`);
    await updateNutritionLogInFirestore(directDocId, updatePayload);
    return directDocId;
  }

  // 2. If no direct docId attached, try to find an existing document for current auth user
  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      console.log(`[Firestore] Searching matching document for meal "${meal.title}" (user: ${currentUser.uid})`);
      const q = query(
        collection(db, COLLECTION_NAME),
        where("uid", "==", currentUser.uid)
      );
      const snapshot = await getDocs(q);
      let matchedDocId: string | null = null;
      
      snapshot.forEach((docSnap) => {
        if (matchedDocId) return;
        const data = docSnap.data();
        if (meal.imageUrl && data.imageUrl && data.imageUrl === meal.imageUrl) {
          matchedDocId = docSnap.id;
        } else if (data.foodName && (data.foodName === meal.title || meal.title.includes(data.foodName) || data.foodName.includes(meal.title))) {
          matchedDocId = docSnap.id;
        }
      });

      if (matchedDocId) {
        console.log(`[Firestore] Found matching document ${matchedDocId} for meal "${meal.title}". Updating now...`);
        await updateNutritionLogInFirestore(matchedDocId, updatePayload);
        return matchedDocId;
      }

      // If still not matched, create the document so the user's edits are permanently persisted in Firestore!
      console.log(`[Firestore] No existing document found for meal "${meal.title}". Creating new record...`);
      const newDocId = await saveNutritionLogToFirestore({
        uid: currentUser.uid,
        foodName: meal.title,
        calories: totals.calories,
        protein: totals.protein,
        carbs: totals.carbs,
        fat: totals.fat,
        weight: totals.weight,
        confidence: 90,
        mealType: meal.mealType,
        imageUrl: meal.imageUrl,
        date: meal.date || getTodayDateString(),
        is_manually_corrected: true,
        items: updatedItems,
        itemsSummary,
      });
      return newDocId;
    } catch (err) {
      console.error("[Firestore] Could not sync meal component update to Firestore:", err);
      throw err;
    }
  }

  throw new Error("User is not signed in to sync meal component update to Firestore");
}

const inFlightSyncIds = new Set<string>();

/**
 * Background synchronization function to ensure any local meals saved offline or via fallback
 * are reliably uploaded to Firestore and receive valid cloud document IDs.
 */
export async function syncPendingLocalMealsToFirestore(uid: string): Promise<number> {
  if (!uid || typeof window === "undefined") return 0;

  try {
    const rawMeals = localStorage.getItem("calorielens_logged_meals");
    if (!rawMeals) return 0;
    const meals: LoggedMeal[] = JSON.parse(rawMeals);
    if (!Array.isArray(meals) || meals.length === 0) return 0;

    let syncedCount = 0;
    const updatedMeals = [...meals];
    let hasChanges = false;

    for (let i = 0; i < updatedMeals.length; i++) {
      const meal = updatedMeals[i];
      // A meal is pending sync if it has no firestoreDocId or its id starts with "meal-"
      const isPending = !meal.firestoreDocId || (typeof meal.id === "string" && meal.id.startsWith("meal-"));
      if (!isPending) continue;

      const syncKey = meal.id || `pending-${meal.timestamp}-${meal.title}`;
      if (inFlightSyncIds.has(syncKey)) continue;

      inFlightSyncIds.add(syncKey);
      try {
        const foodName = meal.title || "وجبة صحية";
        const mealDate = meal.date || getTodayDateString();
        const mealTimestamp = typeof meal.timestamp === "number" ? Timestamp.fromMillis(meal.timestamp) : Timestamp.now();

        const docId = await saveNutritionLogToFirestore({
          uid,
          foodName,
          calories: Math.round(Number(meal.calories) || 0),
          protein: Math.round((Number(meal.protein_g) || 0) * 10) / 10,
          carbs: Math.round((Number(meal.carbs_g) || 0) * 10) / 10,
          fat: Math.round((Number(meal.fat_g) || 0) * 10) / 10,
          weight: Math.round(Number(meal.original_weight) || 200),
          confidence: 90,
          mealType: meal.mealType,
          date: mealDate,
          createdAt: mealTimestamp,
          imageUrl: meal.imageUrl,
          is_manually_corrected: Boolean(meal.is_manually_corrected || meal.wasEdited),
          is_fully_manually_corrected: Boolean(meal.is_fully_manually_corrected),
          is_text_entry: Boolean(meal.is_text_entry),
          original_weight: meal.original_weight,
          items: meal.items,
          itemsSummary: Array.isArray(meal.items) && meal.items.length > 0
            ? meal.items.map((it) => `${it.item_name} (${Math.round(it.calories)} kcal)`).join(", ")
            : foodName,
        });

        if (docId) {
          updatedMeals[i] = {
            ...meal,
            id: docId,
            firestoreDocId: docId,
          };
          hasChanges = true;
          syncedCount++;
          console.log(`[Firestore] Synced pending local meal "${foodName}" -> Firestore ID: ${docId}`);
        }
      } catch (err) {
        console.warn(`[Firestore] Could not sync local meal "${meal.title}":`, err);
      } finally {
        inFlightSyncIds.delete(syncKey);
      }
    }

    if (hasChanges) {
      localStorage.setItem("calorielens_logged_meals", JSON.stringify(updatedMeals));
      window.dispatchEvent(new Event("calorielens_meals_updated"));
    }

    return syncedCount;
  } catch (err) {
    console.warn("[Firestore] syncPendingLocalMealsToFirestore error:", err);
    return 0;
  }
}

/**
 * Fetches user nutrition logs ordered by most recent first, with bounded page size to prevent over-fetching
 */
export async function fetchUserNutritionLogs(uid: string, maxLimit = 500): Promise<NutritionLogRecord[]> {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where("uid", "==", uid),
      limit(maxLimit)
    );

    const querySnapshot = await getDocs(q);
    const logs: NutritionLogRecord[] = [];

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      logs.push({
        id: docSnap.id,
        uid: data.uid,
        foodName: data.foodName || "وجبة بدون اسم",
        calories: Number(data.calories) || 0,
        protein: Number(data.protein) || 0,
        carbs: Number(data.carbs) || 0,
        fat: Number(data.fat) || 0,
        weight: Number(data.weight) || 0,
        confidence: Number(data.confidence) || 0,
        createdAt: data.createdAt,
        date: data.date || undefined,
        mealType: data.mealType || undefined,
        itemsSummary: data.itemsSummary,
        imageUrl: data.imageUrl,
        is_manually_corrected: Boolean(data.is_manually_corrected),
        is_fully_manually_corrected: Boolean(data.is_fully_manually_corrected),
        is_text_entry: Boolean(data.is_text_entry),
        original_weight: data.original_weight ? Number(data.original_weight) : undefined,
        items: Array.isArray(data.items) ? data.items : undefined,
      });
    });

    // Client-side sort by createdAt descending to guarantee instant order even before composite index
    return logs.sort((a, b) => {
      const timeA = a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (typeof a.createdAt === "number" ? a.createdAt : new Date(a.createdAt || 0).getTime()));
      const timeB = b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (typeof b.createdAt === "number" ? b.createdAt : new Date(b.createdAt || 0).getTime()));
      return timeB - timeA;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, COLLECTION_NAME);
  }
}

/**
 * Real-time listener for user nutrition logs filtered strictly by local date range
 * (from local midnight 00:00:00.000 to local 23:59:59.999).
 * Guarantees that yesterday's entries never leak into today's view or totals.
 */
export function subscribeToUserNutritionLogsForDate(
  uid: string,
  dateStr: string = getTodayDateString(),
  onUpdate: (logs: NutritionLogRecord[]) => void,
  onError?: (error: any) => void
): () => void {
  const { startOfDay, endOfDay, startTimestampMs, endTimestampMs } = getLocalDateBoundaries(dateStr);
  const startTimestamp = Timestamp.fromDate(startOfDay);
  const endTimestamp = Timestamp.fromDate(endOfDay);

  const applyLocalFilter = (rawLogs: NutritionLogRecord[]) => {
    return rawLogs.filter((log) => {
      const timeMs = log.createdAt instanceof Timestamp
        ? log.createdAt.toMillis()
        : (log.createdAt?.seconds
        ? log.createdAt.seconds * 1000
        : (typeof log.createdAt === "number"
        ? log.createdAt
        : (log.createdAt ? new Date(log.createdAt).getTime() : null)));

      if (timeMs !== null && !isNaN(timeMs)) {
        return timeMs >= startTimestampMs && timeMs <= endTimestampMs;
      }
      return log.date === dateStr;
    });
  };

  const processSnapshot = (snapshot: any) => {
    const logs: NutritionLogRecord[] = [];
    snapshot.forEach((docSnap: any) => {
      const data = docSnap.data();
      logs.push({
        id: docSnap.id,
        uid: data.uid,
        foodName: data.foodName || "وجبة بدون اسم",
        calories: Number(data.calories) || 0,
        protein: Number(data.protein) || 0,
        carbs: Number(data.carbs) || 0,
        fat: Number(data.fat) || 0,
        weight: Number(data.weight) || 0,
        confidence: Number(data.confidence) || 0,
        createdAt: data.createdAt,
        date: data.date || undefined,
        mealType: data.mealType || undefined,
        itemsSummary: data.itemsSummary,
        imageUrl: data.imageUrl,
        is_manually_corrected: Boolean(data.is_manually_corrected),
        is_fully_manually_corrected: Boolean(data.is_fully_manually_corrected),
        is_text_entry: Boolean(data.is_text_entry),
        original_weight: data.original_weight ? Number(data.original_weight) : undefined,
        items: Array.isArray(data.items) ? data.items : undefined,
      });
    });

    const filtered = applyLocalFilter(logs);

    filtered.sort((a, b) => {
      const timeA = a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (typeof a.createdAt === "number" ? a.createdAt : new Date(a.createdAt || 0).getTime()));
      const timeB = b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (typeof b.createdAt === "number" ? b.createdAt : new Date(b.createdAt || 0).getTime()));
      return timeB - timeA;
    });

    onUpdate(filtered);
  };

  let activeUnsubscribe: (() => void) | null = null;

  try {
    const rangeQuery = query(
      collection(db, COLLECTION_NAME),
      where("uid", "==", uid),
      where("createdAt", ">=", startTimestamp),
      where("createdAt", "<=", endTimestamp),
      limit(30)
    );

    activeUnsubscribe = onSnapshot(
      rangeQuery,
      processSnapshot,
      (err) => {
        // Fallback gracefully if composite index is pending or not created yet
        console.warn("[Firestore] Range subscription notice, activating local fallback:", err);
        const fallbackQuery = query(
          collection(db, COLLECTION_NAME),
          where("uid", "==", uid),
          limit(500)
        );
        activeUnsubscribe = onSnapshot(fallbackQuery, processSnapshot, (fallbackErr) => {
          console.warn("[Firestore] Fallback subscription warning:", fallbackErr);
          if (onError) onError(fallbackErr);
        });
      }
    );
  } catch (err) {
    console.warn("[Firestore] Range query catch, activating fallback query:", err);
    const fallbackQuery = query(
      collection(db, COLLECTION_NAME),
      where("uid", "==", uid),
      limit(500)
    );
    activeUnsubscribe = onSnapshot(fallbackQuery, processSnapshot, onError);
  }

  return () => {
    if (activeUnsubscribe) {
      activeUnsubscribe();
    }
  };
}

/**
 * Fetches user nutrition logs strictly for a specific local date
 */
export async function fetchUserNutritionLogsForDate(
  uid: string,
  dateStr: string = getTodayDateString()
): Promise<NutritionLogRecord[]> {
  const { startOfDay, endOfDay, startTimestampMs, endTimestampMs } = getLocalDateBoundaries(dateStr);
  const startTimestamp = Timestamp.fromDate(startOfDay);
  const endTimestamp = Timestamp.fromDate(endOfDay);

  const applyLocalFilter = (rawLogs: NutritionLogRecord[]) => {
    return rawLogs.filter((log) => {
      const timeMs = log.createdAt instanceof Timestamp
        ? log.createdAt.toMillis()
        : (log.createdAt?.seconds
        ? log.createdAt.seconds * 1000
        : (typeof log.createdAt === "number"
        ? log.createdAt
        : (log.createdAt ? new Date(log.createdAt).getTime() : null)));

      if (timeMs !== null && !isNaN(timeMs)) {
        return timeMs >= startTimestampMs && timeMs <= endTimestampMs;
      }
      return log.date === dateStr;
    });
  };

  try {
    const rangeQuery = query(
      collection(db, COLLECTION_NAME),
      where("uid", "==", uid),
      where("createdAt", ">=", startTimestamp),
      where("createdAt", "<=", endTimestamp),
      limit(100)
    );

    const querySnapshot = await getDocs(rangeQuery);
    const logs: NutritionLogRecord[] = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      logs.push({
        id: docSnap.id,
        uid: data.uid,
        foodName: data.foodName || "وجبة بدون اسم",
        calories: Number(data.calories) || 0,
        protein: Number(data.protein) || 0,
        carbs: Number(data.carbs) || 0,
        fat: Number(data.fat) || 0,
        weight: Number(data.weight) || 0,
        confidence: Number(data.confidence) || 0,
        createdAt: data.createdAt,
        date: data.date || undefined,
        mealType: data.mealType || undefined,
        itemsSummary: data.itemsSummary,
        imageUrl: data.imageUrl,
        is_manually_corrected: Boolean(data.is_manually_corrected),
        is_fully_manually_corrected: Boolean(data.is_fully_manually_corrected),
        is_text_entry: Boolean(data.is_text_entry),
        original_weight: data.original_weight ? Number(data.original_weight) : undefined,
        items: Array.isArray(data.items) ? data.items : undefined,
      });
    });

    const filtered = applyLocalFilter(logs);
    return filtered.sort((a, b) => {
      const timeA = a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (typeof a.createdAt === "number" ? a.createdAt : new Date(a.createdAt || 0).getTime()));
      const timeB = b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (typeof b.createdAt === "number" ? b.createdAt : new Date(b.createdAt || 0).getTime()));
      return timeB - timeA;
    });
  } catch (rangeErr) {
    console.warn("[Firestore] Timestamp range getDocs notice, falling back to uid fetch with strict filter:", rangeErr);
    const allLogs = await fetchUserNutritionLogs(uid, 500);
    return applyLocalFilter(allLogs || []);
  }
}

/**
 * Real-time listener for user nutrition logs with bounded page limit
 */
export function subscribeToUserNutritionLogs(
  uid: string,
  onUpdate: (logs: NutritionLogRecord[]) => void,
  onError?: (error: any) => void,
  maxLimit = 500
): () => void {
  const q = query(
    collection(db, COLLECTION_NAME),
    where("uid", "==", uid),
    limit(maxLimit)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const logs: NutritionLogRecord[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        logs.push({
          id: docSnap.id,
          uid: data.uid,
          foodName: data.foodName || "وجبة بدون اسم",
          calories: Number(data.calories) || 0,
          protein: Number(data.protein) || 0,
          carbs: Number(data.carbs) || 0,
          fat: Number(data.fat) || 0,
          weight: Number(data.weight) || 0,
          confidence: Number(data.confidence) || 0,
          createdAt: data.createdAt,
          date: data.date || undefined,
          mealType: data.mealType || undefined,
          itemsSummary: data.itemsSummary,
          imageUrl: data.imageUrl,
          is_manually_corrected: Boolean(data.is_manually_corrected),
          is_fully_manually_corrected: Boolean(data.is_fully_manually_corrected),
          is_text_entry: Boolean(data.is_text_entry),
          original_weight: data.original_weight ? Number(data.original_weight) : undefined,
          items: Array.isArray(data.items) ? data.items : undefined,
        });
      });

      // Sort recent first
      logs.sort((a, b) => {
        const timeA = a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (typeof a.createdAt === "number" ? a.createdAt : new Date(a.createdAt || 0).getTime()));
        const timeB = b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (typeof b.createdAt === "number" ? b.createdAt : new Date(b.createdAt || 0).getTime()));
        return timeB - timeA;
      });

      onUpdate(logs);
    },
    (error) => {
      console.warn("Firestore subscription warning:", error);
      if (onError) {
        onError(error);
      }
    }
  );
}

/**
 * Deletes a nutrition log record by ID
 */
export async function deleteNutritionLogFromFirestore(logId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, COLLECTION_NAME, logId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${COLLECTION_NAME}/${logId}`);
  }
}

const CACHE_COLLECTION_NAME = "recognized_foods_cache";
const clientRecognizedFoodsMemory = new Map<string, any>();

function normalizeFoodNameKey(name: string): string {
  return (name || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s\u0600-\u06FF]/g, "")
    .replace(/\s+/g, "_");
}

export async function findInRecognizedFoodsCache(foodName: string): Promise<DetectedFood | null> {
  const key = normalizeFoodNameKey(foodName);
  if (!key || key.length < 2) return null;

  // Check in-memory fast cache first
  if (clientRecognizedFoodsMemory.has(key)) {
    return clientRecognizedFoodsMemory.get(key);
  }

  try {
    const docRef = doc(db, CACHE_COLLECTION_NAME, key);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      // Increment usage count atomically / via update if user signed in
      if (auth.currentUser) {
        updateDoc(docRef, {
          usageCount: (Number(data.usageCount) || 1) + 1,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }

      const item: DetectedFood = {
        id: `cache-${key}`,
        item_name: data.foodName,
        weight_g: Number(data.weight) || 100,
        calories: Number(data.calories) || 0,
        protein_g: Number(data.protein) || 0,
        carbs_g: Number(data.carbs) || 0,
        fat_g: Number(data.fat) || 0,
        confidence_score: Number(data.confidence) || 95,
        food_category: data.category || "packaged_product",
        data_source: "label_read",
        is_cached_memory: true,
        portion_description: `حصة معيارية محفوظة (${data.weight || 100}g)`,
        weight_range_min_g: Math.round((Number(data.weight) || 100) * 0.9),
        weight_range_max_g: Math.round((Number(data.weight) || 100) * 1.1),
        best_estimate_weight_g: Number(data.weight) || 100,
        small_weight_g: Math.round((Number(data.weight) || 100) * 0.7),
        medium_weight_g: Number(data.weight) || 100,
        large_weight_g: Math.round((Number(data.weight) || 100) * 1.3),
        has_hidden_fats_or_sauces: false,
      };

      clientRecognizedFoodsMemory.set(key, item);
      return item;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveToRecognizedFoodsCache(item: DetectedFood): Promise<void> {
  const dataSource = item.data_source;
  if (dataSource !== "label_read" && dataSource !== "product_estimate") {
    return;
  }
  const name = item.item_name;
  if (!name || name.length < 3) return;

  const key = normalizeFoodNameKey(name);
  if (!key) return;

  // Always update in-memory cache
  clientRecognizedFoodsMemory.set(key, item);

  if (!auth.currentUser) {
    return;
  }

  try {
    const docRef = doc(db, CACHE_COLLECTION_NAME, key);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const existing = docSnap.data();
      await updateDoc(docRef, {
        usageCount: (Number(existing.usageCount) || 1) + 1,
        calories: Number(item.calories) || existing.calories,
        protein: Number(item.protein_g) || existing.protein,
        carbs: Number(item.carbs_g) || existing.carbs,
        fat: Number(item.fat_g) || existing.fat,
        weight: Number(item.weight_g) || existing.weight,
        confidence: Number(item.confidence_score) || existing.confidence,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(docRef, {
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
      });
    }
  } catch {
    // Graceful silent fallback
  }
}
