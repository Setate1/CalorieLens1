import React, { useState, useRef, Suspense, lazy } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Header } from "./components/Header";
import { HomeScreen } from "./components/HomeScreen";
import { BottomNav } from "./components/BottomNav";
import { AuthScreen } from "./components/AuthScreen";
import { AppLoadingSkeleton } from "./components/AppLoadingSkeleton";
import { AppScreen, FoodAnalysisResponse } from "./types";
import { optimizeAndConvertImage, urlToBase64 } from "./utils/imageUtils";
import { AlertCircle, RotateCcw, Cloud } from "lucide-react";
import { useAuth } from "./context/AuthContext";
import {
  extractLogDataFromAnalysis,
  saveNutritionLogToFirestore,
  syncPendingLocalMealsToFirestore,
} from "./services/firestoreService";
import {
  lookupKnownMeal,
  saveOrUpdateKnownMeal,
  recordKnownMealUsage,
  syncKnownMealsForUser,
} from "./services/knownMealsService";
import {
  lookupSharedMeal,
  contributeToSharedCache,
} from "./services/sharedCacheService";
import { imageAverageHash } from "./utils/mealKey";
import { suggestMealType } from "./utils/dailyStorage";
import { AmbientBackground } from "./components/AmbientBackground";

// Code-split non-critical screens to reduce initial bundle size and main-thread work on mobile
const PreviewScreen = lazy(() =>
  import("./components/PreviewScreen").then((m) => ({ default: m.PreviewScreen }))
);
const AnalyzingScreen = lazy(() =>
  import("./components/AnalyzingScreen").then((m) => ({ default: m.AnalyzingScreen }))
);
const ResultScreen = lazy(() =>
  import("./components/ResultScreen").then((m) => ({ default: m.ResultScreen }))
);
const UnrecognizedFoodScreen = lazy(() =>
  import("./components/UnrecognizedFoodScreen").then((m) => ({ default: m.UnrecognizedFoodScreen }))
);
const HistoryScreen = lazy(() =>
  import("./components/HistoryScreen").then((m) => ({ default: m.HistoryScreen }))
);
const GoalSettingsModal = lazy(() =>
  import("./components/GoalSettingsModal").then((m) => ({ default: m.GoalSettingsModal }))
);
const ManualEntryModal = lazy(() =>
  import("./components/ManualEntryModal").then((m) => ({ default: m.ManualEntryModal }))
);

const ScreenSkeleton = () => (
  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[300px]" dir="rtl">
    <div className="w-8 h-8 border-2 border-[#16A34A] border-t-transparent rounded-full animate-spin mb-3" />
    <span className="text-xs text-[#71717A] dark:text-[#A1A1AA] font-medium">جاري التحميل...</span>
  </div>
);

export default function App() {
  const { user, loading: isAuthLoading } = useAuth();
  const [screen, setScreen] = useState<AppScreen>("home");
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [base64Data, setBase64Data] = useState<{ base64: string; mimeType: string } | null>(null);
  const [isPreparingImage, setIsPreparingImage] = useState<boolean>(false);
  const [isRetryingAnalysis, setIsRetryingAnalysis] = useState<boolean>(false);
  const [isAnalysisComplete, setIsAnalysisComplete] = useState<boolean>(false);
  const [analysis, setAnalysis] = useState<FoodAnalysisResponse | null>(null);
  const [unrecognizedError, setUnrecognizedError] = useState<{
    message?: string;
    reason?: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState<boolean>(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState<boolean>(false);
  const [cloudSavedNotice, setCloudSavedNotice] = useState<boolean>(false);
  const [savedFirestoreDocId, setSavedFirestoreDocId] = useState<string | null>(null);
  const [isFromMealMemory, setIsFromMealMemory] = useState<boolean>(false);
  const [isFromSharedCache, setIsFromSharedCache] = useState<boolean>(false);

  // Hidden camera input ref to directly trigger device camera without intermediate screen
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Track active analysis request to prevent race conditions (stale state)
  const activeRequestIdRef = useRef<string | null>(null);
  const lastTextDescriptionRef = useRef<string>("");

  // Sync Known Meals cache and pending local meals deferred after initial paint / idle time
  React.useEffect(() => {
    if (!user?.uid) return;
    const uid = user.uid;

    const performSync = () => {
      syncKnownMealsForUser(uid).catch((err) =>
        console.warn("KnownMeals sync error:", err)
      );
      syncPendingLocalMealsToFirestore(uid).catch((err) =>
        console.warn("Pending local meals background sync error:", err)
      );
    };

    const idleId = "requestIdleCallback" in window
      ? (window as any).requestIdleCallback(
          () => {
            performSync();
          },
          { timeout: 2500 }
        )
      : setTimeout(() => {
          performSync();
        }, 1200);

    const handleOnline = () => {
      performSync();
    };

    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("online", handleOnline);
      if ("cancelIdleCallback" in window && typeof idleId === "number") {
        (window as any).cancelIdleCallback(idleId);
      } else {
        clearTimeout(idleId);
      }
    };
  }, [user?.uid]);

  const handleTriggerCamera = () => {
    cameraInputRef.current?.click();
  };

  // If Auth state is still initializing, render the fast App Skeleton immediately to ensure instantaneous LCP
  if (isAuthLoading) {
    return <AppLoadingSkeleton />;
  }

  // If user is not logged in, show Firebase Auth Login/Signup Screen
  if (!user) {
    return <AuthScreen />;
  }

  // Handle selecting an image from file input or camera capture
  const handleImageSelected = async (fileOrUrl: File | string) => {
    try {
      // Invalidate any ongoing requests or previous results
      activeRequestIdRef.current = null;
      setAnalysis(null);

      setIsPreparingImage(true);
      setErrorMessage(null);
      setUnrecognizedError(null);
      setCloudSavedNotice(false);

      if (typeof fileOrUrl === "string") {
        const { base64, mimeType, previewUrl: optimizedUrl } = await urlToBase64(fileOrUrl);
        setPreviewUrl(optimizedUrl || fileOrUrl);
        setBase64Data({ base64, mimeType });
      } else {
        const { base64, mimeType, previewUrl: optimizedUrl } = await optimizeAndConvertImage(fileOrUrl);
        setPreviewUrl(optimizedUrl);
        setBase64Data({ base64, mimeType });
      }

      setScreen("preview");
    } catch (err: any) {
      console.error("Error processing image:", err);
      setErrorMessage("تعذر تحميل الصورة. يرجى اختيار ملف صورة آخر أو إعادة التصوير.");
    } finally {
      setIsPreparingImage(false);
    }
  };

  // Trigger meal analysis via Gemini Vision API
  const handleAnalyze = async (options?: { forceRefresh?: boolean }) => {
    if (!base64Data) {
      setErrorMessage("لا توجد بيانات صورة صالحة للتحليل.");
      return;
    }

    const currentRequestId = Math.random().toString(36).substring(2, 9);
    activeRequestIdRef.current = currentRequestId;
    setIsFromMealMemory(false);
    setIsFromSharedCache(false);
    
    console.log(`[CalorieLens] scanId: ${currentRequestId} image size: ${base64Data.base64.length} request: started`);

    try {
      if (options?.forceRefresh) {
        setIsRetryingAnalysis(true);
      }
      setScreen("analyzing");
      setErrorMessage(null);
      setUnrecognizedError(null);
      setCloudSavedNotice(false);

      // Fast-path: Check Private Meal Memory first (Priority #1), then Public Shared Cache (Priority #2)
      if (!options?.forceRefresh && previewUrl) {
        try {
          const imgHash = await imageAverageHash(previewUrl);
          if (imgHash) {
            // 1. Private Known Meals check
            if (user?.uid) {
              const memoryMatch = await lookupKnownMeal(user.uid, {
                imageSignature: imgHash,
              });
              if (memoryMatch && activeRequestIdRef.current === currentRequestId) {
                console.log("[CalorieLens] Hit Private Meal Memory by image perceptual hash:", memoryMatch.meal.title);
                recordKnownMealUsage(user.uid, memoryMatch.meal.mealKey).catch(console.warn);
                setIsFromMealMemory(true);
                setIsFromSharedCache(false);
                setAnalysis(memoryMatch.meal.items);
                setIsAnalysisComplete(true);
                setTimeout(() => {
                  setScreen("result");
                  setIsAnalysisComplete(false);
                }, 220);
                return;
              }
            }

            // 2. Public Shared Community Cache check
            const sharedMatch = await lookupSharedMeal({
              imageSignature: imgHash,
            });
            if (sharedMatch && activeRequestIdRef.current === currentRequestId) {
              console.log("[CalorieLens] Hit Shared Community Cache by image hash:", sharedMatch.title);
              setIsFromMealMemory(false);
              setIsFromSharedCache(true);
              setAnalysis(sharedMatch.items);
              setIsAnalysisComplete(true);
              setTimeout(() => {
                setScreen("result");
                setIsAnalysisComplete(false);
              }, 220);
              return;
            }
          }
        } catch (memErr) {
          console.warn("Meal cache lookup skipped due to image hash failure:", memErr);
        }
      }

      if (window.location.protocol === "file:") {
        throw new Error("تحليل الذكاء الاصطناعي يتطلب تشغيل خادم CalorieLens. يرجى تشغيل المشروع عبر الخادم (npm run dev) بدلاً من فتح الملف مباشرة.");
      }

      const response = await fetch("/api/analyze-meal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageBase64: base64Data.base64,
          mimeType: base64Data.mimeType,
          forceRefresh: Boolean(options?.forceRefresh),
        }),
      });

      const responseText = await response.text();
      
      if (activeRequestIdRef.current !== currentRequestId) {
        console.log(`[CalorieLens] scanId: ${currentRequestId} response: rejected - stale request`);
        return;
      }
      console.log(`[CalorieLens] scanId: ${currentRequestId} request: completed response: accepted`);

      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(
          response.status === 503
            ? "خدمة الرؤية بالذكاء الاصطناعي تشهد ضغطاً مؤقتاً. يرجى المحاولة بعد لحظات."
            : `تعذر الوصول إلى خدمة التحليل (${response.status}). يرجى المحاولة مرة أخرى.`
        );
      }

      if (!response.ok) {
        throw new Error(data?.error || `فشل التحليل برمز الاستجابة ${response.status}`);
      }

      // Check for Low Confidence / Unrecognized Food Safeguard
      if (data && (data.unrecognized === true || (Array.isArray(data) && data.length === 0))) {
        setUnrecognizedError({
          message: data.message || "لم نتمكن من التعرف على الطعام بدقة كافية. حاول تصوير الطبق بوضوح أكبر أو من زاوية مختلفة.",
          reason: data.reason,
        });
        setAnalysis(null);
        setScreen("unrecognized");
        return;
      }

      const validatedData: FoodAnalysisResponse = data;
      setAnalysis(validatedData);

      // Save into Meal Memory and contribute to Shared Cache (raw AI analysis only)
      if (user?.uid) {
        const items = Array.isArray(validatedData) ? validatedData : (validatedData as any).items || [];
        const primaryTitle = items[0]?.item_name || "وجبة";
        const totalWeight = items.reduce((s: number, i: any) => s + (Number(i.weight_g) || 0), 0);
        imageAverageHash(previewUrl).then((hash) => {
          // 1. Personal private known meals
          saveOrUpdateKnownMeal(
            user.uid,
            {
              title: primaryTitle,
              items,
              defaultWeightGrams: totalWeight,
              imageSignature: hash,
              isUserCorrected: false,
              forceOverwrite: Boolean(options?.forceRefresh),
            }
          ).catch(console.warn);

          // 2. Shared community database contribution (anonymous, 15% divergence guard)
          contributeToSharedCache({
            title: primaryTitle,
            items,
            defaultWeightGrams: totalWeight,
            imageSignature: hash,
          }).catch((err) => console.warn("[SharedCache] Background image contribute error:", err));
        }).catch(console.warn);
      }

      setIsAnalysisComplete(true);
      setTimeout(() => {
        setScreen("result");
        setIsAnalysisComplete(false);
      }, 420);
    } catch (err: any) {
      if (activeRequestIdRef.current !== currentRequestId) {
        console.log(`[CalorieLens] scanId: ${currentRequestId} error rejected - stale request`);
        return;
      }
      console.error("Analysis request failed:", err);
      let msg = err.message || "فشل تحليل الوجبة. يرجى المحاولة مرة أخرى.";
      if (msg.startsWith("ApiError: ") || msg.includes('{"error":')) {
        try {
          const jsonStart = msg.indexOf("{");
          if (jsonStart !== -1) {
            const parsed = JSON.parse(msg.slice(jsonStart));
            if (parsed.error?.code === 429) {
              msg = "تم استهلاك الحصة المؤقتة لخدمة الرؤية. يرجى المحاولة بعد دقيقة.";
            } else if (parsed.error?.code === 503) {
              msg = "خدمة الذكاء الاصطناعي تشهد ضغطاً حالياً. يرجى إعادة المحاولة.";
            } else if (parsed.error?.message) {
              msg = parsed.error.message;
            }
          }
        } catch {
          msg = "خدمة التغذية البصرية غير متاحة مؤقتاً. يرجى المحاولة مرة أخرى.";
        }
      }
      setErrorMessage(msg);
      setScreen("analyzing");
    } finally {
      setIsRetryingAnalysis(false);
    }
  };

  // Handle manual food text entry analysis
  const handleAnalyzeText = async (textDescription: string, forceFresh = false) => {
    lastTextDescriptionRef.current = textDescription;
    const currentRequestId = Math.random().toString(36).substring(2, 9);
    activeRequestIdRef.current = currentRequestId;
    setIsFromMealMemory(false);
    setIsFromSharedCache(false);
    console.log(`[CalorieLens] scanId: ${currentRequestId} text entry request: started`);

    try {
      setScreen("analyzing");
      setErrorMessage(null);
      setUnrecognizedError(null);
      setCloudSavedNotice(false);

      // Create a dedicated SVG data URL thumbnail for text meals (light theme styled)
      const textPreviewSvg = `data:image/svg+xml;utf8,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400" fill="#F3F3F5">
          <rect width="600" height="400" fill="#FFFFFF" rx="20" stroke="#E4E4E7" stroke-width="1.5"/>
          <circle cx="300" cy="165" r="54" fill="#DDEFB5" fill-opacity="0.8"/>
          <path d="M282 165h36M300 147v36" stroke="#16A34A" stroke-width="4" stroke-linecap="round"/>
          <text x="300" y="260" fill="#030303" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="bold" text-anchor="middle">إضافة يدوية (وصف نصي)</text>
          <text x="300" y="295" fill="#71717A" font-family="system-ui, -apple-system, sans-serif" font-size="15" text-anchor="middle">${textDescription.slice(0, 36)}</text>
        </svg>
      `)}`;
      setPreviewUrl(textPreviewSvg);
      setBase64Data(null);

      // Fast path: Check Private Meal Memory first (Priority #1), then Shared Community Cache (Priority #2)
      if (!forceFresh && textDescription.trim()) {
        try {
          // 1. Private Known Meals check
          if (user?.uid) {
            const memoryMatch = await lookupKnownMeal(user.uid, {
              title: textDescription,
            });
            if (memoryMatch && activeRequestIdRef.current === currentRequestId) {
              console.log("[CalorieLens] Hit Private Meal Memory by text query:", memoryMatch.meal.title);
              recordKnownMealUsage(user.uid, memoryMatch.meal.mealKey).catch(console.warn);
              setIsFromMealMemory(true);
              setIsFromSharedCache(false);
              setAnalysis(memoryMatch.meal.items);
              setIsAnalysisComplete(true);
              setTimeout(() => {
                setScreen("result");
                setIsAnalysisComplete(false);
              }, 220);
              return;
            }
          }

          // 2. Public Shared Community Cache check
          const sharedMatch = await lookupSharedMeal({
            title: textDescription,
          });
          if (sharedMatch && activeRequestIdRef.current === currentRequestId) {
            console.log("[CalorieLens] Hit Shared Community Cache by text query:", sharedMatch.title);
            setIsFromMealMemory(false);
            setIsFromSharedCache(true);
            setAnalysis(sharedMatch.items);
            setIsAnalysisComplete(true);
            setTimeout(() => {
              setScreen("result");
              setIsAnalysisComplete(false);
            }, 220);
            return;
          }
        } catch (memErr) {
          console.warn("Meal cache lookup by text query skipped:", memErr);
        }
      }

      if (window.location.protocol === "file:") {
        throw new Error("تحليل الذكاء الاصطناعي يتطلب تشغيل خادم CalorieLens. يرجى تشغيل المشروع عبر الخادم (npm run dev) بدلاً من فتح الملف مباشرة.");
      }

      const response = await fetch("/api/analyze-text-meal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          textDescription,
        }),
      });

      const responseText = await response.text();

      if (activeRequestIdRef.current !== currentRequestId) {
        console.log(`[CalorieLens] scanId: ${currentRequestId} response: rejected - stale text request`);
        return;
      }
      console.log(`[CalorieLens] scanId: ${currentRequestId} text request: completed response: accepted`);

      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(
          response.status === 503
            ? "خدمة الذكاء الاصطناعي تشهد ضغطاً مؤقتاً. يرجى المحاولة بعد لحظات."
            : `تعذر الوصول إلى خدمة التحليل (${response.status}). يرجى المحاولة مرة أخرى.`
        );
      }

      if (!response.ok) {
        throw new Error(data?.error || `فشل التحليل برمز الاستجابة ${response.status}`);
      }

      // Check for Low Confidence / Unrecognized Food Safeguard
      if (data && (data.unrecognized === true || (Array.isArray(data) && data.length === 0))) {
        setUnrecognizedError({
          message: data.message || "لم نتمكن من التعرف على مكونات الوجبة من الوصف النصي. يرجى توضيح التفاصيل بمزيد من الدقة.",
          reason: data.reason,
        });
        setAnalysis(null);
        setScreen("unrecognized");
        return;
      }

      const validatedData: FoodAnalysisResponse = data;
      setAnalysis(validatedData);

      // Learn into Personal Meal Memory and contribute to Shared Cache
      if (user?.uid) {
        const items = Array.isArray(validatedData) ? validatedData : (validatedData as any).items || [];
        const primaryTitle = items[0]?.item_name || textDescription;
        const totalWeight = items.reduce((s: number, i: any) => s + (Number(i.weight_g) || 0), 0);
        
        // 1. Private known meals
        saveOrUpdateKnownMeal(
          user.uid,
          {
            title: primaryTitle,
            items,
            defaultWeightGrams: totalWeight,
            isUserCorrected: false,
            forceOverwrite: forceFresh,
          }
        ).catch(console.warn);

        // 2. Public shared cache contribution
        contributeToSharedCache({
          title: primaryTitle,
          items,
          defaultWeightGrams: totalWeight,
        }).catch((err) => console.warn("[SharedCache] Background text contribute error:", err));
      }

      setIsAnalysisComplete(true);
      setTimeout(() => {
        setScreen("result");
        setIsAnalysisComplete(false);
      }, 420);
    } catch (err: any) {
      if (activeRequestIdRef.current !== currentRequestId) {
        console.log(`[CalorieLens] scanId: ${currentRequestId} error rejected - stale text request`);
        return;
      }
      console.error("Text analysis request failed:", err);
      setErrorMessage(err.message || "تعذر تحليل الوصف النصي للوجبة. يرجى المحاولة مرة أخرى.");
      setScreen("home");
    }
  };

  // Re-run fresh AI analysis when user clicks "تحليل من جديد"
  const handleForceFreshAnalysis = () => {
    setIsFromMealMemory(false);
    setIsFromSharedCache(false);
    if (base64Data) {
      handleAnalyze({ forceRefresh: true });
    } else if (lastTextDescriptionRef.current) {
      handleAnalyzeText(lastTextDescriptionRef.current, true);
    }
  };

  // Reset back to home screen
  const handleReset = () => {
    activeRequestIdRef.current = null;
    setScreen("home");
    setPreviewUrl("");
    setBase64Data(null);
    setAnalysis(null);
    setUnrecognizedError(null);
    setErrorMessage(null);
    setCloudSavedNotice(false);
    setSavedFirestoreDocId(null);
    setIsFromMealMemory(false);
    setIsFromSharedCache(false);
    setIsRetryingAnalysis(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-start antialiased text-[#030303] dark:text-[#F4F4F5] font-sans selection:bg-[#DDEFB5] dark:selection:bg-[#166534] selection:text-[#14532D] dark:selection:text-[#ECFDF5] w-full overflow-x-hidden transition-colors duration-200">
      <AmbientBackground />
      {/* Hidden device camera input triggered directly and immediately */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handleImageSelected(file);
            e.target.value = "";
          }
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-full md:max-w-3xl lg:max-w-5xl xl:max-w-6xl min-h-screen bg-transparent md:bg-white/95 dark:bg-transparent dark:md:bg-[#121215]/95 backdrop-blur-3xl shadow-xl md:border-x border-[#E4E4E7] dark:border-[#27272A] flex flex-col relative transition-colors duration-200"
      >
        <Header
          showBack={screen !== "home"}
          onBack={screen === "result" ? handleReset : () => setScreen("home")}
        />

        {/* Firestore Auto-Save Success Toast Notice */}
        <AnimatePresence>
          {cloudSavedNotice && screen === "result" && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="mx-3 sm:mx-4 lg:mx-6 mt-3 p-3 rounded-2xl bg-[#DDEFB5]/60 dark:bg-[#14532D]/40 border border-[#C5E193] dark:border-emerald-700/40 text-[#14532D] dark:text-[#86EFAC] text-xs sm:text-sm flex items-center justify-between shadow-xs backdrop-blur-sm"
              dir="rtl"
            >
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-[#16A34A] animate-pulse shrink-0" />
                <span className="font-bold">تم حفظ نتائج الوجبة تلقائياً في السجل السحابي (Firestore)</span>
              </div>
              <button
                onClick={() => setCloudSavedNotice(false)}
                className="text-[#166534] dark:text-[#86EFAC] hover:text-[#030303] dark:hover:text-white text-xs font-bold px-2 py-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global Error Notice */}
        <AnimatePresence>
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="m-3 sm:m-4 lg:m-6 p-3.5 sm:p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-950 dark:text-rose-200 text-xs sm:text-sm flex flex-col gap-2 shadow-xs"
              dir="rtl"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-bold block text-rose-900 dark:text-rose-200">تنبيه</span>
                  <p className="mt-0.5 text-rose-800 dark:text-rose-300 leading-relaxed">{errorMessage}</p>
                </div>
                <button
                  onClick={() => setErrorMessage(null)}
                  className="text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-200 font-bold px-2 py-1 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors cursor-pointer"
                  aria-label="Close error message"
                >
                  ✕
                </button>
              </div>
              <div className="flex items-center gap-2 pt-1.5 border-t border-rose-200 dark:border-rose-900/60 justify-end">
                {base64Data && (
                  <button
                    type="button"
                    onClick={() => handleAnalyze()}
                    className="btn-hover px-3 py-1.5 rounded-lg bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-xs transition-colors flex items-center gap-1 cursor-pointer shadow-xs"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    إعادة المحاولة
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Screen Switcher */}
        <main className="flex-1 flex flex-col pb-20 sm:pb-24 w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={screen}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="flex-1 flex flex-col"
            >
              {/* Home & Daily Log: The Primary Home/Today Dashboard with Topmost Circular Progress Ring */}
              {(screen === "home" || screen === "daily_log") && (
                <HomeScreen
                  onScanNewMeal={handleTriggerCamera}
                  onOpenManualModal={() => setIsManualModalOpen(true)}
                  onOpenGoalSettings={() => setIsGoalModalOpen(true)}
                />
              )}

              <Suspense fallback={<ScreenSkeleton />}>
                {screen === "preview" && (
                  <PreviewScreen
                    imageUrl={previewUrl}
                    isLoading={isPreparingImage}
                    onAnalyze={handleAnalyze}
                    onRetake={handleReset}
                  />
                )}

                {screen === "analyzing" && (
                  <AnalyzingScreen
                    imageUrl={previewUrl}
                    isComplete={isAnalysisComplete}
                    error={errorMessage || undefined}
                    onRetry={() => {
                      setErrorMessage(null);
                      handleAnalyze({ forceRefresh: true });
                    }}
                    onRetake={handleReset}
                  />
                )}

                {screen === "result" && analysis && (
                  <ResultScreen
                    imageUrl={previewUrl}
                    initialAnalysis={analysis}
                    firestoreDocId={savedFirestoreDocId || undefined}
                    isFromMealMemory={isFromMealMemory}
                    isFromSharedCache={isFromSharedCache}
                    onForceFreshAnalysis={handleForceFreshAnalysis}
                    onScanAnother={handleTriggerCamera}
                    onViewDailyLog={handleReset}
                  />
                )}

                {screen === "unrecognized" && (
                  <UnrecognizedFoodScreen
                    imageUrl={previewUrl}
                    message={unrecognizedError?.message}
                    reason={unrecognizedError?.reason}
                    isRetrying={isRetryingAnalysis}
                    onRetrySameImage={() => handleAnalyze({ forceRefresh: true })}
                    onRetake={handleReset}
                    onImageSelected={(file) => handleImageSelected(file)}
                  />
                )}

                {screen === "history" && (
                  <HistoryScreen onScanNewMeal={handleTriggerCamera} />
                )}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Global Bottom Navigation: Camera button immediately triggers device camera, Manual button beside it */}
        <BottomNav
          currentScreen={screen}
          onNavigate={(scr) => {
            activeRequestIdRef.current = null;
            if (scr === "home" && screen !== "home") {
              handleReset();
            } else {
              setScreen(scr);
            }
          }}
          onOpenGoalModal={() => setIsGoalModalOpen(true)}
          onTriggerCamera={handleTriggerCamera}
          onOpenManualEntry={() => setIsManualModalOpen(true)}
        />

        {/* Modals wrapped in Suspense for zero initial load penalty */}
        <Suspense fallback={null}>
          {/* Goal Settings Modal */}
          <GoalSettingsModal
            isOpen={isGoalModalOpen}
            onClose={() => setIsGoalModalOpen(false)}
          />

          {/* Manual Text Entry Modal */}
          <ManualEntryModal
            isOpen={isManualModalOpen}
            onClose={() => setIsManualModalOpen(false)}
            onSubmit={handleAnalyzeText}
          />
        </Suspense>
      </motion.div>
    </div>
  );
}
