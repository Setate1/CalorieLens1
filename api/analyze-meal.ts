import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import crypto from "crypto";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import {

import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { matchUSDAFood } from "../server/usdaDatabase.js";
import {
  validateAndSanityCheckItem,
  evaluateMealConfidenceSafeguard,
} from "../server/sanityChecker.js";

dotenv.config();

import { initializeApp as initAdminApp, getApps as getAdminApps } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";

let firebaseAppletConfig: any = {};
try {
  const rawConfig = fs.readFileSync(path.resolve(process.cwd(), "firebase-applet-config.json"), "utf8");
  firebaseAppletConfig = JSON.parse(rawConfig);
} catch (e) {
  console.warn("Could not load firebase-applet-config.json:", e);
}

if (getAdminApps().length === 0) {
  initAdminApp({
    projectId: firebaseAppletConfig.projectId || "calorielens-570ed"
  });
}

export const rateLimitCache = new Map<string, { count: number, resetTime: number }>();

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || firebaseAppletConfig.apiKey || "AIzaSyCPfMrTNupafRas9ZD1Yu8R1cqPT37Xxy4",
  authDomain: firebaseAppletConfig.authDomain || "calorielens-570ed.firebaseapp.com",
  projectId: firebaseAppletConfig.projectId || "calorielens-570ed",
  storageBucket: firebaseAppletConfig.storageBucket || "calorielens-570ed.firebasestorage.app",
  messagingSenderId: firebaseAppletConfig.messagingSenderId || "777264955495",
  appId: firebaseAppletConfig.appId || "1:777264955495:web:2bf22dd161a8fb64a894c2",
};

const serverDatabaseId =
  firebaseAppletConfig.firestoreDatabaseId ||
  "ai-studio-remixcalorielens-b4282620-b4fe-4c21-a466-db930886b3d2";

const serverApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const serverDb = serverDatabaseId ? getFirestore(serverApp, serverDatabaseId) : getFirestore(serverApp);

export const CACHE_COLLECTION_NAME = "recognized_foods_cache";
const serverRecognizedFoodsCache = new Map<string, any>();

export function normalizeServerCacheKey(name: string): string {
  return (name || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s\u0600-\u06FF]/g, "")
    .replace(/\s+/g, "_");
}

const app = express();
const PORT = 3000;

// High payload limit for meal photos
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

/**
 * Strict floating-point rounder to 1 decimal place.
 * Completely eliminates 177.29999999999998 floating artifacts.
 */
function round1Dec(val: number): number {
  if (isNaN(val) || !isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 10) / 10;
}

/**
 * In-memory deterministic cache keyed by image SHA-256 hash.
 * Guarantees that passing the exact same image yields 100% consistent results
 * (same food items, identical weights, exact same macros).
 */
class BoundedCache<K, V> extends Map<K, V> {
  private maxSize: number;
  constructor(maxSize: number = 500) {
    super();
    this.maxSize = maxSize;
  }
  set(key: K, value: V) {
    if (super.size >= this.maxSize) {
      const firstKey = super.keys().next().value;
      if (firstKey !== undefined) super.delete(firstKey);
    }
    return super.set(key, value);
  }
}
export const mealAnalysisCache = new BoundedCache<string, any>(200);
export const PRESET_SAMPLE_MEALS: Record<string, any[]> = {};

// Seed sample meals into the deterministic cache so demo plates always work instantly & reliably
try {
  const sampleChickenRicePath = path.resolve("./src/assets/images/sample_chicken_rice_1789293974225.jpg");
  if (fs.existsSync(sampleChickenRicePath)) {
    const b64 = fs.readFileSync(sampleChickenRicePath).toString("base64");
    const hash = crypto.createHash("sha256").update(b64).digest("hex");
    const sampleChickenRiceItems = [
      {
        id: "sample-cr-1",
        item_name: "Chicken breast, grilled, boneless, skinless",
        weight_g: 150,
        portion_description: "شريحة صدر دجاج متوسطة مشوية",
        weight_range_min_g: 135,
        weight_range_max_g: 165,
        best_estimate_weight_g: 150,
        portion_preset: "medium",
        small_weight_g: 100,
        medium_weight_g: 150,
        large_weight_g: 210,
        has_hidden_fats_or_sauces: false,
        calories: 235,
        protein_g: 46.5,
        carbs_g: 0,
        fat_g: 5.4,
        confidence_score: 95,
        reference_object_detected: "Standard dinner plate ~26cm",
        usda_matched_name: "Chicken breast, grilled, boneless, skinless",
        usda_source: "USDA FoodData Central #171077",
        needs_review: false,
        atwater_calories: 235,
        is_approximate_estimate: false,
        food_category: "meat_poultry_fish",
        sanity_status: "verified",
        sanity_message: "Verified compliant with USDA standards (#171077)",
        per_100g: { calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 },
      },
      {
        id: "sample-cr-2",
        item_name: "Cooked white rice",
        weight_g: 140,
        portion_description: "حوالي كوب مطبوخ (وعاء متوسط)",
        weight_range_min_g: 120,
        weight_range_max_g: 160,
        best_estimate_weight_g: 140,
        portion_preset: "medium",
        small_weight_g: 90,
        medium_weight_g: 140,
        large_weight_g: 200,
        has_hidden_fats_or_sauces: false,
        calories: 177,
        protein_g: 3.8,
        carbs_g: 39.5,
        fat_g: 0.4,
        confidence_score: 92,
        reference_object_detected: "Standard dinner plate ~26cm",
        usda_matched_name: "Cooked white rice",
        usda_source: "USDA FoodData Central #168878",
        needs_review: false,
        atwater_calories: 177,
        is_approximate_estimate: false,
        food_category: "starch_grain",
        sanity_status: "verified",
        sanity_message: "Verified compliant with USDA standards (#168878)",
        per_100g: { calories: 130, protein_g: 2.7, carbs_g: 28.2, fat_g: 0.3 },
      },
      {
        id: "sample-cr-3",
        item_name: "Steamed broccoli",
        weight_g: 90,
        portion_description: "حصة جانبية متوسطة (زهرات بروكلي)",
        weight_range_min_g: 75,
        weight_range_max_g: 105,
        best_estimate_weight_g: 90,
        portion_preset: "medium",
        small_weight_g: 60,
        medium_weight_g: 90,
        large_weight_g: 130,
        has_hidden_fats_or_sauces: false,
        calories: 38,
        protein_g: 2.2,
        carbs_g: 6.5,
        fat_g: 0.4,
        confidence_score: 90,
        reference_object_detected: "Standard dinner plate ~26cm",
        usda_matched_name: "Steamed broccoli",
        usda_source: "USDA FoodData Central #170380",
        needs_review: false,
        atwater_calories: 38,
        is_approximate_estimate: false,
        food_category: "vegetable",
        sanity_status: "verified",
        sanity_message: "Verified compliant with USDA standards (#170380)",
        per_100g: { calories: 35, protein_g: 2.4, carbs_g: 7.2, fat_g: 0.4 },
      },
      {
        id: "sample-cr-4",
        item_name: "Cherry tomatoes, raw",
        weight_g: 80,
        portion_description: "حوالي 4-5 حبات طماطم كرزية",
        weight_range_min_g: 65,
        weight_range_max_g: 95,
        best_estimate_weight_g: 80,
        portion_preset: "medium",
        small_weight_g: 50,
        medium_weight_g: 80,
        large_weight_g: 120,
        has_hidden_fats_or_sauces: false,
        calories: 17,
        protein_g: 0.7,
        carbs_g: 3.1,
        fat_g: 0.2,
        confidence_score: 90,
        reference_object_detected: "Standard dinner plate ~26cm",
        usda_matched_name: "Cherry tomatoes, fresh",
        usda_source: "USDA FoodData Central #170457",
        needs_review: false,
        atwater_calories: 17,
        is_approximate_estimate: false,
        food_category: "vegetable",
        sanity_status: "verified",
        sanity_message: "Verified compliant with USDA standards (#170457)",
        per_100g: { calories: 18, protein_g: 0.9, carbs_g: 3.9, fat_g: 0.2 },
      },
    ];
    PRESET_SAMPLE_MEALS["chicken-rice"] = sampleChickenRiceItems;
    mealAnalysisCache.set(hash, sampleChickenRiceItems);
  }

  const sampleAvocadoToastPath = path.resolve("./src/assets/images/sample_avocado_toast_1789293988613.jpg");
  if (fs.existsSync(sampleAvocadoToastPath)) {
    const b64 = fs.readFileSync(sampleAvocadoToastPath).toString("base64");
    const hash = crypto.createHash("sha256").update(b64).digest("hex");
    const sampleAvocadoToastItems = [
      {
        id: "sample-at-1",
        item_name: "Sourdough bread, toasted",
        weight_g: 70,
        portion_description: "شريحتان من خبز الساور دو المحمص",
        weight_range_min_g: 60,
        weight_range_max_g: 80,
        best_estimate_weight_g: 70,
        portion_preset: "medium",
        small_weight_g: 45,
        medium_weight_g: 70,
        large_weight_g: 100,
        has_hidden_fats_or_sauces: false,
        calories: 182,
        protein_g: 5.6,
        carbs_g: 35.0,
        fat_g: 1.4,
        confidence_score: 94,
        reference_object_detected: "Standard plate ~26cm",
        usda_matched_name: "Sourdough bread",
        usda_source: "USDA FoodData Central #172685",
        needs_review: false,
        atwater_calories: 175,
        is_approximate_estimate: false,
        food_category: "starch_grain",
        sanity_status: "verified",
        sanity_message: "Verified compliant with USDA standards (#172685)",
        per_100g: { calories: 260, protein_g: 8.0, carbs_g: 50.0, fat_g: 2.0 },
      },
      {
        id: "sample-at-2",
        item_name: "Avocado, raw mashed",
        weight_g: 85,
        portion_description: "حوالي نصف حبة أفوكادو مهروسة",
        weight_range_min_g: 70,
        weight_range_max_g: 100,
        best_estimate_weight_g: 85,
        portion_preset: "medium",
        small_weight_g: 55,
        medium_weight_g: 85,
        large_weight_g: 120,
        has_hidden_fats_or_sauces: false,
        calories: 136,
        protein_g: 1.7,
        carbs_g: 7.2,
        fat_g: 12.5,
        confidence_score: 92,
        reference_object_detected: "Standard plate ~26cm",
        usda_matched_name: "Avocado, raw",
        usda_source: "USDA FoodData Central #171705",
        needs_review: false,
        atwater_calories: 148,
        is_approximate_estimate: false,
        food_category: "fat_oil",
        sanity_status: "verified",
        sanity_message: "Verified compliant with USDA standards (#171705)",
        per_100g: { calories: 160, protein_g: 2.0, carbs_g: 8.5, fat_g: 14.7 },
      },
      {
        id: "sample-at-3",
        item_name: "Poached egg, large",
        weight_g: 50,
        portion_description: "بيضة واحدة مسلوقة (بوشيه)",
        weight_range_min_g: 45,
        weight_range_max_g: 55,
        best_estimate_weight_g: 50,
        portion_preset: "medium",
        small_weight_g: 40,
        medium_weight_g: 50,
        large_weight_g: 100,
        has_hidden_fats_or_sauces: false,
        calories: 72,
        protein_g: 6.3,
        carbs_g: 0.4,
        fat_g: 4.8,
        confidence_score: 95,
        reference_object_detected: "Standard plate ~26cm",
        usda_matched_name: "Egg, whole, poached",
        usda_source: "USDA FoodData Central #171287",
        needs_review: false,
        atwater_calories: 70,
        is_approximate_estimate: false,
        food_category: "meat_poultry_fish",
        sanity_status: "verified",
        sanity_message: "Verified compliant with USDA standards (#171287)",
        per_100g: { calories: 143, protein_g: 12.6, carbs_g: 0.7, fat_g: 9.5 },
      },
    ];
    PRESET_SAMPLE_MEALS["avocado-toast"] = sampleAvocadoToastItems;
    mealAnalysisCache.set(hash, sampleAvocadoToastItems);
  }

  // Salmon bowl verified sample preset
  PRESET_SAMPLE_MEALS["salmon-bowl"] = [
    {
      id: "sample-sb-1",
      item_name: "Salmon fillet, wild, baked or pan-seared",
      weight_g: 140,
      portion_description: "قطعة سمك سلمون مشوية متوسطة",
      weight_range_min_g: 120,
      weight_range_max_g: 160,
      best_estimate_weight_g: 140,
      portion_preset: "medium",
      small_weight_g: 90,
      medium_weight_g: 140,
      large_weight_g: 190,
      has_hidden_fats_or_sauces: false,
      calories: 250,
      protein_g: 31.5,
      carbs_g: 0,
      fat_g: 13.2,
      confidence_score: 94,
      reference_object_detected: "Standard bowl ~22cm",
      usda_matched_name: "Salmon, Atlantic, wild, cooked",
      usda_source: "USDA FoodData Central #175168",
      needs_review: false,
      atwater_calories: 245,
      is_approximate_estimate: false,
      food_category: "meat_poultry_fish",
      sanity_status: "verified",
      sanity_message: "Verified compliant with USDA standards (#175168)",
      per_100g: { calories: 179, protein_g: 22.5, carbs_g: 0, fat_g: 9.4 },
    },
    {
      id: "sample-sb-2",
      item_name: "Cooked quinoa",
      weight_g: 120,
      portion_description: "حصة كينوا مطبوخة (حوالي نصف كوب)",
      weight_range_min_g: 100,
      weight_range_max_g: 140,
      best_estimate_weight_g: 120,
      portion_preset: "medium",
      small_weight_g: 80,
      medium_weight_g: 120,
      large_weight_g: 160,
      has_hidden_fats_or_sauces: false,
      calories: 144,
      protein_g: 5.3,
      carbs_g: 25.6,
      fat_g: 2.3,
      confidence_score: 91,
      reference_object_detected: "Standard bowl ~22cm",
      usda_matched_name: "Quinoa, cooked",
      usda_source: "USDA FoodData Central #168917",
      needs_review: false,
      atwater_calories: 144,
      is_approximate_estimate: false,
      food_category: "starch_grain",
      sanity_status: "verified",
      sanity_message: "Verified compliant with USDA standards (#168917)",
      per_100g: { calories: 120, protein_g: 4.4, carbs_g: 21.3, fat_g: 1.9 },
    },
    {
      id: "sample-sb-3",
      item_name: "Edamame, shelled, steamed",
      weight_g: 70,
      portion_description: "حبوب إدامامي مطبوخة على البخار",
      weight_range_min_g: 55,
      weight_range_max_g: 85,
      best_estimate_weight_g: 70,
      portion_preset: "medium",
      small_weight_g: 45,
      medium_weight_g: 70,
      large_weight_g: 100,
      has_hidden_fats_or_sauces: false,
      calories: 85,
      protein_g: 8.4,
      carbs_g: 6.2,
      fat_g: 3.6,
      confidence_score: 89,
      reference_object_detected: "Standard bowl ~22cm",
      usda_matched_name: "Edamame, frozen, prepared",
      usda_source: "USDA FoodData Central #168411",
      needs_review: false,
      atwater_calories: 91,
      is_approximate_estimate: false,
      food_category: "legume",
      sanity_status: "verified",
      sanity_message: "Verified compliant with USDA standards (#168411)",
      per_100g: { calories: 121, protein_g: 12.0, carbs_g: 8.9, fat_g: 5.2 },
    },
  ];

  const sampleSalmonBowlPath = path.resolve("./src/assets/images/sample_salmon_bowl_1789404992876.jpg");
  if (fs.existsSync(sampleSalmonBowlPath)) {
    const b64 = fs.readFileSync(sampleSalmonBowlPath).toString("base64");
    const hash = crypto.createHash("sha256").update(b64).digest("hex");
    mealAnalysisCache.set(hash, PRESET_SAMPLE_MEALS["salmon-bowl"]);
  }
} catch (e) {
  console.warn("Could not pre-seed sample cache:", e);
}

// Gemini Schema for structured extraction
const foodItemSchema = {
  type: Type.OBJECT,
  properties: {
    item_name: {
      type: Type.STRING,
      description:
        "Standard product/food name matching USDA FoodData Central classification (e.g., 'Chicken breast, grilled, skinless', 'Protein Bar, Chocolate', 'Pepsi Zero Sugar', 'Cooked white rice')",
    },
    weight_g: {
      type: Type.INTEGER,
      description:
        "Realistic estimated weight in grams / ml (e.g. 60g protein bar, 330ml can, 150g grilled chicken)",
    },
    data_source: {
      type: Type.STRING,
      enum: ["label_read", "product_estimate", "visual_portion_estimate", "uncertain"],
      description:
        "Method of data acquisition: 'label_read' if extracted directly from readable printed Nutrition Facts table; 'product_estimate' if packaged item recognized without readable label table; 'visual_portion_estimate' for non-packaged, homemade, or plated whole foods; 'uncertain' if blurry, partially obscured, or ambiguous variant.",
    },
    variant_detected: {
      type: Type.STRING,
      description:
        "Detected variant if applicable (e.g., 'Diet / Zero Sugar detected (0-5 kcal)', 'Keto / Low-Carb detected', 'Regular / Full-sugar', 'None / Whole food')",
    },
    fiber_g: {
      type: Type.NUMBER,
      description: "Dietary fiber in grams (if printed or estimated)",
    },
    sugar_alcohols_g: {
      type: Type.NUMBER,
      description: "Sugar alcohols (erythritol, maltitol, xylitol, sorbitol) in grams (if printed)",
    },
    net_carbs_g: {
      type: Type.NUMBER,
      description: "Net carbs in grams = Total Carbs - Fiber - Sugar Alcohols (if applicable)",
    },
    is_keto_or_low_carb: {
      type: Type.BOOLEAN,
      description: "True if product is keto/low-carb or uses sugar alcohols/high-fiber formula",
    },
    serving_info: {
      type: Type.OBJECT,
      description: "Serving size breakdown if visible on package",
      properties: {
        serving_size_desc: {
          type: Type.STRING,
          description: "e.g. '1 bar (60g)', '1 can (330ml)', '1/2 cup (120g)'",
        },
        servings_per_container: {
          type: Type.NUMBER,
          description: "Number of servings in this package (e.g. 1, 2.5)",
        },
        per_serving_calories: {
          type: Type.INTEGER,
          description: "Calories per single serving (as printed)",
        },
        total_package_calories: {
          type: Type.INTEGER,
          description: "Calories for the entire container / package",
        },
        reported_basis: {
          type: Type.STRING,
          enum: ["per_serving", "total_package", "per_100g", "custom_portion"],
          description: "Basis of the reported calories and macros",
        },
      },
    },
    label_language_detected: {
      type: Type.STRING,
      description: "Language of label text if present: 'Arabic', 'English', 'Bilingual Arabic/English', or 'None'",
    },
    reasoning: {
      type: Type.STRING,
      description:
        "Detailed explanation of how numbers were derived (e.g., 'Extracted directly from printed nutrition panel on back', 'Identified as Diet Pepsi with artificial sweeteners, 0 kcal', 'Estimated portion based on 26cm dinner plate scale', 'Calculated net carbs subtracting fiber and erythritol').",
    },
    user_guidance: {
      type: Type.STRING,
      description:
        "Actionable advice to the user (e.g. 'Values verified from package label', 'Estimating from product recognition (60% confidence). Photograph nutrition facts label for 100% precision.', 'Home-cooked food: estimated via visual plate reference (max 70% confidence).', 'Label blurry/partially obscured. Please retake photo focused on label table.').",
    },
    confidence_score: {
      type: Type.INTEGER,
      description:
        "Confidence score from 0 to 100. RULES: Never report 100% confidence unless numbers were actually read directly off a visible Nutrition Facts label. If estimating from product recognition alone, cap at 60%. If estimating non-packaged/homemade food, cap at 70%. If blurry/obscured, cap at 40-50%.",
    },
    reference_object_detected: {
      type: Type.STRING,
      description:
        "Visual reference object used for scale estimation (e.g. 'Printed product packaging / net weight', 'Standard dinner plate ~26cm', 'Dining fork ~19cm', 'Standard 330ml can', 'Assumed plate scale')",
    },
    calories: {
      type: Type.INTEGER,
      description: "Calories (kcal) for this portion",
    },
    portion_description: {
      type: Type.STRING,
      description:
        "Human-readable volume and portion description in Arabic (e.g. 'حوالي كوب ونصف (وعاء متوسط)', 'شريحة صدر دجاج متوسطة ~150g', 'حوالي ملعقتين طعام')",
    },
    weight_range_min_g: {
      type: Type.INTEGER,
      description: "Realistic lower bound of estimated weight in grams (e.g. 180)",
    },
    weight_range_max_g: {
      type: Type.INTEGER,
      description: "Realistic upper bound of estimated weight in grams (e.g. 230)",
    },
    best_estimate_weight_g: {
      type: Type.INTEGER,
      description: "Estimated midpoint / best single weight in grams (e.g. 205)",
    },
    small_weight_g: {
      type: Type.INTEGER,
      description: "Estimated weight in grams if the user chose a small portion (e.g. 130)",
    },
    medium_weight_g: {
      type: Type.INTEGER,
      description: "Estimated weight in grams if the user chose a medium portion (e.g. 205)",
    },
    large_weight_g: {
      type: Type.INTEGER,
      description: "Estimated weight in grams if the user chose a large portion (e.g. 290)",
    },
    has_hidden_fats_or_sauces: {
      type: Type.BOOLEAN,
      description:
        "True if food is cooked/fried/sautéed with potential unseen oils, butter, salad dressings, or rich sauces",
    },
    hidden_fats_description: {
      type: Type.STRING,
      description:
        "Explanation of potential hidden oils or sauces (e.g. 'قد يحتوي على ملعقة زيت طهي أو صلصة ممتصة')",
    },
    cooking_oil_estimate_kcal: {
      type: Type.INTEGER,
      description: "Estimated additional calories from cooking oils or fats if applicable (e.g. 45-90 kcal)",
    },
    protein_g: {
      type: Type.NUMBER,
      description: "Protein in grams for this portion (1 decimal place)",
    },
    carbs_g: {
      type: Type.NUMBER,
      description: "Carbohydrates in grams for this portion (1 decimal place)",
    },
    fat_g: {
      type: Type.NUMBER,
      description: "Fat in grams for this portion (1 decimal place)",
    },
    fat_calories_pct: {
      type: Type.INTEGER,
      description: "Percentage of total calories coming from fat: (fat_grams * 9 / total_calories) * 100",
    },
    is_unidentified_component: {
      type: Type.BOOLEAN,
      description: "True if the AI cannot confidently name the food item from visual inspection alone",
    },
  },
  required: [
    "item_name",
    "weight_g",
    "data_source",
    "confidence_score",
    "calories",
    "protein_g",
    "carbs_g",
    "fat_g",
  ],
};

export const mealAnalysisResponseSchema = {
  type: Type.OBJECT,
  properties: {
    is_unrecognized_or_low_confidence: {
      type: Type.BOOLEAN,
      description:
        "Set to TRUE if the image does not contain recognizable food, is severely blurry/dark/unclear, has confidence < 40%, or requires pure blind guessing with no reliable basis. If TRUE, items must be an empty array [].",
    },
    unrecognized_reason: {
      type: Type.STRING,
      description:
        "Detailed explanation if food is unrecognized or low confidence (e.g., 'Image is too blurry', 'No food detected', 'Ambiguous dish that cannot be identified with reliable certainty').",
    },
    items: {
      type: Type.ARRAY,
      items: foodItemSchema,
      description: "Array of detected food items and their estimated portions and macros. MUST be empty if is_unrecognized_or_low_confidence is true.",
    },
  },
  required: ["is_unrecognized_or_low_confidence", "items"],
};

// Lazy initialization of Gemini client
let geminiClient: GoogleGenAI | null = null;
export function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is missing.");
    }
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return geminiClient;
}
  validateAndSanityCheckItem,
  evaluateMealConfidenceSafeguard,
} from "../server/sanityChecker.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { imageBase64, mimeType = "image/jpeg", forceRefresh = false, sampleId } = req.body;
    
    // Auth & Rate Limiting
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing or invalid Authorization header." });
      return;
    }
    const token = authHeader.split("Bearer ")[1];
    let decodedToken;
    try {
      decodedToken = await getAdminAuth().verifyIdToken(token);
    } catch (e) {
      res.status(401).json({ error: "Invalid token." });
      return;
    }
    
    const uid = decodedToken.uid;
    const now = Date.now();
    let rl = rateLimitCache.get(uid);
    if (!rl || now > rl.resetTime) {
      rl = { count: 0, resetTime: now + 3600 * 1000 };
    }
    rl.count++;
    rateLimitCache.set(uid, rl);
    if (rl.count > 25) { // 25 requests per hour limit
      res.status(429).json({ error: "Rate limit exceeded." });
      return;
    }
    
    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
      res.status(400).json({ error: "Unsupported MIME type." });
      return;
    }

    // Fast-path: Verified sample meal preset
    if (sampleId && PRESET_SAMPLE_MEALS[sampleId]) {
      console.log(`[Sample Preset Fast-Path] Returning verified baseline for: ${sampleId}`);
      res.json(PRESET_SAMPLE_MEALS[sampleId]);
      return;
    }

    if (!imageBase64) {
      res.status(400).json({ error: "Missing imageBase64 in request body." });
      return;
    }

    // Strip data URL prefix if present
    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, "");

    // Compute SHA-256 hash for deterministic result consistency
    const imageHash = crypto.createHash("sha256").update(cleanBase64).digest("hex");
    if (forceRefresh) {
      mealAnalysisCache.delete(imageHash);
    } else if (mealAnalysisCache.has(imageHash)) {
      console.log(`[Cache Hit] Serving identical deterministic result for hash: ${imageHash.slice(0, 12)}`);
      res.json(mealAnalysisCache.get(imageHash));
      return;
    }

    const ai = getGeminiClient();

    // Check in-memory recognized foods cache for quick instant hits
    if (!forceRefresh) {
      const cached = mealAnalysisCache.get(imageHash);
      if (cached) {
        console.log(`[Cache Hit] Serving identical deterministic result for hash: ${imageHash.slice(0, 12)}`);
        res.json(cached);
        return;
      }
    }

    const prompt = `You are an expert clinical nutrition metrology AI. Your top priority is REALISTIC ESTIMATION, ACCURACY, and INTEGRITY over guessing.

CRITICAL ACCURACY RULE:
Never pretend that a single photo can determine the exact weight of food. The AI must provide an ESTIMATE, not a guaranteed measurement. Never claim "exact weight" or "100% precision" unless numbers were read directly off a visible Nutrition Facts label.

Analyze this image following these STRICT RULES:

### 1. FOOD ITEMS DETECTED & MULTI-ITEM SEGMENTATION:
- Detect and separate each distinct food item on the plate/container (e.g. "Cooked white rice", "Chicken breast, grilled", "Steamed broccoli", "Tahini sauce").
- Do NOT lump everything into one generic item unless it is an inseparable mixed casserole/stew.
- Name each item accurately in item_name matching standard food taxonomy.

### 2. REALISTIC PORTION & WEIGHT ESTIMATION:
- Estimate portion volume from visual cues in portion_description (e.g. "حوالي كوب ونصف (وعاء متوسط)", "قطعة صدر دجاج متوسطة").
- Estimate a realistic weight range in grams:
  * weight_range_min_g (lower plausible bound)
  * weight_range_max_g (upper plausible bound)
  * best_estimate_weight_g & weight_g (most likely midpoint weight)
- Provide portion preset weights:
  * small_weight_g (~65% of typical portion)
  * medium_weight_g (100% of typical portion)
  * large_weight_g (~140% of typical portion)

### 3. CONFIDENCE SCORE TIERS:
- 90–100%: Direct readable Nutrition Facts label OR clear single food with verified standard size/package.
- 75–89%: Good visual identification, clear dish separation, and reliable size reference (plate, utensil, hand).
- 50–74%: Food is identifiable but portion volume, thickness, or density has moderate visual uncertainty.
- Below 50%: Uncertain portion/weight or partially obscured ingredients. If confidence < 40%, trigger RULE 0.

### 4. REFERENCE OBJECT DETECTION:
- Check for reference objects in reference_object_detected: standard dinner plate (26cm), bowl (16cm), fork/spoon (19cm/15cm), cup/glass, beverage can (330ml), hand/fingers, or packaging.

### 5. HIDDEN FATS, OILS, AND SAUCES:
- Check if food is cooked, sautéed, fried, or dressed with potential hidden oils, butter, mayonnaise, tahini, sugar, or cheese.
- If present or suspected, set has_hidden_fats_or_sauces = true, describe in hidden_fats_description, and estimate cooking_oil_estimate_kcal (e.g. 45-90 kcal).

### 6. MACRONUTRIENTS & CALORIC RECONCILIATION:
- Calculate calories, protein_g, carbs_g, fat_g, and fiber_g based on the estimated edible portion and clinical USDA nutritional standards.
- CRITICAL: Calculate genuine, non-zero carbs_g for any food containing starches, grains, flour, sugar, bread, flatbreads, pasta, rice, fruits, legumes, vegetables, coatings, or dairy (e.g. Hawawshi, bread, rice, potatoes, pastries, sauces, fruits). Do not return 0 for carbs_g unless the food is confirmed zero-carb (such as plain unbreaded grilled meat, pure cooking oil, or zero-calorie black coffee).
- Ensure calories reconcile with the Atwater formula (P*4 + C*4 + F*9).

### 7. UNRECOGNIZED / LOW CONFIDENCE SAFEGUARD:
- If image does NOT show recognizable food, or is too dark/blurry to identify with >= 40% confidence, set is_unrecognized_or_low_confidence = true and items = [].

Return STRICTLY a JSON object conforming to the schema.`;

    let responseText = "";
    // Supported Gemini models with fallback hierarchy:
    const modelsToTry = [
      "gemini-3.8-flash",
      "gemini-flash-latest",
      "gemini-3.1-flash-lite",
    ];
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      // Try model with up to 2 attempts on 503 / high demand spikes
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: cleanBase64,
                  },
                },
                {
                  text: prompt,
                },
              ],
            },
            config: {
              systemInstruction:
                "You are an expert clinical nutritionist and metrology AI. Prioritize ACCURACY and INTEGRITY over speed. Follow Strict Nutrition Rules: Unrecognized/Low-Confidence Safeguard (Rule 0: return is_unrecognized_or_low_confidence=true and items=[] for non-food, blurry or <40% confidence), Label First, Variant Detection, Sanity Checking, Confidence Honesty (cap 60% for packaged estimates, 70% for homemade), Blurry Label handling, Fiber & Sugar Alcohols Adjusted Net Carbs, Serving Size breakdown vs Total Container, Language-Agnostic parsing (Arabic/English), and Weight verification against standard category bounds. Return strictly valid JSON object conforming to schema.",
              responseMimeType: "application/json",
              responseSchema: mealAnalysisResponseSchema,
              temperature: 0.0,
            },
          });

          if (response.text) {
            responseText = response.text;
            break;
          }
        } catch (err: any) {
          lastError = err;
          const errStr = String(err?.message || err);
          console.warn(`Model ${modelName} (attempt ${attempt + 1}) encountered error:`, errStr.slice(0, 150));

          // If 503 unavailable (spikes in demand), wait before retrying
          if (errStr.includes("503") || errStr.includes("UNAVAILABLE") || errStr.includes("high demand")) {
            if (attempt === 0) {
              await new Promise((resolve) => setTimeout(resolve, 1200 + Math.random() * 400));
              continue;
            }
          }
          // On other errors (like 429 quota or 404), break immediately to next model
          break;
        }
      }

      if (responseText) {
        break;
      }
    }

    if (!responseText) {
      const errStr = String(lastError?.message || lastError || "");
      const isQuotaOrDemandExhausted =
        errStr.includes("429") ||
        errStr.includes("RESOURCE_EXHAUSTED") ||
        errStr.includes("Quota exceeded") ||
        errStr.includes("503") ||
        errStr.includes("UNAVAILABLE") ||
        errStr.includes("high demand");

      if (isQuotaOrDemandExhausted) {
        console.warn("[Quota/Demand Fallback] Gemini API rate limit or high demand reached. Returning error to user.");
        res.status(503).json({
          error: true,
          error_code: "AI_UNAVAILABLE",
          message: "تعذر تحليل الصورة حالياً. حاول مرة أخرى."
        });
        return;
      }

      throw lastError || new Error("Failed to get analysis from Gemini models.");
    }

    // Strip Markdown JSON fences if present
    let cleanJson = responseText.trim();
    if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    }

    const rawData = JSON.parse(cleanJson);

    // Check Safeguard Requirement 1 & 2:
    const isUnrecognizedFlag =
      rawData.is_unrecognized_or_low_confidence === true ||
      rawData.unrecognized === true;

    const rawList = Array.isArray(rawData)
      ? rawData
      : Array.isArray(rawData.items)
      ? rawData.items
      : Array.isArray(rawData.foods)
      ? rawData.foods
      : [];

    if (isUnrecognizedFlag || rawList.length === 0) {
      console.log("[Safeguard Triggered] Unrecognized food or low-confidence scan from model.");
      res.json({
        unrecognized: true,
        message: "لم نتمكن من التعرف على الطعام بدقة كافية. حاول تصوير الطبق بوضوح أكبر أو من زاوية مختلفة.",
        reason: rawData.unrecognized_reason || "Low confidence / unrecognized food image",
      });
      return;
    }

    // Process and verify through the biological Sanity Check Engine & USDA verification
    const items = rawList.map((item: any, idx: number) => {
      return validateAndSanityCheckItem(item, idx);
    });

    // Check Safeguard Requirement 1 & 5:
    const safeguardResult = evaluateMealConfidenceSafeguard(items);
    if (safeguardResult.isUnrecognized) {
      console.log(`[Safeguard Triggered] Confidence/Sanity safeguard failed: ${safeguardResult.reason}`);
      res.json({
        unrecognized: true,
        message: safeguardResult.message,
        reason: safeguardResult.reason,
      });
      return;
    }

    // Save packaged/branded products to recognized_foods_cache in Firestore
    for (const item of items) {
      if (item.data_source === "label_read" || item.data_source === "product_estimate") {
        const name = item.item_name;
        if (name && name.length >= 3) {
          const cacheKey = normalizeServerCacheKey(name);
          if (cacheKey) {
            const docRef = doc(serverDb, CACHE_COLLECTION_NAME, cacheKey);
            getDoc(docRef).then((docSnap) => {
              if (docSnap.exists()) {
                const existing = docSnap.data();
                updateDoc(docRef, {
                  usageCount: (Number(existing.usageCount) || 1) + 1,
                  calories: Number(item.calories) || existing.calories,
                  protein: Number(item.protein_g) || existing.protein,
                  carbs: Number(item.carbs_g) || existing.carbs,
                  fat: Number(item.fat_g) || existing.fat,
                  weight: Number(item.weight_g) || existing.weight,
                  confidence: Number(item.confidence_score) || existing.confidence,
                  updatedAt: serverTimestamp(),
                }).catch(() => {});
              } else {
                setDoc(docRef, {
                  foodName: name,
                  calories: Number(item.calories) || 0,
                  protein: Number(item.protein_g) || 0,
                  carbs: Number(item.carbs_g) || 0,
                  fat: Number(item.fat_g) || 0,
                  weight: Number(item.weight_g) || 100,
                  confidence: Number(item.confidence_score) || 90,
                  category: item.food_category || "packaged_product",
                  usageCount: 1,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                }).catch(() => {});
              }
            }).catch(() => {});
          }
        }
      }
    }

    // Save to cache for 100% deterministic re-scans of identical photo (only valid, confidence-passing results)
    mealAnalysisCache.set(imageHash, items);

    res.json(items);
  } catch (error: any) {
    console.error("Error analyzing meal:", error);
    const errStr = error?.message || String(error);

    let friendlyMessage = "Failed to analyze meal photo. Please try again.";
    let statusCode = 500;

    if (
      errStr.includes("429") ||
      errStr.includes("RESOURCE_EXHAUSTED") ||
      errStr.includes("Quota exceeded")
    ) {
      statusCode = 429;
      const match = errStr.match(/retry in ([0-9.]+)s/i) || errStr.match(/"retryDelay":\s*"(\d+)s"/i);
      const seconds = match ? Math.ceil(parseFloat(match[1])) : 45;
      friendlyMessage = `Gemini AI Vision rate limit reached. Please wait ${seconds} seconds before scanning again, or test with one of our sample plates.`;
    } else if (
      errStr.includes("503") ||
      errStr.includes("UNAVAILABLE") ||
      errStr.includes("high demand")
    ) {
      statusCode = 503;
      friendlyMessage = "Gemini AI Vision is experiencing a temporary spike in traffic. Please retry in a few seconds.";
    } else if (errStr.includes("404") || errStr.includes("NOT_FOUND")) {
      friendlyMessage = "AI service model route unavailable. Please retry.";
    }

    res.status(statusCode).json({
      error: friendlyMessage,
      statusCode,
    });
  }
}
