export function updateRectSelection(context, start, end, updateStatusFn) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const w = Math.abs(start.x - end.x) + 1;
  const h = Math.abs(start.y - end.y) + 1;
  context.state.selection = { bounds: { x, y, w, h } };
  context.renderer.setSelection(context.state.selection);
  updateStatusFn();
}

export function updateLassoSelection(context, updateStatusFn) {
  if (!context.state.lassoCells || context.state.lassoCells.size === 0) {
    return;
  }
  const cells = Array.from(context.state.lassoCells).map((key) => {
    const [x, y] = key.split(",").map(Number);
    return { x, y };
  });
  const bounds = computeBounds(cells);
  context.state.selection = { bounds, cells };
  context.renderer.setSelection(context.state.selection);
  updateStatusFn();
}

export function getBrushCells(center, size, map) {
  const half = Math.floor(size / 2);
  const startX = center.x - half;
  const startY = center.y - half;
  const cells = [];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const cellX = startX + x;
      const cellY = startY + y;
      if (cellX < 0 || cellY < 0 || cellX >= map.width || cellY >= map.height) {
        continue;
      }
      cells.push({ x: cellX, y: cellY });
    }
  }
  return cells;
}

export function addBrushCellsToSet(context, center, size, set) {
  const map = context.store.getState();
  const cells = getBrushCells(center, size, map);
  cells.forEach((cell) => {
    set.add(`${cell.x},${cell.y}`);
  });
}

export function computeBounds(cells) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  cells.forEach((cell) => {
    minX = Math.min(minX, cell.x);
    minY = Math.min(minY, cell.y);
    maxX = Math.max(maxX, cell.x);
    maxY = Math.max(maxY, cell.y);
  });

  return {
    x: minX,
    y: minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1
  };
}
