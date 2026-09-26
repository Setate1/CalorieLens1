import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Scale, Check, X, Flame, Dumbbell, Wheat, Droplet, Sparkles, Utensils } from "lucide-react";
import { DetectedFood } from "../types";

export interface ComponentNutritionValues {
  weight_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

interface ComponentWeightModalProps {
  isOpen: boolean;
  item: DetectedFood | null;
  mealTitle?: string;
  onClose: () => void;
  onSave: (values: ComponentNutritionValues | number) => Promise<void> | void;
  isSaving?: boolean;
}

function round1Dec(val: number): number {
  if (isNaN(val) || !isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 10) / 10;
}

export const ComponentWeightModal: React.FC<ComponentWeightModalProps> = ({
  isOpen,
  item,
  mealTitle,
  onClose,
  onSave,
  isSaving = false,
}) => {
  const [weightInput, setWeightInput] = useState<string>("");
  const [caloriesInput, setCaloriesInput] = useState<string>("");
  const [proteinInput, setProteinInput] = useState<string>("");
  const [carbsInput, setCarbsInput] = useState<string>("");
  const [fatInput, setFatInput] = useState<string>("");

  const cachedItemRef = React.useRef(item);
  React.useEffect(() => {
    if (item) cachedItemRef.current = item;
  }, [item]);

  const activeItem = item || cachedItemRef.current;

  useEffect(() => {
    if (activeItem && isOpen) {
      setWeightInput(String(Math.max(1, Math.round(activeItem.weight_g || 100))));
      setCaloriesInput(String(Math.max(0, Math.round(activeItem.calories || 0))));
      setProteinInput(String(round1Dec(Number(activeItem.protein_g ?? (activeItem as any).protein) || 0)));
      setCarbsInput(String(round1Dec(Number(activeItem.carbs_g ?? (activeItem as any).carbs) || 0)));
      setFatInput(String(round1Dec(Number(activeItem.fat_g ?? (activeItem as any).fat) || 0)));
    }
  }, [activeItem, isOpen]);

  const currentWeight = Math.max(1, Math.round(activeItem?.weight_g || 100));

  // If user adjusts weight, proportionally calculate default macros
  const handleWeightChange = (newWeightStr: string) => {
    setWeightInput(newWeightStr);
    const parsedWeight = parseFloat(newWeightStr);
    if (!isNaN(parsedWeight) && parsedWeight > 0 && activeItem) {
      const ratio = parsedWeight / currentWeight;
      const baseProtein = Number(activeItem.protein_g ?? (activeItem as any).protein) || 0;
      const baseCarbs = Number(activeItem.carbs_g ?? (activeItem as any).carbs) || 0;
      const baseFat = Number(activeItem.fat_g ?? (activeItem as any).fat) || 0;
      setCaloriesInput(String(Math.max(0, Math.round(activeItem.calories * ratio))));
      setProteinInput(String(round1Dec(Math.max(0, baseProtein * ratio))));
      setCarbsInput(String(round1Dec(Math.max(0, baseCarbs * ratio))));
      setFatInput(String(round1Dec(Math.max(0, baseFat * ratio))));
    }
  };

  const handleApplyPreset = (adjustment: number) => {
    const current = parseFloat(weightInput) || currentWeight;
    const nextVal = Math.max(5, Math.min(3000, Math.round(current + adjustment)));
    handleWeightChange(String(nextVal));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalWeight = Math.max(1, Math.round(parseFloat(weightInput) || currentWeight));
    const finalCalories = Math.max(0, Math.round(parseFloat(caloriesInput) || 0));
    const finalProtein = round1Dec(Math.max(0, parseFloat(proteinInput) || 0));
    const finalCarbs = round1Dec(Math.max(0, parseFloat(carbsInput) || 0));
    const finalFat = round1Dec(Math.max(0, parseFloat(fatInput) || 0));

    if (isSaving) return;

    await onSave({
      weight_g: finalWeight,
      calories: finalCalories,
      protein_g: finalProtein,
      carbs_g: finalCarbs,
      fat_g: finalFat,
    });
  };

  return (
    <AnimatePresence>
      {isOpen && activeItem && (
        <motion.div
          key="component-weight-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          dir="rtl"
          onClick={onClose}
        >
          <motion.div
            key="component-weight-modal-card"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-[#030303] dark:text-[#FAFAFA]"
          >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#E4E4E7] dark:border-[#27272A]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#DDEFB5] dark:bg-[#14532D] text-[#14532D] dark:text-[#86EFAC] flex items-center justify-center border border-[#C5E193] dark:border-emerald-700/40 shrink-0">
              <Utensils className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-[#030303] dark:text-[#FAFAFA]">
                تعديل المكون والقيم الغذائية
              </h3>
              <p
                className="text-xs text-[#71717A] dark:text-[#A1A1AA] font-medium break-words leading-tight mt-0.5"
                dir="auto"
              >
                {activeItem.item_name}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="p-1.5 rounded-lg text-[#71717A] dark:text-[#A1A1AA] hover:text-[#030303] dark:hover:text-white hover:bg-[#F3F3F5] dark:hover:bg-[#27272A] transition-colors cursor-pointer shrink-0"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 1. Primary Weight Field with Steppers */}
          <div className="p-3 rounded-2xl bg-[#F8F9FA] dark:bg-[#202024] border border-[#E4E4E7] dark:border-[#27272A] space-y-2">
            <label
              htmlFor="component-weight-input"
              className="flex items-center justify-between text-xs font-bold text-[#030303] dark:text-[#FAFAFA]"
            >
              <span className="flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-[#16A34A] dark:text-emerald-400" />
                <span>الوزن (جرام):</span>
              </span>
              <span className="text-[10px] text-[#71717A] dark:text-[#A1A1AA]">تعديل الوزن يعيد احتساب القيم تلقائيًا</span>
            </label>
            <div className="relative">
              <input
                id="component-weight-input"
                type="number"
                min="1"
                max="5000"
                step="1"
                value={weightInput}
                onChange={(e) => handleWeightChange(e.target.value)}
                placeholder="أدخل الوزن بالجرام..."
                disabled={isSaving}
                className="w-full py-2.5 px-3 rounded-xl bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] text-[#030303] dark:text-[#FAFAFA] font-mono font-bold text-base focus:outline-none focus:border-[#16A34A] text-left pl-14 transition-colors"
                autoFocus
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#71717A] dark:text-[#A1A1AA] pointer-events-none">
                جرام (g)
              </span>
            </div>

            {/* Quick Presets */}
            <div className="flex items-center justify-between gap-1 pt-1 flex-wrap">
              <span className="text-[10px] text-[#71717A] dark:text-[#A1A1AA]">تعديل سريع:</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleApplyPreset(-25)}
                  className="px-2 py-0.5 rounded-lg bg-white dark:bg-[#18181B] hover:bg-[#E4E4E7] dark:hover:bg-[#27272A] text-[#030303] dark:text-[#FAFAFA] text-[10px] font-mono font-bold border border-[#E4E4E7] dark:border-[#27272A] cursor-pointer"
                >
                  -25g
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset(-10)}
                  className="px-2 py-0.5 rounded-lg bg-white dark:bg-[#18181B] hover:bg-[#E4E4E7] dark:hover:bg-[#27272A] text-[#030303] dark:text-[#FAFAFA] text-[10px] font-mono font-bold border border-[#E4E4E7] dark:border-[#27272A] cursor-pointer"
                >
                  -10g
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset(+10)}
                  className="px-2 py-0.5 rounded-lg bg-white dark:bg-[#18181B] hover:bg-[#E4E4E7] dark:hover:bg-[#27272A] text-[#030303] dark:text-[#FAFAFA] text-[10px] font-mono font-bold border border-[#E4E4E7] dark:border-[#27272A] cursor-pointer"
                >
                  +10g
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset(+25)}
                  className="px-2 py-0.5 rounded-lg bg-white dark:bg-[#18181B] hover:bg-[#E4E4E7] dark:hover:bg-[#27272A] text-[#030303] dark:text-[#FAFAFA] text-[10px] font-mono font-bold border border-[#E4E4E7] dark:border-[#27272A] cursor-pointer"
                >
                  +25g
                </button>
              </div>
            </div>
          </div>

          {/* 2. Direct Editable Macros Panel (Calories, Protein, Carbs, Fat) */}
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-[#030303] dark:text-[#FAFAFA] block">
              القيم الغذائية المباشرة (يمكنك تعديل أي قيمة يدوياً):
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* Calories */}
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 focus-within:border-amber-500 space-y-1">
                <label className="flex items-center justify-between text-[10px] font-bold text-amber-900 dark:text-amber-200">
                  <span className="flex items-center gap-1">
                    <Flame className="w-3 h-3 text-amber-600 dark:text-amber-400 fill-amber-600 dark:fill-amber-400" />
                    <span>السعرات</span>
                  </span>
                </label>
                <div className="flex items-center">
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    step="1"
                    value={caloriesInput}
                    onChange={(e) => setCaloriesInput(e.target.value)}
                    disabled={isSaving}
                    className="w-full text-left font-mono font-extrabold text-sm bg-transparent border-none text-amber-950 dark:text-amber-100 focus:outline-none"
                  />
                  <span className="text-[9px] font-bold text-amber-700 dark:text-amber-300 pointer-events-none">
                    kcal
                  </span>
                </div>
              </div>

              {/* Protein */}
              <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/40 focus-within:border-rose-500 space-y-1">
                <label className="flex items-center justify-between text-[10px] font-bold text-rose-900 dark:text-rose-200">
                  <span className="flex items-center gap-1">
                    <Dumbbell className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                    <span>البروتين</span>
                  </span>
                </label>
                <div className="flex items-center">
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    step="0.1"
                    value={proteinInput}
                    onChange={(e) => setProteinInput(e.target.value)}
                    disabled={isSaving}
                    className="w-full text-left font-mono font-extrabold text-sm bg-transparent border-none text-rose-950 dark:text-rose-100 focus:outline-none"
                  />
                  <span className="text-[9px] font-bold text-rose-700 dark:text-rose-300 pointer-events-none">
                    g
                  </span>
                </div>
              </div>

              {/* Carbs */}
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 focus-within:border-amber-500 space-y-1">
                <label className="flex items-center justify-between text-[10px] font-bold text-amber-900 dark:text-amber-200">
                  <span className="flex items-center gap-1">
                    <Wheat className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                    <span>الكارب</span>
                  </span>
                </label>
                <div className="flex items-center">
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    step="0.1"
                    value={carbsInput}
                    onChange={(e) => setCarbsInput(e.target.value)}
                    disabled={isSaving}
                    className="w-full text-left font-mono font-extrabold text-sm bg-transparent border-none text-amber-950 dark:text-amber-100 focus:outline-none"
                  />
                  <span className="text-[9px] font-bold text-amber-700 dark:text-amber-300 pointer-events-none">
                    g
                  </span>
                </div>
              </div>

              {/* Fat */}
              <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/40 focus-within:border-sky-500 space-y-1">
                <label className="flex items-center justify-between text-[10px] font-bold text-sky-900 dark:text-sky-200">
                  <span className="flex items-center gap-1">
                    <Droplet className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                    <span>الدهون</span>
                  </span>
                </label>
                <div className="flex items-center">
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    step="0.1"
                    value={fatInput}
                    onChange={(e) => setFatInput(e.target.value)}
                    disabled={isSaving}
                    className="w-full text-left font-mono font-extrabold text-sm bg-transparent border-none text-sky-950 dark:text-sky-100 focus:outline-none"
                  />
                  <span className="text-[9px] font-bold text-sky-700 dark:text-sky-300 pointer-events-none">
                    g
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2">
            <button
              id="confirm-component-nutrition-btn"
              type="submit"
              disabled={isSaving}
              className="flex-1 py-2.5 px-3 rounded-xl bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              {isSaving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>جاري الحفظ والتحديث...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>حفظ وتحديث المكون</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="py-2.5 px-3.5 rounded-xl bg-[#F3F3F5] dark:bg-[#27272A] hover:bg-[#E4E4E7] dark:hover:bg-[#3F3F46] border border-[#E4E4E7] dark:border-[#27272A] text-[#52525B] dark:text-[#E4E4E7] font-semibold text-xs transition-colors cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
