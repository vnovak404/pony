// Pony Parade: need-based actions (eat, drink, fun, vet).

export const createNeedActions = (context) => {
  const {
    mapData,
    foodSpotById,
    drinkSpotById,
    funSpotById,
    healthSpotById,
    getFoodSpotAccessPoint,
    getDrinkSpotAccessPoint,
    getFunSpotAccessPoint,
    getHealthSpotAccessPoint,
    consumeSpotInventory,
    getSpotOffset,
    EAT_RADIUS_TILES,
    EAT_DURATION_MIN,
    EAT_DURATION_MAX,
    EAT_COOLDOWN_MIN,
    EAT_COOLDOWN_MAX,
    DRINK_RADIUS_TILES,
    DRINK_DURATION_MIN,
    DRINK_DURATION_MAX,
    DRINK_COOLDOWN_MIN,
    DRINK_COOLDOWN_MAX,
    FUN_RADIUS_TILES,
    FUN_DURATION_MIN,
    FUN_DURATION_MAX,
    FUN_COOLDOWN_MIN,
    FUN_COOLDOWN_MAX,
    VET_RADIUS_TILES,
    VET_DURATION_MIN,
    VET_DURATION_MAX,
    VET_COOLDOWN_MIN,
    VET_COOLDOWN_MAX,
  } = context;

  const handleEatTask = (actor, now, position, vfxByKey, vfxVideos) => {
    if (!actor.task || actor.task.type !== "eat") return false;
    const spot = foodSpotById.get(actor.task.foodId);
    if (!spot) return false;
    const accessPoint = getFoodSpotAccessPoint(spot);
    const foodX = accessPoint.x;
    const foodY = accessPoint.y;
    const distToFood = Math.hypot(position.x - foodX, position.y - foodY);
    const eatRadiusTiles = spot.eatRadius || EAT_RADIUS_TILES;
    const eatRadius = mapData.meta.tileSize * eatRadiusTiles;
    if (distToFood >= eatRadius || now <= actor.eatCooldownUntil) return false;
    if (!consumeSpotInventory(spot, 1)) {
      actor.eatCooldownUntil = now + 1500 + Math.random() * 1000;
      actor.task = null;
      return false;
    }
    let eatDuration =
      EAT_DURATION_MIN + Math.random() * (EAT_DURATION_MAX - EAT_DURATION_MIN);
    const vfxEntry = vfxByKey.get(`${actor.sprite?.pony?.slug}:eat`);
    const vfxVideo = vfxEntry ? vfxVideos.get(vfxEntry.id) : null;
    if (vfxVideo && Number.isFinite(vfxVideo.duration) && vfxVideo.duration > 0) {
      eatDuration = vfxVideo.duration * 1000;
    }
    actor.eatUntil = now + eatDuration;
    actor.eatCooldownUntil =
      actor.eatUntil + EAT_COOLDOWN_MIN + Math.random() * (EAT_COOLDOWN_MAX - EAT_COOLDOWN_MIN);
    actor.eatTargetId = spot.id;
    actor.eatOffset = {
      x: (Math.random() - 0.5) * mapData.meta.tileSize * 0.2,
      y: (Math.random() - 0.5) * mapData.meta.tileSize * 0.2,
    };
    actor.frameIndex = 0;
    actor.lastFrame = 0;
    actor.stats.hunger = 0;
    actor.task = null;
    return true;
  };

  const handleDrinkTask = (actor, now, position) => {
    if (!actor.task || actor.task.type !== "drink") return false;
    const spot = drinkSpotById.get(actor.task.drinkId);
    if (!spot) return false;
    const accessPoint = getDrinkSpotAccessPoint(spot);
    const drinkX = accessPoint.x;
    const drinkY = accessPoint.y;
    const distToDrink = Math.hypot(position.x - drinkX, position.y - drinkY);
    const drinkRadiusTiles = spot.drinkRadius || DRINK_RADIUS_TILES;
    const drinkRadius = mapData.meta.tileSize * drinkRadiusTiles;
    if (distToDrink >= drinkRadius || now <= actor.drinkCooldownUntil) return false;
    if (!consumeSpotInventory(spot, 1)) {
      actor.drinkCooldownUntil = now + 1500 + Math.random() * 1000;
      actor.task = null;
      return false;
    }
    const drinkDuration =
      DRINK_DURATION_MIN + Math.random() * (DRINK_DURATION_MAX - DRINK_DURATION_MIN);
    actor.drinkUntil = now + drinkDuration;
    actor.drinkCooldownUntil =
      actor.drinkUntil +
      DRINK_COOLDOWN_MIN +
      Math.random() * (DRINK_COOLDOWN_MAX - DRINK_COOLDOWN_MIN);
    actor.drinkTargetId = spot.id;
    actor.drinkOffset = {
      x: (Math.random() - 0.5) * mapData.meta.tileSize * 0.2,
      y: (Math.random() - 0.5) * mapData.meta.tileSize * 0.2,
    };
    actor.frameIndex = 0;
    actor.lastFrame = 0;
    actor.stats.thirst = 0;
    actor.task = null;
    return true;
  };

  const handleFunTask = (actor, now, position) => {
    if (!actor.task || actor.task.type !== "fun") return false;
    const spot = funSpotById.get(actor.task.funId);
    if (!spot) return false;
    const accessPoint = getFunSpotAccessPoint(spot);
    const funX = accessPoint.x;
    const funY = accessPoint.y;
    const distToFun = Math.hypot(position.x - funX, position.y - funY);
    const funRadiusTiles = spot.funRadius || FUN_RADIUS_TILES;
    const funRadius = mapData.meta.tileSize * funRadiusTiles;
    if (distToFun >= funRadius || now <= actor.funCooldownUntil) return false;
    if (!consumeSpotInventory(spot, 1)) {
      actor.funCooldownUntil = now + 1500 + Math.random() * 1000;
      actor.task = null;
      return false;
    }
    const baseOffset = getSpotOffset(spot, "funOffset");
    const funDuration =
      FUN_DURATION_MIN + Math.random() * (FUN_DURATION_MAX - FUN_DURATION_MIN);
    actor.funUntil = now + funDuration;
    actor.funCooldownUntil =
      actor.funUntil +
      FUN_COOLDOWN_MIN +
      Math.random() * (FUN_COOLDOWN_MAX - FUN_COOLDOWN_MIN);
    actor.funTargetId = spot.id;
    actor.funOffset = {
      x: baseOffset.x + (Math.random() - 0.5) * mapData.meta.tileSize * 0.2,
      y: baseOffset.y + (Math.random() - 0.5) * mapData.meta.tileSize * 0.2,
    };
    actor.frameIndex = 0;
    actor.lastFrame = 0;
    actor.stats.boredom = 0;
    actor.task = null;
    return true;
  };

  const handleVetTask = (actor, now, position) => {
    if (!actor.task || actor.task.type !== "vet") return false;
    const spot = healthSpotById.get(actor.task.clinicId);
    if (!spot) return false;
    const accessPoint = getHealthSpotAccessPoint(spot);
    const healthX = accessPoint.x;
    const healthY = accessPoint.y;
    const distToClinic = Math.hypot(position.x - healthX, position.y - healthY);
    const vetRadiusTiles = spot.vetRadius || VET_RADIUS_TILES;
    const vetRadius = mapData.meta.tileSize * vetRadiusTiles;
    if (distToClinic >= vetRadius || now <= actor.vetCooldownUntil) return false;
    const vetDuration =
      VET_DURATION_MIN + Math.random() * (VET_DURATION_MAX - VET_DURATION_MIN);
    actor.vetUntil = now + vetDuration;
    actor.vetCooldownUntil =
      actor.vetUntil +
      VET_COOLDOWN_MIN +
      Math.random() * (VET_COOLDOWN_MAX - VET_COOLDOWN_MIN);
    actor.vetTargetId = spot.id;
    actor.vetOffset = {
      x: (Math.random() - 0.5) * mapData.meta.tileSize * 0.2,
      y: (Math.random() - 0.5) * mapData.meta.tileSize * 0.2,
    };
    actor.frameIndex = 0;
    actor.lastFrame = 0;
    actor.stats.health = Math.min(100, actor.stats.health + 28);
    actor.task = null;
    return true;
  };

  return {
    handleEatTask,
    handleDrinkTask,
    handleFunTask,
    handleVetTask,
  };
};
