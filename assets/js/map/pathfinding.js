// Pony Parade: grid-based pathfinding over road tiles.

export const createPathfinder = ({ roads, tileSize, width, height }) => {
  const roadGrid = Array.from({ length: height }, () => new Array(width).fill(false));
  const roadTiles = [];
  const tileKey = (tileX, tileY) => `${tileX},${tileY}`;
  const markRoadTile = (tileX, tileY) => {
    if (tileX < 0 || tileX >= width || tileY < 0 || tileY >= height) return;
    if (roadGrid[tileY][tileX]) return;
    roadGrid[tileY][tileX] = true;
    roadTiles.push({ x: tileX, y: tileY });
  };
  const rasterizeRoad = (start, end) => {
    let x0 = Math.round(start.x);
    let y0 = Math.round(start.y);
    let x1 = Math.round(end.x);
    let y1 = Math.round(end.y);
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (true) {
      markRoadTile(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }
  };
  roads.forEach((segment) => {
    if (!segment || !segment.from || !segment.to) return;
    rasterizeRoad(segment.from, segment.to);
  });

  const tileCenter = (tileX, tileY) => ({
    x: tileX * tileSize,
    y: tileY * tileSize,
  });
  const findNearestRoadTile = (point) => {
    if (!point || !roadTiles.length) return null;
    let best = null;
    let bestDistance = Infinity;
    roadTiles.forEach((tile) => {
      const center = tileCenter(tile.x, tile.y);
      const distance = Math.hypot(center.x - point.x, center.y - point.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = tile;
      }
    });
    return best;
  };
  const getNeighbors = (tile) => {
    const neighbors = [];
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        if (dx === 0 && dy === 0) continue;
        const x = tile.x + dx;
        const y = tile.y + dy;
        if (x < 0 || x >= width || y < 0 || y >= height || !roadGrid[y][x]) {
          continue;
        }
        neighbors.push({
          x,
          y,
          cost: dx === 0 || dy === 0 ? 1 : Math.SQRT2,
        });
      }
    }
    return neighbors;
  };
  const buildTilePath = (startPoint, targetPoint) => {
    if (!startPoint || !targetPoint || !roadTiles.length) return null;
    const startTile = findNearestRoadTile(startPoint);
    const goalTile = findNearestRoadTile(targetPoint);
    if (!startTile || !goalTile) return null;
    const startKey = tileKey(startTile.x, startTile.y);
    const goalKey = tileKey(goalTile.x, goalTile.y);
    const open = new Map();
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();
    const heuristic = (tile) => Math.hypot(tile.x - goalTile.x, tile.y - goalTile.y);
    gScore.set(startKey, 0);
    fScore.set(startKey, heuristic(startTile));
    open.set(startKey, startTile);
    while (open.size > 0) {
      let currentKey = null;
      let currentTile = null;
      let bestScore = Infinity;
      open.forEach((tile, key) => {
        const score = fScore.get(key) ?? Infinity;
        if (score < bestScore) {
          bestScore = score;
          currentKey = key;
          currentTile = tile;
        }
      });
      if (!currentKey || !currentTile) break;
      if (currentKey === goalKey) {
        const pathTiles = [currentTile];
        let backKey = currentKey;
        while (cameFrom.has(backKey)) {
          backKey = cameFrom.get(backKey);
          const coords = backKey.split(",").map(Number);
          pathTiles.push({ x: coords[0], y: coords[1] });
        }
        pathTiles.reverse();
        return pathTiles.map((tile) => tileCenter(tile.x, tile.y));
      }
      open.delete(currentKey);
      const neighbors = getNeighbors(currentTile);
      neighbors.forEach((neighbor) => {
        const neighborKey = tileKey(neighbor.x, neighbor.y);
        const tentativeG = (gScore.get(currentKey) ?? Infinity) + neighbor.cost;
        if (tentativeG < (gScore.get(neighborKey) ?? Infinity)) {
          cameFrom.set(neighborKey, currentKey);
          gScore.set(neighborKey, tentativeG);
          fScore.set(
            neighborKey,
            tentativeG + heuristic({ x: neighbor.x, y: neighbor.y })
          );
          if (!open.has(neighborKey)) {
            open.set(neighborKey, { x: neighbor.x, y: neighbor.y });
          }
        }
      });
    }
    return null;
  };

  const advanceAlongPath = (actor, delta) => {
    if (!actor.path || actor.pathIndex >= actor.path.length) return null;
    if (!actor.position) {
      actor.position = { x: actor.path[0].x, y: actor.path[0].y };
    }
    let current = { x: actor.position.x, y: actor.position.y };
    let remaining = actor.speed * delta;
    let index = actor.pathIndex;
    let heading = null;
    while (remaining > 0 && index < actor.path.length) {
      const target = actor.path[index];
      const dx = target.x - current.x;
      const dy = target.y - current.y;
      const dist = Math.hypot(dx, dy);
      if (dist === 0) {
        index += 1;
        continue;
      }
      if (dist <= remaining) {
        current = { x: target.x, y: target.y };
        remaining -= dist;
        index += 1;
        heading = { from: actor.position, to: target };
      } else {
        const ratio = remaining / dist;
        current = { x: current.x + dx * ratio, y: current.y + dy * ratio };
        remaining = 0;
        heading = { from: actor.position, to: target };
      }
    }
    actor.position = current;
    actor.pathIndex = index;
    return heading;
  };

  return {
    tileKey,
    tileCenter,
    findNearestRoadTile,
    buildTilePath,
    advanceAlongPath,
  };
};
