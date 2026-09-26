export type DataSourceType = 'label_read' | 'product_estimate' | 'visual_portion_estimate' | 'uncertain';

export interface ServingBreakdown {
  serving_size_desc?: string; // e.g. "1 bar (60g)", "1 can (355ml)", "1 scoop (30g)"
  servings_per_container?: number; // e.g. 2.5
  per_serving_calories?: number; // e.g. 140
  total_package_calories?: number; // e.g. 350
  reported_basis?: 'per_serving' | 'total_package' | 'per_100g' | 'custom_portion';
}

export interface WeightSanityInfo {
  is_out_of_range?: boolean;
  typical_range?: string; // e.g. "40-70g for protein bars", "330-355ml for standard cans"
  message?: string;
}

export interface DetectedFood {
  id?: string;
  item_name: string;
  weight_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;

  // Realistic portion estimation & weight ranges
  portion_description?: string; // e.g. "حوالي كوب ونصف (وعاء متوسط)" / "~1.5 cups"
  weight_range_min_g?: number; // e.g. 180
  weight_range_max_g?: number; // e.g. 230
  best_estimate_weight_g?: number; // e.g. 205
  portion_preset?: 'small' | 'medium' | 'large' | 'custom';
  small_weight_g?: number; // e.g. 130
  medium_weight_g?: number; // e.g. 205
  large_weight_g?: number; // e.g. 290
  
  // Hidden fats, oils & sauces estimation
  has_hidden_fats_or_sauces?: boolean;
  hidden_fats_description?: string;
  cooking_oil_estimate_kcal?: number;
  is_low_confidence_portion?: boolean;

  // Fiber, Sugar Alcohols & Net Carbs (Rule 6)
  fiber_g?: number;
  sugar_alcohols_g?: number;
  net_carbs_g?: number;
  is_keto_or_low_carb?: boolean;

  // Serving size breakdown (Rule 7)
  serving_info?: ServingBreakdown;

  // Scientific & verification metadata
  data_source?: DataSourceType; // 'label_read' | 'product_estimate' | 'visual_portion_estimate' | 'uncertain'
  variant_detected?: string; // e.g. "Diet / Zero Sugar detected", "Regular / Sugared version"
  reasoning?: string; // e.g. "Extracted directly from visible Nutrition Facts label on back of can"
  user_guidance?: string; // e.g. "Photograph the nutrition label directly for a 100% precise reading"
  confidence_score: number; // 0 to 100 (capped at 60-70 for estimates without visible label)
  reference_object_detected?: string; // e.g. "Dinner plate (26cm)", "Standard fork (19cm)", "No reference detected"
  label_language_detected?: string; // e.g. "Arabic", "English", "Bilingual Arabic/English"
  weight_sanity?: WeightSanityInfo; // e.g. cross-check against typical category weights
  usda_matched_name?: string; // e.g. "Chicken breast, grilled, boneless, skinless"
  usda_source?: string; // e.g. "USDA FoodData Central #171077"
  needs_review?: boolean; // true if caloric discrepancy > 5% or sanity bounds triggered
  atwater_calories?: number; // Adjusted Atwater (P*4 + NetCarbs*4/Fiber*1.5 + F*9 + SugarAlcohols*2)
  is_approximate_estimate?: boolean; // true if confidence < 60 or data_source !== 'label_read'
  
  // Sanity Check & Biological Validation Metadata
  sanity_status?: 'verified' | 'auto_corrected' | 'flagged';
  sanity_message?: string;
  food_category?: 'vegetable' | 'meat_poultry_fish' | 'starch_grain' | 'legume' | 'fruit' | 'dairy' | 'fat_oil' | 'beverage' | 'snack_bar' | 'mixed';
  raw_ai_estimate?: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };

  // Fat percentage & sanity check (Rule 11)
  fat_calories_pct?: number; // (fat_g * 9 / calories) * 100
  fat_sanity_warning?: string; // Flag if fat percentage > 50% for non-fried/non-oily items

  // Component identification transparency (Rule 12)
  is_unidentified_component?: boolean; // true if component cannot be confidently named

  // Manual weight & nutrition correction
  is_manually_corrected?: boolean;
  is_fully_manually_corrected?: boolean;
  is_manually_edited?: boolean;
  is_cached_memory?: boolean;
  is_text_entry?: boolean;
  original_estimated_weight_g?: number;

  // Baseline per 100g nutritional profile
  per_100g?: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
}

export interface MealAnalysisMeta {
  plate_reference_found: boolean;
  reference_description: string;
  overall_confidence: number;
}

export interface KnownMealItemsSummary {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  weight: number;
}

export interface KnownMeal {
  mealKey: string;
  title: string;
  normalizedTitle: string;
  aliases: string[];
  items: DetectedFood[];
  itemsSummary: KnownMealItemsSummary;
  defaultWeightGrams: number;
  imageSignature: string | null;
  useCount: number;
  lastUsedAt: any;
  createdAt: any;
  isUserCorrected: boolean;
}

export interface SharedRecognizedFood {
  mealKey: string;
  normalizedTitle: string;
  title?: string;
  items: DetectedFood[];
  itemsSummary: KnownMealItemsSummary;
  defaultWeightGrams: number;
  imageSignature: string | null;
  sourceCount: number;
  confidence: "ai_single" | "ai_multi_agreement" | "reviewed";
  lastUpdatedAt: any;
  createdAt?: any;
}

export interface MealAnalysisPayload {
  items: DetectedFood[];
  meta?: MealAnalysisMeta;
  unrecognized?: false;
  isFromMealMemory?: boolean;
  isFromSharedCache?: boolean;
  knownMealKey?: string;
  cachedMealTitle?: string;
}

export interface UnrecognizedAnalysisResponse {
  unrecognized: true;
  message: string;
  reason?: string;
  error_code?: string;
  items?: [];
}

export type FoodAnalysisResponse =
  | DetectedFood[]
  | MealAnalysisPayload
  | UnrecognizedAnalysisResponse;

export type AppScreen =
  | 'home'
  | 'preview'
  | 'analyzing'
  | 'result'
  | 'unrecognized'
  | 'daily_log'
  | 'history'
  | 'goal_settings';

export interface NutritionLogRecord {
  id?: string;
  uid: string;
  foodName: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  weight: number;
  confidence: number;
  createdAt: any;
  date?: string; // YYYY-MM-DD in user's local timezone
  mealType?: MealType;
  itemsSummary?: string;
  imageUrl?: string;
  is_manually_corrected?: boolean;
  is_fully_manually_corrected?: boolean;
  is_text_entry?: boolean;
  original_weight?: number;
  items?: DetectedFood[];
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface LoggedMeal {
  id: string;
  timestamp: number; // Date.now()
  date: string; // YYYY-MM-DD
  timeStr: string; // e.g. "1:45 PM"
  mealType: MealType;
  title: string;
  imageUrl?: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  items: DetectedFood[];
  wasEdited?: boolean;
  is_manually_corrected?: boolean;
  is_fully_manually_corrected?: boolean;
  is_text_entry?: boolean;
  original_weight?: number;
  firestoreDocId?: string;
}

export interface UserProfile {
  gender: 'male' | 'female';
  weight_kg: number;
  height_cm: number;
  age: number;
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'very_active';
  goalType: 'lose' | 'maintain' | 'gain';
}

export interface UserDailyGoal {
  targetCalories: number;
  targetProtein_g: number;
  targetCarbs_g: number;
  targetFat_g: number;
  isCalculated?: boolean;
  profile?: UserProfile;
}
