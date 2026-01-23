import { updatePaletteActive } from "./palette.js";
import { getBrushCells } from "./selection.js";

const SKETCH_PALETTE = [
  { id: "grass", label: "Grass", color: "#8bcf7a", tileName: "grass" },
  { id: "forest", label: "Forest", color: "#4d8c63", tileName: "forest" },
  { id: "water", label: "Water", color: "#6bb4d6", tileName: "water" },
  { id: "mountain", label: "Mountain", color: "#9a9a9a", tileName: "mountain" },
  { id: "village", label: "Village", color: "#e0c092", tileName: "village" },
  { id: "path", label: "Path", color: "#c9a57c", tileName: "plains-dirt" }
];

export function initSketchPalette(context) {
  context.sketchPaletteById = {};
  SKETCH_PALETTE.forEach((entry) => {
    context.sketchPaletteById[entry.id] = entry;
  });
  if (!context.state.selectedSketchId) {
    context.state.selectedSketchId = SKETCH_PALETTE[0].id;
  }
}

export function buildSketchPalette(context, setTool) {
  if (!context.dom.sketchPaletteEl) {
    return;
  }
  context.dom.sketchPaletteEl.innerHTML = "";
  SKETCH_PALETTE.forEach((entry) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.sketchId = entry.id;
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = entry.color;
    button.appendChild(swatch);
    button.appendChild(document.createTextNode(entry.label));
    button.addEventListener("click", () => {
      context.state.selectedSketchId = entry.id;
      updatePaletteActive(context.dom.sketchPaletteEl, "sketchId", entry.id);
      setTool("paint");
    });
    context.dom.sketchPaletteEl.appendChild(button);
  });
  updatePaletteActive(context.dom.sketchPaletteEl, "sketchId", context.state.selectedSketchId);
}

export function ensureSketchLayer(context) {
  const map = context.store.getState();
  const expected = map.width * map.height;
  if (!Array.isArray(map.sketchTiles) || map.sketchTiles.length !== expected) {
    map.sketchTiles = new Array(expected).fill(SKETCH_PALETTE[0].id);
  }
}

export function paintSketchTiles(context, grid) {
  if (!context.state.selectedSketchId) {
    return;
  }
  const map = context.store.getState();
  ensureSketchLayer(context);
  const cells = getBrushCells(grid, context.state.brushSize, map);
  cells.forEach((cell) => {
    const index = cell.y * map.width + cell.x;
    map.sketchTiles[index] = context.state.selectedSketchId;
  });
}

export function deleteSketchTiles(context, grid) {
  const map = context.store.getState();
  ensureSketchLayer(context);
  const cells = getBrushCells(grid, context.state.brushSize, map);
  cells.forEach((cell) => {
    const index = cell.y * map.width + cell.x;
    map.sketchTiles[index] = SKETCH_PALETTE[0].id;
  });
}

export function floodFillSketch(context, startX, startY, newId) {
  const map = context.store.getState();
  ensureSketchLayer(context);
  const { width, height, sketchTiles } = map;
  const startIndex = startY * width + startX;
  const targetId = sketchTiles[startIndex];
  if (targetId === newId) {
    return;
  }

  const queue = [{ x: startX, y: startY }];
  const visited = new Set();

  while (queue.length > 0) {
    const { x, y } = queue.pop();
    const index = y * width + x;
    const key = `${x},${y}`;
    if (visited.has(key)) {
      continue;
    }
    visited.add(key);

    if (sketchTiles[index] !== targetId) {
      continue;
    }

    sketchTiles[index] = newId;

    if (x > 0) queue.push({ x: x - 1, y });
    if (x < width - 1) queue.push({ x: x + 1, y });
    if (y > 0) queue.push({ x, y: y - 1 });
    if (y < height - 1) queue.push({ x, y: y + 1 });
  }
}

export function generateTilesFromSketch(context) {
  const map = context.store.getState();
  ensureSketchLayer(context);
  const mapping = buildSketchMapping(context.tilesByName);
  const nextTiles = map.tiles.slice();
  let changed = 0;

  map.sketchTiles.forEach((sketchId, index) => {
    const tileId = mapping[sketchId];
    if (tileId === undefined) {
      return;
    }
    if (nextTiles[index] !== tileId) {
      nextTiles[index] = tileId;
      changed += 1;
    }
  });

  map.tiles = nextTiles;
  return { changed };
}

export function prettifyTiles(context) {
  const map = context.store.getState();
  const { width, height, tiles } = map;
  const forestId = context.tilesByName.forest?.id;
  if (forestId === undefined) {
    return { changed: 0 };
  }
  const borderId = context.tilesByName["forest-border"]?.id;
  const canopyId = context.tilesByName["forest-canopy"]?.id;

  const nextTiles = tiles.slice();
  let changed = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const id = tiles[index];
      if (!isForestFamily(id, forestId, borderId, canopyId)) {
        continue;
      }

      const edge = hasNonForestNeighbor(tiles, width, height, x, y, forestId, borderId, canopyId);
      let nextId = id;
      if (edge && borderId !== undefined) {
        nextId = borderId;
      } else if (!edge && canopyId !== undefined) {
        nextId = canopyId;
      } else if (!edge) {
        nextId = forestId;
      }

      if (nextId !== id) {
        nextTiles[index] = nextId;
        changed += 1;
      }
    }
  }

  map.tiles = nextTiles;
  return { changed };
}

function buildSketchMapping(tilesByName) {
  return {
    grass: tilesByName.grass?.id,
    forest: tilesByName.forest?.id,
    water: tilesByName.water?.id,
    mountain: tilesByName.mountain?.id,
    village: tilesByName.village?.id,
    path:
      tilesByName["plains-dirt"]?.id ??
      tilesByName["plains-sand"]?.id ??
      tilesByName.grass?.id
  };
}

function isForestFamily(id, forestId, borderId, canopyId) {
  return id === forestId || id === borderId || id === canopyId;
}

function hasNonForestNeighbor(tiles, width, height, x, y, forestId, borderId, canopyId) {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  for (const [dx, dy] of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
      return true;
    }
    const neighborId = tiles[ny * width + nx];
    if (!isForestFamily(neighborId, forestId, borderId, canopyId)) {
      return true;
    }
  }
  return false;
}
