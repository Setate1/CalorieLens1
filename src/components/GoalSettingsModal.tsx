import React, { useState, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  X,
  Target,
  Calculator,
  Flame,
  Dumbbell,
  Wheat,
  Droplet,
  Check,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Pencil,
  Info,
} from "lucide-react";
import { UserDailyGoal, UserProfile } from "../types";
import {
  calculateMifflinStJeor,
  getUserGoal,
  saveUserGoal,
  DEFAULT_GOAL,
} from "../utils/dailyStorage";

interface GoalSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (goal: UserDailyGoal) => void;
}

export const GoalSettingsModal: React.FC<GoalSettingsModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [targetCalories, setTargetCalories] = useState<number>(2000);
  const [targetProtein, setTargetProtein] = useState<number>(130);
  const [targetCarbs, setTargetCarbs] = useState<number>(220);
  const [targetFat, setTargetFat] = useState<number>(65);

  // Smart calculator state (purely optional)
  const [showCalculator, setShowCalculator] = useState<boolean>(false);
  const [calculatorAppliedNotice, setCalculatorAppliedNotice] = useState<boolean>(false);
  const [gender, setGender] = useState<"male" | "female">("male");
  const [weight, setWeight] = useState<number>(75);
  const [height, setHeight] = useState<number>(175);
  const [age, setAge] = useState<number>(28);
  const [activity, setActivity] = useState<UserProfile["activityLevel"]>("light");
  const [goalType, setGoalType] = useState<UserProfile["goalType"]>("lose");

  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const shouldReduceMotion = useReducedMotion();

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Load current goal when opened
  useEffect(() => {
    if (isOpen) {
      const current = getUserGoal();
      setTargetCalories(current.targetCalories);
      setTargetProtein(current.targetProtein_g);
      setTargetCarbs(current.targetCarbs_g);
      setTargetFat(current.targetFat_g);

      if (current.profile) {
        setGender(current.profile.gender);
        setWeight(current.profile.weight_kg);
        setHeight(current.profile.height_cm);
        setAge(current.profile.age);
        setActivity(current.profile.activityLevel);
        setGoalType(current.profile.goalType);
      }
      setSavedSuccess(false);
      setCalculatorAppliedNotice(false);
    }
  }, [isOpen]);

  // Live calculator outcome (pure suggestion)
  const calcResult = calculateMifflinStJeor({
    gender,
    weight_kg: weight,
    height_cm: height,
    age,
    activityLevel: activity,
    goalType,
  });

  const handleApplyCalculated = () => {
    // Populates the manual inputs so user can see and modify them directly
    setTargetCalories(calcResult.suggestedCalories);
    setTargetProtein(calcResult.suggestedProtein_g);
    setTargetCarbs(calcResult.suggestedCarbs_g);
    setTargetFat(calcResult.suggestedFat_g);
    setCalculatorAppliedNotice(true);
    setTimeout(() => setCalculatorAppliedNotice(false), 3500);
  };

  const handleAutoSplitMacros = () => {
    // 30% Protein, 40% Carbs, 30% Fat based on whatever calories user entered
    const p = Math.round((targetCalories * 0.3) / 4);
    const c = Math.round((targetCalories * 0.4) / 4);
    const f = Math.round((targetCalories * 0.3) / 9);
    setTargetProtein(p);
    setTargetCarbs(c);
    setTargetFat(f);
  };

  const handleResetToDefault = () => {
    setTargetCalories(DEFAULT_GOAL.targetCalories);
    setTargetProtein(DEFAULT_GOAL.targetProtein_g);
    setTargetCarbs(DEFAULT_GOAL.targetCarbs_g);
    setTargetFat(DEFAULT_GOAL.targetFat_g);
  };

  const handleSave = () => {
    // Zero artificial min/max restrictions - user decision is absolute
    const updatedGoal: UserDailyGoal = {
      targetCalories: targetCalories > 0 ? targetCalories : 2000,
      targetProtein_g: targetProtein >= 0 ? targetProtein : 0,
      targetCarbs_g: targetCarbs >= 0 ? targetCarbs : 0,
      targetFat_g: targetFat >= 0 ? targetFat : 0,
      isCalculated: showCalculator,
      profile: {
        gender,
        weight_kg: weight,
        height_cm: height,
        age,
        activityLevel: activity,
        goalType,
      },
    };

    saveUserGoal(updatedGoal);
    setSavedSuccess(true);
    if (onSaved) onSaved(updatedGoal);

    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 500);
  };

  // Premium modal animations: 450ms open, 400ms close, smooth cubic-bezier easing
  const overlayVariants = {
    initial: { opacity: 0 },
    animate: {
      opacity: 1,
      transition: {
        duration: shouldReduceMotion ? 0.2 : 0.45,
        ease: [0.16, 1, 0.3, 1],
      },
    },
    exit: {
      opacity: 0,
      transition: {
        duration: shouldReduceMotion ? 0.15 : 0.4,
        ease: [0.25, 1, 0.35, 1],
      },
    },
  };

  const modalVariants = {
    initial: shouldReduceMotion
      ? { opacity: 0 }
      : { opacity: 0, scale: 0.97 },
    animate: shouldReduceMotion
      ? {
          opacity: 1,
          transition: { duration: 0.2 },
        }
      : {
          opacity: 1,
          scale: 1,
          transition: {
            duration: 0.45,
            ease: [0.16, 1, 0.3, 1],
          },
        },
    exit: shouldReduceMotion
      ? {
          opacity: 0,
          transition: { duration: 0.15 },
        }
      : {
          opacity: 0,
          scale: 0.97,
          transition: {
            duration: 0.4,
            ease: [0.25, 1, 0.35, 1],
          },
        },
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="goal-settings-modal-overlay"
          variants={overlayVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
        >
          <motion.div
            key="goal-settings-modal-card"
            variants={modalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#18181B] w-full max-w-md rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col shadow-2xl border border-[#E4E4E7] dark:border-[#27272A] overflow-hidden text-[#030303] dark:text-[#FAFAFA] transform-gpu will-change-transform"
          >
        {/* Header */}
        <div className="p-4 border-b border-[#E4E4E7] dark:border-[#27272A] flex items-center justify-between bg-[#F8F9FA] dark:bg-[#202024]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#DDEFB5] dark:bg-[#14532D] text-[#14532D] dark:text-[#86EFAC] flex items-center justify-center border border-[#C5E193] dark:border-emerald-700/40">
              <Pencil className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#030303] dark:text-[#FAFAFA] flex items-center gap-1.5">
                <span>تعديل هدف السعرات اليومي</span>
              </h3>
              <p className="text-[11px] text-[#71717A] dark:text-[#A1A1AA]">
                حدد رقمك الخاص بحرية كاملة دون أي شروط أو حدود
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-[#71717A] dark:text-[#A1A1AA] hover:text-[#030303] dark:hover:text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 overflow-y-auto space-y-4">
          {/* Main Direct Manual Input Card */}
          <div className="bg-[#F8F9FA] dark:bg-[#202024] rounded-2xl p-4 border border-[#E4E4E7] dark:border-[#27272A] shadow-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="input-daily-target-calories"
                className="text-xs font-bold text-[#030303] dark:text-[#FAFAFA] flex items-center gap-1.5 cursor-pointer"
              >
                <Flame className="w-4 h-4 text-amber-500 fill-amber-500" />
                <span>رقم هدف السعرات اليومي (Daily Goal)</span>
              </label>
              <span className="text-[10px] text-[#71717A] dark:text-[#A1A1AA] font-mono">سعرة حرارية (kcal)</span>
            </div>

            {/* Direct Input Field - No limits or restrictions */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  id="input-daily-target-calories"
                  type="number"
                  step="any"
                  value={targetCalories || ""}
                  onChange={(e) => {
                    const val = e.target.value === "" ? 0 : Number(e.target.value);
                    setTargetCalories(val);
                  }}
                  placeholder="مثلاً: 2000"
                  className="w-full text-2xl font-black text-[#030303] dark:text-[#FAFAFA] bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-xl px-3 py-2.5 text-center focus:outline-[#16A34A] focus:border-[#16A34A] shadow-xs"
                  autoFocus
                />
              </div>
            </div>

            <p className="text-[11px] text-[#71717A] dark:text-[#A1A1AA] leading-relaxed">
              اكتب رقمك المفضل مباشرة في الحقل أعلاه. التطبيق لا يفرض أي حدود دنيا أو قصوى، القرار لك بالكامل.
            </p>

            {/* Quick helper shortcuts */}
            <div className="pt-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-[#71717A] dark:text-[#A1A1AA]">أرقام مقترحة سريعة:</span>
              <div className="flex items-center gap-1 flex-wrap">
                {[1500, 1800, 2000, 2200, 2500].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setTargetCalories(preset)}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                      targetCalories === preset
                        ? "bg-[#16A34A] text-white font-bold shadow-xs"
                        : "bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] text-[#52525B] dark:text-[#A1A1AA] hover:bg-[#F3F3F5] dark:hover:bg-[#27272A]"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Notification when calculator puts value into input */}
            {calculatorAppliedNotice && (
              <div className="p-2 rounded-xl bg-[#DDEFB5]/50 dark:bg-[#14532D]/40 border border-[#C5E193] dark:border-emerald-700/40 text-[11px] text-[#14532D] dark:text-[#86EFAC] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#16A34A] dark:text-emerald-400 shrink-0" />
                <span>
                  تم وضع الرقم المقترح في الحقل أعلاه، ويمكنك تعديله كما تحب قبل الحفظ.
                </span>
              </div>
            )}
          </div>

          {/* Target Macros Breakdown */}
          <div className="bg-[#F8F9FA] dark:bg-[#202024] rounded-2xl p-4 border border-[#E4E4E7] dark:border-[#27272A] space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-[#030303] dark:text-[#FAFAFA] block">
                  أهداف الماكروز اليومية (Macros)
                </span>
                <span className="text-[10px] text-[#71717A] dark:text-[#A1A1AA]">
                  يمكنك تعديل جرامات أي عنصر مباشرة
                </span>
              </div>
              <button
                type="button"
                onClick={handleAutoSplitMacros}
                className="text-[10px] font-bold text-[#14532D] dark:text-[#86EFAC] bg-[#DDEFB5] dark:bg-[#14532D] hover:bg-[#C5E193] px-2 py-1 rounded-md border border-[#C5E193] dark:border-emerald-700/40 transition-colors cursor-pointer"
              >
                توزيع تلقائي (30/40/30)
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {/* Protein */}
              <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/40 rounded-xl p-2.5 flex flex-col items-center">
                <span className="text-[10px] font-bold text-rose-800 dark:text-rose-200 flex items-center gap-1">
                  <Dumbbell className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                  بروتين
                </span>
                <div className="mt-1 flex items-baseline gap-1">
                  <input
                    id="input-target-protein"
                    type="number"
                    value={targetProtein || ""}
                    onChange={(e) => setTargetProtein(e.target.value === "" ? 0 : Number(e.target.value))}
                    className="w-14 text-center font-bold text-sm bg-white dark:bg-[#18181B] text-[#030303] dark:text-[#FAFAFA] border border-rose-300 dark:border-rose-700 rounded p-1"
                  />
                  <span className="text-[10px] text-rose-800 dark:text-rose-200">g</span>
                </div>
                <span className="text-[9px] text-rose-600 dark:text-rose-400 mt-1 font-mono">
                  {targetProtein * 4} kcal
                </span>
              </div>

              {/* Carbs */}
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 rounded-xl p-2.5 flex flex-col items-center">
                <span className="text-[10px] font-bold text-amber-800 dark:text-amber-200 flex items-center gap-1">
                  <Wheat className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  كارب
                </span>
                <div className="mt-1 flex items-baseline gap-1">
                  <input
                    id="input-target-carbs"
                    type="number"
                    value={targetCarbs || ""}
                    onChange={(e) => setTargetCarbs(e.target.value === "" ? 0 : Number(e.target.value))}
                    className="w-14 text-center font-bold text-sm bg-white dark:bg-[#18181B] text-[#030303] dark:text-[#FAFAFA] border border-amber-300 dark:border-amber-700 rounded p-1"
                  />
                  <span className="text-[10px] text-amber-800 dark:text-amber-200">g</span>
                </div>
                <span className="text-[9px] text-amber-600 dark:text-amber-400 mt-1 font-mono">
                  {targetCarbs * 4} kcal
                </span>
              </div>

              {/* Fat */}
              <div className="bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/40 rounded-xl p-2.5 flex flex-col items-center">
                <span className="text-[10px] font-bold text-sky-800 dark:text-sky-200 flex items-center gap-1">
                  <Droplet className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                  دهون
                </span>
                <div className="mt-1 flex items-baseline gap-1">
                  <input
                    id="input-target-fat"
                    type="number"
                    value={targetFat || ""}
                    onChange={(e) => setTargetFat(e.target.value === "" ? 0 : Number(e.target.value))}
                    className="w-14 text-center font-bold text-sm bg-white dark:bg-[#18181B] text-[#030303] dark:text-[#FAFAFA] border border-sky-300 dark:border-sky-700 rounded p-1"
                  />
                  <span className="text-[10px] text-sky-800 dark:text-sky-200">g</span>
                </div>
                <span className="text-[9px] text-sky-600 dark:text-sky-400 mt-1 font-mono">
                  {targetFat * 9} kcal
                </span>
              </div>
            </div>

            <div className="text-[10px] text-[#71717A] dark:text-[#A1A1AA] text-center">
              مجموع سعرات الماكروز:{" "}
              <strong className="text-[#030303] dark:text-[#FAFAFA]">
                {targetProtein * 4 + targetCarbs * 4 + targetFat * 9} kcal
              </strong>
            </div>
          </div>

          {/* Optional Smart Calculator (Mifflin-St Jeor) - Purely for suggestion */}
          <div className="border border-[#E4E4E7] dark:border-[#27272A] rounded-2xl overflow-hidden bg-[#F8F9FA] dark:bg-[#202024]">
            <button
              id="toggle-smart-calculator-button"
              type="button"
              onClick={() => setShowCalculator(!showCalculator)}
              className="w-full px-4 py-3 flex items-center justify-between text-xs font-bold text-[#030303] dark:text-[#FAFAFA] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-[#16A34A] dark:text-emerald-400" />
                <span>حاسبة مساعدة اختيارية (Mifflin-St Jeor)</span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-[#16A34A] dark:text-emerald-400 font-medium">
                <span>{showCalculator ? "إخفاء الحاسبة" : "اقتراح رقم استرشادي"}</span>
                {showCalculator ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </div>
            </button>

            {showCalculator && (
              <div className="p-4 border-t border-[#E4E4E7] dark:border-[#27272A] bg-white dark:bg-[#18181B] space-y-3.5">
                <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 rounded-xl p-2.5 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    هذه الحاسبة <strong>اختيارية تماماً</strong> للمساعدة فقط. نتائجها مجرد اقتراح استرشادي يمكنك نقله وتعديله، ولن تُعتمد أو تُفرض إلا بموافقتك وضغطك على حفظ.
                  </span>
                </div>

                {/* Gender */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setGender("male")}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                      gender === "male"
                        ? "bg-[#16A34A] text-white font-black border-[#16A34A]"
                        : "bg-[#F3F3F5] dark:bg-[#27272A] text-[#52525B] dark:text-[#A1A1AA] border-[#E4E4E7] dark:border-[#27272A] hover:bg-[#E4E4E7] dark:hover:bg-[#3F3F46]"
                    }`}
                  >
                    ذكر (Male)
                  </button>
                  <button
                    type="button"
                    onClick={() => setGender("female")}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                      gender === "female"
                        ? "bg-[#16A34A] text-white font-black border-[#16A34A]"
                        : "bg-[#F3F3F5] dark:bg-[#27272A] text-[#52525B] dark:text-[#A1A1AA] border-[#E4E4E7] dark:border-[#27272A] hover:bg-[#E4E4E7] dark:hover:bg-[#3F3F46]"
                    }`}
                  >
                    أنثى (Female)
                  </button>
                </div>

                {/* Weight, Height, Age */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-[#71717A] dark:text-[#A1A1AA] block mb-1">
                      الوزن (kg)
                    </label>
                    <input
                      type="number"
                      value={weight}
                      onChange={(e) => setWeight(Number(e.target.value) || 70)}
                      className="w-full text-center text-xs font-bold p-1.5 bg-[#F3F3F5] dark:bg-[#27272A] text-[#030303] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-[#71717A] dark:text-[#A1A1AA] block mb-1">
                      الطول (cm)
                    </label>
                    <input
                      type="number"
                      value={height}
                      onChange={(e) => setHeight(Number(e.target.value) || 170)}
                      className="w-full text-center text-xs font-bold p-1.5 bg-[#F3F3F5] dark:bg-[#27272A] text-[#030303] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-[#71717A] dark:text-[#A1A1AA] block mb-1">
                      العمر (سنة)
                    </label>
                    <input
                      type="number"
                      value={age}
                      onChange={(e) => setAge(Number(e.target.value) || 25)}
                      className="w-full text-center text-xs font-bold p-1.5 bg-[#F3F3F5] dark:bg-[#27272A] text-[#030303] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg"
                    />
                  </div>
                </div>

                {/* Activity Level */}
                <div>
                  <label className="text-[10px] font-bold text-[#71717A] dark:text-[#A1A1AA] block mb-1">
                    مستوى النشاط البدني
                  </label>
                  <select
                    value={activity}
                    onChange={(e) =>
                      setActivity(e.target.value as UserProfile["activityLevel"])
                    }
                    className="w-full text-xs font-medium p-2 border border-[#E4E4E7] dark:border-[#27272A] rounded-lg bg-[#F3F3F5] dark:bg-[#27272A] text-[#030303] dark:text-[#FAFAFA]"
                  >
                    <option value="sedentary">خامل (جلوس مكتبي وقليل الحركة)</option>
                    <option value="light">نشاط خفيف (تمارين 1-3 أيام أسبوعياً)</option>
                    <option value="moderate">نشاط متوسط (تمارين 3-5 أيام أسبوعياً)</option>
                    <option value="very_active">نشاط عالي (تمارين شاقة 6-7 أيام)</option>
                  </select>
                </div>

                {/* Goal Type */}
                <div>
                  <label className="text-[10px] font-bold text-[#71717A] dark:text-[#A1A1AA] block mb-1">
                    الهدف الأساسي
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setGoalType("lose")}
                      className={`py-1.5 px-2 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                        goalType === "lose"
                          ? "bg-[#16A34A] text-white font-black border-[#16A34A]"
                          : "bg-[#F3F3F5] dark:bg-[#27272A] text-[#52525B] dark:text-[#A1A1AA] border-[#E4E4E7] dark:border-[#27272A]"
                      }`}
                    >
                      إنقاص دهون (-20%)
                    </button>
                    <button
                      type="button"
                      onClick={() => setGoalType("maintain")}
                      className={`py-1.5 px-2 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                        goalType === "maintain"
                          ? "bg-[#16A34A] text-white font-black border-[#16A34A]"
                          : "bg-[#F3F3F5] dark:bg-[#27272A] text-[#52525B] dark:text-[#A1A1AA] border-[#E4E4E7] dark:border-[#27272A]"
                      }`}
                    >
                      تثبيت الوزن (TDEE)
                    </button>
                    <button
                      type="button"
                      onClick={() => setGoalType("gain")}
                      className={`py-1.5 px-2 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                        goalType === "gain"
                          ? "bg-[#16A34A] text-white font-black border-[#16A34A]"
                          : "bg-[#F3F3F5] dark:bg-[#27272A] text-[#52525B] dark:text-[#A1A1AA] border-[#E4E4E7] dark:border-[#27272A]"
                      }`}
                    >
                      زيادة عضلية (+15%)
                    </button>
                  </div>
                </div>

                {/* Calculator Result Box */}
                <div className="bg-[#DDEFB5]/40 dark:bg-[#14532D]/40 border border-[#C5E193] dark:border-emerald-700/40 rounded-xl p-3 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] text-[#14532D] dark:text-[#86EFAC] font-semibold block">
                      النتيجة المقترحة (TDEE: {calcResult.tdee} kcal)
                    </span>
                    <span className="text-lg font-black text-[#030303] dark:text-[#FAFAFA]">
                      {calcResult.suggestedCalories} <span className="text-xs font-normal text-[#71717A] dark:text-[#A1A1AA]">kcal/يوم</span>
                    </span>
                  </div>

                  <button
                    id="apply-calculated-goal-button"
                    type="button"
                    onClick={handleApplyCalculated}
                    className="px-3 py-1.5 rounded-lg bg-[#16A34A] hover:bg-[#15803D] text-white font-bold text-xs flex items-center gap-1 shadow-xs transition-colors cursor-pointer shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>نقل الاقتراح للأعلى</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Explicit Reset Option */}
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={handleResetToDefault}
              className="text-[11px] text-[#71717A] dark:text-[#A1A1AA] hover:text-[#030303] dark:hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>استعادة القيمة الافتراضية الأصلية (2000 kcal)</span>
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[#E4E4E7] dark:border-[#27272A] bg-[#F8F9FA] dark:bg-[#202024] flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="py-3 px-4 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] bg-white dark:bg-[#18181B] text-[#52525B] dark:text-[#A1A1AA] font-bold text-xs hover:bg-[#F3F3F5] dark:hover:bg-[#27272A] transition-colors cursor-pointer"
          >
            إلغاء
          </button>

          <button
            id="save-daily-goal-button"
            type="button"
            onClick={handleSave}
            disabled={savedSuccess}
            className="flex-1 py-3 px-4 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-[0.99] cursor-pointer"
          >
            {savedSuccess ? (
              <>
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>تم حفظ هدفك بنجاح!</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>حفظ الهدف ({targetCalories} kcal)</span>
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  );
};
