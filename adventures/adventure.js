const PROGRESS_KEY = "PP_PROGRESS_V1";
const SELECTED_KEY = "PP_SELECTED_NODE";
const MAP_DIR = "./maps";
const DOUBLE_CLICK_MS = 300;
const DOUBLE_CLICK_TOLERANCE = 1;
const BASE_SPEED = 120;
const PLAYER_SCALE = 1.6;
const PLAYER_SPRITE_META_URL =
  "../assets/ponies/taticorn/sheets/spritesheet.json";
const PLAYER_SPRITE_SHEET_URL =
  "../assets/ponies/taticorn/sheets/spritesheet.webp";

const WOODS_TILE = 1;
const DEEP_FOREST_TILE = 6;

const TILE_TYPES = {
  0: { name: "GRASS", walkable: true, speed: 1.0, color: "#8fd16a" },
  1: { name: "WOODS", walkable: true, speed: 0.85, color: "#2f8f4e" },
  2: { name: "ROAD", walkable: true, speed: 1.5, color: "#b08a5a" },
  3: { name: "MOUNTAIN", walkable: false, speed: 1.0, color: "#6b6b6b" },
  4: { name: "WATER", walkable: false, speed: 1.0, color: "#4a79d8" },
  5: { name: "VILLAGE", walkable: true, speed: 1.0, color: "#d6c2a3" },
  6: { name: "DEEP_FOREST", walkable: false, speed: 0.6, color: "#1f5f38" },
};
const TILE_TEXTURES = {
  0: "./tiles/grass.webp",
  1: "./tiles/forest.webp",
  2: "./tiles/road.webp",
  3: "./tiles/mountain.webp",
  4: "./tiles/water.webp",
  5: "./tiles/village.webp",
  6: "./tiles/forest.webp",
};
const FOREST_OVERLAY = "./tiles/forest-canopy.webp";
const FOREST_BORDER_OVERLAY = "./tiles/forest-border.webp";
const FOREST_TREE_SPRITES = [
  "./overlays/forest-tree-01.webp",
  "./overlays/forest-tree-02.webp",
  "./overlays/forest-tree-03.webp",
];
const LETTER_BACKGROUNDS = {
  scroll: "./letters/scroll-letter.webp",
  torn_letter: "./letters/torn-letter.webp",
};
const PLAYER_HERO_IMAGE = "../assets/ponies/taticorn.webp";
const RESOURCE_KIND = "RESOURCE";
const CREATURE_KIND = "CREATURE";
const CREATURE_SIZE_SCALE = {
  tiny: 0.55,
  small: 0.8,
  medium: 1.15,
  large: 1.4,
  gigantic: 1.8,
};
const RESOURCE_STYLES = {
  GOLD: { color: "#f2d36b", label: "G", icon: "./icons/gold.webp" },
  WOOD: { color: "#b08157", label: "W", icon: "./icons/wood.webp" },
  STONE: { color: "#9ea3a8", label: "S", icon: "./icons/stone.webp" },
};
const RESOURCE_HERO_IMAGES = {
  GOLD: "./heroes/gold-pile.webp",
  WOOD: "./heroes/wood-pile.webp",
  STONE: "./heroes/stone-pile.webp",
};
const RESOURCE_TYPES = Object.keys(RESOURCE_STYLES);
const DEFAULT_INVENTORY = {
  GOLD: 10,
  WOOD: 0,
  STONE: 0,
};
const DEFAULT_CREATURE_STATS = {
  Health: 70,
  Mood: "Scared",
  Courage: "Low",
};
const TOAST_DURATION = 1.4;
const TOAST_RISE_PX = 26;
const WALKABLE_SPEEDS = Object.values(TILE_TYPES)
  .filter((config) => config.walkable)
  .map((config) => config.speed || 1);
const MAX_SPEED = WALKABLE_SPEEDS.length
  ? Math.max(...WALKABLE_SPEEDS)
  : 1;
const MIN_STEP_COST = 1 / MAX_SPEED;
const FOG_RADIUS = 7;
const FOG_DIM_ALPHA = 0.55;
const FOG_HIDDEN_ALPHA = 0.92;

const canvas = document.getElementById("adventureCanvas");
const ctx = canvas ? canvas.getContext("2d") : null;
const promptEl = document.getElementById("prompt");
const hoverCardEl = document.getElementById("hover-card");
const hoverCardImg = document.getElementById("hover-card-img");
const hoverCardName = document.getElementById("hover-card-name");
const hoverCardStats = document.getElementById("hover-card-stats");
const objectivesEl = document.getElementById("objectives");
const progressEl = document.getElementById("progress");
const inventoryEl = document.getElementById("inventory");
const statusEl = document.getElementById("status");
const completionEl = document.getElementById("completion");
const completionMessageEl = document.getElementById("completion-message");
const completionReturnBtn = document.getElementById("completion-return");
const dialogEl = document.getElementById("dialog");
const dialogTextEl = document.getElementById("dialog-text");
const dialogHeroEl = document.getElementById("dialog-hero");
const dialogHeroImg = document.getElementById("dialog-hero-img");
const dialogCloseBtn = document.getElementById("dialog-close");
const letterEl = document.getElementById("letter-modal");
const letterCardEl = document.getElementById("letter-card");
const letterContextEl = document.getElementById("letter-context");
const letterBodyEl = document.getElementById("letter-body");
const letterCloseBtn = document.getElementById("letter-close");
const returnBtn = document.getElementById("return-btn");
const titleEl = document.getElementById("map-title");
const tileImages = new Map();
const resourceImages = new Map();
const creatureImages = new Map();
let forestOverlayImage = null;
let forestBorderImage = null;
let forestTreeImages = [];
let hoverTarget = null;
let hoverAnchor = null;
let completionTimer = null;

let mapData = null;
let tileSize = 32;
let mapWidth = 0;
let mapHeight = 0;
let tiles = [];
let objects = [];
let previewPath = [];
let activePath = [];
let lastClick = null;
let lastClickAt = 0;
let interactable = null;
let interactedIds = new Set();
let completed = false;
let dialogOpen = false;
let resourceByTile = new Map();
let blockedByTile = new Map();
let lastPlayerTileKey = null;
const toasts = [];
let progress = loadProgress();
let playerSprite = null;
let discoveredTiles = new Set();
let visibleTiles = new Set();

const player = {
  tx: 0,
  ty: 0,
  px: 0,
  py: 0,
  facing: 1,
};

const camera = { x: 0, y: 0 };

if (canvas && ctx) {
  canvas.addEventListener("click", handleClick);
  window.addEventListener("mousemove", handleHover);
  window.addEventListener("mouseleave", clearHover);
  window.addEventListener("keydown", handleKey);
  dialogCloseBtn?.addEventListener("click", closeDialog);
  letterCloseBtn?.addEventListener("click", closeLetter);
  completionReturnBtn?.addEventListener("click", returnToWorldMap);
  returnBtn?.addEventListener("click", returnToWorldMap);
  loadTileTextures();
  loadResourceIcons();
  loadCreatureSprites();
  loadForestTrees();
  loadPlayerSprite();
  loadMap();
}

async function loadMap() {
  const mapId = localStorage.getItem(SELECTED_KEY) || "QUIET_WOODS";
  const url = `${MAP_DIR}/${mapId}.json`;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load map ${mapId}: ${response.status}`);
    }
    mapData = await response.json();
    hydrateMap(mapData);
    requestAnimationFrame(loop);
  } catch (error) {
    console.error(error);
    drawError("Adventure map failed to load.");
  }
}

function hydrateMap(data) {
  tileSize = data.tileSize || 32;
  mapWidth = data.w || 0;
  mapHeight = data.h || 0;
  tiles = Array.isArray(data.tiles) ? data.tiles : [];
  objects = Array.isArray(data.objects)
    ? data.objects.map((obj) => ({ ...obj, interacted: false }))
    : [];
  resetResourceStateOnLoad(data);
  applyCollectedResources();
  rebuildResourceIndex();
  rebuildBlockingIndex();
  resetFogOfWar();
  const spawn = data.spawn || { tx: 0, ty: 0 };
  player.tx = spawn.tx;
  player.ty = spawn.ty;
  player.px = (spawn.tx + 0.5) * tileSize;
  player.py = (spawn.ty + 0.5) * tileSize;
  updateFogOfWar();
  if (titleEl) {
    titleEl.textContent = data.title || "Quiet Woods";
  }
  lastPlayerTileKey = tileKey(player.tx, player.ty);
  checkResourceCollection();
  updateObjectiveStatus();
  updateInventoryStatus();
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) {
      const inventory = RESOURCE_TYPES.reduce((acc, type) => {
        acc[type] = DEFAULT_INVENTORY[type] ?? 0;
        return acc;
      }, {});
      return {
        cleared: {},
        unlocked: {},
        inventory,
        collected: {},
        resourceResets: {},
      };
    }
    const parsed = JSON.parse(raw);
    const inventory = RESOURCE_TYPES.reduce((acc, type) => {
      acc[type] = DEFAULT_INVENTORY[type] ?? 0;
      return acc;
    }, {});
    Object.assign(inventory, parsed.inventory || {});
    return {
      cleared: parsed.cleared || {},
      unlocked: parsed.unlocked || {},
      inventory,
      collected: parsed.collected || {},
      resourceResets: parsed.resourceResets || {},
    };
  } catch (error) {
    const inventory = RESOURCE_TYPES.reduce((acc, type) => {
      acc[type] = DEFAULT_INVENTORY[type] ?? 0;
      return acc;
    }, {});
    return {
      cleared: {},
      unlocked: {},
      inventory,
      collected: {},
      resourceResets: {},
    };
  }
}

function saveProgress() {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

function resetResourceStateOnLoad(data) {
  const inventory = RESOURCE_TYPES.reduce((acc, type) => {
    acc[type] = DEFAULT_INVENTORY[type] ?? 0;
    return acc;
  }, {});
  progress.inventory = inventory;
  const resourceIds = (data.objects || [])
    .filter((obj) => obj.kind === RESOURCE_KIND)
    .map((obj) => obj.id);
  resourceIds.forEach((id) => {
    delete progress.collected[id];
  });
  saveProgress();
}

function handleClick(event) {
  if (!mapData || dialogOpen) return;
  const clickedTile = screenToTile(event);
  if (!clickedTile) {
    previewPath = [];
    return;
  }

  if (interactable && clickOnObject(event, interactable)) {
    openDialog(interactable);
    return;
  }

  const targetTile = resolveTargetTile(clickedTile);
  if (!targetTile) {
    previewPath = [];
    return;
  }

  const now = performance.now();
  const isDoubleClick =
    lastClick &&
    now - lastClickAt <= DOUBLE_CLICK_MS &&
    Math.abs(targetTile.tx - lastClick.tx) <= DOUBLE_CLICK_TOLERANCE &&
    Math.abs(targetTile.ty - lastClick.ty) <= DOUBLE_CLICK_TOLERANCE;

  if (isDoubleClick) {
    const path = buildPath({ tx: player.tx, ty: player.ty }, targetTile);
    if (path.length) {
      activePath = path.slice(1);
      previewPath = [];
    }
    lastClick = null;
    lastClickAt = 0;
    return;
  }

  previewPath = buildPath({ tx: player.tx, ty: player.ty }, targetTile).slice(1);
  lastClick = targetTile;
  lastClickAt = now;
}

function handleKey(event) {
  if (dialogOpen) return;
  if (event.key === "Enter") {
    if (previewPath.length) {
      activePath = previewPath.slice();
      previewPath = [];
      lastClick = null;
      lastClickAt = 0;
    }
    event.preventDefault();
    return;
  }
  if (!interactable) return;
  if (event.key.toLowerCase() === "e") {
    openDialog(interactable);
  }
}

function handleHover(event) {
  if (!mapData || !canvas) return;
  const rect = canvas.getBoundingClientRect();
  const inside =
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom;
  if (!inside) {
    if (hoverTarget) {
      hoverTarget = null;
      hoverAnchor = null;
      renderHoverCard();
    }
    return;
  }
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const worldX = (event.clientX - rect.left) * scaleX + camera.x;
  const worldY = (event.clientY - rect.top) * scaleY + camera.y;
  const target = findHoverTarget(worldX, worldY);
  hoverAnchor = target
    ? getHoverAnchor(target, rect, scaleX, scaleY)
    : null;
  if (isSameHoverTarget(target, hoverTarget)) return;
  hoverTarget = target;
  renderHoverCard();
}

function clearHover() {
  hoverTarget = null;
  hoverAnchor = null;
  renderHoverCard();
}

function openDialog(target) {
  if (!dialogEl || !dialogTextEl) return;
  if (target.letter) {
    openLetter(target);
    return;
  }
  dialogOpen = true;
  const text = Array.isArray(target.text) ? target.text.join(" ") : target.text;
  dialogTextEl.textContent = text || "....";
  updateDialogHero(target);
  dialogEl.classList.add("active");
  promptEl?.setAttribute("hidden", "true");
  dialogEl.dataset.activeId = target.id;
}

function closeDialog() {
  if (!dialogEl) return;
  const activeId = dialogEl.dataset.activeId;
  if (activeId) {
    interactedIds.add(activeId);
    const obj = objects.find((item) => item.id === activeId);
    if (obj) obj.interacted = true;
  }
  dialogEl.classList.remove("active");
  dialogEl.dataset.activeId = "";
  dialogOpen = false;
  updateDialogHero(null);
  updateObjectiveStatus();
  checkCompletion();
}

function openLetter(target) {
  if (!letterEl || !letterBodyEl || !letterContextEl || !letterCardEl) return;
  dialogOpen = true;
  const context = Array.isArray(target.letterContext)
    ? target.letterContext.join(" ")
    : target.letterContext || "";
  const body = Array.isArray(target.letterText)
    ? target.letterText.join("\n")
    : target.letterText || "";
  const letterTag = target.letter || "scroll";
  const background = LETTER_BACKGROUNDS[letterTag] || LETTER_BACKGROUNDS.scroll;
  letterCardEl.style.backgroundImage = `url('${background}')`;
  letterContextEl.textContent = context;
  letterBodyEl.textContent = body;
  letterEl.classList.add("active");
  promptEl?.setAttribute("hidden", "true");
}

function closeLetter() {
  if (!letterEl || !letterBodyEl || !letterContextEl || !letterCardEl) return;
  letterEl.classList.remove("active");
  letterCardEl.style.backgroundImage = "";
  letterBodyEl.textContent = "";
  letterContextEl.textContent = "";
  dialogOpen = false;
}

function checkCompletion() {
  if (!mapData || completed) return;
  const rule = mapData.complete || {};
  const talkOk =
    rule.type !== "TALK_COUNT" || interactedIds.size >= rule.count;
  const resourcesOk = areResourceGoalsMet();
  if (talkOk && resourcesOk) {
    completed = true;
    if (statusEl) {
      statusEl.textContent = "Completed! Return to the world map.";
    }
    if (returnBtn) {
      returnBtn.disabled = false;
    }
    showCompletion();
    markComplete();
  }
  updateObjectiveStatus();
}

function markComplete() {
  if (!mapData) return;
  progress.cleared[mapData.id] = true;
  progress.unlocked[mapData.id] = true;
  const unlocks = Array.isArray(mapData.unlocks) ? mapData.unlocks : [];
  unlocks.forEach((id) => {
    progress.unlocked[id] = true;
  });
  saveProgress();
}

function returnToWorldMap() {
  window.location.href = "./world-map.html";
}

function showCompletion() {
  if (!completionEl) return;
  completionEl.classList.add("active");
  if (completionMessageEl) {
    completionMessageEl.textContent = "Returning to the World Map...";
  }
  if (completionTimer) {
    clearTimeout(completionTimer);
  }
  completionTimer = window.setTimeout(() => {
    returnToWorldMap();
  }, 1600);
}

function updateObjectiveStatus() {
  if (!mapData) return;
  const objectives = [];
  const progressParts = [];
  const rule = mapData.complete || {};
  if (rule.type === "TALK_COUNT") {
    objectives.push(`Talk to ${rule.count} creatures.`);
    if (objectivesEl) {
      objectivesEl.textContent = `Objectives: ${objectives.join(" ")}`;
    }
    if (progressEl) {
      const progress = Math.min(interactedIds.size, rule.count);
      progressParts.push(`Talk ${progress}/${rule.count}`);
      progressEl.textContent = `Progress: ${progressParts.join("  ")}`;
    }
  }
  const resourceGoals = mapData.resourceGoals || {};
  Object.entries(resourceGoals).forEach(([type, amount]) => {
    const name = formatResourceName(type);
    objectives.push(`Collect ${amount} ${name}.`);
    const have = progress.inventory[type] ?? 0;
    progressParts.push(`${name} ${Math.min(have, amount)}/${amount}`);
  });
  if (objectivesEl) {
    objectivesEl.textContent = objectives.length
      ? `Objectives: ${objectives.join(" ")}`
      : "Objective: Explore the area.";
  }
  if (progressEl) {
    progressEl.textContent = progressParts.length
      ? `Progress: ${progressParts.join("  ")}`
      : "";
  }
}

function loop(timestamp) {
  update(1 / 60);
  draw();
  requestAnimationFrame(loop);
}

function update(delta) {
  updateMovement(delta);
  updateFogOfWar();
  updateCamera();
  updateInteractable();
  updateToasts(delta);
  updatePlayerAnimation(delta);
  const currentKey = tileKey(player.tx, player.ty);
  if (currentKey !== lastPlayerTileKey) {
    lastPlayerTileKey = currentKey;
    checkResourceCollection();
  }
}

function resetFogOfWar() {
  discoveredTiles = new Set();
  visibleTiles = new Set();
}

function updateFogOfWar() {
  if (!mapData) return;
  const radius = FOG_RADIUS;
  const radiusSq = radius * radius;
  const nextVisible = new Set();
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
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
  const speedMult = tileSpeed(player.tx, player.ty);
  const step = BASE_SPEED * speedMult * delta;
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
  if (!canvas) return;
  const mapPixelWidth = mapWidth * tileSize;
  const mapPixelHeight = mapHeight * tileSize;
  camera.x = player.px - canvas.width / 2;
  camera.y = player.py - canvas.height / 2;
  camera.x = Math.max(0, Math.min(camera.x, mapPixelWidth - canvas.width));
  camera.y = Math.max(0, Math.min(camera.y, mapPixelHeight - canvas.height));
}

function updateInteractable() {
  if (!mapData || dialogOpen) return;
  interactable = null;
  for (const obj of objects) {
    if (obj.kind !== CREATURE_KIND) continue;
    if (obj.interacted) continue;
    if (!isTileVisible(obj.tx, obj.ty)) continue;
    const center = tileCenter(obj.tx, obj.ty);
    const radius = (obj.r || 1) * tileSize;
    const distance = Math.hypot(player.px - center.x, player.py - center.y);
    if (distance <= radius) {
      interactable = obj;
      break;
    }
  }
  if (promptEl) {
    if (interactable) {
      promptEl.removeAttribute("hidden");
    } else {
      promptEl.setAttribute("hidden", "true");
    }
  }
}

function draw() {
  if (!ctx || !canvas || !mapData) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawTiles();
  drawObjects();
  drawPlayer();
  drawPreviewPath();
  drawLighting();
  drawToasts();
}

function drawTiles() {
  if (!ctx || !canvas) return;
  const startX = Math.max(0, Math.floor(camera.x / tileSize));
  const startY = Math.max(0, Math.floor(camera.y / tileSize));
  const endX = Math.min(
    mapWidth,
    Math.ceil((camera.x + canvas.width) / tileSize)
  );
  const endY = Math.min(
    mapHeight,
    Math.ceil((camera.y + canvas.height) / tileSize)
  );

  for (let ty = startY; ty < endY; ty += 1) {
    for (let tx = startX; tx < endX; tx += 1) {
      const tileId = getTile(tx, ty);
      const config = TILE_TYPES[tileId] || TILE_TYPES[0];
      const img = tileImages.get(tileId);
      const x = tx * tileSize - camera.x;
      const y = ty * tileSize - camera.y;
      if (!isTileDiscovered(tx, ty)) {
        ctx.fillStyle = `rgba(5, 7, 10, ${FOG_HIDDEN_ALPHA})`;
        ctx.fillRect(x, y, tileSize, tileSize);
        continue;
      }
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, x, y, tileSize, tileSize);
      } else {
        ctx.fillStyle = config.color;
        ctx.fillRect(x, y, tileSize, tileSize);
      }
      if (tileId === WOODS_TILE || tileId === DEEP_FOREST_TILE) {
        const nearRoad = isRoadNearby(tx, ty, 2);
        if (tileId === DEEP_FOREST_TILE || !nearRoad) {
          drawForestTreeOverlay(tx, ty, x, y);
        } else {
          drawForestBorderOverlay(x, y);
        }
        const shade =
          tileId === DEEP_FOREST_TILE
            ? "rgba(6, 10, 9, 0.32)"
            : "rgba(10, 18, 14, 0.18)";
        ctx.fillStyle = shade;
        ctx.fillRect(x, y, tileSize, tileSize);
      }
      if (tileId === 2) {
        ctx.strokeStyle = "rgba(78, 58, 38, 0.45)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, tileSize - 1, tileSize - 1);
      }
      if (!isTileVisible(tx, ty)) {
        ctx.fillStyle = `rgba(5, 8, 10, ${FOG_DIM_ALPHA})`;
        ctx.fillRect(x, y, tileSize, tileSize);
      }
    }
  }
}

function drawObjects() {
  if (!ctx) return;
  objects.forEach((obj) => {
    if (!isTileVisible(obj.tx, obj.ty)) {
      return;
    }
    if (obj.kind === RESOURCE_KIND) {
      if (obj.collected) return;
      drawResource(obj);
      return;
    }
    const sprite = creatureImages.get(obj.id);
    const sizeKey = obj.size || "medium";
    const scale = CREATURE_SIZE_SCALE[sizeKey] || CREATURE_SIZE_SCALE.medium;
    if (sprite && sprite.complete && sprite.naturalWidth > 0) {
      const center = tileCenter(obj.tx, obj.ty);
      const x = center.x - camera.x;
      const y = center.y - camera.y;
      const size = tileSize * scale;
      ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
      return;
    }
    const center = tileCenter(obj.tx, obj.ty);
    const x = center.x - camera.x;
    const y = center.y - camera.y;
    ctx.beginPath();
    ctx.fillStyle = obj.interacted ? "#384b44" : "#f1dca0";
    ctx.strokeStyle = "#2a302e";
    ctx.lineWidth = 2;
    ctx.arc(x, y, 10 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
}

function drawPlayer() {
  if (!ctx) return;
  if (playerSprite && playerSprite.image?.complete) {
    const frameNames = getPlayerFrameNames(playerSprite.action);
    const frameName =
      frameNames[playerSprite.frameIndex % frameNames.length] || frameNames[0];
    const entry = playerSprite.frames[frameName];
    const frame = entry?.frame;
    if (frame) {
      const anchor = entry.anchor || { x: frame.w / 2, y: frame.h };
      const scale = (tileSize * PLAYER_SCALE) / frame.w;
      const drawW = frame.w * scale;
      const drawH = frame.h * scale;
      const destX = player.px - camera.x - anchor.x * scale;
      const destY = player.py - camera.y - anchor.y * scale;
      if (player.facing === -1) {
        ctx.save();
        ctx.translate(destX + drawW, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(
          playerSprite.image,
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
        return;
      }
      ctx.drawImage(
        playerSprite.image,
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        destX,
        destY,
        drawW,
        drawH
      );
      return;
    }
  }
  const x = player.px - camera.x;
  const y = player.py - camera.y;
  ctx.beginPath();
  ctx.fillStyle = "#f7f2d6";
  ctx.strokeStyle = "#2b2f2f";
  ctx.lineWidth = 3;
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawPreviewPath() {
  if (!ctx || !previewPath.length) return;
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  previewPath.forEach((step) => {
    ctx.fillRect(
      step.tx * tileSize + tileSize * 0.35 - camera.x,
      step.ty * tileSize + tileSize * 0.35 - camera.y,
      tileSize * 0.3,
      tileSize * 0.3
    );
  });
}

function drawResource(obj) {
  if (!ctx) return;
  const style = RESOURCE_STYLES[obj.type] || RESOURCE_STYLES.WOOD;
  const icon = resourceImages.get(obj.type);
  const center = tileCenter(obj.tx, obj.ty);
  const x = center.x - camera.x;
  const y = center.y - camera.y;
  if (icon && icon.complete && icon.naturalWidth > 0) {
    const size = Math.min(tileSize, 30);
    ctx.save();
    ctx.shadowColor = style.color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = `${style.color}55`;
    ctx.beginPath();
    ctx.arc(x, y, size * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.drawImage(icon, x - size / 2, y - size / 2, size, size);
    return;
  }
  ctx.save();
  ctx.shadowColor = style.color;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.fillStyle = style.color;
  ctx.strokeStyle = "#2a302e";
  ctx.lineWidth = 2;
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "#1b1e21";
  ctx.font = "bold 10px sans-serif";
  ctx.fillText(style.label, x - 3, y + 4);
}

function drawForestTreeOverlay(tx, ty, x, y) {
  if (!ctx) return;
  const seed = hashCoord(tx, ty);
  if (seed % 10 < 3) {
    drawForestCanopyFallback(x, y);
    return;
  }
  const images = forestTreeImages.filter(
    (image) => image.complete && image.naturalWidth > 0
  );
  if (!images.length) {
    drawForestCanopyFallback(x, y);
    return;
  }
  const image = images[seed % images.length];
  const size = tileSize * 2.8;
  const jitterX = ((seed >> 2) % 7 - 3) * tileSize * 0.06;
  const jitterY = ((seed >> 5) % 5 - 2) * tileSize * 0.05;
  const drawX = x + tileSize * 0.5 - size * 0.5 + jitterX;
  const drawY = y - size * 0.78 + jitterY;
  ctx.drawImage(image, drawX, drawY, size, size);
}

function drawForestCanopyFallback(x, y) {
  if (!ctx || !forestOverlayImage) return;
  if (!forestOverlayImage.complete || forestOverlayImage.naturalWidth === 0) return;
  const size = tileSize * 2.35;
  const drawX = x + tileSize * 0.5 - size * 0.5;
  const drawY = y - size * 0.75;
  ctx.drawImage(forestOverlayImage, drawX, drawY, size, size);
}

function drawForestBorderOverlay(x, y) {
  if (!ctx || !forestBorderImage) return;
  if (!forestBorderImage.complete || forestBorderImage.naturalWidth === 0) return;
  ctx.drawImage(forestBorderImage, x, y, tileSize, tileSize);
}

function drawLighting() {
  if (!ctx || !canvas) return;
  const gradient = ctx.createRadialGradient(
    canvas.width / 2,
    canvas.height / 2,
    Math.min(canvas.width, canvas.height) * 0.2,
    canvas.width / 2,
    canvas.height / 2,
    Math.max(canvas.width, canvas.height) * 0.65
  );
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.25)");
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function drawToasts() {
  if (!ctx || !toasts.length) return;
  toasts.forEach((toast) => {
    const alpha = Math.max(0, toast.ttl / TOAST_DURATION);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#f7f2d6";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(
      toast.text,
      toast.x - camera.x,
      toast.y - camera.y - 18
    );
  });
  ctx.globalAlpha = 1;
}

function drawError(message) {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#e3efe6";
  ctx.font = "16px sans-serif";
  ctx.fillText(message, 20, 40);
}

function tileCenter(tx, ty) {
  return {
    x: (tx + 0.5) * tileSize,
    y: (ty + 0.5) * tileSize,
  };
}

function loadTileTextures() {
  Object.entries(TILE_TEXTURES).forEach(([id, src]) => {
    const image = new Image();
    image.src = src;
    tileImages.set(Number(id), image);
  });
  forestOverlayImage = new Image();
  forestOverlayImage.src = FOREST_OVERLAY;
  forestBorderImage = new Image();
  forestBorderImage.src = FOREST_BORDER_OVERLAY;
}

function loadForestTrees() {
  forestTreeImages = FOREST_TREE_SPRITES.map((src) => {
    const image = new Image();
    image.src = src;
    return image;
  });
}

function loadResourceIcons() {
  RESOURCE_TYPES.forEach((type) => {
    const src = RESOURCE_STYLES[type]?.icon;
    if (!src) return;
    const image = new Image();
    image.src = src;
    resourceImages.set(type, image);
  });
}

function loadCreatureSprites() {
  const sprites = {
    OWL: "./sprites/owl.webp",
    SQUIRREL: "./sprites/squirrel.webp",
    DEER: "./sprites/deer.webp",
    PONY_SKELETON: "./sprites/pony-skeleton.webp",
  };
  Object.entries(sprites).forEach(([id, src]) => {
    const image = new Image();
    image.src = src;
    creatureImages.set(id, image);
  });
}

async function loadPlayerSprite() {
  try {
    const response = await fetch(PLAYER_SPRITE_META_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load player sprite: ${response.status}`);
    }
    const data = await response.json();
    const image = new Image();
    image.src = PLAYER_SPRITE_SHEET_URL;
    playerSprite = {
      image,
      frames: data.frames || {},
      animations: data.animations || {},
      fps: data.fps || {},
      action: "idle",
      frameIndex: 0,
      frameTimer: 0,
    };
  } catch (error) {
    console.error(error);
  }
}

function screenToTile(event) {
  if (!canvas) return null;
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

function clickOnObject(event, obj) {
  if (!canvas) return false;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const mx = (event.clientX - rect.left) * scaleX + camera.x;
  const my = (event.clientY - rect.top) * scaleY + camera.y;
  const center = tileCenter(obj.tx, obj.ty);
  const radius = (obj.r || 1) * tileSize;
  return Math.hypot(mx - center.x, my - center.y) <= radius;
}

function getTile(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= mapWidth || ty >= mapHeight) return 0;
  return tiles[ty * mapWidth + tx] ?? 0;
}

function tileSpeed(tx, ty) {
  const tileId = getTile(tx, ty);
  const config = TILE_TYPES[tileId] || TILE_TYPES[0];
  return config.speed || 1;
}

function isWalkable(tx, ty) {
  if (hasBlockingObject(tx, ty)) return false;
  const tileId = getTile(tx, ty);
  const config = TILE_TYPES[tileId] || TILE_TYPES[0];
  return Boolean(config.walkable);
}

function findPath(start, goal) {
  if (start.tx === goal.tx && start.ty === goal.ty) {
    return [start];
  }
  const open = new Set();
  const cameFrom = new Map();
  const gScore = new Map();
  const fScore = new Map();

  const startKey = nodeKey(start);
  gScore.set(startKey, 0);
  fScore.set(startKey, heuristic(start, goal));
  open.add(startKey);

  while (open.size > 0) {
    const currentKey = lowestScore(open, fScore);
    if (!currentKey) break;
    const current = parseKey(currentKey);
    if (current.tx === goal.tx && current.ty === goal.ty) {
      return reconstructPath(cameFrom, current);
    }
    open.delete(currentKey);
    for (const neighbor of neighbors(current)) {
      if (!isWalkable(neighbor.tx, neighbor.ty)) continue;
      const stepCost = 1 / tileSpeed(neighbor.tx, neighbor.ty);
      const tentative = (gScore.get(currentKey) ?? Infinity) + stepCost;
      const neighborKey = nodeKey(neighbor);
      if (tentative < (gScore.get(neighborKey) ?? Infinity)) {
        cameFrom.set(neighborKey, currentKey);
        gScore.set(neighborKey, tentative);
        fScore.set(neighborKey, tentative + heuristic(neighbor, goal));
        open.add(neighborKey);
      }
    }
  }
  return [];
}

function buildPath(start, goal) {
  return findPath(start, goal);
}

function resolveTargetTile(tile) {
  if (!tile) return null;
  const blocker = getBlockingAt(tile.tx, tile.ty);
  if (blocker) {
    return pickBlockingApproach(blocker);
  }
  if (!isWalkable(tile.tx, tile.ty)) return null;
  return tile;
}

function pickBlockingApproach(blocker) {
  const candidates = neighbors(blocker).filter((neighbor) =>
    isWalkable(neighbor.tx, neighbor.ty)
  );
  if (!candidates.length) return null;
  let best = null;
  let bestCost = Infinity;
  candidates.forEach((candidate) => {
    const path = buildPath({ tx: player.tx, ty: player.ty }, candidate);
    if (!path.length) return;
    const cost = pathCost(path);
    if (cost < bestCost) {
      bestCost = cost;
      best = candidate;
    }
  });
  return best;
}

function pathCost(path) {
  if (path.length <= 1) return 0;
  let cost = 0;
  for (let i = 1; i < path.length; i += 1) {
    cost += 1 / tileSpeed(path[i].tx, path[i].ty);
  }
  return cost;
}

function checkResourceCollection() {
  if (!resourceByTile.size) return;
  const collected = [];
  resourceByTile.forEach((resource) => {
    const distance =
      Math.abs(resource.tx - player.tx) + Math.abs(resource.ty - player.ty);
    if (distance === 1) {
      collected.push(resource);
    }
  });
  collected.forEach((resource) => collectResource(resource));
}

function collectResource(resource) {
  if (!resource || resource.collected) return;
  const amount = Number(resource.amount) || 0;
  const type = resource.type || "WOOD";
  resource.collected = true;
  resourceByTile.delete(tileKey(resource.tx, resource.ty));
  blockedByTile.delete(tileKey(resource.tx, resource.ty));
  progress.inventory[type] = (progress.inventory[type] ?? 0) + amount;
  progress.collected[resource.id] = true;
  saveProgress();
  const label = `${amount} ${formatResourceName(type)}`;
  addToast(`+${label}`);
  updateInventoryStatus();
  updateObjectiveStatus();
}

function formatResourceName(type) {
  return type.charAt(0) + type.slice(1).toLowerCase();
}

function addToast(text) {
  toasts.push({
    text,
    x: player.px,
    y: player.py,
    ttl: TOAST_DURATION,
  });
}

function updateToasts(delta) {
  for (let i = toasts.length - 1; i >= 0; i -= 1) {
    const toast = toasts[i];
    toast.ttl -= delta;
    toast.y -= TOAST_RISE_PX * delta;
    if (toast.ttl <= 0) {
      toasts.splice(i, 1);
    }
  }
}

function updateInventoryStatus() {
  if (!inventoryEl) return;
  const items = RESOURCE_TYPES.map((type) => {
    const style = RESOURCE_STYLES[type] || RESOURCE_STYLES.WOOD;
    const amount = progress.inventory[type] ?? 0;
    const name = formatResourceName(type);
    const icon = style.icon ? `background-image:url('${style.icon}')` : "";
    return `
      <span class="inventory-item">
        <span class="resource-icon" style="background:${style.color};${icon}"></span>
        <span>${name}</span>
        <strong>${amount}</strong>
      </span>
    `;
  }).join("");
  inventoryEl.innerHTML = items;
  if (hoverTarget?.type === "player") {
    renderHoverCard();
  }
}

function findHoverTarget(worldX, worldY) {
  const playerBounds = getPlayerHoverBounds();
  if (isPointInRect(worldX, worldY, playerBounds)) {
    return { type: "player" };
  }
  let best = null;
  let bestDist = Infinity;
  objects.forEach((obj) => {
    if (obj.kind !== CREATURE_KIND) return;
    if (obj.interacted) return;
    if (!isTileVisible(obj.tx, obj.ty)) return;
    const center = tileCenter(obj.tx, obj.ty);
    const scale = CREATURE_SIZE_SCALE[obj.size || "medium"] ?? 1;
    const size = tileSize * scale;
    const bounds = {
      x: center.x - size / 2,
      y: center.y - size / 2,
      w: size,
      h: size,
    };
    const distance = Math.hypot(worldX - center.x, worldY - center.y);
    if (isPointInRect(worldX, worldY, bounds) && distance < bestDist) {
      bestDist = distance;
      best = obj;
    }
  });
  if (best) {
    return { type: "creature", obj: best };
  }
  let resourceHit = null;
  objects.forEach((obj) => {
    if (obj.kind !== RESOURCE_KIND) return;
    if (obj.collected) return;
    if (!isTileVisible(obj.tx, obj.ty)) return;
    const center = tileCenter(obj.tx, obj.ty);
    const size = Math.min(tileSize, 36);
    const bounds = {
      x: center.x - size / 2,
      y: center.y - size / 2,
      w: size,
      h: size,
    };
    if (isPointInRect(worldX, worldY, bounds)) {
      resourceHit = obj;
    }
  });
  if (resourceHit) {
    return { type: "resource", obj: resourceHit };
  }
  return null;
}

function isPointInRect(px, py, rect) {
  if (!rect) return false;
  return (
    px >= rect.x &&
    px <= rect.x + rect.w &&
    py >= rect.y &&
    py <= rect.y + rect.h
  );
}

function getPlayerHoverBounds() {
  const baseSize = tileSize * PLAYER_SCALE;
  if (playerSprite && playerSprite.image?.complete) {
    const frameNames = getPlayerFrameNames(playerSprite.action);
    const frameName =
      frameNames[playerSprite.frameIndex % frameNames.length] || frameNames[0];
    const entry = playerSprite.frames[frameName];
    const frame = entry?.frame;
    if (frame) {
      const anchor = entry.anchor || { x: frame.w / 2, y: frame.h };
      const scale = (tileSize * PLAYER_SCALE) / frame.w;
      const drawW = frame.w * scale;
      const drawH = frame.h * scale;
      const padding = tileSize * 0.2;
      return {
        x: player.px - anchor.x * scale - padding,
        y: player.py - anchor.y * scale - padding,
        w: drawW + padding * 2,
        h: drawH + padding * 2,
      };
    }
  }
  const padding = tileSize * 0.25;
  return {
    x: player.px - baseSize / 2 - padding,
    y: player.py - baseSize / 2 - padding,
    w: baseSize + padding * 2,
    h: baseSize + padding * 2,
  };
}

function isSameHoverTarget(next, current) {
  if (!next && !current) return true;
  if (!next || !current) return false;
  if (next.type !== current.type) return false;
  if (next.type === "creature") {
    return next.obj?.id === current.obj?.id;
  }
  if (next.type === "resource") {
    return next.obj?.id === current.obj?.id;
  }
  return true;
}

function renderHoverCard() {
  if (!hoverCardEl || !hoverCardImg || !hoverCardName || !hoverCardStats) return;
  if (!hoverTarget) {
    hoverCardEl.setAttribute("hidden", "true");
    return;
  }
  const data = buildHoverCardData(hoverTarget);
  if (!data) {
    hoverCardEl.setAttribute("hidden", "true");
    return;
  }
  hoverCardImg.src = data.image;
  hoverCardImg.alt = data.name;
  hoverCardName.textContent = data.name;
  hoverCardStats.innerHTML = data.stats
    .map(
      (entry) =>
        `<div class="hover-stat"><span>${entry.label}</span><strong>${entry.value}</strong></div>`
    )
    .join("");
  hoverCardEl.removeAttribute("hidden");
  positionHoverCard();
}

function positionHoverCard() {
  if (!hoverCardEl || !hoverAnchor) return;
  const padding = 12;
  const offset = 16;
  hoverCardEl.style.right = "auto";
  hoverCardEl.style.bottom = "auto";
  let left = hoverAnchor.x + offset;
  let top = hoverAnchor.y + offset;
  hoverCardEl.style.left = `${left}px`;
  hoverCardEl.style.top = `${top}px`;
  const rect = hoverCardEl.getBoundingClientRect();
  if (rect.right > window.innerWidth - padding) {
    left = hoverAnchor.x - rect.width - offset;
  }
  if (rect.bottom > window.innerHeight - padding) {
    top = hoverAnchor.y - rect.height - offset;
  }
  left = Math.max(padding, Math.min(left, window.innerWidth - rect.width - padding));
  top = Math.max(padding, Math.min(top, window.innerHeight - rect.height - padding));
  hoverCardEl.style.left = `${left}px`;
  hoverCardEl.style.top = `${top}px`;
}

function getHoverAnchor(target, rect, scaleX, scaleY) {
  const anchor = getHoverAnchorWorld(target);
  if (!anchor) return null;
  return {
    x: rect.left + (anchor.x - camera.x) / scaleX,
    y: rect.top + (anchor.y - camera.y) / scaleY,
  };
}

function getHoverAnchorWorld(target) {
  if (target.type === "player") {
    return { x: player.px, y: player.py - tileSize * 0.6 };
  }
  if (target.type === "creature") {
    const center = tileCenter(target.obj.tx, target.obj.ty);
    return { x: center.x, y: center.y - tileSize * 0.6 };
  }
  if (target.type === "resource") {
    const center = tileCenter(target.obj.tx, target.obj.ty);
    return { x: center.x, y: center.y - tileSize * 0.5 };
  }
  return null;
}

function buildHoverCardData(target) {
  if (target.type === "player") {
    return {
      image: PLAYER_HERO_IMAGE,
      name: "Taticorn",
      stats: [
        { label: "Health", value: "100" },
        { label: "Mood", value: "Focused" },
        { label: "Gold", value: progress.inventory.GOLD ?? 0 },
        { label: "Wood", value: progress.inventory.WOOD ?? 0 },
        { label: "Stone", value: progress.inventory.STONE ?? 0 },
      ],
    };
  }
  const creature = target.obj;
  if (!creature) return null;
  if (target.type === "resource") {
    const estimate = estimateResourceAmount(creature.amount);
    const style = RESOURCE_STYLES[creature.type] || RESOURCE_STYLES.WOOD;
    const heroImage =
      RESOURCE_HERO_IMAGES[creature.type] || style.icon || "";
    return {
      image: heroImage,
      name: `${formatResourceName(creature.type)} Pile`,
      stats: [{ label: "Pile", value: estimate }],
    };
  }
  const stats = normalizeStats(creature.stats);
  return {
    image: creature.hero || "",
    name: creature.name || formatCreatureName(creature.id),
    stats,
  };
}

function normalizeStats(stats) {
  if (Array.isArray(stats)) {
    return stats.map((entry) => ({
      label: String(entry.label ?? ""),
      value: String(entry.value ?? ""),
    }));
  }
  if (stats && typeof stats === "object") {
    return Object.entries(stats).map(([label, value]) => ({
      label,
      value: String(value),
    }));
  }
  return Object.entries(DEFAULT_CREATURE_STATS).map(([label, value]) => ({
    label,
    value: String(value),
  }));
}

function estimateResourceAmount(amount) {
  const value = Number(amount) || 0;
  if (value >= 8) return "Huge";
  if (value >= 4) return "Medium";
  return "Small";
}

function formatCreatureName(id) {
  if (!id) return "Creature";
  return String(id)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function updateDialogHero(target) {
  if (!dialogHeroEl || !dialogHeroImg) return;
  const heroPath = target?.hero;
  if (heroPath) {
    dialogHeroImg.src = heroPath;
    dialogHeroImg.alt = target?.id || "creature";
    dialogHeroEl.removeAttribute("hidden");
  } else {
    dialogHeroEl.setAttribute("hidden", "true");
    dialogHeroImg.removeAttribute("src");
    dialogHeroImg.alt = "";
  }
}

function updatePlayerAnimation(delta) {
  if (!playerSprite) return;
  const moving = activePath.length > 0;
  const nextAction =
    moving && playerSprite.animations.walk ? "walk" : "idle";
  if (nextAction !== playerSprite.action) {
    playerSprite.action = nextAction;
    playerSprite.frameIndex = 0;
    playerSprite.frameTimer = 0;
  }
  const fps =
    playerSprite.fps?.[playerSprite.action] ||
    playerSprite.fps?.idle ||
    6;
  const frameNames = getPlayerFrameNames(playerSprite.action);
  if (!frameNames.length) return;
  playerSprite.frameTimer += delta * 1000;
  const frameDuration = 1000 / fps;
  if (playerSprite.frameTimer >= frameDuration) {
    const steps = Math.floor(playerSprite.frameTimer / frameDuration);
    playerSprite.frameIndex =
      (playerSprite.frameIndex + steps) % frameNames.length;
    playerSprite.frameTimer -= steps * frameDuration;
  }
}

function getPlayerFrameNames(action) {
  if (!playerSprite) return [];
  const frames =
    playerSprite.animations[action] ||
    playerSprite.animations.idle ||
    [];
  return frames.length ? frames : Object.keys(playerSprite.frames);
}

function applyCollectedResources() {
  const collected = progress.collected || {};
  objects.forEach((obj) => {
    if (obj.kind === RESOURCE_KIND && collected[obj.id]) {
      obj.collected = true;
    }
  });
}

function rebuildResourceIndex() {
  resourceByTile = new Map();
  objects.forEach((obj) => {
    if (obj.kind !== RESOURCE_KIND) return;
    if (obj.collected) return;
    resourceByTile.set(tileKey(obj.tx, obj.ty), obj);
  });
}

function getResourceAt(tx, ty) {
  return resourceByTile.get(tileKey(tx, ty));
}

function rebuildBlockingIndex() {
  blockedByTile = new Map();
  objects.forEach((obj) => {
    if (obj.kind === RESOURCE_KIND && obj.collected) return;
    if (obj.kind === RESOURCE_KIND || obj.kind === CREATURE_KIND) {
      blockedByTile.set(tileKey(obj.tx, obj.ty), obj);
    }
  });
}

function getBlockingAt(tx, ty) {
  return blockedByTile.get(tileKey(tx, ty));
}

function hasBlockingObject(tx, ty) {
  return Boolean(getBlockingAt(tx, ty));
}

function areResourceGoalsMet() {
  if (!mapData) return true;
  const goals = mapData.resourceGoals || {};
  return Object.entries(goals).every(([type, amount]) => {
    const have = progress.inventory[type] ?? 0;
    return have >= amount;
  });
}

function reconstructPath(cameFrom, current) {
  const path = [current];
  let key = nodeKey(current);
  while (cameFrom.has(key)) {
    key = cameFrom.get(key);
    if (!key) break;
    path.unshift(parseKey(key));
  }
  return path;
}

function heuristic(a, b) {
  return (Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty)) * MIN_STEP_COST;
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

function nodeKey(node) {
  return `${node.tx},${node.ty}`;
}

function parseKey(key) {
  const [tx, ty] = key.split(",").map((value) => Number(value));
  return { tx, ty };
}

function lowestScore(open, fScore) {
  let bestKey = null;
  let bestScore = Infinity;
  open.forEach((key) => {
    const score = fScore.get(key);
    if (score < bestScore) {
      bestScore = score;
      bestKey = key;
    }
  });
  return bestKey;
}

function tileKey(tx, ty) {
  return `${tx},${ty}`;
}

function isRoadTile(tx, ty) {
  return getTile(tx, ty) === 2;
}

function roadEdgesForForest(tx, ty) {
  return {
    top: isRoadTile(tx, ty - 1),
    right: isRoadTile(tx + 1, ty),
    bottom: isRoadTile(tx, ty + 1),
    left: isRoadTile(tx - 1, ty),
  };
}

function isRoadNearby(tx, ty, radius) {
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (isRoadTile(tx + dx, ty + dy)) return true;
    }
  }
  return false;
}

function hashCoord(tx, ty) {
  const hash = (tx * 73856093) ^ (ty * 19349663);
  return hash >>> 0;
}
