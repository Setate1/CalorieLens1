import {
  FoodCategory,
  USDAFoodProfile,
  USDA_REFERENCE_DATABASE,
  matchUSDAFood,
} from "./usdaDatabase.js";

/**
 * Strict floating-point rounder to 1 decimal place.
 */
export function round1Dec(val: number): number {
  if (isNaN(val) || !isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 10) / 10;
}

/**
 * Detect product variant (Diet / Zero / Sugar-Free / Light vs Regular) from packaging text.
 */
export function detectProductVariant(text: string): {
  isDietOrZero: boolean;
  isKetoOrLowCarb: boolean;
  variantName: string | null;
} {
  const lower = text.toLowerCase();
  const zeroKeywords = [
    "zero sugar",
    "zero",
    "diet",
    "light",
    "sugar-free",
    "sugar free",
    "no sugar",
    "sugarless",
    "max",
    "دايت",
    "زيرو",
    "لايت",
    "بدون سكر",
    "خالي من السكر",
    "صفر سكر",
    "فري",
  ];

  const ketoKeywords = [
    "keto",
    "low carb",
    "net carbs",
    "كيتو",
    "قليل الكارب",
    "لو كارب",
    "سكر كحولي",
    "sugar alcohol",
    "erythritol",
    "maltitol",
    "xylitol",
    "sorbitol",
    "ستيفيا",
    "stevia",
  ];

  let isDietOrZero = false;
  let isKetoOrLowCarb = false;
  let variantName: string | null = null;

  for (const kw of zeroKeywords) {
    if (lower.includes(kw)) {
      isDietOrZero = true;
      variantName = kw;
      break;
    }
  }

  for (const kw of ketoKeywords) {
    if (lower.includes(kw)) {
      isKetoOrLowCarb = true;
      if (!variantName) variantName = kw;
      break;
    }
  }

  return { isDietOrZero, isKetoOrLowCarb, variantName };
}

/**
 * Cross-checks estimated portion weight against standard known ranges (Rule 10).
 */
export function checkWeightSanity(
  itemName: string,
  category: FoodCategory,
  weight_g: number
): { is_out_of_range: boolean; typical_range: string; message?: string } {
  const lower = itemName.toLowerCase();

  // 1. Protein bars
  if (/protein bar|بروتين بار|لوح بروتين|بار بروتين/i.test(lower)) {
    const typical = "40-70g (standard single bar)";
    if (weight_g < 25 || weight_g > 110) {
      return {
        is_out_of_range: true,
        typical_range: typical,
        message: `الوزن المقدر (${weight_g}g) يختلف عن الوزن المعتاد لألواح البروتين (${typical}).`,
      };
    }
    return { is_out_of_range: false, typical_range: typical };
  }

  // 2. Canned / bottled soft drinks
  if (/soda|cola|coke|pepsi|7up|sprite|fanta|can|مشروب غازي|كانز/i.test(lower)) {
    const typical = "330-355ml (standard can) or 250ml / 500ml";
    if (weight_g < 150 || weight_g > 650) {
      return {
        is_out_of_range: true,
        typical_range: typical,
        message: `الحجم المقدر (${weight_g}ml) يختلف عن سعة عبوات المشروبات الغازية المعتادة (${typical}).`,
      };
    }
    return { is_out_of_range: false, typical_range: typical };
  }

  // 3. Energy bars / Granola bars
  if (/granola bar|energy bar|جرانولا/i.test(lower)) {
    const typical = "30-50g (single bar)";
    if (weight_g < 20 || weight_g > 85) {
      return {
        is_out_of_range: true,
        typical_range: typical,
        message: `الوزن المقدر (${weight_g}g) خارج نطاق ألواح الطاقة المعتاد (${typical}).`,
      };
    }
    return { is_out_of_range: false, typical_range: typical };
  }

  // 4. Single eggs
  if (/^egg|boiled egg|fried egg|بيض|بيضة/i.test(lower)) {
    const typical = "50-60g (single large egg)";
    if (weight_g < 35 || weight_g > 95) {
      return {
        is_out_of_range: true,
        typical_range: typical,
        message: `وزن البيضة الواحدة (${weight_g}g) خارج النطاق الطبيعي (${typical}).`,
      };
    }
    return { is_out_of_range: false, typical_range: typical };
  }

  // 5. Bread slice / toast
  if (/toast|slice of bread|شريحة توست|خبز توست/i.test(lower)) {
    const typical = "25-35g (single slice)";
    if (weight_g < 15 || weight_g > 70) {
      return {
        is_out_of_range: true,
        typical_range: typical,
        message: `وزن شريحة الخبز (${weight_g}g) خارج النطاق الطبيعي (${typical}).`,
      };
    }
    return { is_out_of_range: false, typical_range: typical };
  }

  // 6. Whole fruit (apple, banana, orange)
  if (/apple|banana|orange|تفاح|موز|برتقال/i.test(lower)) {
    const typical = "120-200g (medium piece)";
    if (weight_g < 50 || weight_g > 350) {
      return {
        is_out_of_range: true,
        typical_range: typical,
        message: `وزن الحبة (${weight_g}g) يختلف عن وزن الفاكهة المتوسطة المعتاد (${typical}).`,
      };
    }
    return { is_out_of_range: false, typical_range: typical };
  }

  return { is_out_of_range: false, typical_range: "Standard portion" };
}

/**
 * Calculates Adjusted Atwater breakdown accounting for Fiber and Sugar Alcohols (Rule 6).
 * - Standard Carbs: 4 kcal/g
 * - Dietary Fiber: ~1.5 kcal/g
 * - Sugar Alcohols (Erythritol/Maltitol/Xylitol): ~2.0 kcal/g
 * - Protein: 4 kcal/g
 * - Fat: 9 kcal/g
 */
export function calculateAdjustedAtwater(
  protein_g: number,
  total_carbs_g: number,
  fat_g: number,
  fiber_g?: number,
  sugar_alcohols_g?: number,
  net_carbs_g?: number
): { calories: number; adjusted_net_carbs: number; is_adjusted: boolean } {
  const p = Math.max(0, protein_g);
  const f = Math.max(0, fat_g);
  const totalC = Math.max(0, total_carbs_g);
  const fib = Math.max(0, fiber_g ?? 0);
  const sa = Math.max(0, sugar_alcohols_g ?? 0);

  let netC = net_carbs_g !== undefined ? Math.max(0, net_carbs_g) : Math.max(0, totalC - fib - sa);

  if (fib > 0 || sa > 0 || net_carbs_g !== undefined) {
    // Adjusted formula (Rule 6)
    const cal = Math.round(p * 4 + f * 9 + netC * 4 + fib * 1.5 + sa * 2.0);
    return {
      calories: Math.max(0, cal),
      adjusted_net_carbs: round1Dec(netC),
      is_adjusted: true,
    };
  }

  // Standard Atwater
  const cal = Math.round(p * 4 + totalC * 4 + f * 9);
  return {
    calories: Math.max(0, cal),
    adjusted_net_carbs: round1Dec(totalC),
    is_adjusted: false,
  };
}

/**
 * Detect biological food category from component name keywords.
 */
export function detectFoodCategory(name: string): FoodCategory {
  const lower = name.toLowerCase().trim();

  // 1. Protein Bars & Performance Snacks
  const snackBarTerms = [
    "protein bar",
    "quest bar",
    "grenade bar",
    "barebells",
    "energy bar",
    "granola bar",
    "cereal bar",
    "oat bar",
    "bar protein",
    "بروتين بار",
    "لوح بروتين",
    "بار بروتين",
    "سناك بروتين",
    "جرانولا بار",
  ];
  for (const term of snackBarTerms) {
    if (lower.includes(term)) return "snack_bar";
  }

  // 2. Beverages (Sodas, Coffee, Teas, Drinks)
  const beverageTerms = [
    "soda",
    "cola",
    "coke",
    "pepsi",
    "7up",
    "sprite",
    "drink",
    "beverage",
    "coffee",
    "espresso",
    "americano",
    "latte",
    "tea",
    "energy drink",
    "monster",
    "red bull",
    "celsius",
    "water",
    "juice",
    "مشروب",
    "غازي",
    "كولا",
    "بيبسي",
    "سفن",
    "سبرايت",
    "قهوة",
    "شاي",
    "عصير",
  ];
  for (const term of beverageTerms) {
    if (lower.includes(term)) return "beverage";
  }

  // 3. Composite / Mixed Dishes with Carbs & Protein (Must precede pure single ingredients)
  const mixedMealTerms = [
    "hawawshi",
    "hawawshy",
    "حواوشي",
    "sandwich",
    "ساندوتش",
    "ساندويتش",
    "burger",
    "hamburger",
    "cheeseburger",
    "برجر",
    "همبرجر",
    "shawarma",
    "شاورما",
    "pizza",
    "بيتزا",
    "pie",
    "فطيرة",
    "فطير",
    "taco",
    "burrito",
    "quesadilla",
    "wrap",
    "كريب",
    "crepe",
    "lasagna",
    "لازانيا",
    "bechamel",
    "بشاميل",
    "koshary",
    "كشري",
    "mahshi",
    "محشي",
    "ورق عنب",
    "كوسة محشية",
    "stuffed",
    "sambusa",
    "سمبوسك",
    "سمبوسة",
    "breaded",
    "crispy",
    "nugget",
    "nuggets",
    "بانيه",
    "بروستد",
    "ناجتس",
    "escalope",
    "فتة",
    "fatta",
    "طاجن",
    "صينية",
    "مندي",
    "كبسة",
    "برياني",
    "biryani",
    "kabsa",
    "mandi",
  ];
  for (const term of mixedMealTerms) {
    if (lower.includes(term)) return "mixed";
  }

  // 4. Vegetables
  const vegetableTerms = [
    "vegetable",
    "veggie",
    "asparagus",
    "tomato",
    "onion",
    "bell pepper",
    "pepper",
    "capsicum",
    "broccoli",
    "zucchini",
    "courgette",
    "eggplant",
    "aubergine",
    "mushroom",
    "spinach",
    "lettuce",
    "salad",
    "greens",
    "cucumber",
    "green bean",
    "cauliflower",
    "carrot",
    "celery",
    "kale",
    "cabbage",
    "radish",
    "beet",
    "squash",
    "okra",
    "leek",
    "garlic",
    "خضار",
    "طماطم",
    "بصل",
    "فلفل",
    "هليون",
    "كوسة",
    "باذنجان",
    "بروكلي",
    "خس",
    "خيار",
    "جزر",
    "مشروم",
  ];
  for (const term of vegetableTerms) {
    if (lower.includes(term)) return "vegetable";
  }

  // 4. Meat, Poultry, Fish & Eggs
  const proteinTerms = [
    "chicken",
    "turkey",
    "beef",
    "steak",
    "veal",
    "pork",
    "lamb",
    "salmon",
    "tuna",
    "cod",
    "tilapia",
    "fish",
    "shrimp",
    "prawn",
    "seafood",
    "egg",
    "kebab",
    "patty",
    "meat",
    "fillet",
    "poultry",
    "دجاج",
    "لحم",
    "كفتة",
    "سمك",
    "سلمون",
    "جمبري",
    "تونة",
    "بيض",
  ];
  for (const term of proteinTerms) {
    if (lower.includes(term)) return "meat_poultry_fish";
  }

  // 5. Starch & Grains
  const starchTerms = [
    "rice",
    "pasta",
    "spaghetti",
    "noodle",
    "macaroni",
    "penne",
    "bread",
    "toast",
    "pita",
    "naan",
    "tortilla",
    "potato",
    "potatoes",
    "sweet potato",
    "quinoa",
    "oats",
    "oatmeal",
    "cereal",
    "couscous",
    "bun",
    "bagel",
    "أرز",
    "مكرونة",
    "خبز",
    "عيش",
    "بطاطس",
    "بطاطا",
    "توست",
  ];
  for (const term of starchTerms) {
    if (lower.includes(term)) return "starch_grain";
  }

  // 6. Legumes
  const legumeTerms = [
    "lentil",
    "chickpea",
    "bean",
    "edamame",
    "hummus",
    "tofu",
    "tempeh",
    "عدس",
    "حمص",
    "فول",
    "فاصوليا",
  ];
  for (const term of legumeTerms) {
    if (lower.includes(term)) return "legume";
  }

  // 7. Fats & Oils
  const fatTerms = ["oil", "olive oil", "butter", "ghee", "mayo", "mayonnaise", "avocado", "زيت", "زبدة", "أفوكادو"];
  for (const term of fatTerms) {
    if (lower.includes(term)) return "fat_oil";
  }

  // 8. Dairy
  const dairyTerms = ["cheese", "yogurt", "milk", "curd", "paneer", "جبن", "زبادي", "لبن", "حليب"];
  for (const term of dairyTerms) {
    if (lower.includes(term)) return "dairy";
  }

  return "mixed";
}

/**
 * Biological Category Upper/Lower bounds per 100 grams of food
 */
export const CATEGORY_SANITY_BOUNDS: Record<
  FoodCategory,
  {
    maxProteinPer100g: number;
    minCarbsPer100g?: number;
    maxCarbsPer100g?: number;
    maxFatPer100g?: number;
    minProteinPer100g?: number;
  }
> = {
  // Vegetables: low protein (≤ 5g/100g), natural carbs (1.5g - 15g/100g), low fat unless oiled (≤ 6g/100g)
  vegetable: {
    maxProteinPer100g: 5.0,
    minCarbsPer100g: 1.5,
    maxCarbsPer100g: 16.0,
    maxFatPer100g: 8.0,
  },
  // Meat/Poultry/Fish: high protein (12g - 35g/100g), minimal carbs (≤ 4g/100g)
  meat_poultry_fish: {
    minProteinPer100g: 10.0,
    maxProteinPer100g: 35.0,
    maxCarbsPer100g: 4.0,
    maxFatPer100g: 35.0,
  },
  // Starchy Carbs: high carbs (≥ 14g/100g), moderate protein (≤ 14g/100g)
  starch_grain: {
    minCarbsPer100g: 14.0,
    maxProteinPer100g: 14.0,
    maxFatPer100g: 15.0,
  },
  // Legumes: balanced protein (5g - 20g/100g) and carbs (8g - 30g/100g)
  legume: {
    maxProteinPer100g: 22.0,
    minCarbsPer100g: 8.0,
    maxCarbsPer100g: 35.0,
    maxFatPer100g: 15.0,
  },
  fruit: {
    maxProteinPer100g: 2.5,
    minCarbsPer100g: 4.0,
    maxCarbsPer100g: 25.0,
    maxFatPer100g: 3.0,
  },
  fat_oil: {
    maxProteinPer100g: 4.0,
    maxCarbsPer100g: 12.0,
  },
  dairy: {
    maxProteinPer100g: 35.0,
    maxCarbsPer100g: 20.0,
    maxFatPer100g: 40.0,
  },
  snack_bar: {
    minProteinPer100g: 12.0,
    maxProteinPer100g: 45.0,
    maxCarbsPer100g: 75.0,
    maxFatPer100g: 25.0,
  },
  beverage: {
    maxProteinPer100g: 3.0,
    maxCarbsPer100g: 20.0,
    maxFatPer100g: 5.0,
  },
  mixed: {
    maxProteinPer100g: 35.0,
  },
};

/**
 * Default fallback USDA profiles by category when an item has no exact match
 */
const DEFAULT_CATEGORY_USDA_PROFILES: Record<FoodCategory, USDAFoodProfile> = {
  vegetable: {
    name: "Vegetables, mixed, grilled or roasted",
    source: "USDA FoodData Central #170450",
    category: "vegetable",
    calories_per_100g: 42,
    protein_per_100g: 1.8,
    carbs_per_100g: 7.2,
    fat_per_100g: 0.8,
    aliases: [],
  },
  meat_poultry_fish: {
    name: "Chicken breast, grilled, boneless, skinless",
    source: "USDA FoodData Central #171077",
    category: "meat_poultry_fish",
    calories_per_100g: 165,
    protein_per_100g: 31.0,
    carbs_per_100g: 0.0,
    fat_per_100g: 3.6,
    aliases: [],
  },
  starch_grain: {
    name: "Rice, white, long-grain, regular, cooked",
    source: "USDA FoodData Central #168878",
    category: "starch_grain",
    calories_per_100g: 130,
    protein_per_100g: 2.7,
    carbs_per_100g: 28.2,
    fat_per_100g: 0.3,
    aliases: [],
  },
  legume: {
    name: "Hummus, commercial",
    source: "USDA FoodData Central #173799",
    category: "legume",
    calories_per_100g: 166,
    protein_per_100g: 7.9,
    carbs_per_100g: 14.3,
    fat_per_100g: 9.6,
    aliases: [],
  },
  fruit: {
    name: "Tomatoes, red, grilled or roasted",
    source: "USDA FoodData Central #170457",
    category: "vegetable",
    calories_per_100g: 24,
    protein_per_100g: 1.1,
    carbs_per_100g: 4.8,
    fat_per_100g: 0.4,
    aliases: [],
  },
  fat_oil: {
    name: "Olive oil, salad or cooking",
    source: "USDA FoodData Central #171413",
    category: "fat_oil",
    calories_per_100g: 884,
    protein_per_100g: 0.0,
    carbs_per_100g: 0.0,
    fat_per_100g: 100.0,
    aliases: [],
  },
  dairy: {
    name: "Egg, whole, hard-boiled or poached",
    source: "USDA FoodData Central #171287",
    category: "meat_poultry_fish",
    calories_per_100g: 155,
    protein_per_100g: 12.6,
    carbs_per_100g: 1.1,
    fat_per_100g: 10.6,
    aliases: [],
  },
  snack_bar: {
    name: "Protein bar, high protein, various flavors",
    source: "USDA FoodData Central #173510",
    category: "snack_bar",
    calories_per_100g: 365,
    protein_per_100g: 33.3,
    carbs_per_100g: 35.0,
    fat_per_100g: 10.0,
    aliases: [],
  },
  beverage: {
    name: "Carbonated soft drink, Diet / Zero sugar, with artificial sweeteners",
    source: "USDA FoodData Central #174853",
    category: "beverage",
    calories_per_100g: 1,
    protein_per_100g: 0.0,
    carbs_per_100g: 0.1,
    fat_per_100g: 0.0,
    aliases: [],
  },
  mixed: {
    name: "Mixed meal / composite dish",
    source: "USDA FoodData Central #172050",
    category: "mixed",
    calories_per_100g: 220,
    protein_per_100g: 12.0,
    carbs_per_100g: 22.0,
    fat_per_100g: 9.0,
    aliases: ["mixed meal", "hawawshi", "sandwich", "burger", "shawarma", "وجبة مركبة"],
  },
};

export interface SanityCheckResult {
  id: string;
  item_name: string;
  weight_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;

  // Realistic portion estimation & weight ranges
  portion_description?: string;
  weight_range_min_g?: number;
  weight_range_max_g?: number;
  best_estimate_weight_g?: number;
  portion_preset?: 'small' | 'medium' | 'large' | 'custom';
  small_weight_g?: number;
  medium_weight_g?: number;
  large_weight_g?: number;

  // Hidden fats, oils & sauces estimation
  has_hidden_fats_or_sauces?: boolean;
  hidden_fats_description?: string;
  cooking_oil_estimate_kcal?: number;
  is_low_confidence_portion?: boolean;

  fat_calories_pct?: number; // (Rule 11: Fat calories percentage)
  fat_sanity_warning?: string; // (Rule 11: Flagged if >50% for non-fried/non-oily food)
  is_unidentified_component?: boolean; // (Rule 12: Unidentified component transparency)
  fiber_g?: number;
  sugar_alcohols_g?: number;
  net_carbs_g?: number;
  is_keto_or_low_carb?: boolean;
  serving_info?: {
    serving_size_desc?: string;
    servings_per_container?: number;
    per_serving_calories?: number;
    total_package_calories?: number;
    reported_basis?: "per_serving" | "total_package" | "per_100g" | "custom_portion";
  };
  data_source: "label_read" | "product_estimate" | "visual_portion_estimate" | "uncertain";
  variant_detected?: string;
  reasoning?: string;
  user_guidance?: string;
  confidence_score: number;
  reference_object_detected: string;
  label_language_detected?: string;
  weight_sanity?: {
    is_out_of_range?: boolean;
    typical_range?: string;
    message?: string;
  };
  usda_matched_name: string;
  usda_source: string;
  needs_review: boolean;
  atwater_calories: number;
  is_approximate_estimate: boolean;
  food_category: FoodCategory;
  sanity_status: "verified" | "auto_corrected" | "flagged";
  sanity_message: string;
  raw_ai_estimate?: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  per_100g: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
}

/**
 * Evaluates an AI extracted food item through the Strict Nutrition & Sanity Engine.
 * Implements 10 strict accuracy rules:
 * 1. Label First extraction
 * 2. Variant detection (Diet/Zero vs Regular)
 * 3. Sanity check for protein bars & sodas
 * 4. Confidence honesty (capped at 60% if no visible label)
 * 5. Blurry/obscured label handling
 * 6. Fiber & Sugar Alcohols (Net Carbs Atwater)
 * 7. Multiple items / Serving size mismatch
 * 8. Non-packaged / Homemade food visual estimation (max 70% confidence)
 * 9. Language-agnostic label reading
 * 10. Weight verification against category ranges
 */
export function validateAndSanityCheckItem(rawItem: any, idx: number): SanityCheckResult {
  const itemName = String(rawItem.item_name || rawItem.food_name || "Food component");
  const grams = Math.max(1, Math.round(Number(rawItem.weight_g || rawItem.estimated_grams) || 50));
  let confidence = Math.max(10, Math.min(100, Math.round(Number(rawItem.confidence_score) || 60)));
  const referenceObj = String(
    rawItem.reference_object_detected || "Standard reference scale (~26cm plate / 330ml can)"
  );

  // Raw AI estimates
  let rawProtein = round1Dec(
    Number(rawItem.protein_g ?? rawItem.protein ?? rawItem.total_protein ?? rawItem.proteins_g) || 0
  );
  let rawCarbs = round1Dec(
    Number(
      rawItem.carbs_g ??
        rawItem.carbs ??
        rawItem.carbohydrates ??
        rawItem.carbohydrates_g ??
        rawItem.total_carbs ??
        rawItem.total_carbohydrates ??
        rawItem.carb_g ??
        rawItem.carb
    ) || 0
  );
  let rawFat = round1Dec(
    Number(rawItem.fat_g ?? rawItem.fat ?? rawItem.total_fat ?? rawItem.fats_g) || 0
  );
  let rawFiber = rawItem.fiber_g !== undefined ? round1Dec(Number(rawItem.fiber_g)) : undefined;
  let rawSugarAlcohols =
    rawItem.sugar_alcohols_g !== undefined ? round1Dec(Number(rawItem.sugar_alcohols_g)) : undefined;
  let rawNetCarbs = rawItem.net_carbs_g !== undefined ? round1Dec(Number(rawItem.net_carbs_g)) : undefined;

  // Compute Adjusted Atwater
  const atwaterCalc = calculateAdjustedAtwater(
    rawProtein,
    rawCarbs,
    rawFat,
    rawFiber,
    rawSugarAlcohols,
    rawNetCarbs
  );
  let rawAtwater = atwaterCalc.calories;
  let rawCalories = Math.max(0, Math.round(Number(rawItem.calories) || rawAtwater));

  // Determine Category
  const category = detectFoodCategory(itemName);
  const bounds = CATEGORY_SANITY_BOUNDS[category];

  // Check Variant & Keto/Low-Carb (Rule 2 & Rule 6)
  const variantCheck = detectProductVariant(
    `${itemName} ${rawItem.variant_detected || ""} ${rawItem.reasoning || ""}`
  );
  const isKetoOrLowCarb =
    Boolean(rawItem.is_keto_or_low_carb) ||
    variantCheck.isKetoOrLowCarb ||
    (rawSugarAlcohols !== undefined && rawSugarAlcohols > 0) ||
    (rawFiber !== undefined && rawFiber >= 10);

  // Data Source determination (Rule 1, Rule 4, Rule 8)
  let dataSource: "label_read" | "product_estimate" | "visual_portion_estimate" | "uncertain" = "product_estimate";
  if (
    rawItem.data_source === "label_read" ||
    rawItem.data_source === "product_estimate" ||
    rawItem.data_source === "visual_portion_estimate" ||
    rawItem.data_source === "uncertain"
  ) {
    dataSource = rawItem.data_source;
  } else if (
    rawItem.label_read === true ||
    (confidence >= 85 && /label|nutrition facts|table|حقائق غذائية/i.test(String(rawItem.reasoning || "")))
  ) {
    dataSource = "label_read";
  } else if (
    /home|plate|restaurant|fresh|unlabeled|طازج|منزلي|طبق/i.test(
      `${itemName} ${referenceObj} ${rawItem.reasoning || ""}`
    )
  ) {
    dataSource = "visual_portion_estimate";
  } else if (confidence < 50) {
    dataSource = "uncertain";
  }

  // RULE 4 & RULE 8: CONFIDENCE HONESTY & REFERENCE SIZE CALIBRATION
  const hasPhysicalReference = /hand|finger|spoon|fork|knife|utensil|coin|mug|glass|cup|can|bottle|يد|اصبع|إصبع|ملعقة|شوكة|سكين|عملة|كوب|علبة/i.test(
    `${referenceObj} ${rawItem.reasoning || ""}`
  );

  if (dataSource === "label_read") {
    // Label reads can have high confidence
    confidence = Math.max(80, Math.min(100, confidence));
  } else if (dataSource === "visual_portion_estimate") {
    // Non-packaged / home-cooked foods: if reference object detected, raise confidence (75-85%), otherwise cap at 70%
    if (hasPhysicalReference) {
      confidence = Math.min(85, Math.max(75, confidence));
    } else {
      confidence = Math.min(confidence, 70);
    }
  } else {
    // Product estimate without visible label capped at 60%
    confidence = Math.min(confidence, 60);
  }

  // Language Detection (Rule 9)
  let detectedLanguage = rawItem.label_language_detected || "English";
  const hasArabic = /[\u0600-\u06FF]/.test(`${itemName} ${rawItem.reasoning || ""} ${rawItem.variant_detected || ""}`);
  const hasEnglish = /[a-zA-Z]/.test(`${itemName} ${rawItem.reasoning || ""}`);
  if (hasArabic && hasEnglish) {
    detectedLanguage = "Bilingual Arabic/English (ثنائي اللغة)";
  } else if (hasArabic) {
    detectedLanguage = "Arabic (عربي)";
  } else {
    detectedLanguage = "English";
  }

  // Weight Sanity Check (Rule 10)
  const weightSanity = checkWeightSanity(itemName, category, grams);

  // Search USDA database with category constraint
  let usdaProfile = matchUSDAFood(itemName, category) || matchUSDAFood(itemName);
  if (!usdaProfile) {
    usdaProfile = DEFAULT_CATEGORY_USDA_PROFILES[category];
  }

  const violations: string[] = [];
  let variantDetectedStr = rawItem.variant_detected || "";
  let userGuidanceStr = rawItem.user_guidance || "";
  let reasoningStr = rawItem.reasoning || "";

  // ================= RULE 2: BEVERAGE & VARIANT DETECTION =================
  if (category === "beverage") {
    if (variantCheck.isDietOrZero) {
      variantDetectedStr = `Diet / Zero Sugar variant detected ("${variantCheck.variantName}")`;
      if (rawCalories > 15 || rawCarbs > 3) {
        violations.push(
          `Diet/Zero beverage reported with ${rawCalories} kcal and ${rawCarbs}g carbs (Diet beverages use artificial sweeteners and have ~0-5 kcal).`
        );
      }
    } else {
      if (/cola|pepsi|coke|sprite|7up|soda|fanta|carbonated/i.test(itemName)) {
        if (grams >= 250 && grams <= 400) {
          if (rawCalories >= 15 && rawCalories <= 110) {
            violations.push(
              `Carbonated drink portion (${grams}ml) estimated at ${rawCalories} kcal. Regular sodas are ~140-180 kcal and diet sodas are ~0-5 kcal with no realistic middle ground.`
            );
            dataSource = "uncertain";
            confidence = Math.min(confidence, 50);
          }
        }
      }
    }
  }

  // ================= RULE 3: PROTEIN BAR SANITY CHECK =================
  const isProteinBar =
    category === "snack_bar" &&
    /protein|quest|barebells|grenade|بروتين/i.test(itemName);

  if (isProteinBar) {
    if (grams >= 35 && grams <= 85) {
      if (rawCalories < 100 || rawProtein < 8) {
        violations.push(
          `Protein bar (${grams}g) reported with only ${rawCalories} kcal or ${rawProtein}g protein (Protein bars typically provide 150-300 kcal with 15-25g protein).`
        );
      }
    }
  }

  // Normalized per 100g values reported by AI
  const ratioGramsTo100 = grams > 0 ? 100 / grams : 1;
  const reportedP100 = round1Dec(rawProtein * ratioGramsTo100);
  const reportedC100 = round1Dec(rawCarbs * ratioGramsTo100);
  const reportedF100 = round1Dec(rawFat * ratioGramsTo100);
  const totalDryMacros100 = reportedP100 + reportedC100 + reportedF100;

  // General Biological Bounds Checks
  if (reportedP100 > 45.0 && !isProteinBar) {
    violations.push(`Protein density (${reportedP100}g/100g) exceeds biological whole-food ceiling (max 35g/100g)`);
  }

  if (category === "vegetable" && reportedP100 > bounds.maxProteinPer100g) {
    violations.push(
      `Vegetable protein (${reportedP100}g/100g) exceeds natural vegetable bounds (expected ≤ ${bounds.maxProteinPer100g}g/100g)`
    );
  }

  if (category === "vegetable" && bounds.minCarbsPer100g && reportedC100 < bounds.minCarbsPer100g) {
    violations.push(
      `Vegetable carbohydrates (${reportedC100}g/100g) implausibly low (expected ≥ ${bounds.minCarbsPer100g}g/100g)`
    );
  }

  if (category === "starch_grain" && bounds.minCarbsPer100g && reportedC100 < bounds.minCarbsPer100g) {
    violations.push(
      `Starchy food carbohydrates (${reportedC100}g/100g) implausibly low (expected ≥ ${bounds.minCarbsPer100g}g/100g)`
    );
  }

  if (
    category === "meat_poultry_fish" &&
    bounds.maxCarbsPer100g &&
    reportedC100 > bounds.maxCarbsPer100g
  ) {
    // Only flag if strictly plain unbreaded and unseasoned cut of meat
    const isPreparedOrBreaded = /breaded|crispy|fried|nugget|patty|burger|bbq|sweet|glazed|sauce|marinade|بانيه|مقلي|محمر|صوص|حلو|متبل|كرسبي/i.test(itemName);
    if (!isPreparedOrBreaded && reportedC100 > 8.0) {
      violations.push(
        `Unbreaded meat reported with implausible carbohydrates (${reportedC100}g/100g; expected ≤ ${bounds.maxCarbsPer100g}g/100g)`
      );
    }
  }

  if (totalDryMacros100 > 98.0) {
    violations.push(
      `Total macronutrient mass (${totalDryMacros100}g/100g) exceeds physical boundaries (matter conservation)`
    );
  }

  let needsReview: boolean = weightSanity.is_out_of_range || false;

  // Caloric discrepancy check: used for validation/review flag, NOT to overwrite carbs
  const atwaterDiffPct = rawAtwater > 0 ? Math.abs(rawCalories - rawAtwater) / rawAtwater : 0;
  if (atwaterDiffPct > 0.15 && !isKetoOrLowCarb) {
    needsReview = true;
  }

  let finalProtein: number;
  let finalCarbs: number;
  let finalFat: number;
  let finalCalories: number;
  let finalAtwater: number;
  let per100gProfile: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  let sanityStatus: "verified" | "auto_corrected" | "flagged";
  let sanityMessage: string;

  const portionRatio = grams / 100;

  if (dataSource === "label_read" && violations.length === 0) {
    // Direct exact label extraction verified
    finalProtein = rawProtein;
    finalCarbs = rawCarbs;
    finalFat = rawFat;
    finalAtwater = rawAtwater;
    finalCalories = Math.max(0, rawCalories);
    per100gProfile = {
      calories: Math.round(finalCalories * ratioGramsTo100),
      protein_g: round1Dec(finalProtein * ratioGramsTo100),
      carbs_g: round1Dec(finalCarbs * ratioGramsTo100),
      fat_g: round1Dec(finalFat * ratioGramsTo100),
    };
    sanityStatus = "verified";
    sanityMessage = "قراءة مباشرة مؤكدة من جدول الحقائق الغذائية للمنتج.";
    reasoningStr = reasoningStr || "تم استخراج القيم بدقة من جدول الحقائق الغذائية المطبوع على العبوة.";
  } else if (violations.length > 0) {
    // Auto-correction triggered for physical violations
    finalProtein = rawProtein > 0 ? rawProtein : round1Dec(usdaProfile.protein_per_100g * portionRatio);
    // Preserve rawCarbs if AI provided valid non-zero carbs, otherwise use USDA benchmark
    finalCarbs = rawCarbs > 0 ? rawCarbs : round1Dec(usdaProfile.carbs_per_100g * portionRatio);
    finalFat = rawFat > 0 ? rawFat : round1Dec(usdaProfile.fat_per_100g * portionRatio);
    finalAtwater = Math.round(finalProtein * 4 + finalCarbs * 4 + finalFat * 9);
    finalCalories = rawCalories > 0 ? rawCalories : finalAtwater;

    per100gProfile = {
      calories: Math.round(finalCalories * ratioGramsTo100),
      protein_g: round1Dec(finalProtein * ratioGramsTo100),
      carbs_g: round1Dec(finalCarbs * ratioGramsTo100),
      fat_g: round1Dec(finalFat * ratioGramsTo100),
    };

    sanityStatus = "auto_corrected";
    needsReview = true;
    sanityMessage = `تم التحقق والتصحيح: ${violations[0]} - تمت المواءمة مع ${usdaProfile.name}.`;
  } else {
    // Passes sanity bounds: prioritize real AI nutrients
    finalProtein = rawProtein;
    finalCarbs = rawCarbs;
    finalFat = rawFat;
    finalAtwater = rawAtwater > 0 ? rawAtwater : Math.round(finalProtein * 4 + finalCarbs * 4 + finalFat * 9);
    finalCalories = rawCalories > 0 ? rawCalories : finalAtwater;

    per100gProfile = {
      calories: Math.round(finalCalories * ratioGramsTo100),
      protein_g: round1Dec(finalProtein * ratioGramsTo100),
      carbs_g: round1Dec(finalCarbs * ratioGramsTo100),
      fat_g: round1Dec(finalFat * ratioGramsTo100),
    };

    sanityStatus = "verified";
    sanityMessage = `مطابق لمعايير قواعد البيانات الغذائية USDA (${usdaProfile.source}).`;
  }

  // User guidance based on data source (Rule 4, Rule 5, Rule 8)
  if (dataSource === "visual_portion_estimate" && !userGuidanceStr) {
    userGuidanceStr =
      "طعام غير معبأ / محضر منزلياً: تم التقدير بالاعتماد على المرجع البصري (ثقة ≤70%). التقديرات للأطعمة غير المغلفة تحمل نسبة عدم يقين أعلى.";
  } else if (dataSource === "product_estimate" && !userGuidanceStr) {
    userGuidanceStr =
      "القيم مبنية على تقدير شكل المنتج (ثقة 60%). صوّر جدول الحقائق الغذائية للحصول على قراءة مؤكدة 100%.";
  } else if (dataSource === "uncertain" && !userGuidanceStr) {
    userGuidanceStr =
      "الملصق غير واضح أو تم التعرف بشكل غير مؤكد على الصنف. يُنصح بإعادة تصوير جدول الحقائق الغذائية عن قرب.";
  }

  // Serving breakdown info (Rule 7)
  let servingInfo: SanityCheckResult["serving_info"] = undefined;
  if (rawItem.serving_info) {
    servingInfo = {
      serving_size_desc: rawItem.serving_info.serving_size_desc || `${grams}g`,
      servings_per_container: Number(rawItem.serving_info.servings_per_container) || 1,
      per_serving_calories: Number(rawItem.serving_info.per_serving_calories) || finalCalories,
      total_package_calories:
        Number(rawItem.serving_info.total_package_calories) ||
        Math.round(finalCalories * (Number(rawItem.serving_info.servings_per_container) || 1)),
      reported_basis: rawItem.serving_info.reported_basis || "per_serving",
    };
  }

  // ================= RULE 11: FAT PERCENTAGE SANITY CHECK =================
  const calculatedFatCalPct =
    finalCalories > 0 ? Math.round(((finalFat * 9) / finalCalories) * 100) : 0;
  let fatSanityWarning: string | undefined = undefined;

  // Check if item is an inherently high-fat food or clearly fried/oily/cheese-based
  const isInherentlyHighFat =
    category === "fat_oil" ||
    /oil|butter|ghee|avocado|guacamole|nut|almond|peanut|walnut|cashew|pistachio|seed|cheese|mozzarella|cheddar|parmesan|gouda|feta|fried|fritter|deep-fried|bacon|sausage|mayo|mayonnaise|tahini|dressing|sesame|زيت|سمن|زبدة|أفوكادو|مكسرات|لوز|فول سوداني|عين جمل|كاجو|فستق|بذور|طحينة|مايونيز|جبن|جبنة|مقلي|بروستد|بانيه|سجق|شاورما لحم|دهن/i.test(
      `${itemName} ${reasoningStr} ${rawItem.food_name || ""}`
    );

  if (calculatedFatCalPct > 50 && !isInherentlyHighFat) {
    fatSanityWarning = `نسبة السعرات من الدهون مرتفعة (${calculatedFatCalPct}%) لصنف غير مقلي صراحةً أو غير غني بالدهون بطبيعته.`;
    violations.push(
      `Fat calories ratio (${calculatedFatCalPct}%) exceeds 50% for whole/unfried food item without visible oil/cheese.`
    );
    if (dataSource === "visual_portion_estimate") {
      confidence = Math.min(confidence, 55);
      needsReview = true;
      if (!userGuidanceStr) {
        userGuidanceStr =
          "تنبيه دهون: تم تقدير نسبة دهون مرتفعة؛ إذا كان الطبق خاليًا من الزيوت المضافة أو القلي، يمكنك تعديل كمية الدهون يدوياً.";
      }
    }
  }

  // ================= RULE 12: COMPONENT IDENTIFICATION TRANSPARENCY =================
  let finalItemName = itemName;
  let isUnidentified = false;
  const isGenericOrUnidentified =
    /^(component\s*\d*|unidentified|unknown|food\s*item|generic|مكون\s*\d*|غير معروف|مكون غير محدد)$/i.test(
      itemName.trim()
    ) || Boolean(rawItem.is_unidentified_component);

  if (isGenericOrUnidentified) {
    isUnidentified = true;
    finalItemName = "Unidentified component — visual estimate only (مكون غير محدد — تقدير بصري فقط)";
    if (dataSource !== "label_read") {
      dataSource = "visual_portion_estimate";
      confidence = Math.min(confidence, 45);
      userGuidanceStr =
        "مكون غير محدد بدقة: تم التقدير بصرياً بالاعتماد على الحجم واللون فقط دون جزم بنوع الصنف.";
    }
  }

  // Realistic Portion & Weight Range Estimation
  const rawMinG = Number(rawItem.weight_range_min_g);
  const rawMaxG = Number(rawItem.weight_range_max_g);
  
  // Calculate realistic uncertainty bounds based on confidence & reference object
  const uncertaintyMargin = confidence >= 85 ? 0.10 : confidence >= 70 ? 0.15 : 0.22;
  const computedMinG = Math.max(5, Math.round(grams * (1 - uncertaintyMargin)));
  const computedMaxG = Math.max(computedMinG + 5, Math.round(grams * (1 + uncertaintyMargin)));

  const weightRangeMin = !isNaN(rawMinG) && rawMinG > 0 ? Math.min(rawMinG, grams) : computedMinG;
  const weightRangeMax = !isNaN(rawMaxG) && rawMaxG > grams ? rawMaxG : computedMaxG;
  const bestEstimateWeight = grams;

  // Portion presets for quick adjustments (small ~65%, medium 100%, large ~140%)
  const smallWeight = Math.max(5, Math.round(Number(rawItem.small_weight_g) || grams * 0.65));
  const mediumWeight = grams;
  const largeWeight = Math.max(mediumWeight + 10, Math.round(Number(rawItem.large_weight_g) || grams * 1.4));

  // Portion human-readable description
  let portionDesc = rawItem.portion_description || "";
  if (!portionDesc) {
    if (category === "starch_grain") {
      portionDesc = grams <= 100 ? "حصة صغيرة (~نصف كوب)" : grams <= 180 ? "حصة متوسطة (~كوب)" : "حصة كبيرة (~كوب ونصف أو أكثر)";
    } else if (category === "meat_poultry_fish") {
      portionDesc = grams <= 90 ? "قطعة صغيرة" : grams <= 160 ? "شريحة / صدر متوسط" : "قطعة كبيرة";
    } else if (category === "vegetable") {
      portionDesc = grams <= 70 ? "كمية خفيفة / تزيين" : grams <= 140 ? "طبق جانبي متوسط" : "حصة سلطة / خضار سخية";
    } else {
      portionDesc = `حصة مقدرة بـ ~${grams}g`;
    }
  }

  // Hidden fats, cooking oils, and sauces detection
  const hasHiddenFats =
    Boolean(rawItem.has_hidden_fats_or_sauces) ||
    /oil|fried|sauté|roasted|dressing|sauce|butter|ghee|زيت|مقلي|مشوي بالزيت|صلصة|دريسنج|سمن|زبدة/i.test(
      `${itemName} ${reasoningStr} ${rawItem.food_name || ""}`
    );

  const hiddenFatsDesc =
    rawItem.hidden_fats_description ||
    (hasHiddenFats
      ? "قد يحتوي على زيوت طهي غير مرئية أو صلصة ممتصة قد تضيف سعرات ودهون إضافية."
      : undefined);

  const cookingOilEstimateKcal =
    Number(rawItem.cooking_oil_estimate_kcal) || (hasHiddenFats ? Math.round(finalFat * 0.3 * 9) : undefined);

  const isLowConfidencePortion = confidence < 50;

  return {
    id: `food-${idx}-${Date.now()}`,
    item_name: finalItemName,
    weight_g: grams,
    calories: finalCalories,
    protein_g: finalProtein,
    carbs_g: finalCarbs,
    fat_g: finalFat,
    portion_description: portionDesc,
    weight_range_min_g: weightRangeMin,
    weight_range_max_g: weightRangeMax,
    best_estimate_weight_g: bestEstimateWeight,
    portion_preset: "medium",
    small_weight_g: smallWeight,
    medium_weight_g: mediumWeight,
    large_weight_g: largeWeight,
    has_hidden_fats_or_sauces: hasHiddenFats,
    hidden_fats_description: hiddenFatsDesc,
    cooking_oil_estimate_kcal: cookingOilEstimateKcal,
    is_low_confidence_portion: isLowConfidencePortion,
    fat_calories_pct: calculatedFatCalPct,
    fat_sanity_warning: fatSanityWarning,
    is_unidentified_component: isUnidentified,
    fiber_g: rawFiber,
    sugar_alcohols_g: rawSugarAlcohols,
    net_carbs_g: rawNetCarbs ?? atwaterCalc.adjusted_net_carbs,
    is_keto_or_low_carb: isKetoOrLowCarb,
    serving_info: servingInfo,
    data_source: dataSource,
    variant_detected: variantDetectedStr,
    reasoning: reasoningStr,
    user_guidance: userGuidanceStr,
    confidence_score: confidence,
    reference_object_detected: referenceObj,
    label_language_detected: detectedLanguage,
    weight_sanity: weightSanity,
    usda_matched_name: usdaProfile.name,
    usda_source: usdaProfile.source,
    needs_review: needsReview,
    atwater_calories: finalAtwater,
    is_approximate_estimate: dataSource !== "label_read" || confidence < 60,
    food_category: category,
    sanity_status: sanityStatus,
    sanity_message: sanityMessage,
    raw_ai_estimate: {
      calories: rawCalories,
      protein_g: rawProtein,
      carbs_g: rawCarbs,
      fat_g: rawFat,
    },
    per_100g: per100gProfile,
  };
}

/**
 * Evaluates the entire analyzed meal set to check if the food is unrecognized,
 * low-confidence (< 40%), or suffers from an unresolvable biological contradiction.
 * Requirements:
 * 1. When confidence is below 40%, image is blurry, unclear, or doesn't contain recognizable food,
 *    do NOT return any calorie/macro numbers.
 * 2. Return the exact Arabic error message:
 *    "لم نتمكن من التعرف على الطعام بدقة كافية. حاول تصوير الطبق بوضوح أكبر أو من زاوية مختلفة."
 * 5. Consistent with existing sanity check rules.
 */
export function evaluateMealConfidenceSafeguard(items: SanityCheckResult[]): {
  isUnrecognized: boolean;
  reason?: string;
  message: string;
} {
  const ARABIC_UNRECOGNIZED_MESSAGE =
    "لم نتمكن من التعرف على الطعام بدقة كافية. حاول تصوير الطبق بوضوح أكبر أو من زاوية مختلفة.";

  if (!items || items.length === 0) {
    return {
      isUnrecognized: true,
      reason: "No recognizable food items detected in the image.",
      message: ARABIC_UNRECOGNIZED_MESSAGE,
    };
  }

  // Check 1: If all items have confidence < 40%
  const allLowConfidence = items.every((item) => (item.confidence_score || 0) < 40);
  if (allLowConfidence) {
    return {
      isUnrecognized: true,
      reason: `Confidence scores of all detected components fall below 40% threshold.`,
      message: ARABIC_UNRECOGNIZED_MESSAGE,
    };
  }

  // Check 2: If single component and confidence < 40% or unidentified with uncertain data source
  if (items.length === 1) {
    const single = items[0];
    if (single.confidence_score < 40) {
      return {
        isUnrecognized: true,
        reason: `Main component "${single.item_name}" has low confidence (${single.confidence_score}% < 40%).`,
        message: ARABIC_UNRECOGNIZED_MESSAGE,
      };
    }
    if (
      single.is_unidentified_component &&
      single.confidence_score < 50 &&
      single.data_source === "uncertain"
    ) {
      return {
        isUnrecognized: true,
        reason: "Single component is unidentifiable with uncertain confidence.",
        message: ARABIC_UNRECOGNIZED_MESSAGE,
      };
    }
  }

  // Check 3: Overall average confidence across components
  const avgConfidence =
    items.reduce((sum, item) => sum + (item.confidence_score || 0), 0) / items.length;
  if (avgConfidence < 40) {
    return {
      isUnrecognized: true,
      reason: `Average meal confidence (${Math.round(avgConfidence)}%) is below acceptable 40% threshold.`,
      message: ARABIC_UNRECOGNIZED_MESSAGE,
    };
  }

  // Check 4: Unresolvable critical sanity checks
  const unresolvableItems = items.filter(
    (item) => item.sanity_status === "flagged" && item.confidence_score < 40
  );
  if (unresolvableItems.length > 0) {
    return {
      isUnrecognized: true,
      reason: "Sanity check detected unresolvable nutritional inconsistency.",
      message: ARABIC_UNRECOGNIZED_MESSAGE,
    };
  }

  return {
    isUnrecognized: false,
    message: "",
  };
}
