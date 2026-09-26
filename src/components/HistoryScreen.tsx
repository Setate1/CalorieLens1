import React, { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Clock,
  Flame,
  Scale,
  Sparkles,
  Trash2,
  RefreshCw,
  Search,
  Database,
  Camera,
  Calendar,
  AlertCircle,
  ShieldCheck,
  Edit3,
  Check,
  X,
  Dumbbell,
  Wheat,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  subscribeToUserNutritionLogs,
  deleteNutritionLogFromFirestore,
  updateNutritionLogInFirestore,
  syncPendingLocalMealsToFirestore,
} from "../services/firestoreService";
import { NutritionLogRecord, DetectedFood } from "../types";
import { ComponentWeightModal } from "./ComponentWeightModal";
import {
  getAllMeals,
  updateMeal,
  deleteMeal,
  formatFriendlyDate,
  formatDayAndMonth,
  extractLocalDateString,
  parseToLocalDate,
  getLocalMealsAsNutritionLogs,
} from "../utils/dailyStorage";
import {
  parseLogComponents,
  recalculateFoodItemNutrition,
  recalculateFoodItemWithExactNutrients,
  aggregateMealNutrients,
} from "../utils/nutritionCalculations";
import { upsertKnownMealCorrection } from "../services/knownMealsService";
import { Timestamp } from "firebase/firestore";

interface HistoryScreenProps {
  onScanNewMeal: () => void;
}

export const HistoryScreen: React.FC<HistoryScreenProps> = ({ onScanNewMeal }) => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<NutritionLogRecord[]>(() => getLocalMealsAsNutritionLogs(user?.uid));
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editSuccessNotice, setEditSuccessNotice] = useState<string | null>(null);

  // Weight Correction Modal State (Feature: Edit weight of any Firestore history entry)
  const [editingLog, setEditingLog] = useState<NutritionLogRecord | null>(null);
  const [editWeightInput, setEditWeightInput] = useState<string>("");
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  // Manual Nutrition Override Modal State (Feature 2: Edit kcal, protein, carbs, fat independently)
  const [editingNutritionLog, setEditingNutritionLog] = useState<NutritionLogRecord | null>(null);
  const [historyKcalInput, setHistoryKcalInput] = useState<string>("");
  const [historyProteinInput, setHistoryProteinInput] = useState<string>("");
  const [historyCarbsInput, setHistoryCarbsInput] = useState<string>("");
  const [historyFatInput, setHistoryFatInput] = useState<string>("");
  const [isSavingNutritionEdit, setIsSavingNutritionEdit] = useState<boolean>(false);

  // Expanded meal log components and component-level weight editing
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [editingHistoryComponent, setEditingHistoryComponent] = useState<{
    log: NutritionLogRecord;
    item: DetectedFood;
    index: number;
  } | null>(null);
  const [isSavingHistoryComponent, setIsSavingHistoryComponent] = useState<boolean>(false);

  // Merges Firestore logs with any pending local storage records
  const mergeLogs = (firestoreLogs: NutritionLogRecord[]) => {
    const localLogs = getLocalMealsAsNutritionLogs(user?.uid);
    const seenIds = new Set<string>();
    const merged: NutritionLogRecord[] = [];

    // 1. Add all Firestore logs
    firestoreLogs.forEach((fLog) => {
      if (fLog.id) seenIds.add(fLog.id);
      merged.push(fLog);
    });

    // 2. Add local entries that are not in Firestore (e.g. saved locally / offline / pending)
    localLogs.forEach((lLog) => {
      if (!lLog.id) return;
      if (seenIds.has(lLog.id)) return;

      const matchedByContent = firestoreLogs.some((fl) => {
        const flTime =
          fl.createdAt instanceof Timestamp
            ? fl.createdAt.toMillis()
            : typeof fl.createdAt === "number"
            ? fl.createdAt
            : new Date(fl.createdAt || 0).getTime();
        const llTime =
          typeof lLog.createdAt === "number"
            ? lLog.createdAt
            : new Date(lLog.createdAt || 0).getTime();
        return fl.foodName === lLog.foodName && Math.abs(flTime - llTime) < 20000;
      });

      if (!matchedByContent) {
        seenIds.add(lLog.id);
        merged.push(lLog);
      }
    });

    // 3. Sort descending by creation date/time
    return merged.sort((a, b) => {
      const timeA =
        a.createdAt instanceof Timestamp
          ? a.createdAt.toMillis()
          : a.createdAt?.seconds
          ? a.createdAt.seconds * 1000
          : typeof a.createdAt === "number"
          ? a.createdAt
          : new Date(a.createdAt || 0).getTime();
      const timeB =
        b.createdAt instanceof Timestamp
          ? b.createdAt.toMillis()
          : b.createdAt?.seconds
          ? b.createdAt.seconds * 1000
          : typeof b.createdAt === "number"
          ? b.createdAt
          : new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });
  };

  useEffect(() => {
    // Initial display from local storage
    const initialLocal = getLocalMealsAsNutritionLogs(user?.uid);
    if (initialLocal.length > 0) {
      setLogs(initialLocal);
    }

    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    // Trigger background sync for any unsynced local meals
    syncPendingLocalMealsToFirestore(user.uid).catch((err) =>
      console.warn("Background sync error on HistoryScreen mount:", err)
    );

    const unsubscribe = subscribeToUserNutritionLogs(
      user.uid,
      (updatedLogs) => {
        setLogs(mergeLogs(updatedLogs));
        setIsLoading(false);
      },
      (error) => {
        console.warn("Error subscribing to history:", error);
        setErrorMsg("تعذر الاتصال بـ Firestore السحابي مؤقتاً. يتم عرض السجل المحفوظ محلياً.");
        setIsLoading(false);
      }
    );

    const handleLocalMealsUpdated = () => {
      setLogs((prev) => mergeLogs(prev));
    };

    window.addEventListener("calorielens_meals_updated", handleLocalMealsUpdated);

    return () => {
      unsubscribe();
      window.removeEventListener("calorielens_meals_updated", handleLocalMealsUpdated);
    };
  }, [user]);

  const handleDelete = async (id?: string) => {
    if (!id || deletingId) return;

    try {
      setDeletingId(id);
      // Delete from local storage immediately
      deleteMeal(id);
      // Delete from Firestore if it's a Firestore document
      if (!id.startsWith("meal-")) {
        await deleteNutritionLogFromFirestore(id);
      }
      setLogs((prev) => prev.filter((l) => l.id !== id));
      window.dispatchEvent(new Event("calorielens_meals_updated"));
    } catch (err: any) {
      console.error("Failed to delete log:", err);
      setErrorMsg("تعذر حذف العنصر من السجل السحابي.");
    } finally {
      setDeletingId(null);
    }
  };

  // Open the weight edit modal for a specific saved entry
  const handleOpenEdit = (log: NutritionLogRecord) => {
    setEditingLog(log);
    setEditWeightInput(String(log.weight > 0 ? log.weight : 100));
    setErrorMsg(null);
    setEditSuccessNotice(null);
  };

  const handleCloseEdit = () => {
    setEditingLog(null);
    setEditWeightInput("");
  };

  // Save the new weight and update Firestore with proportionally recalculated macros
  const handleSaveWeightCorrection = async () => {
    if (!editingLog) return;
    const newWeight = parseFloat(editWeightInput);
    if (isNaN(newWeight) || newWeight <= 0 || newWeight > 10000) {
      return;
    }

    const currentWeight =
      Number(editingLog.weight) ||
      (editingLog.original_weight ? Number(editingLog.original_weight) : 0) ||
      100;

    const ratio = newWeight / (currentWeight > 0 ? currentWeight : 1);

    const newCalories = Math.max(
      0,
      Math.round((Number(editingLog.calories) || 0) * ratio)
    );
    const newProtein =
      Math.round((Number(editingLog.protein) || 0) * ratio * 10) / 10;
    const newCarbs =
      Math.round((Number(editingLog.carbs) || 0) * ratio * 10) / 10;
    const newFat =
      Math.round((Number(editingLog.fat) || 0) * ratio * 10) / 10;

    const originalWeight =
      editingLog.original_weight ||
      editingLog.weight ||
      Math.round(currentWeight);

    // Proportionally scale individual components if present so they persist accurately
    const currentComponents = parseLogComponents(editingLog);
    const updatedItems: DetectedFood[] = currentComponents.map((it) => {
      const itWeight = Math.max(1, Math.round((Number(it.weight_g) || 100) * ratio));
      return recalculateFoodItemNutrition(it, itWeight);
    });

    const totals = aggregateMealNutrients(updatedItems);
    const itemsSummary = totals.itemsSummary;

    try {
      setIsSavingEdit(true);

      // Update Firestore document directly with new totals AND scaled components
      await updateNutritionLogInFirestore(editingLog.id, {
        weight: Math.round(newWeight),
        calories: totals.calories,
        protein: totals.protein_g,
        carbs: totals.carbs_g,
        fat: totals.fat_g,
        is_manually_corrected: true,
        original_weight: originalWeight,
        items: updatedItems,
        itemsSummary,
      });

      // Update local state immediately for instant feedback
      setLogs((prev) =>
        prev.map((l) =>
          l.id === editingLog.id
            ? {
                ...l,
                weight: Math.round(newWeight),
                calories: totals.calories,
                protein: totals.protein_g,
                carbs: totals.carbs_g,
                fat: totals.fat_g,
                is_manually_corrected: true,
                original_weight: originalWeight,
                items: updatedItems,
                itemsSummary,
              }
            : l
        )
      );

      // Synchronize matching local meal so daily totals update without re-fetching
      const localMeals = getAllMeals();
      const matched = localMeals.find(
        (m) =>
          m.firestoreDocId === editingLog.id ||
          m.id === editingLog.id ||
          m.title === editingLog.foodName
      );
      if (matched) {
        updateMeal({
          ...matched,
          items: updatedItems,
          calories: totals.calories,
          protein_g: totals.protein_g,
          carbs_g: totals.carbs_g,
          fat_g: totals.fat_g,
          wasEdited: true,
          is_manually_corrected: true,
          original_weight: originalWeight,
        });
      }

      // Learn correction into Meal Memory
      upsertKnownMealCorrection(user?.uid || editingLog.uid, editingLog.foodName, updatedItems, {
        calories: totals.calories,
        protein: totals.protein_g,
        carbs: totals.carbs_g,
        fat: totals.fat_g,
        weight: Math.round(newWeight),
      }).catch((err) => console.warn("Failed to learn correction:", err));

      setEditSuccessNotice(
        `تم تحديث وزن "${editingLog.foodName}" إلى ${Math.round(newWeight)}g وإعادة حساب السعرات والماكروز تلقائياً وحفظها سحابياً.`
      );
      handleCloseEdit();
    } catch (err: any) {
      console.error("Failed to update weight in Firestore:", err);
      setErrorMsg("تعذر تحديث السجل في Firestore. يرجى المحاولة مرة أخرى.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Open independent nutrition values editor modal
  const handleOpenNutritionEdit = (log: NutritionLogRecord) => {
    setEditingNutritionLog(log);
    setHistoryKcalInput(String(Math.round(log.calories)));
    setHistoryProteinInput(String(log.protein));
    setHistoryCarbsInput(String(log.carbs));
    setHistoryFatInput(String(log.fat));
    setErrorMsg(null);
    setEditSuccessNotice(null);
  };

  const handleCloseNutritionEdit = () => {
    setEditingNutritionLog(null);
    setHistoryKcalInput("");
    setHistoryProteinInput("");
    setHistoryCarbsInput("");
    setHistoryFatInput("");
  };

  // Save independent nutrition override values and update Firestore + daily logs
  const handleSaveNutritionOverride = async () => {
    if (!editingNutritionLog || !editingNutritionLog.id) return;
    const newKcal = Math.max(0, Math.round(parseFloat(historyKcalInput) || 0));
    const newProtein = Math.round(Math.max(0, parseFloat(historyProteinInput) || 0) * 10) / 10;
    const newCarbs = Math.round(Math.max(0, parseFloat(historyCarbsInput) || 0) * 10) / 10;
    const newFat = Math.round(Math.max(0, parseFloat(historyFatInput) || 0) * 10) / 10;

    const currentComponents = getLogComponents(editingNutritionLog);
    const oldCalTotal = Math.max(1, editingNutritionLog.calories || 1);
    const updatedItems: DetectedFood[] = currentComponents.map((it) => {
      const share = (it.calories || 0) / oldCalTotal;
      return {
        ...it,
        calories: Math.round(newKcal * share),
        protein_g: Math.round(newProtein * share * 10) / 10,
        carbs_g: Math.round(newCarbs * share * 10) / 10,
        fat_g: Math.round(newFat * share * 10) / 10,
        is_manually_corrected: true,
        is_fully_manually_corrected: true,
      };
    });

    const itemsSummary = updatedItems
      .map((i) => `${i.item_name} (${Math.round(i.calories)} kcal)`)
      .join(", ");

    try {
      setIsSavingNutritionEdit(true);

      await updateNutritionLogInFirestore(editingNutritionLog.id, {
        calories: newKcal,
        protein: newProtein,
        carbs: newCarbs,
        fat: newFat,
        is_fully_manually_corrected: true,
        is_manually_corrected: true,
        items: updatedItems,
        itemsSummary,
      });

      // Update local state immediately
      setLogs((prev) =>
        prev.map((l) =>
          l.id === editingNutritionLog.id
            ? {
                ...l,
                calories: newKcal,
                protein: newProtein,
                carbs: newCarbs,
                fat: newFat,
                is_fully_manually_corrected: true,
                is_manually_corrected: true,
                items: updatedItems,
                itemsSummary,
              }
            : l
        )
      );

      // Synchronize matching local meal if any so daily totals and charts update immediately
      const localMeals = getAllMeals();
      const matched = localMeals.find(
        (m) =>
          m.firestoreDocId === editingNutritionLog.id ||
          m.id === editingNutritionLog.id ||
          m.title === editingNutritionLog.foodName
      );
      if (matched) {
        updateMeal({
          ...matched,
          items: updatedItems,
          calories: newKcal,
          protein_g: newProtein,
          carbs_g: newCarbs,
          fat_g: newFat,
          wasEdited: true,
          is_manually_corrected: true,
          is_fully_manually_corrected: true,
        });
      }

      // Learn nutrition correction into Meal Memory
      upsertKnownMealCorrection(user?.uid || editingNutritionLog.uid, editingNutritionLog.foodName, updatedItems, {
        calories: newKcal,
        protein: newProtein,
        carbs: newCarbs,
        fat: newFat,
        weight: editingNutritionLog.weight,
      }).catch((err) => console.warn("Failed to learn correction:", err));

      setEditSuccessNotice(
        `تم تحديث القيم الغذائية لـ "${editingNutritionLog.foodName}" يدويًا بنجاح وتحديث السجل والمجموع اليومي سحابياً.`
      );
      handleCloseNutritionEdit();
    } catch (err: any) {
      console.error("Failed to update nutrition in Firestore:", err);
      setErrorMsg("تعذر تحديث القيم الغذائية في Firestore. يرجى المحاولة مرة أخرى.");
    } finally {
      setIsSavingNutritionEdit(false);
    }
  };

  const getLogComponents = (log: NutritionLogRecord): DetectedFood[] => {
    return parseLogComponents(log);
  };

  const handleSaveHistoryComponentWeight = async (
    valuesOrWeight: { weight_g: number; calories: number; protein_g: number; carbs_g: number; fat_g: number } | number
  ) => {
    if (!editingHistoryComponent || !editingHistoryComponent.log.id) return;
    const { log, item, index } = editingHistoryComponent;
    const components = parseLogComponents(log);

    const updatedItem =
      typeof valuesOrWeight === "number"
        ? recalculateFoodItemNutrition(item, valuesOrWeight)
        : recalculateFoodItemWithExactNutrients(item, valuesOrWeight);

    const updatedItems = [...components];
    updatedItems[index] = updatedItem;

    const totals = aggregateMealNutrients(updatedItems);
    const itemsSummary = totals.itemsSummary;

    // Update local state immediately
    setLogs((prev) =>
      prev.map((l) =>
        l.id === log.id
          ? {
              ...l,
              weight: totals.weight_g,
              calories: totals.calories,
              protein: totals.protein_g,
              carbs: totals.carbs_g,
              fat: totals.fat_g,
              is_manually_corrected: true,
              items: updatedItems,
              itemsSummary,
            }
          : l
      )
    );

    try {
      setIsSavingHistoryComponent(true);
      await updateNutritionLogInFirestore(log.id, {
        weight: totals.weight_g,
        calories: totals.calories,
        protein: totals.protein_g,
        carbs: totals.carbs_g,
        fat: totals.fat_g,
        is_manually_corrected: true,
        items: updatedItems,
        itemsSummary,
      });

      // Synchronize matching local meal if any
      const localMeals = getAllMeals();
      const matched = localMeals.find(
        (m) =>
          m.firestoreDocId === log.id ||
          m.id === log.id ||
          m.title === log.foodName
      );
      if (matched) {
        updateMeal({
          ...matched,
          items: updatedItems,
          calories: totals.calories,
          protein_g: totals.protein_g,
          carbs_g: totals.carbs_g,
          fat_g: totals.fat_g,
          wasEdited: true,
          is_manually_corrected: true,
          original_weight: totals.weight_g,
        });
      }

      // Learn component weight correction into Meal Memory
      upsertKnownMealCorrection(user?.uid || log.uid, log.foodName, updatedItems, {
        calories: totals.calories,
        protein: totals.protein_g,
        carbs: totals.carbs_g,
        fat: totals.fat_g,
        weight: totals.weight_g,
      }).catch((err) => console.warn("Failed to learn correction:", err));

      setEditSuccessNotice(
        `تم تحديث بيانات ومكون "${item.item_name}" (${updatedItem.weight_g}g, ${updatedItem.calories} kcal) وإعادة حساب الوجبة في السجل السحابي بنجاح`
      );
      setEditingHistoryComponent(null);
    } catch (err: any) {
      console.error("Failed to update component weight in Firestore:", err);
      setErrorMsg("تعذر تحديث المكون في السجل السحابي. يرجى المحاولة ثانية.");
    } finally {
      setIsSavingHistoryComponent(false);
    }
  };

  const formatDate = (timestamp: any): string => {
    if (!timestamp) return "الآن";
    try {
      const date = parseToLocalDate(timestamp);
      return date.toLocaleTimeString("ar-EG", {
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return "الآن";
    }
  };

  const filteredLogs = logs.filter((item) =>
    item.foodName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group logs by local date string
  const groupedLogs = useMemo(() => {
    const groupMap = new Map<string, NutritionLogRecord[]>();

    filteredLogs.forEach((log) => {
      const dateStr = extractLocalDateString({
        date: log.date,
        createdAt: log.createdAt,
      });

      if (!groupMap.has(dateStr)) {
        groupMap.set(dateStr, []);
      }
      groupMap.get(dateStr)!.push(log);
    });

    const sortedDates = Array.from(groupMap.keys()).sort((a, b) => b.localeCompare(a));

    return sortedDates.map((dateStr) => {
      const dayLogs = groupMap.get(dateStr)!;
      const dayCalories = Math.round(dayLogs.reduce((sum, l) => sum + (l.calories || 0), 0));
      const dayProtein = Math.round(dayLogs.reduce((sum, l) => sum + (l.protein || 0), 0) * 10) / 10;
      return {
        dateStr,
        friendlyDate: formatFriendlyDate(dateStr),
        dayAndMonth: formatDayAndMonth(dateStr),
        totalCalories: dayCalories,
        totalProtein: dayProtein,
        logs: dayLogs,
      };
    });
  }, [filteredLogs]);

  const totalCloudCalories = logs.reduce((sum, log) => sum + (log.calories || 0), 0);
  const totalCloudProtein = logs.reduce((sum, log) => sum + (log.protein || 0), 0);

  // Live calculation preview values for the editing modal
  const previewNewWeight = parseFloat(editWeightInput) || 0;
  const editingBaseWeight = editingLog
    ? Number(editingLog.weight) || (editingLog.original_weight ? Number(editingLog.original_weight) : 0) || 100
    : 100;
  const previewRatio = previewNewWeight > 0 ? previewNewWeight / editingBaseWeight : 1;
  const previewCalories = editingLog
    ? Math.max(0, Math.round((Number(editingLog.calories) || 0) * previewRatio))
    : 0;
  const previewProtein = editingLog
    ? Math.round((Number(editingLog.protein) || 0) * previewRatio * 10) / 10
    : 0;
  const previewCarbs = editingLog
    ? Math.round((Number(editingLog.carbs) || 0) * previewRatio * 10) / 10
    : 0;
  const previewFat = editingLog
    ? Math.round((Number(editingLog.fat) || 0) * previewRatio * 10) / 10
    : 0;

  return (
    <div className="flex-1 flex flex-col p-4 space-y-4 max-w-md mx-auto w-full text-[#030303] dark:text-[#FAFAFA]">
      {/* Header Banner */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-[#030303] dark:text-[#FAFAFA] flex items-center gap-2">
            <Database className="w-5 h-5 text-[#16A34A] dark:text-emerald-400" />
            <span>السجل السحابي (Firestore)</span>
          </h2>
          <p className="text-xs text-[#71717A] dark:text-[#A1A1AA] flex items-center gap-1.5">
            <span>سجل التحليلات والوجبات المحفوظة بحسابك</span>
            {isLoading && (
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>جاري المزامنة...</span>
              </span>
            )}
          </p>
        </div>

        <button
          id="history-scan-btn"
          type="button"
          onClick={onScanNewMeal}
          className="px-3 py-1.5 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
        >
          <Camera className="w-3.5 h-3.5" />
          <span>مسح وجبة</span>
        </button>
      </div>

      {/* Summary Stats Card */}
      <div className="p-3.5 rounded-2xl bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] shadow-xs">
        <div className="grid grid-cols-3 gap-2 text-center divide-x divide-[#E4E4E7] dark:divide-[#27272A] divide-x-reverse">
          <div>
            <span className="text-[10px] text-[#71717A] dark:text-[#A1A1AA] block font-medium">
              الوجبات المسجلة
            </span>
            <span className="text-base font-black text-[#030303] dark:text-[#FAFAFA] font-mono">
              {logs.length}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-[#71717A] dark:text-[#A1A1AA] block font-medium">
              إجمالي السعرات
            </span>
            <span className="text-base font-black text-[#16A34A] dark:text-emerald-400 font-mono">
              {Math.round(totalCloudCalories)} <span className="text-[10px] font-sans">kcal</span>
            </span>
          </div>
          <div>
            <span className="text-[10px] text-[#71717A] dark:text-[#A1A1AA] block font-medium">
              إجمالي البروتين
            </span>
            <span className="text-base font-black text-rose-600 dark:text-rose-400 font-mono">
              {Math.round(totalCloudProtein)} <span className="text-[10px] font-sans">g</span>
            </span>
          </div>
        </div>
      </div>

      {/* Success Notification Banner */}
      {editSuccessNotice && (
        <div
          id="history-edit-success-banner"
          className="p-3 rounded-2xl bg-[#DDEFB5]/50 dark:bg-[#14532D]/40 border border-[#C5E193] dark:border-emerald-700/40 text-[#14532D] dark:text-[#86EFAC] text-xs flex items-center justify-between gap-2 shadow-xs animate-fadeIn"
          dir="rtl"
        >
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-[#16A34A] dark:text-emerald-400 shrink-0" />
            <span className="font-medium">{editSuccessNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setEditSuccessNotice(null)}
            className="text-[#14532D] dark:text-[#86EFAC] hover:text-[#030303] dark:hover:text-white p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Search Field */}
      {logs.length > 0 && (
        <div className="relative">
          <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-zinc-400 dark:text-zinc-500">
            <Search className="w-3.5 h-3.5" />
          </div>
          <input
            id="history-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث في الوجبات المحفوظة..."
            className="w-full bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-2xl py-2 pr-9 pl-4 text-xs text-[#030303] dark:text-[#FAFAFA] placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-[#16A34A] transition-all text-right"
          />
        </div>
      )}

      {/* Error Notice */}
      {errorMsg && (
        <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/40 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Loading Skeleton State when no data is in memory yet */}
      {isLoading && logs.length === 0 ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="rounded-3xl bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] p-4 shadow-xs space-y-3 animate-pulse"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#F3F3F5] dark:bg-[#202024]" />
                  <div className="space-y-1.5">
                    <div className="w-24 h-4 bg-[#E4E4E7] dark:bg-[#27272A] rounded-xs" />
                    <div className="w-16 h-3 bg-[#E4E4E7] dark:bg-[#27272A] rounded-xs" />
                  </div>
                </div>
                <div className="w-16 h-6 bg-[#E4E4E7] dark:bg-[#27272A] rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredLogs.length === 0 ? (
        /* Empty State */
        <div className="py-12 px-4 text-center rounded-3xl bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-[#DDEFB5] dark:bg-[#14532D] text-[#14532D] dark:text-[#86EFAC] flex items-center justify-center mx-auto border border-[#C5E193] dark:border-emerald-700/40">
            <Database className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-[#030303] dark:text-[#FAFAFA]">
            {searchQuery ? "لم يتم العثور على نتائج للبحث" : "لا توجد وجبات مسجلة حتى الآن"}
          </h3>
          <p className="text-xs text-[#71717A] dark:text-[#A1A1AA] max-w-xs mx-auto">
            {searchQuery
              ? "جرّب البحث بكلمة أخرى أو امسح حقل البحث."
              : "عند تحليل أي وجبة بالذكاء الاصطناعي، سيتم حفظها هنا تلقائياً في السجل السحابي."}
          </p>
          {!searchQuery && (
            <button
              id="empty-history-scan-btn"
              type="button"
              onClick={onScanNewMeal}
              className="mt-2 px-4 py-2 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>ابدأ مسح أول وجبة</span>
            </button>
          )}
        </div>
      ) : (
        /* Logs List Grouped by Local Day */
        <div className="space-y-6">
          <AnimatePresence>
            {groupedLogs.map((group) => (
              <div key={group.dateStr} className="space-y-3">
                {/* Day Header */}
                <div className="flex items-center justify-between px-3 py-2 bg-[#F4F4F5] dark:bg-[#202024] rounded-xl border border-[#E4E4E7] dark:border-[#27272A]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Calendar className="w-4 h-4 text-[#16A34A] dark:text-emerald-400" />
                    <span className="text-xs sm:text-sm font-bold text-[#030303] dark:text-[#FAFAFA]">
                      {group.friendlyDate}
                    </span>
                    <span className="text-[11px] sm:text-xs text-[#71717A] dark:text-[#A1A1AA] font-mono">
                      ({group.dateStr})
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] sm:text-xs font-mono font-bold">
                    <span className="text-[#16A34A] dark:text-emerald-400">
                      {group.totalCalories} kcal
                    </span>
                    <span className="text-zinc-400 dark:text-zinc-600">•</span>
                    <span className="text-rose-600 dark:text-rose-400">
                      {group.totalProtein}g بروتين
                    </span>
                  </div>
                </div>

                {/* Day Meals */}
                <div className="space-y-3">
                  {group.logs.map((log) => (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="p-4 rounded-2xl bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] hover:border-[#16A34A]/40 transition-all shadow-xs space-y-3 relative group"
                    >
                {/* Card Header: Title + Timestamp + Edit Weight + Delete */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 text-right">
                  <h4 className="text-sm font-bold text-[#030303] dark:text-[#FAFAFA] line-clamp-2">
                    {log.foodName}
                  </h4>
                  <div className="flex items-center gap-1.5 text-[10px] text-[#71717A] dark:text-[#A1A1AA] mt-1 flex-wrap">
                    <Clock className="w-3 h-3 text-zinc-400 dark:text-zinc-500" />
                    <span>{formatDate(log.createdAt)}</span>
                    {log.confidence > 0 && (
                      <span className="bg-[#DDEFB5] dark:bg-[#14532D] text-[#14532D] dark:text-[#86EFAC] px-1.5 py-0.2 rounded border border-[#C5E193] dark:border-emerald-700/40 text-[9px] font-mono">
                        دقة {log.confidence}%
                      </span>
                    )}
                    {log.is_text_entry && (
                      <span className="bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 px-1.5 py-0.2 rounded border border-amber-200 dark:border-amber-800/40 text-[9px] font-semibold flex items-center gap-0.5">
                        <span>إدخال يدوي</span>
                      </span>
                    )}
                    {log.is_fully_manually_corrected ? (
                      <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 px-1.5 py-0.2 rounded border border-emerald-200 dark:border-emerald-800/40 text-[9px] font-semibold flex items-center gap-0.5 shadow-xs">
                        <Check className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                        <span>تم التعديل يدويًا بالكامل</span>
                      </span>
                    ) : log.is_manually_corrected ? (
                      <span className="bg-[#DDEFB5] dark:bg-[#14532D] text-[#14532D] dark:text-[#86EFAC] px-1.5 py-0.2 rounded border border-[#C5E193] dark:border-emerald-700/40 text-[9px] font-semibold flex items-center gap-0.5">
                        <Check className="w-2.5 h-2.5 text-[#14532D] dark:text-[#86EFAC]" />
                        <span>تم التصحيح يدويًا</span>
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* Delete Button */}
                  <button
                    id={`delete-log-${log.id}`}
                    type="button"
                    onClick={() => handleDelete(log.id)}
                    disabled={deletingId === log.id}
                    className="p-1.5 rounded-lg text-zinc-400 dark:text-zinc-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                    title="حذف من السجل"
                  >
                    {deletingId === log.id ? (
                      <div className="w-4 h-4 border-2 border-rose-600 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Expandable Components Breakdown */}
              {(() => {
                const logComponents = getLogComponents(log);
                const isExpanded = expandedLogId === log.id;
                if (!logComponents || logComponents.length === 0) return null;

                return (
                  <div className="rounded-xl overflow-hidden border border-[#E4E4E7] dark:border-[#27272A] bg-[#F8F9FA] dark:bg-[#202024]">
                    <button
                      type="button"
                      onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                      className="w-full px-3 py-2 flex items-center justify-between text-xs text-[#52525B] dark:text-[#A1A1AA] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <span className="text-[11px] font-bold text-[#030303] dark:text-[#FAFAFA] flex items-center gap-1.5">
                        <span>مكونات الوجبة المحللة ({logComponents.length})</span>
                        {logComponents.some(
                          (c) => c.is_manually_corrected || c.is_manually_edited
                        ) && (
                          <span className="text-[9px] text-[#14532D] dark:text-[#86EFAC] bg-[#DDEFB5] dark:bg-[#14532D] px-1.5 py-0.2 rounded border border-[#C5E193] dark:border-emerald-700/40">
                            تم التعديل يدويًا
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-1 text-[10px] text-[#71717A] dark:text-[#A1A1AA]">
                        <span>
                          {isExpanded ? "إخفاء التفاصيل" : "عرض المكونات وتعديلها"}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5 text-[#71717A] dark:text-[#A1A1AA]" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-[#71717A] dark:text-[#A1A1AA]" />
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-2.5 pb-2.5 pt-1 border-t border-[#E4E4E7] dark:border-[#27272A] space-y-1.5">
                        <span className="text-[9px] text-[#71717A] dark:text-[#A1A1AA] block text-right">
                          اضغط على أيقونة القلم بجانب أي مكون لتعديل وزنه وإعادة حساب إجمالي الوجبة تلقائيًا
                        </span>
                        <div className="space-y-1">
                          {logComponents.map((it, idx) => (
                            <div
                              key={it.id || idx}
                              className="flex items-center justify-between text-[#030303] dark:text-[#FAFAFA] bg-white dark:bg-[#18181B] p-2 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] hover:border-[#16A34A]/30 transition-colors gap-2"
                            >
                              <div className="flex items-center gap-1.5 flex-1 min-w-0 flex-wrap">
                                <span className="font-semibold break-words min-w-0 text-[#030303] dark:text-[#FAFAFA] text-xs flex-1" dir="auto">
                                  {it.item_name}
                                </span>
                                {(it.is_manually_corrected ||
                                   it.is_manually_edited) && (
                                   <span className="text-[9px] font-semibold text-[#14532D] dark:text-[#86EFAC] bg-[#DDEFB5] dark:bg-[#14532D] px-1.5 py-0.5 rounded border border-[#C5E193] dark:border-emerald-700/40 shrink-0">
                                     تم التعديل يدويًا
                                   </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span
                                  className="text-[10px] text-[#71717A] dark:text-[#A1A1AA] font-mono text-left"
                                  dir="ltr"
                                >
                                  {it.weight_g}g • {it.calories} kcal (P:{" "}
                                  {it.protein_g}g, C: {it.carbs_g}g, F:{" "}
                                  {it.fat_g}g)
                                </span>
                                <button
                                  id={`edit-history-comp-btn-${log.id}-${idx}`}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingHistoryComponent({
                                      log,
                                      item: it,
                                      index: idx,
                                    });
                                  }}
                                  className="p-1 rounded-lg text-zinc-400 dark:text-zinc-500 hover:text-[#16A34A] dark:hover:text-emerald-400 hover:bg-[#F3F3F5] dark:hover:bg-[#27272A] transition-all cursor-pointer"
                                  title={`تعديل وزن ${it.item_name}`}
                                  aria-label={`تعديل وزن ${it.item_name}`}
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Weight & Edit Action Row */}
              <div className="flex items-center justify-between pt-1 border-t border-[#E4E4E7] dark:border-[#27272A]" dir="rtl">
                <div className="flex items-center gap-1.5">
                  <div className="bg-[#DDEFB5] dark:bg-[#14532D] text-[#14532D] dark:text-[#86EFAC] px-2 py-0.5 rounded-lg border border-[#C5E193] dark:border-emerald-700/40 text-[10px] font-mono flex items-center gap-1">
                    <Scale className="w-3 h-3 text-[#14532D] dark:text-[#86EFAC]" />
                    <span className="font-bold">{log.weight > 0 ? `${log.weight}g` : "غير محدد"}</span>
                  </div>

                  {log.original_weight && log.original_weight !== log.weight && (
                    <span className="text-[9px] text-[#71717A] dark:text-[#A1A1AA] line-through font-mono">
                      {log.original_weight}g
                    </span>
                  )}
                </div>

                {/* Action Buttons Row */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Edit Nutrition Values Button */}
                  <button
                    id={`edit-log-nutrition-${log.id}`}
                    type="button"
                    onClick={() => handleOpenNutritionEdit(log)}
                    className="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800/40 text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-xs active:scale-95"
                    title="تعديل السعرات والماكروز يدوياً وبشكل مستقل"
                  >
                    <Edit3 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    <span>تعديل القيم الغذائية</span>
                  </button>

                  {/* Edit Weight Button */}
                  <button
                    id={`edit-log-weight-${log.id}`}
                    type="button"
                    onClick={() => handleOpenEdit(log)}
                    className="px-2 py-1 rounded-lg bg-[#F3F3F5] dark:bg-[#27272A] hover:bg-[#E4E4E7] dark:hover:bg-[#3F3F46] text-[#14532D] dark:text-[#86EFAC] border border-[#E4E4E7] dark:border-[#27272A] text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-xs active:scale-95"
                    title="تعديل وزن الوجبة وإعادة حساب القيم الغذائية"
                  >
                    <Scale className="w-3 h-3 text-[#14532D] dark:text-[#86EFAC]" />
                    <span>تعديل الوزن</span>
                  </button>
                </div>
              </div>

              {/* Macro Nutrients Grid */}
              <div className="grid grid-cols-4 gap-1.5 pt-1 border-t border-[#E4E4E7] dark:border-[#27272A] text-center font-mono">
                {/* Calories */}
                <div className="p-1.5 rounded-xl bg-[#DDEFB5]/50 dark:bg-[#14532D]/40 border border-[#C5E193] dark:border-emerald-700/40">
                  <span className="text-[9px] text-[#14532D] dark:text-[#86EFAC] font-sans block font-semibold">
                    سعرات
                  </span>
                  <span className="text-xs font-black text-[#030303] dark:text-[#FAFAFA]">
                    {Math.round(log.calories)}
                  </span>
                </div>

                {/* Protein */}
                <div className="p-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/40">
                  <span className="text-[9px] text-rose-800 dark:text-rose-200 font-sans block font-semibold">
                    بروتين
                  </span>
                  <span className="text-xs font-black text-[#030303] dark:text-[#FAFAFA]">
                    {log.protein}g
                  </span>
                </div>

                {/* Carbs */}
                <div className="p-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40">
                  <span className="text-[9px] text-amber-800 dark:text-amber-200 font-sans block font-semibold">
                    كارب
                  </span>
                  <span className="text-xs font-black text-[#030303] dark:text-[#FAFAFA]">
                    {log.carbs}g
                  </span>
                </div>

                {/* Fat / Weight */}
                <div className="p-1.5 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/40">
                  <span className="text-[9px] text-sky-800 dark:text-sky-200 font-sans block font-semibold">
                    دهون
                  </span>
                  <span className="text-xs font-black text-[#030303] dark:text-[#FAFAFA]">
                    {log.fat}g
                  </span>
                </div>
              </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Weight Correction Modal for History Entries */}
      <AnimatePresence>
        {editingLog && (
          <motion.div
            key="history-weight-correction-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            id="history-weight-correction-modal"
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 text-[#030303] dark:text-[#FAFAFA]"
            dir="rtl"
            onClick={handleCloseEdit}
          >
            <motion.div
              key="history-weight-correction-modal-card"
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-4"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-3 border-b border-[#E4E4E7] dark:border-[#27272A]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#DDEFB5] dark:bg-[#14532D] text-[#14532D] dark:text-[#86EFAC] flex items-center justify-center border border-[#C5E193] dark:border-emerald-700/40">
                    <Scale className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#030303] dark:text-[#FAFAFA]">تعديل وزن الوجبة المسجلة</h3>
                    <p className="text-[10px] text-[#71717A] dark:text-[#A1A1AA] line-clamp-1">
                      {editingLog.foodName}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCloseEdit}
                  className="p-1 rounded-lg text-zinc-400 dark:text-zinc-500 hover:text-[#030303] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Input Form */}
              <div className="space-y-2">
                <label
                  htmlFor="history-edit-weight-input"
                  className="text-xs font-semibold text-[#030303] dark:text-[#FAFAFA] block text-right"
                >
                  الوزن الفعلي الجديد (بالجرام):
                </label>

                <div className="relative">
                  <input
                    id="history-edit-weight-input"
                    type="number"
                    min="1"
                    max="10000"
                    step="1"
                    value={editWeightInput}
                    onChange={(e) => setEditWeightInput(e.target.value)}
                    placeholder="مثال: 350"
                    className="w-full py-2.5 px-3 rounded-xl bg-[#F3F3F5] dark:bg-[#202024] border border-[#E4E4E7] dark:border-[#27272A] text-[#030303] dark:text-[#FAFAFA] font-mono font-bold text-base focus:outline-none focus:border-[#16A34A] text-left pl-14"
                    autoFocus
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#71717A] dark:text-[#A1A1AA] pointer-events-none">
                    جرام (g)
                  </span>
                </div>
                <p className="text-[10px] text-[#71717A] dark:text-[#A1A1AA]">
                  الوزن المسجل حالياً: <span className="font-mono text-[#030303] dark:text-[#FAFAFA]">{editingLog.weight || 100}g</span>
                </p>
              </div>

              {/* Live Recalculation Preview */}
              <div className="bg-[#F8F9FA] dark:bg-[#202024] rounded-2xl p-3 border border-[#E4E4E7] dark:border-[#27272A] space-y-2">
                <span className="text-[10px] font-bold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider block">
                  معاينة القيم بعد إعادة الحساب التناسبي
                </span>

                <div className="grid grid-cols-4 gap-1 text-center font-mono">
                  {/* Calories */}
                  <div className="p-1.5 rounded-xl bg-[#DDEFB5]/50 dark:bg-[#14532D]/40 border border-[#C5E193] dark:border-emerald-700/40">
                    <span className="text-[8px] text-[#14532D] dark:text-[#86EFAC] font-sans block font-bold">
                      سعرات
                    </span>
                    <span className="text-xs font-black text-[#030303] dark:text-[#FAFAFA]">
                      {previewCalories}
                    </span>
                  </div>

                  {/* Protein */}
                  <div className="p-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/40">
                    <span className="text-[8px] text-rose-800 dark:text-rose-200 font-sans block font-bold">
                      بروتين
                    </span>
                    <span className="text-xs font-black text-[#030303] dark:text-[#FAFAFA]">
                      {previewProtein}g
                    </span>
                  </div>

                  {/* Carbs */}
                  <div className="p-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40">
                    <span className="text-[8px] text-amber-800 dark:text-amber-200 font-sans block font-bold">
                      كارب
                    </span>
                    <span className="text-xs font-black text-[#030303] dark:text-[#FAFAFA]">
                      {previewCarbs}g
                    </span>
                  </div>

                  {/* Fat */}
                  <div className="p-1.5 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/40">
                    <span className="text-[8px] text-sky-800 dark:text-sky-200 font-sans block font-bold">
                      دهون
                    </span>
                    <span className="text-xs font-black text-[#030303] dark:text-[#FAFAFA]">
                      {previewFat}g
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  id="submit-history-weight-correction-btn"
                  type="button"
                  onClick={handleSaveWeightCorrection}
                  disabled={!editWeightInput || parseFloat(editWeightInput) <= 0 || isSavingEdit}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  {isSavingEdit ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Check className="w-4 h-4 stroke-[2.5]" />
                      <span>حفظ وتحديث السجل</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleCloseEdit}
                  disabled={isSavingEdit}
                  className="py-2.5 px-3.5 rounded-xl bg-[#F3F3F5] dark:bg-[#27272A] hover:bg-[#E4E4E7] dark:hover:bg-[#3F3F46] text-[#52525B] dark:text-[#E4E4E7] font-semibold text-xs transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manual Nutrition Override Modal */}
      <AnimatePresence>
        {editingNutritionLog && (
          <motion.div
            key="history-nutrition-edit-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            id="history-nutrition-edit-modal"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs text-[#030303] dark:text-[#FAFAFA]"
            dir="rtl"
            onClick={handleCloseNutritionEdit}
          >
            <motion.div
              key="history-nutrition-edit-modal-card"
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-3xl p-5 shadow-2xl space-y-4"
            >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E4E7] dark:border-[#27272A]">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-2xl bg-[#DDEFB5] dark:bg-[#14532D] text-[#14532D] dark:text-[#86EFAC] flex items-center justify-center border border-[#C5E193] dark:border-emerald-700/40">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#030303] dark:text-[#FAFAFA]">
                    تعديل القيم الغذائية يدويًا
                  </h3>
                  <p className="text-[10px] text-[#71717A] dark:text-[#A1A1AA] max-w-[240px] truncate">
                    {editingNutritionLog.foodName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseNutritionEdit}
                className="text-zinc-400 dark:text-zinc-500 hover:text-[#030303] dark:hover:text-white p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-[11px] text-[#52525B] dark:text-[#A1A1AA] leading-relaxed bg-[#F8F9FA] dark:bg-[#202024] p-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A]">
              أدخل القيم الدقيقة للسعرات الحرارية والماكروز بشكل مستقل (بدون ربط تناسبي). سيتم تحديث هذا السجل في قاعدة البيانات وإضافة شارة <span className="text-emerald-700 dark:text-emerald-400 font-bold">"تم التعديل يدويًا بالكامل"</span>.
            </p>

            {/* 4 Inputs */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* Calories */}
              <div className="bg-[#F8F9FA] dark:bg-[#202024] p-2.5 rounded-2xl border border-[#E4E4E7] dark:border-[#27272A]">
                <label className="text-[10px] font-bold text-[#14532D] dark:text-[#86EFAC] block mb-1">
                  السعرات الحرارية (kcal)
                </label>
                <input
                  id="history-override-kcal"
                  type="number"
                  min="0"
                  max="10000"
                  step="1"
                  value={historyKcalInput}
                  onChange={(e) => setHistoryKcalInput(e.target.value)}
                  className="w-full bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-xl py-2 px-2.5 text-sm font-mono font-bold text-[#030303] dark:text-[#FAFAFA] text-center focus:outline-none focus:border-[#16A34A]"
                  dir="ltr"
                />
              </div>

              {/* Protein */}
              <div className="bg-[#F8F9FA] dark:bg-[#202024] p-2.5 rounded-2xl border border-[#E4E4E7] dark:border-[#27272A]">
                <label className="text-[10px] font-bold text-rose-700 dark:text-rose-400 block mb-1">
                  البروتين (جرام)
                </label>
                <input
                  id="history-override-protein"
                  type="number"
                  min="0"
                  max="1000"
                  step="0.1"
                  value={historyProteinInput}
                  onChange={(e) => setHistoryProteinInput(e.target.value)}
                  className="w-full bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-xl py-2 px-2.5 text-sm font-mono font-bold text-[#030303] dark:text-[#FAFAFA] text-center focus:outline-none focus:border-rose-400"
                  dir="ltr"
                />
              </div>

              {/* Carbs */}
              <div className="bg-[#F8F9FA] dark:bg-[#202024] p-2.5 rounded-2xl border border-[#E4E4E7] dark:border-[#27272A]">
                <label className="text-[10px] font-bold text-amber-700 dark:text-amber-400 block mb-1">
                  الكربوهيدرات (جرام)
                </label>
                <input
                  id="history-override-carbs"
                  type="number"
                  min="0"
                  max="1000"
                  step="0.1"
                  value={historyCarbsInput}
                  onChange={(e) => setHistoryCarbsInput(e.target.value)}
                  className="w-full bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-xl py-2 px-2.5 text-sm font-mono font-bold text-[#030303] dark:text-[#FAFAFA] text-center focus:outline-none focus:border-amber-400"
                  dir="ltr"
                />
              </div>

              {/* Fat */}
              <div className="bg-[#F8F9FA] dark:bg-[#202024] p-2.5 rounded-2xl border border-[#E4E4E7] dark:border-[#27272A]">
                <label className="text-[10px] font-bold text-sky-700 dark:text-sky-400 block mb-1">
                  الدهون (جرام)
                </label>
                <input
                  id="history-override-fat"
                  type="number"
                  min="0"
                  max="1000"
                  step="0.1"
                  value={historyFatInput}
                  onChange={(e) => setHistoryFatInput(e.target.value)}
                  className="w-full bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-xl py-2 px-2.5 text-sm font-mono font-bold text-[#030303] dark:text-[#FAFAFA] text-center focus:outline-none focus:border-sky-400"
                  dir="ltr"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2">
              <button
                id="submit-history-nutrition-override-btn"
                type="button"
                onClick={handleSaveNutritionOverride}
                disabled={isSavingNutritionEdit}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                {isSavingNutritionEdit ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    <span>حفظ التعديلات وتحديث السجل</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleCloseNutritionEdit}
                disabled={isSavingNutritionEdit}
                className="py-2.5 px-3.5 rounded-xl bg-[#F3F3F5] dark:bg-[#27272A] hover:bg-[#E4E4E7] dark:hover:bg-[#3F3F46] text-[#52525B] dark:text-[#E4E4E7] font-semibold text-xs transition-colors cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

      {/* Component Weight Modal for Individual Component Editing */}
      <ComponentWeightModal
        isOpen={!!editingHistoryComponent}
        item={editingHistoryComponent?.item || null}
        mealTitle={editingHistoryComponent?.log.foodName}
        onClose={() => setEditingHistoryComponent(null)}
        onSave={handleSaveHistoryComponentWeight}
        isSaving={isSavingHistoryComponent}
      />
    </div>
  );
};
