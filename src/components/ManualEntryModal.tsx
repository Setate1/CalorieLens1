import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { PenTool, Sparkles, X } from "lucide-react";

interface ManualEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (textDescription: string) => void;
}

export const ManualEntryModal: React.FC<ManualEntryModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [foodText, setFoodText] = useState("");

  const quickSamples = [
    "طبق كشري مصري متوسط الحجم",
    "صدر دجاج مشوي 150 جم مع أرز أبيض وسلطة",
    "سلطة خضراء مع جبنة فيتا وملعقة زيت زيتون",
    "2 بيضة مسلوقة مع شريحة توست أسمر",
    "ساندوتش شاورما دجاج مع ثومية وبطاطس",
    "علبة تونة مصفاة 140 جم مع نصف رغيف بلدي",
  ];

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (foodText.trim()) {
      onSubmit(foodText.trim());
      setFoodText("");
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="manual-entry-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          dir="rtl"
          onClick={onClose}
        >
          <motion.div
            key="manual-entry-modal-card"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 text-right"
          >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#DDEFB5] dark:bg-[#14532D] border border-[#C5E193] dark:border-emerald-700/40 text-[#14532D] dark:text-[#86EFAC] flex items-center justify-center shadow-xs">
              <PenTool className="w-5 h-5 text-[#14532D] dark:text-[#86EFAC]" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-[#030303] dark:text-[#FAFAFA]">
                إضافة وجبة يدويًا (الوصف النصي)
              </h3>
              <p className="text-xs text-[#71717A] dark:text-[#A1A1AA]">
                اكتب مكونات الوجبة والكمية التقريبية لتقدير الماكروز
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#71717A] dark:text-[#A1A1AA] hover:text-[#030303] dark:hover:text-white hover:bg-[#F3F3F5] dark:hover:bg-[#27272A] transition-colors cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Suggestions Chips */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-[#52525B] dark:text-[#A1A1AA] block">
            أمثلة سريعة للتجربة:
          </label>
          <div className="flex flex-wrap gap-1.5">
            {quickSamples.map((sample, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setFoodText(sample)}
                className="px-2.5 py-1 rounded-xl bg-[#F8F9FA] dark:bg-[#202024] hover:bg-[#DDEFB5] dark:hover:bg-[#14532D] hover:text-[#14532D] dark:hover:text-[#86EFAC] border border-[#E4E4E7] dark:border-[#27272A] text-[#52525B] dark:text-[#D4D4D8] text-[11px] font-medium transition-colors cursor-pointer"
              >
                {sample}
              </button>
            ))}
          </div>
        </div>

        {/* Input textarea */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#030303] dark:text-[#FAFAFA] block">
              وصف الوجبة والمكونات:
            </label>
            <textarea
              value={foodText}
              onChange={(e) => setFoodText(e.target.value)}
              placeholder="اكتب وصف الوجبة هنا (مثال: طبق أرز بسمتي 200 جرام مع شريحة سلمون مشوي وسلطة خضراء)"
              rows={4}
              className="w-full p-3.5 rounded-2xl bg-[#F8F9FA] dark:bg-[#202024] border border-[#E4E4E7] dark:border-[#27272A] text-[#030303] dark:text-[#FAFAFA] placeholder-[#A1A1AA] dark:placeholder-[#71717A] text-sm focus:outline-none focus:border-emerald-600 focus:bg-white dark:focus:bg-[#18181B] transition-all resize-none font-medium"
              autoFocus
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={!foodText.trim()}
              className="flex-1 py-3 px-4 rounded-2xl bg-[#030303] dark:bg-emerald-600 hover:bg-[#27272A] dark:hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer min-h-[46px]"
            >
              <Sparkles className="w-4 h-4 text-emerald-400 dark:text-emerald-200" />
              <span>تحليل الوجبة وتقدير الماكروز</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="py-3 px-4 rounded-2xl bg-[#F3F3F5] dark:bg-[#27272A] hover:bg-[#E4E4E7] dark:hover:bg-[#3F3F46] text-[#71717A] dark:text-[#A1A1AA] hover:text-[#030303] dark:hover:text-white font-bold text-sm transition-colors cursor-pointer min-h-[46px]"
            >
              إلغاء
            </button>
          </div>
        </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
