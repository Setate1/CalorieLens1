import React, { useEffect, useState } from "react";
import { Camera, Calendar, Target, Database, PenTool } from "lucide-react";
import { AppScreen } from "../types";
import {
  getTodayDateString,
  getMealsForDate,
  getDailyTotals,
} from "../utils/dailyStorage";

interface BottomNavProps {
  currentScreen: AppScreen;
  onNavigate: (screen: AppScreen) => void;
  onOpenGoalModal: () => void;
  onTriggerCamera: () => void;
  onOpenManualEntry: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentScreen,
  onNavigate,
  onOpenGoalModal,
  onTriggerCamera,
  onOpenManualEntry,
}) => {
  const [todayCalories, setTodayCalories] = useState<number>(0);

  const updateStats = () => {
    const today = getTodayDateString();
    const meals = getMealsForDate(today);
    const totals = getDailyTotals(meals);
    setTodayCalories(totals.calories);
  };

  useEffect(() => {
    updateStats();
    const handleMeals = () => updateStats();
    const handleGoal = () => updateStats();

    window.addEventListener("calorielens_meals_updated", handleMeals);
    window.addEventListener("calorielens_goal_updated", handleGoal);

    return () => {
      window.removeEventListener("calorielens_meals_updated", handleMeals);
      window.removeEventListener("calorielens_goal_updated", handleGoal);
    };
  }, []);

  const isHomeOrDailyActive = currentScreen === "home" || currentScreen === "daily_log";
  const isHistoryActive = currentScreen === "history";

  return (
    <nav
      id="bottom-navigation-bar"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#121215]/95 backdrop-blur-md border-t border-[#E4E4E7] dark:border-[#27272A] px-2 sm:px-6 shadow-lg transition-colors duration-200"
      dir="rtl"
    >
      <div className="max-w-md sm:max-w-lg mx-auto flex items-center justify-between relative h-16 sm:h-18">
        {/* Left Side: Today & Goal Tabs */}
        <div className="flex items-center justify-around flex-1">
          {/* 1. Today / Home Dashboard Tab (الرئيسية / اليوم) */}
          <button
            id="nav-daily-log-button"
            type="button"
            onClick={() => onNavigate("home")}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-2xl transition-all active:scale-95 cursor-pointer min-w-[56px] ${
              isHomeOrDailyActive
                ? "text-[#030303] dark:text-[#FAFAFA] font-bold"
                : "text-[#71717A] dark:text-[#A1A1AA] hover:text-[#030303] dark:hover:text-[#FAFAFA] font-medium"
            }`}
          >
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all relative ${
                isHomeOrDailyActive
                  ? "bg-[#DDEFB5] dark:bg-[#14532D]/40 text-[#14532D] dark:text-[#86EFAC] shadow-xs border border-[#C5E193] dark:border-emerald-700/40 scale-105"
                  : "bg-[#F3F3F5] dark:bg-[#1E1E22] text-[#71717A] dark:text-[#A1A1AA] border border-[#E4E4E7] dark:border-[#27272A]"
              }`}
            >
              <Calendar className="w-4 h-4 stroke-[2.2]" />
              {todayCalories > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#16A34A] border-2 border-white dark:border-[#121215] rounded-full shadow-xs" />
              )}
            </div>
            <span className="text-[11px] mt-1 tracking-tight whitespace-nowrap">اليوم</span>
          </button>

          {/* 2. Daily Goal Settings Tab (الهدف) */}
          <button
            id="nav-goal-settings-button"
            type="button"
            onClick={onOpenGoalModal}
            className="flex flex-col items-center justify-center py-1 px-2 rounded-2xl text-[#71717A] dark:text-[#A1A1AA] hover:text-[#030303] dark:hover:text-[#FAFAFA] font-medium transition-all active:scale-95 cursor-pointer min-w-[56px]"
          >
            <div className="w-8 h-8 rounded-xl bg-[#F3F3F5] dark:bg-[#1E1E22] hover:bg-[#E4E4E7] dark:hover:bg-[#27272A] text-[#71717A] dark:text-[#A1A1AA] hover:text-[#030303] dark:hover:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#27272A] flex items-center justify-center transition-all">
              <Target className="w-4 h-4 stroke-[2.2]" />
            </div>
            <span className="text-[11px] mt-1 tracking-tight whitespace-nowrap">الهدف</span>
          </button>
        </div>

        {/* Center Primary Action: Centered Elevated Camera Scan Button (مسح وجبة) */}
        <div className="relative -top-5 flex flex-col items-center shrink-0 px-2">
          <button
            id="nav-scanner-button"
            type="button"
            onClick={onTriggerCamera}
            className="group relative w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#030303] dark:bg-[#18181B] hover:bg-[#27272A] flex items-center justify-center p-1 shadow-xl shadow-black/25 active:scale-90 transition-all cursor-pointer border-4 border-white dark:border-[#121215]"
            title="فتح الكاميرا والتقاط وجبة فورًا"
          >
            <div className="w-full h-full rounded-full bg-[#DDEFB5] dark:bg-[#16A34A] text-[#030303] dark:text-white flex items-center justify-center group-hover:bg-[#d0e5a3] dark:group-hover:bg-[#15803D] transition-colors">
              <Camera className="w-6 h-6 stroke-[2.4] text-[#030303] dark:text-white transition-transform group-hover:scale-110" />
            </div>
          </button>
          <span className="text-[11px] font-bold tracking-tight mt-1 text-[#030303] dark:text-[#FAFAFA] whitespace-nowrap">
            مسح وجبة
          </span>
        </div>

        {/* Right Side: Manual Entry Tab (positioned directly beside the camera button) + Firestore Cloud History Tab */}
        <div className="flex items-center justify-around flex-1">
          {/* 3. Manual Entry Button (يدوي) */}
          <button
            id="nav-manual-entry-button"
            type="button"
            onClick={onOpenManualEntry}
            className="flex flex-col items-center justify-center py-1 px-2 rounded-2xl text-[#71717A] dark:text-[#A1A1AA] hover:text-[#030303] dark:hover:text-[#FAFAFA] font-medium transition-all active:scale-95 cursor-pointer min-w-[56px]"
            title="إضافة يدوية (وصف نصي)"
          >
            <div className="w-8 h-8 rounded-xl bg-[#F3F3F5] dark:bg-[#1E1E22] hover:bg-[#E4E4E7] dark:hover:bg-[#27272A] text-[#71717A] dark:text-[#A1A1AA] hover:text-[#030303] dark:hover:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#27272A] flex items-center justify-center transition-all">
              <PenTool className="w-4 h-4 stroke-[2.2]" />
            </div>
            <span className="text-[11px] mt-1 tracking-tight whitespace-nowrap">يدوي</span>
          </button>

          {/* 4. Firestore Cloud History Tab (السجل) */}
          <button
            id="nav-cloud-history-button"
            type="button"
            onClick={() => onNavigate("history")}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-2xl transition-all active:scale-95 cursor-pointer min-w-[56px] ${
              isHistoryActive
                ? "text-[#030303] dark:text-[#FAFAFA] font-bold"
                : "text-[#71717A] dark:text-[#A1A1AA] hover:text-[#030303] dark:hover:text-[#FAFAFA] font-medium"
            }`}
          >
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                isHistoryActive
                  ? "bg-[#DDEFB5] dark:bg-[#14532D]/40 text-[#14532D] dark:text-[#86EFAC] shadow-xs border border-[#C5E193] dark:border-emerald-700/40 scale-105"
                  : "bg-[#F3F3F5] dark:bg-[#1E1E22] text-[#71717A] dark:text-[#A1A1AA] border border-[#E4E4E7] dark:border-[#27272A]"
              }`}
            >
              <Database className="w-4 h-4 stroke-[2.2]" />
            </div>
            <span className="text-[11px] mt-1 tracking-tight whitespace-nowrap">السجل</span>
          </button>
        </div>
      </div>
    </nav>
  );
};
