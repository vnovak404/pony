// Pony Parade: need prioritization helpers.

export const createNeedHelpers = ({
  locationIndex,
  foodSpots,
  drinkSpots,
  funSpots,
  healthSpots,
  getFoodSpotAccessPoint,
  getDrinkSpotAccessPoint,
  getFunSpotAccessPoint,
  getHealthSpotAccessPoint,
  isSpotStocked,
  houseStates,
  innObject,
  getInnTargetPoint,
  CRITICAL_HEALTH_LEVEL,
  CRITICAL_NEED_LEVEL,
}) => {
  const NEED_PRIORITY = ["health", "thirst", "hunger", "tired", "boredom"];
  const NEED_WASH_MARGIN = 6;

  const needPriorityRank = new Map(
    NEED_PRIORITY.map((need, index) => [need, index])
  );
  const pickNeedCandidate = (candidates) => {
    if (!candidates.length) return null;
    const sorted = candidates.slice().sort((a, b) => b.level - a.level);
    const topLevel = sorted[0].level;
    const nearTop = sorted.filter((item) => topLevel - item.level <= NEED_WASH_MARGIN);
    if (nearTop.length === 1) return nearTop[0];
    return nearTop
      .slice()
      .sort((a, b) => {
        const rankA = needPriorityRank.get(a.need) ?? 999;
        const rankB = needPriorityRank.get(b.need) ?? 999;
        if (rankA !== rankB) return rankA - rankB;
        return b.level - a.level;
      })[0];
  };

  const normalizeText = (value) => String(value || "").trim().toLowerCase();
  const normalizePreferenceList = (preference) => {
    if (!preference) return [];
    if (Array.isArray(preference)) {
      return preference.map((item) => normalizeText(item)).filter(Boolean);
    }
    if (typeof preference === "string") {
      return preference
        .split(",")
        .map((item) => normalizeText(item))
        .filter(Boolean);
    }
    return [];
  };
  const matchesSpotPreference = (spot, preferences) => {
    const list = normalizePreferenceList(preferences);
    if (!list.length) return false;
    const location = spot.locationId ? locationIndex.get(spot.locationId) : null;
    const tokens = new Set([
      normalizeText(spot.id),
      normalizeText(spot.kind),
      normalizeText(spot.locationId),
    ]);
    if (Array.isArray(spot.drives)) {
      spot.drives.forEach((drive) => tokens.add(normalizeText(drive)));
    }
    if (location) {
      tokens.add(normalizeText(location.name));
      if (Array.isArray(location.tags)) {
        location.tags.forEach((tag) => tokens.add(normalizeText(tag)));
      }
    }
    return list.some((pref) => {
      if (!pref) return false;
      if (tokens.has(pref)) return true;
      if (location && normalizeText(location.name).includes(pref)) return true;
      return false;
    });
  };

  const pickFoodSpot = (actor, position) => {
    if (!foodSpots.length) return null;
    const availableSpots = foodSpots.filter((spot) => isSpotStocked(spot));
    if (!availableSpots.length) return null;
    const preferences = normalizePreferenceList(actor.foodPreference);
    const scored = availableSpots
      .map((spot) => {
        const accessPoint = getFoodSpotAccessPoint(spot);
        let score = Math.hypot(
          accessPoint.x - position.x,
          accessPoint.y - position.y
        );
        if (preferences.length) {
          score *= matchesSpotPreference(spot, preferences) ? 0.75 : 1.2;
        }
        return { spot, score };
      })
      .sort((a, b) => a.score - b.score);
    if (!scored.length) return null;
    const pickFrom = scored.slice(0, Math.min(2, scored.length));
    return pickFrom[Math.floor(Math.random() * pickFrom.length)].spot;
  };

  const pickDrinkSpot = (actor, position) => {
    if (!drinkSpots.length) return null;
    const availableSpots = drinkSpots.filter((spot) => isSpotStocked(spot));
    if (!availableSpots.length) return null;
    const preferences = normalizePreferenceList(actor.drinkPreference);
    const scored = availableSpots
      .map((spot) => {
        const accessPoint = getDrinkSpotAccessPoint(spot);
        let score = Math.hypot(
          accessPoint.x - position.x,
          accessPoint.y - position.y
        );
        if (preferences.length) {
          score *= matchesSpotPreference(spot, preferences) ? 0.75 : 1.2;
        }
        return { spot, score };
      })
      .sort((a, b) => a.score - b.score);
    if (!scored.length) return null;
    const pickFrom = scored.slice(0, Math.min(2, scored.length));
    return pickFrom[Math.floor(Math.random() * pickFrom.length)].spot;
  };

  const pickFunSpot = (actor, position) => {
    if (!funSpots.length) return null;
    const availableSpots = funSpots.filter((spot) => isSpotStocked(spot));
    if (!availableSpots.length) return null;
    const applyFunChance = (spots) => {
      const filtered = spots.filter((spot) => {
        const chance = Number.isFinite(spot.funChance) ? spot.funChance : 1;
        if (chance >= 1) return true;
        if (chance <= 0) return false;
        return Math.random() <= chance;
      });
      return filtered.length ? filtered : spots;
    };
    const eligibleSpots = applyFunChance(availableSpots);
    const scored = eligibleSpots
      .map((spot) => {
        const accessPoint = getFunSpotAccessPoint(spot);
        const score = Math.hypot(
          accessPoint.x - position.x,
          accessPoint.y - position.y
        );
        return { spot, score };
      })
      .sort((a, b) => a.score - b.score);
    if (!scored.length) return null;
    const pickFrom = scored.slice(0, Math.min(2, scored.length));
    return pickFrom[Math.floor(Math.random() * pickFrom.length)].spot;
  };

  const pickHealthSpot = (actor, position) => {
    if (!healthSpots.length) return null;
    const scored = healthSpots
      .map((spot) => {
        const accessPoint = getHealthSpotAccessPoint(spot);
        const score = Math.hypot(
          accessPoint.x - position.x,
          accessPoint.y - position.y
        );
        return { spot, score };
      })
      .sort((a, b) => a.score - b.score);
    if (!scored.length) return null;
    const pickFrom = scored.slice(0, Math.min(2, scored.length));
    return pickFrom[Math.floor(Math.random() * pickFrom.length)].spot;
  };

  const getCriticalNeedTask = (actor, position) => {
    const healthLevel = Number.isFinite(actor.stats.health)
      ? actor.stats.health
      : 100;
    if (healthLevel <= CRITICAL_HEALTH_LEVEL && healthSpots.length) {
      const target = pickHealthSpot(actor, position);
      if (target) {
        actor.vetCooldownUntil = 0;
        return { type: "vet", clinicId: target.id, urgent: true };
      }
    }
    if (actor.stats.thirst >= CRITICAL_NEED_LEVEL && drinkSpots.length) {
      const target = pickDrinkSpot(actor, position);
      if (target) {
        actor.drinkCooldownUntil = 0;
        return { type: "drink", drinkId: target.id, urgent: true };
      }
    }
    if (actor.stats.hunger >= CRITICAL_NEED_LEVEL && foodSpots.length) {
      const target = pickFoodSpot(actor, position);
      if (target) {
        actor.eatCooldownUntil = 0;
        return { type: "eat", foodId: target.id, urgent: true };
      }
    }
    if (actor.stats.tiredness >= CRITICAL_NEED_LEVEL) {
      const homeId = actor.homeId;
      const state = homeId ? houseStates.get(homeId) : null;
      if (
        homeId &&
        state &&
        state.status !== "repairing" &&
        state.status !== "desperately_needs_repair" &&
        state.status !== "under_construction"
      ) {
        actor.homeCooldownUntil = 0;
        return { type: "rest", houseId: homeId, urgent: true };
      }
      if (innObject && getInnTargetPoint()) {
        actor.innCooldownUntil = 0;
        return { type: "rest", inn: true, urgent: true };
      }
    }
    if (actor.stats.boredom >= CRITICAL_NEED_LEVEL && funSpots.length) {
      const target = pickFunSpot(actor, position);
      if (target) {
        actor.funCooldownUntil = 0;
        return { type: "fun", funId: target.id, urgent: true };
      }
    }
    return null;
  };

  return {
    pickNeedCandidate,
    normalizePreferenceList,
    matchesSpotPreference,
    pickFoodSpot,
    pickDrinkSpot,
    pickFunSpot,
    pickHealthSpot,
    getCriticalNeedTask,
  };
};
