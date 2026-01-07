// Pony Parade: map rendering and interactions.

import { ponyMap, mapStatus, mapTooltip } from "./dom.js";
import { loadImage, loadJson, toTitleCase } from "./utils.js";

const loadRuntimeState = async () => {
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json();
    if (!payload || typeof payload !== "object") return null;
    return payload;
  } catch (error) {
    return null;
  }
};

export const loadMap = async () => {
  if (!ponyMap || !mapStatus) return;
  mapStatus.textContent = "Loading map...";
  try {
    const mapData = await loadJson("/assets/world/maps/ponyville.json");
    const ponyData = await loadJson("/data/ponies.json");
    const runtimeState = await loadRuntimeState();
    let locationData = { locations: [] };
    try {
      locationData = await loadJson("/data/world_locations.json");
    } catch (error) {
      locationData = { locations: [] };
    }
    await initMap(
      mapData,
      ponyData.ponies || [],
      locationData.locations || [],
      runtimeState
    );
  } catch (error) {
    mapStatus.textContent = "Map unavailable. Generate sprites to see ponies move.";
  }
};

async function initMap(mapData, ponies, locations, runtimeState) {
  if (!ponyMap) return;
  const ctx = ponyMap.getContext("2d");
  if (!ctx) return;

  const mapWidth = mapData.meta.width * mapData.meta.tileSize;
  const mapHeight = mapData.meta.height * mapData.meta.tileSize;
  const MAX_ACTORS = 30;
  const ASSET_SCALE = 2;
  const HOUSE_DECAY_RATE = 0.00000025;
  const HOUSE_REPAIR_RATE = 0.0006;
  const HOUSE_REPAIR_THRESHOLD = 0.6;
  const HOUSE_CONSTRUCTION_THRESHOLD = 0.25;
  const HUNGER_RATE = 0.00018;
  const THIRST_RATE = 0.00018;
  const EAT_THRESHOLD_DEFAULT = 60;
  const DRINK_THRESHOLD_DEFAULT = 55;
  const EAT_RADIUS_TILES = 0.65;
  const EAT_DURATION_MIN = 2200;
  const EAT_DURATION_MAX = 3800;
  const EAT_COOLDOWN_MIN = 6000;
  const EAT_COOLDOWN_MAX = 9000;
  const DRINK_RADIUS_TILES = 0.6;
  const DRINK_DURATION_MIN = 1800;
  const DRINK_DURATION_MAX = 3200;
  const DRINK_COOLDOWN_MIN = 5000;
  const DRINK_COOLDOWN_MAX = 8000;
  const MANUAL_SPEED_MULTIPLIER = 1.8;

  const locationIndex = new Map();
  locations.forEach((location) => {
    if (location && location.id) {
      locationIndex.set(location.id, location);
    }
  });

  const getStructureLabel = (item) => {
    if (!item) return "Ponyville";
    const baseLabel = item.label ? item.label : null;
    const location = item.locationId && locationIndex.get(item.locationId);
    const label = baseLabel || location?.name || toTitleCase(item.id);
    const residents = Array.isArray(item.residents)
      ? item.residents.filter(Boolean)
      : [];
    if (residents.length) {
      return `${label} — home of ${residents.join(", ")}`;
    }
    return label;
  };

  const resize = () => {
    const parent = ponyMap.parentElement;
    if (!parent) return;
    const width = parent.clientWidth - 2;
    const scale = width / mapWidth;
    const height = mapHeight * scale;
    const dpr = window.devicePixelRatio || 1;
    ponyMap.width = width * dpr;
    ponyMap.height = height * dpr;
    ponyMap.style.width = `${width}px`;
    ponyMap.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return scale;
  };

  let scale = resize() || 1;
  new ResizeObserver(() => {
    const nextScale = resize();
    if (nextScale) {
      scale = nextScale;
    }
  }).observe(ponyMap.parentElement);

  let labelsEnabled = true;
  const mapLabelToggle = document.getElementById("map-label-toggle");
  if (mapLabelToggle) {
    labelsEnabled = mapLabelToggle.checked;
    mapLabelToggle.addEventListener("change", () => {
      labelsEnabled = mapLabelToggle.checked;
    });
  }

  const roads = (mapData.layers.roads && mapData.layers.roads.segments) || [];
  const objects = mapData.layers.objects || [];
  const innObject =
    objects.find((item) => item.id === "inn" || item.locationId === "moonlit-inn") ||
    null;
  const isInnObject = (item) =>
    Boolean(item && (item.id === "inn" || item.locationId === "moonlit-inn"));
  const isFoodSpot = (item) => {
    if (!item) return false;
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
    if (item.kind === "drink") return true;
    if (Array.isArray(item.drives) && item.drives.includes("drink")) return true;
    const location = item.locationId && locationIndex.get(item.locationId);
    if (location && Array.isArray(location.tags)) {
      return location.tags.some((tag) => String(tag).toLowerCase() === "drink");
    }
    return false;
  };
  const foodSpots = objects.filter((item) => isFoodSpot(item));
  const foodSpotById = new Map(foodSpots.map((spot) => [spot.id, spot]));
  const drinkSpots = objects.filter((item) => isDrinkSpot(item));
  const drinkSpotById = new Map(drinkSpots.map((spot) => [spot.id, spot]));
  const roadSegments = roads.map((segment) => ({
    id: segment.id,
    from: {
      x: segment.from.x * mapData.meta.tileSize,
      y: segment.from.y * mapData.meta.tileSize,
    },
    to: {
      x: segment.to.x * mapData.meta.tileSize,
      y: segment.to.y * mapData.meta.tileSize,
    },
  }));

  const endpointKey = (point) => `${point.x},${point.y}`;
  const endpointIndex = new Map();
  const addEndpoint = (point, segment, end) => {
    const key = endpointKey(point);
    if (!endpointIndex.has(key)) {
      endpointIndex.set(key, []);
    }
    endpointIndex.get(key).push({ segment, end });
  };

  roadSegments.forEach((segment) => {
    addEndpoint(segment.from, segment, "from");
    addEndpoint(segment.to, segment, "to");
  });

  const isOffMap = (point) =>
    point.x < 0 || point.x > mapWidth || point.y < 0 || point.y > mapHeight;

  const lakeObject =
    objects.find(
      (item) => item.id === "silver-lake" || item.locationId === "silver-lake"
    ) || null;
  let lakePoint = null;
  let lakeSplashRadius = 0;
  const updateLakeState = (item) => {
    if (!item || !item.at) return;
    const isLake = item.id === "silver-lake" || item.locationId === "silver-lake";
    if (!isLake) return;
    lakePoint = {
      x: item.at.x * mapData.meta.tileSize,
      y: item.at.y * mapData.meta.tileSize,
    };
    lakeSplashRadius =
      mapData.meta.tileSize * (item.splashRadius || lakeObject?.splashRadius || 1.4);
  };
  if (lakeObject) {
    updateLakeState(lakeObject);
  }

  const VFX_REGISTRY = [
    {
      id: "stellacorn-eating",
      pony: "stellacorn",
      trigger: "eat",
      src: "/assets/ponies/stellacorn/animations/stellacorn-eating.mp4",
      scale: 1.1,
      offset: { x: 0, y: -0.35 },
      anchor: "pony",
      loop: false,
      blend: "screen",
    },
    {
      id: "stellacorn-splashing",
      pony: "stellacorn",
      trigger: "lake",
      src: "/assets/ponies/stellacorn/animations/stella-corn-splashing.mp4",
      scale: 1.3,
      offset: { x: 0, y: -0.25 },
      anchor: "lake",
      loop: true,
      blend: "screen",
    },
  ];

  const createVideo = (src, loop) => {
    const video = document.createElement("video");
    video.src = src;
    video.preload = "auto";
    video.muted = true;
    video.loop = Boolean(loop);
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.load();
    return video;
  };

  const vfxVideos = new Map();
  const vfxByKey = new Map();
  const vfxState = new Map();
  VFX_REGISTRY.forEach((entry) => {
    vfxVideos.set(entry.id, createVideo(entry.src, entry.loop ?? true));
    vfxByKey.set(`${entry.pony}:${entry.trigger}`, entry);
  });

  const PROMENADE_PREFIX = "loop-";
  const NEED_PRIORITY = ["health", "thirst", "hunger", "tired", "boredom"];
  const NEED_WASH_MARGIN = 6;
  const STATE_SAVE_INTERVAL = 60000;
  const pickNextSegment = (choices, targetPoint, preferTarget) => {
    if (!choices.length) return null;
    if (targetPoint) {
      const scored = choices
        .map((choice) => {
          const endPoint =
            choice.end === "from" ? choice.segment.from : choice.segment.to;
          return {
            choice,
            distance: Math.hypot(
              endPoint.x - targetPoint.x,
              endPoint.y - targetPoint.y
            ),
          };
        })
        .sort((a, b) => a.distance - b.distance);
      const pickFrom = scored
        .slice(0, Math.min(2, scored.length))
        .map((item) => item.choice);
      if (pickFrom.length && preferTarget) {
        return pickFrom[0];
      }
      if (pickFrom.length && Math.random() < 0.75) {
        return pickFrom[Math.floor(Math.random() * pickFrom.length)];
      }
    }
    const promenade = choices.filter((item) =>
      String(item.segment.id || "").startsWith(PROMENADE_PREFIX)
    );
    if (promenade.length && Math.random() < 0.7) {
      return promenade[Math.floor(Math.random() * promenade.length)];
    }
    return choices[Math.floor(Math.random() * choices.length)];
  };

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

  const houseObjects = objects.filter((item) => item.kind === "house");
  const housesById = new Map(houseObjects.map((item) => [item.id, item]));
  const houseAccessPoints = new Map();
  const houseStates = new Map();
  houseObjects.forEach((house) => {
    houseStates.set(house.id, {
      condition: 1,
      status: "ok",
      repairingUntil: 0,
      repairingBy: null,
    });
  });
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

  const nearestPointOnSegment = (point, segment) => {
    const dx = segment.to.x - segment.from.x;
    const dy = segment.to.y - segment.from.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) {
      return { x: segment.from.x, y: segment.from.y };
    }
    const t =
      ((point.x - segment.from.x) * dx + (point.y - segment.from.y) * dy) /
      lengthSquared;
    const clamped = Math.max(0, Math.min(1, t));
    return {
      x: segment.from.x + dx * clamped,
      y: segment.from.y + dy * clamped,
    };
  };

  const computeAccessPoint = (target) => {
    if (!roadSegments.length) {
      return target;
    }
    let bestPoint = null;
    let bestDistance = Infinity;
    roadSegments.forEach((segment) => {
      const point = nearestPointOnSegment(target, segment);
      const distance = Math.hypot(point.x - target.x, point.y - target.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestPoint = point;
      }
    });
    return bestPoint || target;
  };

  let innAccessPoint = null;
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

  const foodAccessPoints = new Map();
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

  const drinkAccessPoints = new Map();
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
    if (isInnObject(item)) {
      innAccessPoint = computeAccessPoint(target);
    }
    updateLakeState(item);
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
  const pickFoodSpot = (actor, position) => {
    if (!foodSpots.length) return null;
    const preferences = normalizePreferenceList(actor.foodPreference);
    const scored = foodSpots
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
    const preferences = normalizePreferenceList(actor.drinkPreference);
    const scored = drinkSpots
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
    if (command === "rest") {
      const homeId = actor.homeId;
      const state = homeId ? houseStates.get(homeId) : null;
      if (
        homeId &&
        state &&
        state.status !== "repairing" &&
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

  const findRepairTarget = () => {
    let target = null;
    let lowest = 1;
    houseObjects.forEach((house) => {
      const state = houseStates.get(house.id);
      if (!state) return;
      if (state.status === "repairing") return;
      if (state.condition < HOUSE_REPAIR_THRESHOLD && state.condition < lowest) {
        lowest = state.condition;
        target = house;
      }
    });
    return target;
  };

  const updateHouseStates = (delta, now) => {
    houseStates.forEach((state) => {
      if (state.status === "repairing") {
        state.condition = Math.min(1, state.condition + delta * HOUSE_REPAIR_RATE);
        if (state.condition >= 0.98 || now >= state.repairingUntil) {
          state.condition = Math.max(state.condition, 0.98);
          state.status = "ok";
          state.repairingUntil = 0;
          state.repairingBy = null;
        }
        return;
      }
      state.condition = Math.max(0, state.condition - delta * HOUSE_DECAY_RATE);
      if (state.condition < HOUSE_CONSTRUCTION_THRESHOLD) {
        state.status = "under_construction";
      } else if (state.condition < HOUSE_REPAIR_THRESHOLD) {
        state.status = "needs_repair";
      } else {
        state.status = "ok";
      }
    });
  };

  const structureSprites = {};
  const structureItems = objects.filter((item) => item.sprite || item.spritePath);
  await Promise.all(
    structureItems.map(async (item) => {
      const spritePath = item.spritePath
        ? item.spritePath
        : `/assets/world/structures/${item.sprite}.png`;
      try {
        structureSprites[item.id] = await loadImage(spritePath);
      } catch (error) {
        structureSprites[item.id] = null;
      }
    })
  );

  const decorItems = (mapData.layers.decor && mapData.layers.decor.items) || [];
  const decorSprites = {};
  await Promise.all(
    decorItems.map(async (item) => {
      if (!item.sprite) return;
      try {
        decorSprites[item.id] = await loadImage(`/assets/world/decor/${item.sprite}.png`);
      } catch (error) {
        decorSprites[item.id] = null;
      }
    })
  );

  const statusIconPaths = {
    health: "/assets/ui/icons/health.png",
    thirst: "/assets/ui/icons/thirst.png",
    hunger: "/assets/ui/icons/hunger.png",
    tiredness: "/assets/ui/icons/tired.png",
    boredom: "/assets/ui/icons/boredom.png",
  };
  const statusIcons = {};
  await Promise.all(
    Object.entries(statusIconPaths).map(async ([key, path]) => {
      try {
        statusIcons[key] = await loadImage(`${path}?v=${Date.now()}`);
      } catch (error) {
        statusIcons[key] = null;
      }
    })
  );

  const sprites = await Promise.all(
    ponies.map(async (pony) => {
      if (!pony.sprites || !pony.sprites.meta || !pony.sprites.sheet) {
        return null;
      }
      try {
        const cacheBust = Date.now();
        const meta = await loadJson(`${pony.sprites.meta}?v=${cacheBust}`);
        const sheet = await loadImage(`${pony.sprites.sheet}?v=${cacheBust}`);
        const moveType = meta.animations.walk
          ? "walk"
          : meta.animations.trot
            ? "trot"
            : "idle";
        const moveFrames = meta.animations[moveType];
        const idleFrames = meta.animations.idle || moveFrames;
        const sleepFrames = meta.animations.sleep || idleFrames || moveFrames;
        if (!moveFrames || !moveFrames.length) return null;
        return { pony, meta, sheet, moveFrames, sleepFrames, idleFrames, moveType };
      } catch (error) {
        return null;
      }
    })
  );

  const activeSprites = sprites.filter(Boolean);
  if (!activeSprites.length) {
    mapStatus.textContent = "No spritesheets found. Pack sprites to animate.";
  } else {
    const missingCount = ponies.length - activeSprites.length;
    if (activeSprites.length > MAX_ACTORS) {
      mapStatus.textContent = `Showing ${MAX_ACTORS} of ${activeSprites.length} ponies.`;
    } else if (missingCount > 0) {
      mapStatus.textContent = `${missingCount} ponies missing spritesheets.`;
    } else {
      mapStatus.textContent = "Ponyville is live.";
    }
  }

  const shuffledSprites = activeSprites.slice();
  for (let i = shuffledSprites.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledSprites[i], shuffledSprites[j]] = [shuffledSprites[j], shuffledSprites[i]];
  }
  const limitedSprites = shuffledSprites.slice(0, MAX_ACTORS);

  const runtimePonies = runtimeState && runtimeState.ponies ? runtimeState.ponies : {};
  const getSavedState = (slug) => {
    const saved = runtimePonies[slug];
    if (!saved || typeof saved !== "object") return null;
    return saved;
  };
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const actors = limitedSprites.map((sprite, index) => {
    const savedState = getSavedState(sprite.pony.slug);
    const savedSegmentId = savedState ? savedState.segmentId : null;
    const savedSegment =
      savedSegmentId && roadSegments.length
        ? roadSegments.find((segment) => segment.id === savedSegmentId)
        : null;
    const segment =
      savedSegment ||
      (roadSegments.length > 0
        ? roadSegments[index % roadSegments.length]
        : { from: { x: 0, y: 0 }, to: { x: mapWidth, y: 0 } });
    const baseSpeed = sprite.moveType === "trot" ? 0.3 : 0.1;
    const startSpeed = baseSpeed + Math.random() * baseSpeed;
    const baseStats = sprite.pony.stats || {};
    const savedStats = savedState && savedState.stats ? savedState.stats : {};
    const driveEat =
      sprite.pony.drives && sprite.pony.drives.eat ? sprite.pony.drives.eat : {};
    const driveDrink =
      sprite.pony.drives && sprite.pony.drives.drink ? sprite.pony.drives.drink : {};
    const eatThreshold = Number.isFinite(driveEat.threshold)
      ? driveEat.threshold
      : EAT_THRESHOLD_DEFAULT;
    const drinkThreshold = Number.isFinite(driveDrink.threshold)
      ? driveDrink.threshold
      : DRINK_THRESHOLD_DEFAULT;
    const savedDirection =
      savedState && (savedState.direction === 1 || savedState.direction === -1)
        ? savedState.direction
        : null;
    const savedT =
      savedState && Number.isFinite(savedState.t)
        ? clamp(savedState.t, 0, 1)
        : null;
    const actorStats = {
      health: Number.isFinite(savedStats.health)
        ? savedStats.health
        : Number.isFinite(baseStats.health)
          ? baseStats.health
          : 92,
      hunger: Number.isFinite(savedStats.hunger)
        ? savedStats.hunger
        : Number.isFinite(baseStats.hunger)
          ? baseStats.hunger
          : 28,
      thirst: Number.isFinite(savedStats.thirst)
        ? savedStats.thirst
        : Number.isFinite(baseStats.thirst)
          ? baseStats.thirst
          : 20,
      boredom: Number.isFinite(savedStats.boredom)
        ? savedStats.boredom
        : Number.isFinite(baseStats.boredom)
          ? baseStats.boredom
          : 24,
      tiredness: Number.isFinite(savedStats.tiredness)
        ? savedStats.tiredness
        : Number.isFinite(baseStats.tiredness)
          ? baseStats.tiredness
          : 35,
    };
    return {
      sprite,
      segment,
      t: savedT !== null ? savedT : Math.random(),
      baseSpeed: startSpeed,
      speed: startSpeed,
      direction: savedDirection !== null ? savedDirection : Math.random() > 0.5 ? 1 : -1,
      frameIndex: Math.floor(Math.random() * sprite.moveFrames.length),
      lastFrame: 0,
      sleepUntil: 0,
      sleepOffset: { x: 0, y: 0 },
      sleepSpotIndex: null,
      innCooldownUntil: 0,
      bounds: null,
      stats: actorStats,
      homeId: sprite.pony.house ? sprite.pony.house.id : null,
      restTarget: null,
      sleepSpotOwner: null,
      homeCooldownUntil: 0,
      task: null,
      eatUntil: 0,
      eatTargetId: null,
      eatOffset: { x: 0, y: 0 },
      eatCooldownUntil: 0,
      eatThreshold,
      foodPreference: driveEat.preference || null,
      drinkUntil: 0,
      drinkTargetId: null,
      drinkOffset: { x: 0, y: 0 },
      drinkCooldownUntil: 0,
      drinkThreshold,
      drinkPreference: driveDrink.preference || null,
    };
  });
  let lastPointer = null;
  const commandMenu = document.getElementById("pony-command-menu");
  const commandTitle = commandMenu
    ? commandMenu.querySelector(".pony-command-title")
    : null;
  let commandTarget = null;

  const hideCommandMenu = () => {
    if (!commandMenu) return;
    commandMenu.hidden = true;
    commandTarget = null;
  };

  const showCommandMenu = (actor, clientX, clientY) => {
    if (!commandMenu || !ponyMap) return;
    const cardRect = ponyMap.parentElement?.getBoundingClientRect();
    if (!cardRect) return;
    commandTarget = actor;
    if (commandTitle) {
      commandTitle.textContent = actor?.sprite?.pony?.name || "Pony";
    }
    commandMenu.hidden = false;
    const menuWidth = commandMenu.offsetWidth || 160;
    const menuHeight = commandMenu.offsetHeight || 100;
    let left = clientX - cardRect.left;
    let top = clientY - cardRect.top;
    const maxLeft = cardRect.width - menuWidth - 8;
    const maxTop = cardRect.height - menuHeight - 8;
    if (left > maxLeft) left = maxLeft;
    if (top > maxTop) top = maxTop;
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    commandMenu.style.left = `${left}px`;
    commandMenu.style.top = `${top}px`;
  };

  const pattern = (() => {
    const tile = document.createElement("canvas");
    tile.width = 140;
    tile.height = 140;
    const tctx = tile.getContext("2d");
    if (!tctx) return null;
    const gradient = tctx.createLinearGradient(0, 0, 140, 140);
    gradient.addColorStop(0, "#f6ffe6");
    gradient.addColorStop(1, "#e4f5d2");
    tctx.fillStyle = gradient;
    tctx.fillRect(0, 0, tile.width, tile.height);
    for (let i = 0; i < 80; i += 1) {
      tctx.fillStyle =
        i % 2 === 0 ? "rgba(170, 210, 140, 0.4)" : "rgba(200, 230, 170, 0.5)";
      tctx.beginPath();
      tctx.arc(
        Math.random() * tile.width,
        Math.random() * tile.height,
        1.2 + Math.random() * 1.8,
        0,
        Math.PI * 2
      );
      tctx.fill();
    }
    return ctx.createPattern(tile, "repeat");
  })();

  const drawRoads = () => {
    const roadWidth = Math.max(6, mapData.meta.tileSize * scale * 0.28);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(188, 150, 90, 0.9)";
    ctx.lineWidth = roadWidth;
    roadSegments.forEach((segment) => {
      ctx.beginPath();
      ctx.moveTo(segment.from.x * scale, segment.from.y * scale);
      ctx.lineTo(segment.to.x * scale, segment.to.y * scale);
      ctx.stroke();
    });

    ctx.strokeStyle = "rgba(242, 216, 165, 0.9)";
    ctx.lineWidth = roadWidth * 0.55;
    roadSegments.forEach((segment) => {
      ctx.beginPath();
      ctx.moveTo(segment.from.x * scale, segment.from.y * scale);
      ctx.lineTo(segment.to.x * scale, segment.to.y * scale);
      ctx.stroke();
    });
  };

  const structureScale = {
    building: 1.8,
    landmark: 1.7,
    location: 1.5,
    nature: 2.4,
    house: 1.6,
    food: 1.6,
    drink: 1.5,
  };

  let structureBounds = [];
  const dragState = {
    active: false,
    item: null,
    offsetX: 0,
    offsetY: 0,
    pointerId: null,
  };

  const drawDecor = () => {
    if (!decorItems.length) return;
    decorItems.forEach((item) => {
      if (!item || !item.at) return;
      const sprite = decorSprites[item.id];
      if (!sprite) return;
      const size =
        (item.scale || item.size || 0.8) * mapData.meta.tileSize * scale * ASSET_SCALE;
      const x = item.at.x * mapData.meta.tileSize * scale;
      const y = item.at.y * mapData.meta.tileSize * scale;
      ctx.drawImage(sprite, x - size * 0.5, y - size, size, size);
    });
  };

  const drawStructures = () => {
    const nextBounds = [];
    objects.forEach((item) => {
      const sprite = structureSprites[item.id];
      if (!sprite) return;
      const scaleFactor = item.scale || structureScale[item.kind] || 1.6;
      const x = item.at.x * mapData.meta.tileSize * scale;
      const y = item.at.y * mapData.meta.tileSize * scale;
      const size = mapData.meta.tileSize * scale * scaleFactor * ASSET_SCALE;
      const destX = x - size * 0.5;
      const destY = y - size;
      ctx.drawImage(sprite, destX, destY, size, size);
      nextBounds.push({
        id: item.id,
        label: getStructureLabel(item),
        x: destX,
        y: destY,
        width: size,
        height: size,
        anchorX: x,
        anchorY: y,
        item,
      });
    });
    structureBounds = nextBounds;
  };

  const setVideoActive = (entry, video, active) => {
    if (!video || !entry) return;
    const state = vfxState.get(entry.id) || { active: false };
    if (active && !state.active) {
      try {
        video.currentTime = 0;
      } catch (error) {
        // Ignore seek errors on first play.
      }
    }
    if (active) {
      if (video.paused) {
        video.play().catch(() => {});
      }
    } else if (!video.paused) {
      video.pause();
    }
    state.active = active;
    vfxState.set(entry.id, state);
  };

  const drawVideoOverlay = (video, config, x, y) => {
    if (!video || !config) return;
    if (video.readyState < 2) return;
    const size =
      mapData.meta.tileSize * scale * ASSET_SCALE * (config.scale || 1);
    const offsetX =
      (config.offset?.x || 0) * mapData.meta.tileSize * scale * ASSET_SCALE;
    const offsetY =
      (config.offset?.y || 0) * mapData.meta.tileSize * scale * ASSET_SCALE;
    const drawX = x * scale - size * 0.5 + offsetX;
    const drawY = y * scale - size + offsetY;
    const blend = config.blend && config.blend !== "source-over";
    if (blend) {
      ctx.save();
      ctx.globalCompositeOperation = config.blend;
    }
    ctx.drawImage(video, drawX, drawY, size, size);
    if (blend) {
      ctx.restore();
    }
  };

  const drawActors = (delta, now) => {
    actors.forEach((actor) => {
      const { sprite, segment } = actor;
      const meta = sprite.meta;
      const frames = meta.frames;
      const anchor = Object.values(frames)[0]?.anchor || { x: 256, y: 480 };
      const sleeping = actor.sleepUntil > now;
      const eating = actor.eatUntil > now;
      const drinking = actor.drinkUntil > now;
      if (!sleeping && actor.sleepSpotOwner) {
        if (actor.sleepSpotOwner.kind === "inn") {
          releaseInnSpot(actor.sleepSpotIndex);
        } else if (actor.sleepSpotOwner.kind === "house") {
          releaseHouseSpot(actor.sleepSpotOwner.id, actor.sleepSpotIndex);
        }
        actor.sleepSpotIndex = null;
        actor.sleepSpotOwner = null;
        actor.restTarget = null;
      }
      if (!eating && actor.eatTargetId) {
        actor.eatTargetId = null;
        actor.eatOffset = { x: 0, y: 0 };
      }
      if (!drinking && actor.drinkTargetId) {
        actor.drinkTargetId = null;
        actor.drinkOffset = { x: 0, y: 0 };
      }
      const frameNames = sleeping
        ? sprite.sleepFrames
        : eating || drinking
          ? sprite.idleFrames
          : sprite.moveFrames;
      const fps = sleeping
        ? meta.fps.sleep || meta.fps.idle || 2
        : eating || drinking
          ? meta.fps.idle || 2
          : meta.fps[sprite.moveType] || 6;
      actor.lastFrame += delta;
      const frameDuration = 1000 / fps;
      if (actor.lastFrame >= frameDuration) {
        actor.frameIndex = (actor.frameIndex + 1) % frameNames.length;
        actor.lastFrame = 0;
      }

      const frame = frames[frameNames[actor.frameIndex]]?.frame;
      if (!frame) return;

      const from = actor.direction === 1 ? segment.from : segment.to;
      const to = actor.direction === 1 ? segment.to : segment.from;
      let x = from.x + (to.x - from.x) * actor.t;
      let y = from.y + (to.y - from.y) * actor.t;
      let startedEating = false;
      let startedDrinking = false;

      if (sleeping && actor.restTarget) {
        if (actor.restTarget.kind === "house") {
          const house = housesById.get(actor.restTarget.id);
          if (house) {
            x = house.at.x * mapData.meta.tileSize + actor.sleepOffset.x;
            y = house.at.y * mapData.meta.tileSize + actor.sleepOffset.y;
          }
        } else if (actor.restTarget.kind === "inn" && innObject) {
          x = innObject.at.x * mapData.meta.tileSize + actor.sleepOffset.x;
          y = innObject.at.y * mapData.meta.tileSize + actor.sleepOffset.y;
        }
      } else if (eating && actor.eatTargetId) {
        const spot = foodSpotById.get(actor.eatTargetId);
        if (spot) {
          x = spot.at.x * mapData.meta.tileSize + actor.eatOffset.x;
          y = spot.at.y * mapData.meta.tileSize + actor.eatOffset.y;
        } else {
          actor.eatUntil = 0;
          actor.eatTargetId = null;
          actor.eatOffset = { x: 0, y: 0 };
        }
      } else if (drinking && actor.drinkTargetId) {
        const spot = drinkSpotById.get(actor.drinkTargetId);
        if (spot) {
          x = spot.at.x * mapData.meta.tileSize + actor.drinkOffset.x;
          y = spot.at.y * mapData.meta.tileSize + actor.drinkOffset.y;
        } else {
          actor.drinkUntil = 0;
          actor.drinkTargetId = null;
          actor.drinkOffset = { x: 0, y: 0 };
        }
      } else if (sleeping && innObject) {
        x = innObject.at.x * mapData.meta.tileSize + actor.sleepOffset.x;
        y = innObject.at.y * mapData.meta.tileSize + actor.sleepOffset.y;
      } else {
        actor.stats.tiredness = Math.min(100, actor.stats.tiredness + delta * 0.00006);
        actor.stats.hunger = Math.min(100, actor.stats.hunger + delta * HUNGER_RATE);
        actor.stats.thirst = Math.min(100, actor.stats.thirst + delta * THIRST_RATE);

        const jobTitle = (sprite.pony.job && sprite.pony.job.title) || "";
        const isBuilder = jobTitle.toLowerCase().includes("builder");
        const eatThreshold = Number.isFinite(actor.eatThreshold)
          ? actor.eatThreshold
          : EAT_THRESHOLD_DEFAULT;
        const drinkThreshold = Number.isFinite(actor.drinkThreshold)
          ? actor.drinkThreshold
          : DRINK_THRESHOLD_DEFAULT;
        const hasManualTask = actor.task && actor.task.manual;
        if (!hasManualTask) {
          const canEat = foodSpots.length > 0 && now > actor.eatCooldownUntil;
          const canDrink = drinkSpots.length > 0 && now > actor.drinkCooldownUntil;
          const candidates = [];
          if (canEat && actor.stats.hunger >= eatThreshold) {
            const target = pickFoodSpot(actor, { x, y });
            if (target) {
              candidates.push({
                need: "hunger",
                level: actor.stats.hunger,
                task: { type: "eat", foodId: target.id },
              });
            }
          }
          if (canDrink && actor.stats.thirst >= drinkThreshold) {
            const target = pickDrinkSpot(actor, { x, y });
            if (target) {
              candidates.push({
                need: "thirst",
                level: actor.stats.thirst,
                task: { type: "drink", drinkId: target.id },
              });
            }
          }
          if (
            actor.stats.tiredness > 60 &&
            actor.homeId &&
            housesById.has(actor.homeId)
          ) {
            candidates.push({
              need: "tired",
              level: actor.stats.tiredness,
              task: { type: "rest", houseId: actor.homeId },
            });
          }
          const chosenNeed = pickNeedCandidate(candidates);
          if (chosenNeed) {
            if (!actor.task || actor.task.type !== chosenNeed.task.type) {
              actor.task = chosenNeed.task;
            }
          } else if (isBuilder) {
            if (!actor.task || actor.task.type !== "repair") {
              const target = findRepairTarget();
              if (target) {
                actor.task = { type: "repair", houseId: target.id };
              }
            }
          }
        }

        if (actor.task && actor.task.type === "rest" && actor.task.houseId) {
          const state = houseStates.get(actor.task.houseId);
          if (
            actor.task.type === "rest" &&
            (!state || state.status === "repairing" || state.status === "under_construction")
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
        actor.speed = hasManualTask
          ? actor.baseSpeed * MANUAL_SPEED_MULTIPLIER
          : actor.baseSpeed;
        const distance = Math.hypot(to.x - from.x, to.y - from.y);
        actor.t += (actor.speed * delta) / Math.max(distance, 1);
        if (actor.t >= 1) {
          actor.t = 0;
          if (isOffMap(to)) {
            actor.segment =
              roadSegments[Math.floor(Math.random() * roadSegments.length)] || segment;
            actor.direction = Math.random() > 0.5 ? 1 : -1;
          } else {
            const key = endpointKey(to);
            const options = endpointIndex.get(key) || [];
            const nextOptions = options.filter((item) => item.segment !== segment);
            const choicePool = nextOptions.length ? nextOptions : options;
            let targetPoint = null;
            let preferTarget = false;
            if (actor.task && actor.task.type === "rest") {
              if (actor.task.houseId) {
                targetPoint = getHouseTargetPoint(actor.task.houseId);
              } else if (actor.task.inn) {
                targetPoint = getInnTargetPoint();
              }
            } else if (actor.task && actor.task.houseId) {
              targetPoint = getHouseTargetPoint(actor.task.houseId);
            } else if (actor.task && actor.task.type === "eat") {
              targetPoint = getFoodTargetPoint(actor.task.foodId);
            } else if (actor.task && actor.task.type === "drink") {
              targetPoint = getDrinkTargetPoint(actor.task.drinkId);
            }
            if (actor.task && targetPoint) {
              preferTarget = true;
            }
            const next = pickNextSegment(choicePool, targetPoint, preferTarget);
            if (next) {
              actor.segment = next.segment;
              actor.direction = next.end === "from" ? 1 : -1;
            } else {
              actor.direction *= -1;
            }
          }
        }

        if (actor.task && actor.task.type === "eat") {
          const spot = foodSpotById.get(actor.task.foodId);
          if (spot) {
            const accessPoint = getFoodSpotAccessPoint(spot);
            const foodX = accessPoint.x;
            const foodY = accessPoint.y;
            const distToFood = Math.hypot(x - foodX, y - foodY);
            const eatRadiusTiles = spot.eatRadius || EAT_RADIUS_TILES;
            const eatRadius = mapData.meta.tileSize * eatRadiusTiles;
            if (distToFood < eatRadius && now > actor.eatCooldownUntil) {
              let eatDuration =
                EAT_DURATION_MIN + Math.random() * (EAT_DURATION_MAX - EAT_DURATION_MIN);
              const vfxEntry = vfxByKey.get(`${sprite.pony.slug}:eat`);
              const vfxVideo = vfxEntry ? vfxVideos.get(vfxEntry.id) : null;
              if (vfxVideo && Number.isFinite(vfxVideo.duration) && vfxVideo.duration > 0) {
                eatDuration = vfxVideo.duration * 1000;
              }
              actor.eatUntil = now + eatDuration;
              actor.eatCooldownUntil =
                actor.eatUntil +
                EAT_COOLDOWN_MIN +
                Math.random() * (EAT_COOLDOWN_MAX - EAT_COOLDOWN_MIN);
              actor.eatTargetId = spot.id;
              actor.eatOffset = {
                x: (Math.random() - 0.5) * mapData.meta.tileSize * 0.2,
                y: (Math.random() - 0.5) * mapData.meta.tileSize * 0.2,
              };
              actor.frameIndex = 0;
              actor.lastFrame = 0;
              actor.stats.hunger = 0;
              actor.task = null;
              startedEating = true;
            }
          }
        }

        if (actor.task && actor.task.type === "drink") {
          const spot = drinkSpotById.get(actor.task.drinkId);
          if (spot) {
            const accessPoint = getDrinkSpotAccessPoint(spot);
            const drinkX = accessPoint.x;
            const drinkY = accessPoint.y;
            const distToDrink = Math.hypot(x - drinkX, y - drinkY);
            const drinkRadiusTiles = spot.drinkRadius || DRINK_RADIUS_TILES;
            const drinkRadius = mapData.meta.tileSize * drinkRadiusTiles;
            if (distToDrink < drinkRadius && now > actor.drinkCooldownUntil) {
              const drinkDuration =
                DRINK_DURATION_MIN +
                Math.random() * (DRINK_DURATION_MAX - DRINK_DURATION_MIN);
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
              startedDrinking = true;
            }
          }
        }

        const skipAutoRest = actor.task && actor.task.manual && actor.task.type !== "rest";
        if (innObject && !startedEating && !startedDrinking && !skipAutoRest) {
          const innX = innObject.at.x * mapData.meta.tileSize;
          const innY = innObject.at.y * mapData.meta.tileSize;
          const distToInn = Math.hypot(x - innX, y - innY);
          const sleepRadiusTiles = innObject.sleepRadius || 0.6;
          const sleepRadius = mapData.meta.tileSize * sleepRadiusTiles;
          const forceRestAtInn =
            actor.task && actor.task.type === "rest" && actor.task.inn;
          if (distToInn < sleepRadius && now > actor.innCooldownUntil) {
            const tirednessLevel = Number.isFinite(actor.stats.tiredness)
              ? actor.stats.tiredness
              : 35;
            const restChance = forceRestAtInn
              ? 1
              : Math.min(0.9, Math.max(0.15, tirednessLevel / 100));
            if (!forceRestAtInn && Math.random() > restChance) {
              actor.innCooldownUntil = now + 2000 + Math.random() * 2000;
            } else {
              const homeState = actor.homeId ? houseStates.get(actor.homeId) : null;
              const canRestAtHome =
                actor.homeId &&
                housesById.has(actor.homeId) &&
                homeState &&
                homeState.status !== "repairing" &&
                homeState.status !== "under_construction";
              if (!forceRestAtInn && canRestAtHome && Math.random() < 0.9) {
                actor.innCooldownUntil = now + 2000 + Math.random() * 2000;
              } else {
                const spotIndex = claimInnSpot();
                if (spotIndex !== null) {
                  const napTime = 2000 + Math.random() * 3000;
                  actor.sleepSpotIndex = spotIndex;
                  actor.sleepOffset = innSleepSpots[spotIndex];
                  actor.sleepSpotOwner = { kind: "inn", id: "inn" };
                  actor.restTarget = { kind: "inn", id: "inn" };
                  actor.sleepUntil = now + napTime;
                  actor.innCooldownUntil =
                    actor.sleepUntil + 8000 + Math.random() * 4000;
                  actor.frameIndex = 0;
                  actor.lastFrame = 0;
                  actor.stats.tiredness = 0;
                  if (forceRestAtInn) {
                    actor.task = null;
                  }
                } else {
                  actor.innCooldownUntil = now + 3000 + Math.random() * 2000;
                }
              }
            }
          }
        }

        const skipHomeRest =
          actor.task && actor.task.manual && actor.task.type === "rest" && actor.task.inn;
        if (
          actor.homeId &&
          !startedEating &&
          !startedDrinking &&
          !skipAutoRest &&
          !skipHomeRest
        ) {
          const house = housesById.get(actor.homeId);
          const state = house ? houseStates.get(actor.homeId) : null;
          if (house && state) {
            const accessPoint = getHouseTargetPoint(actor.homeId);
            const homeX = accessPoint ? accessPoint.x : house.at.x * mapData.meta.tileSize;
            const homeY = accessPoint ? accessPoint.y : house.at.y * mapData.meta.tileSize;
            const distToHome = Math.hypot(x - homeX, y - homeY);
            const restRadiusTiles = house.restRadius || 0.9;
            const restRadius = mapData.meta.tileSize * restRadiusTiles;
            if (
              distToHome < restRadius &&
              now > actor.homeCooldownUntil &&
              state.status !== "repairing" &&
              state.status !== "under_construction"
            ) {
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
              } else {
                actor.homeCooldownUntil = now + 2500 + Math.random() * 2000;
              }
            }
          }
        }

        if (actor.task && actor.task.type === "repair") {
          const house = housesById.get(actor.task.houseId);
          const state = house ? houseStates.get(actor.task.houseId) : null;
          if (house && state && state.status !== "repairing") {
            const accessPoint = getHouseTargetPoint(actor.task.houseId);
            const homeX = accessPoint ? accessPoint.x : house.at.x * mapData.meta.tileSize;
            const homeY = accessPoint ? accessPoint.y : house.at.y * mapData.meta.tileSize;
            const distToHome = Math.hypot(x - homeX, y - homeY);
            const repairRadius = mapData.meta.tileSize * 0.6;
            if (distToHome < repairRadius) {
              const spot = claimHouseSpot(actor.task.houseId);
              if (spot) {
                const repairTime = 4000 + Math.random() * 4000;
                state.status = "repairing";
                state.repairingUntil = now + repairTime;
                state.repairingBy = actor;
                actor.sleepSpotIndex = spot.index;
                actor.sleepOffset = spot.offset;
                actor.sleepSpotOwner = { kind: "house", id: actor.task.houseId };
                actor.restTarget = { kind: "house", id: actor.task.houseId };
                actor.sleepUntil = state.repairingUntil;
                actor.frameIndex = 0;
                actor.lastFrame = 0;
                actor.task = null;
              }
            }
          }
        }
      }

      const frameScale = (mapData.meta.tileSize * scale * ASSET_SCALE) / frame.w;
      const destX = x * scale - anchor.x * frameScale;
      const destY = y * scale - anchor.y * frameScale;
      const drawW = frame.w * frameScale;
      const drawH = frame.h * frameScale;
      const directionFlip = to.x < from.x;
      const flip = directionFlip !== Boolean(sprite.pony.sprite_flip);

      if (flip) {
        ctx.save();
        ctx.translate(destX + drawW, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(
          sprite.sheet,
          frame.x,
          frame.y,
          frame.w,
          frame.h,
          0,
          destY,
          drawW,
          drawH
        );
        ctx.restore();
      } else {
        ctx.drawImage(
          sprite.sheet,
          frame.x,
          frame.y,
          frame.w,
          frame.h,
          destX,
          destY,
          drawW,
          drawH
        );
      }

      VFX_REGISTRY.forEach((entry) => {
        if (entry.pony !== sprite.pony.slug) {
          return;
        }
        const video = vfxVideos.get(entry.id);
        if (!video) return;
        let shouldPlay = false;
        if (entry.trigger === "eat") {
          shouldPlay = eating;
        } else if (entry.trigger === "lake") {
          shouldPlay =
            !sleeping &&
            !eating &&
            lakePoint &&
            Math.hypot(x - lakePoint.x, y - lakePoint.y) < lakeSplashRadius;
        } else if (entry.trigger === "sleep") {
          shouldPlay = sleeping;
        }
        setVideoActive(entry, video, shouldPlay);
        if (!shouldPlay) return;
        if (entry.anchor === "lake" && lakePoint) {
          drawVideoOverlay(video, entry, lakePoint.x, lakePoint.y);
        } else {
          drawVideoOverlay(video, entry, x, y);
        }
      });

      actor.bounds = {
        x: destX - 6,
        y: destY - 6,
        width: drawW + 12,
        height: drawH + 12,
      };

      const ponySlug = (sprite.pony.slug || "").toLowerCase();
      const isHovered =
        lastPointer &&
        lastPointer.x >= actor.bounds.x &&
        lastPointer.x <= actor.bounds.x + actor.bounds.width &&
        lastPointer.y >= actor.bounds.y &&
        lastPointer.y <= actor.bounds.y + actor.bounds.height;
      const showLabel =
        labelsEnabled && (Boolean(sprite.pony.label_always_on) || isHovered);
      if (showLabel) {
        const labelName = sprite.pony.name || "Pony";
        const jobTitle = (sprite.pony.job && sprite.pony.job.title) || "helper";
        const stats = actor.stats || {};
        const health = Number.isFinite(stats.health) ? Math.round(stats.health) : 92;
        const thirst = Number.isFinite(stats.thirst) ? Math.round(stats.thirst) : 20;
        const hunger = Number.isFinite(stats.hunger) ? Math.round(stats.hunger) : 28;
        const tiredness = Number.isFinite(stats.tiredness) ? Math.round(stats.tiredness) : 35;
        const boredom = Number.isFinite(stats.boredom) ? Math.round(stats.boredom) : 24;
        const fontSize = Math.max(11, Math.round(12 * scale * ASSET_SCALE));
        ctx.font = `${fontSize}px "Nunito", sans-serif`;
        const iconSize = Math.round(fontSize * 1.35);
        const lineHeight = Math.max(fontSize + 6, iconSize + 6);
        const labelX = Math.round(x * scale);
        const labelY = Math.round(destY - 8);
        const paddingX = 12;
        const paddingY = 8;
        const iconGap = Math.max(4, Math.round(fontSize * 0.3));
        const groupGap = Math.max(10, Math.round(fontSize * 0.8));
        const jobLabel = jobTitle ? `${jobTitle} ·` : "";
        const jobWidth = jobLabel ? ctx.measureText(jobLabel).width : 0;
        const statItems = [
          { key: "health", value: health, label: "H" },
          { key: "thirst", value: thirst, label: "Th" },
          { key: "hunger", value: hunger, label: "Hu" },
          { key: "tiredness", value: tiredness, label: "T" },
          { key: "boredom", value: boredom, label: "B" },
        ];
        const statRuns = statItems.map((item) => {
          const icon = statusIcons[item.key] || null;
          const valueText = String(item.value);
          const labelText = icon ? "" : `${item.label}:`;
          const labelWidth = labelText ? ctx.measureText(labelText).width : 0;
          const valueWidth = ctx.measureText(valueText).width;
          const width =
            (icon ? iconSize : labelWidth) + iconGap + valueWidth;
          return {
            icon,
            labelText,
            labelWidth,
            valueText,
            valueWidth,
            width,
          };
        });
        let statsLineWidth = jobWidth;
        if (jobLabel) {
          statsLineWidth += groupGap;
        }
        statRuns.forEach((run, index) => {
          statsLineWidth += run.width;
          if (index < statRuns.length - 1) {
            statsLineWidth += groupGap;
          }
        });
        const nameWidth = ctx.measureText(labelName).width;
        const boxWidth = Math.max(nameWidth, statsLineWidth) + paddingX * 2;
        const boxHeight = lineHeight * 2 + paddingY * 2 - 4;
        const labelThemes = {
          stellacorn: {
            textPrimary: "#ffe27a",
            textSecondary: "#fff2b8",
            box: "rgba(44, 32, 10, 0.75)",
          },
          "blue-wonder": {
            textPrimary: "#9fd6ff",
            textSecondary: "#cde9ff",
            box: "rgba(12, 24, 40, 0.75)",
          },
          "raging-torrent": {
            textPrimary: "#b7f59a",
            textSecondary: "#dcffd1",
            box: "rgba(16, 36, 18, 0.75)",
          },
        };
        const theme = labelThemes[ponySlug] || {
          textPrimary: "#fff7d6",
          textSecondary: "#f1e9ff",
          box: "rgba(20, 16, 28, 0.7)",
        };
        const boxLeft = Math.round(labelX - boxWidth / 2);
        const boxTop = Math.round(labelY - boxHeight);
        ctx.fillStyle = theme.box;
        ctx.fillRect(boxLeft, boxTop, boxWidth, boxHeight);
        ctx.fillStyle = theme.textPrimary;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const nameY = Math.round(boxTop + paddingY);
        ctx.fillText(labelName, labelX, nameY);
        ctx.fillStyle = theme.textSecondary;
        ctx.textAlign = "left";
        const statsY = Math.round(nameY + lineHeight);
        const textY = Math.round(statsY + (lineHeight - fontSize) / 2);
        const iconY = Math.round(statsY + (lineHeight - iconSize) / 2);
        let cursorX = labelX - statsLineWidth / 2;
        if (jobLabel) {
          ctx.fillText(jobLabel, Math.round(cursorX), textY);
          cursorX += jobWidth + groupGap;
        }
        statRuns.forEach((run, index) => {
          if (run.icon) {
            ctx.drawImage(
              run.icon,
              Math.round(cursorX),
              iconY,
              iconSize,
              iconSize
            );
            cursorX += iconSize + iconGap;
          } else {
            ctx.fillText(run.labelText, Math.round(cursorX), textY);
            cursorX += run.labelWidth + iconGap;
          }
          ctx.fillText(run.valueText, Math.round(cursorX), textY);
          cursorX += run.valueWidth;
          if (index < statRuns.length - 1) {
            cursorX += groupGap;
          }
        });
      }
    });
  };

  let lastTime = performance.now();
  const draw = (now) => {
    const delta = now - lastTime;
    lastTime = now;
    ctx.clearRect(0, 0, ponyMap.width, ponyMap.height);
    ctx.fillStyle = pattern || "#eaf7da";
    ctx.fillRect(0, 0, ponyMap.width, ponyMap.height);
    drawRoads();
    drawDecor();
    drawStructures();
    updateHouseStates(delta, now);
    drawActors(delta, now);
    requestAnimationFrame(draw);
  };

  requestAnimationFrame(draw);

  const saveRuntimeState = async () => {
    if (!actors.length) return;
    const payload = {
      version: 1,
      updatedAt: Date.now(),
      ponies: {},
    };
    actors.forEach((actor) => {
      const slug = actor.sprite.pony.slug;
      if (!slug) return;
      payload.ponies[slug] = {
        segmentId: actor.segment && actor.segment.id ? actor.segment.id : null,
        t: Number.isFinite(actor.t) ? actor.t : 0,
        direction: actor.direction === -1 ? -1 : 1,
        stats: actor.stats,
      };
    });
    try {
      await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      // Ignore save errors; map should keep running.
    }
  };

  window.setInterval(saveRuntimeState, STATE_SAVE_INTERVAL);

  if (commandMenu) {
    commandMenu.addEventListener("click", (event) => {
      const button = event.target.closest("[data-command]");
      if (!button) return;
      event.preventDefault();
      const command = button.dataset.command;
      if (commandTarget) {
        assignManualTask(commandTarget, command);
      }
      hideCommandMenu();
    });
  }

  document.addEventListener("pointerdown", (event) => {
    if (!commandMenu || commandMenu.hidden) return;
    if (commandMenu.contains(event.target)) return;
    hideCommandMenu();
  });

  if (mapTooltip) {
    const hideTooltip = () => {
      mapTooltip.classList.remove("is-visible");
      mapTooltip.setAttribute("aria-hidden", "true");
      mapTooltip.style.transform = "translate(-9999px, -9999px)";
    };

    const getCanvasPoint = (event) => {
      const canvasRect = ponyMap.getBoundingClientRect();
      return {
        x: event.clientX - canvasRect.left,
        y: event.clientY - canvasRect.top,
      };
    };

    const getHit = (point) =>
      structureBounds.find(
        (item) =>
          point.x >= item.x &&
          point.x <= item.x + item.width &&
          point.y >= item.y &&
          point.y <= item.y + item.height
      );

    const getPonyHit = (point) =>
      actors.find(
        (actor) =>
          actor.bounds &&
          point.x >= actor.bounds.x &&
          point.x <= actor.bounds.x + actor.bounds.width &&
          point.y >= actor.bounds.y &&
          point.y <= actor.bounds.y + actor.bounds.height
      );

    const setCursor = (value) => {
      ponyMap.style.cursor = value;
    };

    const showTooltip = (label, clientX, clientY) => {
      const cardRect = ponyMap.parentElement?.getBoundingClientRect();
      if (!cardRect) return;
      const localX = clientX - cardRect.left;
      const localY = clientY - cardRect.top;
      mapTooltip.textContent = label;
      mapTooltip.classList.add("is-visible");
      mapTooltip.setAttribute("aria-hidden", "false");
      const tooltipWidth = mapTooltip.offsetWidth;
      const tooltipHeight = mapTooltip.offsetHeight;
      let left = localX + 14;
      let top = localY + 12;
      const maxLeft = cardRect.width - tooltipWidth - 8;
      const maxTop = cardRect.height - tooltipHeight - 8;
      if (left > maxLeft) left = maxLeft;
      if (top > maxTop) top = maxTop;
      if (left < 8) left = 8;
      if (top < 8) top = 8;
      mapTooltip.style.transform = `translate(${left}px, ${top}px)`;
    };

    const handleMove = (event) => {
      if (dragState.active) return;
      const point = getCanvasPoint(event);
      lastPointer = point;
      const hit = getHit(point);
      if (hit) {
        setCursor("grab");
        showTooltip(hit.label, event.clientX, event.clientY);
      } else {
        setCursor("default");
        hideTooltip();
      }
    };

    const handleDragStart = (event) => {
      const point = getCanvasPoint(event);
      const hit = getHit(point);
      if (!hit || !hit.item) return;
      event.preventDefault();
      dragState.active = true;
      dragState.item = hit.item;
      dragState.offsetX = point.x - hit.anchorX;
      dragState.offsetY = point.y - hit.anchorY;
      dragState.pointerId = event.pointerId;
      ponyMap.setPointerCapture(event.pointerId);
      setCursor("grabbing");
      hideTooltip();
    };

    const handleDragMove = (event) => {
      if (!dragState.active || dragState.pointerId !== event.pointerId) {
        handleMove(event);
        return;
      }
      lastPointer = null;
      const point = getCanvasPoint(event);
      const anchorX = point.x - dragState.offsetX;
      const anchorY = point.y - dragState.offsetY;
      const tileSize = mapData.meta.tileSize;
      const nextX = Math.max(0, Math.min(mapWidth, anchorX / scale));
      const nextY = Math.max(0, Math.min(mapHeight, anchorY / scale));
      dragState.item.at = {
        x: Number((nextX / tileSize).toFixed(2)),
        y: Number((nextY / tileSize).toFixed(2)),
      };
    };

    const saveStructureLocation = async (item) => {
      try {
        const response = await fetch(`/api/map/objects/${encodeURIComponent(item.id)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ at: item.at }),
        });
        if (!response.ok) {
          throw new Error("Save failed.");
        }
        mapStatus.textContent = `Saved ${getStructureLabel(item)}.`;
      } catch (error) {
        mapStatus.textContent = "Unable to save map changes.";
      }
    };

    const handleDragEnd = async (event) => {
      if (!dragState.active || dragState.pointerId !== event.pointerId) return;
      ponyMap.releasePointerCapture(event.pointerId);
      setCursor("default");
      const item = dragState.item;
      dragState.active = false;
      dragState.item = null;
      dragState.pointerId = null;
      if (item) {
        updateAccessPointForItem(item);
        await saveStructureLocation(item);
      }
    };

    const handlePonyClick = (event) => {
      if (dragState.active) return;
      const point = getCanvasPoint(event);
      const hit = getPonyHit(point);
      if (hit) {
        if (commandTarget === hit && commandMenu && !commandMenu.hidden) {
          hideCommandMenu();
          return;
        }
        showCommandMenu(hit, event.clientX, event.clientY);
        hideTooltip();
      } else {
        hideCommandMenu();
      }
    };

    ponyMap.addEventListener("pointerdown", handleDragStart);
    ponyMap.addEventListener("pointermove", handleDragMove);
    ponyMap.addEventListener("pointerup", handleDragEnd);
    ponyMap.addEventListener("pointercancel", handleDragEnd);
    ponyMap.addEventListener("click", handlePonyClick);
    ponyMap.addEventListener("pointerleave", () => {
      if (!dragState.active) {
        setCursor("default");
        hideTooltip();
        lastPointer = null;
      }
    });
  }
}
