// Pony Parade: map rendering and interactions.

import { ponyMap, mapStatus, mapTooltip } from "../dom.js";
import { loadImage, loadJson, toTitleCase } from "../utils.js";
import { createPathfinder } from "./pathfinding.js";
import { bindMapUI } from "./ui.js";
import { createActors, createActorRenderer } from "./actors.js";
import { createRenderer } from "./draw.js";

export const initMap = async (mapData, ponies, locations, runtimeState) => {
  if (!ponyMap) return;
  const ctx = ponyMap.getContext("2d");
  if (!ctx) return;

  const mapWidth = mapData.meta.width * mapData.meta.tileSize;
  const mapHeight = mapData.meta.height * mapData.meta.tileSize;
  const MAX_ACTORS = 30;
  const ASSET_SCALE = 2;
  const HOUSE_DECAY_RATE = 0.00000025;
  const HOUSE_REPAIR_RATE = 0.00001;
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
  const VET_RADIUS_TILES = 0.75;
  const VET_DURATION_MIN = 2600;
  const VET_DURATION_MAX = 4200;
  const VET_COOLDOWN_MIN = 12000;
  const VET_COOLDOWN_MAX = 18000;
  const FUN_RADIUS_TILES = 0.7;
  const FUN_DURATION_MIN = 2400;
  const FUN_DURATION_MAX = 4200;
  const FUN_COOLDOWN_MIN = 7000;
  const FUN_COOLDOWN_MAX = 10000;
  const BOREDOM_RATE = 0.0003;
  const BOREDOM_THRESHOLD_DEFAULT = 60;
  const HEALTH_DECAY_RATE = 0.00008;
  const HEALTH_THRESHOLD_DEFAULT = 78;
  const CRITICAL_HEALTH_LEVEL = 40;
  const CRITICAL_NEED_LEVEL = 100;
  const MANUAL_SPEED_MULTIPLIER = 1.8;

  const locationIndex = new Map();
  locations.forEach((location) => {
    if (location && location.id) {
      locationIndex.set(location.id, location);
    }
  });
  const runtimeHouses = runtimeState && runtimeState.houses ? runtimeState.houses : {};

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
    if (Array.isArray(item.drives) && item.drives.includes("fun")) return true;
    const location = item.locationId && locationIndex.get(item.locationId);
    if (location && Array.isArray(location.tags)) {
      return location.tags.some((tag) => FUN_TAGS.has(String(tag).toLowerCase()));
    }
    return false;
  };
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
  const foodSpots = objects.filter((item) => isFoodSpot(item));
  const foodSpotById = new Map(foodSpots.map((spot) => [spot.id, spot]));
  const drinkSpots = objects.filter((item) => isDrinkSpot(item));
  const drinkSpotById = new Map(drinkSpots.map((spot) => [spot.id, spot]));
  const funSpots = objects.filter((item) => isFunSpot(item));
  const funSpotById = new Map(funSpots.map((spot) => [spot.id, spot]));
  const healthSpots = objects.filter((item) => isHealthSpot(item));
  const healthSpotById = new Map(healthSpots.map((spot) => [spot.id, spot]));
  const roadSegments = roads.map((segment) => {
    const from = {
      x: segment.from.x * mapData.meta.tileSize,
      y: segment.from.y * mapData.meta.tileSize,
    };
    const to = {
      x: segment.to.x * mapData.meta.tileSize,
      y: segment.to.y * mapData.meta.tileSize,
    };
    return {
      id: segment.id,
      from,
      to,
      length: Math.hypot(to.x - from.x, to.y - from.y),
    };
  });
  const { tileKey, findNearestRoadTile, buildTilePath, advanceAlongPath } =
    createPathfinder({
      roads,
      tileSize: mapData.meta.tileSize,
      width: mapData.meta.width,
      height: mapData.meta.height,
    });

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
          const endPoint = nearestPointOnSegment(targetPoint, choice.segment);
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

  function nearestPointOnSegment(point, segment) {
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
  }

  const projectPointOnSegment = (point, segment) => {
    const dx = segment.to.x - segment.from.x;
    const dy = segment.to.y - segment.from.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) {
      return { t: 0, point: { x: segment.from.x, y: segment.from.y } };
    }
    const t =
      ((point.x - segment.from.x) * dx + (point.y - segment.from.y) * dy) /
      lengthSquared;
    const clamped = Math.max(0, Math.min(1, t));
    return {
      t: clamped,
      point: {
        x: segment.from.x + dx * clamped,
        y: segment.from.y + dy * clamped,
      },
    };
  };

  const findNearestSegmentToPoint = (point) => {
    if (!point || !roadSegments.length) return null;
    let best = null;
    roadSegments.forEach((segment) => {
      const projection = projectPointOnSegment(point, segment);
      const distance = Math.hypot(
        projection.point.x - point.x,
        projection.point.y - point.y
      );
      if (!best || distance < best.distance) {
        best = {
          segment,
          point: projection.point,
          distance,
          t: projection.t,
        };
      }
    });
    return best;
  };

  const snapActorToNearestSegment = (actor, point) => {
    if (!actor || !point) return;
    const nearest = findNearestSegmentToPoint(point);
    if (!nearest) return;
    actor.segment = nearest.segment;
    if (actor.direction !== 1 && actor.direction !== -1) {
      actor.direction = actor.facing === -1 ? -1 : 1;
    }
    const baseT = nearest.t ?? 0;
    actor.t = actor.direction === 1 ? baseT : 1 - baseT;
    actor.position = { x: nearest.point.x, y: nearest.point.y };
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

  const funAccessPoints = new Map();
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

  const healthAccessPoints = new Map();
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
    if (task.type === "repair") return getHouseTargetPoint(task.houseId);
    if (task.houseId) return getHouseTargetPoint(task.houseId);
    return null;
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

  const getSpotOffset = (spot, key) => {
    const offset = spot && spot[key];
    if (!offset) return { x: 0, y: 0 };
    return {
      x: (offset.x || 0) * mapData.meta.tileSize,
      y: (offset.y || 0) * mapData.meta.tileSize,
    };
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

  const pickFunSpot = (actor, position) => {
    if (!funSpots.length) return null;
    const scored = funSpots
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
        if (mapStatus) {
          mapStatus.textContent = "This pony cannot repair houses.";
        }
        return;
      }
      const target = findRepairTarget({ allowHealthy: true });
      if (target) {
        actor.task = { type: "repair", houseId: target.id, manual: true };
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
        const hasRepairTimer = Number.isFinite(state.repairingUntil) && state.repairingUntil > 0;
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

  const structureSprites = {};
  const structureItems = objects.filter((item) => item.sprite || item.spritePath);
  const getVariantPath = (path, suffix) => {
    if (!path) return "";
    const dotIndex = path.lastIndexOf(".");
    if (dotIndex === -1) return `${path}_${suffix}`;
    return `${path.slice(0, dotIndex)}_${suffix}${path.slice(dotIndex)}`;
  };
  await Promise.all(
    structureItems.map(async (item) => {
      const spritePath = item.spritePath
        ? item.spritePath
        : `/assets/world/structures/${item.sprite}.png`;
      try {
        const base = await loadImage(spritePath);
        if (item.kind === "house") {
          const [repair, ruined] = await Promise.all([
            loadImage(getVariantPath(spritePath, "repair")).catch(() => null),
            loadImage(getVariantPath(spritePath, "ruined")).catch(() => null),
          ]);
          structureSprites[item.id] = { base, repair, ruined };
        } else {
          structureSprites[item.id] = base;
        }
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
      if (!pony.sprites || !pony.sprites.meta) {
        return null;
      }
      try {
        const cacheBust = Date.now();
        const metaPath = pony.sprites.meta;
        const meta = await loadJson(`${metaPath}?v=${cacheBust}`);
        const basePath = metaPath.slice(0, metaPath.lastIndexOf("/") + 1);
        const imageNames =
          meta.meta && Array.isArray(meta.meta.images) && meta.meta.images.length
            ? meta.meta.images
            : meta.meta && meta.meta.image
              ? [meta.meta.image]
              : [];
        const sheetPaths = imageNames.length
          ? imageNames.map((name) => `${basePath}${name}`)
          : pony.sprites.sheet
            ? [pony.sprites.sheet]
            : [];
        if (!sheetPaths.length) {
          return null;
        }
        const sheets = await Promise.all(
          sheetPaths.map((path) => loadImage(`${path}?v=${cacheBust}`))
        );
        const sheet = sheets[0];
        const moveType = meta.animations.walk
          ? "walk"
          : meta.animations.trot
            ? "trot"
            : "idle";
        const moveFrames = meta.animations[moveType];
        const idleFrames = meta.animations.idle || moveFrames;
        const sleepFrames = meta.animations.sleep || idleFrames || moveFrames;
        const eatFrames = meta.animations.eat || idleFrames || moveFrames;
        const drinkFrames = meta.animations.drink || idleFrames || moveFrames;
        const vetFrames = meta.animations.vet || idleFrames || moveFrames;
        const repairFrames =
          meta.animations.repair ||
          (moveFrames && moveFrames.length ? [moveFrames[0]] : idleFrames || moveFrames);
        if (!moveFrames || !moveFrames.length) return null;
        return {
          pony,
          meta,
          sheet,
          sheets,
          moveFrames,
          sleepFrames,
          idleFrames,
          eatFrames,
          drinkFrames,
          vetFrames,
          repairFrames,
          moveType,
        };
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

  const { actors } = createActors({
    sprites: activeSprites,
    roadSegments,
    mapWidth,
    runtimeState,
    maxActors: MAX_ACTORS,
    eatThresholdDefault: EAT_THRESHOLD_DEFAULT,
    drinkThresholdDefault: DRINK_THRESHOLD_DEFAULT,
    funThresholdDefault: BOREDOM_THRESHOLD_DEFAULT,
    healthThresholdDefault: HEALTH_THRESHOLD_DEFAULT,
  });
  let lastPointer = null;
  const commandMenu = document.getElementById("pony-command-menu");
  const commandTitle = commandMenu
    ? commandMenu.querySelector(".pony-command-title")
    : null;
  const commandStats = commandMenu
    ? commandMenu.querySelector("[data-command-stats]")
    : null;
  const commandTargetLabel = commandMenu
    ? commandMenu.querySelector("[data-command-target]")
    : null;
  const commandRepairButton = commandMenu
    ? commandMenu.querySelector('[data-command="repair"]')
    : null;
  let commandTarget = null;
  const lastCommandStatsUpdate = { value: 0 };

  const hideCommandMenu = () => {
    if (!commandMenu) return;
    commandMenu.hidden = true;
    commandTarget = null;
  };

  const resolveTaskLabel = (actor, now) => {
    if (!actor) return "Heading: Wandering";
    const task = actor.task;
    if (task && task.type === "eat") {
      const spot = foodSpotById.get(task.foodId);
      return spot ? `Heading: ${getStructureLabel(spot)}` : "Heading: Food spot";
    }
    if (task && task.type === "drink") {
      const spot = drinkSpotById.get(task.drinkId);
      return spot ? `Heading: ${getStructureLabel(spot)}` : "Heading: Drink spot";
    }
    if (task && task.type === "fun") {
      const spot = funSpotById.get(task.funId);
      return spot ? `Heading: ${getStructureLabel(spot)}` : "Heading: Fun spot";
    }
    if (task && task.type === "vet") {
      const spot = healthSpotById.get(task.clinicId);
      return spot ? `Heading: ${getStructureLabel(spot)}` : "Heading: Vet clinic";
    }
    if (task && task.type === "rest") {
      if (task.houseId) {
        const house = housesById.get(task.houseId);
        return house ? `Heading: ${getStructureLabel(house)}` : "Heading: Home";
      }
      if (task.inn && innObject) {
        return `Heading: ${getStructureLabel(innObject)}`;
      }
      return "Heading: Rest stop";
    }
    if (task && task.type === "repair") {
      const house = housesById.get(task.houseId);
      return house ? `Heading: ${getStructureLabel(house)}` : "Heading: Repair";
    }
    if (actor.eatUntil > now && actor.eatTargetId) {
      const spot = foodSpotById.get(actor.eatTargetId);
      return spot ? `Eating at ${getStructureLabel(spot)}` : "Eating";
    }
    if (actor.drinkUntil > now && actor.drinkTargetId) {
      const spot = drinkSpotById.get(actor.drinkTargetId);
      return spot ? `Drinking at ${getStructureLabel(spot)}` : "Drinking";
    }
    if (actor.funUntil > now && actor.funTargetId) {
      const spot = funSpotById.get(actor.funTargetId);
      return spot ? `Frolicking at ${getStructureLabel(spot)}` : "Frolicking";
    }
    if (actor.vetUntil > now && actor.vetTargetId) {
      const spot = healthSpotById.get(actor.vetTargetId);
      return spot ? `At ${getStructureLabel(spot)}` : "At the clinic";
    }
    if (actor.repairUntil > now && actor.repairTargetId) {
      const house = housesById.get(actor.repairTargetId);
      return house ? `Repairing ${getStructureLabel(house)}` : "Repairing";
    }
    if (actor.sleepUntil > now && actor.restTarget) {
      if (actor.restTarget.kind === "house") {
        const house = housesById.get(actor.restTarget.id);
        return house ? `Resting at ${getStructureLabel(house)}` : "Resting";
      }
      if (actor.restTarget.kind === "inn" && innObject) {
        return `Resting at ${getStructureLabel(innObject)}`;
      }
      return "Resting";
    }
    return "Heading: Wandering";
  };

  const updateCommandStats = (now) => {
    if (!commandStats || !commandTarget) return;
    const stats = commandTarget.stats || {};
    const values = {
      health: Number.isFinite(stats.health) ? Math.round(stats.health) : 0,
      thirst: Number.isFinite(stats.thirst) ? Math.round(stats.thirst) : 0,
      hunger: Number.isFinite(stats.hunger) ? Math.round(stats.hunger) : 0,
      tiredness: Number.isFinite(stats.tiredness) ? Math.round(stats.tiredness) : 0,
      boredom: Number.isFinite(stats.boredom) ? Math.round(stats.boredom) : 0,
    };
    commandStats.querySelectorAll(".pony-command-stat").forEach((item) => {
      const key = item.dataset.stat;
      if (!key || !(key in values)) return;
      const valueEl = item.querySelector(".pony-command-value");
      if (valueEl) {
        valueEl.textContent = values[key];
      }
    });
    if (commandTargetLabel) {
      commandTargetLabel.textContent = resolveTaskLabel(commandTarget, now);
    }
  };

  const showCommandMenu = (actor, clientX, clientY) => {
    if (!commandMenu || !ponyMap) return;
    const cardRect = ponyMap.parentElement?.getBoundingClientRect();
    if (!cardRect) return;
    commandTarget = actor;
    if (commandTitle) {
      commandTitle.textContent = actor?.sprite?.pony?.name || "Pony";
    }
    if (commandRepairButton) {
      const ponySlug = (actor?.sprite?.pony?.slug || "").toLowerCase();
      commandRepairButton.hidden = ponySlug !== "taticorn";
    }
    updateCommandStats(performance.now());
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

  const structureScale = {
    building: 1.8,
    landmark: 1.7,
    location: 1.5,
    nature: 2.4,
    house: 1.6,
    food: 1.6,
    drink: 1.5,
  };

  const dragState = {
    active: false,
    item: null,
    offsetX: 0,
    offsetY: 0,
    pointerId: null,
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

  const { drawActors } = createActorRenderer({
    ctx,
    mapData,
    ASSET_SCALE,
    actors,
    statusIcons,
    getScale: () => scale,
    getLastPointer: () => lastPointer,
    isLabelsEnabled: () => labelsEnabled,
    resolveTaskLabel,
    releaseInnSpot,
    releaseHouseSpot,
    claimInnSpot,
    claimHouseSpot,
    innSleepSpots,
    housesById,
    houseStates,
    innObject,
    foodSpotById,
    drinkSpotById,
    funSpotById,
    healthSpotById,
    foodSpots,
    drinkSpots,
    funSpots,
    healthSpots,
    getHouseTargetPoint,
    getFoodSpotAccessPoint,
    getDrinkSpotAccessPoint,
    getFunSpotAccessPoint,
    getHealthSpotAccessPoint,
    getSpotOffset,
    findRepairTarget,
    getCriticalNeedTask,
    pickNeedCandidate,
    pickFoodSpot,
    pickDrinkSpot,
    pickFunSpot,
    pickHealthSpot,
    getTaskTargetPoint,
    snapActorToNearestSegment,
    findNearestRoadTile,
    buildTilePath,
    tileKey,
    advanceAlongPath,
    isOffMap,
    endpointIndex,
    endpointKey,
    pickNextSegment,
    roadSegments,
    vfxByKey,
    vfxVideos,
    VFX_REGISTRY,
    setVideoActive,
    drawVideoOverlay,
    lakePoint,
    lakeSplashRadius,
    EAT_THRESHOLD_DEFAULT,
    DRINK_THRESHOLD_DEFAULT,
    BOREDOM_THRESHOLD_DEFAULT,
    HUNGER_RATE,
    THIRST_RATE,
    BOREDOM_RATE,
    HEALTH_DECAY_RATE,
    HEALTH_THRESHOLD_DEFAULT,
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
    MANUAL_SPEED_MULTIPLIER,
  });
  const renderer = createRenderer({
    ctx,
    ponyMap,
    mapData,
    getScale: () => scale,
    ASSET_SCALE,
    roadSegments,
    decorItems,
    decorSprites,
    objects,
    structureSprites,
    structureScale,
    houseStates,
    getStructureLabel,
    updateHouseStates,
    renderActors: drawActors,
    commandMenu,
    getCommandTarget: () => commandTarget,
    updateCommandStats,
    lastCommandStatsUpdateRef: lastCommandStatsUpdate,
  });

  let lastTime = performance.now();
  const draw = (now) => {
    const delta = now - lastTime;
    lastTime = now;
    renderer.drawFrame(delta, now);
    requestAnimationFrame(draw);
  };

  requestAnimationFrame(draw);
  const saveRuntimeState = async () => {
    if (!actors.length) return;
    const payload = {
      version: 1,
      updatedAt: Date.now(),
      ponies: {},
      houses: {},
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
    houseStates.forEach((state, houseId) => {
      payload.houses[houseId] = {
        condition: state.condition,
        status: state.status,
        repairingUntil: state.repairingUntil || 0,
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

  const getTooltipLabel = (hit) => {
    let label = hit.label;
    if (hit.item && hit.item.kind === "house") {
      const state = houseStates.get(hit.item.id);
      if (state) {
        const health = Math.round(state.condition * 100);
        const statusLabel = formatHouseStatus(state);
        label = `${label} — House health ${health}% (${statusLabel})`;
      }
    }
    return label;
  };

  bindMapUI({
    ponyMap,
    mapTooltip,
    mapStatus,
    mapData,
    mapWidth,
    mapHeight,
    getScale: () => scale,
    getStructureBounds: () => renderer.getStructureBounds(),
    getActors: () => actors,
    getCommandTarget: () => commandTarget,
    setCommandTarget: (actor) => {
      commandTarget = actor;
    },
    getTooltipLabel,
    getStructureLabel,
    updateAccessPointForItem,
    showCommandMenu,
    hideCommandMenu,
    assignManualTask,
    setLastPointer: (point) => {
      lastPointer = point;
    },
    dragState,
  });
};
