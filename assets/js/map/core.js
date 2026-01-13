// Pony Parade: map rendering and interactions.

import { ponyMap, mapStatus, mapTooltip } from "../dom.js";
import { getWebpCandidates, loadImageWithFallback, loadJson } from "../utils.js";
import { HAS_API, apiUrl } from "../api_mode.js";
import { createActorPipeline } from "./actor-pipeline.js";
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
  LOCATION_SERVICE_ICONS,
  LOCATION_UPKEEP_ICONS,
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
  loadStatusIcons,
  loadStructureSprites,
} from "./assets.js";
import { createCommandMenu } from "./command-menu.js";
import { createMagicWand } from "./magic-wand.js";
import { createPonyLoader } from "./pony-loader.js";
import { createSupplyLogger } from "./supply-metrics.js";
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
  const magicWand = createMagicWand({
    mapStatus,
    inventoryState,
    ingredientState,
    houseStates: houseState.houseStates,
    actors,
  });
  const quickbar = document.getElementById("pony-quickbar");
  magicWand.bindMagicWandButton(quickbar);
  const ponyLoader = createPonyLoader({
    ponies,
    loadImageWithFallback,
    loadJson,
    mapStatus,
    roadSegments: roadNetwork.roadSegments,
    mapWidth,
    runtimeState,
    maxActors: MAX_ACTORS,
    eatThresholdDefault: EAT_THRESHOLD_DEFAULT,
    drinkThresholdDefault: DRINK_THRESHOLD_DEFAULT,
    funThresholdDefault: BOREDOM_THRESHOLD_DEFAULT,
    healthThresholdDefault: HEALTH_THRESHOLD_DEFAULT,
    actors,
    actorBySlug,
    commandMenu,
  });

  const { drawActors } = createActorPipeline({
    ctx,
    mapData,
    ASSET_SCALE,
    actors,
    statusIcons,
    getScale,
    getLastPointer: () => lastPointer,
    isLabelsEnabled: () => labelsEnabled,
    commandMenu,
    houseState,
    innObject,
    spotIndex,
    spotHelpers,
    accessPoints,
    roadNetwork,
    taskHelpers,
    needHelpers,
    supplyProducers,
    inventory: {
      getSpotInventory,
      getIngredientEntry,
      consumeIngredients,
      consumeSpotInventory,
      restockSpotInventory,
      restockIngredient,
    },
    vfxState,
    getSpotOffset,
    config: MAP_CONFIG,
    supplyConfig: {
      SUPPLY_RECIPES_BY_LOCATION,
      SUPPLY_RECIPES_BY_TYPE,
      PRODUCER_INGREDIENT_OUTPUTS,
      INGREDIENT_WORK_DURATION_MULTIPLIERS,
      INGREDIENT_RESTOCK_MULTIPLIERS,
      INGREDIENT_ICON_MAP,
      INGREDIENT_SUPPLY_TYPES,
      INGREDIENT_DESTINATIONS,
      UNLIMITED_INGREDIENTS,
    },
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

  const supplyLogger = createSupplyLogger({
    hasApi: HAS_API,
    actors,
    supplySources,
    getStructureLabel,
    getSpotIngredients,
    intervalMs: 30000,
  });

  let lastTime = performance.now();
  const draw = (now) => {
    const delta = now - lastTime;
    lastTime = now;
    renderer.drawFrame(delta, now);
    supplyLogger.logSupplyStatus(now);
    requestAnimationFrame(draw);
  };

  requestAnimationFrame(draw);
  void ponyLoader.loadPonyActors();

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
    locationServiceIcons: LOCATION_SERVICE_ICONS,
    locationUpkeepIcons: LOCATION_UPKEEP_ICONS,
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
    applyMagicWand: magicWand.applyMagicWand,
    setLastPointer: (point) => {
      lastPointer = point;
    },
    dragState,
  });

  const handleSpeechCommand = (event) => {
    const detail = event?.detail || {};
    const command = detail.command;
    if (!command) return;
    const ingredient = detail.ingredient || null;
    const slug = (detail.ponySlug || "").toLowerCase().replace(/\s+/g, "-");
    let actor = slug ? actorBySlug.get(slug) : null;
    if (!actor) {
      actor = commandMenu.getCommandTarget() || actors[0];
    }
    if (!actor) {
      if (mapStatus) {
        mapStatus.textContent = "No pony available for that action.";
      }
      return;
    }
    if (ingredient) {
      taskHelpers.assignManualTask(actor, { command, ingredient });
    } else {
      taskHelpers.assignManualTask(actor, command);
    }
    if (mapStatus && slug) {
      mapStatus.textContent = `Sent ${actor.sprite?.pony?.name || "pony"} to ${command}.`;
    }
  };

  document.addEventListener("pony-speech-command", handleSpeechCommand);
};
