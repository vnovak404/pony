// Pony Parade: access point helpers.

export const createAccessPoints = ({
  mapData,
  innObject,
  houseObjects,
  foodSpots,
  drinkSpots,
  funSpots,
  healthSpots,
  supplySpots,
  isFoodSpot,
  isDrinkSpot,
  isFunSpot,
  isHealthSpot,
  isSupplySpot,
  isInnObject,
  computeAccessPoint,
  updateLakeState,
}) => {
  let innAccessPoint = null;
  const houseAccessPoints = new Map();
  const foodAccessPoints = new Map();
  const drinkAccessPoints = new Map();
  const funAccessPoints = new Map();
  const healthAccessPoints = new Map();
  const supplyAccessPoints = new Map();

  const updateInnAccessPoint = () => {
    if (!innObject || !innObject.at) {
      innAccessPoint = null;
      return;
    }
    const target = {
      x: innObject.at.x * mapData.meta.tileSize,
      y: innObject.at.y * mapData.meta.tileSize,
    };
    innAccessPoint = computeAccessPoint(target);
  };
  updateInnAccessPoint();
  const getInnTargetPoint = () => innAccessPoint;

  const buildHouseAccessPoints = () => {
    houseObjects.forEach((house) => {
      const target = {
        x: house.at.x * mapData.meta.tileSize,
        y: house.at.y * mapData.meta.tileSize,
      };
      houseAccessPoints.set(house.id, computeAccessPoint(target));
    });
  };
  buildHouseAccessPoints();

  const getHouseTargetPoint = (houseId) => {
    return houseAccessPoints.get(houseId) || null;
  };

  const buildFoodAccessPoints = () => {
    foodSpots.forEach((spot) => {
      const target = {
        x: spot.at.x * mapData.meta.tileSize,
        y: spot.at.y * mapData.meta.tileSize,
      };
      foodAccessPoints.set(spot.id, computeAccessPoint(target));
    });
  };
  buildFoodAccessPoints();

  const getFoodTargetPoint = (foodId) => {
    return foodAccessPoints.get(foodId) || null;
  };

  const buildDrinkAccessPoints = () => {
    drinkSpots.forEach((spot) => {
      const target = {
        x: spot.at.x * mapData.meta.tileSize,
        y: spot.at.y * mapData.meta.tileSize,
      };
      drinkAccessPoints.set(spot.id, computeAccessPoint(target));
    });
  };
  buildDrinkAccessPoints();

  const getDrinkTargetPoint = (drinkId) => {
    return drinkAccessPoints.get(drinkId) || null;
  };

  const buildFunAccessPoints = () => {
    funSpots.forEach((spot) => {
      const target = {
        x: spot.at.x * mapData.meta.tileSize,
        y: spot.at.y * mapData.meta.tileSize,
      };
      funAccessPoints.set(spot.id, computeAccessPoint(target));
    });
  };
  buildFunAccessPoints();

  const getFunTargetPoint = (funId) => {
    return funAccessPoints.get(funId) || null;
  };

  const buildHealthAccessPoints = () => {
    healthSpots.forEach((spot) => {
      const target = {
        x: spot.at.x * mapData.meta.tileSize,
        y: spot.at.y * mapData.meta.tileSize,
      };
      healthAccessPoints.set(spot.id, computeAccessPoint(target));
    });
  };
  buildHealthAccessPoints();

  const getHealthTargetPoint = (healthId) => {
    return healthAccessPoints.get(healthId) || null;
  };

  const buildSupplyAccessPoints = () => {
    supplySpots.forEach((spot) => {
      if (!spot || !spot.at) return;
      const target = {
        x: spot.at.x * mapData.meta.tileSize,
        y: spot.at.y * mapData.meta.tileSize,
      };
      supplyAccessPoints.set(spot.id, computeAccessPoint(target));
    });
  };
  buildSupplyAccessPoints();

  const getSupplyTargetPoint = (supplyId) => {
    return supplyAccessPoints.get(supplyId) || null;
  };

  const getSupplySpotAccessPoint = (spot) => {
    if (!spot) return null;
    return (
      getSupplyTargetPoint(spot.id) || {
        x: spot.at.x * mapData.meta.tileSize,
        y: spot.at.y * mapData.meta.tileSize,
      }
    );
  };

  const getFoodSpotAccessPoint = (spot) => {
    return (
      getFoodTargetPoint(spot.id) || {
        x: spot.at.x * mapData.meta.tileSize,
        y: spot.at.y * mapData.meta.tileSize,
      }
    );
  };
  const getDrinkSpotAccessPoint = (spot) => {
    return (
      getDrinkTargetPoint(spot.id) || {
        x: spot.at.x * mapData.meta.tileSize,
        y: spot.at.y * mapData.meta.tileSize,
      }
    );
  };
  const getFunSpotAccessPoint = (spot) => {
    return (
      getFunTargetPoint(spot.id) || {
        x: spot.at.x * mapData.meta.tileSize,
        y: spot.at.y * mapData.meta.tileSize,
      }
    );
  };
  const getHealthSpotAccessPoint = (spot) => {
    return (
      getHealthTargetPoint(spot.id) || {
        x: spot.at.x * mapData.meta.tileSize,
        y: spot.at.y * mapData.meta.tileSize,
      }
    );
  };

  const updateAccessPointForItem = (item) => {
    if (!item || !item.at) return;
    const target = {
      x: item.at.x * mapData.meta.tileSize,
      y: item.at.y * mapData.meta.tileSize,
    };
    if (item.kind === "house") {
      houseAccessPoints.set(item.id, computeAccessPoint(target));
    }
    if (isFoodSpot(item)) {
      foodAccessPoints.set(item.id, computeAccessPoint(target));
    }
    if (isDrinkSpot(item)) {
      drinkAccessPoints.set(item.id, computeAccessPoint(target));
    }
    if (isFunSpot(item)) {
      funAccessPoints.set(item.id, computeAccessPoint(target));
    }
    if (isHealthSpot(item)) {
      healthAccessPoints.set(item.id, computeAccessPoint(target));
    }
    if (isSupplySpot(item)) {
      supplyAccessPoints.set(item.id, computeAccessPoint(target));
    }
    if (isInnObject(item)) {
      innAccessPoint = computeAccessPoint(target);
    }
    updateLakeState(item);
  };

  return {
    getInnTargetPoint,
    getHouseTargetPoint,
    getFoodTargetPoint,
    getDrinkTargetPoint,
    getFunTargetPoint,
    getHealthTargetPoint,
    getSupplyTargetPoint,
    getSupplySpotAccessPoint,
    getFoodSpotAccessPoint,
    getDrinkSpotAccessPoint,
    getFunSpotAccessPoint,
    getHealthSpotAccessPoint,
    updateAccessPointForItem,
  };
};
