export function findPath(start, goal, { neighbors, isWalkable, heuristic }) {
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
      const tentative = (gScore.get(currentKey) ?? Infinity) + 1;
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
