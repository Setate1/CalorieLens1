import React from "react";
import { motion } from "motion/react";
import { Sparkles, RotateCcw, CheckCircle2, Camera } from "lucide-react";

interface PreviewScreenProps {
  imageUrl: string;
  onAnalyze: () => void;
  onRetake: () => void;
  isLoading?: boolean;
}

export const PreviewScreen: React.FC<PreviewScreenProps> = ({
  imageUrl,
  onAnalyze,
  onRetake,
  isLoading = false,
}) => {
  return (
    <div className="flex-1 flex flex-col justify-between p-4 sm:p-8 max-w-4xl mx-auto w-full animate-fade-in space-y-6 text-[#030303] dark:text-[#FAFAFA]">
      {/* Header Info */}
      <div className="text-center pt-2">
        <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#DDEFB5] dark:bg-[#14532D] border border-[#C5E193] dark:border-emerald-700/40 text-[#14532D] dark:text-[#86EFAC] text-xs font-semibold mb-2 shadow-xs">
          <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A] dark:text-emerald-400" />
          Photo Ready
        </span>
        <h2 className="text-xl sm:text-3xl font-bold text-[#030303] dark:text-[#FAFAFA]">
          Confirm Your Meal Photo
        </h2>
        <p className="text-xs sm:text-sm text-[#71717A] dark:text-[#A1A1AA] mt-1">
          Make sure food items and plate boundaries are clearly visible
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        {/* Uploaded Image Card */}
        <div className="md:col-span-7 relative rounded-[20px] overflow-hidden bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] shadow-sm aspect-4/3 flex items-center justify-center group max-w-lg mx-auto w-full">
          {imageUrl && imageUrl.trim() !== "" ? (
            <motion.img
              initial={{ scale: 0.97, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              src={imageUrl}
              alt="Selected meal preview"
              decoding="async"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-[#71717A] dark:text-[#A1A1AA] p-4">
              <Camera className="w-12 h-12 stroke-[1.5] mb-2 text-[#71717A] dark:text-[#A1A1AA] opacity-40" />
              <span className="text-xs font-medium">جاري تجهيز المعاينة...</span>
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />

          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs">
            <span className="bg-white/95 dark:bg-[#18181B]/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] font-medium text-[#030303] dark:text-[#FAFAFA] shadow-xs">
              Ready for Vision Scan
            </span>
            <button
              id="retake-photo-button"
              type="button"
              onClick={onRetake}
              className="flex items-center gap-1.5 bg-white/95 dark:bg-[#18181B]/95 hover:bg-white dark:hover:bg-[#27272A] backdrop-blur-md px-3 py-1.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] font-semibold transition-all active:scale-95 cursor-pointer text-[#030303] dark:text-[#FAFAFA] shadow-xs min-h-[36px]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Change
            </button>
          </div>
        </div>

        {/* Actions & Instructions */}
        <div className="md:col-span-5 space-y-4 flex flex-col justify-center">
          <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-2xl p-4 text-xs sm:text-sm text-[#52525B] dark:text-[#A1A1AA] space-y-2 shadow-xs">
            <p className="font-semibold text-[#030303] dark:text-[#FAFAFA]">
              💡 نصائح لدقة أعلى:
            </p>
            <ul className="list-disc list-inside space-y-1 text-xs text-[#52525B] dark:text-[#A1A1AA]">
              <li>تأكد من إضاءة الطبق بشكل واضح.</li>
              <li>إذا كان هناك زيت طهي إضافي، يمكنك تفعيله لاحقاً.</li>
              <li>يمكنك تعديل أوزان المكونات يدوياً بعد الفحص.</li>
            </ul>
          </div>

          <div className="space-y-3 pt-2">
            <button
              id="analyze-meal-button"
              type="button"
              disabled={isLoading}
              onClick={onAnalyze}
              className="w-full py-4 px-6 rounded-2xl bg-[#16A34A] hover:bg-[#15803D] active:scale-[0.99] text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-md shadow-[#16A34A]/20 transition-all disabled:opacity-50 cursor-pointer min-h-[48px]"
            >
              <Sparkles className="w-5 h-5 text-white animate-pulse" />
              <span>Analyze Meal (فحص الوجبة)</span>
            </button>

            <button
              id="choose-different-photo-button"
              type="button"
              disabled={isLoading}
              onClick={onRetake}
              className="w-full py-3.5 px-4 rounded-2xl bg-white dark:bg-[#18181B] hover:bg-[#F3F3F5] dark:hover:bg-[#27272A] text-[#52525B] dark:text-[#E4E4E7] hover:text-[#030303] dark:hover:text-white border border-[#E4E4E7] dark:border-[#27272A] font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer min-h-[44px] shadow-xs"
            >
              <RotateCcw className="w-4 h-4 text-[#71717A] dark:text-[#A1A1AA]" />
              <span>Select a Different Photo</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
