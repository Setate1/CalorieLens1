import React, { useState, useEffect, useRef } from "react";
import {
  Scale,
  Edit3,
  Check,
  X,
  Utensils,
  Flame,
  Dumbbell,
  Wheat,
  Droplet,
  Sliders,
} from "lucide-react";
import { DetectedFood } from "../types";

export interface FoodItemCardProps {
  item: DetectedFood;
  isEditing?: boolean;
  onGramChange?: (foodId: string, newGrams: number) => void;
  onItemNameChange?: (foodId: string, newName: string) => void;
  onToggleCookingOil?: (foodId: string, addOil: boolean) => void;
  onUpdateItem?: (foodId: string, updatedFields: Partial<DetectedFood>) => void;
}

function round1Dec(val: number): number {
  if (isNaN(val) || !isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 10) / 10;
}

export const FoodItemCard: React.FC<FoodItemCardProps> = ({
  item,
  isEditing = false,
  onGramChange,
  onItemNameChange,
  onToggleCookingOil,
  onUpdateItem,
}) => {
  // Local edit mode: locked/read-only by default until user taps "تعديل الحصص"
  const [isItemEditing, setIsItemEditing] = useState<boolean>(isEditing);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(item.item_name);

  // Editable macros state
  const [weightVal, setWeightVal] = useState(String(Math.round(item.weight_g || 100)));
  const [calVal, setCalVal] = useState(String(Math.round(item.calories || 0)));
  const [proteinVal, setProteinVal] = useState(String(round1Dec(item.protein_g || 0)));
  const [carbsVal, setCarbsVal] = useState(String(round1Dec(item.carbs_g || 0)));
  const [fatVal, setFatVal] = useState(String(round1Dec(item.fat_g || 0)));

  // Cache snapshot for Cancel / revert
  const snapshotRef = useRef({
    weight: String(Math.round(item.weight_g || 100)),
    cal: String(Math.round(item.calories || 0)),
    protein: String(round1Dec(item.protein_g || 0)),
    carbs: String(round1Dec(item.carbs_g || 0)),
    fat: String(round1Dec(item.fat_g || 0)),
    name: item.item_name,
  });

  // Sync with external isEditing prop if passed by parent
  useEffect(() => {
    setIsItemEditing(isEditing);
  }, [isEditing]);

  // Sync internal values whenever item prop updates externally
  useEffect(() => {
    const w = String(Math.round(item.weight_g || 100));
    const c = String(Math.round(item.calories || 0));
    const p = String(round1Dec(item.protein_g || 0));
    const carb = String(round1Dec(item.carbs_g || 0));
    const f = String(round1Dec(item.fat_g || 0));

    setWeightVal(w);
    setCalVal(c);
    setProteinVal(p);
    setCarbsVal(carb);
    setFatVal(f);
    setNameInput(item.item_name);

    snapshotRef.current = {
      weight: w,
      cal: c,
      protein: p,
      carbs: carb,
      fat: f,
      name: item.item_name,
    };
  }, [item.weight_g, item.calories, item.protein_g, item.carbs_g, item.fat_g, item.item_name]);

  const handleEnterEdit = () => {
    snapshotRef.current = {
      weight: weightVal,
      cal: calVal,
      protein: proteinVal,
      carbs: carbsVal,
      fat: fatVal,
      name: nameInput,
    };
    setIsItemEditing(true);
  };

  const handleCancelEdit = () => {
    setWeightVal(snapshotRef.current.weight);
    setCalVal(snapshotRef.current.cal);
    setProteinVal(snapshotRef.current.protein);
    setCarbsVal(snapshotRef.current.carbs);
    setFatVal(snapshotRef.current.fat);
    setNameInput(snapshotRef.current.name);
    setIsEditingName(false);
    setIsItemEditing(false);
  };

  const handleSaveEdit = () => {
    const parsedWeight = Math.max(1, Math.round(parseFloat(weightVal) || item.weight_g || 100));
    const parsedCalories = Math.max(0, Math.round(parseFloat(calVal) || 0));
    const parsedProtein = round1Dec(Math.max(0, parseFloat(proteinVal) || 0));
    const parsedCarbs = round1Dec(Math.max(0, parseFloat(carbsVal) || 0));
    const parsedFat = round1Dec(Math.max(0, parseFloat(fatVal) || 0));

    if (nameInput.trim() && nameInput.trim() !== item.item_name && onItemNameChange && item.id) {
      onItemNameChange(item.id, nameInput.trim());
    }
    if (parsedWeight !== item.weight_g && onGramChange && item.id) {
      onGramChange(item.id, parsedWeight);
    }

    if (onUpdateItem && item.id) {
      onUpdateItem(item.id, {
        item_name: nameInput.trim() || item.item_name,
        weight_g: parsedWeight,
        calories: parsedCalories,
        protein_g: parsedProtein,
        carbs_g: parsedCarbs,
        fat_g: parsedFat,
        atwater_calories: parsedCalories,
        is_manually_corrected: true,
        is_manually_edited: true,
      });
    }

    setIsEditingName(false);
    setIsItemEditing(false);
  };

  // Proportional recalculation when weight changes in edit mode
  const handleWeightChange = (newWeightStr: string) => {
    setWeightVal(newWeightStr);
    const parsedWeight = parseFloat(newWeightStr);
    if (isNaN(parsedWeight) || parsedWeight <= 0) return;

    const baseWeight = Math.max(1, Math.round(parseFloat(snapshotRef.current.weight) || item.weight_g || 100));
    const baseCalories = parseFloat(snapshotRef.current.cal) || item.calories || 0;
    const baseProtein = parseFloat(snapshotRef.current.protein) || item.protein_g || 0;
    const baseCarbs = parseFloat(snapshotRef.current.carbs) || item.carbs_g || 0;
    const baseFat = parseFloat(snapshotRef.current.fat) || item.fat_g || 0;

    const ratio = parsedWeight / baseWeight;

    const newCalories = Math.max(0, Math.round(baseCalories * ratio));
    const newProtein = round1Dec(Math.max(0, baseProtein * ratio));
    const newCarbs = round1Dec(Math.max(0, baseCarbs * ratio));
    const newFat = round1Dec(Math.max(0, baseFat * ratio));

    setCalVal(String(newCalories));
    setProteinVal(String(newProtein));
    setCarbsVal(String(newCarbs));
    setFatVal(String(newFat));
  };

  const handleStepWeight = (delta: number) => {
    const current = parseFloat(weightVal) || item.weight_g || 100;
    const nextVal = Math.max(5, Math.min(3000, Math.round(current + delta)));
    handleWeightChange(String(nextVal));
  };

  return (
    <div
      id={`food-item-${item.id}`}
      className={`rounded-2xl p-4 transition-all shadow-xs space-y-3 border ${
        isItemEditing
          ? "bg-white dark:bg-[#18181B] border-[#16A34A] ring-1 ring-[#16A34A]/30"
          : "bg-white dark:bg-[#18181B] border-[#E4E4E7] dark:border-[#27272A]"
      }`}
      dir="rtl"
    >
      {/* Header: Food Name + Action Buttons */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-xl bg-[#DDEFB5] dark:bg-[#14532D] text-[#14532D] dark:text-[#86EFAC] flex items-center justify-center border border-[#C5E193] dark:border-emerald-700/40 shrink-0">
            <Utensils className="w-4 h-4" />
          </div>

          {isItemEditing && isEditingName ? (
            <div className="flex items-center gap-1.5 my-0.5 min-w-0 flex-1">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                dir="auto"
                className="py-1 px-2.5 rounded-lg bg-white dark:bg-[#202024] border border-[#16A34A] text-[#030303] dark:text-[#FAFAFA] text-xs font-bold focus:outline-none w-full"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setIsEditingName(false)}
                className="p-1.5 rounded-lg bg-[#16A34A] text-white hover:bg-[#15803D] cursor-pointer shrink-0"
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 group min-w-0 flex-1">
              <h4
                className="text-xs sm:text-sm font-bold text-[#030303] dark:text-[#FAFAFA] leading-snug break-words flex-1 min-w-0"
                dir="auto"
              >
                {nameInput || item.item_name}
              </h4>
              {isItemEditing && onItemNameChange && (
                <button
                  type="button"
                  onClick={() => setIsEditingName(true)}
                  className="p-1 rounded-md text-[#71717A] dark:text-[#A1A1AA] hover:text-[#030303] dark:hover:text-white hover:bg-[#F3F3F5] dark:hover:bg-[#27272A] transition-colors cursor-pointer shrink-0"
                  title="تعديل اسم المكون"
                >
                  <Edit3 className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons: "تعديل الحصص" when locked; "حفظ" + "إلغاء" when in edit mode */}
        {!isItemEditing ? (
          <button
            id={`edit-portions-button-${item.id}`}
            type="button"
            onClick={handleEnterEdit}
            className="px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap bg-[#F3F3F5] dark:bg-[#27272A] hover:bg-[#E4E4E7] dark:hover:bg-[#3F3F46] text-[#030303] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#27272A]"
          >
            <Sliders className="w-3.5 h-3.5 text-[#71717A] dark:text-[#A1A1AA]" />
            <span>تعديل الحصص</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              id={`cancel-portions-button-${item.id}`}
              type="button"
              onClick={handleCancelEdit}
              className="px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer bg-[#F3F3F5] dark:bg-[#27272A] hover:bg-[#E4E4E7] dark:hover:bg-[#3F3F46] text-[#71717A] dark:text-[#A1A1AA] border border-[#E4E4E7] dark:border-[#27272A]"
            >
              <X className="w-3.5 h-3.5" />
              <span>إلغاء</span>
            </button>
            <button
              id={`save-portions-button-${item.id}`}
              type="button"
              onClick={handleSaveEdit}
              className="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer bg-[#16A34A] hover:bg-[#15803D] text-white shadow-xs"
            >
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>حفظ</span>
            </button>
          </div>
        )}
      </div>

      {/* Quick Stepper Bar (Only visible in active Edit Mode) */}
      {isItemEditing && (
        <div className="p-2.5 rounded-xl bg-[#F8F9FA] dark:bg-[#202024] border border-[#E4E4E7] dark:border-[#27272A] flex items-center justify-between gap-2 animate-fadeIn">
          <span className="text-xs font-semibold text-[#52525B] dark:text-[#A1A1AA]">تعديل سريع للوزن:</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleStepWeight(-25)}
              className="px-2 py-1 rounded-lg bg-white dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] hover:bg-[#F3F3F5] dark:hover:bg-[#3F3F46] text-[11px] font-bold text-[#030303] dark:text-[#FAFAFA] cursor-pointer"
            >
              -25g
            </button>
            <button
              type="button"
              onClick={() => handleStepWeight(-10)}
              className="px-2 py-1 rounded-lg bg-white dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] hover:bg-[#F3F3F5] dark:hover:bg-[#3F3F46] text-[11px] font-bold text-[#030303] dark:text-[#FAFAFA] cursor-pointer"
            >
              -10g
            </button>
            <button
              type="button"
              onClick={() => handleStepWeight(+10)}
              className="px-2 py-1 rounded-lg bg-white dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] hover:bg-[#F3F3F5] dark:hover:bg-[#3F3F46] text-[11px] font-bold text-[#030303] dark:text-[#FAFAFA] cursor-pointer"
            >
              +10g
            </button>
            <button
              type="button"
              onClick={() => handleStepWeight(+25)}
              className="px-2 py-1 rounded-lg bg-white dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] hover:bg-[#F3F3F5] dark:hover:bg-[#3F3F46] text-[11px] font-bold text-[#030303] dark:text-[#FAFAFA] cursor-pointer"
            >
              +25g
            </button>
          </div>
        </div>
      )}

      {/* 5 Macro Fields: LOCKED/Read-Only by default; Editable ONLY when isItemEditing is true */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
        {/* 1. الوزن (Weight, g) */}
        <div className="p-2 rounded-xl bg-[#F8F9FA] dark:bg-[#202024] border border-[#E4E4E7] dark:border-[#27272A] focus-within:border-[#16A34A] focus-within:bg-white dark:focus-within:bg-[#27272A] transition-all space-y-1">
          <div className="flex items-center justify-between text-[10px] font-bold text-[#71717A] dark:text-[#A1A1AA]">
            <span className="flex items-center gap-1">
              <Scale className="w-3 h-3 text-[#71717A] dark:text-[#A1A1AA]" />
              <span>الوزن</span>
            </span>
            <span className="text-[9px] font-normal text-[#A1A1AA]">جرام</span>
          </div>

          {isItemEditing ? (
            <div className="relative flex items-center">
              <input
                type="number"
                min="1"
                max="5000"
                step="1"
                value={weightVal}
                onChange={(e) => handleWeightChange(e.target.value)}
                className="w-full text-left font-mono font-bold text-sm bg-transparent border-none text-[#030303] dark:text-[#FAFAFA] focus:outline-none px-1"
                placeholder="0"
                autoFocus
              />
              <span className="text-[10px] font-bold text-[#71717A] dark:text-[#A1A1AA] shrink-0 pointer-events-none">
                g
              </span>
            </div>
          ) : (
            <div className="flex items-baseline justify-between px-1 py-0.5">
              <span className="font-mono font-bold text-sm text-[#030303] dark:text-[#FAFAFA] tabular-nums">
                {weightVal}
              </span>
              <span className="text-[10px] font-bold text-[#71717A] dark:text-[#A1A1AA]">g</span>
            </div>
          )}
        </div>

        {/* 2. السعرات (Calories / kcal) */}
        <div className="p-2 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-700/30 focus-within:border-amber-500 focus-within:bg-amber-50 dark:focus-within:bg-amber-950/30 transition-all space-y-1">
          <div className="flex items-center justify-between text-[10px] font-bold text-amber-900 dark:text-amber-400">
            <span className="flex items-center gap-1">
              <Flame className="w-3 h-3 text-amber-600 dark:text-amber-400 fill-amber-600 dark:fill-amber-400" />
              <span>السعرات</span>
            </span>
            <span className="text-[9px] font-normal text-amber-700 dark:text-amber-400/80">kcal</span>
          </div>

          {isItemEditing ? (
            <div className="relative flex items-center">
              <input
                type="number"
                min="0"
                max="10000"
                step="1"
                value={calVal}
                onChange={(e) => setCalVal(e.target.value)}
                className="w-full text-left font-mono font-extrabold text-sm bg-transparent border-none text-amber-950 dark:text-amber-200 focus:outline-none px-1"
                placeholder="0"
              />
              <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 shrink-0 pointer-events-none">
                kcal
              </span>
            </div>
          ) : (
            <div className="flex items-baseline justify-between px-1 py-0.5">
              <span className="font-mono font-extrabold text-sm text-amber-950 dark:text-amber-200 tabular-nums">
                {calVal}
              </span>
              <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400">kcal</span>
            </div>
          )}
        </div>

        {/* 3. البروتين (Protein, g) */}
        <div className="p-2 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-700/30 focus-within:border-rose-500 focus-within:bg-rose-50 dark:focus-within:bg-rose-950/30 transition-all space-y-1">
          <div className="flex items-center justify-between text-[10px] font-bold text-rose-900 dark:text-rose-400">
            <span className="flex items-center gap-1">
              <Dumbbell className="w-3 h-3 text-rose-600 dark:text-rose-400" />
              <span>البروتين</span>
            </span>
            <span className="text-[9px] font-normal text-rose-700 dark:text-rose-400/80">P</span>
          </div>

          {isItemEditing ? (
            <div className="relative flex items-center">
              <input
                type="number"
                min="0"
                max="1000"
                step="0.1"
                value={proteinVal}
                onChange={(e) => setProteinVal(e.target.value)}
                className="w-full text-left font-mono font-extrabold text-sm bg-transparent border-none text-rose-950 dark:text-rose-200 focus:outline-none px-1"
                placeholder="0"
              />
              <span className="text-[10px] font-bold text-rose-700 dark:text-rose-400 shrink-0 pointer-events-none">
                g
              </span>
            </div>
          ) : (
            <div className="flex items-baseline justify-between px-1 py-0.5">
              <span className="font-mono font-extrabold text-sm text-rose-950 dark:text-rose-200 tabular-nums">
                {proteinVal}
              </span>
              <span className="text-[10px] font-bold text-rose-700 dark:text-rose-400">g</span>
            </div>
          )}
        </div>

        {/* 4. الكارب (Carbs, g) */}
        <div className="p-2 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-700/30 focus-within:border-amber-500 focus-within:bg-amber-50 dark:focus-within:bg-amber-950/30 transition-all space-y-1">
          <div className="flex items-center justify-between text-[10px] font-bold text-amber-900 dark:text-amber-400">
            <span className="flex items-center gap-1">
              <Wheat className="w-3 h-3 text-amber-600 dark:text-amber-400" />
              <span>الكارب</span>
            </span>
            <span className="text-[9px] font-normal text-amber-700 dark:text-amber-400/80">C</span>
          </div>

          {isItemEditing ? (
            <div className="relative flex items-center">
              <input
                type="number"
                min="0"
                max="1000"
                step="0.1"
                value={carbsVal}
                onChange={(e) => setCarbsVal(e.target.value)}
                className="w-full text-left font-mono font-extrabold text-sm bg-transparent border-none text-amber-950 dark:text-amber-200 focus:outline-none px-1"
                placeholder="0"
              />
              <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 shrink-0 pointer-events-none">
                g
              </span>
            </div>
          ) : (
            <div className="flex items-baseline justify-between px-1 py-0.5">
              <span className="font-mono font-extrabold text-sm text-amber-950 dark:text-amber-200 tabular-nums">
                {carbsVal}
              </span>
              <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400">g</span>
            </div>
          )}
        </div>

        {/* 5. الدهون (Fat, g) */}
        <div className="p-2 rounded-xl bg-sky-50/60 dark:bg-sky-950/20 border border-sky-200/80 dark:border-sky-700/30 focus-within:border-sky-500 focus-within:bg-sky-50 dark:focus-within:bg-sky-950/30 transition-all space-y-1 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-[10px] font-bold text-sky-900 dark:text-sky-400">
            <span className="flex items-center gap-1">
              <Droplet className="w-3 h-3 text-sky-600 dark:text-sky-400" />
              <span>الدهون</span>
            </span>
            <span className="text-[9px] font-normal text-sky-700 dark:text-sky-400/80">F</span>
          </div>

          {isItemEditing ? (
            <div className="relative flex items-center">
              <input
                type="number"
                min="0"
                max="1000"
                step="0.1"
                value={fatVal}
                onChange={(e) => setFatVal(e.target.value)}
                className="w-full text-left font-mono font-extrabold text-sm bg-transparent border-none text-sky-950 dark:text-sky-200 focus:outline-none px-1"
                placeholder="0"
              />
              <span className="text-[10px] font-bold text-sky-700 dark:text-sky-400 shrink-0 pointer-events-none">
                g
              </span>
            </div>
          ) : (
            <div className="flex items-baseline justify-between px-1 py-0.5">
              <span className="font-mono font-extrabold text-sm text-sky-950 dark:text-sky-200 tabular-nums">
                {fatVal}
              </span>
              <span className="text-[10px] font-bold text-sky-700 dark:text-sky-400">g</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
