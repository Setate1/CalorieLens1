import { LoggedMeal, MealType, UserDailyGoal, UserProfile, NutritionLogRecord } from "../types";

const GOAL_STORAGE_KEY = "calorielens_user_goal";
const MEALS_STORAGE_KEY = "calorielens_logged_meals";

// Default daily goal
export const DEFAULT_GOAL: UserDailyGoal = {
  targetCalories: 2000,
  targetProtein_g: 130,
  targetCarbs_g: 220,
  targetFat_g: 65,
  isCalculated: false,
};

/**
 * Formats any Date, timestamp, or date string into 'YYYY-MM-DD' using the user's LOCAL timezone.
 * Uses Intl.DateTimeFormat('en-CA') which strictly respects the client's local midnight rollover,
 * preventing UTC drift (e.g., preventing dates from staying yesterday several hours after local midnight).
 */
export function getLocalDateString(
  dateInput: Date | number | string = new Date(),
  offsetDays: number = 0
): string {
  let d: Date;
  if (dateInput instanceof Date) {
    d = new Date(dateInput.getTime());
  } else if (typeof dateInput === "number") {
    d = new Date(dateInput);
  } else if (typeof dateInput === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim()) && offsetDays === 0) {
      return dateInput.trim();
    }
    d = new Date(dateInput);
  } else {
    d = new Date();
  }

  if (isNaN(d.getTime())) {
    d = new Date();
  }

  if (offsetDays !== 0) {
    d.setDate(d.getDate() + offsetDays);
  }

  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(d);
  } catch {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
}

/**
 * Returns today's date string (YYYY-MM-DD) in the user's local timezone.
 * Handles offset days (+1 for tomorrow, -1 for yesterday, etc.) in local time.
 */
export function getTodayDateString(offsetDays: number = 0): string {
  return getLocalDateString(new Date(), offsetDays);
}

/**
 * Safely parses any Firestore Timestamp, seconds, millis, or date string into a local Date object.
 */
export function parseToLocalDate(timestamp: any): Date {
  if (!timestamp) return new Date();
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp.toDate === "function") return timestamp.toDate();
  if (timestamp.seconds !== undefined) return new Date(timestamp.seconds * 1000);
  if (typeof timestamp === "number") return new Date(timestamp);
  const parsed = new Date(timestamp);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * Returns the exact Date boundaries (start of day 00:00:00.000 to end of day 23:59:59.999)
 * for a given local date string (YYYY-MM-DD) in the user's LOCAL timezone.
 */
export function getLocalDateBoundaries(dateStr: string = getTodayDateString()): {
  dateStr: string;
  startOfDay: Date;
  endOfDay: Date;
  startTimestampMs: number;
  endTimestampMs: number;
} {
  const cleanDateStr = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : getTodayDateString();
  const [year, month, day] = cleanDateStr.split("-").map(Number);
  const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
  const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
  return {
    dateStr: cleanDateStr,
    startOfDay,
    endOfDay,
    startTimestampMs: startOfDay.getTime(),
    endTimestampMs: endOfDay.getTime(),
  };
}

/**
 * Checks if a given timestamp or record falls strictly within the local date range
 * of the target date (from local 00:00:00.000 to local 23:59:59.999).
 */
export function isTimestampInLocalDateRange(
  timestamp: any,
  targetDateStr: string = getTodayDateString()
): boolean {
  if (!timestamp) return false;
  const dateObj = parseToLocalDate(timestamp);
  const timeMs = dateObj.getTime();
  if (isNaN(timeMs)) return false;

  const { startTimestampMs, endTimestampMs } = getLocalDateBoundaries(targetDateStr);
  return timeMs >= startTimestampMs && timeMs <= endTimestampMs;
}

/**
 * Extracts the YYYY-MM-DD date string from any record or meal,
 * prioritizing the actual local timestamp when present to eliminate UTC rollover drift,
 * and falling back to any explicit local date string.
 */
export function extractLocalDateString(record: {
  date?: string;
  createdAt?: any;
  timestamp?: any;
}): string {
  const timeSource = record.createdAt || record.timestamp;
  if (timeSource) {
    const dateObj = parseToLocalDate(timeSource);
    const dateStr = getLocalDateString(dateObj);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }
  }
  if (record.date && /^\d{4}-\d{2}-\d{2}$/.test(record.date)) {
    return record.date;
  }
  return getTodayDateString();
}

/**
 * Safely shifts a YYYY-MM-DD date string by a given number of days (+1 or -1)
 * using noon anchor (12:00:00) to guarantee daylight-saving transitions never shift the day.
 */
export function shiftDateString(dateStr: string, days: number): string {
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d, 12, 0, 0);
    dateObj.setDate(dateObj.getDate() + days);
    return getLocalDateString(dateObj);
  } catch {
    return getTodayDateString(days);
  }
}

/**
 * Formats day and month in Arabic (e.g. "السبت، 19 سبتمبر")
 */
export function formatDayAndMonth(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d, 12, 0, 0);
    return dateObj.toLocaleDateString("ar-EG", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Returns friendly human-readable date display in Arabic
 */
export function formatFriendlyDate(dateStr: string): string {
  const today = getTodayDateString();
  const yesterday = getTodayDateString(-1);
  const tomorrow = getTodayDateString(1);

  if (dateStr === today) return "اليوم";
  if (dateStr === yesterday) return "أمس";
  if (dateStr === tomorrow) return "غداً";

  return formatDayAndMonth(dateStr);
}

/**
 * Formats current local time string (e.g. "1:45 م")
 */
export function formatCurrentTime(date: Date = new Date()): string {
  return date.toLocaleTimeString("ar-EG", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Auto-suggests meal type based on hour of the day in local time
 */
export function suggestMealType(hour?: number): MealType {
  const h = hour !== undefined ? hour : new Date().getHours();
  if (h >= 5 && h < 11) return "breakfast";
  if (h >= 11 && h < 16) return "lunch";
  if (h >= 16 && h < 22) return "dinner";
  return "snack";
}

export function getMealTypeLabel(type: MealType): { label: string; icon: string; color: string } {
  switch (type) {
    case "breakfast":
      return { label: "فطار", icon: "🍳", color: "bg-amber-100 text-amber-900 border-amber-200" };
    case "lunch":
      return { label: "غداء", icon: "🥗", color: "bg-emerald-100 text-emerald-900 border-emerald-200" };
    case "dinner":
      return { label: "عشاء", icon: "🍲", color: "bg-indigo-100 text-indigo-900 border-indigo-200" };
    case "snack":
      return { label: "سناك", icon: "🍎", color: "bg-rose-100 text-rose-900 border-rose-200" };
  }
}

/**
 * Load user daily calorie and macro goals
 */
export function getUserGoal(): UserDailyGoal {
  try {
    const raw = localStorage.getItem(GOAL_STORAGE_KEY);
    if (!raw) return DEFAULT_GOAL;
    const parsed = JSON.parse(raw);
    const parsedCal = Number(parsed.targetCalories);
    return {
      targetCalories: (!isNaN(parsedCal) && parsedCal > 0) ? parsedCal : 2000,
      targetProtein_g: Number(parsed.targetProtein_g) || 130,
      targetCarbs_g: Number(parsed.targetCarbs_g) || 220,
      targetFat_g: Number(parsed.targetFat_g) || 65,
      isCalculated: Boolean(parsed.isCalculated),
      profile: parsed.profile,
    };
  } catch {
    return DEFAULT_GOAL;
  }
}

/**
 * Save user daily goal
 */
export function saveUserGoal(goal: UserDailyGoal): void {
  try {
    localStorage.setItem(GOAL_STORAGE_KEY, JSON.stringify(goal));
    window.dispatchEvent(new Event("calorielens_goal_updated"));
  } catch (err) {
    console.error("Failed to save goal to localStorage:", err);
  }
}

/**
 * Calculate Mifflin-St Jeor Equation
 * Men: BMR = (10 × weight in kg) + (6.25 × height in cm) - (5 × age) + 5
 * Women: BMR = (10 × weight in kg) + (6.25 × height in cm) - (5 × age) - 161
 */
export function calculateMifflinStJeor(profile: UserProfile): {
  bmr: number;
  tdee: number;
  suggestedCalories: number;
  suggestedProtein_g: number;
  suggestedCarbs_g: number;
  suggestedFat_g: number;
} {
  const { gender, weight_kg, height_cm, age, activityLevel, goalType } = profile;

  let bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age;
  if (gender === "male") {
    bmr += 5;
  } else {
    bmr -= 161;
  }

  let activityMultiplier = 1.2;
  switch (activityLevel) {
    case "sedentary":
      activityMultiplier = 1.2;
      break;
    case "light":
      activityMultiplier = 1.375;
      break;
    case "moderate":
      activityMultiplier = 1.55;
      break;
    case "very_active":
      activityMultiplier = 1.725;
      break;
  }

  const tdee = Math.round(bmr * activityMultiplier);

  let targetCalories = tdee;
  if (goalType === "lose") {
    targetCalories = Math.round(tdee * 0.8); // 20% deficit
  } else if (goalType === "gain") {
    targetCalories = Math.round(tdee * 1.15); // 15% surplus
  }

  // Suggested Macros:
  // Protein: ~1.8g - 2.0g per kg for active/deficit, or ~28% of calories
  const proteinGrams = Math.round(Math.min(weight_kg * 1.8, (targetCalories * 0.3) / 4));
  const proteinCals = proteinGrams * 4;

  // Fat: ~25% of calories
  const fatGrams = Math.round((targetCalories * 0.25) / 9);
  const fatCals = fatGrams * 9;

  // Carbs: remainder
  const carbCals = Math.max(0, targetCalories - proteinCals - fatCals);
  const carbGrams = Math.round(carbCals / 4);

  return {
    bmr: Math.round(bmr),
    tdee,
    suggestedCalories: targetCalories,
    suggestedProtein_g: proteinGrams,
    suggestedCarbs_g: carbGrams,
    suggestedFat_g: fatGrams,
  };
}

/**
 * Retrieve all logged meals from localStorage
 */
export function getAllMeals(): LoggedMeal[] {
  try {
    const raw = localStorage.getItem(MEALS_STORAGE_KEY);
    if (!raw) return [];
    const list: LoggedMeal[] = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * Retrieve meals for a specific date (YYYY-MM-DD), strictly checking that
 * meal timestamps fall within that day's local midnight-to-midnight boundaries.
 */
export function getMealsForDate(dateStr: string): LoggedMeal[] {
  const all = getAllMeals();
  const { startTimestampMs, endTimestampMs } = getLocalDateBoundaries(dateStr);

  return all.filter((m) => {
    // 1. If meal has numeric timestamp, strictly check that it falls within local midnight to midnight
    if (typeof m.timestamp === "number" && !isNaN(m.timestamp) && m.timestamp > 0) {
      return m.timestamp >= startTimestampMs && m.timestamp <= endTimestampMs;
    }
    // 2. Otherwise verify date string
    const mealDate = m.date || extractLocalDateString(m);
    return mealDate === dateStr;
  });
}

/**
 * Save a new meal or update existing meal by unique ID / firestoreDocId to prevent duplicates
 */
export function saveMeal(meal: LoggedMeal): void {
  try {
    const all = getAllMeals();
    const existingIndex = all.findIndex(
      (m) =>
        m.id === meal.id ||
        (meal.firestoreDocId && m.firestoreDocId === meal.firestoreDocId) ||
        (m.timestamp === meal.timestamp && m.title === meal.title)
    );

    if (existingIndex !== -1) {
      all[existingIndex] = { ...all[existingIndex], ...meal };
    } else {
      // Prepend new meal so latest appears on top of its category
      all.unshift(meal);
    }

    localStorage.setItem(MEALS_STORAGE_KEY, JSON.stringify(all));
    window.dispatchEvent(new Event("calorielens_meals_updated"));
  } catch (err) {
    console.error("Failed to save meal to localStorage:", err);
  }
}

/**
 * Delete a meal by ID or firestoreDocId
 */
export function deleteMeal(mealId: string): void {
  try {
    const all = getAllMeals();
    const filtered = all.filter(
      (m) => m.id !== mealId && m.firestoreDocId !== mealId
    );
    localStorage.setItem(MEALS_STORAGE_KEY, JSON.stringify(filtered));
    window.dispatchEvent(new Event("calorielens_meals_updated"));
  } catch (err) {
    console.error("Failed to delete meal from localStorage:", err);
  }
}

/**
 * Update an existing meal
 */
export function updateMeal(updatedMeal: LoggedMeal): void {
  try {
    const all = getAllMeals();
    const idx = all.findIndex(
      (m) =>
        m.id === updatedMeal.id ||
        (updatedMeal.firestoreDocId && m.firestoreDocId === updatedMeal.firestoreDocId)
    );
    if (idx !== -1) {
      all[idx] = updatedMeal;
      localStorage.setItem(MEALS_STORAGE_KEY, JSON.stringify(all));
      window.dispatchEvent(new Event("calorielens_meals_updated"));
    }
  } catch (err) {
    console.error("Failed to update meal in localStorage:", err);
  }
}

/**
 * Syncs localStorage for a given date with canonical Firestore meals,
 * safely preserving any local-only or pending meals that have not yet synced.
 */
export function syncLocalStorageWithFirestoreMeals(
  dateStr: string,
  firestoreMeals: LoggedMeal[]
): void {
  try {
    const all = getAllMeals();
    const { startTimestampMs, endTimestampMs } = getLocalDateBoundaries(dateStr);

    // Keep meals from other dates (meals whose timestamp is strictly OUTSIDE this date's range)
    const otherDateMeals = all.filter((m) => {
      if (typeof m.timestamp === "number" && !isNaN(m.timestamp) && m.timestamp > 0) {
        return m.timestamp < startTimestampMs || m.timestamp > endTimestampMs;
      }
      return m.date !== dateStr;
    });
    
    // Deduplicate firestoreMeals by id/firestoreDocId
    const seenIds = new Set<string>();
    const cleanDateMeals: LoggedMeal[] = [];
    firestoreMeals.forEach((m) => {
      const uniqueKey = m.firestoreDocId || m.id;
      if (uniqueKey && !seenIds.has(uniqueKey)) {
        seenIds.add(uniqueKey);
        cleanDateMeals.push({
          ...m,
          date: dateStr,
        });
      }
    });

    // Also KEEP any local-only or pending meals on this date that do NOT yet have a firestoreDocId
    // or are not represented in cleanDateMeals, so they are NEVER wiped out
    const localPendingMealsOnDate = all.filter((m) => {
      const isThisDate =
        (typeof m.timestamp === "number" && !isNaN(m.timestamp) && m.timestamp >= startTimestampMs && m.timestamp <= endTimestampMs) ||
        m.date === dateStr;

      if (!isThisDate) return false;

      // If already matched by ID/firestoreDocId, firestore version takes precedence
      if (m.firestoreDocId && seenIds.has(m.firestoreDocId)) return false;
      if (m.id && seenIds.has(m.id)) return false;

      // Check if meal matches by title and close timestamp (within 20 seconds)
      const matchedByContent = cleanDateMeals.some(
        (fm) =>
          fm.title === m.title &&
          Math.abs((Number(fm.timestamp) || 0) - (Number(m.timestamp) || 0)) < 20000
      );
      return !matchedByContent;
    });

    const combined = [...cleanDateMeals, ...localPendingMealsOnDate, ...otherDateMeals];
    localStorage.setItem(MEALS_STORAGE_KEY, JSON.stringify(combined));
  } catch (err) {
    console.warn("Failed to sync localStorage with Firestore meals:", err);
  }
}

/**
 * Returns all local meals converted into NutritionLogRecord format for immediate history rendering
 */
export function getLocalMealsAsNutritionLogs(uid?: string): NutritionLogRecord[] {
  const all = getAllMeals();
  return all.map((meal) => {
    return {
      id: meal.firestoreDocId || meal.id,
      uid: uid || "",
      foodName: meal.title,
      calories: Number(meal.calories) || 0,
      protein: Number(meal.protein_g) || 0,
      carbs: Number(meal.carbs_g) || 0,
      fat: Number(meal.fat_g) || 0,
      weight: Number(meal.original_weight) || 200,
      confidence: 90,
      createdAt: meal.timestamp ? (typeof meal.timestamp === "number" ? meal.timestamp : Date.now()) : Date.now(),
      date: meal.date,
      mealType: meal.mealType,
      imageUrl: meal.imageUrl,
      is_manually_corrected: Boolean(meal.is_manually_corrected || meal.wasEdited),
      is_fully_manually_corrected: Boolean(meal.is_fully_manually_corrected),
      is_text_entry: Boolean(meal.is_text_entry),
      original_weight: meal.original_weight,
      items: meal.items,
      itemsSummary: Array.isArray(meal.items) && meal.items.length > 0
        ? meal.items.map((it) => `${it.item_name} (${Math.round(it.calories)} kcal)`).join(", ")
        : meal.title,
    };
  }).sort((a, b) => {
    const timeA = typeof a.createdAt === "number" ? a.createdAt : new Date(a.createdAt || 0).getTime();
    const timeB = typeof b.createdAt === "number" ? b.createdAt : new Date(b.createdAt || 0).getTime();
    return timeB - timeA;
  });
}

/**
 * Compute aggregate daily totals with accurate 1-decimal precision
 */
export function getDailyTotals(meals: LoggedMeal[]): {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  mealCount: number;
} {
  const raw = meals.reduce(
    (acc, m) => {
      acc.calories += Number(m.calories) || 0;
      acc.protein_g += Number(m.protein_g) || 0;
      acc.carbs_g += Number(m.carbs_g) || 0;
      acc.fat_g += Number(m.fat_g) || 0;
      acc.mealCount += 1;
      return acc;
    },
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, mealCount: 0 }
  );

  return {
    calories: Math.round(raw.calories),
    protein_g: Math.round((raw.protein_g + Number.EPSILON) * 10) / 10,
    carbs_g: Math.round((raw.carbs_g + Number.EPSILON) * 10) / 10,
    fat_g: Math.round((raw.fat_g + Number.EPSILON) * 10) / 10,
    mealCount: raw.mealCount,
  };
}
