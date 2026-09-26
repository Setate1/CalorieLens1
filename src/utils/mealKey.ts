/**
 * CalorieLens Meal Memory - Normalization and Perceptual Hashing Utilities
 */

import { DetectedFood } from "../types";

/**
 * Normalizes meal title across Arabic and English:
 * - lowercase & trim
 * - collapse multi-whitespace
 * - strip Arabic diacritics (tashkeel: fathatan, dammatan, kasratan, fatha, damma, kasra, shadda, sukun, dagger alif)
 * - unify alef forms (أ, إ, آ, ٱ -> ا)
 * - unify ه and ة (ة -> ه)
 * - unify ي and ى (ى -> ي)
 * - remove punctuation, symbols, and emoji
 */
export function normalizeMealTitle(title: string): string {
  if (!title || typeof title !== "string") return "";

  let cleaned = title
    .trim()
    .toLowerCase()
    // Collapse multi-spaces
    .replace(/\s+/g, " ");

  // Strip Arabic diacritics (tashkeel)
  cleaned = cleaned.replace(/[\u064B-\u065F\u0670]/g, "");

  // Unify Alef forms (أ إ آ ٱ -> ا)
  cleaned = cleaned.replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627");

  // Unify Taa Marbuta and Haa (ة -> ه)
  cleaned = cleaned.replace(/\u0629/g, "\u0647");

  // Unify Alif Maqsura and Yaa (ى -> ي)
  cleaned = cleaned.replace(/\u0649/g, "\u064A");

  // Remove Arabic tatweel / kashida
  cleaned = cleaned.replace(/\u0640/g, "");

  // Remove common punctuation and symbols (both English and Arabic)
  cleaned = cleaned.replace(/[\.,\/#!$%\^&\*;:{}=\-_`~()؟،؛«»"'…\\|<>@\[\]{}+?]/g, " ");

  // Remove emojis and pictographic symbols
  try {
    cleaned = cleaned.replace(/\p{Extended_Pictographic}/gu, "");
  } catch {
    // Fallback if unicode property escapes are not supported
    cleaned = cleaned.replace(/[\u{1F300}-\u{1F9FF}]/gu, "");
  }

  // Final trim and whitespace collapse
  return cleaned.replace(/\s+/g, " ").trim();
}

/**
 * Builds a deterministic, URL-safe Firestore document ID from a normalized title.
 * Valid for Firestore document IDs: alphanumeric, hyphens, underscores (size <= 128).
 */
export function buildMealKey(normalizedTitle: string): string {
  const norm = normalizedTitle || "unnamed-meal";

  // Compute 64-bit deterministic hash using dual 32-bit FNV-1a hashes
  let h1 = 0x811c9dc5;
  let h2 = 0x27d4eb2f;

  for (let i = 0; i < norm.length; i++) {
    const code = norm.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);

    h2 = Math.imul(h2 ^ code, 0x01000193);
    h2 ^= (code << 5) | (code >>> 27);
  }

  const hex1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const hex2 = (h2 >>> 0).toString(16).padStart(8, "0");

  // If there are ASCII alphanumeric words, extract a clean slug for readability
  const asciiSlug = norm
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);

  const prefix = asciiSlug.length > 2 ? `${asciiSlug}-` : "meal-";
  return `${prefix}${hex1}${hex2}`;
}

/**
 * Computes a cheap perceptual average-hash (aHash) over an 8x8 grayscale downscale.
 * Produces a 16-character hex string representing the 64-bit image hash.
 * Does NOT store or upload the image itself.
 */
export async function imageAverageHash(
  file: Blob | HTMLImageElement | string
): Promise<string> {
  return new Promise((resolve, reject) => {
    let img: HTMLImageElement;
    let cleanupUrl: string | null = null;

    const processImage = (imageElement: HTMLImageElement) => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 8;
        canvas.height = 8;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          resolve("0000000000000000");
          return;
        }

        ctx.drawImage(imageElement, 0, 0, 8, 8);
        const imgData = ctx.getImageData(0, 0, 8, 8).data;

        // Calculate average grayscale intensity
        const grays = new Float32Array(64);
        let sum = 0;

        for (let i = 0; i < 64; i++) {
          const idx = i * 4;
          const r = imgData[idx];
          const g = imgData[idx + 1];
          const b = imgData[idx + 2];
          // Standard ITU-R BT.601 luminance
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          grays[i] = gray;
          sum += gray;
        }

        const avg = sum / 64;

        // Build 64-bit binary representation: 1 if pixel >= avg, else 0
        let hex = "";
        for (let nibble = 0; nibble < 16; nibble++) {
          let val = 0;
          for (let bit = 0; bit < 4; bit++) {
            const pixelIdx = nibble * 4 + bit;
            if (grays[pixelIdx] >= avg) {
              val |= 1 << (3 - bit);
            }
          }
          hex += val.toString(16);
        }

        if (cleanupUrl) {
          URL.revokeObjectURL(cleanupUrl);
        }

        resolve(hex);
      } catch (err) {
        if (cleanupUrl) {
          URL.revokeObjectURL(cleanupUrl);
        }
        console.warn("[MealMemory] Failed to compute image hash:", err);
        resolve("0000000000000000");
      }
    };

    if (file instanceof HTMLImageElement) {
      if (file.complete && file.naturalWidth > 0) {
        processImage(file);
      } else {
        file.onload = () => processImage(file);
        file.onerror = () => resolve("0000000000000000");
      }
      return;
    }

    img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => processImage(img);
    img.onerror = () => {
      if (cleanupUrl) URL.revokeObjectURL(cleanupUrl);
      resolve("0000000000000000");
    };

    if (typeof file === "string") {
      img.src = file;
    } else if (file instanceof Blob) {
      cleanupUrl = URL.createObjectURL(file);
      img.src = cleanupUrl;
    } else {
      resolve("0000000000000000");
    }
  });
}

/**
 * Computes Hamming distance between two 16-character hex strings (0 to 64).
 * Returns bit difference count.
 */
export function hammingDistance(a: string, b: string): number {
  if (!a || !b || typeof a !== "string" || typeof b !== "string") {
    return 999;
  }

  const cleanA = a.trim().toLowerCase();
  const cleanB = b.trim().toLowerCase();

  if (cleanA.length !== cleanB.length) {
    return 999;
  }

  let distance = 0;

  for (let i = 0; i < cleanA.length; i++) {
    const valA = parseInt(cleanA[i], 16);
    const valB = parseInt(cleanB[i], 16);

    if (isNaN(valA) || isNaN(valB)) {
      return 999;
    }

    let xor = valA ^ valB;
    // Brian Kernighan's algorithm for popcount
    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }

  return distance;
}

/**
 * Scales an array of DetectedFood items proportionally to a new target weight in grams.
 */
export function scaleItemsToWeight(
  items: DetectedFood[],
  targetWeightGrams: number
): DetectedFood[] {
  if (!items || items.length === 0) return [];
  const currentTotalWeight = items.reduce(
    (acc, it) => acc + (Number(it.weight_g) || 0),
    0
  );

  const safeTarget = Math.max(1, Math.round(targetWeightGrams));
  const ratio = currentTotalWeight > 0 ? safeTarget / currentTotalWeight : 1;

  return items.map((it) => {
    const w = Math.max(1, Math.round((Number(it.weight_g) || 100) * ratio));
    const cal = Math.max(0, Math.round((Number(it.calories) || 0) * ratio));
    const p = Math.round((Number(it.protein_g ?? (it as any).protein) || 0) * ratio * 10) / 10;
    const c = Math.round((Number(it.carbs_g ?? (it as any).carbs) || 0) * ratio * 10) / 10;
    const f = Math.round((Number(it.fat_g ?? (it as any).fat) || 0) * ratio * 10) / 10;

    return {
      ...it,
      weight_g: w,
      calories: cal,
      protein_g: p,
      carbs_g: c,
      fat_g: f,
      is_cached_memory: true,
    };
  });
}
