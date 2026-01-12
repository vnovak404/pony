// Pony Parade: map configuration constants.

export const MAP_CONFIG = {
  MAX_ACTORS: 30,
  ASSET_SCALE: 2,
  HOUSE_DECAY_RATE: 0.00000025,
  HOUSE_REPAIR_RATE: 0.00001,
  HOUSE_REPAIR_THRESHOLD: 0.6,
  HOUSE_CONSTRUCTION_THRESHOLD: 0.25,
  HUNGER_RATE: 0.00018,
  THIRST_RATE: 0.00018,
  EAT_THRESHOLD_DEFAULT: 60,
  DRINK_THRESHOLD_DEFAULT: 55,
  EAT_RADIUS_TILES: 0.65,
  EAT_DURATION_MIN: 2200,
  EAT_DURATION_MAX: 3800,
  EAT_COOLDOWN_MIN: 6000,
  EAT_COOLDOWN_MAX: 9000,
  DRINK_RADIUS_TILES: 0.6,
  DRINK_DURATION_MIN: 1800,
  DRINK_DURATION_MAX: 3200,
  DRINK_COOLDOWN_MIN: 5000,
  DRINK_COOLDOWN_MAX: 8000,
  VET_RADIUS_TILES: 0.75,
  VET_DURATION_MIN: 2600,
  VET_DURATION_MAX: 4200,
  VET_COOLDOWN_MIN: 12000,
  VET_COOLDOWN_MAX: 18000,
  FUN_RADIUS_TILES: 0.7,
  FUN_DURATION_MIN: 2400,
  FUN_DURATION_MAX: 4200,
  FUN_COOLDOWN_MIN: 7000,
  FUN_COOLDOWN_MAX: 10000,
  WORK_RADIUS_TILES: 0.6,
  WORK_DURATION_PER_ITEM_MIN: 800,
  WORK_DURATION_PER_ITEM_MAX: 1200,
  WORK_ACTION_DURATION_MAX: 5000,
  WORK_COOLDOWN_MIN: 15000,
  WORK_COOLDOWN_MAX: 25000,
  WORK_RESTOCK_MIN: 2,
  WORK_RESTOCK_MAX: 4,
  WORK_RESTOCK_THRESHOLD: 0.3,
  BOREDOM_RATE: 0.0003,
  BOREDOM_THRESHOLD_DEFAULT: 60,
  HEALTH_DECAY_RATE: 0.00008,
  HEALTH_THRESHOLD_DEFAULT: 78,
  CRITICAL_HEALTH_LEVEL: 40,
  CRITICAL_NEED_LEVEL: 100,
  REPAIR_DURATION_MIN: 10000,
  REPAIR_DURATION_MAX: 15000,
  MANUAL_SPEED_MULTIPLIER: 1.8,
  STATE_SAVE_INTERVAL: 60000,
};

export const SUPPLY_TYPE_FOOD = "food";
export const SUPPLY_TYPE_DRINK = "drink";
export const SUPPLY_TYPE_REPAIR = "repair";

export const SUPPLY_SOURCE_BY_TYPE = {
  [SUPPLY_TYPE_FOOD]: "market-square",
  [SUPPLY_TYPE_DRINK]: "market-square",
  [SUPPLY_TYPE_REPAIR]: "lumberyard",
};

export const SUPPLY_RECIPES_BY_TYPE = {
  [SUPPLY_TYPE_FOOD]: {
    required: { produce: 1 },
  },
  [SUPPLY_TYPE_DRINK]: {
    required: { water: 1 },
  },
  [SUPPLY_TYPE_REPAIR]: {
    required: { lumber: 1 },
  },
};

export const SUPPLY_RECIPES_BY_LOCATION = {
  "lemonade-bar": {
    required: { water: 1, lemon: 1 },
    options: [{ sugar: 1 }, { honey: 1 }],
  },
  "milk-honey-well": {
    required: { milk: 1, honey: 1 },
  },
};

export const PRODUCER_INGREDIENT_OUTPUTS = {
  "windmill-farm": ["produce"],
  "honeybee-field": ["honey"],
  "cow-pasture": ["milk"],
  "lemon-orchard": ["lemon"],
  "crystal-creek": ["water"],
  "sugar-cane-field": ["sugar"],
  "whispering-forest": ["lumber"],
};

export const INGREDIENT_WORK_DURATION_MULTIPLIERS = {
  water: 0.4,
};

export const INGREDIENT_RESTOCK_MULTIPLIERS = {
  water: 2,
};

export const INGREDIENT_ICON_MAP = {
  produce: "assets/ui/icons/ingredient-produce.webp",
  water: "assets/ui/icons/ingredient-water.webp",
  lemon: "assets/ui/icons/ingredient-lemon.webp",
  sugar: "assets/ui/icons/ingredient-sugar.webp",
  honey: "assets/ui/icons/ingredient-honey.webp",
  milk: "assets/ui/icons/ingredient-milk.webp",
  lumber: "assets/ui/icons/ingredient-lumber.webp",
};

export const INGREDIENT_SUPPLY_TYPES = {
  produce: SUPPLY_TYPE_FOOD,
  water: SUPPLY_TYPE_DRINK,
  lemon: SUPPLY_TYPE_DRINK,
  sugar: SUPPLY_TYPE_DRINK,
  honey: SUPPLY_TYPE_DRINK,
  milk: SUPPLY_TYPE_DRINK,
  lumber: SUPPLY_TYPE_REPAIR,
};

export const INGREDIENT_DESTINATIONS = {
  produce: "market-square",
  water: "market-square",
  lemon: "market-square",
  sugar: "market-square",
  honey: "market-square",
  milk: "market-square",
  lumber: "lumberyard",
};

export const UNLIMITED_INGREDIENTS = [];
