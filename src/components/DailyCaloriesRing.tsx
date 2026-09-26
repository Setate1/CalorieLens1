import React from "react";
import { motion } from "motion/react";
import { Flame, Check, AlertCircle } from "lucide-react";

interface DailyCaloriesRingProps {
  todayCalories: number;
  targetCalories: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export const DailyCaloriesRing: React.FC<DailyCaloriesRingProps> = ({
  todayCalories,
  targetCalories,
  size = 176,
  strokeWidth = 14,
  className = "",
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeTarget = Math.max(1, targetCalories);
  const ratio = Math.min(1.5, todayCalories / safeTarget);
  const pct = Math.round((todayCalories / safeTarget) * 100);
  const isOver = todayCalories > safeTarget;
  const strokeDashoffset = circumference - Math.min(1, ratio) * circumference;
  const remaining = safeTarget - todayCalories;

  // Ring colors: Lime/Emerald gradient or Rose if exceeded
  const gradientId = `calorie-ring-gradient-${Math.round(size)}`;

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="transform -rotate-90"
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#15803D" />
              <stop offset="60%" stopColor="#16A34A" />
              <stop offset="100%" stopColor="#84CC16" />
            </linearGradient>
            <linearGradient id={`${gradientId}-over`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#E11D48" />
              <stop offset="100%" stopColor="#F43F5E" />
            </linearGradient>
          </defs>

          {/* Background track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-[#E5E7EB] dark:text-[#27272A] transition-all"
          />

          {/* Foreground progress circle */}
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke={isOver ? `url(#${gradientId}-over)` : `url(#${gradientId})`}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            strokeLinecap="round"
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2">
          <div className="flex items-center gap-1 text-[#15803D] dark:text-emerald-400 mb-0.5">
            <Flame className="w-4 h-4 fill-[#16A34A] text-[#16A34A] dark:fill-emerald-400 dark:text-emerald-400" />
            <span className="text-[11px] font-semibold text-[#52525B] dark:text-[#A1A1AA]">مستهلك</span>
          </div>

          <div className="text-3xl sm:text-4xl font-black text-[#030303] dark:text-[#FAFAFA] tracking-tight leading-none font-mono">
            {todayCalories.toLocaleString()}
          </div>

          <div className="text-[11px] font-bold text-[#71717A] dark:text-[#A1A1AA] mt-0.5">
            kcal
          </div>

          <div className="mt-1 flex items-center gap-1 bg-[#DDEFB5] dark:bg-[#14532D] px-2 py-0.5 rounded-full border border-[#C5E193] dark:border-emerald-700/40 shadow-xs">
            <span className="text-[10px] font-black text-[#14532D] dark:text-[#86EFAC]">
              {pct}%
            </span>
            <span className="text-[9px] font-medium text-[#166534] dark:text-[#86EFAC]/80">
              من {safeTarget}
            </span>
          </div>
        </div>
      </div>

      {/* Subtitle status pill */}
      <div className="mt-3 text-center">
        {isOver ? (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/40 text-xs font-bold">
            <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
            <span>تجاوزت الهدف بـ {Math.abs(remaining).toLocaleString()} kcal</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-50 dark:bg-[#14532D]/40 text-emerald-800 dark:text-[#86EFAC] border border-emerald-200 dark:border-emerald-700/40 text-xs font-bold">
            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>متبقي لك اليوم {remaining.toLocaleString()} kcal</span>
          </span>
        )}
      </div>
    </div>
  );
};
