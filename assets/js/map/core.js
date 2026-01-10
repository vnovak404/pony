// Pony Parade: map rendering and interactions.

import { ponyMap, mapStatus, mapTooltip } from "../dom.js";
import { getWebpCandidates, loadImageWithFallback, loadJson } from "../utils.js";
import { HAS_API, apiUrl } from "../api_mode.js";
import { createActors, createActorRenderer } from "./actors.js";
import { createRenderer } from "./draw.js";
import { bindMapUI } from "./ui.js";
import { MAP_CONFIG, SUPPLY_SOURCE_BY_TYPE, SUPPLY_TYPE_REPAIR } from "./config.js";
import { buildLocationIndex, createStructureLabeler } from "./locations.js";
import { createInventoryState } from "./inventory.js";
import { createSpotHelpers, createSpotIndex } from "./spots.js";
import { createRoadNetwork } from "./roads.js";
import { createHouseState } from "./houses.js";
import { createAccessPoints } from "./access.js";
import { createNeedHelpers } from "./needs.js";
import { createTaskHelpers } from "./tasks.js";
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
    WORK_COOLDOWN_MIN,
    WORK_COOLDOWN_MAX,
    WORK_RESTOCK_MIN,
    WORK_RESTOCK_MAX,
    CRITICAL_HEALTH_LEVEL,
    CRITICAL_NEED_LEVEL,
    MANUAL_SPEED_MULTIPLIER,
    STATE_SAVE_INTERVAL,
  } = MAP_CONFIG;

  const locationIndex = buildLocationIndex(locations);
  const getStructureLabel = createStructureLabeler(locationIndex);

  const {
    inventoryState,
    getSpotInventory,
    isSpotStocked,
    consumeSpotInventory,
    restockSpotInventory,
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
    SUPPLY_TYPE_REPAIR,
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

  const structureSprites = await loadStructureSprites({
    objects,
    loadImageWithFallback,
  });

  const decorItems = (mapData.layers.decor && mapData.layers.decor.items) || [];
  const decorSprites = await loadDecorSprites({ decorItems, loadImageWithFallback });

  const statusIcons = await loadStatusIcons({ loadImageWithFallback });
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

  const { actors } = createActors({
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
  const actorBySlug = new Map();
  actors.forEach((actor) => {
    const slug = actor.sprite?.pony?.slug;
    if (slug) {
      actorBySlug.set(slug, actor);
    }
  });
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
    consumeSpotInventory,
    restockSpotInventory,
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
    objects,
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

  let lastTime = performance.now();
  const draw = (now) => {
    const delta = now - lastTime;
    lastTime = now;
    renderer.drawFrame(delta, now);
    requestAnimationFrame(draw);
  };

  requestAnimationFrame(draw);

  const runtimeSaver = createRuntimeSaver({
    HAS_API,
    apiUrl,
    actors,
    houseStates: houseState.houseStates,
    inventoryState,
    intervalMs: STATE_SAVE_INTERVAL,
  });
  runtimeSaver.start();

  const getTooltipLabel = createTooltipLabel({
    houseStates: houseState.houseStates,
    formatHouseStatus: houseState.formatHouseStatus,
    getSpotInventory,
    isFoodSpot: spotHelpers.isFoodSpot,
    isDrinkSpot: spotHelpers.isDrinkSpot,
    isFunSpot: spotHelpers.isFunSpot,
    isSupplySource: spotHelpers.isSupplySource,
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
    setLastPointer: (point) => {
      lastPointer = point;
    },
    dragState,
  });
};
