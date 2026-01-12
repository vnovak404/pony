// Pony Parade: map rendering and interactions.

import { ponyMap, mapStatus, mapTooltip } from "../dom.js";
import { getWebpCandidates, loadImageWithFallback, loadJson } from "../utils.js";
import { HAS_API, apiUrl } from "../api_mode.js";
import { createActors, createActorRenderer } from "./actors.js";
import { createRenderer } from "./draw.js";
import { bindMapUI } from "./ui.js";
import {
  MAP_CONFIG,
  SUPPLY_SOURCE_BY_TYPE,
  SUPPLY_TYPE_FOOD,
  SUPPLY_TYPE_DRINK,
  SUPPLY_TYPE_REPAIR,
  SUPPLY_RECIPES_BY_LOCATION,
  SUPPLY_RECIPES_BY_TYPE,
  PRODUCER_INGREDIENT_OUTPUTS,
  INGREDIENT_WORK_DURATION_MULTIPLIERS,
  INGREDIENT_RESTOCK_MULTIPLIERS,
  INGREDIENT_ICON_MAP,
  INGREDIENT_SUPPLY_TYPES,
  INGREDIENT_DESTINATIONS,
  UNLIMITED_INGREDIENTS,
} from "./config.js";
import { buildLocationIndex, createStructureLabeler } from "./locations.js";
import { createInventoryState } from "./inventory.js";
import { createSpotHelpers, createSpotIndex } from "./spots.js";
import { createRoadNetwork } from "./roads.js";
import { createHouseState } from "./houses.js";
import { createAccessPoints } from "./access.js";
import { createNeedHelpers } from "./needs.js";
import { createTaskHelpers } from "./tasks.js";
import { createDecorPlan } from "./decor.js";
import { createSupplyHelpers } from "./actors/supply.js";
import {
  loadDecorSprites,
  loadPonySprites,
  loadStatusIcons,
  loadStructureSprites,
} from "./assets.js";
import { createCommandMenu } from "./command-menu.js";
import { createVfxState } from "./vfx.js";
import { createRuntimeSaver } from "./runtime.js";
import {
  createDragState,
  createMapScale,
  createSpotOffset,
  createTooltipLabel,
  structureScale,
} from "./helpers.js";

export const initMap = async (mapData, ponies, locations, runtimeState) => {
  if (!ponyMap) return;
  const ctx = ponyMap.getContext("2d");
  if (!ctx) return;

  const mapWidth = mapData.meta.width * mapData.meta.tileSize;
  const mapHeight = mapData.meta.height * mapData.meta.tileSize;
  const {
    MAX_ACTORS,
    ASSET_SCALE,
    HOUSE_REPAIR_THRESHOLD,
    HOUSE_CONSTRUCTION_THRESHOLD,
    WORK_RESTOCK_THRESHOLD,
    BOREDOM_THRESHOLD_DEFAULT,
    HUNGER_RATE,
    THIRST_RATE,
    BOREDOM_RATE,
    HEALTH_DECAY_RATE,
    HEALTH_THRESHOLD_DEFAULT,
    EAT_THRESHOLD_DEFAULT,
    DRINK_THRESHOLD_DEFAULT,
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
    VET_RADIUS_TILES,
    VET_DURATION_MIN,
    VET_DURATION_MAX,
    VET_COOLDOWN_MIN,
    VET_COOLDOWN_MAX,
    FUN_RADIUS_TILES,
    FUN_DURATION_MIN,
    FUN_DURATION_MAX,
    FUN_COOLDOWN_MIN,
    FUN_COOLDOWN_MAX,
    WORK_RADIUS_TILES,
    WORK_DURATION_PER_ITEM_MIN,
    WORK_DURATION_PER_ITEM_MAX,
    WORK_ACTION_DURATION_MAX,
    WORK_COOLDOWN_MIN,
    WORK_COOLDOWN_MAX,
    WORK_RESTOCK_MIN,
    WORK_RESTOCK_MAX,
    CRITICAL_HEALTH_LEVEL,
    CRITICAL_NEED_LEVEL,
    REPAIR_DURATION_MIN,
    REPAIR_DURATION_MAX,
    MANUAL_SPEED_MULTIPLIER,
    STATE_SAVE_INTERVAL,
  } = MAP_CONFIG;

  const locationIndex = buildLocationIndex(locations);
  const getStructureLabel = createStructureLabeler(locationIndex);

  const {
    inventoryState,
    ingredientState,
    getSpotInventory,
    getIngredientEntry,
    getSpotIngredients,
    isSpotStocked,
    consumeSpotInventory,
    restockSpotInventory,
    restockIngredient,
    consumeIngredients,
  } = createInventoryState({ locationIndex, runtimeState });

  const roads = (mapData.layers.roads && mapData.layers.roads.segments) || [];
  const objects = mapData.layers.objects || [];
  const innObject =
    objects.find((item) => item.id === "inn" || item.locationId === "moonlit-inn") ||
    null;
  const isInnObject = (item) =>
    Boolean(item && (item.id === "inn" || item.locationId === "moonlit-inn"));

  const spotHelpers = createSpotHelpers(locationIndex);
  const spotIndex = createSpotIndex({
    objects,
    getSpotInventory,
    helpers: spotHelpers,
  });

  const {
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
  } = spotIndex;

  const roadNetwork = createRoadNetwork({ mapData, roads, mapWidth, mapHeight });

  const { decorItems, signpostObjects } = createDecorPlan({
    mapData,
    objects,
    roadSegments: roadNetwork.roadSegments,
    getStructureLabel,
  });
  const renderObjects = signpostObjects.length
    ? [...objects, ...signpostObjects]
    : objects;

  const houseState = createHouseState({
    mapData,
    objects,
    runtimeState,
    config: MAP_CONFIG,
  });

  const getScale = createMapScale({ ponyMap, mapWidth, mapHeight, ctx });
  const vfxState = createVfxState({
    ctx,
    mapData,
    ASSET_SCALE,
    getScale,
    objects,
  });

  const accessPoints = createAccessPoints({
    mapData,
    innObject,
    houseObjects: houseState.houseObjects,
    foodSpots,
    drinkSpots,
    funSpots,
    healthSpots,
    supplySpots,
    isFoodSpot: spotHelpers.isFoodSpot,
    isDrinkSpot: spotHelpers.isDrinkSpot,
    isFunSpot: spotHelpers.isFunSpot,
    isHealthSpot: spotHelpers.isHealthSpot,
    isSupplySpot: spotHelpers.isSupplySpot,
    isInnObject,
    computeAccessPoint: roadNetwork.computeAccessPoint,
    updateLakeState: vfxState.updateLakeState,
  });

  const getSpotForLocationId = (locationId) => {
    if (!locationId) return null;
    return spotByLocationId.get(locationId) || null;
  };
  const getSupplySourceForType = (type) => {
    const locationId = SUPPLY_SOURCE_BY_TYPE[type];
    return locationId ? getSpotForLocationId(locationId) : null;
  };
  const supplyHelpers = createSupplyHelpers({
    supplyProducers,
    getSupplyTypesForSpot: spotHelpers.getSupplyTypesForSpot,
    getSupplySpotAccessPoint: accessPoints.getSupplySpotAccessPoint,
    getSupplySourceForType,
    getSpotForLocationId,
    getSpotInventory,
    getIngredientEntry,
    consumeSpotInventory,
    consumeIngredients,
    WORK_RESTOCK_THRESHOLD,
    isFoodSpot: spotHelpers.isFoodSpot,
    isDrinkSpot: spotHelpers.isDrinkSpot,
    SUPPLY_RECIPES_BY_LOCATION,
    SUPPLY_RECIPES_BY_TYPE,
    PRODUCER_INGREDIENT_OUTPUTS,
    INGREDIENT_DESTINATIONS,
    UNLIMITED_INGREDIENTS,
  });

  const needHelpers = createNeedHelpers({
    locationIndex,
    foodSpots,
    drinkSpots,
    funSpots,
    healthSpots,
    getFoodSpotAccessPoint: accessPoints.getFoodSpotAccessPoint,
    getDrinkSpotAccessPoint: accessPoints.getDrinkSpotAccessPoint,
    getFunSpotAccessPoint: accessPoints.getFunSpotAccessPoint,
    getHealthSpotAccessPoint: accessPoints.getHealthSpotAccessPoint,
    isSpotStocked,
    houseStates: houseState.houseStates,
    innObject,
    getInnTargetPoint: accessPoints.getInnTargetPoint,
    CRITICAL_HEALTH_LEVEL,
    CRITICAL_NEED_LEVEL,
  });

  const getSpotOffset = createSpotOffset(mapData);

  const taskHelpers = createTaskHelpers({
    mapStatus,
    getStructureLabel,
    findRepairTarget: houseState.findRepairTarget,
    houseStates: houseState.houseStates,
    innObject,
    foodSpotById,
    drinkSpotById,
    funSpotById,
    healthSpotById,
    foodSpots,
    drinkSpots,
    funSpots,
    healthSpots,
    spotByLocationId,
    getSupplyTypesForSpot: spotHelpers.getSupplyTypesForSpot,
    getIngredientEntry,
    pickSupplyProducer: supplyHelpers.pickSupplyProducer,
    getFoodTargetPoint: accessPoints.getFoodTargetPoint,
    getDrinkTargetPoint: accessPoints.getDrinkTargetPoint,
    getFunTargetPoint: accessPoints.getFunTargetPoint,
    getHealthTargetPoint: accessPoints.getHealthTargetPoint,
    getSupplySpotAccessPoint: accessPoints.getSupplySpotAccessPoint,
    getHouseTargetPoint: accessPoints.getHouseTargetPoint,
    getInnTargetPoint: accessPoints.getInnTargetPoint,
    isFoodSpot: spotHelpers.isFoodSpot,
    isDrinkSpot: spotHelpers.isDrinkSpot,
    isFunSpot: spotHelpers.isFunSpot,
    isSupplySpot: spotHelpers.isSupplySpot,
    getSpotInventory,
    WORK_RESTOCK_THRESHOLD,
    HOUSE_REPAIR_THRESHOLD,
    SUPPLY_SOURCE_BY_TYPE,
    SUPPLY_TYPE_FOOD,
    SUPPLY_TYPE_DRINK,
    SUPPLY_TYPE_REPAIR,
    INGREDIENT_DESTINATIONS,
    INGREDIENT_SUPPLY_TYPES,
    pickFoodSpot: needHelpers.pickFoodSpot,
    pickDrinkSpot: needHelpers.pickDrinkSpot,
    pickFunSpot: needHelpers.pickFunSpot,
    pickHealthSpot: needHelpers.pickHealthSpot,
  });

  let labelsEnabled = true;
  const mapLabelToggle = document.getElementById("map-label-toggle");
  if (mapLabelToggle) {
    labelsEnabled = mapLabelToggle.checked;
    mapLabelToggle.addEventListener("change", () => {
      labelsEnabled = mapLabelToggle.checked;
    });
  }

  const [structureSprites, decorSprites, statusIcons] = await Promise.all([
    loadStructureSprites({ objects: renderObjects, loadImageWithFallback }),
    loadDecorSprites({ decorItems, loadImageWithFallback }),
    loadStatusIcons({ loadImageWithFallback }),
  ]);

  const actors = [];
  const actorBySlug = new Map();
  const commandMenu = createCommandMenu({
    ponyMap,
    actors,
    actorBySlug,
    getWebpCandidates,
    getStructureLabel,
    getSpotForLocationId: taskHelpers.getSpotForLocationId,
    foodSpotById,
    drinkSpotById,
    funSpotById,
    healthSpotById,
    housesById: houseState.housesById,
    innObject,
  });
  commandMenu.renderPonyQuickbar();
  commandMenu.bindPonyQuickbar();

  let lastPointer = null;
  const applyMagicWand = () => {
    inventoryState.forEach((entry) => {
      if (!entry) return;
      entry.current = entry.max;
    });
    ingredientState.forEach((entry) => {
      if (!entry) return;
      entry.current = entry.max;
    });
    houseState.houseStates.forEach((state) => {
      if (!state) return;
      state.condition = 1;
      state.status = "ok";
      state.repairingUntil = 0;
      state.repairingBy = null;
    });
    actors.forEach((actor) => {
      if (!actor || !actor.stats) return;
      actor.stats.health = 100;
      actor.stats.hunger = 0;
      actor.stats.thirst = 0;
      actor.stats.boredom = 0;
      actor.stats.tiredness = 0;
      actor.task = null;
      actor.pendingRepairId = null;
      actor.path = null;
      actor.pathIndex = 0;
      actor.pathTargetKey = null;
      actor.pathBlockedUntil = 0;
      actor.sleepUntil = 0;
      actor.sleepSpotIndex = null;
      actor.sleepSpotOwner = null;
      actor.restTarget = null;
      actor.workUntil = 0;
      actor.workTargetId = null;
      actor.repairUntil = 0;
      actor.repairTargetId = null;
      actor.eatUntil = 0;
      actor.eatTargetId = null;
      actor.drinkUntil = 0;
      actor.drinkTargetId = null;
      actor.funUntil = 0;
      actor.funTargetId = null;
      actor.vetUntil = 0;
      actor.vetTargetId = null;
      actor.workCooldownUntil = 0;
      actor.eatCooldownUntil = 0;
      actor.drinkCooldownUntil = 0;
      actor.funCooldownUntil = 0;
      actor.vetCooldownUntil = 0;
      actor.homeCooldownUntil = 0;
      actor.innCooldownUntil = 0;
    });
    if (mapStatus) {
      mapStatus.textContent = "Magic wand: everything is restored.";
    }
  };
  const quickbar = document.getElementById("pony-quickbar");
  const magicButton = quickbar
    ? quickbar.querySelector('[data-quickbar-action="magic"]')
    : null;
  if (magicButton) {
    magicButton.addEventListener("click", (event) => {
      event.preventDefault();
      applyMagicWand();
    });
  }

  const loadPonyActors = async () => {
    if (mapStatus) {
      mapStatus.textContent = "Loading ponies...";
    }
    const sprites = await loadPonySprites({
      ponies,
      loadImageWithFallback,
      loadJson,
    });
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
    const { actors: newActors } = createActors({
      sprites: activeSprites,
      roadSegments: roadNetwork.roadSegments,
      mapWidth,
      runtimeState,
      maxActors: MAX_ACTORS,
      eatThresholdDefault: EAT_THRESHOLD_DEFAULT,
      drinkThresholdDefault: DRINK_THRESHOLD_DEFAULT,
      funThresholdDefault: BOREDOM_THRESHOLD_DEFAULT,
      healthThresholdDefault: HEALTH_THRESHOLD_DEFAULT,
    });
    actors.splice(0, actors.length, ...newActors);
    actorBySlug.clear();
    actors.forEach((actor) => {
      const slug = actor.sprite?.pony?.slug;
      if (slug) {
        actorBySlug.set(slug, actor);
      }
    });
    commandMenu.renderPonyQuickbar();
  };

  const { drawActors } = createActorRenderer({
    ctx,
    mapData,
    ASSET_SCALE,
    actors,
    statusIcons,
    getScale,
    getLastPointer: () => lastPointer,
    isLabelsEnabled: () => labelsEnabled,
    resolveTaskLabel: commandMenu.resolveTaskLabel,
    releaseInnSpot: houseState.releaseInnSpot,
    releaseHouseSpot: houseState.releaseHouseSpot,
    claimInnSpot: houseState.claimInnSpot,
    claimHouseSpot: houseState.claimHouseSpot,
    innSleepSpots: houseState.innSleepSpots,
    housesById: houseState.housesById,
    houseStates: houseState.houseStates,
    innObject,
    foodSpotById,
    drinkSpotById,
    funSpotById,
    healthSpotById,
    foodSpots,
    drinkSpots,
    funSpots,
    healthSpots,
    getSpotInventory,
    getIngredientEntry,
    consumeIngredients,
    consumeSpotInventory,
    restockSpotInventory,
    restockIngredient,
    supplyProducers,
    getSpotForLocationId: taskHelpers.getSpotForLocationId,
    getSupplySourceForType: taskHelpers.getSupplySourceForType,
    getSupplySpotAccessPoint: accessPoints.getSupplySpotAccessPoint,
    getSupplyTypesForSpot: spotHelpers.getSupplyTypesForSpot,
    getHouseTargetPoint: accessPoints.getHouseTargetPoint,
    getFoodSpotAccessPoint: accessPoints.getFoodSpotAccessPoint,
    getDrinkSpotAccessPoint: accessPoints.getDrinkSpotAccessPoint,
    getFunSpotAccessPoint: accessPoints.getFunSpotAccessPoint,
    getHealthSpotAccessPoint: accessPoints.getHealthSpotAccessPoint,
    getSpotOffset,
    findRepairTarget: houseState.findRepairTarget,
    getCriticalNeedTask: needHelpers.getCriticalNeedTask,
    pickNeedCandidate: needHelpers.pickNeedCandidate,
    pickFoodSpot: needHelpers.pickFoodSpot,
    pickDrinkSpot: needHelpers.pickDrinkSpot,
    pickFunSpot: needHelpers.pickFunSpot,
    pickHealthSpot: needHelpers.pickHealthSpot,
    getTaskTargetPoint: taskHelpers.getTaskTargetPoint,
    snapActorToNearestSegment: roadNetwork.snapActorToNearestSegment,
    findNearestRoadTile: roadNetwork.findNearestRoadTile,
    buildTilePath: roadNetwork.buildTilePath,
    tileKey: roadNetwork.tileKey,
    advanceAlongPath: roadNetwork.advanceAlongPath,
    isOffMap: roadNetwork.isOffMap,
    endpointIndex: roadNetwork.endpointIndex,
    endpointKey: roadNetwork.endpointKey,
    pickNextSegment: roadNetwork.pickNextSegment,
    roadSegments: roadNetwork.roadSegments,
    vfxByKey: vfxState.vfxByKey,
    vfxVideos: vfxState.vfxVideos,
    VFX_REGISTRY: vfxState.VFX_REGISTRY,
    setVideoActive: vfxState.setVideoActive,
    drawVideoOverlay: vfxState.drawVideoOverlay,
    lakeState: vfxState.lakeState,
    isFoodSpot: spotHelpers.isFoodSpot,
    isDrinkSpot: spotHelpers.isDrinkSpot,
    isFunSpot: spotHelpers.isFunSpot,
    isSupplySpot: spotHelpers.isSupplySpot,
    SUPPLY_RECIPES_BY_LOCATION,
    SUPPLY_RECIPES_BY_TYPE,
    PRODUCER_INGREDIENT_OUTPUTS,
    INGREDIENT_WORK_DURATION_MULTIPLIERS,
    INGREDIENT_RESTOCK_MULTIPLIERS,
    INGREDIENT_ICON_MAP,
    INGREDIENT_SUPPLY_TYPES,
    INGREDIENT_DESTINATIONS,
    UNLIMITED_INGREDIENTS,
    HUNGER_RATE,
    THIRST_RATE,
    BOREDOM_RATE,
    HEALTH_DECAY_RATE,
    HEALTH_THRESHOLD_DEFAULT,
    EAT_THRESHOLD_DEFAULT,
    DRINK_THRESHOLD_DEFAULT,
    BOREDOM_THRESHOLD_DEFAULT,
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
    WORK_RADIUS_TILES,
    WORK_DURATION_PER_ITEM_MIN,
    WORK_DURATION_PER_ITEM_MAX,
    WORK_ACTION_DURATION_MAX,
    WORK_COOLDOWN_MIN,
    WORK_COOLDOWN_MAX,
    WORK_RESTOCK_MIN,
    WORK_RESTOCK_MAX,
    WORK_RESTOCK_THRESHOLD,
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
    REPAIR_DURATION_MIN,
    REPAIR_DURATION_MAX,
    MANUAL_SPEED_MULTIPLIER,
  });

  const renderer = createRenderer({
    ctx,
    ponyMap,
    mapData,
    getScale,
    ASSET_SCALE,
    roadSegments: roadNetwork.roadSegments,
    decorItems,
    decorSprites,
    objects: renderObjects,
    structureSprites,
    structureScale,
    houseStates: houseState.houseStates,
    getStructureLabel,
    getSpotInventory,
    isInventorySpot: spotHelpers.isInventorySpot,
    updateHouseStates: houseState.updateHouseStates,
    renderActors: drawActors,
    commandMenu: commandMenu.commandMenu,
    getCommandTarget: commandMenu.getCommandTarget,
    updateCommandStats: commandMenu.updateCommandStats,
    lastCommandStatsUpdateRef: commandMenu.lastCommandStatsUpdate,
  });

  let lastSupplyLog = 0;
  const SUPPLY_LOG_INTERVAL = 30000;
  const logSupplyStatus = (now) => {
    if (!HAS_API) return;
    if (now - lastSupplyLog < SUPPLY_LOG_INTERVAL) return;
    lastSupplyLog = now;
    const timeLabel = new Date().toLocaleTimeString();
    const taskCounts = {
      supply: 0,
      restock: 0,
      repair: 0,
      work: 0,
    };
    const supplyByIngredient = {};
    const restockByType = {};
    actors.forEach((actor) => {
      const task = actor.task;
      if (!task) return;
      if (task.type === "supply") {
        taskCounts.supply += 1;
        const ingredient = task.ingredient || "mixed";
        supplyByIngredient[ingredient] =
          (supplyByIngredient[ingredient] || 0) + 1;
      }
      if (task.type === "restock") {
        taskCounts.restock += 1;
        const type = task.supplyType || "unknown";
        restockByType[type] = (restockByType[type] || 0) + 1;
      }
      if (task.type === "repair") {
        taskCounts.repair += 1;
      }
      if (task.type === "work") {
        taskCounts.work += 1;
      }
    });
    console.groupCollapsed(`[Supply Metrics ${timeLabel}]`);
    console.log("Active tasks", {
      ...taskCounts,
      supplyByIngredient,
      restockByType,
    });
    if (supplySources.length) {
      console.log("Supply sources");
      supplySources.forEach((spot) => {
        const label = getStructureLabel(spot);
        const inventory = getSpotInventory(spot);
        const ingredients = getSpotIngredients(spot);
        const ingredientSummary = ingredients.length
          ? ingredients
              .map(
                (entry) => `${entry.ingredient}:${entry.current}/${entry.max}`
              )
              .join(", ")
          : "none";
        console.log(
          `${label} (${spot.locationId || spot.id}) stock ${inventory?.current ?? 0}/${
            inventory?.max ?? 0
          } | ingredients ${ingredientSummary}`
        );
      });
    }
    console.groupEnd();
  };

  let lastTime = performance.now();
  const draw = (now) => {
    const delta = now - lastTime;
    lastTime = now;
    renderer.drawFrame(delta, now);
    logSupplyStatus(now);
    requestAnimationFrame(draw);
  };

  requestAnimationFrame(draw);
  void loadPonyActors();

  const runtimeSaver = createRuntimeSaver({
    HAS_API,
    apiUrl,
    actors,
    houseStates: houseState.houseStates,
    inventoryState,
    ingredientState,
    intervalMs: STATE_SAVE_INTERVAL,
  });
  runtimeSaver.start();

  const getTooltipLabel = createTooltipLabel({
    houseStates: houseState.houseStates,
    formatHouseStatus: houseState.formatHouseStatus,
    getSpotInventory,
    getSpotIngredients,
    isFoodSpot: spotHelpers.isFoodSpot,
    isDrinkSpot: spotHelpers.isDrinkSpot,
    isFunSpot: spotHelpers.isFunSpot,
    isSupplySource: spotHelpers.isSupplySource,
    isSupplyProducer: spotHelpers.isSupplyProducer,
    ingredientIconMap: INGREDIENT_ICON_MAP,
    producerOutputs: PRODUCER_INGREDIENT_OUTPUTS,
    recipesByLocation: SUPPLY_RECIPES_BY_LOCATION,
    recipesByType: SUPPLY_RECIPES_BY_TYPE,
  });

  const dragState = createDragState();

  bindMapUI({
    ponyMap,
    mapTooltip,
    mapStatus,
    mapData,
    mapWidth,
    mapHeight,
    getScale,
    getStructureBounds: () => renderer.getStructureBounds(),
    getActors: () => actors,
    getCommandTarget: commandMenu.getCommandTarget,
    setCommandTarget: commandMenu.setCommandTarget,
    getTooltipLabel,
    getStructureLabel,
    updateAccessPointForItem: accessPoints.updateAccessPointForItem,
    showCommandMenu: commandMenu.showCommandMenu,
    hideCommandMenu: commandMenu.hideCommandMenu,
    assignManualTask: taskHelpers.assignManualTask,
    applyMagicWand,
    setLastPointer: (point) => {
      lastPointer = point;
    },
    dragState,
  });
};
