import React, { useState } from "react";
import {
  Camera,
  Sparkles,
  Mail,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  UserPlus,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Flame,
  Scale,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

export const AuthScreen: React.FC = () => {
  const { signIn, signUp, authError, clearAuthError } = useAuth();
  const [isSignUp, setIsSignUp] = useState<boolean>(false);
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearAuthError();

    if (!email.trim() || !password.trim()) {
      setLocalError("يرجى إدخال البريد الإلكتروني وكلمة المرور.");
      return;
    }

    if (password.length < 6) {
      setLocalError("كلمة المرور يجب أن لا تقل عن 6 أحرف أو أرقام.");
      return;
    }

    if (isSignUp && password !== confirmPassword) {
      setLocalError("كلمات المرور غير متطابقة.");
      return;
    }

    try {
      setIsSubmitting(true);
      if (isSignUp) {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
    } catch (err: any) {
      // Error handled in AuthContext and state
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickDemo = async () => {
    setEmail("demo@calorielens.ai");
    setPassword("demo123456");
    setLocalError(null);
    clearAuthError();
    try {
      setIsSubmitting(true);
      try {
        await signIn("demo@calorielens.ai", "demo123456");
      } catch {
        // If demo account doesn't exist yet, create it automatically
        await signUp("demo@calorielens.ai", "demo123456");
      }
    } catch (err) {
      // fallback handled
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F3F5] dark:bg-[#09090B] flex flex-col items-center justify-center p-4 antialiased text-[#030303] dark:text-[#FAFAFA] font-sans">
      <div className="w-full max-w-md bg-white dark:bg-[#18181B] rounded-3xl shadow-xl border border-[#E4E4E7] dark:border-[#27272A] overflow-hidden relative p-6 sm:p-8">
        {/* Glow ambient accent */}
        <div className="absolute top-0 right-1/2 translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[#DDEFB5]/30 dark:bg-[#14532D]/20 rounded-full blur-3xl pointer-events-none" />

        {/* Brand Header */}
        <div className="text-center mb-8 relative animate-auth-fade-slide">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#16A34A] dark:bg-emerald-600 text-white shadow-lg shadow-[#16A34A]/20 mb-3 animate-auth-logo-pulse">
            <Camera className="w-7 h-7 stroke-[2.2]" />
          </div>

          <div className="flex items-center justify-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-[#030303] dark:text-[#FAFAFA]">
              CalorieLens
            </h1>
          </div>
          <p className="text-xs text-[#71717A] dark:text-[#A1A1AA] mt-1 max-w-xs mx-auto">
            سجل وجباتك وتتبع سعراتك بدقة الذكاء الاصطناعي مع الحفظ السحابي
          </p>
        </div>

        {/* Feature Highlights Pills */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          <div className="p-2 rounded-xl bg-[#F8F9FA] dark:bg-[#202024] border border-[#E4E4E7] dark:border-[#27272A] text-center animate-auth-card-1">
            <Flame className="w-3.5 h-3.5 text-amber-500 mx-auto mb-1" />
            <span className="text-[10px] text-[#52525B] dark:text-[#A1A1AA] font-medium block">
              حساب السعرات
            </span>
          </div>
          <div className="p-2 rounded-xl bg-[#F8F9FA] dark:bg-[#202024] border border-[#E4E4E7] dark:border-[#27272A] text-center animate-auth-card-2">
            <Scale className="w-3.5 h-3.5 text-[#16A34A] dark:text-emerald-400 mx-auto mb-1" />
            <span className="text-[10px] text-[#52525B] dark:text-[#A1A1AA] font-medium block">
              توزيع الماكروز
            </span>
          </div>
          <div className="p-2 rounded-xl bg-[#F8F9FA] dark:bg-[#202024] border border-[#E4E4E7] dark:border-[#27272A] text-center animate-auth-card-3">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 mx-auto mb-1" />
            <span className="text-[10px] text-[#52525B] dark:text-[#A1A1AA] font-medium block">
              حفظ سحابي آمن
            </span>
          </div>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="flex rounded-2xl bg-[#F3F3F5] dark:bg-[#202024] p-1 border border-[#E4E4E7] dark:border-[#27272A] mb-6 animate-auth-form">
          <button
            id="auth-tab-signin"
            type="button"
            onClick={() => {
              setIsSignUp(false);
              setLocalError(null);
              clearAuthError();
            }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 auth-btn-interactive ${
              !isSignUp
                ? "bg-[#16A34A] text-white shadow-xs"
                : "text-[#71717A] dark:text-[#A1A1AA] hover:text-[#030303] dark:hover:text-white"
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>تسجيل الدخول</span>
          </button>
          <button
            id="auth-tab-signup"
            type="button"
            onClick={() => {
              setIsSignUp(true);
              setLocalError(null);
              clearAuthError();
            }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 auth-btn-interactive ${
              isSignUp
                ? "bg-[#16A34A] text-white shadow-xs"
                : "text-[#71717A] dark:text-[#A1A1AA] hover:text-[#030303] dark:hover:text-white"
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>حساب جديد</span>
          </button>
        </div>

        {/* Error Alert Box */}
        {(localError || authError) && (
          <div className="mb-4 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/40 text-rose-800 dark:text-rose-200 text-xs flex items-start gap-2.5 animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <p className="flex-1 text-rose-800 dark:text-rose-200 leading-relaxed">
              {localError || authError}
            </p>
          </div>
        )}

        {/* Auth Form */}
        <div className="animate-auth-form">
          <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email Field */}
          <div>
            <label className="block text-xs font-semibold text-[#030303] dark:text-[#FAFAFA] mb-1.5 text-right">
              البريد الإلكتروني (Email)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-[#71717A] dark:text-[#A1A1AA]">
                <Mail className="w-4 h-4" />
              </div>
              <input
                id="auth-email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
                className="w-full bg-[#F3F3F5] dark:bg-[#202024] border border-[#E4E4E7] dark:border-[#27272A] rounded-2xl py-3 pr-10 pl-4 text-sm text-[#030303] dark:text-[#FAFAFA] placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-[#16A34A] focus:ring-1 focus:ring-[#16A34A]/50 transition-all text-right"
                dir="ltr"
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label className="block text-xs font-semibold text-[#030303] dark:text-[#FAFAFA] mb-1.5 text-right">
              كلمة المرور (Password)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-[#71717A] dark:text-[#A1A1AA]">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="auth-password-input"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full bg-[#F3F3F5] dark:bg-[#202024] border border-[#E4E4E7] dark:border-[#27272A] rounded-2xl py-3 pr-10 pl-10 text-sm text-[#030303] dark:text-[#FAFAFA] placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-[#16A34A] focus:ring-1 focus:ring-[#16A34A]/50 transition-all text-right"
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 left-0 pl-3 flex items-center text-[#71717A] dark:text-[#A1A1AA] hover:text-[#030303] dark:hover:text-white transition-colors"
                aria-label="Toggle password visibility"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Confirm Password Field (Sign Up Only) */}
          {isSignUp && (
            <div>
              <label className="block text-xs font-semibold text-[#030303] dark:text-[#FAFAFA] mb-1.5 text-right">
                تأكيد كلمة المرور
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-[#71717A] dark:text-[#A1A1AA]">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="auth-confirm-password-input"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full bg-[#F3F3F5] dark:bg-[#202024] border border-[#E4E4E7] dark:border-[#27272A] rounded-2xl py-3 pr-10 pl-4 text-sm text-[#030303] dark:text-[#FAFAFA] placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-[#16A34A] focus:ring-1 focus:ring-[#16A34A]/50 transition-all text-right"
                  dir="ltr"
                />
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            id="auth-submit-button"
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 py-3.5 px-4 rounded-2xl bg-[#16A34A] hover:bg-[#15803D] text-white font-bold text-sm shadow-md shadow-[#16A34A]/20 auth-btn-interactive flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : isSignUp ? (
              <>
                <UserPlus className="w-4 h-4" />
                <span>إنشاء الحساب والمتابعة</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>تسجيل الدخول</span>
              </>
            )}
          </button>
        </form>

        {/* Demo Fast Sign-in */}
        <div className="mt-5 pt-4 border-t border-[#E4E4E7] dark:border-[#27272A] text-center">
          <button
            id="auth-demo-button"
            type="button"
            onClick={handleQuickDemo}
            disabled={isSubmitting}
            className="w-full py-2.5 px-3 rounded-2xl bg-[#F8F9FA] dark:bg-[#202024] hover:bg-[#F3F3F5] dark:hover:bg-[#27272A] text-[#52525B] dark:text-[#A1A1AA] hover:text-[#030303] dark:hover:text-white border border-[#E4E4E7] dark:border-[#27272A] text-xs font-semibold auth-btn-interactive flex items-center justify-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#16A34A] dark:text-emerald-400" />
            <span>تجربة سريعة بحساب تجريبي (Demo Sign-in)</span>
          </button>
        </div>
        </div>
      </div>
    </div>
  );
};
