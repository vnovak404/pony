// Pony Parade: house state helpers.

export const createHouseState = ({ mapData, objects, runtimeState, config }) => {
  const {
    HOUSE_REPAIR_THRESHOLD,
    HOUSE_CONSTRUCTION_THRESHOLD,
    HOUSE_REPAIR_RATE,
    HOUSE_DECAY_RATE,
  } = config;
  const houseObjects = objects.filter((item) => item.kind === "house");
  const housesById = new Map(houseObjects.map((item) => [item.id, item]));
  const houseStates = new Map();
  const runtimeHouses = runtimeState && runtimeState.houses ? runtimeState.houses : {};
  const nowTimestamp = Date.now();
  houseObjects.forEach((house) => {
    const saved =
      runtimeHouses && typeof runtimeHouses === "object"
        ? runtimeHouses[house.id]
        : null;
    const condition = saved && Number.isFinite(saved.condition) ? saved.condition : 1;
    const status = saved && typeof saved.status === "string" ? saved.status : "ok";
    const repairingUntil =
      saved && Number.isFinite(saved.repairingUntil) ? saved.repairingUntil : 0;
    let normalizedStatus = status;
    let normalizedCondition = condition;
    if (normalizedStatus === "under_construction") {
      normalizedStatus = "desperately_needs_repair";
    }
    if (normalizedStatus === "repairing" && repairingUntil && nowTimestamp > repairingUntil) {
      normalizedStatus = "ok";
      normalizedCondition = 1;
    }
    houseStates.set(house.id, {
      condition: Math.min(1, Math.max(0, normalizedCondition)),
      status: normalizedStatus,
      repairingUntil: normalizedStatus === "repairing" ? repairingUntil : 0,
      repairingBy: null,
    });
  });

  const formatHouseStatus = (state) => {
    if (!state) return "ok";
    if (
      state.status === "desperately_needs_repair" ||
      state.status === "under_construction"
    ) {
      return "Ruined";
    }
    if (state.status === "needs_repair") return "needs repair";
    if (state.status === "repairing") return "repairing";
    return "ok";
  };

  const innSleepSpots = (() => {
    const base = mapData.meta.tileSize * 0.28;
    return [
      { x: -base, y: -base },
      { x: base, y: -base },
      { x: -base * 1.8, y: 0 },
      { x: base * 1.8, y: 0 },
      { x: -base, y: base * 1.2 },
      { x: base, y: base * 1.2 },
      { x: 0, y: base * 1.6 },
      { x: 0, y: -base * 1.6 },
      { x: -base * 1.4, y: base * 1.8 },
      { x: base * 1.4, y: base * 1.8 },
    ];
  })();
  const innSleepUsage = new Array(innSleepSpots.length).fill(false);
  const claimInnSpot = () => {
    for (let i = 0; i < innSleepUsage.length; i += 1) {
      if (!innSleepUsage[i]) {
        innSleepUsage[i] = true;
        return i;
      }
    }
    return null;
  };
  const releaseInnSpot = (index) => {
    if (index === null || index === undefined) return;
    innSleepUsage[index] = false;
  };

  const houseSleepSpots = new Map();
  const houseSleepUsage = new Map();
  const getHouseSpots = (houseId) => {
    if (!houseSleepSpots.has(houseId)) {
      const base = mapData.meta.tileSize * 0.24;
      houseSleepSpots.set(houseId, [
        { x: -base, y: -base * 0.6 },
        { x: base, y: -base * 0.6 },
        { x: -base * 1.4, y: base * 0.4 },
        { x: base * 1.4, y: base * 0.4 },
        { x: 0, y: base * 1.2 },
        { x: 0, y: -base * 1.2 },
      ]);
    }
    return houseSleepSpots.get(houseId);
  };
  const claimHouseSpot = (houseId) => {
    const spots = getHouseSpots(houseId);
    if (!houseSleepUsage.has(houseId)) {
      houseSleepUsage.set(houseId, new Array(spots.length).fill(false));
    }
    const usage = houseSleepUsage.get(houseId);
    for (let i = 0; i < usage.length; i += 1) {
      if (!usage[i]) {
        usage[i] = true;
        return { index: i, offset: spots[i] };
      }
    }
    return null;
  };
  const releaseHouseSpot = (houseId, index) => {
    if (!houseSleepUsage.has(houseId)) return;
    const usage = houseSleepUsage.get(houseId);
    if (index === null || index === undefined) return;
    usage[index] = false;
  };

  const findRepairTarget = ({ allowHealthy = false } = {}) => {
    let target = null;
    let fallback = null;
    let lowest = 1;
    let fallbackLowest = 1;
    houseObjects.forEach((house) => {
      const state = houseStates.get(house.id);
      if (!state) return;
      if (state.status === "repairing") return;
      if (state.condition < HOUSE_REPAIR_THRESHOLD && state.condition < lowest) {
        lowest = state.condition;
        target = house;
      }
      if (allowHealthy && state.condition < fallbackLowest) {
        fallbackLowest = state.condition;
        fallback = house;
      }
    });
    return target || (allowHealthy ? fallback : null);
  };

  const updateHouseStates = (delta, now) => {
    houseStates.forEach((state) => {
      if (state.status === "repairing") {
        state.condition = Math.min(1, state.condition + delta * HOUSE_REPAIR_RATE);
        const hasRepairTimer =
          Number.isFinite(state.repairingUntil) && state.repairingUntil > 0;
        if (
          (hasRepairTimer && now >= state.repairingUntil) ||
          (!hasRepairTimer && state.condition >= 0.98)
        ) {
          state.condition = 1;
          state.status = "ok";
          state.repairingUntil = 0;
          state.repairingBy = null;
        }
        return;
      }
      state.condition = Math.max(0, state.condition - delta * HOUSE_DECAY_RATE);
      if (state.condition < HOUSE_CONSTRUCTION_THRESHOLD) {
        state.status = "desperately_needs_repair";
      } else if (state.condition < HOUSE_REPAIR_THRESHOLD) {
        state.status = "needs_repair";
      } else {
        state.status = "ok";
      }
    });
  };

  return {
    houseObjects,
    housesById,
    houseStates,
    formatHouseStatus,
    innSleepSpots,
    claimInnSpot,
    releaseInnSpot,
    getHouseSpots,
    claimHouseSpot,
    releaseHouseSpot,
    findRepairTarget,
    updateHouseStates,
  };
};
