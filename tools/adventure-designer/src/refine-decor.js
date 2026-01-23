import { clamp } from "./utils.js";

const DEFAULT_OBJECT_TYPES = {
  tree_cluster: ["tree", "squirrel", "owl"],
  ruins: ["fallen-messenger", "stone-pile", "gold-pile"],
  wildlife: ["deer", "squirrel", "owl"],
  camp: ["wood-pile"]
};

export function applyDecorRules({
  context,
  refined,
  terrainGrid,
  roadGrid,
  waterGrid,
  normalizeToken,
  isRoadToken,
  isWaterToken
}) {
  const rules = Array.isArray(refined.decor_rules) ? refined.decor_rules : [];
  if (rules.length === 0) {
    return [];
  }
  const width = Number(refined.target_resolution?.[0]);
  const height = Number(refined.target_resolution?.[1]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return [];
  }
  const objects = [];
  const occupied = new Set();
  const regionBounds = buildRegionBounds(refined.regions || []);
  const baseSeed = hashSeed(String(refined.seed || "seed"));

  rules.forEach((rule, index) => {
    const density = clamp(Number(rule.density) || 0, 0, 1);
    const objectType = resolveObjectType(rule, context.objectsByType);
    if (!objectType || density <= 0) {
      return;
    }
    const candidates = buildCandidateCells(
      rule,
      terrainGrid,
      regionBounds,
      width,
      height,
      normalizeToken
    );
    if (candidates.length === 0) {
      return;
    }
    const targetCount = Math.max(1, Math.floor(candidates.length * density));
    const rng = createRng(baseSeed + index * 9973);
    const minSpacing = resolveSpacing(rule.spacing);
    const placed = [];

    let attempts = 0;
    let placementIndex = 0;
    while (placed.length < targetCount && attempts < targetCount * 30) {
      attempts += 1;
      const pickIndex = Math.floor(rng() * candidates.length);
      const cell = candidates[pickIndex];
      const key = `${cell.x},${cell.y}`;
      if (occupied.has(key)) {
        continue;
      }
      if (!passesAvoidance(rule, cell, roadGrid, waterGrid, width, height, normalizeToken, isRoadToken, isWaterToken)) {
        continue;
      }
      if (!passesProximity(rule, cell, roadGrid, waterGrid, width, height, normalizeToken, isRoadToken, isWaterToken)) {
        continue;
      }
      if (!passesSpacing(cell, placed, minSpacing)) {
        continue;
      }
      placed.push(cell);
      occupied.add(key);
      placementIndex += 1;
      objects.push({
        id: `obj-${objectType}-${index}-${placementIndex}`,
        type: objectType,
        x: cell.x,
        y: cell.y,
        w: 1,
        h: 1,
        props: { source: "refine" }
      });
    }
  });

  return objects;
}

function resolveObjectType(rule, objectsByType) {
  if (!objectsByType) {
    return null;
  }
  const direct = rule.object || rule.object_type;
  if (direct && objectsByType[direct]) {
    return direct;
  }
  if (rule.type && objectsByType[rule.type]) {
    return rule.type;
  }
  const candidates = DEFAULT_OBJECT_TYPES[rule.type] || [];
  return candidates.find((type) => objectsByType[type]) || null;
}

function buildRegionBounds(regions) {
  const regionBounds = {};
  regions.forEach((region) => {
    if (!region || !region.id) {
      return;
    }
    const bounds = normalizeBounds(region.bounds);
    if (bounds) {
      regionBounds[region.id] = bounds;
    }
  });
  return regionBounds;
}

function normalizeBounds(bounds) {
  if (!bounds) {
    return null;
  }
  if (Array.isArray(bounds) && bounds.length === 4) {
    const [x, y, w, h] = bounds.map(Number);
    if ([x, y, w, h].every((value) => Number.isFinite(value))) {
      return { x, y, w, h };
    }
  }
  if (typeof bounds === "object") {
    const x = Number(bounds.x);
    const y = Number(bounds.y);
    const w = Number(bounds.w);
    const h = Number(bounds.h);
    if ([x, y, w, h].every((value) => Number.isFinite(value))) {
      return { x, y, w, h };
    }
  }
  return null;
}

function buildCandidateCells(rule, terrainGrid, regionBounds, width, height, normalizeToken) {
  const regions = Array.isArray(rule.regions) ? rule.regions : [];
  const regionBoundsList = regions.map((id) => regionBounds[id]).filter(Boolean);
  const cells = [];

  if (regionBoundsList.length > 0) {
    regionBoundsList.forEach((bounds) => {
      const xMax = Math.min(width, bounds.x + bounds.w);
      const yMax = Math.min(height, bounds.y + bounds.h);
      for (let y = Math.max(0, bounds.y); y < yMax; y += 1) {
        for (let x = Math.max(0, bounds.x); x < xMax; x += 1) {
          cells.push({ x, y });
        }
      }
    });
    return cells;
  }

  const regionTokens = regions
    .map((entry) => String(entry || "").toLowerCase())
    .filter(Boolean);
  if (terrainGrid && regionTokens.length > 0) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const token = normalizeToken(terrainGrid[y]?.[x]);
        if (regionTokens.some((entry) => token.includes(entry))) {
          cells.push({ x, y });
        }
      }
    }
    if (cells.length > 0) {
      return cells;
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      cells.push({ x, y });
    }
  }
  return cells;
}

function resolveSpacing(spacing) {
  if (typeof spacing === "number") {
    return Math.max(1, spacing);
  }
  const key = String(spacing || "").toLowerCase();
  if (key === "poisson") return 2;
  if (key === "sparse") return 3;
  if (key === "dense") return 1;
  return 1;
}

function passesAvoidance(rule, cell, roadGrid, waterGrid, width, height, normalizeToken, isRoadToken, isWaterToken) {
  const avoid = Array.isArray(rule.avoid) ? rule.avoid : [];
  if (avoid.includes("roads") && isRoadToken(normalizeToken(roadGrid?.[cell.y]?.[cell.x]))) {
    return false;
  }
  if (avoid.includes("water") && isWaterToken(normalizeToken(waterGrid?.[cell.y]?.[cell.x]))) {
    return false;
  }
  if (avoid.includes("river_banks")) {
    return !hasNeighborMatch(cell, width, height, waterGrid, normalizeToken, isWaterToken);
  }
  return true;
}

function passesProximity(rule, cell, roadGrid, waterGrid, width, height, normalizeToken, isRoadToken, isWaterToken) {
  const req = Array.isArray(rule.require_proximity) ? rule.require_proximity : [];
  if (req.includes("road")) {
    return hasNeighborMatch(cell, width, height, roadGrid, normalizeToken, isRoadToken);
  }
  if (req.includes("water")) {
    return hasNeighborMatch(cell, width, height, waterGrid, normalizeToken, isWaterToken);
  }
  return true;
}

function hasNeighborMatch(cell, width, height, grid, normalizeToken, matcher) {
  if (!grid) {
    return false;
  }
  const dirs = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0]
  ];
  return dirs.some(([dx, dy]) => {
    const nx = cell.x + dx;
    const ny = cell.y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
      return false;
    }
    return matcher(normalizeToken(grid[ny]?.[nx]));
  });
}

function passesSpacing(cell, placed, minSpacing) {
  if (minSpacing <= 1) {
    return true;
  }
  return !placed.some((point) => {
    const dx = point.x - cell.x;
    const dy = point.y - cell.y;
    return Math.sqrt(dx * dx + dy * dy) < minSpacing;
  });
}

function createRng(seed) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function hashSeed(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || 1;
}
