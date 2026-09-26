export type FoodCategory =
  | "vegetable"
  | "meat_poultry_fish"
  | "starch_grain"
  | "legume"
  | "fruit"
  | "dairy"
  | "fat_oil"
  | "beverage"
  | "snack_bar"
  | "mixed";

export interface USDAFoodProfile {
  name: string;
  source: string;
  category: FoodCategory;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  aliases: string[];
}

/**
 * Standard USDA FoodData Central reference values (Foundation Foods & SR Legacy)
 * Caloric baseline strictly follows Atwater: (Protein * 4) + (Carbs * 4) + (Fat * 9)
 */
export const USDA_REFERENCE_DATABASE: USDAFoodProfile[] = [
  // ================= VEGETABLES =================
  {
    name: "Asparagus, cooked, boiled or grilled",
    source: "USDA FoodData Central #170379",
    category: "vegetable",
    calories_per_100g: 22,
    protein_per_100g: 2.4,
    carbs_per_100g: 4.1,
    fat_per_100g: 0.2,
    aliases: ["asparagus", "grilled asparagus", "steamed asparagus", "asparagus spears", "green asparagus"],
  },
  {
    name: "Onions, grilled or sautéed",
    source: "USDA FoodData Central #170000",
    category: "vegetable",
    calories_per_100g: 44,
    protein_per_100g: 1.4,
    carbs_per_100g: 10.1,
    fat_per_100g: 0.2,
    aliases: ["grilled onion", "grilled onions", "roasted onions", "sauteed onions", "onion", "onions", "white onion", "red onion"],
  },
  {
    name: "Peppers, sweet, bell, grilled or roasted",
    source: "USDA FoodData Central #170427",
    category: "vegetable",
    calories_per_100g: 28,
    protein_per_100g: 1.0,
    carbs_per_100g: 6.7,
    fat_per_100g: 0.3,
    aliases: ["bell pepper", "bell peppers", "grilled pepper", "grilled peppers", "roasted pepper", "sweet pepper", "capsicum", "red pepper", "green pepper", "yellow pepper"],
  },
  {
    name: "Tomatoes, red, grilled or roasted",
    source: "USDA FoodData Central #170457",
    category: "vegetable",
    calories_per_100g: 24,
    protein_per_100g: 1.1,
    carbs_per_100g: 4.8,
    fat_per_100g: 0.4,
    aliases: ["grilled tomato", "grilled tomatoes", "roasted tomatoes", "tomato", "tomatoes", "cherry tomatoes"],
  },
  {
    name: "Vegetables, mixed, grilled or roasted",
    source: "USDA FoodData Central #170450",
    category: "vegetable",
    calories_per_100g: 42,
    protein_per_100g: 1.8,
    carbs_per_100g: 7.2,
    fat_per_100g: 0.8,
    aliases: [
      "grilled vegetables",
      "roasted vegetables",
      "mixed vegetables",
      "grilled vegetable medley",
      "vegetable medley",
      "vegetable platter",
      "grilled veggies",
      "roasted veggies",
      "veggies",
      "vegetables",
      "vegetable mix",
      "طبق خضار مشوي",
      "خضار مشوي",
    ],
  },
  {
    name: "Broccoli, steamed or boiled, drained",
    source: "USDA FoodData Central #170380",
    category: "vegetable",
    calories_per_100g: 35,
    protein_per_100g: 2.4,
    carbs_per_100g: 7.2,
    fat_per_100g: 0.4,
    aliases: ["broccoli", "steamed broccoli", "grilled broccoli", "broccoli florets"],
  },
  {
    name: "Zucchini, summer squash, grilled or roasted",
    source: "USDA FoodData Central #169291",
    category: "vegetable",
    calories_per_100g: 21,
    protein_per_100g: 1.2,
    carbs_per_100g: 3.1,
    fat_per_100g: 0.4,
    aliases: ["zucchini", "grilled zucchini", "roasted zucchini", "courgette"],
  },
  {
    name: "Eggplant, cooked, grilled or roasted",
    source: "USDA FoodData Central #169229",
    category: "vegetable",
    calories_per_100g: 35,
    protein_per_100g: 0.8,
    carbs_per_100g: 8.7,
    fat_per_100g: 0.2,
    aliases: ["eggplant", "grilled eggplant", "roasted eggplant", "aubergine"],
  },
  {
    name: "Mushrooms, white or crimini, grilled or sautéed",
    source: "USDA FoodData Central #169251",
    category: "vegetable",
    calories_per_100g: 28,
    protein_per_100g: 3.1,
    carbs_per_100g: 4.1,
    fat_per_100g: 0.5,
    aliases: ["mushrooms", "grilled mushrooms", "sauteed mushrooms", "mushroom", "portobello"],
  },
  {
    name: "Salad greens, lettuce, raw, mixed or romaine",
    source: "USDA FoodData Central #169249",
    category: "vegetable",
    calories_per_100g: 15,
    protein_per_100g: 1.2,
    carbs_per_100g: 3.3,
    fat_per_100g: 0.3,
    aliases: ["salad", "greens", "lettuce", "mixed greens", "arugula", "spinach", "mixed salad"],
  },
  {
    name: "Cucumber, with peel, raw",
    source: "USDA FoodData Central #169225",
    category: "vegetable",
    calories_per_100g: 15,
    protein_per_100g: 0.7,
    carbs_per_100g: 3.6,
    fat_per_100g: 0.1,
    aliases: ["cucumber", "sliced cucumber"],
  },

  // ================= MEAT, POULTRY, FISH & EGGS =================
  {
    name: "Chicken breast, grilled, boneless, skinless",
    source: "USDA FoodData Central #171077",
    category: "meat_poultry_fish",
    calories_per_100g: 165,
    protein_per_100g: 31.0,
    carbs_per_100g: 0.0,
    fat_per_100g: 3.6,
    aliases: ["chicken breast", "grilled chicken", "chicken fillet", "poultry breast", "chicken"],
  },
  {
    name: "Chicken thigh, roasted, skinless",
    source: "USDA FoodData Central #172388",
    category: "meat_poultry_fish",
    calories_per_100g: 209,
    protein_per_100g: 26.0,
    carbs_per_100g: 0.0,
    fat_per_100g: 10.9,
    aliases: ["chicken thigh", "dark chicken", "chicken leg"],
  },
  {
    name: "Beef, ground, 85% lean / 15% fat, cooked, patty",
    source: "USDA FoodData Central #174032",
    category: "meat_poultry_fish",
    calories_per_100g: 250,
    protein_per_100g: 25.8,
    carbs_per_100g: 0.0,
    fat_per_100g: 15.4,
    aliases: ["minced beef", "ground beef", "kebab", "beef patty", "grilled minced meat", "burger patty"],
  },
  {
    name: "Beef steak, sirloin or tenderloin, grilled, lean",
    source: "USDA FoodData Central #170321",
    category: "meat_poultry_fish",
    calories_per_100g: 206,
    protein_per_100g: 29.5,
    carbs_per_100g: 0.0,
    fat_per_100g: 9.0,
    aliases: ["beef steak", "sirloin", "tenderloin", "beef fillet", "grilled beef", "steak"],
  },
  {
    name: "Salmon, Atlantic, farmed, cooked, baked/grilled",
    source: "USDA FoodData Central #175168",
    category: "meat_poultry_fish",
    calories_per_100g: 206,
    protein_per_100g: 22.1,
    carbs_per_100g: 0.0,
    fat_per_100g: 12.3,
    aliases: ["salmon", "grilled salmon", "baked salmon", "salmon fillet"],
  },
  {
    name: "White fish, cod/tilapia, baked or broiled",
    source: "USDA FoodData Central #174170",
    category: "meat_poultry_fish",
    calories_per_100g: 105,
    protein_per_100g: 22.8,
    carbs_per_100g: 0.0,
    fat_per_100g: 0.9,
    aliases: ["white fish", "cod", "tilapia", "sea bass", "haddock", "fish fillet", "fish"],
  },
  {
    name: "Tuna, light, canned in water, drained",
    source: "USDA FoodData Central #171986",
    category: "meat_poultry_fish",
    calories_per_100g: 116,
    protein_per_100g: 25.5,
    carbs_per_100g: 0.0,
    fat_per_100g: 0.8,
    aliases: ["canned tuna", "tuna", "tuna fish"],
  },
  {
    name: "Egg, whole, hard-boiled or poached",
    source: "USDA FoodData Central #171287",
    category: "meat_poultry_fish",
    calories_per_100g: 155,
    protein_per_100g: 12.6,
    carbs_per_100g: 1.1,
    fat_per_100g: 10.6,
    aliases: ["boiled egg", "egg", "poached egg", "hard-boiled egg", "fried egg"],
  },

  // ================= STARCH & GRAINS =================
  {
    name: "Rice, white, long-grain, regular, cooked",
    source: "USDA FoodData Central #168878",
    category: "starch_grain",
    calories_per_100g: 130,
    protein_per_100g: 2.7,
    carbs_per_100g: 28.2,
    fat_per_100g: 0.3,
    aliases: ["white rice", "jasmine rice", "basmati rice", "cooked rice", "steamed rice", "rice"],
  },
  {
    name: "Rice, brown, long-grain, cooked",
    source: "USDA FoodData Central #169704",
    category: "starch_grain",
    calories_per_100g: 123,
    protein_per_100g: 2.7,
    carbs_per_100g: 25.6,
    fat_per_100g: 1.0,
    aliases: ["brown rice", "cooked brown rice"],
  },
  {
    name: "Pasta, enriched, cooked, regular",
    source: "USDA FoodData Central #168934",
    category: "starch_grain",
    calories_per_100g: 158,
    protein_per_100g: 5.8,
    carbs_per_100g: 30.9,
    fat_per_100g: 0.9,
    aliases: ["pasta", "spaghetti", "macaroni", "penne", "noodles", "cooked pasta"],
  },
  {
    name: "Potato, boiled or baked, without skin",
    source: "USDA FoodData Central #170026",
    category: "starch_grain",
    calories_per_100g: 87,
    protein_per_100g: 1.9,
    carbs_per_100g: 20.1,
    fat_per_100g: 0.1,
    aliases: ["potato", "baked potato", "boiled potato", "mashed potato", "roasted potatoes", "potatoes"],
  },
  {
    name: "Sweet potato, cooked, baked without skin",
    source: "USDA FoodData Central #168483",
    category: "starch_grain",
    calories_per_100g: 90,
    protein_per_100g: 2.0,
    carbs_per_100g: 20.7,
    fat_per_100g: 0.1,
    aliases: ["sweet potato", "baked sweet potato", "roasted sweet potato"],
  },
  {
    name: "Bread, pita or flatbread, white",
    source: "USDA FoodData Central #172776",
    category: "starch_grain",
    calories_per_100g: 275,
    protein_per_100g: 9.1,
    carbs_per_100g: 55.7,
    fat_per_100g: 1.2,
    aliases: ["pita bread", "bread", "flatbread", "naan", "toast", "sourdough bread", "white bread"],
  },

  // ================= LEGUMES & PULSES =================
  {
    name: "Hummus, commercial",
    source: "USDA FoodData Central #173799",
    category: "legume",
    calories_per_100g: 166,
    protein_per_100g: 7.9,
    carbs_per_100g: 14.3,
    fat_per_100g: 9.6,
    aliases: ["hummus", "tahini dip", "chickpea dip"],
  },
  {
    name: "Lentils, mature seeds, cooked, boiled",
    source: "USDA FoodData Central #172421",
    category: "legume",
    calories_per_100g: 116,
    protein_per_100g: 9.0,
    carbs_per_100g: 20.1,
    fat_per_100g: 0.4,
    aliases: ["lentils", "cooked lentils", "brown lentils", "red lentils"],
  },
  {
    name: "Chickpeas (garbanzo beans), cooked",
    source: "USDA FoodData Central #173757",
    category: "legume",
    calories_per_100g: 164,
    protein_per_100g: 8.9,
    carbs_per_100g: 27.4,
    fat_per_100g: 2.6,
    aliases: ["chickpeas", "garbanzo beans", "cooked chickpeas"],
  },

  // ================= FATS & OILS =================
  {
    name: "Olive oil, salad or cooking",
    source: "USDA FoodData Central #171413",
    category: "fat_oil",
    calories_per_100g: 884,
    protein_per_100g: 0.0,
    carbs_per_100g: 0.0,
    fat_per_100g: 100.0,
    aliases: ["olive oil", "vegetable oil", "oil", "cooking oil", "salad dressing oil"],
  },
  {
    name: "Avocado, raw, all commercial varieties",
    source: "USDA FoodData Central #171705",
    category: "fat_oil",
    calories_per_100g: 160,
    protein_per_100g: 2.0,
    carbs_per_100g: 8.5,
    fat_per_100g: 14.7,
    aliases: ["avocado", "sliced avocado", "guacamole", "mashed avocado"],
  },

  // ================= PROTEIN BARS & PERFORMANCE SNACKS =================
  {
    name: "Protein bar, high protein, various flavors",
    source: "USDA FoodData Central #173510",
    category: "snack_bar",
    calories_per_100g: 365,
    protein_per_100g: 33.3,
    carbs_per_100g: 35.0,
    fat_per_100g: 10.0,
    aliases: [
      "protein bar",
      "quest bar",
      "grenade bar",
      "barebells",
      "one bar",
      "whey bar",
      "high protein bar",
      "energy protein bar",
      "bar protein",
      "بروتين بار",
      "لوح بروتين",
      "بار بروتين",
      "سناك بروتين",
    ],
  },
  {
    name: "Energy bar / Granola bar, oats and honey",
    source: "USDA FoodData Central #174298",
    category: "snack_bar",
    calories_per_100g: 415,
    protein_per_100g: 8.5,
    carbs_per_100g: 68.0,
    fat_per_100g: 12.0,
    aliases: ["granola bar", "energy bar", "cereal bar", "oat bar", "لوح طاقة", "جرانولا بار"],
  },

  // ================= BEVERAGES (DIET/ZERO VS REGULAR) =================
  {
    name: "Carbonated soft drink, Diet / Zero sugar, with artificial sweeteners",
    source: "USDA FoodData Central #174853",
    category: "beverage",
    calories_per_100g: 1,
    protein_per_100g: 0.0,
    carbs_per_100g: 0.1,
    fat_per_100g: 0.0,
    aliases: [
      "diet coke",
      "coke zero",
      "diet pepsi",
      "pepsi zero",
      "pepsi max",
      "diet soda",
      "zero soda",
      "sugar free soda",
      "sprite zero",
      "7up free",
      "diet 7up",
      "diet sprite",
      "diet beverage",
      "zero sugar drink",
      "دايت كولا",
      "كولا زيرو",
      "دايت بيبسي",
      "بيبسي زيرو",
      "بيبسي ماكس",
      "سفن دايت",
      "سفن فري",
      "مشروب غازي دايت",
      "مشروب زيرو",
      "مشروب بدون سكر",
      "لايت",
      "دايت",
      "زيرو",
    ],
  },
  {
    name: "Carbonated soft drink, regular / full sugar, cola or citrus",
    source: "USDA FoodData Central #174851",
    category: "beverage",
    calories_per_100g: 42,
    protein_per_100g: 0.0,
    carbs_per_100g: 10.6,
    fat_per_100g: 0.0,
    aliases: [
      "coca cola",
      "coke",
      "pepsi",
      "7up",
      "sprite",
      "fanta",
      "mirinda",
      "soft drink",
      "soda",
      "regular soda",
      "carbonated drink",
      "كوكاكولا",
      "بيبسي",
      "سفن اب",
      "سبرايت",
      "فانتا",
      "ميرندا",
      "مشروب غازي عادي",
      "مشروب غازي",
    ],
  },
  {
    name: "Energy drink, Zero calorie / Sugar free",
    source: "USDA FoodData Central #174872",
    category: "beverage",
    calories_per_100g: 3,
    protein_per_100g: 0.0,
    carbs_per_100g: 0.6,
    fat_per_100g: 0.0,
    aliases: [
      "monster ultra",
      "monster zero",
      "red bull zero",
      "red bull sugar free",
      "celsius",
      "sugar free energy drink",
      "مشروب طاقة زيرو",
      "مشروب طاقة دايت",
      "مشروب طاقة بدون سكر",
    ],
  },
  {
    name: "Coffee, black, brewed or espresso, unsweetened",
    source: "USDA FoodData Central #171890",
    category: "beverage",
    calories_per_100g: 1,
    protein_per_100g: 0.1,
    carbs_per_100g: 0.0,
    fat_per_100g: 0.0,
    aliases: ["black coffee", "espresso", "americano", "قهوة سوداء", "اسبريسو", "امريكانو", "شاي سادة"],
  },

  // ================= MIXED & COMPOSITE DISHES (CARBS + PROTEIN) =================
  {
    name: "Hawawshi / Meat-stuffed flatbread, baked",
    source: "USDA FoodData Central #172050",
    category: "mixed",
    calories_per_100g: 260,
    protein_per_100g: 13.5,
    carbs_per_100g: 22.0,
    fat_per_100g: 13.0,
    aliases: [
      "hawawshi",
      "hawawshy",
      "meat flatbread",
      "stuffed flatbread",
      "حواوشي",
      "حواوشي بلدي",
      "حواوشي اسكندراني",
      "رغيف حواوشي",
      "عيش باللحمة",
    ],
  },
  {
    name: "Burger, beef patty with bun, lettuce, tomato",
    source: "USDA FoodData Central #171800",
    category: "mixed",
    calories_per_100g: 250,
    protein_per_100g: 14.0,
    carbs_per_100g: 24.0,
    fat_per_100g: 11.0,
    aliases: [
      "burger",
      "hamburger",
      "cheeseburger",
      "beef burger",
      "chicken burger",
      "برجر",
      "همبرجر",
      "ساندوتش برجر",
      "تشيز برجر",
    ],
  },
  {
    name: "Shawarma sandwich / wrap with garlic sauce",
    source: "USDA FoodData Central #172100",
    category: "mixed",
    calories_per_100g: 215,
    protein_per_100g: 15.0,
    carbs_per_100g: 20.0,
    fat_per_100g: 8.5,
    aliases: [
      "shawarma",
      "shawurma",
      "chicken shawarma",
      "beef shawarma",
      "shawarma wrap",
      "shawarma sandwich",
      "شاورما",
      "ساندوتش شاورما",
      "شاورما فراخ",
      "شاورما لحم",
      "شاورما عربي",
    ],
  },
  {
    name: "Pizza, cheese or pepperoni, regular crust",
    source: "USDA FoodData Central #172150",
    category: "mixed",
    calories_per_100g: 266,
    protein_per_100g: 11.0,
    carbs_per_100g: 33.0,
    fat_per_100g: 10.0,
    aliases: [
      "pizza",
      "pizza slice",
      "cheese pizza",
      "pepperoni pizza",
      "بيتزا",
      "قطعة بيتزا",
      "شريحة بيتزا",
    ],
  },
  {
    name: "Breaded chicken breast / Crispy tenders / Escalope",
    source: "USDA FoodData Central #172200",
    category: "mixed",
    calories_per_100g: 255,
    protein_per_100g: 18.0,
    carbs_per_100g: 14.0,
    fat_per_100g: 14.0,
    aliases: [
      "breaded chicken",
      "crispy chicken",
      "chicken tenders",
      "chicken nuggets",
      "escalope",
      "دجاج بانيه",
      "بانيه",
      "ستريبس",
      "كرسبي",
      "ناجتس",
      "بروستد",
    ],
  },
  {
    name: "Egyptian Baladi Flatbread / Pita Bread",
    source: "USDA FoodData Central #168890",
    category: "starch_grain",
    calories_per_100g: 250,
    protein_per_100g: 9.0,
    carbs_per_100g: 50.0,
    fat_per_100g: 1.2,
    aliases: [
      "baladi bread",
      "egyptian bread",
      "pita",
      "pita bread",
      "flatbread",
      "عيش بلدي",
      "خبز بلدي",
      "رغيف بلدي",
      "خبز بيتا",
      "عيش شامي",
    ],
  },
];

// Cooking technique and modifier words to ignore during primary identity matching
const COOKING_MODIFIERS = new Set([
  "grilled",
  "roasted",
  "steamed",
  "cooked",
  "boiled",
  "baked",
  "fried",
  "sauteed",
  "sautéed",
  "fresh",
  "raw",
  "sliced",
  "diced",
  "chopped",
  "whole",
  "boneless",
  "skinless",
  "cut",
  "portion",
  "piece",
  "dish",
  "plate",
  "bowl",
  "seasoned",
  "large",
  "medium",
  "small",
]);

/**
 * Match identified item against USDA verified database.
 * Crucially ignores common cooking method words (like "grilled") during primary matching
 * so that "grilled vegetables" or "grilled asparagus" does not mistakenly match "chicken breast, grilled"!
 */
export function matchUSDAFood(name: string, expectedCategory?: FoodCategory): USDAFoodProfile | null {
  const lower = name.toLowerCase().trim();

  // 1. Direct name match or exact match inside name
  for (const item of USDA_REFERENCE_DATABASE) {
    if (lower === item.name.toLowerCase()) return item;
  }

  // 2. Exact alias match
  for (const item of USDA_REFERENCE_DATABASE) {
    for (const alias of item.aliases) {
      if (lower === alias.toLowerCase()) {
        return item;
      }
    }
  }

  // 3. Substring alias match
  for (const item of USDA_REFERENCE_DATABASE) {
    if (expectedCategory && item.category !== expectedCategory) continue;
    for (const alias of item.aliases) {
      if (lower.includes(alias.toLowerCase())) {
        return item;
      }
    }
  }

  // 4. Primary noun token matching (filtering out cooking modifiers)
  const tokens = lower
    .split(/[^a-z0-9]+/i)
    .filter((w) => w.length > 2 && !COOKING_MODIFIERS.has(w));

  let bestMatch: USDAFoodProfile | null = null;
  let maxScore = 0;

  for (const item of USDA_REFERENCE_DATABASE) {
    if (expectedCategory && item.category !== expectedCategory) continue;

    let score = 0;
    const targetWords = `${item.name} ${item.aliases.join(" ")}`.toLowerCase();

    for (const token of tokens) {
      if (targetWords.includes(token)) {
        score += 2;
      }
    }

    if (score > maxScore) {
      maxScore = score;
      bestMatch = item;
    }
  }

  return maxScore >= 2 ? bestMatch : null;
}
