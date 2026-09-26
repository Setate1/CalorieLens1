import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  Check,
  AlertTriangle,
  RotateCcw,
  Camera,
  Utensils,
  Scale,
  Flame,
  Scan,
} from "lucide-react";

interface AnalyzingScreenProps {
  imageUrl: string;
  isComplete?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRetake?: () => void;
}

const STAGES = [
  { text: "جاري تحليل الصورة...", icon: Scan },
  { text: "جاري التعرف على الأطعمة...", icon: Utensils },
  { text: "جاري تقدير الكمية...", icon: Scale },
  { text: "جاري حساب السعرات والعناصر الغذائية...", icon: Flame },
];

export const AnalyzingScreen: React.FC<AnalyzingScreenProps> = ({
  imageUrl,
  isComplete = false,
  error = null,
  onRetry,
  onRetake,
}) => {
  const [currentStep, setCurrentStep] = useState(0);

  // Cycle through intermediate analysis stages smoothly while active
  useEffect(() => {
    if (isComplete || error) return;

    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev < STAGES.length - 1 ? prev + 1 : prev));
    }, 1400);

    return () => clearInterval(interval);
  }, [isComplete, error]);

  const activeStage = isComplete
    ? { text: "اكتمل التحليل", icon: Check }
    : STAGES[currentStep];
  const ActiveIcon = activeStage.icon;

  return (
    <div
      id="ai-analyzing-screen"
      className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 max-w-xl mx-auto w-full text-center animate-fade-in my-auto text-[#030303] dark:text-[#FAFAFA]"
      dir="rtl"
    >
      {/* Visual Analysis Area Frame - Clean Rounded Rectangle Card Design (border-radius ~20px) */}
      <div className="relative w-64 h-64 sm:w-80 sm:h-80 rounded-[20px] overflow-hidden shadow-md border-2 border-[#DDEFB5] dark:border-emerald-700/40 bg-white dark:bg-[#18181B] mb-6 group">
        {/* Uploaded Meal Image */}
        {imageUrl && imageUrl.trim() !== "" ? (
          <motion.img
            initial={{ scale: 0.97, opacity: 0 }}
            animate={{ scale: 1, opacity: 0.95 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            src={imageUrl}
            alt="Food item to analyze"
            decoding="async"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover transition-transform duration-700"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-900 text-zinc-400">
            <Utensils className="w-12 h-12 text-[#16A34A] opacity-50 mb-2 animate-pulse" />
            <span className="text-xs font-medium text-[#71717A] dark:text-[#A1A1AA]">جاري تحليل الوجبة...</span>
          </div>
        )}

        {/* Subtle Ambient Vignette */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/20 pointer-events-none" />

        {/* Scanning Line & Glow Beam Overlay (Active during analysis) */}
        <AnimatePresence>
          {!isComplete && !error && (
            <motion.div
              key="active-scanning-beam"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="absolute left-0 right-0 pointer-events-none animate-laser-sweep z-10"
              style={{ willChange: "top, opacity" }}
            >
              {/* Soft upper trailing glow blur */}
              <div className="absolute left-0 right-0 -top-12 h-12 bg-gradient-to-t from-[#16A34A]/35 via-[#16A34A]/10 to-transparent blur-[4px] pointer-events-none" />

              {/* Glowing green horizontal scanning line with center core shine */}
              <div className="relative h-[3px] w-full bg-gradient-to-r from-transparent via-[#22C55E] to-transparent shadow-[0_0_14px_#16A34A,0_0_28px_rgba(22,163,74,0.8)]">
                <div className="absolute inset-x-1/4 top-0 h-[2px] bg-gradient-to-r from-transparent via-white to-transparent pointer-events-none" />
                {/* Scanning Particles */}
                <div className="absolute left-1/4 -top-2 w-1.5 h-1.5 bg-white rounded-full blur-[1px] animate-pulse" />
                <div className="absolute right-1/4 top-1 w-1 h-1 bg-[#86EFAC] rounded-full blur-[1px] animate-pulse" style={{ animationDelay: "150ms" }} />
                <div className="absolute left-1/2 -top-1 w-2 h-2 bg-white rounded-full blur-[2px] animate-pulse" style={{ animationDelay: "300ms" }} />
              </div>

              {/* Soft lower trailing glow blur */}
              <div className="absolute left-0 right-0 top-[3px] h-12 bg-gradient-to-b from-[#16A34A]/35 via-[#16A34A]/10 to-transparent blur-[4px] pointer-events-none" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* CalorieLens AI Badge at top of the image */}
        <div className="absolute top-3.5 right-3.5 flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/95 dark:bg-[#18181B]/95 border border-[#E4E4E7] dark:border-[#27272A] backdrop-blur-md text-[11px] font-bold text-[#14532D] dark:text-[#86EFAC] shadow-sm pointer-events-none z-20">
          <Sparkles className="w-3.5 h-3.5 text-[#16A34A] dark:text-emerald-400" />
          <span>CalorieLens AI</span>
        </div>

        {/* Completion Checkmark Overlay if AI has finished */}
        {isComplete && (
          <div className="absolute inset-0 bg-white/70 dark:bg-black/70 backdrop-blur-xs flex items-center justify-center animate-fade-in z-30">
            <div className="w-16 h-16 rounded-full bg-[#DDEFB5] dark:bg-[#14532D] border-2 border-[#16A34A] text-[#14532D] dark:text-[#86EFAC] flex items-center justify-center shadow-md animate-checkmark-pop">
              <Check className="w-8 h-8 stroke-[3] text-[#14532D] dark:text-[#86EFAC]" />
            </div>
          </div>
        )}
      </div>

      {/* Error State Card if analysis failed */}
      {error ? (
        <div
          id="analysis-error-card"
          className="w-full bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/40 rounded-2xl p-4 text-center space-y-3 animate-fade-in max-w-sm shadow-xs"
        >
          <div className="flex items-center justify-center gap-2 text-rose-800 dark:text-rose-300 font-bold text-sm">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>تعذر إتمام التحليل</span>
          </div>
          <p className="text-xs text-rose-900 dark:text-rose-200 leading-relaxed max-w-xs mx-auto">
            {error}
          </p>

          <div className="flex items-center justify-center gap-2 pt-1">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="btn-hover px-4 py-2.5 rounded-xl bg-[#030303] dark:bg-[#16A34A] hover:bg-[#27272A] dark:hover:bg-[#15803D] text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer min-h-[40px]"
              >
                <RotateCcw className="w-3.5 h-3.5 text-white" />
                <span>إعادة المحاولة</span>
              </button>
            )}
            {onRetake && (
              <button
                type="button"
                onClick={onRetake}
                className="btn-hover px-4 py-2.5 rounded-xl bg-white dark:bg-[#27272A] hover:bg-[#F3F3F5] dark:hover:bg-[#3F3F46] text-[#52525B] dark:text-[#E4E4E7] hover:text-[#030303] dark:hover:text-white font-semibold text-xs border border-[#E4E4E7] dark:border-[#27272A] flex items-center gap-1.5 transition-all cursor-pointer min-h-[40px]"
              >
                <Camera className="w-3.5 h-3.5 text-[#71717A] dark:text-[#A1A1AA]" />
                <span>التقاط صورة أخرى</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Normal / Active AI Analysis Messages (Progress bar removed as requested) */
        <div className="w-full max-w-sm flex flex-col items-center space-y-2">
          {/* Animated Stage Message with Smooth Transition */}
          <div className="min-h-[32px] flex items-center justify-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeStage.text}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center justify-center gap-2"
              >
                <ActiveIcon
                  className={`w-4.5 h-4.5 ${
                    isComplete
                      ? "text-[#16A34A] dark:text-emerald-400 stroke-[2.5]"
                      : "text-[#16A34A] dark:text-emerald-400 animate-pulse"
                  }`}
                />
                <h3 className="text-sm sm:text-base font-bold text-[#030303] dark:text-[#FAFAFA]">
                  {activeStage.text}
                </h3>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Secondary Note */}
          <p className="text-xs text-[#71717A] dark:text-[#A1A1AA] font-normal leading-relaxed">
            مطابقة المكونات والأحجام بدقة مع المعايير الغذائية
          </p>
        </div>
      )}
    </div>
  );
};
