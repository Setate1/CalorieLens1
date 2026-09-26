import React, { useState } from "react";
import { Sparkles, ArrowLeft, LogOut, Loader2, Sun, Moon } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

interface HeaderProps {
  onBack?: () => void;
  showBack?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onBack, showBack }) => {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme, isDark } = useTheme();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isLoggingOut) return;

    try {
      setIsLoggingOut(true);
      await signOut();
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-[#121215]/95 backdrop-blur-md border-b border-[#E4E4E7] dark:border-[#27272A] text-[#030303] dark:text-[#F4F4F5] px-3.5 sm:px-6 py-3 w-full transition-colors duration-200">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-2.5">
          {showBack && onBack ? (
            <button
              id="header-back-button"
              type="button"
              onClick={onBack}
              className="p-2 -ml-1 text-[#52525B] dark:text-[#A1A1AA] hover:text-[#030303] dark:hover:text-white hover:bg-[#F3F3F5] dark:hover:bg-[#27272A] active:scale-95 rounded-full transition-all cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          ) : null}
          <h1 className="text-lg sm:text-xl font-black tracking-tight text-[#030303] dark:text-[#FAFAFA] select-none">
            CalorieLens
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Dark / Light Mode Toggle Button */}
          <button
            id="theme-toggle-button"
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-full text-[#52525B] dark:text-[#A1A1AA] hover:text-[#030303] dark:hover:text-[#FAFAFA] bg-[#F3F3F5] dark:bg-[#1E1E22] hover:bg-[#E4E4E7] dark:hover:bg-[#27272A] border border-[#E4E4E7] dark:border-[#27272A] active:scale-95 transition-all cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center relative shadow-2xs"
            title={isDark ? "التبديل إلى الوضع النهاري (Light Mode)" : "التبديل إلى الوضع الليلي (Dark Mode)"}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={theme}
                initial={{ rotate: -90, scale: 0.6, opacity: 0 }}
                animate={{ rotate: 0, scale: 1, opacity: 1 }}
                exit={{ rotate: 90, scale: 0.6, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center justify-center"
              >
                {isDark ? (
                  <Sun className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-amber-400 fill-amber-400/20" />
                ) : (
                  <Moon className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-[#52525B]" />
                )}
              </motion.div>
            </AnimatePresence>
          </button>

          {user ? (
            <div className="flex items-center gap-1.5 bg-[#F3F3F5] dark:bg-[#1E1E22] border border-[#E4E4E7] dark:border-[#27272A] rounded-full pl-3 pr-1 py-0.5 transition-colors">
              <span className="text-[11px] sm:text-xs text-[#52525B] dark:text-[#A1A1AA] font-medium max-w-[100px] sm:max-w-[180px] md:max-w-[220px] truncate" title={user.email || ""}>
                {user.email?.split("@")[0] || "User"}
              </span>
              <button
                id="header-logout-button"
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="p-1.5 sm:p-2 rounded-full text-[#71717A] dark:text-[#A1A1AA] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 active:scale-95 transition-all cursor-pointer disabled:opacity-50 min-w-[32px] min-h-[32px] flex items-center justify-center"
                title="تسجيل الخروج (Sign Out)"
                aria-label="Sign out"
              >
                {isLoggingOut ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-600 dark:text-rose-400" />
                ) : (
                  <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                )}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-xs text-[#52525B] dark:text-[#A1A1AA] font-medium bg-[#F3F3F5] dark:bg-[#1E1E22] px-3 py-1 rounded-full border border-[#E4E4E7] dark:border-[#27272A]">
              <Sparkles className="w-3.5 h-3.5 text-[#16A34A] animate-pulse" />
              <span className="text-[#030303] dark:text-[#FAFAFA]">Gemini</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
