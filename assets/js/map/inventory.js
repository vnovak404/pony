// Pony Parade: inventory state helpers.

export const createInventoryState = ({ locationIndex, runtimeState }) => {
  const runtimeInventory =
    runtimeState && runtimeState.inventory ? runtimeState.inventory : {};
  const inventoryState = new Map();
  const DEFAULT_INVENTORY_MAX = 12;
  const DEFAULT_INVENTORY_START = 9;
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

  return {
    inventoryState,
    getSpotInventory,
    isSpotStocked,
    consumeSpotInventory,
    restockSpotInventory,
  };
};
