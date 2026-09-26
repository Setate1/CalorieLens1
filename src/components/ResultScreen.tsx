import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Scale,
  Sparkles,
  RotateCcw,
  Edit3,
  Check,
  AlertTriangle,
  Info,
  Flame,
  Dumbbell,
  Wheat,
  Droplet,
  ShieldCheck,
  Compass,
  CalendarPlus,
  CalendarCheck,
  Target,
  Utensils,
  ChevronDown,
  ChevronUp,
  Sliders,
  X,
  Users,
  AlertCircle,
} from "lucide-react";
import {
  DetectedFood,
  FoodAnalysisResponse,
  LoggedMeal,
  MealType,
  DataSourceType,
} from "../types";
import {
  saveMeal,
  getTodayDateString,
  formatCurrentTime,
  suggestMealType,
  getUserGoal,
} from "../utils/dailyStorage";
import {
  updateNutritionLogInFirestore,
  saveNutritionLogToFirestore,
  syncPendingLocalMealsToFirestore,
} from "../services/firestoreService";
import { upsertKnownMealCorrection, saveOrUpdateKnownMeal } from "../services/knownMealsService";
import { auth } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { Timestamp } from "firebase/firestore";
import { FoodItemCard } from "./FoodItemCard";
import { MacroRing } from "./MacroRing";
import { useCountUp } from "../hooks/useCountUp";

interface ResultScreenProps {
  imageUrl: string;
  initialAnalysis: FoodAnalysisResponse;
  firestoreDocId?: string;
  isFromMealMemory?: boolean;
  isFromSharedCache?: boolean;
  onForceFreshAnalysis?: () => void;
  onScanAnother: () => void;
  onViewDailyLog?: () => void;
}

// Strict floating-point rounder for frontend calculations
function round1Dec(val: number): number {
  if (isNaN(val) || !isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 10) / 10;
}

function getCategoryArabicLabel(cat?: string): string {
  switch (cat) {
    case "vegetable":
      return "خضار";
    case "meat_poultry_fish":
      return "بروتين ولحوم";
    case "starch_grain":
      return "نشويات وحبوب";
    case "legume":
      return "بقوليات";
    case "fruit":
      return "فواكه";
    case "fat_oil":
      return "دهون وزيوت";
    case "dairy":
      return "ألبان وأجبان";
    case "snack_bar":
      return "سناك صحي";
    case "beverage":
      return "مشروبات";
    default:
      return "طبق رئيسي";
  }
}

export const ResultScreen: React.FC<ResultScreenProps> = ({
  imageUrl,
  initialAnalysis,
  firestoreDocId,
  isFromMealMemory,
  isFromSharedCache,
  onForceFreshAnalysis,
  onScanAnother,
  onViewDailyLog,
}) => {
  // Normalize initial data whether passed as an array or wrapped object
  const normalizedInitialFoods: DetectedFood[] = Array.isArray(initialAnalysis)
    ? initialAnalysis
    : (initialAnalysis as any)?.items || (initialAnalysis as any)?.foods || [];

  // Display items with immutable USDA per-100g baseline for exact manual portion edits
  const initialDisplayFoods: DetectedFood[] = normalizedInitialFoods.map(
    (item, idx) => {
      const weight = Math.max(1, Math.round(Number(item.weight_g) || 50));
      const protein_g = round1Dec(
        Number(item.protein_g ?? (item as any).protein ?? (item as any).protein_grams) || 0
      );
      const carbs_g = round1Dec(
        Number(
          item.carbs_g ??
            (item as any).carbs ??
            (item as any).carbohydrates ??
            (item as any).carbohydrates_g ??
            (item as any).total_carbs ??
            (item as any).carb_g
        ) || 0
      );
      const fat_g = round1Dec(
        Number(item.fat_g ?? (item as any).fat ?? (item as any).fat_grams) || 0
      );
      const atwaterCal = Math.round(protein_g * 4 + carbs_g * 4 + fat_g * 9);
      const calories = Math.max(0, Math.round(Number(item.calories) || atwaterCal));
      const confidence = Math.max(10, Math.min(100, Math.round(Number(item.confidence_score) || 75)));

      const ratio100 = weight > 0 ? 100 / weight : 1;
      const per100g = item.per_100g || {
        calories: Math.round(calories * ratio100),
        protein_g: round1Dec(protein_g * ratio100),
        carbs_g: round1Dec(carbs_g * ratio100),
        fat_g: round1Dec(fat_g * ratio100),
      };

      return {
        ...item,
        id: item.id || `food-${idx}`,
        item_name: item.item_name || "وجبة صحية",
        weight_g: weight,
        calories,
        protein_g,
        carbs_g,
        fat_g,
        confidence_score: confidence,
        reference_object_detected:
          item.reference_object_detected || "Standard dinner plate reference (~26cm)",
        usda_matched_name: item.usda_matched_name || item.item_name,
        usda_source: item.usda_source || "USDA FoodData Central Reference",
        needs_review: item.needs_review ?? false,
        atwater_calories: item.atwater_calories ?? atwaterCal,
        is_approximate_estimate: confidence < 60,
        food_category: item.food_category || "mixed",
        sanity_status: item.sanity_status || "verified",
        sanity_message: item.sanity_message || "",
        raw_ai_estimate: item.raw_ai_estimate,
        per_100g: per100g,
      };
    }
  );

  const [foods, setFoods] = useState<DetectedFood[]>(initialDisplayFoods);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [hasEdited, setHasEdited] = useState<boolean>(false);
  const [showComponentsBreakdown, setShowComponentsBreakdown] = useState<boolean>(true);
  const [isTitleExpanded, setIsTitleExpanded] = useState<boolean>(false);
  const [isSavingPortions, setIsSavingPortions] = useState<boolean>(false);
  const [portionsSaveNotice, setPortionsSaveNotice] = useState<string | null>(null);

  // Manual Weight Correction State
  const [isCorrectingWeight, setIsCorrectingWeight] = useState<boolean>(false);
  const [manualWeightInput, setManualWeightInput] = useState<string>("");
  const [isManuallyCorrected, setIsManuallyCorrected] = useState<boolean>(false);
  const [weightCorrectionNotice, setWeightCorrectionNotice] = useState<string | null>(null);
  const [isSavingCorrection, setIsSavingCorrection] = useState<boolean>(false);

  // Manual Nutrition Override/Correction
  const [isEditingNutrition, setIsEditingNutrition] = useState<boolean>(false);
  const [manualKcalInput, setManualKcalInput] = useState<string>("");
  const [manualProteinInput, setManualProteinInput] = useState<string>("");
  const [manualCarbsInput, setManualCarbsInput] = useState<string>("");
  const [manualFatInput, setManualFatInput] = useState<string>("");
  const [isFullyManuallyCorrected, setIsFullyManuallyCorrected] = useState<boolean>(() => {
    return foods.some((f) => f.is_fully_manually_corrected);
  });
  const [nutritionCorrectionNotice, setNutritionCorrectionNotice] = useState<string | null>(null);
  const [isSavingNutrition, setIsSavingNutrition] = useState<boolean>(false);

  // Daily Logging State
  const { user } = useAuth();
  const [selectedMealType, setSelectedMealType] = useState<MealType>(suggestMealType());
  const [isLogged, setIsLogged] = useState<boolean>(false);
  const [isSavingToLog, setIsSavingToLog] = useState<boolean>(false);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  // Compute live meal totals with guaranteed 1-decimal precision
  const totalWeight = foods.reduce((sum, item) => sum + item.weight_g, 0);
  const initialTotalWeight = initialDisplayFoods.reduce((sum, item) => sum + item.weight_g, 0);
  const totalCalories = foods.reduce((sum, item) => sum + item.calories, 0);
  const totalProtein = round1Dec(
    foods.reduce((sum, item) => sum + item.protein_g, 0)
  );
  const totalCarbs = round1Dec(
    foods.reduce((sum, item) => sum + item.carbs_g, 0)
  );
  const totalFat = round1Dec(
    foods.reduce((sum, item) => sum + item.fat_g, 0)
  );

  const userGoal = getUserGoal();
  const goalTargetCal = userGoal.targetCalories || 2000;
  const mealCalPct = Math.round((totalCalories / goalTargetCal) * 100);

  // Animated numbers for calories, weight, and macronutrients
  const animatedCalories = useCountUp(totalCalories, 800, 0);
  const animatedWeight = useCountUp(totalWeight, 700, 0);
  const animatedProtein = useCountUp(totalProtein, 800, 1);
  const animatedCarbs = useCountUp(totalCarbs, 800, 1);
  const animatedFat = useCountUp(totalFat, 800, 1);

  // Primary dish title & category
  const mainFoodCategory = foods[0]?.food_category;
  const primaryTitle =
    foods.length === 1
      ? foods[0].item_name
      : foods.map((f) => f.item_name).slice(0, 2).join(" مع ") +
        (foods.length > 2 ? ` (+${foods.length - 2})` : "");

  // Open weight correction dialog
  const handleOpenWeightCorrection = () => {
    setManualWeightInput(String(totalWeight));
    setIsCorrectingWeight(true);
    setWeightCorrectionNotice(null);
  };

  // Apply manual weight correction with proportional recalculation across all components
  const handleApplyWeightCorrection = async () => {
    const parsedWeight = parseFloat(manualWeightInput);
    if (isNaN(parsedWeight) || parsedWeight <= 0 || parsedWeight > 10000) {
      return;
    }

    const currentTotalWeight = foods.reduce((sum, item) => sum + item.weight_g, 0);
    if (currentTotalWeight <= 0) return;

    const ratio = parsedWeight / currentTotalWeight;

    const updatedFoods: DetectedFood[] = foods.map((item) => {
      const newWeight = Math.max(1, Math.round(item.weight_g * ratio));
      const newProtein = round1Dec((Number(item.protein_g ?? (item as any).protein) || 0) * ratio);
      const newCarbs = round1Dec((Number(item.carbs_g ?? (item as any).carbs) || 0) * ratio);
      const newFat = round1Dec((Number(item.fat_g ?? (item as any).fat) || 0) * ratio);
      const newCalories = Math.max(0, Math.round((Number(item.calories) || 0) * ratio));

      return {
        ...item,
        weight_g: newWeight,
        calories: newCalories,
        protein_g: newProtein,
        carbs_g: newCarbs,
        fat_g: newFat,
        atwater_calories: newCalories,
        is_manually_corrected: true,
        original_estimated_weight_g: item.original_estimated_weight_g || item.weight_g,
      };
    });

    setFoods(updatedFoods);
    setIsManuallyCorrected(true);
    setHasEdited(true);
    setIsCorrectingWeight(false);
    setWeightCorrectionNotice(`تمت إعادة حساب القيم الغذائية لتناسب الوزن الفعلي (${Math.round(parsedWeight)}g)`);

    // Sync to Firestore if saved doc exists
    if (firestoreDocId) {
      try {
        setIsSavingCorrection(true);
        const newTotalCal = updatedFoods.reduce((sum, i) => sum + i.calories, 0);
        const newTotalP = round1Dec(updatedFoods.reduce((sum, i) => sum + i.protein_g, 0));
        const newTotalC = round1Dec(updatedFoods.reduce((sum, i) => sum + i.carbs_g, 0));
        const newTotalF = round1Dec(updatedFoods.reduce((sum, i) => sum + i.fat_g, 0));
        const newTotalW = Math.round(parsedWeight);

        await updateNutritionLogInFirestore(firestoreDocId, {
          calories: newTotalCal,
          protein: newTotalP,
          carbs: newTotalC,
          fat: newTotalF,
          weight: newTotalW,
          is_manually_corrected: true,
          original_weight: initialTotalWeight,
          items: updatedFoods,
          itemsSummary: updatedFoods
            .map((i) => `${i.item_name} (${Math.round(i.calories)} kcal)`)
            .join(", "),
        });
      } catch (err) {
        console.error("Failed to update Firestore log with corrected weight:", err);
      } finally {
        setIsSavingCorrection(false);
      }
    }

    // Learn corrected weight into Meal Memory
    if (auth.currentUser?.uid) {
      upsertKnownMealCorrection(auth.currentUser.uid, primaryTitle, updatedFoods, {
        calories: updatedFoods.reduce((sum, i) => sum + i.calories, 0),
        protein: round1Dec(updatedFoods.reduce((sum, i) => sum + i.protein_g, 0)),
        carbs: round1Dec(updatedFoods.reduce((sum, i) => sum + i.carbs_g, 0)),
        fat: round1Dec(updatedFoods.reduce((sum, i) => sum + i.fat_g, 0)),
        weight: Math.round(parsedWeight),
      }).catch((err) => console.warn("Failed to learn correction:", err));
    }
  };

  // Open independent nutrition override editor
  const handleOpenNutritionCorrection = () => {
    setManualKcalInput(String(Math.round(totalCalories)));
    setManualProteinInput(String(totalProtein));
    setManualCarbsInput(String(totalCarbs));
    setManualFatInput(String(totalFat));
    setIsEditingNutrition(true);
    setNutritionCorrectionNotice(null);
  };

  // Apply independent nutrition overrides
  const handleSaveNutritionCorrection = async () => {
    const parsedKcal = Math.max(0, Math.round(parseFloat(manualKcalInput) || 0));
    const parsedProtein = round1Dec(Math.max(0, parseFloat(manualProteinInput) || 0));
    const parsedCarbs = round1Dec(Math.max(0, parseFloat(manualCarbsInput) || 0));
    const parsedFat = round1Dec(Math.max(0, parseFloat(manualFatInput) || 0));

    let updatedFoods: DetectedFood[];
    if (foods.length <= 1) {
      updatedFoods = foods.map((item) => ({
        ...item,
        calories: parsedKcal,
        protein_g: parsedProtein,
        carbs_g: parsedCarbs,
        fat_g: parsedFat,
        atwater_calories: parsedKcal,
        is_manually_edited: true,
        is_fully_manually_corrected: true,
      }));
    } else {
      const currentTotCal = foods.reduce((s, i) => s + i.calories, 0) || 1;
      const currentTotProt = foods.reduce((s, i) => s + i.protein_g, 0) || 1;
      const currentTotCarb = foods.reduce((s, i) => s + i.carbs_g, 0) || 1;
      const currentTotFat = foods.reduce((s, i) => s + i.fat_g, 0) || 1;

      let cSum = 0;
      let pSum = 0;
      let carbSum = 0;
      let fSum = 0;

      updatedFoods = foods.map((item, idx) => {
        const isLast = idx === foods.length - 1;
        const iCal = isLast
          ? Math.max(0, parsedKcal - cSum)
          : Math.round((item.calories / currentTotCal) * parsedKcal);
        const iP = isLast
          ? round1Dec(Math.max(0, parsedProtein - pSum))
          : round1Dec((item.protein_g / currentTotProt) * parsedProtein);
        const iC = isLast
          ? round1Dec(Math.max(0, parsedCarbs - carbSum))
          : round1Dec((item.carbs_g / currentTotCarb) * parsedCarbs);
        const iF = isLast
          ? round1Dec(Math.max(0, parsedFat - fSum))
          : round1Dec((item.fat_g / currentTotFat) * parsedFat);

        cSum += iCal;
        pSum += iP;
        carbSum += iC;
        fSum += iF;

        return {
          ...item,
          calories: iCal,
          protein_g: iP,
          carbs_g: iC,
          fat_g: iF,
          atwater_calories: iCal,
          is_manually_edited: true,
          is_fully_manually_corrected: true,
        };
      });
    }

    setFoods(updatedFoods);
    setIsFullyManuallyCorrected(true);
    setHasEdited(true);

    if (firestoreDocId) {
      try {
        setIsSavingNutrition(true);
        await updateNutritionLogInFirestore(firestoreDocId, {
          calories: parsedKcal,
          protein: parsedProtein,
          carbs: parsedCarbs,
          fat: parsedFat,
          is_manually_corrected: true,
          is_fully_manually_corrected: true,
          items: updatedFoods,
          itemsSummary: updatedFoods
            .map((i) => `${i.item_name} (${Math.round(i.calories)} kcal)`)
            .join(", "),
        });
        setNutritionCorrectionNotice("تم حفظ القيم الغذائية المعدلة يدويًا بنجاح");
      } catch (err) {
        console.error("Failed to update nutrition in Firestore:", err);
      } finally {
        setIsSavingNutrition(false);
      }
    } else {
      setNutritionCorrectionNotice("تم حفظ القيم الغذائية المعدلة يدويًا بنجاح");
    }

    // Learn manual nutrition values into Meal Memory
    if (auth.currentUser?.uid) {
      upsertKnownMealCorrection(auth.currentUser.uid, primaryTitle, updatedFoods, {
        calories: parsedKcal,
        protein: parsedProtein,
        carbs: parsedCarbs,
        fat: parsedFat,
        weight: totalWeight,
      }).catch((err) => console.warn("Failed to learn correction:", err));
    }

    setIsEditingNutrition(false);
  };

  // Average confidence
  const avgConfidence =
    foods.length > 0
      ? Math.round(
          foods.reduce((sum, item) => sum + (Number(item.confidence_score) || 85), 0) /
            foods.length
        )
      : 85;

  const handleSaveLocallyFallback = () => {
    const mealTitle =
      foods.map((f) => f.item_name).slice(0, 3).join("، ") +
      (foods.length > 3 ? "..." : "");
    const foodName = mealTitle || primaryTitle || "وجبة صحية";
    const todayDateStr = getTodayDateString();

    const fallbackMeal: LoggedMeal = {
      id: firestoreDocId || `meal-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      date: todayDateStr,
      timeStr: formatCurrentTime(),
      mealType: selectedMealType,
      title: foodName,
      imageUrl,
      calories: totalCalories,
      protein_g: totalProtein,
      carbs_g: totalCarbs,
      fat_g: totalFat,
      items: foods,
      wasEdited: hasEdited || isManuallyCorrected,
      is_manually_corrected: isManuallyCorrected || foods.some((f) => f.is_manually_corrected),
      original_weight: initialTotalWeight,
      firestoreDocId: firestoreDocId || undefined,
    };

    saveMeal(fallbackMeal);
    window.dispatchEvent(new Event("calorielens_meals_updated"));
    setSaveErrorMessage(null);
    setIsLogged(true);

    const currentUid = user?.uid || auth.currentUser?.uid;
    if (currentUid) {
      syncPendingLocalMealsToFirestore(currentUid).catch((err) =>
        console.warn("Background sync error after manual fallback save:", err)
      );
    }
  };

  const handleAddToDailyLog = async () => {
    if (isSavingToLog) return;
    setIsSavingToLog(true);
    setSaveErrorMessage(null);

    const mealTitle =
      foods.map((f) => f.item_name).slice(0, 3).join("، ") +
      (foods.length > 3 ? "..." : "");
    const foodName = mealTitle || primaryTitle || "وجبة صحية";
    const todayDateStr = getTodayDateString();
    const currentUid = user?.uid || auth.currentUser?.uid;

    let activeDocId = firestoreDocId;

    try {
      if (currentUid) {
        if (!activeDocId) {
          console.log("[ResultScreen] Saving brand new log to Firestore:", {
            foodName,
            mealType: selectedMealType,
            date: todayDateStr,
            calories: totalCalories,
          });
          const newDocId = await saveNutritionLogToFirestore({
            uid: currentUid,
            foodName,
            calories: totalCalories,
            protein: totalProtein,
            carbs: totalCarbs,
            fat: totalFat,
            weight: totalWeight,
            confidence: avgConfidence,
            mealType: selectedMealType,
            date: todayDateStr,
            createdAt: Timestamp.now(),
            imageUrl,
            is_manually_corrected: isManuallyCorrected || foods.some((f) => f.is_manually_corrected),
            is_fully_manually_corrected: isFullyManuallyCorrected,
            items: foods,
            itemsSummary: foods
              .map((i) => `${i.item_name} (${Math.round(i.calories)} kcal)`)
              .join(", "),
            original_weight: initialTotalWeight,
          });
          activeDocId = newDocId;
        } else {
          console.log("[ResultScreen] Updating existing Firestore log:", activeDocId);
          await updateNutritionLogInFirestore(activeDocId, {
            foodName,
            mealType: selectedMealType,
            calories: totalCalories,
            protein: totalProtein,
            carbs: totalCarbs,
            fat: totalFat,
            weight: totalWeight,
            date: todayDateStr,
            items: foods,
            itemsSummary: foods
              .map((i) => `${i.item_name} (${Math.round(i.calories)} kcal)`)
              .join(", "),
            is_manually_corrected: isManuallyCorrected || foods.some((f) => f.is_manually_corrected),
          });
        }
      }

      // Save to local storage mirror for instant offline and multi-view synchronization
      const newMeal: LoggedMeal = {
        id: activeDocId || `meal-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        timestamp: Date.now(),
        date: todayDateStr,
        timeStr: formatCurrentTime(),
        mealType: selectedMealType,
        title: foodName,
        imageUrl,
        calories: totalCalories,
        protein_g: totalProtein,
        carbs_g: totalCarbs,
        fat_g: totalFat,
        items: foods,
        wasEdited: hasEdited || isManuallyCorrected,
        is_manually_corrected: isManuallyCorrected || foods.some((f) => f.is_manually_corrected),
        original_weight: initialTotalWeight,
        firestoreDocId: activeDocId || undefined,
      };

      saveMeal(newMeal);
      window.dispatchEvent(new Event("calorielens_meals_updated"));
      setIsLogged(true);
      setSaveErrorMessage(null);

      // Save or update Meal Memory in Firestore & local mirror in background
      if (currentUid) {
        saveOrUpdateKnownMeal(currentUid, {
          title: foodName,
          items: foods,
          defaultWeightGrams: totalWeight,
          isUserCorrected: isManuallyCorrected || isFullyManuallyCorrected || foods.some((f) => f.is_manually_corrected),
        }).catch((err) => console.warn("Failed to update Meal Memory:", err));
      }
    } catch (err: any) {
      console.error("[ResultScreen] Failed to complete save to daily log:", err);

      // Even if cloud write encounters an issue, guarantee that local storage preserves user data
      try {
        const fallbackMeal: LoggedMeal = {
          id: activeDocId || `meal-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          timestamp: Date.now(),
          date: todayDateStr,
          timeStr: formatCurrentTime(),
          mealType: selectedMealType,
          title: foodName,
          imageUrl,
          calories: totalCalories,
          protein_g: totalProtein,
          carbs_g: totalCarbs,
          fat_g: totalFat,
          items: foods,
          wasEdited: hasEdited || isManuallyCorrected,
          is_manually_corrected: isManuallyCorrected || foods.some((f) => f.is_manually_corrected),
          original_weight: initialTotalWeight,
          firestoreDocId: activeDocId || undefined,
        };
        saveMeal(fallbackMeal);
        window.dispatchEvent(new Event("calorielens_meals_updated"));
        setIsLogged(true);
      } catch (localErr) {
        console.error("Local meal save fallback error:", localErr);
      }

      let userFriendlyMsg = "تعذر إتمام الحفظ في السجل السحابي. يرجى إعادة المحاولة.";
      const rawMsg = err?.message || String(err);
      if (rawMsg.includes("permission-denied") || rawMsg.includes("PERMISSION_DENIED") || rawMsg.includes("Missing or insufficient permissions")) {
        userFriendlyMsg = "تم حفظ الوجبة محلياً. لم يتم المزامنة مع السحابة لعدم توفر الصلاحيات (تحقق من الحساب).";
      } else if (rawMsg.includes("وقتاً أطول") || rawMsg.includes("timeout") || rawMsg.includes("مهلة") || rawMsg.includes("DEADLINE_EXCEEDED")) {
        userFriendlyMsg = "تم حفظ الوجبة محلياً وستتم المزامنة تلقائياً عند استقرار الاتصال.";
      } else if (rawMsg.includes("unavailable") || rawMsg.includes("UNAVAILABLE")) {
        userFriendlyMsg = "تم حفظ الوجبة محلياً وستتم المزامنة تلقائياً عند استعادة الاتصال بالسحابة.";
      } else {
        try {
          const parsed = JSON.parse(rawMsg);
          if (parsed.error?.includes("permission-denied") || parsed.error?.includes("Missing or insufficient permissions")) {
            userFriendlyMsg = "تم حفظ الوجبة محلياً. لم يتم المزامنة مع السحابة لعدم توفر الصلاحيات (تحقق من الحساب).";
          }
        } catch {
          // ignore
        }
      }

      setSaveErrorMessage(userFriendlyMsg);
    } finally {
      setIsSavingToLog(false);
    }
  };

  // Caloric macro energy distribution
  const proteinKcal = totalProtein * 4;
  const carbsKcal = totalCarbs * 4;
  const fatKcal = totalFat * 9;
  const macroSumKcal = Math.max(1, proteinKcal + carbsKcal + fatKcal);

  const proteinPct = Math.round((proteinKcal / macroSumKcal) * 100);
  const carbsPct = Math.round((carbsKcal / macroSumKcal) * 100);
  const fatPct = Math.max(0, 100 - proteinPct - carbsPct);

  // Re-calculate portion using the fixed USDA per-100g profile
  const handleGramChange = (foodId: string, newGrams: number) => {
    const validGrams = Math.max(0, Math.min(3000, Math.round(newGrams)));
    setFoods((prevFoods) =>
      prevFoods.map((item) => {
        if (item.id !== foodId) return item;
        const currentWeight = Math.max(1, item.weight_g || 100);
        const profile = item.per_100g || {
          calories: Math.round((Number(item.calories) || 0) * (100 / currentWeight)),
          protein_g: round1Dec((Number(item.protein_g ?? (item as any).protein) || 0) * (100 / currentWeight)),
          carbs_g: round1Dec((Number(item.carbs_g ?? (item as any).carbs) || 0) * (100 / currentWeight)),
          fat_g: round1Dec((Number(item.fat_g ?? (item as any).fat) || 0) * (100 / currentWeight)),
        };
        const ratio = validGrams / 100;
        const newProtein = round1Dec(profile.protein_g * ratio);
        const newCarbs = round1Dec(profile.carbs_g * ratio);
        const newFat = round1Dec(profile.fat_g * ratio);
        const newCalories = Math.round(newProtein * 4 + newCarbs * 4 + newFat * 9);

        return {
          ...item,
          weight_g: validGrams,
          calories: newCalories,
          protein_g: newProtein,
          carbs_g: newCarbs,
          fat_g: newFat,
          atwater_calories: newCalories,
        };
      })
    );
    setHasEdited(true);
  };

  const handleItemNameChange = (foodId: string, newName: string) => {
    setFoods((prev) =>
      prev.map((item) => (item.id === foodId ? { ...item, item_name: newName } : item))
    );
    setHasEdited(true);
  };

  const handleUpdateFoodItem = (foodId: string, updatedFields: Partial<DetectedFood>) => {
    setFoods((prev) => {
      const updated = prev.map((item) => {
        if (item.id !== foodId) return item;
        return {
          ...item,
          ...updatedFields,
          is_manually_corrected: true,
          is_manually_edited: true,
        };
      });

      if (firestoreDocId) {
        const newTotalCal = updated.reduce((s, i) => s + (Number(i.calories) || 0), 0);
        const newTotalP = round1Dec(updated.reduce((s, i) => s + (Number(i.protein_g) || 0), 0));
        const newTotalC = round1Dec(updated.reduce((s, i) => s + (Number(i.carbs_g) || 0), 0));
        const newTotalF = round1Dec(updated.reduce((s, i) => s + (Number(i.fat_g) || 0), 0));
        const newTotalW = Math.round(updated.reduce((s, i) => s + (Number(i.weight_g) || 0), 0));

        updateNutritionLogInFirestore(firestoreDocId, {
          calories: newTotalCal,
          protein: newTotalP,
          carbs: newTotalC,
          fat: newTotalF,
          weight: newTotalW,
          is_manually_corrected: true,
          items: updated,
          itemsSummary: updated
            .map((i) => `${i.item_name} (${Math.round(i.calories)} kcal)`)
            .join(", "),
        }).catch((err) => {
          console.warn("Could not sync component update to Firestore:", err);
        });
      }

      return updated;
    });
    setHasEdited(true);
  };

  const handleToggleCookingOil = (foodId: string, addOil: boolean) => {
    setFoods((prev) =>
      prev.map((item) => {
        if (item.id !== foodId) return item;
        const oilKcal = item.cooking_oil_estimate_kcal || 45;
        const oilFat = round1Dec(oilKcal / 9);
        const newCalories = addOil ? item.calories + oilKcal : Math.max(0, item.calories - oilKcal);
        const newFat = addOil ? round1Dec(item.fat_g + oilFat) : Math.max(0, round1Dec(item.fat_g - oilFat));
        return {
          ...item,
          calories: newCalories,
          fat_g: newFat,
          atwater_calories: newCalories,
        };
      })
    );
    setHasEdited(true);
  };

  const handleResetToOriginal = () => {
    setFoods(initialDisplayFoods);
    setHasEdited(false);
  };

  const handleSaveAllPortions = async () => {
    setIsSavingPortions(true);
    try {
      if (firestoreDocId) {
        const newTotalCal = foods.reduce((s, i) => s + (Number(i.calories) || 0), 0);
        const newTotalP = round1Dec(foods.reduce((s, i) => s + (Number(i.protein_g) || 0), 0));
        const newTotalC = round1Dec(foods.reduce((s, i) => s + (Number(i.carbs_g) || 0), 0));
        const newTotalF = round1Dec(foods.reduce((s, i) => s + (Number(i.fat_g) || 0), 0));
        const newTotalW = Math.round(foods.reduce((s, i) => s + (Number(i.weight_g) || 0), 0));

        await updateNutritionLogInFirestore(firestoreDocId, {
          calories: newTotalCal,
          protein: newTotalP,
          carbs: newTotalC,
          fat: newTotalF,
          weight: newTotalW,
          is_manually_corrected: true,
          items: foods,
          itemsSummary: foods
            .map((i) => `${i.item_name} (${Math.round(i.calories)} kcal)`)
            .join(", "),
        });
      }

      // Learn manual portions in Meal Memory
      if (auth.currentUser?.uid) {
        const newTotalCal = foods.reduce((s, i) => s + (Number(i.calories) || 0), 0);
        const newTotalP = round1Dec(foods.reduce((s, i) => s + (Number(i.protein_g) || 0), 0));
        const newTotalC = round1Dec(foods.reduce((s, i) => s + (Number(i.carbs_g) || 0), 0));
        const newTotalF = round1Dec(foods.reduce((s, i) => s + (Number(i.fat_g) || 0), 0));
        const newTotalW = Math.round(foods.reduce((s, i) => s + (Number(i.weight_g) || 0), 0));

        upsertKnownMealCorrection(auth.currentUser.uid, primaryTitle, foods, {
          calories: newTotalCal,
          protein: newTotalP,
          carbs: newTotalC,
          fat: newTotalF,
          weight: newTotalW,
        }).catch((err) => console.warn("Failed to learn portions correction:", err));
      }

      setPortionsSaveNotice("تم حفظ التعديلات بنجاح");
      setTimeout(() => setPortionsSaveNotice(null), 3500);
      setHasEdited(false);
    } catch (err) {
      console.error("Failed to save portions to Firestore:", err);
      setPortionsSaveNotice("تعذر الحفظ في السجل السحابي. يرجى إعادة المحاولة.");
      setTimeout(() => setPortionsSaveNotice(null), 4000);
    } finally {
      setIsSavingPortions(false);
    }
  };

  // If no food was recognized
  if (foods.length === 0) {
    return (
      <div className="flex-1 flex flex-col justify-between p-5 max-w-md mx-auto w-full text-center" dir="rtl">
        <div className="pt-6">
          <div className="w-16 h-16 rounded-3xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-4 border border-amber-200 dark:border-amber-800/40 shadow-xs">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <h2 className="text-2xl font-bold text-[#030303] dark:text-[#FAFAFA]">
            لم يتم التعرف على طعام واضح
          </h2>

          <p className="mt-2 text-sm text-[#71717A] dark:text-[#A1A1AA] leading-relaxed max-w-xs mx-auto">
            تأكد من وضوح الصورة وتمركز الطبق في الإطار ثم أعد المحاولة.
          </p>

          <div className="mt-6 rounded-2xl overflow-hidden border border-[#E4E4E7] dark:border-[#27272A] aspect-video max-w-xs mx-auto bg-white dark:bg-[#18181B] shadow-xs flex items-center justify-center">
            {imageUrl && imageUrl.trim() !== "" ? (
              <img
                src={imageUrl}
                alt="Uploaded photo"
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover grayscale opacity-75"
              />
            ) : (
              <Utensils className="w-10 h-10 text-[#71717A] dark:text-[#A1A1AA] opacity-50" />
            )}
          </div>
        </div>

        <div className="py-4">
          <button
            id="try-another-photo-button"
            type="button"
            onClick={onScanAnother}
            className="w-full py-3.5 px-5 rounded-2xl bg-[#030303] dark:bg-[#16A34A] hover:bg-[#27272A] dark:hover:bg-[#15803D] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.99] cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 text-white" />
            <span>التقاط صورة أخرى</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      id="food-details-results-screen"
      className="flex-1 flex flex-col p-3.5 sm:p-6 lg:p-8 max-w-3xl mx-auto w-full space-y-4 pb-24 animate-fade-in text-[#030303] dark:text-[#FAFAFA]"
      dir="rtl"
    >
      {/* SCREEN 2: Top Photo inside Rounded Card with 2 Pill Badges */}
      <div className="relative w-full rounded-[24px] overflow-hidden bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] shadow-sm aspect-16/10 sm:aspect-2/1 max-h-[340px] flex items-center justify-center">
        {imageUrl && imageUrl.trim() !== "" ? (
          <img
            src={imageUrl}
            alt={primaryTitle}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-100 dark:bg-[#18181B] text-[#71717A] dark:text-[#A1A1AA]">
            <Utensils className="w-12 h-12 mb-2 text-[#16A34A] opacity-60" />
            <span className="text-xs font-medium">{primaryTitle}</span>
          </div>
        )}

        {/* Subtle gradient overlay for pill contrast */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent pointer-events-none" />

        {/* 2 Small Pill Badges above/on the photo showing Category and Weight */}
        <div className="absolute top-3.5 right-3.5 flex items-center gap-2 z-10">
          <span className="px-3 py-1 rounded-full bg-white/95 dark:bg-[#18181B]/95 backdrop-blur-md text-[#030303] dark:text-[#FAFAFA] text-xs font-bold shadow-sm border border-[#E4E4E7] dark:border-[#27272A] flex items-center gap-1.5">
            <Utensils className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
            <span>{getCategoryArabicLabel(mainFoodCategory)}</span>
          </span>

          <span className="px-3 py-1 rounded-full bg-[#DDEFB5] dark:bg-[#14532D] backdrop-blur-md text-[#030303] dark:text-[#86EFAC] text-xs font-black shadow-sm border border-emerald-600/20 dark:border-emerald-600/40 tabular-nums">
            {animatedWeight}g
          </span>
        </div>

        {/* Confidence pill on top left */}
        <div className="absolute top-3.5 left-3.5 z-10">
          <span className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-white text-[11px] font-bold">
            دقة {avgConfidence}%
          </span>
        </div>

        {/* Badges on bottom of photo */}
        <div className="absolute bottom-3.5 right-3.5 left-3.5 flex items-center justify-between text-white text-xs z-10">
          <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-md px-2.5 py-1 rounded-lg">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] font-medium">USDA Verified</span>
          </div>

          {(isFullyManuallyCorrected || foods.some((f) => f.is_fully_manually_corrected)) ? (
            <span className="bg-[#DDEFB5] dark:bg-[#14532D] text-[#030303] dark:text-[#86EFAC] px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1">
              <Check className="w-3 h-3 text-emerald-800 dark:text-emerald-400" />
              <span>معدل يدويًا</span>
            </span>
          ) : isManuallyCorrected ? (
            <span className="bg-[#DDEFB5] dark:bg-[#14532D] text-[#030303] dark:text-[#86EFAC] px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1">
              <Check className="w-3 h-3 text-emerald-800 dark:text-emerald-400" />
              <span>وزن مصحح</span>
            </span>
          ) : null}
        </div>
      </div>

      {/* Persistent Meal Memory Recognition Badge (Personal) */}
      {isFromMealMemory && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-[#DDEFB5]/50 dark:bg-[#14532D]/30 border border-[#C5E193] dark:border-emerald-700/40 text-[#14532D] dark:text-[#86EFAC] shadow-2xs"
        >
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#16A34A] animate-pulse shrink-0" />
            <span className="text-xs sm:text-sm font-bold">متعرّف عليها من سجلك</span>
            <span className="text-[10px] text-[#166534] dark:text-[#86EFAC] bg-white/80 dark:bg-[#18181B]/80 px-2 py-0.5 rounded-full border border-[#C5E193]/60 dark:border-emerald-700/40 font-semibold">
              ذاكرة الوجبات
            </span>
          </div>

          {onForceFreshAnalysis && (
            <button
              type="button"
              onClick={onForceFreshAnalysis}
              className="text-xs font-bold text-white bg-[#030303] dark:bg-[#27272A] hover:bg-[#27272A] dark:hover:bg-[#3F3F46] px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs active:scale-[0.98]"
            >
              <RotateCcw className="w-3.5 h-3.5 text-white" />
              <span>تحليل من جديد</span>
            </button>
          )}
        </motion.div>
      )}

      {/* Shared Public Community Database Cache Hit Badge */}
      {isFromSharedCache && !isFromMealMemory && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-2xl bg-sky-50/80 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/40 text-sky-900 dark:text-sky-200 shadow-2xs"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-600 dark:bg-sky-400 shrink-0" />
            <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm">
              <Users className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
              <span>مطابقة من قاعدة بيانات المجتمع</span>
            </div>
            <span
              className="text-[10px] text-sky-700 dark:text-sky-300 bg-white/90 dark:bg-[#18181B]/90 px-2 py-0.5 rounded-full border border-sky-200 dark:border-sky-800/40 font-medium inline-flex items-center gap-1"
              title="نتيجة تقديرية من مستخدمين آخرين، راجعها قبل الحفظ"
            >
              <Info className="w-3 h-3 text-sky-600 dark:text-sky-400 shrink-0" />
              <span>نتيجة تقديرية من مستخدمين آخرين، راجعها قبل الحفظ</span>
            </span>
          </div>

          {onForceFreshAnalysis && (
            <button
              type="button"
              onClick={onForceFreshAnalysis}
              className="text-xs font-bold text-white bg-[#030303] dark:bg-[#27272A] hover:bg-[#27272A] dark:hover:bg-[#3F3F46] px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs active:scale-[0.98] self-end sm:self-auto"
            >
              <RotateCcw className="w-3.5 h-3.5 text-white" />
              <span>تحليل من جديد</span>
            </button>
          )}
        </motion.div>
      )}

      {/* Food Title & Header */}
      <div className="flex items-start justify-between gap-3 pt-1">
        <div className="flex-1 min-w-0">
          <h1
            id="food-primary-title"
            onClick={() => setIsTitleExpanded(!isTitleExpanded)}
            className={`text-base sm:text-lg font-bold text-[#030303] dark:text-[#FAFAFA] tracking-tight leading-snug cursor-pointer transition-all ${
              isTitleExpanded ? "" : "line-clamp-2"
            }`}
            title="انقر لتوسيع أو طي الاسم الكامل"
          >
            {primaryTitle}
          </h1>
          <p className="text-xs text-[#71717A] dark:text-[#A1A1AA] mt-0.5">
            {foods.length > 1
              ? `تم تحديد ${foods.length} مكونات بدقة معايير USDA`
              : "تم تقدير الحجم والماكروز وفق المعايير الغذائية المعتمدة"}
          </p>
        </div>

        {/* Quick edit portions or reset */}
        {hasEdited && (
          <button
            type="button"
            onClick={handleResetToOriginal}
            className="text-xs text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-300 font-bold underline cursor-pointer shrink-0 pt-0.5"
          >
            استعادة التقدير الأصلي
          </button>
        )}
      </div>

      {/* SCREEN 2: Total Calories Section */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="bg-[#DDEFB5] dark:bg-[#14532D]/40 rounded-[24px] p-5 sm:p-6 border border-[#C5E193] dark:border-emerald-700/40 shadow-xs flex items-center justify-between"
      >
        <div>
          <span className="text-xs font-bold text-[#14532D] dark:text-[#86EFAC] uppercase tracking-wider block mb-1">
            إجمالي السعرات (Total Calories)
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl sm:text-5xl font-black text-[#030303] dark:text-[#FAFAFA] tracking-tight tabular-nums">
              {animatedCalories}
            </span>
            <span className="text-base sm:text-lg font-bold text-[#14532D] dark:text-[#86EFAC]">kcal</span>
          </div>
          <span className="text-[11px] text-[#14532D]/80 dark:text-[#86EFAC]/80 mt-1 block">
            {mealCalPct}% من الاحتياج اليومي ({goalTargetCal} kcal)
          </span>
        </div>

        {/* Circular flame icon/badge */}
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white dark:bg-[#18181B] text-amber-600 flex items-center justify-center shadow-xs border border-[#C5E193] dark:border-emerald-700/40 shrink-0">
          <Flame className="w-7 h-7 sm:w-8 sm:h-8 fill-amber-500 text-amber-500" />
        </div>
      </motion.div>

      {/* SCREEN 2: Three Circular Macro Rings in a Horizontal Row */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}>
          <MacroRing
            type="protein"
            label="بروتين (Protein)"
            grams={animatedProtein}
            percentage={proteinPct}
            subtitle={`${proteinPct}% cal`}
            size={76}
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}>
          <MacroRing
            type="fat"
            label="دهون (Fat)"
            grams={animatedFat}
            percentage={fatPct}
            subtitle={`${fatPct}% cal`}
            size={76}
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}>
          <MacroRing
            type="carbs"
            label="كارب (Carbs)"
            grams={animatedCarbs}
            percentage={carbsPct}
            subtitle={`${carbsPct}% cal`}
            size={76}
          />
        </motion.div>
      </div>

      {/* Manual Weight Correction Dialog / Panel if opened */}
      <AnimatePresence>
        {isCorrectingWeight && (
          <motion.div
            key="weight-modal"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            id="weight-correction-panel"
            className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#18181B] border-2 border-emerald-500/40 shadow-md space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#DDEFB5] dark:bg-[#14532D] text-emerald-900 dark:text-[#86EFAC] flex items-center justify-center border border-emerald-600/20">
                  <Scale className="w-4 h-4 text-emerald-800 dark:text-[#86EFAC]" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[#030303] dark:text-[#FAFAFA]">تصحيح الوزن الكلي (ميزان المطبخ)</h4>
                  <p className="text-xs text-[#71717A] dark:text-[#A1A1AA]">
                    أدخل الوزن الفعلي بالجرام لإعادة حساب السعرات والماكروز تلقائيًا
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCorrectingWeight(false)}
                className="text-[#71717A] dark:text-[#A1A1AA] hover:text-[#030303] dark:hover:text-white p-1.5 rounded-lg hover:bg-[#F3F3F5] dark:hover:bg-[#27272A] transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <div className="relative flex-1">
                <input
                  id="manual-weight-input-field"
                  type="number"
                  min="1"
                  max="5000"
                  value={manualWeightInput}
                  onChange={(e) => setManualWeightInput(e.target.value)}
                  placeholder="مثال: 320"
                  className="w-full py-2.5 px-3 rounded-xl bg-[#F8F9FA] dark:bg-[#202024] border border-[#E4E4E7] dark:border-[#27272A] text-[#030303] dark:text-[#FAFAFA] font-mono font-bold text-sm focus:outline-none focus:border-emerald-500 text-left pl-16"
                  autoFocus
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#71717A] dark:text-[#A1A1AA]">
                  جرام (g)
                </span>
              </div>

              <button
                id="apply-manual-weight-button"
                type="button"
                onClick={handleApplyWeightCorrection}
                disabled={!manualWeightInput || parseFloat(manualWeightInput) <= 0 || isSavingCorrection}
                className="py-2.5 px-4 rounded-xl bg-[#030303] dark:bg-[#16A34A] hover:bg-[#27272A] dark:hover:bg-[#15803D] disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer shrink-0 min-h-[42px]"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>تطبيق</span>
              </button>

              <button
                type="button"
                onClick={() => setIsCorrectingWeight(false)}
                className="py-2.5 px-3 rounded-xl bg-[#F3F3F5] dark:bg-[#27272A] hover:bg-[#E4E4E7] dark:hover:bg-[#3F3F46] text-[#71717A] dark:text-[#A1A1AA] font-semibold text-xs transition-colors cursor-pointer shrink-0 min-h-[42px]"
              >
                إلغاء
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notice after successful correction */}
      {weightCorrectionNotice && (
        <div
          id="weight-correction-notice-banner"
          className="p-3 rounded-2xl bg-[#DDEFB5]/60 dark:bg-[#14532D]/40 border border-[#C5E193] dark:border-emerald-700/40 text-[#14532D] dark:text-[#86EFAC] text-xs flex items-center justify-between animate-fade-in"
        >
          <span className="flex items-center gap-1.5 font-semibold">
            <Check className="w-4 h-4 text-emerald-700 dark:text-[#86EFAC] shrink-0" />
            <span>{weightCorrectionNotice}</span>
          </span>
          <button
            onClick={() => setWeightCorrectionNotice(null)}
            className="text-emerald-800 dark:text-[#86EFAC] hover:text-emerald-950 dark:hover:text-white text-xs px-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Manual Nutrition Override Editor Modal */}
      <AnimatePresence>
        {isEditingNutrition && (
          <motion.div
            key="nutrition-modal"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            id="nutrition-override-panel"
            className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#18181B] border-2 border-emerald-500/40 shadow-md space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#DDEFB5] dark:bg-[#14532D] text-emerald-900 dark:text-[#86EFAC] flex items-center justify-center border border-emerald-600/20">
                  <Edit3 className="w-4 h-4 text-emerald-800 dark:text-[#86EFAC]" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[#030303] dark:text-[#FAFAFA]">تعديل القيم الغذائية يدويًا</h4>
                  <p className="text-xs text-[#71717A] dark:text-[#A1A1AA]">
                    تعديل مستقل لكل عنصر غذائي دون تغيير باقي القيم
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingNutrition(false)}
                className="text-[#71717A] dark:text-[#A1A1AA] hover:text-[#030303] dark:hover:text-white p-1.5 rounded-lg hover:bg-[#F3F3F5] dark:hover:bg-[#27272A] transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <div className="bg-[#F8F9FA] dark:bg-[#202024] p-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A]">
                <label className="text-[11px] font-bold text-amber-700 dark:text-amber-400 block mb-1">
                  السعرات (kcal)
                </label>
                <input
                  id="override-kcal-input"
                  type="number"
                  min="0"
                  max="10000"
                  step="1"
                  value={manualKcalInput}
                  onChange={(e) => setManualKcalInput(e.target.value)}
                  className="w-full bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg py-1.5 px-2 text-xs font-mono font-bold text-[#030303] dark:text-[#FAFAFA] text-center focus:outline-none focus:border-amber-500"
                  dir="ltr"
                />
              </div>

              <div className="bg-[#F8F9FA] dark:bg-[#202024] p-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A]">
                <label className="text-[11px] font-bold text-rose-700 dark:text-rose-400 block mb-1">
                  بروتين (g)
                </label>
                <input
                  id="override-protein-input"
                  type="number"
                  min="0"
                  max="1000"
                  step="0.1"
                  value={manualProteinInput}
                  onChange={(e) => setManualProteinInput(e.target.value)}
                  className="w-full bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg py-1.5 px-2 text-xs font-mono font-bold text-[#030303] dark:text-[#FAFAFA] text-center focus:outline-none focus:border-rose-500"
                  dir="ltr"
                />
              </div>

              <div className="bg-[#F8F9FA] dark:bg-[#202024] p-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A]">
                <label className="text-[11px] font-bold text-amber-700 dark:text-amber-400 block mb-1">
                  كربوهيدرات (g)
                </label>
                <input
                  id="override-carbs-input"
                  type="number"
                  min="0"
                  max="1000"
                  step="0.1"
                  value={manualCarbsInput}
                  onChange={(e) => setManualCarbsInput(e.target.value)}
                  className="w-full bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg py-1.5 px-2 text-xs font-mono font-bold text-[#030303] dark:text-[#FAFAFA] text-center focus:outline-none focus:border-amber-500"
                  dir="ltr"
                />
              </div>

              <div className="bg-[#F8F9FA] dark:bg-[#202024] p-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A]">
                <label className="text-[11px] font-bold text-blue-700 dark:text-blue-400 block mb-1">
                  دهون (g)
                </label>
                <input
                  id="override-fat-input"
                  type="number"
                  min="0"
                  max="1000"
                  step="0.1"
                  value={manualFatInput}
                  onChange={(e) => setManualFatInput(e.target.value)}
                  className="w-full bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg py-1.5 px-2 text-xs font-mono font-bold text-[#030303] dark:text-[#FAFAFA] text-center focus:outline-none focus:border-blue-500"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                id="save-nutrition-override-button"
                type="button"
                onClick={handleSaveNutritionCorrection}
                disabled={isSavingNutrition}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#030303] dark:bg-[#16A34A] hover:bg-[#27272A] dark:hover:bg-[#15803D] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer disabled:opacity-50 min-h-[40px]"
              >
                {isSavingNutrition ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>حفظ القيم المخصصة</span>
              </button>

              <button
                type="button"
                onClick={() => setIsEditingNutrition(false)}
                className="py-2.5 px-4 rounded-xl bg-[#F3F3F5] dark:bg-[#27272A] hover:bg-[#E4E4E7] dark:hover:bg-[#3F3F46] text-[#71717A] dark:text-[#A1A1AA] text-xs font-semibold border border-[#E4E4E7] dark:border-[#27272A] transition-all cursor-pointer min-h-[40px]"
              >
                إلغاء
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notice after successful nutrition override */}
      {nutritionCorrectionNotice && (
        <div
          id="nutrition-correction-notice-banner"
          className="p-3 rounded-2xl bg-[#DDEFB5]/60 dark:bg-[#14532D]/40 border border-[#C5E193] dark:border-emerald-700/40 text-[#14532D] dark:text-[#86EFAC] text-xs flex items-center justify-between animate-fade-in"
        >
          <span className="flex items-center gap-1.5 font-semibold">
            <Check className="w-4 h-4 text-emerald-700 dark:text-[#86EFAC] shrink-0" />
            <span>{nutritionCorrectionNotice}</span>
          </span>
          <button
            onClick={() => setNutritionCorrectionNotice(null)}
            className="text-emerald-800 dark:text-[#86EFAC] hover:text-emerald-950 dark:hover:text-white text-xs px-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Meal Category Selector (Breakfast / Lunch / Dinner / Snack) */}
      {!isLogged && (
        <div className="bg-white dark:bg-[#18181B] rounded-3xl p-4 sm:p-5 border border-[#E4E4E7] dark:border-[#27272A] shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-bold text-[#030303] dark:text-[#FAFAFA]">
              اختر وقت الوجبة لتسجيلها في اليوم:
            </span>
            <span className="text-[11px] font-bold text-[#14532D] dark:text-[#86EFAC] bg-[#DDEFB5] dark:bg-[#14532D] px-2.5 py-0.5 rounded-full border border-emerald-600/20 dark:border-emerald-600/40">
              {selectedMealType === "breakfast" ? "فطار" : selectedMealType === "lunch" ? "غداء" : selectedMealType === "dinner" ? "عشاء" : "سناك"}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {(
              [
                { type: "breakfast", label: "فطار", icon: "🍳" },
                { type: "lunch", label: "غداء", icon: "🥗" },
                { type: "dinner", label: "عشاء", icon: "🍲" },
                { type: "snack", label: "سناك", icon: "🍎" },
              ] as const
            ).map((cat) => (
              <button
                key={cat.type}
                type="button"
                onClick={() => setSelectedMealType(cat.type)}
                className={`py-2.5 px-2 rounded-2xl text-xs font-bold border flex flex-col items-center gap-1 transition-all cursor-pointer min-h-[48px] ${
                  selectedMealType === cat.type
                    ? "bg-[#DDEFB5] dark:bg-[#14532D] text-[#030303] dark:text-[#86EFAC] border-emerald-600/30 dark:border-emerald-600 shadow-xs font-extrabold scale-[1.02]"
                    : "bg-[#F8F9FA] dark:bg-[#202024] text-[#71717A] dark:text-[#A1A1AA] border-[#E4E4E7] dark:border-[#27272A] hover:bg-[#F3F3F5] dark:hover:bg-[#27272A] hover:text-[#030303] dark:hover:text-white"
                }`}
              >
                <span className="text-lg">{cat.icon}</span>
                <span className="text-xs">{cat.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* SCREEN 2: Bottom Action Buttons & Feedback */}
      <div className="space-y-2.5 pt-1">
        {/* Error notice if save failed */}
        {saveErrorMessage && (
          <div
            id="save-log-error-banner"
            className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-950 dark:text-rose-200 text-xs sm:text-sm flex flex-col gap-2.5 shadow-xs animate-fade-in"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold block text-rose-900 dark:text-rose-200 text-sm">
                  تعذر الحفظ في السجل السحابي
                </span>
                <p className="mt-0.5 text-rose-800 dark:text-rose-300 leading-relaxed text-xs sm:text-sm">
                  {saveErrorMessage}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSaveErrorMessage(null)}
                className="text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-200 font-bold px-1.5 py-0.5 rounded cursor-pointer"
                title="إغلاق"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-rose-200/60 dark:border-rose-900/40">
              <button
                type="button"
                onClick={handleAddToDailyLog}
                disabled={isSavingToLog}
                className="py-1.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>إعادة المحاولة الآن</span>
              </button>
              <button
                type="button"
                onClick={handleSaveLocallyFallback}
                className="py-1.5 px-3 rounded-xl bg-white dark:bg-[#18181B] hover:bg-rose-100/50 dark:hover:bg-[#27272A] text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800 font-semibold text-xs transition-colors cursor-pointer"
              >
                <span>حفظ محلياً على الجهاز فوراً</span>
              </button>
            </div>
          </div>
        )}

        {!isLogged ? (
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Primary Dark Button: Save to Log */}
            <button
              id="add-to-daily-log-button"
              type="button"
              disabled={isSavingToLog}
              onClick={handleAddToDailyLog}
              className={`btn-hover flex-1 py-4 px-6 rounded-2xl bg-[#030303] dark:bg-[#16A34A] hover:bg-[#27272A] dark:hover:bg-[#15803D] text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-md shadow-black/10 transition-all active:scale-[0.98] cursor-pointer min-h-[50px] ${
                isSavingToLog ? "opacity-75 cursor-not-allowed" : ""
              }`}
            >
              {isSavingToLog ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>جاري الحفظ إلى السجل...</span>
                </>
              ) : (
                <>
                  <CalendarPlus className="w-5 h-5 text-white" />
                  <span>حفظ إلى السجل (Save to Log)</span>
                </>
              )}
            </button>

            {/* Secondary Button: Weight Correction / Edit */}
            <button
              id="correct-total-weight-button"
              type="button"
              onClick={handleOpenWeightCorrection}
              className="btn-hover py-4 px-5 rounded-2xl bg-white dark:bg-[#18181B] hover:bg-[#F3F3F5] dark:hover:bg-[#27272A] text-[#030303] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#27272A] font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer min-h-[50px] shadow-xs"
            >
              <Scale className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <span>تصحيح الوزن</span>
            </button>
          </div>
        ) : (
          <div className="py-2 space-y-3 animate-fade-in">
            <div className="bg-[#DDEFB5] dark:bg-[#14532D]/40 border border-[#C5E193] dark:border-emerald-700/40 rounded-2xl p-4 flex items-center gap-3 text-[#14532D] dark:text-[#86EFAC] shadow-xs">
              <CalendarCheck className="w-6 h-6 text-emerald-800 dark:text-emerald-400 shrink-0" />
              <div className="text-xs sm:text-sm">
                <span className="font-bold block text-[#030303] dark:text-[#FAFAFA] text-sm sm:text-base">
                  تمت إضافة الوجبة إلى سجل اليوم بنجاح!
                </span>
                <span className="text-[#14532D] dark:text-[#86EFAC] font-medium">
                  تم قيد {totalCalories} kcal و {totalProtein}g بروتين ضمن وجبة ({selectedMealType === "breakfast" ? "الفطور" : selectedMealType === "lunch" ? "الغداء" : selectedMealType === "dinner" ? "العشاء" : "السناك"}).
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {onViewDailyLog && (
                <button
                  id="view-today-log-button"
                  type="button"
                  onClick={onViewDailyLog}
                  className="btn-hover flex-1 py-3.5 px-4 rounded-2xl bg-[#030303] dark:bg-[#16A34A] hover:bg-[#27272A] dark:hover:bg-[#15803D] text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98] cursor-pointer min-h-[48px]"
                >
                  <Target className="w-4 h-4 text-white" />
                  <span>عرض سجل اليوم والمتبقي</span>
                </button>
              )}

              <button
                id="scan-another-after-log-button"
                type="button"
                onClick={onScanAnother}
                className="btn-hover flex-1 py-3.5 px-4 rounded-2xl bg-white dark:bg-[#18181B] hover:bg-[#F3F3F5] dark:hover:bg-[#27272A] text-[#030303] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#27272A] font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer min-h-[48px]"
              >
                <RotateCcw className="w-4 h-4 text-[#71717A] dark:text-[#A1A1AA]" />
                <span>مسح وجبة أخرى</span>
              </button>
            </div>
          </div>
        )}

        {/* Additional fine-tuning actions */}
        {!isLogged && (
          <div className="flex items-center justify-between text-xs pt-1 px-1">
            <button
              type="button"
              onClick={handleOpenNutritionCorrection}
              className="text-emerald-800 dark:text-emerald-400 hover:text-emerald-950 dark:hover:text-emerald-300 font-bold flex items-center gap-1 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>تعديل الماكروز يدويًا</span>
            </button>

            <button
              type="button"
              onClick={onScanAnother}
              className="text-[#71717A] dark:text-[#A1A1AA] hover:text-[#030303] dark:hover:text-white font-semibold flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>إلغاء والتقاط صورة أخرى</span>
            </button>
          </div>
        )}
      </div>

      {/* Identified Food Items Section (Collapsible Breakdown) */}
      <div className="bg-white dark:bg-[#18181B] rounded-3xl p-4 sm:p-5 border border-[#E4E4E7] dark:border-[#27272A] shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowComponentsBreakdown(!showComponentsBreakdown)}
            className="flex items-center gap-2 text-sm sm:text-base font-bold text-[#030303] dark:text-[#FAFAFA] cursor-pointer"
          >
            <Utensils className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <span>تفاصيل المكونات الغذائية ({foods.length})</span>
            {showComponentsBreakdown ? (
              <ChevronUp className="w-4 h-4 text-[#71717A] dark:text-[#A1A1AA]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[#71717A] dark:text-[#A1A1AA]" />
            )}
          </button>

          {/* Action Buttons for Breakdown Section */}
          {!isEditing ? (
            <button
              id="toggle-edit-portions-button"
              type="button"
              onClick={() => setIsEditing(true)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer min-h-[32px] bg-[#F3F3F5] dark:bg-[#27272A] hover:bg-[#E4E4E7] dark:hover:bg-[#3F3F46] text-[#030303] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#27272A]"
            >
              <Sliders className="w-3.5 h-3.5 text-[#71717A] dark:text-[#A1A1AA]" />
              <span>تعديل الحصص</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  handleResetToOriginal();
                  setIsEditing(false);
                }}
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer bg-[#F3F3F5] dark:bg-[#27272A] hover:bg-[#E4E4E7] dark:hover:bg-[#3F3F46] text-[#71717A] dark:text-[#A1A1AA] border border-[#E4E4E7] dark:border-[#27272A]"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>إلغاء</span>
              </button>
              <button
                id="save-portions-button"
                type="button"
                onClick={async () => {
                  await handleSaveAllPortions();
                  setIsEditing(false);
                }}
                disabled={isSavingPortions}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer min-h-[34px] bg-[#16A34A] hover:bg-[#15803D] text-white shadow-xs"
              >
                {isSavingPortions ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>جاري الحفظ...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>حفظ التعديلات</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {portionsSaveNotice && (
          <div className="p-2.5 rounded-xl bg-[#DDEFB5] dark:bg-[#14532D]/40 border border-[#C5E193] dark:border-emerald-700/40 text-[#14532D] dark:text-[#86EFAC] text-xs font-bold flex items-center gap-2 animate-fadeIn">
            <Check className="w-4 h-4 text-[#16A34A] stroke-[2.5]" />
            <span>{portionsSaveNotice}</span>
          </div>
        )}

        <AnimatePresence>
          {showComponentsBreakdown && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden space-y-3 pt-1"
            >
              {foods.map((item) => (
                <FoodItemCard
                  key={item.id}
                  item={item}
                  isEditing={isEditing}
                  onGramChange={handleGramChange}
                  onItemNameChange={handleItemNameChange}
                  onToggleCookingOil={handleToggleCookingOil}
                  onUpdateItem={handleUpdateFoodItem}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
