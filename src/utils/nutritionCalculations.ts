import { DetectedFood, LoggedMeal, NutritionLogRecord, MealType } from "../types";
import { Timestamp } from "firebase/firestore";
import { parseToLocalDate, extractLocalDateString, suggestMealType, getTodayDateString } from "./dailyStorage";

/**
 * Extracts and parses individual food components from a nutrition log record.
 * Handles:
 * 1. Pre-existing structured `log.items`
 * 2. Legacy `log.itemsSummary` string parsing (e.g. "Chicken Breast (165 kcal), Rice (130 kcal)")
 * 3. Fallback single-item synthesis from log top-level macros
 */
export function parseLogComponents(log: NutritionLogRecord): DetectedFood[] {
  if (Array.isArray(log.items) && log.items.length > 0) {
    return log.items.map((it, idx) => ({
      ...it,
      id: it.id || `comp-${log.id || "item"}-${idx}`,
      calories: Math.round(Number(it.calories) || 0),
      weight_g: Math.round(Number(it.weight_g) || 100),
      protein_g: Math.round((Number(it.protein_g ?? (it as any).protein) || 0) * 10) / 10,
      carbs_g: Math.round((Number(it.carbs_g ?? (it as any).carbs) || 0) * 10) / 10,
      fat_g: Math.round((Number(it.fat_g ?? (it as any).fat) || 0) * 10) / 10,
      confidence_score: it.confidence_score ?? log.confidence ?? 85,
      is_manually_corrected: it.is_manually_corrected ?? log.is_manually_corrected,
    }));
  }

  if (log.itemsSummary && typeof log.itemsSummary === "string") {
    const parts = log.itemsSummary.split(/,\s*/);
    const parsed: DetectedFood[] = [];
    const totalCal = Math.max(1, log.calories || 0);

    parts.forEach((part, i) => {
      const calMatch = part.match(/(.+)\s*\((\d+)\s*kcal\)/i);
      if (calMatch) {
        const name = calMatch[1].trim();
        const cals = parseInt(calMatch[2], 10);
        const ratio = cals / totalCal;
        parsed.push({
          id: `comp-${log.id || "temp"}-${i}`,
          item_name: name,
          calories: cals,
          weight_g: Math.round((Number(log.weight) || 200) * ratio) || 100,
          protein_g: Math.round((Number(log.protein ?? (log as any).protein_g) || 0) * ratio * 10) / 10,
          carbs_g: Math.round((Number(log.carbs ?? (log as any).carbs_g) || 0) * ratio * 10) / 10,
          fat_g: Math.round((Number(log.fat ?? (log as any).fat_g) || 0) * ratio * 10) / 10,
          confidence_score: log.confidence || 85,
          is_manually_corrected: log.is_manually_corrected,
        });
      }
    });

    if (parsed.length > 0) {
      return parsed;
    }
  }

  return [
    {
      id: `comp-${log.id || "single"}`,
      item_name: log.foodName || "عنصر غذائي",
      calories: Math.round(Number(log.calories) || 0),
      weight_g: Math.round(Number(log.weight) || 200),
      protein_g: Math.round((Number(log.protein ?? (log as any).protein_g) || 0) * 10) / 10,
      carbs_g: Math.round((Number(log.carbs ?? (log as any).carbs_g) || 0) * 10) / 10,
      fat_g: Math.round((Number(log.fat ?? (log as any).fat_g) || 0) * 10) / 10,
      confidence_score: log.confidence || 85,
      is_manually_corrected: log.is_manually_corrected,
    },
  ];
}

/**
 * Proportionally scales nutrition values for a food item when its weight is updated.
 */
export function recalculateFoodItemNutrition(
  item: DetectedFood,
  newWeightGrams: number
): DetectedFood {
  const safeWeight = Math.max(1, Math.min(10000, Math.round(newWeightGrams)));
  
  if (item.per_100g) {
    const ratio = safeWeight / 100;
    return {
      ...item,
      weight_g: safeWeight,
      calories: Math.max(0, Math.round((Number(item.per_100g.calories) || 0) * ratio)),
      protein_g: Math.max(0, Math.round((Number(item.per_100g.protein_g) || 0) * ratio * 10) / 10),
      carbs_g: Math.max(0, Math.round((Number(item.per_100g.carbs_g) || 0) * ratio * 10) / 10),
      fat_g: Math.max(0, Math.round((Number(item.per_100g.fat_g) || 0) * ratio * 10) / 10),
      is_manually_corrected: true,
      is_manually_edited: true,
    };
  }

  const currentWeight = Math.max(1, Math.round(item.weight_g || 100));
  const ratio = safeWeight / currentWeight;

  return {
    ...item,
    weight_g: safeWeight,
    calories: Math.max(0, Math.round((Number(item.calories) || 0) * ratio)),
    protein_g: Math.max(0, Math.round((Number(item.protein_g ?? (item as any).protein) || 0) * ratio * 10) / 10),
    carbs_g: Math.max(0, Math.round((Number(item.carbs_g ?? (item as any).carbs) || 0) * ratio * 10) / 10),
    fat_g: Math.max(0, Math.round((Number(item.fat_g ?? (item as any).fat) || 0) * ratio * 10) / 10),
    is_manually_corrected: true,
    is_manually_edited: true,
  };
}

/**
 * Updates a food item with exact, user-specified nutrition values (manual override).
 */
export function recalculateFoodItemWithExactNutrients(
  item: DetectedFood,
  values: {
    weight_g: number;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  }
): DetectedFood {
  const newWeight = Math.max(1, Math.round(Number(values.weight_g) || 100));
  const ratioTo100 = 100 / newWeight;
  const newCalories = Math.max(0, Math.round(Number(values.calories) || 0));
  const newProtein = Math.max(0, Math.round((Number(values.protein_g ?? (values as any).protein) || 0) * 10) / 10);
  const newCarbs = Math.max(0, Math.round((Number(values.carbs_g ?? (values as any).carbs) || 0) * 10) / 10);
  const newFat = Math.max(0, Math.round((Number(values.fat_g ?? (values as any).fat) || 0) * 10) / 10);

  return {
    ...item,
    weight_g: newWeight,
    calories: newCalories,
    protein_g: newProtein,
    carbs_g: newCarbs,
    fat_g: newFat,
    per_100g: {
      calories: Math.max(0, Math.round(newCalories * ratioTo100)),
      protein_g: Math.max(0, Math.round(newProtein * ratioTo100 * 10) / 10),
      carbs_g: Math.max(0, Math.round(newCarbs * ratioTo100 * 10) / 10),
      fat_g: Math.max(0, Math.round(newFat * ratioTo100 * 10) / 10),
    },
    is_manually_corrected: true,
    is_manually_edited: true,
  };
}

/**
 * Aggregates a list of food components into totals and summary text.
 */
export function aggregateMealNutrients(items: DetectedFood[]): {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  weight_g: number;
  itemsSummary: string;
} {
  const calories = Math.round(
    items.reduce((sum, item) => sum + (Number(item.calories) || 0), 0)
  );
  const protein_g =
    Math.round(
      items.reduce((sum, item) => sum + (Number(item.protein_g ?? (item as any).protein) || 0), 0) * 10
    ) / 10;
  const carbs_g =
    Math.round(
      items.reduce((sum, item) => sum + (Number(item.carbs_g ?? (item as any).carbs) || 0), 0) * 10
    ) / 10;
  const fat_g =
    Math.round(
      items.reduce((sum, item) => sum + (Number(item.fat_g ?? (item as any).fat) || 0), 0) * 10
    ) / 10;
  const weight_g = Math.round(
    items.reduce((sum, item) => sum + (Number(item.weight_g) || 0), 0)
  );

  const itemsSummary = items
    .map((item) => `${item.item_name} (${Math.round(item.calories || 0)} kcal)`)
    .join(", ");

  return {
    calories,
    protein_g,
    carbs_g,
    fat_g,
    weight_g,
    itemsSummary,
  };
}

/**
 * Converts a Firestore NutritionLogRecord into a canonical LoggedMeal object for UI consumption.
 */
export function convertNutritionLogToMeal(
  log: NutritionLogRecord,
  fallbackDateStr: string = getTodayDateString()
): LoggedMeal {
  const rawTime = log.createdAt
    ? log.createdAt instanceof Timestamp
      ? log.createdAt.toMillis()
      : log.createdAt.seconds
      ? log.createdAt.seconds * 1000
      : typeof log.createdAt === "number"
      ? log.createdAt
      : new Date(log.createdAt).getTime()
    : Date.now();

  const timeStampNum = !isNaN(rawTime) ? rawTime : Date.now();
  const dateObj = new Date(timeStampNum);
  const dateStr =
    log.date ||
    extractLocalDateString({
      date: log.date,
      createdAt: log.createdAt,
    }) ||
    fallbackDateStr;

  const computedMealType: MealType =
    log.mealType || suggestMealType(dateObj.getHours());

  const items = parseLogComponents(log);

  return {
    id: log.id || `f-${timeStampNum}`,
    firestoreDocId: log.id,
    timestamp: timeStampNum,
    date: dateStr,
    timeStr: dateObj.toLocaleTimeString("ar-EG", {
      hour: "numeric",
      minute: "2-digit",
    }),
    mealType: computedMealType,
    title: log.foodName || "وجبة صحية",
    calories: Math.round(Number(log.calories) || 0),
    protein_g: Math.round((Number(log.protein ?? (log as any).protein_g) || 0) * 10) / 10,
    carbs_g: Math.round((Number(log.carbs ?? (log as any).carbs_g) || 0) * 10) / 10,
    fat_g: Math.round((Number(log.fat ?? (log as any).fat_g) || 0) * 10) / 10,
    imageUrl: log.imageUrl || "",
    wasEdited: Boolean(log.is_manually_corrected || log.is_fully_manually_corrected),
    is_manually_corrected: Boolean(log.is_manually_corrected),
    is_fully_manually_corrected: Boolean(log.is_fully_manually_corrected),
    is_text_entry: Boolean(log.is_text_entry),
    original_weight: log.original_weight ? Number(log.original_weight) : log.weight,
    items,
  };
}
