import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Flame,
  Plus,
  Trash2,
  Clock,
  Target,
  ChevronDown,
  ChevronUp,
  Edit3,
  Check,
  Sparkles,
  Camera,
  PenTool,
  Utensils,
} from "lucide-react";
import { LoggedMeal, MealType, UserDailyGoal, DetectedFood, NutritionLogRecord } from "../types";
import {
  getTodayDateString,
  getLocalDateBoundaries,
  formatFriendlyDate,
  formatDayAndMonth,
  shiftDateString,
  extractLocalDateString,
  getMealsForDate,
  deleteMeal,
  updateMeal,
  getDailyTotals,
  getUserGoal,
  syncLocalStorageWithFirestoreMeals,
} from "../utils/dailyStorage";
import {
  recalculateFoodItemNutrition,
  recalculateFoodItemWithExactNutrients,
  aggregateMealNutrients,
  convertNutritionLogToMeal,
} from "../utils/nutritionCalculations";
import {
  syncMealComponentUpdate,
  subscribeToUserNutritionLogsForDate,
  deleteNutritionLogFromFirestore,
  syncPendingLocalMealsToFirestore,
} from "../services/firestoreService";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { FrequentMealsRow } from "./FrequentMealsRow";
import { MealImage } from "./MealImage";
import { upsertKnownMealCorrection } from "../services/knownMealsService";
import { Timestamp } from "firebase/firestore";

const ComponentWeightModal = React.lazy(() =>
  import("./ComponentWeightModal").then((m) => ({ default: m.ComponentWeightModal }))
);

interface HomeScreenProps {
  onScanNewMeal: () => void;
  onOpenManualModal?: () => void;
  onOpenGoalSettings: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onScanNewMeal,
  onOpenManualModal,
  onOpenGoalSettings,
}) => {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());
  const isToday = selectedDate === getTodayDateString();
  const [meals, setMeals] = useState<LoggedMeal[]>(() => getMealsForDate(getTodayDateString()));
  const [isInitialSyncing, setIsInitialSyncing] = useState<boolean>(true);
  const [goal, setGoal] = useState<UserDailyGoal>(getUserGoal());
  const [expandedMealId, setExpandedMealId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingComponent, setEditingComponent] = useState<{
    meal: LoggedMeal;
    item: DetectedFood;
    index: number;
  } | null>(null);
  const [isSavingComponent, setIsSavingComponent] = useState<boolean>(false);
  const [componentSuccessNotice, setComponentSuccessNotice] = useState<string | null>(null);

  // Load meals and goal for the active date
  const refreshData = () => {
    setMeals(getMealsForDate(selectedDate));
    setGoal(getUserGoal());
  };

  useEffect(() => {
    refreshData();
    setIsInitialSyncing(true);

    // Listen for storage events across app
    const handleMealsUpdated = () => refreshData();
    const handleGoalUpdated = () => setGoal(getUserGoal());

    window.addEventListener("calorielens_meals_updated", handleMealsUpdated);
    window.addEventListener("calorielens_goal_updated", handleGoalUpdated);

    return () => {
      window.removeEventListener("calorielens_meals_updated", handleMealsUpdated);
      window.removeEventListener("calorielens_goal_updated", handleGoalUpdated);
    };
  }, [selectedDate]);

  // Real-time Firestore synchronization for the logged-in user
  useEffect(() => {
    if (!user) return;

    const unsubscribe = subscribeToUserNutritionLogsForDate(
      user.uid,
      selectedDate,
      (firestoreLogs: NutritionLogRecord[]) => {
        const { startTimestampMs, endTimestampMs } = getLocalDateBoundaries(selectedDate);
        const matchedFirestoreMeals: LoggedMeal[] = [];
        const seenDocIds = new Set<string>();

        firestoreLogs.forEach((log) => {
          if (!log.id || seenDocIds.has(log.id)) return;
          seenDocIds.add(log.id);

          const rawTime = log.createdAt
            ? (log.createdAt instanceof Timestamp
                ? log.createdAt.toMillis()
                : log.createdAt.seconds
                ? log.createdAt.seconds * 1000
                : typeof log.createdAt === "number"
                ? log.createdAt
                : new Date(log.createdAt).getTime())
            : null;

          const logDateStr = extractLocalDateString({
            date: log.date,
            createdAt: log.createdAt,
          });

          // Strict boundary check: timestamp MUST fall within the local date range
          // [local midnight 00:00:00.000 to local 23:59:59.999]
          const isInRange =
            rawTime !== null && !isNaN(rawTime)
              ? rawTime >= startTimestampMs && rawTime <= endTimestampMs
              : logDateStr === selectedDate;

          if (isInRange) {
            matchedFirestoreMeals.push(convertNutritionLogToMeal(log, selectedDate));
          }
        });

        // Preserve any pending local meals that have not yet reached Firestore
        const currentLocalMeals = getMealsForDate(selectedDate);
        const localPending = currentLocalMeals.filter(
          (lm) =>
            !lm.firestoreDocId &&
            !matchedFirestoreMeals.some((fm) => fm.id === lm.id || (fm.title === lm.title && Math.abs(fm.timestamp - lm.timestamp) < 20000))
        );

        const mergedMeals = [...matchedFirestoreMeals, ...localPending];
        setMeals(mergedMeals);
        setIsInitialSyncing(false);
        syncLocalStorageWithFirestoreMeals(selectedDate, matchedFirestoreMeals);

        // Run background sync for unsynced local meals
        if (localPending.length > 0) {
          syncPendingLocalMealsToFirestore(user.uid).catch((err) =>
            console.warn("Background sync error in HomeScreen:", err)
          );
        }
      },
      (error) => {
        console.warn("Firestore subscription error in HomeScreen:", error);
        setIsInitialSyncing(false);
      }
    );

    return () => unsubscribe();
  }, [user, selectedDate]);

  // Navigate dates with daylight-saving safe date shifting
  const handleShiftDate = (days: number) => {
    setSelectedDate((prev) => shiftDateString(prev, days));
  };

  const handleResetToToday = () => {
    setSelectedDate(getTodayDateString());
  };

  // Re-sync with current local date on visibility change (e.g. if tab is left open past midnight)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const currentToday = getTodayDateString();
        if (isToday) {
          setSelectedDate(currentToday);
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isToday]);

  const handleDelete = async (id: string) => {
    const mealToDelete = meals.find((m) => m.id === id || m.firestoreDocId === id);
    if (mealToDelete?.firestoreDocId) {
      try {
        await deleteNutritionLogFromFirestore(mealToDelete.firestoreDocId);
      } catch (err) {
        console.error("Failed to delete Firestore document:", err);
      }
    }
    deleteMeal(id);
    setMeals((prev) => prev.filter((m) => m.id !== id && m.firestoreDocId !== id));
    setDeletingId(null);
  };

  const handleSaveComponentWeight = async (
    valuesOrWeight: { weight_g: number; calories: number; protein_g: number; carbs_g: number; fat_g: number } | number
  ) => {
    if (!editingComponent) return;
    const { meal, item, index } = editingComponent;

    const updatedItem =
      typeof valuesOrWeight === "number"
        ? recalculateFoodItemNutrition(item, valuesOrWeight)
        : recalculateFoodItemWithExactNutrients(item, valuesOrWeight);

    const updatedItems = [...meal.items];
    updatedItems[index] = updatedItem;

    const totals = aggregateMealNutrients(updatedItems);

    const updatedMeal: LoggedMeal = {
      ...meal,
      items: updatedItems,
      calories: totals.calories,
      protein_g: totals.protein_g,
      carbs_g: totals.carbs_g,
      fat_g: totals.fat_g,
      wasEdited: true,
      is_manually_corrected: true,
    };

    // Update UI and local persistence immediately
    setMeals((prev) => prev.map((m) => (m.id === meal.id ? updatedMeal : m)));
    updateMeal(updatedMeal);

    setIsSavingComponent(true);
    try {
      const syncedDocId = await syncMealComponentUpdate(meal, updatedItems, {
        calories: totals.calories,
        protein: totals.protein_g,
        carbs: totals.carbs_g,
        fat: totals.fat_g,
        weight: totals.weight_g,
      });
      if (syncedDocId) {
        updatedMeal.firestoreDocId = syncedDocId;
        updateMeal(updatedMeal);
        setMeals((prev) => prev.map((m) => (m.id === meal.id ? updatedMeal : m)));
      }

      // Learn user correction in Meal Memory (knownMeals)
      if (user?.uid) {
        upsertKnownMealCorrection(user.uid, meal.title, updatedItems, {
          calories: totals.calories,
          protein: totals.protein_g,
          carbs: totals.carbs_g,
          fat: totals.fat_g,
          weight: totals.weight_g,
        }).catch((err) => console.warn("Failed to learn known meal:", err));
      }

      setComponentSuccessNotice(
        `تم تحديث بيانات ومكون "${item.item_name}" (${updatedItem.weight_g}g, ${updatedItem.calories} kcal) بنجاح وحفظها سحابياً.`
      );
      setTimeout(() => setComponentSuccessNotice(null), 3500);
    } catch (err) {
      console.error("Firestore sync error for component update:", err);
      setComponentSuccessNotice(
        "تنبيه: تم تحديث المكون محلياً ولكن تعذر حفظ التعديل في Firestore."
      );
      setTimeout(() => setComponentSuccessNotice(null), 4000);
    } finally {
      setIsSavingComponent(false);
      setEditingComponent(null);
    }
  };

  const totals = getDailyTotals(meals);

  // Calories Progress & Budget
  const targetCalories = goal.targetCalories || 2000;
  const caloriesPct = targetCalories > 0 ? Math.round((totals.calories / targetCalories) * 100) : 0;
  const remainingCalories = targetCalories - totals.calories;
  const isOverGoal = totals.calories > targetCalories;

  const [isKcalFlash, setIsKcalFlash] = useState<boolean>(false);
  const prevCaloriesRef = useRef(totals.calories);

  useEffect(() => {
    if (totals.calories !== prevCaloriesRef.current) {
      prevCaloriesRef.current = totals.calories;
      setIsKcalFlash(true);
      const timer = setTimeout(() => setIsKcalFlash(false), 700);
      return () => clearTimeout(timer);
    }
  }, [totals.calories]);

  // Extract all logged food items for the today summary pill row
  const todayFoodItems = useMemo(() => {
    const list: {
      id: string;
      name: string;
      calories: number;
      icon: string;
      color: string;
      mealTitle: string;
    }[] = [];

    meals.forEach((meal) => {
      if (meal.items && meal.items.length > 0) {
        meal.items.forEach((item, idx) => {
          let icon = "🥗";
          let color = "#10B981"; // emerald
          if (item.category === "meat_poultry_fish") {
            icon = "🍗";
            color = "#F43F5E";
          } else if (item.category === "starch_grain") {
            icon = "🍞";
            color = "#F59E0B";
          } else if (item.category === "fruit") {
            icon = "🍎";
            color = "#A855F7";
          } else if (item.category === "dairy") {
            icon = "🧀";
            color = "#0284C7";
          } else if (item.category === "vegetable") {
            icon = "🥑";
            color = "#10B981";
          } else if (item.category === "snack_bar") {
            icon = "🍫";
            color = "#EA580C";
          } else if (item.category === "fat_oil") {
            icon = "🫒";
            color = "#D97706";
          } else if (item.category === "beverage") {
            icon = "🥤";
            color = "#06B6D4";
          }

          list.push({
            id: `${meal.id}-${idx}`,
            name: item.item_name,
            calories: Math.round(item.calories),
            icon,
            color,
            mealTitle: meal.title,
          });
        });
      } else {
        list.push({
          id: meal.id,
          name: meal.title || "وجبة",
          calories: Math.round(meal.calories),
          icon: "🍽️",
          color: "#10B981",
          mealTitle: meal.title,
        });
      }
    });

    return list;
  }, [meals]);

  // Group meals by category (breakfast, lunch, dinner, snack)
  const mealSlotsConfig: {
    type: MealType;
    label: string;
    range: string;
    icon: string;
  }[] = [
    {
      type: "breakfast",
      label: "الفطار",
      range: "350 - 550 kcal",
      icon: "🍳",
    },
    {
      type: "lunch",
      label: "الغداء",
      range: "600 - 850 kcal",
      icon: "🥗",
    },
    {
      type: "dinner",
      label: "العشاء",
      range: "450 - 650 kcal",
      icon: "🍲",
    },
    {
      type: "snack",
      label: "وجبات خفيفة",
      range: "150 - 300 kcal",
      icon: "🍎",
    },
  ];

  const categorizedMeals: Record<MealType, LoggedMeal[]> = {
    breakfast: meals.filter((m) => m.mealType === "breakfast"),
    lunch: meals.filter((m) => m.mealType === "lunch"),
    dinner: meals.filter((m) => m.mealType === "dinner"),
    snack: meals.filter((m) => m.mealType === "snack"),
  };

  return (
    <div
      id="daily-dashboard-screen"
      className="flex-1 flex flex-col p-3.5 sm:p-6 lg:p-8 max-w-5xl mx-auto w-full space-y-4 sm:space-y-5 pb-28 text-[#030303] dark:text-[#F4F4F5] transition-colors duration-200"
      dir="rtl"
    >
      {/* 1. FIRST ELEMENT AT THE VERY TOP: Large Rounded Total Calories Card with Prominent Circular Progress Ring */}
      <div
        id="total-calories-summary-card"
        className="bg-[#DDEFB5] dark:bg-[#143320] rounded-3xl p-5 sm:p-7 border border-[#C5E193] dark:border-emerald-800/50 shadow-xs relative overflow-hidden card-hover"
      >
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          {/* Main Info Side */}
          <div className="space-y-2 text-center sm:text-right flex-1 min-w-0">
            <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#14532D] dark:text-[#86EFAC]">
                Total Calories • إجمالي السعرات
              </span>
              <button
                id="quick-edit-goal-btn"
                type="button"
                onClick={onOpenGoalSettings}
                className="text-[11px] font-bold text-[#14532D] dark:text-[#86EFAC] hover:text-black dark:hover:text-white bg-white/80 dark:bg-[#18181B]/80 hover:bg-white dark:hover:bg-[#18181B] px-2.5 py-1 rounded-full transition-all cursor-pointer flex items-center gap-1 shadow-2xs border border-emerald-600/10 dark:border-emerald-600/30"
              >
                <Target className="w-3 h-3 text-emerald-800 dark:text-emerald-400" />
                <span>تعديل الهدف</span>
              </button>
            </div>

            <p className="text-xs sm:text-sm text-[#166534] dark:text-[#A7F3D0] font-medium leading-relaxed">
              متابعة السعرات والماكروز اليومية بدقة مع السجل السحابي
            </p>

            {/* Quick Metrics Badges */}
            <div className="pt-2 flex items-center justify-center sm:justify-start gap-2 sm:gap-3 flex-wrap text-xs">
              <div className="bg-white/85 dark:bg-[#18181B]/90 backdrop-blur-xs px-3 py-1.5 rounded-xl border border-white/70 dark:border-[#27272A] shadow-2xs">
                <span className="text-[#71717A] dark:text-[#A1A1AA] text-[11px]">الهدف: </span>
                <span className="font-bold text-[#030303] dark:text-[#FAFAFA] font-mono">{targetCalories.toLocaleString()} kcal</span>
              </div>

              <div className="bg-white/85 dark:bg-[#18181B]/90 backdrop-blur-xs px-3 py-1.5 rounded-xl border border-white/70 dark:border-[#27272A] shadow-2xs">
                {remainingCalories >= 0 ? (
                  <>
                    <span className="text-[#71717A] dark:text-[#A1A1AA] text-[11px]">المتبقي: </span>
                    <span className="font-bold text-[#15803D] dark:text-[#4ADE80] font-mono">{remainingCalories.toLocaleString()} kcal</span>
                  </>
                ) : (
                  <>
                    <span className="text-rose-600 dark:text-rose-400 text-[11px]">تجاوزت الهدف: </span>
                    <span className="font-bold text-rose-700 dark:text-rose-300 font-mono">+{Math.abs(remainingCalories).toLocaleString()} kcal</span>
                  </>
                )}
              </div>

              <div className="bg-white/85 dark:bg-[#18181B]/90 backdrop-blur-xs px-3 py-1.5 rounded-xl border border-white/70 dark:border-[#27272A] shadow-2xs">
                <span className="text-[#71717A] dark:text-[#A1A1AA] text-[11px]">الوجبات: </span>
                <span className="font-bold text-[#030303] dark:text-[#FAFAFA] font-mono">{totals.mealCount}</span>
              </div>
            </div>
          </div>

          {/* Prominent Circular Progress Ring: Total Calories in the Center */}
          <div className="relative shrink-0 flex items-center justify-center">
            <div className="relative w-36 h-36 sm:w-44 sm:h-44 flex items-center justify-center bg-white/95 dark:bg-[#121215] rounded-full shadow-md border-2 border-white/80 dark:border-emerald-900/40 p-2">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
                {/* Background Ring Track */}
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill="transparent"
                  stroke={isDark ? "#1F482B" : "#C5E193"}
                  strokeWidth="8"
                  opacity="0.65"
                />
                {/* Progress Ring Stroke in App's Green Accent Color */}
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill="transparent"
                  stroke={isOverGoal ? "#E11D48" : "#16A34A"}
                  strokeWidth="8"
                  strokeDasharray={2 * Math.PI * 50}
                  strokeDashoffset={
                    2 * Math.PI * 50 -
                    (Math.min(100, Math.max(0, caloriesPct)) / 100) * (2 * Math.PI * 50)
                  }
                  strokeLinecap="round"
                  className="transition-all duration-700 ease-out"
                />
              </svg>

              {/* Number and Label Displayed Prominently in Center of Ring */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2">
                <div className="flex items-center gap-1 text-amber-500 mb-0.5">
                  <Flame className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                  <span className="text-[11px] font-extrabold text-[#14532D] dark:text-[#86EFAC] font-mono">{caloriesPct}%</span>
                </div>
                <span className={`text-2xl sm:text-3xl font-black font-mono tracking-tight leading-none transition-all duration-300 ${isKcalFlash ? 'text-[#16A34A] scale-110 drop-shadow-md' : 'text-[#030303] dark:text-[#FAFAFA]'}`}>
                  {totals.calories.toLocaleString()}
                </span>
                <span className="text-[11px] sm:text-xs font-bold text-[#14532D] dark:text-[#86EFAC] mt-0.5">
                  سعرة (kcal)
                </span>
                <span className="text-[10px] text-[#71717A] dark:text-[#A1A1AA] mt-0.5 font-medium">
                  من {targetCalories.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Persistent Frequent Meals Quick-Add Row (Meal Memory Cache) */}
      <FrequentMealsRow
        userId={user?.uid || ""}
        onMealLogged={() => setMeals(getMealsForDate(selectedDate))}
      />

      {/* Date Navigation Bar */}
      <div className="bg-white dark:bg-[#18181B] rounded-2xl p-2 sm:p-2.5 border border-[#E4E4E7] dark:border-[#27272A] shadow-xs flex items-center justify-between transition-colors">
        <button
          type="button"
          onClick={() => handleShiftDate(-1)}
          className="p-2 sm:p-2.5 rounded-xl text-[#71717A] dark:text-[#A1A1AA] hover:text-[#030303] dark:hover:text-[#FAFAFA] hover:bg-[#F3F3F5] dark:hover:bg-[#27272A] transition-colors cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center"
          aria-label="اليوم السابق"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 flex-wrap justify-center">
          <Calendar className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
          <span className="text-xs sm:text-sm font-bold text-[#030303] dark:text-[#FAFAFA]">
            {formatFriendlyDate(selectedDate)}
            {isToday && (
              <span className="text-emerald-700 dark:text-emerald-400 font-normal mr-1.5">
                • {formatDayAndMonth(selectedDate)}
              </span>
            )}
          </span>
          <span className="text-[11px] sm:text-xs text-[#71717A] dark:text-[#A1A1AA] font-mono">({selectedDate})</span>
          {!isToday && (
            <button
              type="button"
              onClick={handleResetToToday}
              className="text-[10px] sm:text-xs font-bold text-[#030303] dark:text-[#14532D] bg-[#DDEFB5] hover:bg-[#d0e5a3] px-2.5 py-1 rounded-full border border-emerald-600/20 transition-colors cursor-pointer"
            >
              العودة لليوم
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => handleShiftDate(1)}
          className="p-2 sm:p-2.5 rounded-xl text-[#71717A] dark:text-[#A1A1AA] hover:text-[#030303] dark:hover:text-[#FAFAFA] hover:bg-[#F3F3F5] dark:hover:bg-[#27272A] transition-colors cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center"
          aria-label="اليوم التالي"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>

      {/* Row of Small Food Item Summaries for Today (Pill / Card with Colored Progress Underline) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs sm:text-sm font-bold text-[#030303] dark:text-[#FAFAFA]">
            مكونات وأطعمة اليوم المسجلة ({todayFoodItems.length})
          </span>
          {todayFoodItems.length > 0 && (
            <span className="text-[11px] text-[#71717A] dark:text-[#A1A1AA]">
              ملخص سريع للأطعمة
            </span>
          )}
        </div>

        {/* Loading shimmer skeleton while initial sync is running with no local data yet */}
        {isInitialSyncing && meals.length === 0 ? (
          <div className="flex gap-2.5 overflow-x-auto pb-2 pt-1 no-scrollbar">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="bg-white dark:bg-[#18181B] rounded-2xl p-2.5 px-3 border border-[#E4E4E7] dark:border-[#27272A] shadow-xs flex flex-col justify-between shrink-0 min-w-[140px] max-w-[180px] animate-pulse space-y-2"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#F3F3F5] dark:bg-[#202024]" />
                  <div className="space-y-1 flex-1">
                    <div className="w-16 h-3 bg-[#E4E4E7] dark:bg-[#27272A] rounded-xs" />
                    <div className="w-10 h-2.5 bg-[#E4E4E7] dark:bg-[#27272A] rounded-xs" />
                  </div>
                </div>
                <div className="w-full h-1 bg-[#F3F3F5] dark:bg-[#27272A] rounded-full" />
              </div>
            ))}
          </div>
        ) : todayFoodItems.length === 0 ? (
          <div className="bg-white dark:bg-[#18181B] rounded-2xl p-4 border border-[#E4E4E7] dark:border-[#27272A] text-center shadow-xs flex items-center justify-between gap-3 transition-colors">
            <span className="text-xs text-[#71717A] dark:text-[#A1A1AA]">
              لم يتم تسجيل أي طعام اليوم بعد. ابدأ بمسح وجبتك أو إضافتها يدويًا!
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onScanNewMeal}
                className="text-xs font-bold text-[#030303] dark:text-[#14532D] bg-[#DDEFB5] hover:bg-[#d0e5a3] px-3 py-1.5 rounded-xl border border-emerald-600/20 transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>مسح وجبة</span>
              </button>
              {onOpenManualModal && (
                <button
                  type="button"
                  onClick={onOpenManualModal}
                  className="text-xs font-bold text-[#14532D] dark:text-[#86EFAC] bg-white dark:bg-[#202024] hover:bg-[#F8F9FA] dark:hover:bg-[#27272A] px-2.5 py-1.5 rounded-xl border border-[#DDEFB5] dark:border-emerald-700/40 transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                >
                  <PenTool className="w-3 h-3 text-[#14532D] dark:text-[#86EFAC]" />
                  <span>يدوي</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex gap-2.5 overflow-x-auto pb-2 pt-1 no-scrollbar scroll-smooth">
            {todayFoodItems.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
                className="bg-white dark:bg-[#18181B] rounded-2xl p-2.5 px-3 border border-[#E4E4E7] dark:border-[#27272A] shadow-xs flex flex-col justify-between shrink-0 min-w-[140px] max-w-[180px] relative overflow-hidden card-hover"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base p-1.5 bg-[#F8F9FA] dark:bg-[#202024] rounded-xl border border-[#E4E4E7] dark:border-[#27272A] shrink-0">
                    {item.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-bold text-[#030303] dark:text-[#FAFAFA] block truncate" title={item.name}>
                      {item.name}
                    </span>
                    <span className="text-[11px] font-mono font-bold text-[#14532D] dark:text-[#86EFAC]">
                      {item.calories} kcal
                    </span>
                  </div>
                </div>

                {/* Colored Progress Underline */}
                <div className="w-full h-1 bg-[#F3F3F5] dark:bg-[#27272A] rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      backgroundColor: item.color,
                      width: `${Math.min(100, Math.max(15, (item.calories / (targetCalories || 2000)) * 300))}%`,
                    }}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Component Weight Edit Feedback Banner */}
      {componentSuccessNotice && (
        <div
          id="component-edit-success-banner"
          className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs font-semibold flex items-center gap-2 animate-fade-in shadow-xs"
        >
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{componentSuccessNotice}</span>
        </div>
      )}

      {/* Meal Time Sections (Breakfast, Lunch, Dinner, Snacks) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs sm:text-sm font-bold text-[#030303] dark:text-[#FAFAFA]">
            أوقات الوجبات (Meal Slots)
          </span>
          <span className="text-[11px] text-[#71717A] dark:text-[#A1A1AA]">
            {meals.length} وجبات مسجلة
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
          {mealSlotsConfig.map((slot) => {
            const slotMeals = categorizedMeals[slot.type] || [];
            const slotCalories = slotMeals.reduce((s, m) => s + m.calories, 0);

            return (
              <div
                key={slot.type}
                className="bg-white dark:bg-[#18181B] rounded-3xl p-4 sm:p-5 border border-[#E4E4E7] dark:border-[#27272A] shadow-xs transition-all hover:border-[#DDEFB5] dark:hover:border-emerald-700/50 flex flex-col justify-between space-y-3"
              >
                {/* Header: Name, Range & + Add Button */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl p-2 rounded-2xl bg-[#F8F9FA] dark:bg-[#202024] border border-[#E4E4E7] dark:border-[#27272A] shadow-2xs">
                      {slot.icon}
                    </span>
                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-[#030303] dark:text-[#FAFAFA]">
                        {slot.label}
                      </h3>
                      <span className="text-[10px] sm:text-xs text-[#71717A] dark:text-[#A1A1AA]">
                        {slotCalories > 0
                          ? `${slotCalories.toLocaleString()} kcal مسجلة`
                          : `موصى به: ${slot.range}`}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onScanNewMeal}
                    className="w-8 h-8 rounded-full bg-[#DDEFB5] dark:bg-[#14532D] hover:bg-[#d0e5a3] dark:hover:bg-[#166534] text-[#14532D] dark:text-[#86EFAC] border border-emerald-600/20 dark:border-emerald-500/30 flex items-center justify-center transition-transform active:scale-95 shadow-2xs cursor-pointer"
                    title={`فتح الكاميرا ومسح وجبة لـ ${slot.label}`}
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                  </button>
                </div>

                {/* List of meals logged in this slot if any */}
                {slotMeals.length > 0 ? (
                  <div className="space-y-2 pt-1 border-t border-[#F3F3F5] dark:border-[#27272A]">
                    <AnimatePresence>
                      {slotMeals.map((meal) => {
                        const isExpanded = expandedMealId === meal.id;

                        return (
                          <motion.div
                            key={meal.id}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, height: 0, marginBottom: 0, overflow: "hidden" }}
                            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                            className="bg-[#F8F9FA] dark:bg-[#202024] rounded-2xl p-3 border border-[#E4E4E7] dark:border-[#27272A] space-y-2"
                          >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <MealImage
                                src={meal.imageUrl}
                                alt={meal.title}
                                className="w-full h-full object-cover"
                                containerClassName="w-10 h-10 rounded-xl bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] shrink-0 flex items-center justify-center overflow-hidden"
                                fallbackIconClassName="w-4 h-4 text-[#71717A] dark:text-[#A1A1AA]"
                              />
                              <div className="min-w-0">
                                <span className="text-xs font-bold text-[#030303] dark:text-[#FAFAFA] block truncate">
                                  {meal.title}
                                </span>
                                <span className="text-[10px] text-[#71717A] dark:text-[#A1A1AA] flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-[#71717A] dark:text-[#A1A1AA]" />
                                  <span>{meal.timeStr}</span>
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs font-black font-mono text-[#14532D] dark:text-[#86EFAC] bg-[#DDEFB5] dark:bg-[#14532D]/50 px-2 py-0.5 rounded-lg border border-emerald-600/20 dark:border-emerald-500/30">
                                {meal.calories} kcal
                              </span>

                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedMealId(isExpanded ? null : meal.id)
                                }
                                className="p-1 rounded-lg text-[#71717A] dark:text-[#A1A1AA] hover:text-[#030303] dark:hover:text-white hover:bg-white dark:hover:bg-[#27272A] transition-colors cursor-pointer"
                              >
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Expanded Details & Component Portion Adjustments */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                                className="overflow-hidden space-y-2 pt-2 border-t border-[#E4E4E7] dark:border-[#27272A] text-xs"
                              >
                               <div className="flex items-center justify-between text-[11px] text-[#71717A] dark:text-[#A1A1AA]">
                                 <span>الماكروز: {meal.protein_g}g بروتين • {meal.carbs_g}g كارب • {meal.fat_g}g دهون</span>
                                 {deletingId === meal.id ? (
                                   <div className="flex items-center gap-1">
                                     <button
                                       type="button"
                                       onClick={() => handleDelete(meal.id)}
                                       className="px-2 py-0.5 rounded-md bg-rose-600 text-white font-bold text-[10px] cursor-pointer"
                                     >
                                       تأكيد
                                     </button>
                                     <button
                                       type="button"
                                       onClick={() => setDeletingId(null)}
                                       className="px-1.5 py-0.5 rounded-md bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] text-[#71717A] dark:text-[#A1A1AA] text-[10px] cursor-pointer"
                                     >
                                       إلغاء
                                     </button>
                                   </div>
                                 ) : (
                                   <button
                                     type="button"
                                     onClick={() => setDeletingId(meal.id)}
                                     className="text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 p-1 rounded-md cursor-pointer"
                                     title="حذف الوجبة"
                                   >
                                     <Trash2 className="w-3.5 h-3.5" />
                                   </button>
                                 )}
                               </div>

                               {/* Individual Component Items */}
                               {meal.items && meal.items.length > 0 && (
                                 <div className="space-y-1.5 pt-1">
                                   {meal.items.map((item, idx) => (
                                     <div
                                       key={item.id || idx}
                                       className="flex items-center justify-between bg-white dark:bg-[#18181B] p-2 rounded-xl border border-[#E4E4E7] dark:border-[#27272A]"
                                     >
                                       <div className="min-w-0">
                                         <span className="font-bold text-[#030303] dark:text-[#FAFAFA] block truncate">
                                           {item.item_name}
                                         </span>
                                         <span className="text-[10px] text-[#71717A] dark:text-[#A1A1AA]">
                                           {item.weight_g}g • {item.calories} kcal
                                         </span>
                                       </div>

                                       <button
                                         type="button"
                                         onClick={() =>
                                           setEditingComponent({
                                             meal,
                                             item,
                                             index: idx,
                                           })
                                         }
                                         className="px-2 py-1 rounded-lg bg-[#DDEFB5] dark:bg-[#14532D]/60 hover:bg-[#d0e5a3] dark:hover:bg-[#14532D] text-[#030303] dark:text-[#86EFAC] text-[10px] font-bold border border-emerald-600/20 dark:border-emerald-500/30 flex items-center gap-1 cursor-pointer"
                                       >
                                         <Edit3 className="w-3 h-3 text-emerald-800 dark:text-emerald-400" />
                                         <span>تعديل الوزن</span>
                                       </button>
                                     </div>
                                   ))}
                                 </div>
                               )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                ) : isInitialSyncing && meals.length === 0 ? (
                  <div className="py-2.5 px-3 flex items-center justify-between rounded-2xl bg-[#F8F9FA] dark:bg-[#202024] border border-[#E4E4E7]/60 dark:border-[#27272A]/60 animate-pulse">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-[#E4E4E7] dark:bg-[#27272A]" />
                      <div className="w-24 h-3 bg-[#E4E4E7] dark:bg-[#27272A] rounded-xs" />
                    </div>
                    <div className="w-14 h-4 bg-[#E4E4E7] dark:bg-[#27272A] rounded-xs" />
                  </div>
                ) : (
                  <div className="py-2 text-center text-xs text-[#71717A] dark:text-[#A1A1AA] bg-[#F8F9FA] dark:bg-[#202024]/50 rounded-2xl border border-dashed border-[#E4E4E7] dark:border-[#27272A]">
                    لم يتم تسجيل وجبة في هذا التوقيت
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Component Weight Edit Modal */}
      <React.Suspense fallback={null}>
        <ComponentWeightModal
          isOpen={!!editingComponent}
          item={editingComponent?.item || null}
          mealTitle={editingComponent?.meal.title}
          onClose={() => setEditingComponent(null)}
          onSave={handleSaveComponentWeight}
          isSaving={isSavingComponent}
        />
      </React.Suspense>
    </div>
  );
};
