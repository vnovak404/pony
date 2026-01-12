// Pony Parade: task helpers and manual commands.

export const createTaskHelpers = (context) => {
  const {
    mapStatus,
    getStructureLabel,
    findRepairTarget,
    houseStates,
    innObject,
    pickFoodSpot,
    pickDrinkSpot,
    pickFunSpot,
    pickHealthSpot,
    foodSpotById,
    drinkSpotById,
    funSpotById,
    healthSpotById,
    foodSpots,
    drinkSpots,
    funSpots,
    healthSpots,
    spotByLocationId,
    getSupplyTypesForSpot,
    getIngredientEntry,
    pickSupplyProducer,
    getFoodTargetPoint,
    getDrinkTargetPoint,
    getFunTargetPoint,
    getHealthTargetPoint,
    getSupplySpotAccessPoint,
    getHouseTargetPoint,
    getInnTargetPoint,
    isFoodSpot,
    isDrinkSpot,
    isFunSpot,
    isSupplySpot,
    getSpotInventory,
    WORK_RESTOCK_THRESHOLD,
    HOUSE_REPAIR_THRESHOLD,
    SUPPLY_SOURCE_BY_TYPE,
    SUPPLY_TYPE_FOOD,
    SUPPLY_TYPE_DRINK,
    SUPPLY_TYPE_REPAIR,
    INGREDIENT_DESTINATIONS,
    INGREDIENT_SUPPLY_TYPES,
  } = context;

  const getSpotForLocationId = (locationId) => {
    if (!locationId) return null;
    return spotByLocationId.get(locationId) || null;
  };

  const getSupplySourceForType = (type) => {
    const locationId = SUPPLY_SOURCE_BY_TYPE[type];
    if (!locationId) return null;
    return getSpotForLocationId(locationId);
  };

  const getRestockSupplyType = (spot) => {
    if (!spot) return null;
    if (isFoodSpot(spot)) return "food";
    if (isDrinkSpot(spot)) return "drink";
    return null;
  };

  const createRestockTask = (spot, { manual = false } = {}) => {
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

  const createRepairTask = (houseId, { manual = false } = {}) => {
    const sourceSpot = getSupplySourceForType(SUPPLY_TYPE_REPAIR);
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

  const getTaskTargetPoint = (actor) => {
    if (!actor || !actor.task) return null;
    const task = actor.task;
    if (task.type === "rest") {
      if (task.houseId) return getHouseTargetPoint(task.houseId);
      if (task.inn) return getInnTargetPoint();
      return null;
    }
    if (task.type === "eat") return getFoodTargetPoint(task.foodId);
    if (task.type === "drink") return getDrinkTargetPoint(task.drinkId);
    if (task.type === "fun") return getFunTargetPoint(task.funId);
    if (task.type === "vet") return getHealthTargetPoint(task.clinicId);
    if (task.type === "restock") {
      const targetSpot = task.targetLocationId
        ? getSpotForLocationId(task.targetLocationId)
        : null;
      const sourceSpot = task.sourceLocationId
        ? getSpotForLocationId(task.sourceLocationId)
        : null;
      if (task.phase === "pickup" && sourceSpot) {
        return getSupplySpotAccessPoint(sourceSpot);
      }
      if (task.phase === "deliver" && targetSpot) {
        if (isFoodSpot(targetSpot)) return getFoodTargetPoint(targetSpot.id);
        if (isDrinkSpot(targetSpot)) return getDrinkTargetPoint(targetSpot.id);
        if (isFunSpot(targetSpot)) return getFunTargetPoint(targetSpot.id);
        if (isSupplySpot(targetSpot)) return getSupplySpotAccessPoint(targetSpot);
      }
      return null;
    }
    if (task.type === "supply") {
      const spot = getSpotForLocationId(task.locationId);
      if (!spot) return null;
      return getSupplySpotAccessPoint(spot);
    }
    if (task.type === "work") {
      const spot = getSpotForLocationId(task.locationId);
      if (!spot) return null;
      if (isFoodSpot(spot)) return getFoodTargetPoint(spot.id);
      if (isDrinkSpot(spot)) return getDrinkTargetPoint(spot.id);
      if (isFunSpot(spot)) return getFunTargetPoint(spot.id);
      return null;
    }
    if (task.type === "repair") {
      if (task.phase === "pickup" && task.sourceLocationId) {
        const sourceSpot = getSpotForLocationId(task.sourceLocationId);
        if (sourceSpot) return getSupplySpotAccessPoint(sourceSpot);
      }
      return getHouseTargetPoint(task.houseId);
    }
    if (task.houseId) return getHouseTargetPoint(task.houseId);
    return null;
  };

  const getActorPosition = (actor) => {
    if (!actor || !actor.segment) return { x: 0, y: 0 };
    const from = actor.direction === 1 ? actor.segment.from : actor.segment.to;
    const to = actor.direction === 1 ? actor.segment.to : actor.segment.from;
    return {
      x: from.x + (to.x - from.x) * actor.t,
      y: from.y + (to.y - from.y) * actor.t,
    };
  };

  const assignManualTask = (actor, command) => {
    if (!actor) return;
    if (command === "close") {
      return;
    }
    if (command === "clear") {
      actor.task = null;
      return;
    }
    const position = getActorPosition(actor);
    const createSupplyTaskForIngredient = (ingredient, options = {}) => {
      if (!ingredient || !pickSupplyProducer) return null;
      const supplyType =
        (INGREDIENT_SUPPLY_TYPES && INGREDIENT_SUPPLY_TYPES[ingredient]) || null;
      if (!supplyType) return null;
      const producer = pickSupplyProducer(supplyType, actor, position, ingredient);
      if (!producer || !producer.locationId) return null;
      return {
        type: "supply",
        locationId: producer.locationId,
        supplyTypes: getSupplyTypesForSpot(producer),
        ingredients: [ingredient],
        ingredient,
        manual: Boolean(options.manual),
      };
    };
    if (command === "eat") {
      const target = pickFoodSpot(actor, position);
      if (target) {
        actor.task = { type: "eat", foodId: target.id, manual: true };
        actor.eatCooldownUntil = 0;
      } else if (mapStatus) {
        mapStatus.textContent = "No food spots available.";
      }
      return;
    }
    if (command === "drink") {
      const target = pickDrinkSpot(actor, position);
      if (target) {
        actor.task = { type: "drink", drinkId: target.id, manual: true };
        actor.drinkCooldownUntil = 0;
      } else if (mapStatus) {
        mapStatus.textContent = "No drink spots available.";
      }
      return;
    }
    if (command === "vet") {
      const target = pickHealthSpot(actor, position);
      if (target) {
        actor.task = { type: "vet", clinicId: target.id, manual: true };
        actor.vetCooldownUntil = 0;
      } else if (mapStatus) {
        mapStatus.textContent = "No clinic available.";
      }
      return;
    }
    if (command === "repair") {
      const ponySlug = (actor.sprite?.pony?.slug || "").toLowerCase();
      if (ponySlug !== "taticorn") {
        const jobLocationId = actor.jobLocationId;
        if (!jobLocationId) {
          if (mapStatus) {
            mapStatus.textContent = "This pony doesn't have a job assignment.";
          }
          return;
        }
        const jobSpot = getSpotForLocationId(jobLocationId);
        if (!jobSpot) {
          if (mapStatus) {
            mapStatus.textContent = "No job spot found for this pony.";
          }
          return;
        }
        const inventory = getSpotInventory(jobSpot);
        const ratio =
          inventory && inventory.max > 0 ? inventory.current / inventory.max : 0;
        if (inventory && ratio > WORK_RESTOCK_THRESHOLD && mapStatus) {
          mapStatus.textContent = `Supplies look good at ${getStructureLabel(
            jobSpot
          )}.`;
        }
        const restockTask = createRestockTask(jobSpot, { manual: true });
        if (restockTask) {
          actor.task = restockTask;
        }
        actor.workCooldownUntil = 0;
        return;
      }
      const target = findRepairTarget({ allowHealthy: true });
      if (target) {
        actor.task = createRepairTask(target.id, { manual: true });
        const state = houseStates.get(target.id);
        if (state && state.condition >= HOUSE_REPAIR_THRESHOLD && mapStatus) {
          mapStatus.textContent = `No houses need repair. Sending Taticorn to check ${getStructureLabel(
            target
          )}.`;
        }
      } else if (mapStatus) {
        mapStatus.textContent = "No houses need repair.";
      }
      return;
    }
    if (command === "market") {
      const ponySlug = (actor.sprite?.pony?.slug || "").toLowerCase();
      const isBuilder = ponySlug === "taticorn";
      if (isBuilder) {
        const task = createSupplyTaskForIngredient("lumber", { manual: true });
        if (task) {
          actor.task = task;
          actor.workCooldownUntil = 0;
        } else if (mapStatus) {
          mapStatus.textContent = "No lumber supply route is available.";
        }
        return;
      }
      const marketLocationId =
        SUPPLY_SOURCE_BY_TYPE[SUPPLY_TYPE_FOOD] ||
        SUPPLY_SOURCE_BY_TYPE[SUPPLY_TYPE_DRINK];
      const marketSpot = marketLocationId
        ? getSpotForLocationId(marketLocationId)
        : null;
      if (!marketSpot) {
        if (mapStatus) {
          mapStatus.textContent = "Market supplies are not configured.";
        }
        return;
      }
      const marketNeeds = Object.entries(INGREDIENT_DESTINATIONS || {})
        .filter(([, destinationId]) => destinationId === marketLocationId)
        .map(([ingredient]) => {
          const entry = getIngredientEntry
            ? getIngredientEntry(marketSpot, ingredient)
            : null;
          if (!entry || entry.max <= 0) return null;
          const ratio = entry.current / entry.max;
          return { ingredient, ratio };
        })
        .filter(Boolean)
        .sort((a, b) => a.ratio - b.ratio);
      const nextNeed = marketNeeds[0] || null;
      if (!nextNeed || nextNeed.ratio >= 1) {
        if (mapStatus) {
          mapStatus.textContent = "Market supplies are full.";
        }
        return;
      }
      const task = createSupplyTaskForIngredient(nextNeed.ingredient, { manual: true });
      if (!task) {
        if (mapStatus) {
          mapStatus.textContent = "No producer can supply the market right now.";
        }
        return;
      }
      actor.task = task;
      actor.workCooldownUntil = 0;
      return;
    }
    if (command === "fun") {
      const target = pickFunSpot(actor, position);
      if (target) {
        actor.task = { type: "fun", funId: target.id, manual: true };
        actor.funCooldownUntil = 0;
      } else if (mapStatus) {
        mapStatus.textContent = "No frolic spots available.";
      }
      return;
    }
    if (command === "rest") {
      const homeId = actor.homeId;
      const state = homeId ? houseStates.get(homeId) : null;
      if (
        homeId &&
        state &&
        state.status !== "repairing" &&
        state.status !== "desperately_needs_repair" &&
        state.status !== "under_construction"
      ) {
        actor.task = { type: "rest", houseId: homeId, manual: true };
        actor.homeCooldownUntil = 0;
        return;
      }
      if (innObject && getInnTargetPoint()) {
        actor.task = { type: "rest", inn: true, manual: true };
        actor.innCooldownUntil = 0;
        return;
      }
      if (mapStatus) {
        mapStatus.textContent = "No rest spot available.";
      }
    }
  };

  return {
    getSpotForLocationId,
    getSupplySourceForType,
    getRestockSupplyType,
    createRestockTask,
    createRepairTask,
    getTaskTargetPoint,
    getActorPosition,
    assignManualTask,
  };
};
