// Pony Parade: rest actions for inn/home.

export const createRestActions = (context) => {
  const {
    mapData,
    housesById,
    houseStates,
    innObject,
    innSleepSpots,
    claimInnSpot,
    claimHouseSpot,
    getHouseTargetPoint,
  } = context;

  const handleInnRest = (actor, now, position, startedFlags) => {
    const skipAutoRest =
      actor.task &&
      (actor.task.manual || actor.task.urgent) &&
      actor.task.type !== "rest";
    if (
      !innObject ||
      startedFlags.startedEating ||
      startedFlags.startedDrinking ||
      startedFlags.startedFun ||
      startedFlags.startedWorking ||
      startedFlags.startedHealing ||
      startedFlags.startedRepairing ||
      skipAutoRest
    ) {
      return false;
    }
    const innX = innObject.at.x * mapData.meta.tileSize;
    const innY = innObject.at.y * mapData.meta.tileSize;
    const distToInn = Math.hypot(position.x - innX, position.y - innY);
    const sleepRadiusTiles = innObject.sleepRadius || 0.6;
    const sleepRadius = mapData.meta.tileSize * sleepRadiusTiles;
    const forceRestAtInn = actor.task && actor.task.type === "rest" && actor.task.inn;
    if (distToInn >= sleepRadius || now <= actor.innCooldownUntil) return false;
    const tirednessLevel = Number.isFinite(actor.stats.tiredness)
      ? actor.stats.tiredness
      : 35;
    const restChance = forceRestAtInn
      ? 1
      : Math.min(0.9, Math.max(0.15, tirednessLevel / 100));
    if (!forceRestAtInn && Math.random() > restChance) {
      actor.innCooldownUntil = now + 2000 + Math.random() * 2000;
      return false;
    }
    const homeState = actor.homeId ? houseStates.get(actor.homeId) : null;
    const canRestAtHome =
      actor.homeId &&
      housesById.has(actor.homeId) &&
      homeState &&
      homeState.status !== "repairing" &&
      homeState.status !== "desperately_needs_repair" &&
      homeState.status !== "under_construction";
    if (!forceRestAtInn && canRestAtHome && Math.random() < 0.9) {
      actor.innCooldownUntil = now + 2000 + Math.random() * 2000;
      return false;
    }
    const spotIndex = claimInnSpot();
    if (spotIndex !== null) {
      const napTime = 2000 + Math.random() * 3000;
      actor.sleepSpotIndex = spotIndex;
      actor.sleepOffset = innSleepSpots[spotIndex];
      actor.sleepSpotOwner = { kind: "inn", id: "inn" };
      actor.restTarget = { kind: "inn", id: "inn" };
      actor.sleepUntil = now + napTime;
      actor.innCooldownUntil = actor.sleepUntil + 8000 + Math.random() * 4000;
      actor.frameIndex = 0;
      actor.lastFrame = 0;
      actor.stats.tiredness = 0;
      if (forceRestAtInn) {
        actor.task = null;
      }
      return true;
    }
    actor.innCooldownUntil = now + 3000 + Math.random() * 2000;
    return false;
  };

  const handleHomeRest = (actor, now, position, startedFlags) => {
    const skipAutoRest =
      actor.task &&
      (actor.task.manual || actor.task.urgent) &&
      actor.task.type !== "rest";
    const skipHomeRest =
      actor.task &&
      (actor.task.manual || actor.task.urgent) &&
      actor.task.type === "rest" &&
      actor.task.inn;
    if (
      !actor.homeId ||
      startedFlags.startedEating ||
      startedFlags.startedDrinking ||
      startedFlags.startedFun ||
      startedFlags.startedWorking ||
      startedFlags.startedHealing ||
      startedFlags.startedRepairing ||
      skipAutoRest ||
      skipHomeRest
    ) {
      return false;
    }
    const house = housesById.get(actor.homeId);
    const state = house ? houseStates.get(actor.homeId) : null;
    if (!house || !state) return false;
    const accessPoint = getHouseTargetPoint(actor.homeId);
    const homeX = accessPoint ? accessPoint.x : house.at.x * mapData.meta.tileSize;
    const homeY = accessPoint ? accessPoint.y : house.at.y * mapData.meta.tileSize;
    const distToHome = Math.hypot(position.x - homeX, position.y - homeY);
    const restRadiusTiles = house.restRadius || 0.9;
    const restRadius = mapData.meta.tileSize * restRadiusTiles;
    if (
      distToHome >= restRadius ||
      now <= actor.homeCooldownUntil ||
      state.status === "repairing" ||
      state.status === "desperately_needs_repair" ||
      state.status === "under_construction"
    ) {
      return false;
    }
    const spot = claimHouseSpot(actor.homeId);
    if (spot) {
      const napTime = 2500 + Math.random() * 3500;
      actor.sleepSpotIndex = spot.index;
      actor.sleepOffset = spot.offset;
      actor.sleepSpotOwner = { kind: "house", id: actor.homeId };
      actor.restTarget = { kind: "house", id: actor.homeId };
      actor.sleepUntil = now + napTime;
      actor.homeCooldownUntil = actor.sleepUntil + 9000 + Math.random() * 5000;
      actor.frameIndex = 0;
      actor.lastFrame = 0;
      actor.stats.health = Math.min(100, actor.stats.health + 6);
      actor.stats.tiredness = 0;
      if (actor.task && actor.task.type === "rest") {
        actor.task = null;
      }
      return true;
    }
    actor.homeCooldownUntil = now + 2500 + Math.random() * 2000;
    return false;
  };

  return { handleInnRest, handleHomeRest };
};
