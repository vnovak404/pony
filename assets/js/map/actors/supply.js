// Pony Parade: supply task helpers.

export const createSupplyHelpers = (context) => {
  const {
    supplyProducers,
    getSupplyTypesForSpot,
    getSupplySpotAccessPoint,
    getSupplySourceForType,
    getSpotForLocationId,
    getSpotInventory,
    getIngredientEntry,
    consumeSpotInventory,
    consumeIngredients,
    WORK_RESTOCK_THRESHOLD,
    isFoodSpot,
    isDrinkSpot,
    SUPPLY_RECIPES_BY_LOCATION,
    SUPPLY_RECIPES_BY_TYPE,
    PRODUCER_INGREDIENT_OUTPUTS,
    INGREDIENT_DESTINATIONS,
    UNLIMITED_INGREDIENTS,
  } = context;

  const SUPPLY_TYPES = ["food", "drink", "repair"];
  const unlimitedIngredients = new Set(UNLIMITED_INGREDIENTS || []);
  const recipesByLocation = SUPPLY_RECIPES_BY_LOCATION || {};
  const recipesByType = SUPPLY_RECIPES_BY_TYPE || {};
  const producerOutputs = PRODUCER_INGREDIENT_OUTPUTS || {};
  const ingredientDestinations = INGREDIENT_DESTINATIONS || {};

  const normalizeSpecies = (value) => String(value || "").trim().toLowerCase();
  const normalizeRecipe = (recipe) => {
    if (!recipe || typeof recipe !== "object") return null;
    const required =
      recipe.required && typeof recipe.required === "object" ? recipe.required : {};
    const options = Array.isArray(recipe.options)
      ? recipe.options.filter((option) => option && typeof option === "object")
      : [];
    return { required, options };
  };
  const getRestockRecipe = (targetSpot, supplyType) => {
    if (targetSpot && targetSpot.locationId && recipesByLocation[targetSpot.locationId]) {
      return normalizeRecipe(recipesByLocation[targetSpot.locationId]);
    }
    if (supplyType && recipesByType[supplyType]) {
      return normalizeRecipe(recipesByType[supplyType]);
    }
    return null;
  };
  const getServingCountForIngredients = (sourceSpot, ingredients) => {
    if (!ingredients || typeof ingredients !== "object") return Infinity;
    let servings = Infinity;
    let hasIngredient = false;
    Object.entries(ingredients).forEach(([ingredient, amount]) => {
      if (unlimitedIngredients.has(ingredient)) return;
      const entry = getIngredientEntry ? getIngredientEntry(sourceSpot, ingredient) : null;
      if (!entry || !Number.isFinite(amount) || amount <= 0) {
        servings = 0;
        return;
      }
      hasIngredient = true;
      servings = Math.min(servings, Math.floor(entry.current / amount));
    });
    if (!hasIngredient) return Infinity;
    return servings;
  };
  const pickRecipeOption = (sourceSpot, recipe) => {
    if (!recipe || !recipe.options || !recipe.options.length) return null;
    let bestOption = null;
    let bestServings = -1;
    recipe.options.forEach((option) => {
      const servings = getServingCountForIngredients(sourceSpot, option);
      if (servings > bestServings) {
        bestOption = option;
        bestServings = servings;
      }
    });
    if (bestServings <= 0) return null;
    return bestOption;
  };
  const getAvailableServings = (sourceSpot, recipe) => {
    if (!recipe || !sourceSpot) return 0;
    const requiredServings = getServingCountForIngredients(sourceSpot, recipe.required);
    if (requiredServings <= 0) return 0;
    if (recipe.options && recipe.options.length) {
      const optionServings = recipe.options.reduce((max, option) => {
        const servings = getServingCountForIngredients(sourceSpot, option);
        return Math.max(max, servings);
      }, 0);
      if (optionServings <= 0) return 0;
      if (!Number.isFinite(requiredServings)) return optionServings;
      return Math.min(requiredServings, optionServings);
    }
    return requiredServings;
  };
  const consumeRecipeIngredients = (sourceSpot, recipe, servings) => {
    if (!recipe || !sourceSpot || !consumeIngredients) return false;
    const option = pickRecipeOption(sourceSpot, recipe);
    if (recipe.options && recipe.options.length && !option) return false;
    const totals = {};
    const mergeTotals = (ingredients) => {
      if (!ingredients || typeof ingredients !== "object") return;
      Object.entries(ingredients).forEach(([ingredient, amount]) => {
        if (unlimitedIngredients.has(ingredient)) return;
        const safeAmount = Number.isFinite(amount) ? amount : 0;
        if (safeAmount <= 0) return;
        totals[ingredient] = (totals[ingredient] || 0) + safeAmount;
      });
    };
    mergeTotals(recipe.required);
    mergeTotals(option);
    if (!Object.keys(totals).length) return true;
    return consumeIngredients(sourceSpot, totals, servings);
  };
  const getSupplyAvailable = (sourceSpot, targetSpot, supplyType) => {
    const recipe = getRestockRecipe(targetSpot, supplyType);
    if (!recipe) {
      const inventory = getSpotInventory ? getSpotInventory(sourceSpot) : null;
      return inventory ? inventory.current : 0;
    }
    return getAvailableServings(sourceSpot, recipe);
  };
  const consumeSupplyFromSource = (sourceSpot, targetSpot, supplyType, servings) => {
    const recipe = getRestockRecipe(targetSpot, supplyType);
    if (!recipe) {
      return consumeSpotInventory ? consumeSpotInventory(sourceSpot, servings) : false;
    }
    return consumeRecipeIngredients(sourceSpot, recipe, servings);
  };
  const getProducerIngredients = (producer) => {
    if (!producer || !producer.locationId) return [];
    const outputs = producerOutputs[producer.locationId];
    return Array.isArray(outputs) ? outputs : [];
  };
  const getIngredientDestination = (ingredient) => {
    return ingredientDestinations[ingredient] || null;
  };

  const canWorkProducer = (producer, actor) => {
    const allowed = Array.isArray(producer?.allowedSpecies)
      ? producer.allowedSpecies
      : [];
    if (!allowed.length) return true;
    const species = normalizeSpecies(actor?.sprite?.pony?.species);
    if (!species) return false;
    return allowed.some((entry) => normalizeSpecies(entry) === species);
  };

  const pickSupplyProducer = (type, actor, position, ingredient) => {
    if (!supplyProducers.length) return null;
    const candidates = supplyProducers
      .map((producer) => {
        const supplyTypes = getSupplyTypesForSpot(producer);
        if (!supplyTypes.includes(type)) return null;
        if (ingredient) {
          const outputs = getProducerIngredients(producer);
          if (outputs.length && !outputs.includes(ingredient)) return null;
        }
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
    const ingredientNeeds = Object.entries(ingredientDestinations)
      .map(([ingredient, locationId]) => {
        if (!ingredient || unlimitedIngredients.has(ingredient)) return null;
        const spot = locationId ? getSpotForLocationId(locationId) : null;
        const entry = spot && getIngredientEntry ? getIngredientEntry(spot, ingredient) : null;
        if (!spot || !entry || entry.max <= 0) return null;
        const ratio = entry.current / entry.max;
        return { type: null, ratio, ingredient };
      })
      .filter(Boolean);
    if (ingredientNeeds.length) {
      const low = ingredientNeeds
        .filter((item) => item.ratio <= WORK_RESTOCK_THRESHOLD)
        .sort((a, b) => a.ratio - b.ratio);
      return low[0] || null;
    }
    const candidates = SUPPLY_TYPES.map((type) => {
      const source = getSupplySourceForType ? getSupplySourceForType(type) : null;
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
    getRestockRecipe,
    getSupplyAvailable,
    consumeSupplyFromSource,
    getProducerIngredients,
    getIngredientDestination,
  };
};
