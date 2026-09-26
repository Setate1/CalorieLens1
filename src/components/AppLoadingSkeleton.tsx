import React from "react";
import { Camera, Calendar, Target, Database, PenTool, Flame, Utensils, Sparkles } from "lucide-react";

export const AppLoadingSkeleton: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#F3F3F5] dark:bg-[#09090B] flex flex-col font-sans text-[#030303] dark:text-[#FAFAFA] antialiased" dir="rtl">
      {/* 1. Header Shell */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-[#121215]/95 backdrop-blur-md border-b border-[#E4E4E7] dark:border-[#27272A] px-3.5 sm:px-6 py-3 w-full">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-black tracking-tight text-[#030303] dark:text-[#FAFAFA]">
              CalorieLens
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-[#E4E4E7] dark:bg-[#27272A] animate-pulse" />
            <div className="w-24 h-7 rounded-full bg-[#E4E4E7] dark:bg-[#27272A] animate-pulse" />
          </div>
        </div>
      </header>

      {/* 2. Main Dashboard Content Shell */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 pb-28 space-y-4 sm:space-y-6">
        {/* Top Hero Calorie Goal Card */}
        <div className="bg-linear-to-br from-[#DDEFB5] via-[#E8F5C8] to-[#D5ECA5] dark:from-[#14532D] dark:via-[#166534] dark:to-[#0F381E] rounded-3xl p-5 sm:p-6 shadow-sm border border-[#C5E193] dark:border-emerald-700/50">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="space-y-2 text-center sm:text-right flex-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 dark:bg-[#18181B]/80 text-[#14532D] dark:text-[#86EFAC] text-xs font-bold">
                <Flame className="w-3.5 h-3.5 text-[#16A34A] animate-pulse" />
                <span>إجمالي السعرات اليومية</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-[#14532D] dark:text-[#ECFDF5]">
                متابعة السعرات والماكروز اليومية
              </h2>
              <div className="flex items-center gap-2 justify-center sm:justify-start pt-1">
                <div className="h-6 w-24 bg-white/70 dark:bg-black/20 rounded-lg animate-pulse" />
                <div className="h-6 w-28 bg-white/70 dark:bg-black/20 rounded-lg animate-pulse" />
              </div>
            </div>

            {/* Circular Ring Placeholder */}
            <div className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-full bg-white/90 dark:bg-[#121215] flex items-center justify-center p-3 shadow-md border-2 border-white dark:border-emerald-900/40 shrink-0">
              <div className="w-full h-full rounded-full border-8 border-[#C5E193] dark:border-[#1F482B] border-t-[#16A34A] dark:border-t-[#4ADE80] animate-spin flex items-center justify-center">
                <div className="text-center">
                  <div className="w-12 h-6 bg-[#E4E4E7] dark:bg-[#27272A] rounded-md mx-auto mb-1 animate-pulse" />
                  <span className="text-[10px] font-bold text-[#71717A] dark:text-[#A1A1AA]">سعرة (kcal)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Macro Rings Row */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
          {[
            { label: "بروتين", color: "border-rose-400" },
            { label: "كاربوهيدرات", color: "border-amber-400" },
            { label: "دهون صحية", color: "border-sky-400" },
          ].map((macro, idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-[#18181B] rounded-2xl p-3 sm:p-4 border border-[#E4E4E7] dark:border-[#27272A] flex flex-col items-center justify-center space-y-2"
            >
              <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full border-4 ${macro.color} border-t-transparent animate-pulse flex items-center justify-center bg-[#F8F9FA] dark:bg-[#202024]`}>
                <div className="w-6 h-3 bg-[#E4E4E7] dark:bg-[#27272A] rounded-xs" />
              </div>
              <span className="text-[11px] font-bold text-[#71717A] dark:text-[#A1A1AA]">{macro.label}</span>
            </div>
          ))}
        </div>

        {/* Date Navigation Skeleton */}
        <div className="bg-white dark:bg-[#18181B] rounded-2xl p-3 border border-[#E4E4E7] dark:border-[#27272A] flex items-center justify-between">
          <div className="w-8 h-8 rounded-xl bg-[#F3F3F5] dark:bg-[#27272A] animate-pulse" />
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#16A34A] dark:text-emerald-400" />
            <div className="w-28 h-4 bg-[#E4E4E7] dark:bg-[#27272A] rounded-md animate-pulse" />
          </div>
          <div className="w-8 h-8 rounded-xl bg-[#F3F3F5] dark:bg-[#27272A] animate-pulse" />
        </div>

        {/* Meal Slots Skeleton */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs sm:text-sm font-bold text-[#030303] dark:text-[#FAFAFA]">
              أوقات الوجبات (Meal Slots)
            </span>
            <div className="w-16 h-3 bg-[#E4E4E7] dark:bg-[#27272A] rounded-md animate-pulse" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
            {["الإفطار", "الغداء", "العشاء", "سناك"].map((name, i) => (
              <div
                key={i}
                className="bg-white dark:bg-[#18181B] rounded-3xl p-4 sm:p-5 border border-[#E4E4E7] dark:border-[#27272A] space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-[#F8F9FA] dark:bg-[#202024] border border-[#E4E4E7] dark:border-[#27272A] flex items-center justify-center">
                      <Utensils className="w-4 h-4 text-[#71717A] dark:text-[#A1A1AA]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#030303] dark:text-[#FAFAFA]">{name}</h3>
                      <div className="w-20 h-3 bg-[#E4E4E7] dark:bg-[#27272A] rounded-xs mt-1 animate-pulse" />
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-[#DDEFB5] dark:bg-[#14532D] animate-pulse" />
                </div>
                <div className="h-9 rounded-xl bg-[#F8F9FA] dark:bg-[#202024] border border-[#E4E4E7]/60 dark:border-[#27272A]/60 flex items-center justify-center">
                  <span className="text-[11px] text-[#71717A] dark:text-[#A1A1AA] font-medium">جاري المزامنة السحابية...</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* 3. Bottom Navigation Shell */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#121215]/95 backdrop-blur-md border-t border-[#E4E4E7] dark:border-[#27272A] px-2 sm:px-6 h-16 sm:h-18 flex items-center justify-between max-w-md sm:max-w-lg mx-auto">
        <div className="flex items-center justify-around flex-1">
          <div className="flex flex-col items-center text-[#14532D] dark:text-[#86EFAC] font-bold">
            <div className="w-8 h-8 rounded-xl bg-[#DDEFB5] dark:bg-[#14532D]/40 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
            <span className="text-[11px] mt-1">اليوم</span>
          </div>
          <div className="flex flex-col items-center text-[#71717A] dark:text-[#A1A1AA]">
            <div className="w-8 h-8 rounded-xl bg-[#F3F3F5] dark:bg-[#1E1E22] flex items-center justify-center">
              <Target className="w-4 h-4" />
            </div>
            <span className="text-[11px] mt-1">الهدف</span>
          </div>
        </div>

        <div className="relative -top-5 flex flex-col items-center shrink-0 px-2">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#030303] dark:bg-[#18181B] flex items-center justify-center p-1 shadow-xl border-4 border-white dark:border-[#121215]">
            <div className="w-full h-full rounded-full bg-[#DDEFB5] dark:bg-[#16A34A] text-[#030303] dark:text-white flex items-center justify-center">
              <Camera className="w-6 h-6" />
            </div>
          </div>
          <span className="text-[11px] font-bold tracking-tight mt-1 text-[#030303] dark:text-[#FAFAFA]">مسح وجبة</span>
        </div>

        <div className="flex items-center justify-around flex-1">
          <div className="flex flex-col items-center text-[#71717A] dark:text-[#A1A1AA]">
            <div className="w-8 h-8 rounded-xl bg-[#F3F3F5] dark:bg-[#1E1E22] flex items-center justify-center">
              <PenTool className="w-4 h-4" />
            </div>
            <span className="text-[11px] mt-1">يدوي</span>
          </div>
          <div className="flex flex-col items-center text-[#71717A] dark:text-[#A1A1AA]">
            <div className="w-8 h-8 rounded-xl bg-[#F3F3F5] dark:bg-[#1E1E22] flex items-center justify-center">
              <Database className="w-4 h-4" />
            </div>
            <span className="text-[11px] mt-1">السجل</span>
          </div>
        </div>
      </nav>
    </div>
  );
};
