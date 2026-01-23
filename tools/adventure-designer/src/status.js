export function setStatus(context, message) {
  if (context.dom.statusEl) {
    context.dom.statusEl.textContent = message;
  }
}

export function updateStatus(context) {
  const toolLabelByKey = {
    intent: "Intent",
    paint: "Paint",
    fill: "Fill",
    road: "Road",
    river: "River",
    lasso: "Lasso",
    delete: "Delete",
    note: "Note",
    object: "Object"
  };
  const toolLabel = toolLabelByKey[context.state.tool] || "Tool";
  const modeLabel = context.state.mode === "sketch" ? "Sketch" : "Tile";
  let selectionLabel = "No selection";
  if (context.state.selection) {
    if (context.state.selection.cells && context.state.selection.cells.length > 0) {
      selectionLabel = `Lasso ${context.state.selection.cells.length} tiles`;
    } else if (context.state.selection.bounds) {
      selectionLabel = `Selection ${context.state.selection.bounds.w}x${context.state.selection.bounds.h}`;
    }
  }
  const hoverLabel = context.state.hoverInfo ? ` | ${context.state.hoverInfo}` : "";
  setStatus(context, `Mode: ${modeLabel} | Tool: ${toolLabel} | ${selectionLabel}${hoverLabel}`);

  if (context.dom.undoBtn && context.undoStack) {
    context.dom.undoBtn.disabled = !context.undoStack.canUndo();
  }
  if (context.dom.redoBtn && context.undoStack) {
    context.dom.redoBtn.disabled = !context.undoStack.canRedo();
  }
}

export function updateHoverInfo(context, grid, updateStatusFn) {
  const map = context.store.getState();
  const tileId = map.tiles[grid.y * map.width + grid.x];
  const tile = context.tilesById[tileId];
  const tileLabel = tile ? `${tile.name} (${tileId})` : `Unknown (${tileId})`;
  const sketchId = Array.isArray(map.sketchTiles)
    ? map.sketchTiles[grid.y * map.width + grid.x]
    : null;
  const sketchDef = sketchId ? context.sketchPaletteById[sketchId] : null;
  const sketchLabel = sketchDef ? `${sketchDef.label} (${sketchId})` : "none";
  const object = map.objects.find((entry) => entry.x === grid.x && entry.y === grid.y);
  const objectDef = object ? context.objectsByType[object.type] : null;
  const objectLabel = objectDef ? objectDef.name : object ? object.type : "none";
  const detail = context.state.mode === "sketch"
    ? `Sketch: ${sketchLabel}`
    : `Tile: ${tileLabel} | Object: ${objectLabel}`;
  const nextHover = `Pos: ${grid.x},${grid.y} | ${detail}`;
  if (nextHover !== context.state.hoverInfo) {
    context.state.hoverInfo = nextHover;
    updateStatusFn();
  }
}

export function syncZoomControls(context) {
  if (!context.dom.zoomInput || !context.dom.zoomLabel) {
    return;
  }
  context.dom.zoomInput.value = context.state.zoom.toFixed(1);
  context.dom.zoomLabel.textContent = `${Math.round(context.state.zoom * 100)}%`;
}
