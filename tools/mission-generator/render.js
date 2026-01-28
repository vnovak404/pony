import { state } from "./state.js";
import { els, ctx, miniCtx, MIN_TILE_SIZE, MAX_TILE_SIZE } from "./dom.js";
import { clamp, resolveActionKey, resolveActionLabel } from "./utils.js";

const imageCache = new Map();

function getImage(path) {
  if (!path) return null;
  const normalized = path.startsWith("http") ? path : path;
  let entry = imageCache.get(normalized);
  if (!entry) {
    const img = new Image();
    entry = { img, loaded: false, failed: false };
    imageCache.set(normalized, entry);
    img.onload = () => {
      entry.loaded = true;
      renderMap();
    };
    img.onerror = () => {
      entry.failed = true;
    };
    img.src = normalized;
  }
  return entry.loaded ? entry.img : null;
}

export function renderMap() {
  if (!ctx || !state.bundle?.map) return;
  const map = state.bundle.map;
  const tiles = state.bundle.tiles?.tiles || [];
  const tileDefs = new Map(tiles.map((tile) => [tile.id, tile]));
  const objectDefs = new Map((state.bundle.objects?.objects || []).map((obj) => [obj.type, obj]));
  const width = map.width;
  const height = map.height;
  if (!width || !height) return;

  const canvasWidth = els.canvas.width;
  const canvasHeight = els.canvas.height;
  const tileSize = clamp(Math.floor(canvasWidth / width), MIN_TILE_SIZE, MAX_TILE_SIZE);
  const viewCols = Math.floor(canvasWidth / tileSize);
  const viewRows = Math.floor(canvasHeight / tileSize);
  const camX = clamp(state.camera.x, 0, Math.max(0, width - viewCols));
  const camY = clamp(state.camera.y, 0, Math.max(0, height - viewRows));

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  for (let y = 0; y < viewRows; y += 1) {
    for (let x = 0; x < viewCols; x += 1) {
      const tx = camX + x;
      const ty = camY + y;
      if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
      const tileId = map.tiles[ty * width + tx];
      const tile = tileDefs.get(tileId);
      if (state.renderAssets && tile?.asset) {
        const img = getImage(tile.asset);
        if (img) {
          ctx.drawImage(img, x * tileSize, y * tileSize, tileSize, tileSize);
          continue;
        }
      }
      ctx.fillStyle = tile?.color || "#e2e8f0";
      ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
    }
  }

  (map.objects || []).forEach((obj) => {
    const x = obj.x - camX;
    const y = obj.y - camY;
    if (x < 0 || y < 0 || x >= viewCols || y >= viewRows) return;
    if (state.renderAssets) {
      const def = objectDefs.get(obj.type);
      if (def?.asset) {
        const img = getImage(def.asset);
        if (img) {
          ctx.drawImage(img, x * tileSize, y * tileSize, tileSize, tileSize);
          return;
        }
      }
    }
    ctx.fillStyle = "#fef3c7";
    ctx.fillRect(x * tileSize + tileSize * 0.15, y * tileSize + tileSize * 0.15, tileSize * 0.7, tileSize * 0.7);
  });

  if (state.playtest) {
    ctx.fillStyle = "#ff7a59";
    ctx.beginPath();
    ctx.arc(
      (state.player.x - camX) * tileSize + tileSize * 0.5,
      (state.player.y - camY) * tileSize + tileSize * 0.5,
      tileSize * 0.35,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  renderMinimap(map, tileDefs, { camX, camY, viewCols, viewRows, tileSize });
}

export function renderMinimap(map, tileDefs, view) {
  if (!miniCtx) return;
  const width = map.width;
  const height = map.height;
  if (!width || !height) return;
  const tileSize = clamp(Math.floor(els.minimap.width / width), 2, 8);
  miniCtx.clearRect(0, 0, els.minimap.width, els.minimap.height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tileId = map.tiles[y * width + x];
      const tile = tileDefs.get(tileId);
      miniCtx.fillStyle = tile?.color || "#e2e8f0";
      miniCtx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
    }
  }
  if (view) {
    miniCtx.strokeStyle = "rgba(255, 122, 89, 0.8)";
    miniCtx.lineWidth = 2;
    miniCtx.strokeRect(
      view.camX * tileSize,
      view.camY * tileSize,
      view.viewCols * tileSize,
      view.viewRows * tileSize
    );
  }
  if (state.playtest) {
    miniCtx.fillStyle = "#ff7a59";
    miniCtx.beginPath();
    miniCtx.arc(
      state.player.x * tileSize + tileSize * 0.5,
      state.player.y * tileSize + tileSize * 0.5,
      tileSize * 0.35,
      0,
      Math.PI * 2
    );
    miniCtx.fill();
  }
}

export function findNearbyInteraction() {
  if (!state.bundle?.map || !state.bundle?.mission) return null;
  const map = state.bundle.map;
  const objects = map.objects || [];
  const player = state.player;
  let best = null;
  objects.forEach((obj) => {
    if (!obj) return;
    const dx = Math.abs(obj.x - player.x);
    const dy = Math.abs(obj.y - player.y);
    const distance = Math.max(dx, dy);
    if (distance > 1) return;
    const interaction = state.interactions.get(obj.id);
    if (!interaction) return;
    if (!best || distance < best.distance) {
      best = { target: obj, interaction, distance };
    }
  });
  return best;
}

export function setActionBar(visible, label, ratio = 0) {
  if (!els.actionBar) return;
  if (visible) {
    els.actionBar.removeAttribute("hidden");
  } else {
    els.actionBar.setAttribute("hidden", "true");
  }
  if (els.actionLabel) els.actionLabel.textContent = label;
  if (els.actionFill) els.actionFill.style.width = `${Math.round(ratio * 100)}%`;
}

export function updateActionPrompt() {
  if (!state.playtest) {
    setActionBar(false, "");
    return;
  }
  if (state.action.active) return;
  const nearby = findNearbyInteraction();
  if (!nearby) {
    setActionBar(false, "");
    return;
  }
  const action = nearby.interaction.action || "interact";
  const label = resolveActionLabel(action);
  const key = resolveActionKey(action);
  setActionBar(true, `Hold ${key} to ${label}`, 0);
}

export function startHold(key, nearby) {
  if (state.action.active) return;
  const interaction = nearby.interaction;
  state.action.active = true;
  state.action.start = performance.now();
  state.action.key = key;
  state.action.target = nearby;
  state.action.duration = interaction.durationMs || interaction.duration || 1400;
  tickHold();
}

export function cancelHold() {
  state.action.active = false;
  state.action.key = null;
  state.action.target = null;
  setActionBar(false, "");
}

export function completeHold() {
  const target = state.action.target;
  state.action.active = false;
  state.action.key = null;
  state.action.target = null;
  if (target?.interaction && typeof state.onHoldComplete === "function") {
    state.onHoldComplete(target.interaction, target.target);
  }
  updateActionPrompt();
}

export function tickHold() {
  if (!state.action.active) return;
  const now = performance.now();
  const elapsed = now - state.action.start;
  const ratio = Math.min(1, elapsed / state.action.duration);
  const nearby = findNearbyInteraction();
  if (!nearby || nearby.target.id !== state.action.target?.target?.id) {
    cancelHold();
    return;
  }
  const action = nearby.interaction.action || "interact";
  const label = resolveActionLabel(action);
  const key = resolveActionKey(action);
  setActionBar(true, `Hold ${key} to ${label}`, ratio);
  if (ratio >= 1) {
    completeHold();
    return;
  }
  requestAnimationFrame(tickHold);
}

export function isWalkableTile(x, y) {
  if (!state.bundle?.map || !state.bundle?.tiles) return false;
  const map = state.bundle.map;
  const tiles = state.bundle.tiles?.tiles || [];
  const tileDefs = new Map(tiles.map((tile) => [tile.id, tile]));
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
  const tileId = map.tiles[y * map.width + x];
  return tileDefs.get(tileId)?.walkable ?? false;
}

export function panCamera(dx, dy) {
  if (!state.bundle?.map) return;
  const map = state.bundle.map;
  const width = map.width;
  const height = map.height;
  state.camera.x = clamp(state.camera.x + dx, 0, Math.max(0, width - 1));
  state.camera.y = clamp(state.camera.y + dy, 0, Math.max(0, height - 1));
  renderMap();
}
