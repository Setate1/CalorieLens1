import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  Scale,
  MoreVertical,
  Trash2,
  Check,
  X,
  Flame,
  Dumbbell,
  Wheat,
  Droplet,
  Utensils,
  Plus,
  Minus,
} from "lucide-react";
import { KnownMeal, LoggedMeal, MealType } from "../types";
import {
  getTopFrequentMeals,
  deleteKnownMeal,
  recordKnownMealUsage,
} from "../services/knownMealsService";
import { scaleItemsToWeight } from "../utils/mealKey";
import {
  saveMeal,
  getTodayDateString,
  formatCurrentTime,
  suggestMealType,
} from "../utils/dailyStorage";
import { saveNutritionLogToFirestore } from "../services/firestoreService";

interface FrequentMealsRowProps {
  userId: string;
  onMealLogged: () => void;
  refreshTrigger?: number;
}

export const FrequentMealsRow: React.FC<FrequentMealsRowProps> = ({
  userId,
  onMealLogged,
  refreshTrigger = 0,
}) => {
  const [meals, setMeals] = useState<KnownMeal[]>([]);
  const [selectedMealForSheet, setSelectedMealForSheet] =
    useState<KnownMeal | null>(null);
  const [weightInput, setWeightInput] = useState<number>(200);
  const [mealType, setMealType] = useState<MealType>(suggestMealType());
  const [menuOpenMealKey, setMenuOpenMealKey] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Load frequent meals
  useEffect(() => {
    if (!userId) return;
    const top = getTopFrequentMeals(userId, 8);
    setMeals(top);
  }, [userId, refreshTrigger]);

  const reloadFrequentMeals = () => {
    if (!userId) return;
    const top = getTopFrequentMeals(userId, 8);
    setMeals(top);
  };

  const handleOpenSheet = (meal: KnownMeal) => {
    setSelectedMealForSheet(meal);
    setWeightInput(meal.defaultWeightGrams || 200);
    setMealType(suggestMealType());
    setMenuOpenMealKey(null);
  };

  const handleCloseSheet = () => {
    setSelectedMealForSheet(null);
    setIsSaving(false);
  };

  const handleDeleteMeal = async (mealKey: string, title: string) => {
    if (!userId) return;
    try {
      setIsDeleting(true);
      await deleteKnownMeal(userId, mealKey);
      setMenuOpenMealKey(null);
      reloadFrequentMeals();
      setSuccessToast(`تم حذف "${title}" من الوجبات المتكررة.`);
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err) {
      console.error("Failed to delete known meal:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  // Calculate live preview totals for confirmed weight
  const scaledPreview = useMemo(() => {
    if (!selectedMealForSheet) return null;
    const scaledItems = scaleItemsToWeight(
      selectedMealForSheet.items,
      weightInput
    );
    const cal = Math.round(
      scaledItems.reduce((s, it) => s + (Number(it.calories) || 0), 0)
    );
    const p =
      Math.round(
        scaledItems.reduce((s, it) => s + (Number(it.protein_g) || 0), 0) * 10
      ) / 10;
    const c =
      Math.round(
        scaledItems.reduce((s, it) => s + (Number(it.carbs_g) || 0), 0) * 10
      ) / 10;
    const f =
      Math.round(
        scaledItems.reduce((s, it) => s + (Number(it.fat_g) || 0), 0) * 10
      ) / 10;
    return { items: scaledItems, cal, p, c, f };
  }, [selectedMealForSheet, weightInput]);

  const handleConfirmLogMeal = async () => {
    if (!selectedMealForSheet || !scaledPreview) return;
    setIsSaving(true);

    try {
      const today = getTodayDateString();
      const timeStr = formatCurrentTime();
      const mealTitle = selectedMealForSheet.title;
      const targetWeight = Math.max(10, Math.round(weightInput));

      let activeDocId: string | undefined = undefined;

      // 1. Batch Firestore log if authenticated
      if (userId) {
        try {
          const newDocId = await saveNutritionLogToFirestore({
            uid: userId,
            foodName: mealTitle,
            calories: scaledPreview.cal,
            protein: scaledPreview.p,
            carbs: scaledPreview.c,
            fat: scaledPreview.f,
            weight: targetWeight,
            confidence: 99,
            mealType,
            items: scaledPreview.items,
            itemsSummary: scaledPreview.items
              .map((i) => `${i.item_name} (${Math.round(i.calories)} kcal)`)
              .join(", "),
          });
          activeDocId = newDocId;
        } catch (err) {
          console.warn("Could not write frequent meal to Firestore:", err);
        }

        // Batch usage increment
        recordKnownMealUsage(userId, selectedMealForSheet.mealKey).catch(
          (err) => console.warn("Failed to record knownMeal usage:", err)
        );
      }

      // 2. Add to local daily meals
      const newMeal: LoggedMeal = {
        id:
          activeDocId ||
          `meal-quick-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: Date.now(),
        date: today,
        timeStr,
        mealType,
        title: mealTitle,
        calories: scaledPreview.cal,
        protein_g: scaledPreview.p,
        carbs_g: scaledPreview.c,
        fat_g: scaledPreview.f,
        items: scaledPreview.items,
        firestoreDocId: activeDocId,
        wasEdited: false,
      };

      saveMeal(newMeal);
      onMealLogged();
      reloadFrequentMeals();

      setSuccessToast(
        `تم تسجيل "${mealTitle}" (${targetWeight}g - ${scaledPreview.cal} kcal) بنجاح!`
      );
      setTimeout(() => setSuccessToast(null), 3500);

      handleCloseSheet();
    } catch (err) {
      console.error("Error logging frequent meal:", err);
    } finally {
      setIsSaving(false);
    }
  };

  if (meals.length === 0) {
    return null;
  }

  return (
    <div className="w-full my-3" dir="rtl">
      {/* Toast Notice */}
      <AnimatePresence>
        {successToast && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            className="mb-3 p-3 rounded-2xl bg-[#DDEFB5] dark:bg-[#14532D]/40 border border-[#C5E193] dark:border-emerald-700/40 text-[#14532D] dark:text-[#86EFAC] text-xs sm:text-sm font-bold flex items-center justify-between shadow-xs"
          >
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-[#16A34A] shrink-0" />
              <span>{successToast}</span>
            </div>
            <button
              onClick={() => setSuccessToast(null)}
              className="text-[#166534] dark:text-[#86EFAC] hover:text-[#030303] dark:hover:text-white text-xs font-bold px-1.5 py-0.5 cursor-pointer"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Row Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#DDEFB5] dark:bg-[#14532D] text-[#14532D] dark:text-[#86EFAC] flex items-center justify-center font-bold">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#030303] dark:text-[#FAFAFA]">وجبات متكررة</h3>
          </div>
        </div>
        <span className="text-[11px] text-[#71717A] dark:text-[#A1A1AA] bg-white dark:bg-[#18181B] px-2 py-0.5 rounded-full border border-[#E4E4E7] dark:border-[#27272A]">
          تدوين فوري (0 AI)
        </span>
      </div>

      {/* Horizontal Scrollable Meals List */}
      <div className="flex items-center gap-2.5 overflow-x-auto pb-2 scrollbar-none pt-1">
        {meals.map((meal) => {
          const cal = Math.round(meal.itemsSummary?.calories || 0);
          const weight = meal.defaultWeightGrams || 200;
          const isMenuOpen = menuOpenMealKey === meal.mealKey;

          return (
            <div
              key={meal.mealKey}
              className="relative shrink-0 w-[158px] sm:w-[172px] bg-white dark:bg-[#18181B] rounded-2xl border border-[#E4E4E7] dark:border-[#27272A] hover:border-[#C5E193] dark:hover:border-emerald-700/50 shadow-xs p-3 transition-all hover:shadow-sm cursor-pointer group"
              onClick={() => handleOpenSheet(meal)}
            >
              {/* Card Top Actions */}
              <div className="flex items-center justify-between mb-1.5">
                <span className="w-7 h-7 rounded-xl bg-[#F4F4F5] dark:bg-[#202024] text-[#030303] dark:text-[#FAFAFA] flex items-center justify-center text-xs">
                  <Utensils className="w-3.5 h-3.5 text-[#16A34A]" />
                </span>

                <div className="relative">
                  <button
                    type="button"
                    title="خيارات الوجبة"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenMealKey(isMenuOpen ? null : meal.mealKey);
                    }}
                    className="w-6 h-6 rounded-lg text-[#71717A] dark:text-[#A1A1AA] hover:text-[#030303] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>

                  {/* Dropdown Menu */}
                  {isMenuOpen && (
                    <div
                      className="absolute left-0 top-7 z-30 w-36 bg-white dark:bg-[#1C1C20] rounded-xl shadow-lg border border-[#E4E4E7] dark:border-[#27272A] p-1 animate-fade-in text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => handleDeleteMeal(meal.mealKey, meal.title)}
                        disabled={isDeleting}
                        className="w-full text-right px-2.5 py-1.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg flex items-center justify-between font-medium cursor-pointer"
                      >
                        <span>حذف من المتكررة</span>
                        <Trash2 className="w-3 h-3 text-rose-500" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Meal Title */}
              <h4 className="text-xs sm:text-sm font-bold text-[#030303] dark:text-[#FAFAFA] truncate mb-1">
                {meal.title}
              </h4>

              {/* Calories & Weight */}
              <div className="flex items-center justify-between text-xs">
                <span className="font-extrabold text-[#16A34A] dark:text-[#4ADE80]">{cal} kcal</span>
                <span className="text-[11px] text-[#71717A] dark:text-[#A1A1AA] tabular-nums">
                  {weight}g
                </span>
              </div>

              {/* Frequency count indicator */}
              <div className="mt-2 pt-1.5 border-t border-[#F4F4F5] dark:border-[#27272A] flex items-center justify-between text-[10px] text-[#71717A] dark:text-[#A1A1AA]">
                <span>تكرار</span>
                <span className="bg-[#F4F4F5] dark:bg-[#27272A] px-1.5 py-0.5 rounded text-[#030303] dark:text-[#FAFAFA] font-bold">
                  ×{meal.useCount || 1}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Weight Confirmation Sheet Modal */}
      <AnimatePresence>
        {selectedMealForSheet && scaledPreview && (
          <motion.div 
            key="frequent-meal-sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 dark:bg-black/80 backdrop-blur-xs"
          >
            <motion.div
              key="frequent-meal-sheet-card"
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.95 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="bg-white dark:bg-[#18181B] w-full sm:max-w-md rounded-t-[28px] sm:rounded-3xl border border-[#E4E4E7] dark:border-[#27272A] shadow-2xl p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto"
              dir="rtl"
            >
              {/* Sheet Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2.5 py-0.5 rounded-full bg-[#DDEFB5] dark:bg-[#14532D] text-[#14532D] dark:text-[#86EFAC] text-[11px] font-bold">
                      ذاكرة الوجبات
                    </span>
                    <span className="text-xs text-[#71717A] dark:text-[#A1A1AA]">تسجيل فوري</span>
                  </div>
                  <h3 className="text-lg font-bold text-[#030303] dark:text-[#FAFAFA]">
                    {selectedMealForSheet.title}
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={handleCloseSheet}
                  className="w-8 h-8 rounded-full bg-[#F4F4F5] dark:bg-[#27272A] hover:bg-[#E4E4E7] dark:hover:bg-[#3F3F46] text-[#71717A] dark:text-[#A1A1AA] flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Live Macros Preview Box */}
              <div className="bg-[#F8F9FA] dark:bg-[#202024] rounded-2xl p-4 border border-[#E4E4E7] dark:border-[#27272A] grid grid-cols-4 gap-2 text-center">
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-1 text-[11px] text-[#71717A] dark:text-[#A1A1AA] mb-0.5">
                    <Flame className="w-3 h-3 text-[#16A34A]" />
                    <span>سعرات</span>
                  </div>
                  <span className="text-base font-black text-[#030303] dark:text-[#FAFAFA]">
                    {scaledPreview.cal}
                  </span>
                </div>

                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-1 text-[11px] text-[#71717A] dark:text-[#A1A1AA] mb-0.5">
                    <Dumbbell className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                    <span>بروتين</span>
                  </div>
                  <span className="text-base font-bold text-[#030303] dark:text-[#FAFAFA]">
                    {scaledPreview.p}g
                  </span>
                </div>

                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-1 text-[11px] text-[#71717A] dark:text-[#A1A1AA] mb-0.5">
                    <Wheat className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                    <span>كارب</span>
                  </div>
                  <span className="text-base font-bold text-[#030303] dark:text-[#FAFAFA]">
                    {scaledPreview.c}g
                  </span>
                </div>

                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-1 text-[11px] text-[#71717A] dark:text-[#A1A1AA] mb-0.5">
                    <Droplet className="w-3 h-3 text-rose-500 dark:text-rose-400" />
                    <span>دهون</span>
                  </div>
                  <span className="text-base font-bold text-[#030303] dark:text-[#FAFAFA]">
                    {scaledPreview.f}g
                  </span>
                </div>
              </div>

              {/* Weight Adjustment Section */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#030303] dark:text-[#FAFAFA] flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Scale className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                    <span>تأكيد وزن الوجبة (جرام)</span>
                  </span>
                  <span className="text-[11px] text-[#71717A] dark:text-[#A1A1AA]">
                    الافتراضي: {selectedMealForSheet.defaultWeightGrams}g
                  </span>
                </label>

                {/* Main Stepper Input */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setWeightInput((w) => Math.max(10, w - 25))}
                    className="w-11 h-11 rounded-xl bg-[#F4F4F5] dark:bg-[#27272A] hover:bg-[#E4E4E7] dark:hover:bg-[#3F3F46] text-[#030303] dark:text-[#FAFAFA] flex items-center justify-center font-bold transition-colors cursor-pointer"
                  >
                    <Minus className="w-4 h-4" />
                  </button>

                  <div className="flex-1 relative">
                    <input
                      type="number"
                      min={10}
                      max={3000}
                      value={weightInput}
                      onChange={(e) =>
                        setWeightInput(
                          Math.max(0, parseInt(e.target.value, 10) || 0)
                        )
                      }
                      className="w-full h-11 text-center font-black text-lg bg-white dark:bg-[#202024] border border-[#E4E4E7] dark:border-[#27272A] rounded-xl focus:border-[#16A34A] focus:outline-hidden text-[#030303] dark:text-[#FAFAFA]"
                    />
                    <span className="absolute left-3 top-2.5 text-xs text-[#71717A] dark:text-[#A1A1AA] font-bold">
                      جرام
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setWeightInput((w) => w + 25)}
                    className="w-11 h-11 rounded-xl bg-[#F4F4F5] dark:bg-[#27272A] hover:bg-[#E4E4E7] dark:hover:bg-[#3F3F46] text-[#030303] dark:text-[#FAFAFA] flex items-center justify-center font-bold transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {/* Quick adjustments chips */}
                <div className="flex items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setWeightInput((w) => Math.max(10, w - 50))}
                    className="px-2.5 py-1 text-xs rounded-lg bg-[#F4F4F5] dark:bg-[#27272A] hover:bg-[#E4E4E7] dark:hover:bg-[#3F3F46] text-[#030303] dark:text-[#FAFAFA] font-medium transition-colors cursor-pointer"
                  >
                    -50g
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setWeightInput(selectedMealForSheet.defaultWeightGrams || 200)
                    }
                    className="px-2.5 py-1 text-xs rounded-lg bg-[#DDEFB5] dark:bg-[#14532D] hover:bg-[#C5E193] dark:hover:bg-[#166534] text-[#14532D] dark:text-[#86EFAC] font-bold transition-colors cursor-pointer"
                  >
                    الافتراضي ({selectedMealForSheet.defaultWeightGrams}g)
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeightInput((w) => w + 50)}
                    className="px-2.5 py-1 text-xs rounded-lg bg-[#F4F4F5] dark:bg-[#27272A] hover:bg-[#E4E4E7] dark:hover:bg-[#3F3F46] text-[#030303] dark:text-[#FAFAFA] font-medium transition-colors cursor-pointer"
                  >
                    +50g
                  </button>
                </div>
              </div>

              {/* Meal Type Selection */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-[#030303] dark:text-[#FAFAFA]">نوع الوجبة</span>
                <div className="grid grid-cols-4 gap-2">
                  {(
                    [
                      { type: "breakfast", label: "فطار", icon: "🍳" },
                      { type: "lunch", label: "غداء", icon: "🥗" },
                      { type: "dinner", label: "عشاء", icon: "🍲" },
                      { type: "snack", label: "سناك", icon: "🍎" },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.type}
                      type="button"
                      onClick={() => setMealType(m.type)}
                      className={`py-2 px-1 rounded-xl text-xs font-bold border flex flex-col items-center gap-0.5 transition-all cursor-pointer ${
                        mealType === m.type
                          ? "bg-[#DDEFB5] dark:bg-[#14532D] text-[#030303] dark:text-[#86EFAC] border-[#C5E193] dark:border-emerald-600"
                          : "bg-white dark:bg-[#202024] text-[#71717A] dark:text-[#A1A1AA] border-[#E4E4E7] dark:border-[#27272A] hover:bg-[#F4F4F5] dark:hover:bg-[#27272A]"
                      }`}
                    >
                      <span>{m.icon}</span>
                      <span>{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleConfirmLogMeal}
                  disabled={isSaving}
                  className="flex-1 py-3.5 px-4 rounded-xl bg-[#030303] dark:bg-[#16A34A] hover:bg-[#27272A] dark:hover:bg-[#15803D] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.98] cursor-pointer"
                >
                  <Check className="w-4 h-4 text-white" />
                  <span>{isSaving ? "جاري التدوين..." : "تسجيل الوجبة الآن"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCloseSheet}
                  disabled={isSaving}
                  className="py-3.5 px-4 rounded-xl bg-white dark:bg-[#202024] hover:bg-[#F4F4F5] dark:hover:bg-[#27272A] text-[#030303] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#27272A] font-bold text-sm transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
