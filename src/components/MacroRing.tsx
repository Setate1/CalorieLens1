import React from "react";
import { motion } from "motion/react";
import { Dumbbell, Wheat, Droplet } from "lucide-react";

export type MacroType = "protein" | "carbs" | "fat";

interface MacroRingProps {
  type: MacroType;
  label: string;
  grams: number;
  percentage: number; // 0 to 100
  subtitle?: string;
  size?: number; // default 58-64
  strokeWidth?: number; // default 5
  className?: string;
}

const CONFIG: Record<
  MacroType,
  {
    icon: React.ComponentType<{ className?: string }>;
    stroke: string;
    bgTrack: string;
    badgeBg: string;
    badgeText: string;
    accentColor: string;
  }
> = {
  protein: {
    icon: Dumbbell,
    stroke: "#F43F5E", // Red/Pink tone
    bgTrack: "#FFE4E6",
    badgeBg: "#FFF1F2",
    badgeText: "#E11D48",
    accentColor: "#F43F5E",
  },
  fat: {
    icon: Droplet,
    stroke: "#0284C7", // Blue tone
    bgTrack: "#E0F2FE",
    badgeBg: "#F0F9FF",
    badgeText: "#0284C7",
    accentColor: "#0284C7",
  },
  carbs: {
    icon: Wheat,
    stroke: "#F59E0B", // Yellow/Orange tone
    bgTrack: "#FEF3C7",
    badgeBg: "#FFFBEB",
    badgeText: "#D97706",
    accentColor: "#F59E0B",
  },
};

export const MacroRing: React.FC<MacroRingProps> = ({
  type,
  label,
  grams,
  percentage,
  subtitle,
  size = 72,
  strokeWidth = 6,
  className = "",
}) => {
  const conf = CONFIG[type];
  const Icon = conf.icon;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedPct = Math.min(100, Math.max(0, percentage));
  const strokeDashoffset = circumference - (clampedPct / 100) * circumference;

  return (
    <div
      className={`flex-1 flex flex-col items-center bg-white dark:bg-[#18181B] rounded-2xl p-3 border border-[#E4E4E7] dark:border-[#27272A] shadow-xs text-center transition-all duration-200 hover:border-[#DDEFB5] dark:hover:border-emerald-700/50 ${className}`}
    >
      {/* Top Label */}
      <span className="text-xs font-bold text-[#030303] dark:text-[#FAFAFA] mb-1.5 truncate max-w-full">
        {label}
      </span>

      {/* Circular Progress Ring */}
      <div className="relative flex items-center justify-center my-1" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="transform -rotate-90"
        >
          {/* Background circle track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="currentColor"
            className="text-zinc-100 dark:text-zinc-800"
            strokeWidth={strokeWidth}
          />
          {/* Animated Foreground circle */}
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke={conf.stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
            strokeLinecap="round"
          />
        </svg>

        {/* Center gram value */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xs sm:text-sm font-black text-[#030303] dark:text-[#FAFAFA] font-mono leading-none">
            {grams}g
          </span>
        </div>
      </div>

      {/* Bottom Subtitle */}
      {subtitle ? (
        <span className="mt-1 text-[10px] sm:text-[11px] font-semibold text-[#71717A] dark:text-[#A1A1AA] truncate">
          {subtitle}
        </span>
      ) : (
        <span className="mt-1 text-[10px] sm:text-[11px] font-semibold text-[#71717A] dark:text-[#A1A1AA] truncate">
          {clampedPct}%
        </span>
      )}
    </div>
  );
};
