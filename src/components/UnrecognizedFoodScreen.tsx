import React, { useRef } from "react";
import {
  AlertTriangle,
  Camera,
  RotateCcw,
  Lightbulb,
  ShieldAlert,
  Sun,
  Maximize2,
  Scan,
  Utensils,
} from "lucide-react";

interface UnrecognizedFoodScreenProps {
  imageUrl: string;
  message?: string;
  reason?: string;
  isRetrying?: boolean;
  onRetrySameImage: () => void;
  onRetake: () => void;
  onImageSelected?: (file: File) => void;
}

export const UnrecognizedFoodScreen: React.FC<UnrecognizedFoodScreenProps> = ({
  imageUrl,
  message,
  reason,
  isRetrying = false,
  onRetrySameImage,
  onRetake,
  onImageSelected,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const defaultMessage =
    "لم نتمكن من التعرف على الطعام بدقة كافية. حاول تصوير الطبق بوضوح أكبر أو من زاوية مختلفة.";

  const displayMessage = message || defaultMessage;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (onImageSelected) {
        onImageSelected(file);
      } else {
        onRetake();
      }
    }
  };

  return (
    <div
      dir="rtl"
      className="flex-1 max-w-2xl mx-auto w-full p-4 sm:p-6 space-y-6 animate-fade-in text-[#030303] dark:text-[#FAFAFA]"
    >
      {/* Hidden File Inputs for quick retake */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Main Warning Card */}
      <div className="bg-white dark:bg-[#18181B] border border-amber-200 dark:border-amber-700/40 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-lg">
        {/* Ambient Top Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-24 bg-amber-100/60 dark:bg-amber-900/20 blur-3xl pointer-events-none" />

        <div className="flex flex-col items-center text-center relative z-10 space-y-5">
          {/* Image Thumbnail with Warning Overlay */}
          <div className="relative w-36 h-36 rounded-2xl overflow-hidden border-2 border-amber-300 dark:border-amber-600/50 shadow-md bg-[#F3F3F5] dark:bg-[#202024] group flex items-center justify-center">
            {imageUrl && imageUrl.trim() !== "" ? (
              <img
                src={imageUrl}
                alt="Scanned item"
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover opacity-85 group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <Utensils className="w-10 h-10 text-amber-500 opacity-60" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end justify-center pb-2">
              <span className="text-[11px] font-bold text-amber-900 dark:text-amber-200 bg-amber-100/90 dark:bg-amber-950/90 backdrop-blur-xs px-2.5 py-0.5 rounded-full border border-amber-300 dark:border-amber-700 flex items-center gap-1 shadow-xs">
                <AlertTriangle className="w-3 h-3 text-amber-700 dark:text-amber-400" />
                ثقة منخفضة (&lt;40%)
              </span>
            </div>
          </div>

          {/* Warning Icon Badge */}
          <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 flex items-center justify-center text-amber-600 dark:text-amber-400 shadow-xs">
            <ShieldAlert className="w-8 h-8" />
          </div>

          {/* Title & Core Arabic Message */}
          <div className="space-y-2 max-w-lg">
            <h2 className="text-xl sm:text-2xl font-black text-[#030303] dark:text-[#FAFAFA] tracking-tight">
              تعذّر التعرف على الوجبة بدقة
            </h2>
            <p className="text-sm sm:text-base text-amber-950 dark:text-amber-200 leading-relaxed font-medium bg-amber-50 dark:bg-amber-950/30 p-3.5 rounded-2xl border border-amber-200 dark:border-amber-800/40">
              {displayMessage}
            </p>
            {reason && (
              <p className="text-xs text-[#71717A] dark:text-[#A1A1AA] leading-relaxed pt-1">
                <span className="font-semibold text-[#030303] dark:text-[#FAFAFA]">ملاحظة النظام: </span>
                {reason}
              </p>
            )}
          </div>

          {/* Integrity Note */}
          <div className="flex items-center gap-2 text-xs text-[#52525B] dark:text-[#A1A1AA] bg-[#F8F9FA] dark:bg-[#202024] px-4 py-2 rounded-full border border-[#E4E4E7] dark:border-[#27272A]">
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
            <span>
              حفاظاً على دقة سجلاتك، تم حجب الأرقام التقديرية ولم يتم حفظ أي بيانات في السجل.
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons Section */}
      <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-2xl p-5 space-y-3 shadow-xs">
        <h3 className="text-sm font-bold text-[#030303] dark:text-[#FAFAFA] flex items-center gap-2">
          <RotateCcw className="w-4 h-4 text-[#16A34A] dark:text-emerald-400" />
          خيارات إعادة المحاولة (Retry Options)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {/* Button A: Retake / Choose New Photo */}
          <button
            id="btn-retake-photo"
            onClick={onRetake}
            className="flex items-center justify-center gap-2.5 px-5 py-3.5 bg-[#030303] dark:bg-[#16A34A] hover:bg-[#27272A] dark:hover:bg-[#15803D] active:scale-[0.98] text-white font-bold rounded-xl shadow-md transition-all text-sm cursor-pointer"
          >
            <Camera className="w-4 h-4 shrink-0" />
            <span>التقاط صورة جديدة بالكاميرا</span>
          </button>

          {/* Button B: Retry Same Image Analysis */}
          <button
            id="btn-retry-same-image"
            onClick={onRetrySameImage}
            disabled={isRetrying}
            className={`flex items-center justify-center gap-2.5 px-5 py-3.5 font-bold rounded-xl border transition-all text-sm cursor-pointer ${
              isRetrying
                ? "bg-[#F3F3F5] dark:bg-[#27272A] text-[#A1A1AA] border-[#E4E4E7] dark:border-[#27272A] cursor-not-allowed"
                : "bg-white dark:bg-[#202024] hover:bg-[#F3F3F5] dark:hover:bg-[#27272A] text-[#030303] dark:text-[#FAFAFA] border-[#E4E4E7] dark:border-[#27272A] shadow-xs active:scale-[0.98]"
            }`}
          >
            <RotateCcw
              className={`w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 ${
                isRetrying ? "animate-spin text-[#A1A1AA]" : ""
              }`}
            />
            <span>
              {isRetrying ? "جاري إعادة التحليل..." : "إعادة تحليل نفس الصورة"}
            </span>
          </button>
        </div>
      </div>

      {/* Photography Tips Card */}
      <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-2xl p-5 space-y-4 shadow-xs">
        <h3 className="text-sm font-bold text-[#030303] dark:text-[#FAFAFA] flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-amber-500" />
          نصائح للحصول على تحليل عالي الدقة (90%+)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#F8F9FA] dark:bg-[#202024] border border-[#E4E4E7] dark:border-[#27272A]">
            <Sun className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-[#030303] dark:text-[#FAFAFA]">إضاءة واضحة ومباشرة</p>
              <p className="text-[#52525B] dark:text-[#A1A1AA] mt-0.5">
                تجنب الظلال القوية أو الإضاءة الخافتة لإظهار تفاصيل ومكونات الطبق.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#F8F9FA] dark:bg-[#202024] border border-[#E4E4E7] dark:border-[#27272A]">
            <Maximize2 className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-[#030303] dark:text-[#FAFAFA]">زاوية تصوير 45° إلى 90°</p>
              <p className="text-[#52525B] dark:text-[#A1A1AA] mt-0.5">
                صوّر من زاوية علوية أو مائلة لتشمل كامل محتويات الطبق دون حجب.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#F8F9FA] dark:bg-[#202024] border border-[#E4E4E7] dark:border-[#27272A]">
            <Scan className="w-4 h-4 text-[#16A34A] dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-[#030303] dark:text-[#FAFAFA]">مقياس بصري للمعايرة</p>
              <p className="text-[#52525B] dark:text-[#A1A1AA] mt-0.5">
                تمركز الطبق في الإطار يساعد الذكاء الاصطناعي في تقدير الحجم والجرام بدقة.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#F8F9FA] dark:bg-[#202024] border border-[#E4E4E7] dark:border-[#27272A]">
            <ShieldAlert className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-[#030303] dark:text-[#FAFAFA]">الأطعمة المغلفة والمنتجات</p>
              <p className="text-[#52525B] dark:text-[#A1A1AA] mt-0.5">
                صوّر جدول الحقائق الغذائية المطبوع على الغلاف للحصول على قراءة مؤكدة 100%.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
