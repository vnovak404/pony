// Pony Parade: supply task helpers.

export const createSupplyHelpers = (context) => {
  const {
    supplyProducers,
    getSupplyTypesForSpot,
    getSupplySpotAccessPoint,
    getSupplySourceForType,
    getSpotInventory,
    WORK_RESTOCK_THRESHOLD,
    isFoodSpot,
    isDrinkSpot,
  } = context;

  const SUPPLY_TYPES = ["food", "drink", "repair"];

  const normalizeSpecies = (value) => String(value || "").trim().toLowerCase();

  const canWorkProducer = (producer, actor) => {
    const allowed = Array.isArray(producer?.allowedSpecies)
      ? producer.allowedSpecies
      : [];
    if (!allowed.length) return true;
    const species = normalizeSpecies(actor?.sprite?.pony?.species);
    if (!species) return false;
    return allowed.some((entry) => normalizeSpecies(entry) === species);
  };

  const pickSupplyProducer = (type, actor, position) => {
    if (!supplyProducers.length) return null;
    const candidates = supplyProducers
      .map((producer) => {
        const supplyTypes = getSupplyTypesForSpot(producer);
        if (!supplyTypes.includes(type)) return null;
        if (!canWorkProducer(producer, actor)) return null;
        const accessPoint = getSupplySpotAccessPoint(producer);
        if (!accessPoint) return null;
        const score = Math.hypot(
          accessPoint.x - position.x,
          accessPoint.y - position.y
        );
        return { producer, score };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score);
    return candidates.length ? candidates[0].producer : null;
  };

  const findSupplyNeed = () => {
    const candidates = SUPPLY_TYPES.map((type) => {
      const source = getSupplySourceForType(type);
      const inventory = source ? getSpotInventory(source) : null;
      if (!source || !inventory || inventory.max <= 0) return null;
      const ratio = inventory.current / inventory.max;
      return { type, ratio };
    }).filter(Boolean);
    if (!candidates.length) return null;
    const low = candidates
      .filter((item) => item.ratio <= WORK_RESTOCK_THRESHOLD)
      .sort((a, b) => a.ratio - b.ratio);
    return low[0] || null;
  };

  const getRestockSupplyType = (spot) => {
    if (isFoodSpot(spot)) return "food";
    if (isDrinkSpot(spot)) return "drink";
    return null;
  };

  const createRestockTask = (spot, manual = false) => {
    if (!spot || !spot.locationId) return null;
    const supplyType = getRestockSupplyType(spot);
    const sourceSpot = supplyType ? getSupplySourceForType(supplyType) : null;
    if (!supplyType || !sourceSpot || !sourceSpot.locationId) {
      return { type: "work", locationId: spot.locationId, manual };
    }
    return {
      type: "restock",
      targetLocationId: spot.locationId,
      sourceLocationId: sourceSpot.locationId,
      supplyType,
      phase: "pickup",
      manual,
    };
  };

  const createRepairTask = (houseId, manual = false) => {
    const sourceSpot = getSupplySourceForType("repair");
    if (!sourceSpot || !sourceSpot.locationId) {
      return { type: "repair", houseId, manual };
    }
    return {
      type: "repair",
      houseId,
      phase: "pickup",
      sourceLocationId: sourceSpot.locationId,
      manual,
    };
  };

  return {
    pickSupplyProducer,
    findSupplyNeed,
    getRestockSupplyType,
    createRestockTask,
    createRepairTask,
  };
};
