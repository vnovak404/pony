// Pony Parade: actor task selection and validation.

export const createTaskHelpers = (context) => {
  const {
    foodSpots,
    drinkSpots,
    funSpots,
    healthSpots,
    foodSpotById,
    drinkSpotById,
    funSpotById,
    healthSpotById,
    housesById,
    houseStates,
    innObject,
    getCriticalNeedTask,
    pickNeedCandidate,
    pickFoodSpot,
    pickDrinkSpot,
    pickFunSpot,
    pickHealthSpot,
    findRepairTarget,
    getSpotForLocationId,
    getSpotInventory,
    getSupplyTypesForSpot,
    createRestockTask,
    createRepairTask,
    findSupplyNeed,
    pickSupplyProducer,
    getSupplyAvailable,
    getIngredientDestination,
    INGREDIENT_SUPPLY_TYPES,
    getProducerIngredients,
    WORK_RESTOCK_THRESHOLD,
    BOREDOM_THRESHOLD_DEFAULT,
    EAT_THRESHOLD_DEFAULT,
    DRINK_THRESHOLD_DEFAULT,
    HEALTH_THRESHOLD_DEFAULT,
  } = context;

  const updateActorTask = (actor, position, now) => {
    if (!actor) return;
    const startSupplyRun = (ingredient, pendingRepairId = null) => {
      if (!ingredient || !pickSupplyProducer) return false;
      const supplyType =
        (INGREDIENT_SUPPLY_TYPES && INGREDIENT_SUPPLY_TYPES[ingredient]) || null;
      if (!supplyType) return false;
      const producer = pickSupplyProducer(supplyType, actor, position, ingredient);
      if (!producer || !producer.locationId) return false;
      actor.task = {
        type: "supply",
        locationId: producer.locationId,
        supplyTypes: getSupplyTypesForSpot(producer),
        ingredients: [ingredient],
        ingredient,
      };
      actor.pendingRepairId = pendingRepairId || null;
      return true;
    };
    const hasRepairSupplies = (task) => {
      if (!task || task.type !== "repair" || !task.sourceLocationId) return true;
      const sourceSpot = getSpotForLocationId(task.sourceLocationId);
      const available =
        sourceSpot && getSupplyAvailable
          ? getSupplyAvailable(sourceSpot, null, "repair")
          : 0;
      if (available === Infinity) return true;
      return Number.isFinite(available) ? available > 0 : false;
    };
    const isGatheringTask = (task) =>
      Boolean(
        task &&
          (task.type === "supply" ||
            (task.type === "restock" && task.phase === "pickup") ||
            (task.type === "repair" && task.phase === "pickup"))
      );
    const preserveGatheringTask = isGatheringTask(actor.task);
    const ponySlug = (actor.sprite?.pony?.slug || "").toLowerCase();
    const isBuilder = ponySlug === "taticorn";
    const eatThreshold = Number.isFinite(actor.eatThreshold)
      ? actor.eatThreshold
      : EAT_THRESHOLD_DEFAULT;
    const drinkThreshold = Number.isFinite(actor.drinkThreshold)
      ? actor.drinkThreshold
      : DRINK_THRESHOLD_DEFAULT;
    const healthThreshold = Number.isFinite(actor.healthThreshold)
      ? actor.healthThreshold
      : HEALTH_THRESHOLD_DEFAULT;
    const hasManualTask = actor.task && actor.task.manual;
    const hasUrgentTask = actor.task && actor.task.urgent;
    if (!preserveGatheringTask && !hasManualTask && !hasUrgentTask) {
      const urgentTask = getCriticalNeedTask(actor, position);
      if (urgentTask) {
        actor.task = urgentTask;
      }
    }
    if (!actor.task && actor.pendingRepairId && !hasManualTask && !hasUrgentTask) {
      const pendingHouse = housesById.get(actor.pendingRepairId);
      if (!pendingHouse) {
        actor.pendingRepairId = null;
      } else {
        const repairTask = createRepairTask(actor.pendingRepairId);
        if (repairTask && !hasRepairSupplies(repairTask)) {
          const startedSupply = startSupplyRun("lumber", actor.pendingRepairId);
          if (!startedSupply) {
            actor.pendingRepairId = null;
          }
        } else if (repairTask) {
          actor.task = repairTask;
          actor.pendingRepairId = null;
        }
      }
    }
    const hasActiveTask = Boolean(actor.task);
    if (!hasActiveTask && !preserveGatheringTask) {
      if (isBuilder) {
        const target = findRepairTarget();
        if (target) {
          const repairTask = createRepairTask(target.id);
          if (repairTask && !hasRepairSupplies(repairTask)) {
            const startedSupply = startSupplyRun("lumber", target.id);
            if (!startedSupply) {
              actor.task = repairTask;
            }
          } else if (repairTask) {
            actor.task = repairTask;
          }
        }
      }
      if (!actor.task) {
        const canEat = foodSpots.length > 0 && now > actor.eatCooldownUntil;
        const canDrink = drinkSpots.length > 0 && now > actor.drinkCooldownUntil;
        const canFun = funSpots.length > 0 && now > actor.funCooldownUntil;
        const canHeal = healthSpots.length > 0 && now > actor.vetCooldownUntil;
        const candidates = [];
        const healthLevel = Number.isFinite(actor.stats.health)
          ? actor.stats.health
          : 100;
        if (canHeal && healthLevel <= healthThreshold) {
          const target = pickHealthSpot(actor, position);
          if (target) {
            const healthNeed = Math.max(0, 100 - healthLevel) + 20;
            candidates.push({
              need: "health",
              level: healthNeed,
              task: { type: "vet", clinicId: target.id },
            });
          }
        }
        if (canEat && actor.stats.hunger >= eatThreshold) {
          const target = pickFoodSpot(actor, position);
          if (target) {
            candidates.push({
              need: "hunger",
              level: actor.stats.hunger,
              task: { type: "eat", foodId: target.id },
            });
          }
        }
        if (canDrink && actor.stats.thirst >= drinkThreshold) {
          const target = pickDrinkSpot(actor, position);
          if (target) {
            candidates.push({
              need: "thirst",
              level: actor.stats.thirst,
              task: { type: "drink", drinkId: target.id },
            });
          }
        }
        if (actor.stats.tiredness > 60 && actor.homeId && housesById.has(actor.homeId)) {
          candidates.push({
            need: "tired",
            level: actor.stats.tiredness,
            task: { type: "rest", houseId: actor.homeId },
          });
        }
        const boredomThreshold = Number.isFinite(actor.funThreshold)
          ? actor.funThreshold
          : BOREDOM_THRESHOLD_DEFAULT;
        if (canFun && actor.stats.boredom >= boredomThreshold) {
          const target = pickFunSpot(actor, position);
          if (target) {
            candidates.push({
              need: "boredom",
              level: actor.stats.boredom,
              task: { type: "fun", funId: target.id },
            });
          }
        }
        const chosenNeed = pickNeedCandidate(candidates);
        if (chosenNeed) {
          actor.task = chosenNeed.task;
        }
      }
      if (!actor.task && actor.jobLocationId) {
        const jobSpot = getSpotForLocationId(actor.jobLocationId);
        const inventory = jobSpot ? getSpotInventory(jobSpot) : null;
        const ratio =
          inventory && inventory.max > 0 ? inventory.current / inventory.max : 0;
        const needsStock =
          jobSpot &&
          inventory &&
          ratio <= WORK_RESTOCK_THRESHOLD &&
          now > actor.workCooldownUntil;
        if (needsStock) {
          const restockTask = createRestockTask(jobSpot);
          if (restockTask) {
            actor.task = restockTask;
          }
        }
      }
      if (!actor.task && now > actor.workCooldownUntil) {
        const supplyNeed = findSupplyNeed();
        if (supplyNeed) {
          const ingredient = supplyNeed.ingredient || null;
          let supplyType = supplyNeed.type || null;
          if (!supplyType && ingredient && getIngredientDestination) {
            const destinationId = getIngredientDestination(ingredient);
            const destinationSpot = destinationId
              ? getSpotForLocationId(destinationId)
              : null;
            const types = destinationSpot ? getSupplyTypesForSpot(destinationSpot) : [];
            supplyType =
              (INGREDIENT_SUPPLY_TYPES && INGREDIENT_SUPPLY_TYPES[ingredient]) ||
              types[0] ||
              null;
          }
          const producer = supplyType
            ? pickSupplyProducer(supplyType, actor, position, ingredient)
            : null;
          if (producer && producer.locationId) {
            const supplyTypes = getSupplyTypesForSpot(producer);
            const ingredients = getProducerIngredients
              ? getProducerIngredients(producer)
              : null;
            actor.task = {
              type: "supply",
              locationId: producer.locationId,
              supplyTypes,
              ingredients,
              ingredient,
            };
          }
        }
      }
    }

    if (actor.task && actor.task.type === "rest" && actor.task.houseId) {
      const state = houseStates.get(actor.task.houseId);
      if (
        actor.task.type === "rest" &&
        (!state ||
          state.status === "repairing" ||
          state.status === "desperately_needs_repair" ||
          state.status === "under_construction")
      ) {
        actor.task = null;
      }
    }
    if (actor.task && actor.task.type === "rest" && actor.task.inn && !innObject) {
      actor.task = null;
    }
    if (actor.task && actor.task.type === "eat") {
      const spot = foodSpotById.get(actor.task.foodId);
      if (!spot) {
        actor.task = null;
      }
    }
    if (actor.task && actor.task.type === "drink") {
      const spot = drinkSpotById.get(actor.task.drinkId);
      if (!spot) {
        actor.task = null;
      }
    }
    if (actor.task && actor.task.type === "fun") {
      const spot = funSpotById.get(actor.task.funId);
      if (!spot) {
        actor.task = null;
      }
    }
    if (actor.task && actor.task.type === "vet") {
      const spot = healthSpotById.get(actor.task.clinicId);
      if (!spot) {
        actor.task = null;
      }
    }
    if (actor.task && actor.task.type === "restock") {
      const targetSpot = actor.task.targetLocationId
        ? getSpotForLocationId(actor.task.targetLocationId)
        : null;
      const sourceSpot = actor.task.sourceLocationId
        ? getSpotForLocationId(actor.task.sourceLocationId)
        : null;
      const inventory = targetSpot ? getSpotInventory(targetSpot) : null;
      const available =
        sourceSpot && getSupplyAvailable
          ? getSupplyAvailable(sourceSpot, targetSpot, actor.task.supplyType)
          : 0;
      const hasSupply =
        Number.isFinite(available) ? available > 0 : available === Infinity;
      if (
        !targetSpot ||
        !sourceSpot ||
        !inventory ||
        inventory.current >= inventory.max ||
        !hasSupply
      ) {
        actor.task = null;
      }
    }
    if (actor.task && actor.task.type === "supply") {
      const producer = getSpotForLocationId(actor.task.locationId);
      if (!producer) {
        actor.task = null;
      }
    }
    if (actor.task && actor.task.type === "repair" && actor.task.phase === "pickup") {
      const sourceSpot = actor.task.sourceLocationId
        ? getSpotForLocationId(actor.task.sourceLocationId)
        : null;
      const available =
        sourceSpot && getSupplyAvailable
          ? getSupplyAvailable(sourceSpot, null, "repair")
          : 0;
      const hasSupply =
        Number.isFinite(available) ? available > 0 : available === Infinity;
      if (!sourceSpot || !hasSupply) {
        if (isBuilder && actor.task.houseId) {
          const startedSupply = startSupplyRun("lumber", actor.task.houseId);
          if (!startedSupply) {
            actor.task = null;
          }
        } else {
          actor.task = null;
        }
      }
    }
    if (actor.task && actor.task.type === "work") {
      const spot = getSpotForLocationId(actor.task.locationId);
      const inventory = spot ? getSpotInventory(spot) : null;
      if (!spot || !inventory || inventory.current >= inventory.max) {
        actor.task = null;
      }
    }
  };

  return { updateActorTask };
};
