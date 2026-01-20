import { drawFrame, drawError, updatePlayerAnimation } from "./render.js";
import { findPath } from "./pathfinding.js";

const PLAYER_SCALE = 1.5;
const BASE_SPEED = 120;
const FOG_RADIUS = 3;
const FOG_DIM_ALPHA = 0.55;
const FOG_HIDDEN_ALPHA = 0.92;
const IS_TOUCH_DEVICE =
  typeof window !== "undefined" &&
  ("ontouchstart" in window || navigator.maxTouchPoints > 0);
const DOUBLE_TAP_MS = 320;

export async function loadRuntime({
  missionPath,
  defaultMission,
  selectedKey,
  elements,
  playerSpriteMetaUrl,
  playerSpriteSheetUrl,
}) {
  const canvas = elements.canvas;
  const ctx = elements.ctx || (canvas ? canvas.getContext("2d") : null);
  if (!canvas || !ctx) return null;

  let missionConfig = null;
  let missionBaseUrl = null;
  let assetRootUrl = null;
  let tileDefs = new Map();
  let objectDefs = new Map();
  let tileImages = new Map();
  let objectSprites = new Map();
  let mapWidth = 0;
  let mapHeight = 0;
  let tileSize = 64;
  let tiles = [];
  let objects = [];
  let activePath = [];
  let interactable = null;
  let dialogOpen = false;
  let playerSprite = null;
  let lastFrameTime = 0;
  let visibleTiles = new Set();
  let discoveredTiles = new Set();
  let blockedTiles = new Set();
  let blockedByObjects = new Set();
  let walkableOverrides = new Set();
  let hoverTarget = null;
  let heldKeys = new Set();
  let holdState = null;
  let touchHoldActive = false;
  let touchHoldPointerId = null;
  let touchHoldTileKey = null;
  let suppressClick = false;
  let lastTapTime = 0;
  let lastTapTileKey = null;
  let interactionHandler = null;
  let visibilityHandler = null;

  const player = {
    tx: 0,
    ty: 0,
    px: 0,
    py: 0,
    facing: 1,
  };

  const camera = { x: 0, y: 0 };

  const renderState = {
    ctx,
    canvas,
    tileSize,
    mapWidth,
    mapHeight,
    tiles,
    tileDefs,
    tileImages,
    camera,
    objects,
    objectSprites,
    player,
    playerSprite,
    playerScale: PLAYER_SCALE,
    activePath,
    interactable: null,
    time: 0,
    isTileDiscovered,
    isTileVisible,
    fogHiddenAlpha: FOG_HIDDEN_ALPHA,
    fogDimAlpha: FOG_DIM_ALPHA,
    getObjectSprite,
  };

  canvas.addEventListener("click", handleClick);
  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerUp);
  canvas.addEventListener("pointerleave", handlePointerUp);
  canvas.addEventListener("mousemove", handleHover);
  canvas.addEventListener("mouseleave", clearHover);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  elements.dialogCloseBtn?.addEventListener("click", closeDialog);
  elements.returnBtn?.addEventListener("click", returnToWorldMap);

  try {
    const resolvedMission =
      missionPath ||
      new URLSearchParams(window.location.search).get("mission") ||
      (selectedKey ? localStorage.getItem(selectedKey) : null) ||
      defaultMission;
    const missionUrl = new URL(resolvedMission, window.location.href).toString();
    missionBaseUrl = missionUrl;
    const missionResponse = await fetch(missionUrl, { cache: "no-store" });
    if (!missionResponse.ok) {
      throw new Error(`Mission load failed: ${missionResponse.status}`);
    }
    missionConfig = await missionResponse.json();
    assetRootUrl = resolveMissionUrl(missionConfig.assetRoot || "./", true);

    const [mapData, tilesData, objectsData] = await Promise.all([
      fetchJson(resolveMissionUrl(missionConfig.map)),
      fetchJson(resolveMissionUrl(missionConfig.tiles)),
      fetchJson(resolveMissionUrl(missionConfig.objects)),
    ]);

    hydrateTiles(tilesData);
    hydrateObjects(objectsData, mapData);
    hydrateMap(mapData);
    await loadPlayerSprite();
    resetFogOfWar();
    updateFogOfWar();
    updatePrompt();
  } catch (error) {
    console.error(error);
    drawError(ctx, canvas, "Adventure failed to load.");
    return null;
  }

  function resolveMissionUrl(path, ensureSlash = false) {
    if (!path) return null;
    const url = new URL(path, missionBaseUrl || window.location.href);
    if (ensureSlash && !url.pathname.endsWith("/")) {
      url.pathname = `${url.pathname}/`;
    }
    return url.toString();
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load ${url}: ${response.status}`);
    }
    return response.json();
  }

  function resolveAssetPath(asset) {
    if (!asset || !assetRootUrl) return "";
    if (asset.startsWith("data:") || asset.startsWith("http")) return asset;
    if (asset.startsWith("/adventures/")) {
      return new URL(asset.slice("/adventures/".length), assetRootUrl).toString();
    }
    if (asset.startsWith("/")) {
      return new URL(asset.slice(1), assetRootUrl).toString();
    }
    return new URL(asset, assetRootUrl).toString();
  }

  function hydrateTiles(tilesData) {
    tileDefs = new Map();
    tileImages = new Map();
    (tilesData.tiles || []).forEach((tile) => {
      tileDefs.set(tile.id, tile);
      if (tile.asset) {
        const image = new Image();
        image.src = resolveAssetPath(tile.asset);
        tileImages.set(tile.id, image);
      }
    });
    renderState.tileDefs = tileDefs;
    renderState.tileImages = tileImages;
  }

  function hydrateObjects(objectsData, mapData) {
    objectDefs = new Map();
    objectSprites = new Map();
    blockedByObjects = new Set();
    (objectsData.objects || []).forEach((entry) => {
      objectDefs.set(entry.type, entry);
    });
    objects = (mapData.objects || []).map((obj) => {
      const def = objectDefs.get(obj.type);
      const asset = def?.asset ? resolveAssetPath(def.asset) : "";
      if (asset && !objectSprites.has(obj.type)) {
        const image = new Image();
        image.src = asset;
        objectSprites.set(obj.type, image);
      }
      return {
        id: obj.id,
        type: obj.type,
        tx: obj.x,
        ty: obj.y,
        name: def?.name || obj.type,
        asset,
        categories: def?.categories || [],
        blocksMovement: Array.isArray(def?.categories)
          ? def.categories.includes("animal")
          : false,
        hidden: false,
        interaction: null,
      };
    });
    objects.forEach((obj) => {
      if (!obj.blocksMovement) return;
      blockedByObjects.add(tileKey(obj.tx, obj.ty));
    });
    renderState.objects = objects;
    renderState.objectSprites = objectSprites;
  }

  function hydrateMap(mapData) {
    mapWidth = mapData.width || 0;
    mapHeight = mapData.height || 0;
    tiles = Array.isArray(mapData.tiles) ? mapData.tiles : [];
    tileSize = missionConfig.tileSize || 64;
    const spawn = missionConfig.spawn || { tx: 0, ty: 0 };
    player.tx = spawn.tx;
    player.ty = spawn.ty;
    player.px = (spawn.tx + 0.5) * tileSize;
    player.py = (spawn.ty + 0.5) * tileSize;
    if (elements.titleEl) {
      const title = missionConfig.subtitle
        ? `${missionConfig.subtitle} - ${missionConfig.title}`
        : missionConfig.title || "Whispering Forest";
      elements.titleEl.textContent = title;
    }
    renderState.tileSize = tileSize;
    renderState.mapWidth = mapWidth;
    renderState.mapHeight = mapHeight;
    renderState.tiles = tiles;
  }

  async function loadPlayerSprite() {
    try {
      const response = await fetch(playerSpriteMetaUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Failed to load player sprite: ${response.status}`);
      }
      const data = await response.json();
      const image = new Image();
      image.src = playerSpriteSheetUrl;
      playerSprite = {
        image,
        frames: data.frames || {},
        animations: data.animations || {},
        fps: data.fps || {},
        action: "idle",
        frameIndex: 0,
        frameTimer: 0,
      };
      renderState.playerSprite = playerSprite;
    } catch (error) {
      console.error(error);
    }
  }

  function start() {
    requestAnimationFrame(loop);
  }

  function loop(timestamp) {
    const delta = lastFrameTime ? (timestamp - lastFrameTime) / 1000 : 1 / 60;
    lastFrameTime = timestamp;
    update(delta);
    renderState.time = timestamp;
    drawFrame(renderState);
    requestAnimationFrame(loop);
  }

  function update(delta) {
    updateMovement(delta);
    updateFogOfWar();
    updateCamera();
    updateInteractable();
    updateHold();
    if (visibilityHandler) {
      visibilityHandler(runtimeApi);
    }
    updatePlayerAnimation(renderState, delta);
  }

  function updateMovement(delta) {
    if (!activePath.length) return;
    const next = activePath[0];
    const target = tileCenter(next.tx, next.ty);
    const dx = target.x - player.px;
    const dy = target.y - player.py;
    const distance = Math.hypot(dx, dy);
    if (Math.abs(dx) > 0.1) {
      player.facing = dx < 0 ? -1 : 1;
    }
    const step = BASE_SPEED * delta;
    if (distance <= step) {
      player.px = target.x;
      player.py = target.y;
      player.tx = next.tx;
      player.ty = next.ty;
      activePath.shift();
    } else if (distance > 0) {
      player.px += (dx / distance) * step;
      player.py += (dy / distance) * step;
    }
  }

  function updateCamera() {
    const mapPixelWidth = mapWidth * tileSize;
    const mapPixelHeight = mapHeight * tileSize;
    camera.x = player.px - canvas.width / 2;
    camera.y = player.py - canvas.height / 2;
    camera.x = Math.max(0, Math.min(camera.x, mapPixelWidth - canvas.width));
    camera.y = Math.max(0, Math.min(camera.y, mapPixelHeight - canvas.height));
  }

  function updateInteractable() {
    if (dialogOpen) return;
    interactable = null;
    for (const obj of objects) {
      if (obj.hidden) continue;
      if (!obj.interaction) continue;
      if (!isTileVisible(obj.tx, obj.ty)) continue;
      const dx = Math.abs(player.tx - obj.tx);
      const dy = Math.abs(player.ty - obj.ty);
    if (Math.max(dx, dy) <= 1) {
      interactable = obj;
      break;
    }
  }
    renderState.interactable = interactable;
    updatePrompt();
  }

  function updatePrompt() {
    if (!elements.promptEl) return;
    if (interactable && !dialogOpen) {
      const baseLabel = interactable.interaction?.label || "Hold I to act";
      elements.promptEl.textContent = IS_TOUCH_DEVICE
        ? baseLabel
            .replace(/^Hold [A-Z] to /, "Double-tap to ")
            .replace(/^Hold [a-z] to /, "Double-tap to ")
        : baseLabel;
      elements.promptEl.removeAttribute("hidden");
    } else {
      elements.promptEl.setAttribute("hidden", "true");
    }
  }

  function updateHold() {
    if (!holdState) return;
    if (holdState.requiresKey && !heldKeys.has(holdState.key)) {
      cancelHold();
      return;
    }
    if (!interactable || interactable.id !== holdState.targetId) {
      cancelHold();
      return;
    }
    const elapsed = performance.now() - holdState.startedAt;
    const ratio = Math.min(elapsed / holdState.durationMs, 1);
    updateActionProgress(holdState.label, ratio);
    if (ratio >= 1) {
      if (interactionHandler) {
        interactionHandler(interactable, holdState.action, runtimeApi);
      }
      cancelHold();
    }
  }

  function startHold(target, options = {}) {
    if (!target?.interaction) return;
    holdState = {
      targetId: target.id,
      key: target.interaction.key,
      label: target.interaction.label,
      durationMs: target.interaction.durationMs,
      action: target.interaction.action || "",
      startedAt: performance.now(),
      requiresKey: options.requiresKey ?? true,
    };
    updateActionProgress(holdState.label, 0);
  }

  function cancelHold() {
    updateActionProgress("", 0, true);
    holdState = null;
    touchHoldActive = false;
    touchHoldPointerId = null;
    touchHoldTileKey = null;
  }

  function updateActionProgress(label, ratio, hidden = false) {
    if (!elements.actionProgressEl || !elements.actionLabelEl || !elements.actionFillEl) {
      return;
    }
    if (hidden || ratio <= 0) {
      elements.actionProgressEl.setAttribute("hidden", "true");
      elements.actionLabelEl.textContent = "";
      elements.actionFillEl.style.width = "0%";
      return;
    }
    elements.actionProgressEl.removeAttribute("hidden");
    elements.actionLabelEl.textContent = label;
    elements.actionFillEl.style.width = `${Math.floor(ratio * 100)}%`;
  }

  function openDialog(text, hero) {
    if (!elements.dialogEl || !elements.dialogTextEl) return;
    dialogOpen = true;
    let message = text;
    let heroData = hero || null;
    if (typeof text === "object" && text !== null) {
      message = text.text;
      heroData = text.hero || null;
    }
    elements.dialogTextEl.textContent = message || "...";
    if (elements.dialogHeroEl && elements.dialogHeroImg) {
      const heroSrc =
        typeof heroData === "string" ? heroData : heroData?.src;
      if (heroSrc) {
        elements.dialogHeroImg.src = heroSrc;
        elements.dialogHeroImg.alt =
          heroData?.alt || heroData?.name || "Creature";
        elements.dialogHeroEl.removeAttribute("hidden");
      } else {
        elements.dialogHeroEl.setAttribute("hidden", "true");
        elements.dialogHeroImg.removeAttribute("src");
        elements.dialogHeroImg.alt = "";
      }
    }
    elements.dialogEl.classList.add("active");
    elements.promptEl?.setAttribute("hidden", "true");
  }

  function closeDialog() {
    if (!elements.dialogEl) return;
    elements.dialogEl.classList.remove("active");
    if (elements.dialogHeroEl && elements.dialogHeroImg) {
      elements.dialogHeroEl.setAttribute("hidden", "true");
      elements.dialogHeroImg.removeAttribute("src");
      elements.dialogHeroImg.alt = "";
    }
    dialogOpen = false;
    updatePrompt();
  }

  function isDialogOpen() {
    return dialogOpen;
  }

  function returnToWorldMap() {
    window.location.href = "world-map.html";
  }

  function handleClick(event) {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (dialogOpen) return;
    const targetTile = screenToTile(event);
    if (!targetTile) return;
    if (!isWalkable(targetTile.tx, targetTile.ty)) return;
    const path = findPath(
      { tx: player.tx, ty: player.ty },
      targetTile,
      { neighbors, isWalkable, heuristic }
    );
    activePath = path.length ? path.slice(1) : [];
    renderState.activePath = activePath;
  }

  function handlePointerDown(event) {
    if (dialogOpen) return;
    if (event.pointerType === "mouse") return;
    event.preventDefault();
  }

  function handlePointerMove(event) {
    if (!touchHoldActive) return;
    if (touchHoldPointerId !== null && event.pointerId !== touchHoldPointerId) {
      return;
    }
    const tile = screenToTile(event);
    if (!tile) {
      cancelHold();
      return;
    }
    if (tileKey(tile.tx, tile.ty) !== touchHoldTileKey) {
      cancelHold();
    }
  }

  function handlePointerUp(event) {
    if (event.pointerType === "mouse") return;
    if (touchHoldActive) {
      if (touchHoldPointerId !== null && event.pointerId !== touchHoldPointerId) {
        return;
      }
      if (canvas.releasePointerCapture) {
        canvas.releasePointerCapture(event.pointerId);
      }
      cancelHold();
      return;
    }
    const tile = screenToTile(event);
    if (!tile) return;
    const now = performance.now();
    const key = tileKey(tile.tx, tile.ty);
    const target = findInteractableAt(tile);
    const inRange =
      target &&
      Math.max(Math.abs(player.tx - target.tx), Math.abs(player.ty - target.ty)) <= 1;
    if (lastTapTime && now - lastTapTime <= DOUBLE_TAP_MS && key === lastTapTileKey) {
      if (target) {
        const dx = Math.abs(player.tx - target.tx);
        const dy = Math.abs(player.ty - target.ty);
        if (Math.max(dx, dy) <= 1) {
          startHold(target, { requiresKey: false });
          suppressClick = true;
        }
      }
      lastTapTime = 0;
      lastTapTileKey = null;
      return;
    }
    if (inRange) {
      suppressClick = true;
    }
    lastTapTime = now;
    lastTapTileKey = key;
  }

  function handleHover(event) {
    if (!elements.hoverCardEl || !elements.hoverNameEl) return;
    const tile = screenToTile(event);
    if (!tile) {
      clearHover();
      return;
    }
    const creature = objects.find(
      (obj) =>
        obj.categories?.includes("animal") &&
        !obj.hidden &&
        isTileVisible(obj.tx, obj.ty) &&
        obj.tx === tile.tx &&
        obj.ty === tile.ty
    );
    if (creature) {
      hoverTarget = creature;
      elements.hoverNameEl.textContent = creature.name || "Creature";
      elements.hoverCardEl.removeAttribute("hidden");
      return;
    }
    clearHover();
  }

  function clearHover() {
    if (!elements.hoverCardEl || !elements.hoverNameEl) return;
    if (!hoverTarget) return;
    hoverTarget = null;
    elements.hoverNameEl.textContent = "";
    elements.hoverCardEl.setAttribute("hidden", "true");
  }

  function handleKeyDown(event) {
    if (dialogOpen) return;
    const key = event.key.toLowerCase();
    heldKeys.add(key);
    if (interactable?.interaction?.key === key && !holdState) {
      startHold(interactable, { requiresKey: true });
    }
  }

  function handleKeyUp(event) {
    const key = event.key.toLowerCase();
    heldKeys.delete(key);
    if (holdState && holdState.key === key) {
      cancelHold();
    }
  }

  function screenToTile(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (event.clientX - rect.left) * scaleX + camera.x;
    const my = (event.clientY - rect.top) * scaleY + camera.y;
    const tx = Math.floor(mx / tileSize);
    const ty = Math.floor(my / tileSize);
    if (tx < 0 || ty < 0 || tx >= mapWidth || ty >= mapHeight) return null;
    return { tx, ty };
  }

  function tileCenter(tx, ty) {
    return {
      x: (tx + 0.5) * tileSize,
      y: (ty + 0.5) * tileSize,
    };
  }

  function getTile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= mapWidth || ty >= mapHeight) return 0;
    return tiles[ty * mapWidth + tx] ?? 0;
  }

  function isWalkable(tx, ty) {
    const key = tileKey(tx, ty);
    if (blockedTiles.has(key)) return false;
    if (blockedByObjects.has(key)) return false;
    if (walkableOverrides.has(key)) return true;
    const tileId = getTile(tx, ty);
    const def = tileDefs.get(tileId);
    return Boolean(def?.walkable);
  }

  function heuristic(a, b) {
    return Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty);
  }

  function neighbors(node) {
    return [
      { tx: node.tx + 1, ty: node.ty },
      { tx: node.tx - 1, ty: node.ty },
      { tx: node.tx, ty: node.ty + 1 },
      { tx: node.tx, ty: node.ty - 1 },
    ].filter(
      (neighbor) =>
        neighbor.tx >= 0 &&
        neighbor.ty >= 0 &&
        neighbor.tx < mapWidth &&
        neighbor.ty < mapHeight
    );
  }

  function tileKey(tx, ty) {
    return `${tx},${ty}`;
  }

  function findInteractableAt(tile) {
    return (
      objects.find(
        (obj) =>
          !obj.hidden &&
          obj.interaction &&
          isTileVisible(obj.tx, obj.ty) &&
          obj.tx === tile.tx &&
          obj.ty === tile.ty
      ) || null
    );
  }

  function resetFogOfWar() {
    discoveredTiles = new Set();
    visibleTiles = new Set();
  }

  function updateFogOfWar() {
    const radiusSq = FOG_RADIUS * FOG_RADIUS;
    const nextVisible = new Set();
    for (let dy = -FOG_RADIUS; dy <= FOG_RADIUS; dy += 1) {
      for (let dx = -FOG_RADIUS; dx <= FOG_RADIUS; dx += 1) {
        if (dx * dx + dy * dy > radiusSq) continue;
        const tx = player.tx + dx;
        const ty = player.ty + dy;
        if (tx < 0 || ty < 0 || tx >= mapWidth || ty >= mapHeight) continue;
        const key = tileKey(tx, ty);
        nextVisible.add(key);
        discoveredTiles.add(key);
      }
    }
    visibleTiles = nextVisible;
  }

  function isTileDiscovered(tx, ty) {
    return discoveredTiles.has(tileKey(tx, ty));
  }

  function isTileVisible(tx, ty) {
    return visibleTiles.has(tileKey(tx, ty));
  }

  function getObjectSprite(type) {
    if (objectSprites.has(type)) return objectSprites.get(type);
    const def = objectDefs.get(type);
    if (!def?.asset) return null;
    const image = new Image();
    image.src = resolveAssetPath(def.asset);
    objectSprites.set(type, image);
    return image;
  }

  function setObjectType(obj, type) {
    const def = objectDefs.get(type);
    if (obj.blocksMovement) {
      blockedByObjects.delete(tileKey(obj.tx, obj.ty));
    }
    obj.type = type;
    obj.name = def?.name || type;
    obj.asset = def?.asset ? resolveAssetPath(def.asset) : "";
    obj.categories = def?.categories || [];
    obj.blocksMovement = Array.isArray(def?.categories)
      ? def.categories.includes("animal")
      : false;
    if (obj.blocksMovement) {
      blockedByObjects.add(tileKey(obj.tx, obj.ty));
    }
    if (obj.asset && !objectSprites.has(type)) {
      const image = new Image();
      image.src = obj.asset;
      objectSprites.set(type, image);
    }
  }

  function setInteraction(obj, interaction) {
    if (!obj) return;
    obj.interaction = interaction;
  }

  function setHidden(obj, hidden) {
    if (!obj) return;
    obj.hidden = hidden;
  }

  function blockTile(tx, ty) {
    blockedTiles.add(tileKey(tx, ty));
  }

  function unblockTile(tx, ty) {
    blockedTiles.delete(tileKey(tx, ty));
  }

  function allowTile(tx, ty) {
    walkableOverrides.add(tileKey(tx, ty));
  }

  function disallowTile(tx, ty) {
    walkableOverrides.delete(tileKey(tx, ty));
  }

  const runtimeApi = {
    start,
    setInteractionHandler: (handler) => {
      interactionHandler = handler;
    },
    setVisibilityHandler: (handler) => {
      visibilityHandler = handler;
    },
    getObjects: () => objects,
    findObject: (predicate) => objects.find(predicate),
    setObjectType,
    setInteraction,
    setHidden,
    blockTile,
    unblockTile,
    allowTile,
    disallowTile,
    isTileVisible,
    isTileDiscovered,
    openDialog,
    closeDialog,
    isDialogOpen,
    updatePrompt,
    returnToWorldMap,
    getMissionConfig: () => missionConfig,
    resolveMissionUrl,
  };

  return runtimeApi;
}
