// Pony Parade: spot categorization helpers.

export const createSpotHelpers = (locationIndex) => {
  const getSupplyTypesForSpot = (item) => {
    if (!item) return [];
    if (Array.isArray(item.supplyTypes)) {
      return item.supplyTypes.map((type) => String(type)).filter(Boolean);
    }
    if (item.supplyType) {
      return [String(item.supplyType)];
    }
    return [];
  };
  const isSupplySource = (item) => Boolean(item && item.supplyRole === "source");
  const isSupplyProducer = (item) => Boolean(item && item.supplyRole === "producer");
  const isSupplySpot = (item) => Boolean(item && (isSupplySource(item) || isSupplyProducer(item)));
  const isFoodSpot = (item) => {
    if (!item) return false;
    if (isSupplySpot(item)) return false;
    if (item.kind === "food") return true;
    if (Array.isArray(item.drives) && item.drives.includes("eat")) return true;
    const location = item.locationId && locationIndex.get(item.locationId);
    if (location && Array.isArray(location.tags)) {
      return location.tags.some((tag) => String(tag).toLowerCase() === "food");
    }
    return false;
  };
  const isDrinkSpot = (item) => {
    if (!item) return false;
    if (isSupplySpot(item)) return false;
    if (item.kind === "drink") return true;
    if (Array.isArray(item.drives) && item.drives.includes("drink")) return true;
    const location = item.locationId && locationIndex.get(item.locationId);
    if (location && Array.isArray(location.tags)) {
      return location.tags.some((tag) => String(tag).toLowerCase() === "drink");
    }
    return false;
  };
  const FUN_TAGS = new Set([
    "recreation",
    "sport",
    "music",
    "park",
    "community",
    "fun",
  ]);
  const HEALTH_TAGS = new Set(["health", "care", "clinic", "vet"]);
  const isFunSpot = (item) => {
    if (!item) return false;
    if (isSupplySource(item)) return false;
    if (Array.isArray(item.drives) && item.drives.includes("fun")) return true;
    const location = item.locationId && locationIndex.get(item.locationId);
    if (location && Array.isArray(location.tags)) {
      return location.tags.some((tag) => FUN_TAGS.has(String(tag).toLowerCase()));
    }
    return false;
  };
  const isInventorySpot = (item) =>
    Boolean(
      item &&
        (isFoodSpot(item) ||
          isDrinkSpot(item) ||
          isFunSpot(item))
    );
  const isHealthSpot = (item) => {
    if (!item) return false;
    if (item.kind === "clinic") return true;
    if (Array.isArray(item.drives) && item.drives.includes("health")) return true;
    const location = item.locationId && locationIndex.get(item.locationId);
    if (location && Array.isArray(location.tags)) {
      return location.tags.some((tag) => HEALTH_TAGS.has(String(tag).toLowerCase()));
    }
    return false;
  };

  return {
    getSupplyTypesForSpot,
    isSupplySource,
    isSupplyProducer,
    isSupplySpot,
    isFoodSpot,
    isDrinkSpot,
    isFunSpot,
    isInventorySpot,
    isHealthSpot,
  };
};

export const createSpotIndex = ({ objects, getSpotInventory, helpers }) => {
  const {
    isFoodSpot,
    isDrinkSpot,
    isFunSpot,
    isSupplySpot,
    isSupplySource,
    isSupplyProducer,
    isHealthSpot,
  } = helpers;
  const foodSpots = objects.filter((item) => isFoodSpot(item));
  const foodSpotById = new Map(foodSpots.map((spot) => [spot.id, spot]));
  const drinkSpots = objects.filter((item) => isDrinkSpot(item));
  const drinkSpotById = new Map(drinkSpots.map((spot) => [spot.id, spot]));
  const funSpots = objects.filter((item) => isFunSpot(item));
  const funSpotById = new Map(funSpots.map((spot) => [spot.id, spot]));
  const supplySpots = objects.filter((item) => isSupplySpot(item));
  const supplySources = supplySpots.filter((item) => isSupplySource(item));
  const supplyProducers = supplySpots.filter((item) => isSupplyProducer(item));
  const spotByLocationId = new Map();
  const registerSpotLocation = (spot) => {
    if (!spot || !spot.locationId) return;
    if (!spotByLocationId.has(spot.locationId)) {
      spotByLocationId.set(spot.locationId, spot);
    }
  };
  foodSpots.forEach((spot) => {
    registerSpotLocation(spot);
    getSpotInventory(spot);
  });
  drinkSpots.forEach((spot) => {
    registerSpotLocation(spot);
    getSpotInventory(spot);
  });
  funSpots.forEach((spot) => {
    registerSpotLocation(spot);
    getSpotInventory(spot);
  });
  supplySources.forEach((spot) => {
    registerSpotLocation(spot);
    getSpotInventory(spot);
  });
  supplyProducers.forEach((spot) => {
    registerSpotLocation(spot);
  });
  const healthSpots = objects.filter((item) => isHealthSpot(item));
  const healthSpotById = new Map(healthSpots.map((spot) => [spot.id, spot]));

  return {
    foodSpots,
    foodSpotById,
    drinkSpots,
    drinkSpotById,
    funSpots,
    funSpotById,
    supplySpots,
    supplySources,
    supplyProducers,
    healthSpots,
    healthSpotById,
    spotByLocationId,
  };
};
