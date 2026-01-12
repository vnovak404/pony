// Pony Parade: decor placement helpers.

const hashString = (value) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const makeRng = (seed) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const distancePointToSegment = (point, segment) => {
  const dx = segment.to.x - segment.from.x;
  const dy = segment.to.y - segment.from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) {
    return Math.hypot(point.x - segment.from.x, point.y - segment.from.y);
  }
  const t =
    ((point.x - segment.from.x) * dx + (point.y - segment.from.y) * dy) /
    lengthSquared;
  const clamped = clamp(t, 0, 1);
  const proj = {
    x: segment.from.x + dx * clamped,
    y: segment.from.y + dy * clamped,
  };
  return Math.hypot(point.x - proj.x, point.y - proj.y);
};

const findClosestRoadPoint = (point, roadSegments) => {
  let closest = null;
  let bestDistance = Infinity;
  roadSegments.forEach((segment) => {
    const dx = segment.to.x - segment.from.x;
    const dy = segment.to.y - segment.from.y;
    const lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) return;
    const t =
      ((point.x - segment.from.x) * dx + (point.y - segment.from.y) * dy) /
      lengthSquared;
    const clamped = clamp(t, 0, 1);
    const proj = {
      x: segment.from.x + dx * clamped,
      y: segment.from.y + dy * clamped,
    };
    const distance = Math.hypot(point.x - proj.x, point.y - proj.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      closest = { point: proj, segment };
    }
  });
  return closest;
};

const buildStructurePoints = (objects, tileSize) => {
  return objects
    .filter((item) => item && item.at)
    .map((item) => ({
      id: item.id,
      point: { x: item.at.x * tileSize, y: item.at.y * tileSize },
      item,
    }));
};

const pickStructure = (structures, rng) => {
  if (!structures.length) return null;
  const index = Math.floor(rng() * structures.length);
  return structures[index];
};

const isSignpostItem = (item) => {
  if (!item) return false;
  const kind = String(item.kind || "").toLowerCase();
  return kind === "marker" || kind === "signpost";
};

export const createDecorPlan = ({
  mapData,
  objects,
  roadSegments,
  getStructureLabel,
}) => {
  const decorLayer = mapData.layers.decor || {};
  const items = Array.isArray(decorLayer.items) ? decorLayer.items : [];
  const randomizeAll = Boolean(decorLayer.randomize);
  const tileSize = mapData.meta.tileSize || 1;
  const seedBase = String(decorLayer.seed || mapData.meta.seed || "ponyville");

  const minRoadTiles = Number.isFinite(decorLayer.minRoadDistance)
    ? decorLayer.minRoadDistance
    : 1.35;
  const minStructureTiles = Number.isFinite(decorLayer.minStructureDistance)
    ? decorLayer.minStructureDistance
    : 1.1;
  const minDecorTiles = Number.isFinite(decorLayer.minDecorDistance)
    ? decorLayer.minDecorDistance
    : 0.9;
  const marginTiles = Number.isFinite(decorLayer.margin)
    ? decorLayer.margin
    : 0.9;
  const maxAttempts = Number.isFinite(decorLayer.maxAttempts)
    ? Math.max(10, decorLayer.maxAttempts)
    : 40;
  const signpostOffsetTiles = Number.isFinite(decorLayer.signpostOffset)
    ? decorLayer.signpostOffset
    : 0.45;

  const structurePoints = buildStructurePoints(objects, tileSize);
  const randomItems = [];
  const staticItems = [];
  const signpostSeeds = [];

  items.forEach((item) => {
    if (!item) return;
    if (isSignpostItem(item)) {
      signpostSeeds.push(item);
      return;
    }
    if (item.random || randomizeAll) {
      randomItems.push(item);
      return;
    }
    staticItems.push(item);
  });

  const occupied = staticItems
    .filter((item) => item.at)
    .map((item) => ({
      x: item.at.x * tileSize,
      y: item.at.y * tileSize,
    }));

  const isFarFromRoads = (point) => {
    if (!roadSegments.length) return true;
    const minDistance = minRoadTiles * tileSize;
    for (const segment of roadSegments) {
      if (distancePointToSegment(point, segment) < minDistance) {
        return false;
      }
    }
    return true;
  };

  const isFarFromStructures = (point) => {
    const minDistance = minStructureTiles * tileSize;
    return structurePoints.every(
      (entry) => Math.hypot(point.x - entry.point.x, point.y - entry.point.y) >= minDistance
    );
  };

  const isFarFromDecor = (point) => {
    const minDistance = minDecorTiles * tileSize;
    return occupied.every(
      (entry) => Math.hypot(point.x - entry.x, point.y - entry.y) >= minDistance
    );
  };

  const pickRandomSpot = (rng) => {
    const width = mapData.meta.width;
    const height = mapData.meta.height;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const x = marginTiles + rng() * (width - marginTiles * 2);
      const y = marginTiles + rng() * (height - marginTiles * 2);
      const point = { x: x * tileSize, y: y * tileSize };
      if (!isFarFromRoads(point)) continue;
      if (!isFarFromStructures(point)) continue;
      if (!isFarFromDecor(point)) continue;
      return { x, y };
    }
    return null;
  };

  const randomizedItems = randomItems.map((item) => {
    const rng = makeRng(hashString(`${seedBase}:${item.id || item.sprite || "decor"}`));
    const spot = pickRandomSpot(rng);
    const next = {
      ...item,
      at: spot || item.at || { x: marginTiles, y: marginTiles },
    };
    if (next.at) {
      occupied.push({ x: next.at.x * tileSize, y: next.at.y * tileSize });
    }
    return next;
  });

  const signpostObjects = signpostSeeds.map((seed) => {
    const rng = makeRng(hashString(`${seedBase}:${seed.id || seed.sprite || "signpost"}`));
    const target = pickStructure(structurePoints, rng);
    const targetLabel = target ? getStructureLabel(target.item) : "Ponyville";
    const targetPoint = target ? target.point : { x: tileSize * 2, y: tileSize * 2 };
    const roadHit = findClosestRoadPoint(targetPoint, roadSegments);
    let point = roadHit ? roadHit.point : targetPoint;
    if (roadHit && roadHit.segment) {
      const dx = roadHit.segment.to.x - roadHit.segment.from.x;
      const dy = roadHit.segment.to.y - roadHit.segment.from.y;
      const length = Math.hypot(dx, dy) || 1;
      const offset = signpostOffsetTiles * tileSize;
      const nx = -dy / length;
      const ny = dx / length;
      const candidateA = { x: point.x + nx * offset, y: point.y + ny * offset };
      const candidateB = { x: point.x - nx * offset, y: point.y - ny * offset };
      const bounds = {
        minX: marginTiles * tileSize,
        minY: marginTiles * tileSize,
        maxX: (mapData.meta.width - marginTiles) * tileSize,
        maxY: (mapData.meta.height - marginTiles) * tileSize,
      };
      const inBounds = (candidate) =>
        candidate.x >= bounds.minX &&
        candidate.x <= bounds.maxX &&
        candidate.y >= bounds.minY &&
        candidate.y <= bounds.maxY;
      point = inBounds(candidateA) ? candidateA : inBounds(candidateB) ? candidateB : point;
    }
    const at = {
      x: Number((point.x / tileSize).toFixed(2)),
      y: Number((point.y / tileSize).toFixed(2)),
    };
    return {
      id: seed.id || `signpost-${seed.sprite}`,
      kind: "signpost",
      spritePath: `assets/world/decor/${seed.sprite}.png`,
      label: `Signpost → ${targetLabel}`,
      at,
      scale: seed.scale || 0.6,
      draggable: false,
    };
  });

  return {
    decorItems: [...staticItems, ...randomizedItems],
    signpostObjects,
  };
};
