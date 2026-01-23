import { applyDecorRules } from "./refine-decor.js";

const INTENT_CODES = {
  grass: "g",
  forest: "f",
  water: "w",
  mountain: "m",
  village: "v",
  path: "p"
};

const CODE_TO_TOKEN = {
  g: "grass",
  f: "forest",
  w: "water",
  m: "mountain",
  v: "village",
  p: "path"
};

const LEGEND_BY_CODE = {
  g: { terrain: "grass", elevation: "low" },
  f: { terrain: "forest", elevation: "mid", tags: ["tree_cluster"] },
  w: { terrain: "water", elevation: "low", water_hint: true },
  m: { terrain: "mountain", elevation: "high" },
  v: { terrain: "village", elevation: "low", landmark_hint: true },
  p: { terrain: "path", elevation: "low", road_hint: true }
};

export function syncRefineDefaults(context) {
  const map = context.store.getState();
  if (context.dom.refineBaseLabel) {
    context.dom.refineBaseLabel.textContent = `Base: ${map.width}x${map.height}`;
  }
  if (context.dom.refineTargetWidth && !context.dom.refineTargetWidth.value) {
    context.dom.refineTargetWidth.value = String(map.width * 2);
  }
  if (context.dom.refineTargetHeight && !context.dom.refineTargetHeight.value) {
    context.dom.refineTargetHeight.value = String(map.height * 2);
  }
}

export async function requestMapRefine(context) {
  if (window.location.protocol === "file:") {
    return { ok: false, error: "Map refinement requires the local server." };
  }
  const map = context.store.getState();
  const baseWidth = map.width;
  const baseHeight = map.height;
  const targetWidth = parseInt(context.dom.refineTargetWidth?.value || "", 10);
  const targetHeight = parseInt(context.dom.refineTargetHeight?.value || "", 10);

  if (!Number.isInteger(targetWidth) || !Number.isInteger(targetHeight)) {
    return { ok: false, error: "Target resolution must be numbers." };
  }
  if (targetWidth % baseWidth !== 0 || targetHeight % baseHeight !== 0) {
    return {
      ok: false,
      error: "Target resolution must be a clean multiple of the base resolution."
    };
  }

  const { rows, legend } = buildIntentRows(context, map);
  const tileset = context.dom.refineTileset?.value.trim() || "stellacorn_adventure";
  const decorStyle = context.dom.refineDecor?.value.trim() || "storybook_fantasy";
  const seedValue = context.dom.refineSeed?.value.trim();
  const seed = seedValue && seedValue !== "auto" ? seedValue : map.seed || "auto";

  const notes = Array.isArray(map.notes)
    ? map.notes.map((note) => ({
      x: Number.isFinite(note.x) ? note.x : 0,
      y: Number.isFinite(note.y) ? note.y : 0,
      w: Number.isFinite(note.w) ? note.w : 1,
      h: Number.isFinite(note.h) ? note.h : 1,
      text: typeof note.text === "string" ? note.text.trim() : ""
    }))
    : [];
  const filteredNotes = notes.filter((note) => note.text);

  try {
    const response = await fetch("/api/map/refine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        base_resolution: [baseWidth, baseHeight],
        target_resolution: [targetWidth, targetHeight],
        tileset,
        decor_style: decorStyle,
        seed,
        intent_map: {
          width: baseWidth,
          height: baseHeight,
          rows,
          legend,
          legend_keys: Object.keys(legend)
        },
        notes: filteredNotes
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, error: payload.error || "Map refinement failed." };
    }
    return { ok: true, refined: payload };
  } catch (error) {
    return { ok: false, error: "Map refinement request failed." };
  }
}

export function applyRefinedMap(context, refined) {
  const baseMap = context.store.getState();
  const target = Array.isArray(refined.target_resolution) ? refined.target_resolution : [];
  const targetWidth = Number(target[0]) || baseMap.width;
  const targetHeight = Number(target[1]) || baseMap.height;
  const terrainGrid = normalizeGrid(refined.layers?.terrain, targetWidth, targetHeight);
  const waterGrid = normalizeGrid(refined.layers?.water, targetWidth, targetHeight);
  const roadGrid = normalizeGrid(refined.layers?.roads, targetWidth, targetHeight);
  const elevationGrid = normalizeGrid(refined.layers?.elevation, targetWidth, targetHeight);

  const nextTiles = new Array(targetWidth * targetHeight).fill(0);
  const resolvedTokens = new Array(targetWidth * targetHeight).fill("");
  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const terrainToken = normalizeToken(terrainGrid?.[y]?.[x]);
      const waterToken = normalizeToken(waterGrid?.[y]?.[x]);
      const roadToken = normalizeToken(roadGrid?.[y]?.[x]);
      const elevationToken = elevationGrid?.[y]?.[x];

      let resolvedToken = terrainToken;
      if (isWaterToken(waterToken)) {
        resolvedToken = "water";
      }
      if (isRoadToken(roadToken)) {
        resolvedToken = "path";
      }
      const tileId = resolveTileId(context, resolvedToken, elevationToken);
      nextTiles[y * targetWidth + x] = tileId;
      resolvedTokens[y * targetWidth + x] = resolvedToken;
    }
  }

  applyRiverbanks({
    context,
    nextTiles,
    resolvedTokens,
    elevationGrid,
    targetWidth,
    targetHeight
  });

  const baseResolution = Array.isArray(refined.base_resolution)
    ? refined.base_resolution
    : [baseMap.width, baseMap.height];
  const scaledNotes = scaleNotes(baseMap.notes || [], baseResolution, [
    targetWidth,
    targetHeight
  ]);

  const objects = applyDecorRules({
    context,
    refined,
    terrainGrid,
    roadGrid,
    waterGrid,
    normalizeToken,
    isRoadToken,
    isWaterToken
  });

  return {
    ...baseMap,
    width: targetWidth,
    height: targetHeight,
    tiles: nextTiles,
    objects,
    roads: [],
    rivers: [],
    storyZones: [],
    notes: scaledNotes,
    sketchTiles: null,
    seed: refined.seed || baseMap.seed,
    refinement: {
      base_resolution: baseResolution,
      target_resolution: [targetWidth, targetHeight],
      tileset: refined.tileset || "",
      decor_style: refined.decor_style || "",
      seed: refined.seed || baseMap.seed,
      regions: Array.isArray(refined.regions) ? refined.regions : [],
      decor_rules: Array.isArray(refined.decor_rules) ? refined.decor_rules : []
    }
  };
}

function buildIntentRows(context, map) {
  const rows = [];
  const useSketch =
    Array.isArray(map.sketchTiles) && map.sketchTiles.length === map.width * map.height;
  for (let y = 0; y < map.height; y += 1) {
    let row = "";
    for (let x = 0; x < map.width; x += 1) {
      let token = "grass";
      if (useSketch) {
        token = map.sketchTiles[y * map.width + x] || "grass";
      } else {
        const tileId = map.tiles[y * map.width + x];
        const tile = context.tilesById[tileId];
        token = guessTokenFromTile(tile);
      }
      row += INTENT_CODES[token] || "g";
    }
    rows.push(row);
  }

  return {
    rows,
    legend: LEGEND_BY_CODE
  };
}

function guessTokenFromTile(tile) {
  if (!tile || !tile.name) {
    return "grass";
  }
  const name = tile.name.toLowerCase();
  if (name.includes("forest")) return "forest";
  if (name.includes("water") || name.includes("river") || name.includes("lake"))
    return "water";
  if (name.includes("mountain") || name.includes("hill")) return "mountain";
  if (name.includes("village") || name.includes("town")) return "village";
  if (name.includes("road") || name.includes("path") || name.includes("dirt"))
    return "path";
  return "grass";
}

function normalizeGrid(grid, width, height) {
  if (!Array.isArray(grid) || grid.length !== height) {
    return null;
  }
  const normalized = [];
  for (const row of grid) {
    if (Array.isArray(row)) {
      if (row.length !== width) {
        return null;
      }
      normalized.push(row);
      continue;
    }
    if (typeof row === "string") {
      if (row.length !== width) {
        return null;
      }
      normalized.push(row.split(""));
      continue;
    }
    return null;
  }
  return normalized;
}

function normalizeToken(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number") {
    return String(value);
  }
  const normalized = String(value).trim().toLowerCase();
  return CODE_TO_TOKEN[normalized] || normalized;
}

function isWaterToken(token) {
  if (!token) {
    return false;
  }
  const mapped = CODE_TO_TOKEN[token] || token;
  if (mapped === "1" || mapped === "true") {
    return true;
  }
  return mapped.includes("water") || mapped.includes("river") || mapped.includes("lake");
}

function isRoadToken(token) {
  if (!token) {
    return false;
  }
  const mapped = CODE_TO_TOKEN[token] || token;
  if (mapped === "1" || mapped === "true") {
    return true;
  }
  return mapped.includes("road") || mapped.includes("path");
}

function resolveTileId(context, token, elevationToken) {
  if (token === "") {
    token = "grass";
  }
  token = CODE_TO_TOKEN[token] || token;
  if (Number.isFinite(Number(token)) && context.tilesById[Number(token)]) {
    return Number(token);
  }
  const tilesByName = context.tilesByName;
  const lookup = {
    grass: ["grass"],
    plains: ["grass"],
    forest: ["forest"],
    water: ["water"],
    mountain: ["mountain"],
    village: ["village"],
    town: ["village"],
    path: ["plains-dirt", "plains-sand", "grass"],
    road: ["plains-dirt", "plains-sand", "grass"],
    beach: ["beach", "plains-sand", "grass"],
    rock: ["rock", "mountain", "hill-dirt", "hill-grass"],
    hill: ["hill-grass", "hill-dirt", "grass"]
  };
  const candidates = lookup[token] || [token, "grass"];
  let tileId = null;
  for (const name of candidates) {
    if (tilesByName[name]) {
      tileId = tilesByName[name].id;
      break;
    }
  }
  if (tileId === null || tileId === undefined) {
    tileId = tilesByName.grass ? tilesByName.grass.id : 0;
  }
  if (elevationToken !== undefined && elevationToken !== null) {
    const elevationValue = Number(elevationToken);
    if (!Number.isNaN(elevationValue)) {
      if (elevationValue >= 0.7 && tilesByName.mountain) {
        tileId = tilesByName.mountain.id;
      } else if (elevationValue >= 0.4 && tilesByName["hill-grass"]) {
        tileId = tilesByName["hill-grass"].id;
      }
    }
  }
  return tileId;
}

function applyRiverbanks({
  context,
  nextTiles,
  resolvedTokens,
  elevationGrid,
  targetWidth,
  targetHeight
}) {
  const tilesByName = context.tilesByName || {};
  const hasBeach = Boolean(tilesByName.beach || tilesByName["plains-sand"]);
  const hasRock = Boolean(
    tilesByName.rock || tilesByName.mountain || tilesByName["hill-dirt"] || tilesByName["hill-grass"]
  );
  if (!hasBeach && !hasRock) {
    return;
  }

  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const index = y * targetWidth + x;
      const token = normalizeToken(resolvedTokens[index]);
      if (!isBankCandidate(token)) {
        continue;
      }
      if (!hasAdjacentWater(resolvedTokens, x, y, targetWidth, targetHeight)) {
        continue;
      }
      const bankToken = pickBankToken(token, hasBeach, hasRock);
      if (!bankToken) {
        continue;
      }
      nextTiles[index] = resolveTileId(
        context,
        bankToken,
        elevationGrid?.[y]?.[x]
      );
    }
  }
}

function isBankCandidate(token) {
  if (!token) {
    return false;
  }
  const normalized = CODE_TO_TOKEN[token] || token;
  if (isWaterToken(normalized) || isRoadToken(normalized)) {
    return false;
  }
  if (normalized.includes("village") || normalized.includes("town")) {
    return false;
  }
  if (normalized.includes("beach") || normalized.includes("rock")) {
    return false;
  }
  return true;
}

function hasAdjacentWater(resolvedTokens, x, y, width, height) {
  const neighbors = [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1]
  ];
  return neighbors.some(([nx, ny]) => {
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
      return false;
    }
    const token = normalizeToken(resolvedTokens[ny * width + nx]);
    return isWaterToken(token);
  });
}

function pickBankToken(token, hasBeach, hasRock) {
  const normalized = CODE_TO_TOKEN[token] || token;
  const isRocky =
    normalized.includes("mountain") ||
    normalized.includes("hill") ||
    normalized.includes("rock");
  if (isRocky && hasRock) {
    return "rock";
  }
  if (hasBeach) {
    return "beach";
  }
  if (hasRock) {
    return "rock";
  }
  return "";
}

function scaleNotes(notes, baseResolution, targetResolution) {
  if (!Array.isArray(notes)) {
    return [];
  }
  const [baseW, baseH] = baseResolution;
  const [targetW, targetH] = targetResolution;
  const scaleX = baseW ? targetW / baseW : 1;
  const scaleY = baseH ? targetH / baseH : 1;
  return notes.map((note) => ({
    ...note,
    x: Math.round(note.x * scaleX),
    y: Math.round(note.y * scaleY),
    w: Math.max(1, Math.round(note.w * scaleX)),
    h: Math.max(1, Math.round(note.h * scaleY))
  }));
}
