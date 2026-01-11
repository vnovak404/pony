// Pony Parade: inventory state helpers.

export const createInventoryState = ({ locationIndex, runtimeState }) => {
  const runtimeInventory =
    runtimeState && runtimeState.inventory ? runtimeState.inventory : {};
  const runtimeIngredients =
    runtimeState && runtimeState.ingredients ? runtimeState.ingredients : {};
  const inventoryState = new Map();
  const ingredientState = new Map();
  const DEFAULT_INVENTORY_MAX = 12;
  const DEFAULT_INVENTORY_START = 9;
  const DEFAULT_INGREDIENT_MAX = 20;
  const DEFAULT_INGREDIENT_START = 12;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const getInventoryConfig = (location) => {
    if (!location || typeof location !== "object") {
      return { max: DEFAULT_INVENTORY_MAX, start: DEFAULT_INVENTORY_START };
    }
    const inventory = location.inventory || {};
    const max = Number.isFinite(inventory.max) ? inventory.max : DEFAULT_INVENTORY_MAX;
    const start = Number.isFinite(inventory.start)
      ? inventory.start
      : DEFAULT_INVENTORY_START;
    return { max, start };
  };
  const ensureInventoryEntry = (key, location) => {
    if (!key) return null;
    if (inventoryState.has(key)) return inventoryState.get(key);
    const config = getInventoryConfig(location);
    const max = Math.max(1, Math.floor(config.max));
    const start = clamp(Math.floor(config.start), 0, max);
    const saved = runtimeInventory[key];
    const current = Number.isFinite(saved?.current)
      ? clamp(Math.floor(saved.current), 0, max)
      : start;
    const entry = { current, max };
    inventoryState.set(key, entry);
    return entry;
  };
  const getIngredientConfig = (location, ingredient) => {
    if (!location || typeof location !== "object") return null;
    const ingredientConfig = location.ingredients && location.ingredients[ingredient];
    if (!ingredientConfig || typeof ingredientConfig !== "object") return null;
    const max = Number.isFinite(ingredientConfig.max)
      ? ingredientConfig.max
      : DEFAULT_INGREDIENT_MAX;
    const start = Number.isFinite(ingredientConfig.start)
      ? ingredientConfig.start
      : DEFAULT_INGREDIENT_START;
    return { max, start };
  };
  const ensureIngredientEntry = (locationId, ingredient, location) => {
    if (!locationId || !ingredient) return null;
    const key = `${locationId}:${ingredient}`;
    if (ingredientState.has(key)) return ingredientState.get(key);
    const config = getIngredientConfig(location, ingredient);
    if (!config) return null;
    const max = Math.max(1, Math.floor(config.max));
    const start = clamp(Math.floor(config.start), 0, max);
    const saved = runtimeIngredients[locationId]
      ? runtimeIngredients[locationId][ingredient]
      : null;
    const current = Number.isFinite(saved?.current)
      ? clamp(Math.floor(saved.current), 0, max)
      : start;
    const entry = { locationId, ingredient, current, max };
    ingredientState.set(key, entry);
    return entry;
  };
  const getSpotInventoryKey = (spot) => {
    if (!spot) return null;
    if (spot.locationId) return spot.locationId;
    if (spot.id) return spot.id;
    return null;
  };
  const getSpotInventory = (spot) => {
    if (!spot) return null;
    const key = getSpotInventoryKey(spot);
    if (!key) return null;
    const location = spot.locationId ? locationIndex.get(spot.locationId) : null;
    return ensureInventoryEntry(key, location);
  };
  const getIngredientEntry = (spot, ingredient) => {
    if (!spot || !ingredient || !spot.locationId) return null;
    const location = locationIndex.get(spot.locationId);
    return ensureIngredientEntry(spot.locationId, ingredient, location);
  };
  const getSpotIngredients = (spot) => {
    if (!spot || !spot.locationId) return [];
    const location = locationIndex.get(spot.locationId);
    const ingredients = location && location.ingredients ? location.ingredients : {};
    return Object.keys(ingredients)
      .map((ingredient) =>
        ensureIngredientEntry(spot.locationId, ingredient, location)
      )
      .filter(Boolean);
  };
  const isSpotStocked = (spot) => {
    const inventory = getSpotInventory(spot);
    if (!inventory) return true;
    return inventory.current > 0;
  };
  const consumeSpotInventory = (spot, amount = 1) => {
    const inventory = getSpotInventory(spot);
    if (!inventory) return true;
    if (inventory.current < amount) return false;
    inventory.current = Math.max(0, inventory.current - amount);
    return true;
  };
  const restockSpotInventory = (spot, amount = 1) => {
    const inventory = getSpotInventory(spot);
    if (!inventory) return false;
    const next = Math.min(inventory.max, inventory.current + amount);
    const changed = next !== inventory.current;
    inventory.current = next;
    return changed;
  };
  const restockIngredient = (spot, ingredient, amount = 1) => {
    const entry = getIngredientEntry(spot, ingredient);
    if (!entry) return 0;
    const next = Math.min(entry.max, entry.current + amount);
    const added = next - entry.current;
    entry.current = next;
    return added;
  };
  const consumeIngredients = (spot, ingredients, multiplier = 1) => {
    if (!spot || !ingredients || typeof ingredients !== "object") return true;
    const entries = [];
    for (const [ingredient, amount] of Object.entries(ingredients)) {
      const needed = Math.max(0, Math.floor(amount * multiplier));
      if (!needed) continue;
      const entry = getIngredientEntry(spot, ingredient);
      if (!entry || entry.current < needed) return false;
      entries.push({ entry, needed });
    }
    entries.forEach(({ entry, needed }) => {
      entry.current = Math.max(0, entry.current - needed);
    });
    return true;
  };

  return {
    inventoryState,
    ingredientState,
    getSpotInventory,
    getIngredientEntry,
    getSpotIngredients,
    isSpotStocked,
    consumeSpotInventory,
    restockSpotInventory,
    restockIngredient,
    consumeIngredients,
  };
};
