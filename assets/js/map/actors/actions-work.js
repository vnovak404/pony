// Pony Parade: work-style actions (restock, supply, repair, work).

export const createWorkActions = (context) => {
  const {
    mapData,
    housesById,
    houseStates,
    getHouseTargetPoint,
    getSpotForLocationId,
    getSpotInventory,
    consumeSpotInventory,
    restockSpotInventory,
    getFoodSpotAccessPoint,
    getDrinkSpotAccessPoint,
    getFunSpotAccessPoint,
    getSupplySpotAccessPoint,
    getSupplySourceForType,
    getSupplyTypesForSpot,
    getProducerIngredients,
    getIngredientDestination,
    getSupplyAvailable,
    consumeSupplyFromSource,
    getIngredientEntry,
    INGREDIENT_WORK_DURATION_MULTIPLIERS,
    INGREDIENT_RESTOCK_MULTIPLIERS,
    foodSpotById,
    drinkSpotById,
    funSpotById,
    isFoodSpot,
    isDrinkSpot,
    isFunSpot,
    WORK_RADIUS_TILES,
    WORK_DURATION_PER_ITEM_MIN,
    WORK_DURATION_PER_ITEM_MAX,
    WORK_ACTION_DURATION_MAX,
    WORK_COOLDOWN_MIN,
    WORK_COOLDOWN_MAX,
    WORK_RESTOCK_MIN,
    WORK_RESTOCK_MAX,
    REPAIR_DURATION_MIN,
    REPAIR_DURATION_MAX,
    restockIngredient,
  } = context;

  const maxWorkDuration = Number.isFinite(WORK_ACTION_DURATION_MAX)
    ? WORK_ACTION_DURATION_MAX
    : null;
  const clampWorkDuration = (value) =>
    maxWorkDuration ? Math.min(maxWorkDuration, value) : value;

  const handleRestockTask = (actor, now, position) => {
    if (!actor.task || actor.task.type !== "restock") return false;
    const targetSpot = actor.task.targetLocationId
      ? getSpotForLocationId(actor.task.targetLocationId)
      : null;
    const sourceSpot = actor.task.sourceLocationId
      ? getSpotForLocationId(actor.task.sourceLocationId)
      : null;
    const targetInventory = targetSpot ? getSpotInventory(targetSpot) : null;
    const sourceInventory = sourceSpot ? getSpotInventory(sourceSpot) : null;
    if (!targetSpot || !sourceSpot || !targetInventory || !sourceInventory) {
      actor.task = null;
      return false;
    }
    const accessPoint =
      actor.task.phase === "pickup"
        ? getSupplySpotAccessPoint(sourceSpot)
        : isFoodSpot(targetSpot)
          ? getFoodSpotAccessPoint(targetSpot)
          : isDrinkSpot(targetSpot)
            ? getDrinkSpotAccessPoint(targetSpot)
            : isFunSpot(targetSpot)
              ? getFunSpotAccessPoint(targetSpot)
              : getSupplySpotAccessPoint(targetSpot);
    const fallbackSpot = actor.task.phase === "pickup" ? sourceSpot : targetSpot;
    const workX = accessPoint ? accessPoint.x : fallbackSpot.at.x * mapData.meta.tileSize;
    const workY = accessPoint ? accessPoint.y : fallbackSpot.at.y * mapData.meta.tileSize;
    const distToWork = Math.hypot(position.x - workX, position.y - workY);
    const workRadius = mapData.meta.tileSize * WORK_RADIUS_TILES;
    if (distToWork >= workRadius || now <= actor.workCooldownUntil) return false;
    if (actor.task.phase === "pickup") {
      const restockNeed = Math.max(0, targetInventory.max - targetInventory.current);
      const desiredAmount = Math.min(
        restockNeed,
        WORK_RESTOCK_MIN +
          Math.floor(Math.random() * (WORK_RESTOCK_MAX - WORK_RESTOCK_MIN + 1))
      );
      const available = getSupplyAvailable
        ? getSupplyAvailable(sourceSpot, targetSpot, actor.task.supplyType)
        : sourceInventory.current;
      const cappedAvailable = Number.isFinite(available)
        ? available
        : available === Infinity
          ? desiredAmount
          : 0;
      const carryAmount = Math.min(desiredAmount, cappedAvailable);
      if (carryAmount <= 0) {
        actor.workCooldownUntil = now + 1500 + Math.random() * 1500;
        actor.task = null;
        return false;
      }
      const consumed = consumeSupplyFromSource
        ? consumeSupplyFromSource(sourceSpot, targetSpot, actor.task.supplyType, carryAmount)
        : consumeSpotInventory(sourceSpot, carryAmount);
      if (!consumed) {
        actor.workCooldownUntil = now + 1500 + Math.random() * 1500;
        actor.task = null;
        return false;
      }
      const perItemDuration =
        WORK_DURATION_PER_ITEM_MIN +
        Math.random() * (WORK_DURATION_PER_ITEM_MAX - WORK_DURATION_PER_ITEM_MIN);
      const workDuration = clampWorkDuration(perItemDuration * carryAmount * 0.6);
      actor.workUntil = now + workDuration;
      actor.workCooldownUntil = actor.workUntil;
      actor.workTargetId = actor.task.sourceLocationId;
      actor.workOffset = {
        x: (Math.random() - 0.5) * mapData.meta.tileSize * 0.2,
        y: (Math.random() - 0.5) * mapData.meta.tileSize * 0.2,
      };
      actor.frameIndex = 0;
      actor.lastFrame = 0;
      actor.task.phase = "deliver";
      actor.task.restockAmount = carryAmount;
      return true;
    }
    if (actor.task.phase === "deliver") {
      const restockAmount = Number.isFinite(actor.task.restockAmount)
        ? Math.max(1, Math.floor(actor.task.restockAmount))
        : WORK_RESTOCK_MIN;
      const restocked = restockSpotInventory(targetSpot, restockAmount);
      if (restocked) {
        const perItemDuration =
          WORK_DURATION_PER_ITEM_MIN +
          Math.random() *
            (WORK_DURATION_PER_ITEM_MAX - WORK_DURATION_PER_ITEM_MIN);
        const workDuration = clampWorkDuration(perItemDuration * restockAmount);
        actor.workUntil = now + workDuration;
        actor.workCooldownUntil =
          actor.workUntil +
          WORK_COOLDOWN_MIN +
          Math.random() * (WORK_COOLDOWN_MAX - WORK_COOLDOWN_MIN);
        actor.workTargetId = actor.task.targetLocationId;
        actor.workOffset = {
          x: (Math.random() - 0.5) * mapData.meta.tileSize * 0.2,
          y: (Math.random() - 0.5) * mapData.meta.tileSize * 0.2,
        };
        actor.frameIndex = 0;
        actor.lastFrame = 0;
        actor.task = null;
        return true;
      }
      actor.workCooldownUntil = now + 1500 + Math.random() * 1500;
      actor.task = null;
    }
    return false;
  };

  const handleSupplyTask = (actor, now, position) => {
    if (!actor.task || actor.task.type !== "supply") return false;
    const producer = getSpotForLocationId(actor.task.locationId);
    if (!producer) {
      actor.task = null;
      return false;
    }
    const accessPoint = getSupplySpotAccessPoint(producer);
    const workX = accessPoint ? accessPoint.x : producer.at.x * mapData.meta.tileSize;
    const workY = accessPoint ? accessPoint.y : producer.at.y * mapData.meta.tileSize;
    const distToWork = Math.hypot(position.x - workX, position.y - workY);
    const workRadius = mapData.meta.tileSize * WORK_RADIUS_TILES;
    if (distToWork >= workRadius || now <= actor.workCooldownUntil) return false;
    let totalRestocked = 0;
    let totalDurationWeight = 0;
    const durationMultipliers = INGREDIENT_WORK_DURATION_MULTIPLIERS || {};
    const restockMultipliers = INGREDIENT_RESTOCK_MULTIPLIERS || {};
    const ingredients = Array.isArray(actor.task.ingredients)
      ? actor.task.ingredients
      : getProducerIngredients
        ? getProducerIngredients(producer)
        : [];
    ingredients.forEach((ingredient) => {
      const destinationId = getIngredientDestination
        ? getIngredientDestination(ingredient)
        : null;
      const destinationSpot = destinationId
        ? getSpotForLocationId(destinationId)
        : null;
      const entry =
        destinationSpot && getIngredientEntry
          ? getIngredientEntry(destinationSpot, ingredient)
          : null;
      if (!destinationSpot || !entry || !restockIngredient) return;
      const restockNeed = Math.max(0, entry.max - entry.current);
      if (restockNeed <= 0) return;
      const baseAmount =
        WORK_RESTOCK_MIN +
        Math.floor(Math.random() * (WORK_RESTOCK_MAX - WORK_RESTOCK_MIN + 1));
      const amountMultiplier = Number.isFinite(restockMultipliers[ingredient])
        ? restockMultipliers[ingredient]
        : 1;
      const restockAmount = Math.max(
        1,
        Math.min(restockNeed, Math.round(baseAmount * amountMultiplier))
      );
      const added = restockIngredient(destinationSpot, ingredient, restockAmount);
      if (added > 0) {
        totalRestocked += added;
        const durationMultiplier = Number.isFinite(durationMultipliers[ingredient])
          ? durationMultipliers[ingredient]
          : 1;
        totalDurationWeight += added * durationMultiplier;
      }
    });
    if (totalRestocked > 0) {
      const perItemDuration =
        WORK_DURATION_PER_ITEM_MIN +
        Math.random() * (WORK_DURATION_PER_ITEM_MAX - WORK_DURATION_PER_ITEM_MIN);
      const workDuration = clampWorkDuration(
        perItemDuration * Math.max(1, totalDurationWeight)
      );
      actor.workUntil = now + workDuration;
      actor.workCooldownUntil =
        actor.workUntil +
        WORK_COOLDOWN_MIN +
        Math.random() * (WORK_COOLDOWN_MAX - WORK_COOLDOWN_MIN);
      actor.workTargetId = actor.task.locationId;
      actor.workOffset = {
        x: (Math.random() - 0.5) * mapData.meta.tileSize * 0.2,
        y: (Math.random() - 0.5) * mapData.meta.tileSize * 0.2,
      };
      actor.frameIndex = 0;
      actor.lastFrame = 0;
      actor.task = null;
      return true;
    }
    actor.workCooldownUntil = now + 1500 + Math.random() * 1500;
    actor.task = null;
    return false;
  };

  const handleRepairPickupTask = (actor, now, position) => {
    if (!actor.task || actor.task.type !== "repair" || actor.task.phase !== "pickup") {
      return false;
    }
    const sourceSpot = actor.task.sourceLocationId
      ? getSpotForLocationId(actor.task.sourceLocationId)
      : null;
    if (!sourceSpot) {
      actor.task = null;
      return false;
    }
    const accessPoint = getSupplySpotAccessPoint(sourceSpot);
    const workX = accessPoint ? accessPoint.x : sourceSpot.at.x * mapData.meta.tileSize;
    const workY = accessPoint ? accessPoint.y : sourceSpot.at.y * mapData.meta.tileSize;
    const distToWork = Math.hypot(position.x - workX, position.y - workY);
    const workRadius = mapData.meta.tileSize * WORK_RADIUS_TILES;
    if (distToWork >= workRadius || now <= actor.workCooldownUntil) return false;
    const available = getSupplyAvailable
      ? getSupplyAvailable(sourceSpot, null, "repair")
      : 0;
    if (Number.isFinite(available) && available <= 0) {
      actor.workCooldownUntil = now + 1500 + Math.random() * 1500;
      actor.task = null;
      return false;
    }
    const consumed = consumeSupplyFromSource
      ? consumeSupplyFromSource(sourceSpot, null, "repair", 1)
      : consumeSpotInventory(sourceSpot, 1);
    if (!consumed) {
      actor.workCooldownUntil = now + 1500 + Math.random() * 1500;
      actor.task = null;
      return false;
    }
    const perItemDuration =
      WORK_DURATION_PER_ITEM_MIN +
      Math.random() * (WORK_DURATION_PER_ITEM_MAX - WORK_DURATION_PER_ITEM_MIN);
    const workDuration = clampWorkDuration(perItemDuration * 0.6);
    actor.workUntil = now + workDuration;
    actor.workCooldownUntil = actor.workUntil;
    actor.workTargetId = actor.task.sourceLocationId;
    actor.workOffset = {
      x: (Math.random() - 0.5) * mapData.meta.tileSize * 0.2,
      y: (Math.random() - 0.5) * mapData.meta.tileSize * 0.2,
    };
    actor.frameIndex = 0;
    actor.lastFrame = 0;
    actor.task.phase = "repair";
    return true;
  };

  const handleWorkTask = (actor, now, position) => {
    if (!actor.task || actor.task.type !== "work") return false;
    const spot = getSpotForLocationId(actor.task.locationId);
    if (!spot) {
      actor.task = null;
      return false;
    }
    const inventory = getSpotInventory(spot);
    if (!inventory || inventory.current >= inventory.max) {
      actor.task = null;
      return false;
    }
    const accessPoint = foodSpotById.has(spot.id)
      ? getFoodSpotAccessPoint(spot)
      : drinkSpotById.has(spot.id)
        ? getDrinkSpotAccessPoint(spot)
        : funSpotById.has(spot.id)
          ? getFunSpotAccessPoint(spot)
          : null;
    const workX = accessPoint ? accessPoint.x : spot.at.x * mapData.meta.tileSize;
    const workY = accessPoint ? accessPoint.y : spot.at.y * mapData.meta.tileSize;
    const distToWork = Math.hypot(position.x - workX, position.y - workY);
    const workRadius = mapData.meta.tileSize * WORK_RADIUS_TILES;
    if (distToWork >= workRadius || now <= actor.workCooldownUntil) return false;
    const restockNeed = Math.max(0, inventory.max - inventory.current);
    const restockAmount = Math.min(
      restockNeed,
      WORK_RESTOCK_MIN +
        Math.floor(Math.random() * (WORK_RESTOCK_MAX - WORK_RESTOCK_MIN + 1))
    );
    const restocked = restockSpotInventory(spot, restockAmount);
    if (restocked) {
      const perItemDuration =
        WORK_DURATION_PER_ITEM_MIN +
        Math.random() * (WORK_DURATION_PER_ITEM_MAX - WORK_DURATION_PER_ITEM_MIN);
      const workDuration = clampWorkDuration(perItemDuration * restockAmount);
      actor.workUntil = now + workDuration;
      actor.workCooldownUntil =
        actor.workUntil +
        WORK_COOLDOWN_MIN +
        Math.random() * (WORK_COOLDOWN_MAX - WORK_COOLDOWN_MIN);
      actor.workTargetId = actor.task.locationId;
      actor.workOffset = {
        x: (Math.random() - 0.5) * mapData.meta.tileSize * 0.2,
        y: (Math.random() - 0.5) * mapData.meta.tileSize * 0.2,
      };
      actor.frameIndex = 0;
      actor.lastFrame = 0;
      actor.task = null;
      return true;
    }
    actor.workCooldownUntil = now + 1500 + Math.random() * 1500;
    actor.task = null;
    return false;
  };

  const handleRepairTask = (actor, now, position) => {
    if (!actor.task || actor.task.type !== "repair" || actor.task.phase === "pickup") {
      return false;
    }
    const house = housesById.get(actor.task.houseId);
    const state = house ? houseStates.get(actor.task.houseId) : null;
    if (!house || !state || state.status === "repairing") return false;
    const accessPoint = getHouseTargetPoint(actor.task.houseId);
    const homeX = accessPoint ? accessPoint.x : house.at.x * mapData.meta.tileSize;
    const homeY = accessPoint ? accessPoint.y : house.at.y * mapData.meta.tileSize;
    const distToHome = Math.hypot(position.x - homeX, position.y - homeY);
    const repairRadius = mapData.meta.tileSize * 0.6;
    if (distToHome >= repairRadius) return false;
    const minRepair = Number.isFinite(REPAIR_DURATION_MIN) ? REPAIR_DURATION_MIN : 30000;
    const maxRepair = Number.isFinite(REPAIR_DURATION_MAX) ? REPAIR_DURATION_MAX : 50000;
    const repairTime = minRepair + Math.random() * Math.max(0, maxRepair - minRepair);
    state.status = "repairing";
    state.repairingUntil = now + repairTime;
    state.repairingBy = actor;
    actor.repairUntil = state.repairingUntil;
    actor.repairTargetId = actor.task.houseId;
    actor.repairOffset = {
      x: (Math.random() - 0.5) * mapData.meta.tileSize * 0.1,
      y: (Math.random() - 0.5) * mapData.meta.tileSize * 0.1,
    };
    actor.frameIndex = 0;
    actor.lastFrame = 0;
    actor.task = null;
    return true;
  };

  return {
    handleRestockTask,
    handleSupplyTask,
    handleRepairPickupTask,
    handleWorkTask,
    handleRepairTask,
  };
};
