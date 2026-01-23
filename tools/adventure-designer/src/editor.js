import { addBrushCellsToSet, getBrushCells } from "./selection.js";
import { deleteSketchTiles, floodFillSketch, paintSketchTiles } from "./sketch.js";
import { interpolateLinePoints } from "./utils.js";

export function createEditorHandlers(context, helpers) {
  function setTool(tool) {
    if (context.state.intentLocked && tool === "intent") {
      return;
    }
    if (
      context.state.mode === "sketch" &&
      (tool === "intent" || tool === "road" || tool === "river" || tool === "object")
    ) {
      return;
    }
    if (context.state.tool === "road" && tool !== "road") {
      clearRoadDraft();
    }
    if (context.state.tool === "river" && tool !== "river") {
      clearRiverDraft();
    }
    context.state.tool = tool;
    context.dom.toolButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.tool === tool);
    });
    helpers.updateStatus();
  }

  function onPointerDown(event) {
    if (context.state.intentLocked) {
      return;
    }
    if (context.state.spaceDown) {
      context.state.panning = true;
      context.state.panStart = { x: event.clientX, y: event.clientY };
      return;
    }
    const grid = context.renderer.screenToGrid(event.clientX, event.clientY);
    if (!grid) {
      return;
    }

    if (context.state.tool === "paint") {
      if (context.state.mode === "sketch") {
        context.undoStack.push();
        context.state.painting = true;
        paintSketchTiles(context, grid);
        helpers.refresh();
        return;
      }
      if (context.state.selectedTileId === null) {
        return;
      }
      context.undoStack.push();
      context.state.painting = true;
      context.state.paintingTileId = context.state.selectedTileId;
      paintTiles(grid, context.state.paintingTileId);
    }

    if (context.state.tool === "intent") {
      if (context.state.mode === "sketch") {
        return;
      }
      context.state.dragging = true;
      context.state.selectionStart = grid;
      helpers.updateRectSelection(grid, grid);
    }

    if (context.state.tool === "lasso") {
      context.state.dragging = true;
      context.state.lassoCells = new Set();
      addBrushCellsToSet(context, grid, context.state.brushSize, context.state.lassoCells);
      helpers.updateLassoSelection();
    }

    if (context.state.tool === "object") {
      if (context.state.mode === "sketch") {
        return;
      }
      if (!context.state.selectedObjectType) {
        return;
      }
      context.undoStack.push();
      addObject(grid);
    }

    if (context.state.tool === "note") {
      if (helpers.addNote) {
        context.undoStack.push();
        helpers.addNote(grid);
      }
    }

    if (context.state.tool === "delete") {
      context.undoStack.push();
      context.state.painting = true;
      if (context.state.mode === "sketch") {
        deleteSketchTiles(context, grid);
        helpers.refresh();
        return;
      }
      deleteTilesAndObjects(grid);
    }

    if (context.state.tool === "road") {
      if (context.state.mode === "sketch") {
        return;
      }
      context.undoStack.push();
      startRoadDraft(grid);
    }

    if (context.state.tool === "river") {
      if (context.state.mode === "sketch") {
        return;
      }
      context.undoStack.push();
      startRiverDraft(grid);
    }

    if (context.state.tool === "fill") {
      if (context.state.mode === "sketch") {
        if (!context.state.selectedSketchId) {
          return;
        }
        context.undoStack.push();
        floodFillSketch(context, grid.x, grid.y, context.state.selectedSketchId);
        helpers.refresh();
        return;
      }
      if (context.state.selectedTileId === null) {
        return;
      }
      context.undoStack.push();
      floodFill(grid.x, grid.y, context.state.selectedTileId);
      helpers.refresh();
    }
  }

  function onPointerMove(event) {
    if (context.state.intentLocked) {
      return;
    }
    if (context.state.panning && context.state.panStart) {
      const dx = event.clientX - context.state.panStart.x;
      const dy = event.clientY - context.state.panStart.y;
      context.renderer.panBy(dx, dy);
      context.state.panStart = { x: event.clientX, y: event.clientY };
      helpers.updateMinimap();
      return;
    }
    const grid = context.renderer.screenToGrid(event.clientX, event.clientY);
    if (!grid) {
      if (context.state.hoverInfo) {
        context.state.hoverInfo = "";
        helpers.updateStatus();
      }
      return;
    }
    helpers.updateHoverInfo(grid);

    if (context.state.tool === "paint" && context.state.painting) {
      if (context.state.mode === "sketch") {
        paintSketchTiles(context, grid);
        helpers.refresh();
      } else {
        paintTiles(grid, context.state.paintingTileId);
      }
    }

    if (context.state.tool === "delete" && context.state.painting) {
      if (context.state.mode === "sketch") {
        deleteSketchTiles(context, grid);
        helpers.refresh();
      } else {
        deleteTilesAndObjects(grid);
      }
    }

    if (context.state.tool === "road" && context.state.roadDrawing) {
      addRoadPoint(grid);
    }

    if (context.state.tool === "river" && context.state.riverDrawing) {
      addRiverPoint(grid);
    }

    if (context.state.tool === "intent" && context.state.dragging) {
      if (context.state.mode !== "sketch") {
        helpers.updateRectSelection(context.state.selectionStart, grid);
      }
    }

    if (context.state.tool === "lasso" && context.state.dragging) {
      addBrushCellsToSet(context, grid, context.state.brushSize, context.state.lassoCells);
      helpers.updateLassoSelection();
    }
  }

  function onPointerUp() {
    if (context.state.intentLocked) {
      return;
    }
    if (context.state.panning) {
      context.state.panning = false;
      context.state.panStart = null;
      return;
    }
    if (context.state.painting) {
      context.state.painting = false;
      context.state.paintingTileId = null;
      helpers.refresh();
    }
    if (context.state.roadDrawing) {
      finishRoadDraft();
    }
    if (context.state.riverDrawing) {
      finishRiverDraft();
    }
    if (context.state.dragging) {
      context.state.dragging = false;
    }
  }

  function onWheelZoom(event) {
    event.preventDefault();
    const zoomDelta = event.deltaY < 0 ? 1.1 : 0.9;
    context.renderer.zoomAt(event.clientX, event.clientY, zoomDelta);
    context.state.zoom = context.renderer.zoom || context.state.zoom;
    helpers.syncZoomControls();
    helpers.updateMinimap();
  }

  function paintTiles(grid, tileId) {
    helpers.clearProposal();
    if (tileId === null || tileId === undefined) {
      return;
    }
    const cells = getBrushCells(grid, context.state.brushSize, context.store.getState());
    cells.forEach((cell) => {
      context.store.setTile(cell.x, cell.y, tileId);
    });
    helpers.refresh();
  }

  function getDeleteTileId() {
    if (context.tilesByName.grass) {
      return context.tilesByName.grass.id;
    }
    return context.tilesById[0] ? context.tilesById[0].id : 0;
  }

  function deleteTilesAndObjects(grid) {
    helpers.clearProposal();
    const map = context.store.getState();
    const cells = getBrushCells(grid, context.state.brushSize, map);
    const deleteTileId = getDeleteTileId();
    cells.forEach((cell) => {
      context.store.setTile(cell.x, cell.y, deleteTileId);
    });
    context.store.removeObjectsAt(cells);
    context.store.removeRoadPointsAt(cells);
    context.store.removeRiverPointsAt(cells);
    helpers.refresh();
  }

  function addObject(grid) {
    helpers.clearProposal();
    context.store.removeObjectsAt([{ x: grid.x, y: grid.y }]);
    const id = `obj-${context.state.selectedObjectType}-${Date.now()}`;
    const newObject = {
      id,
      type: context.state.selectedObjectType,
      x: grid.x,
      y: grid.y,
      w: 1,
      h: 1,
      props: {}
    };
    context.store.addObject(newObject);
    helpers.refresh();
  }

  function startRoadDraft(grid) {
    helpers.clearProposal();
    context.state.roadDrawing = true;
    context.state.roadDraftPoints = [];
    addRoadPoint(grid);
  }

  function addRoadPoint(grid) {
    if (!context.state.roadDraftPoints) {
      context.state.roadDraftPoints = [];
    }
    const points = context.state.roadDraftPoints;
    const last = points.length > 0 ? points[points.length - 1] : null;
    const line = last ? interpolateLinePoints(last, grid).slice(1) : [grid];
    line.forEach((point) => {
      points.push({ x: point.x, y: point.y });
    });
    context.renderer.setRoadDraft({
      type: "path",
      points: points.map((point) => ({ x: point.x, y: point.y }))
    });
  }

  function finishRoadDraft() {
    const points = context.state.roadDraftPoints || [];
    context.state.roadDrawing = false;
    context.state.roadDraftPoints = null;
    context.renderer.setRoadDraft(null);
    if (points.length < 2) {
      return;
    }
    const road = {
      id: `road-${Date.now()}`,
      type: "path",
      points: points.map((point) => ({ x: point.x, y: point.y })),
      props: { source: "manual" }
    };
    context.store.addRoad(road);
    helpers.refresh();
  }

  function clearRoadDraft() {
    context.state.roadDrawing = false;
    context.state.roadDraftPoints = null;
    if (context.renderer && context.renderer.setRoadDraft) {
      context.renderer.setRoadDraft(null);
    }
  }

  function startRiverDraft(grid) {
    helpers.clearProposal();
    context.state.riverDrawing = true;
    context.state.riverDraftPoints = [];
    addRiverPoint(grid);
  }

  function addRiverPoint(grid) {
    if (!context.state.riverDraftPoints) {
      context.state.riverDraftPoints = [];
    }
    const points = context.state.riverDraftPoints;
    const last = points.length > 0 ? points[points.length - 1] : null;
    const line = last ? interpolateLinePoints(last, grid).slice(1) : [grid];
    line.forEach((point) => {
      points.push({ x: point.x, y: point.y });
    });
    context.renderer.setRiverDraft({
      type: "river",
      points: points.map((point) => ({ x: point.x, y: point.y }))
    });
  }

  function finishRiverDraft() {
    const points = context.state.riverDraftPoints || [];
    context.state.riverDrawing = false;
    context.state.riverDraftPoints = null;
    context.renderer.setRiverDraft(null);
    if (points.length < 2) {
      return;
    }
    const river = {
      id: `river-${Date.now()}`,
      type: "river",
      points: points.map((point) => ({ x: point.x, y: point.y })),
      props: { source: "manual" }
    };
    context.store.addRiver(river);
    helpers.refresh();
  }

  function clearRiverDraft() {
    context.state.riverDrawing = false;
    context.state.riverDraftPoints = null;
    if (context.renderer && context.renderer.setRiverDraft) {
      context.renderer.setRiverDraft(null);
    }
  }

  function floodFill(startX, startY, newTileId) {
    const map = context.store.getState();
    const { width, height, tiles } = map;
    const startIndex = startY * width + startX;
    const targetId = tiles[startIndex];
    if (targetId === newTileId) {
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

      if (tiles[index] !== targetId) {
        continue;
      }

      context.store.setTile(x, y, newTileId);

      if (x > 0) queue.push({ x: x - 1, y });
      if (x < width - 1) queue.push({ x: x + 1, y });
      if (y > 0) queue.push({ x, y: y - 1 });
      if (y < height - 1) queue.push({ x, y: y + 1 });
    }
  }

  return {
    setTool,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheelZoom,
    clearRoadDraft,
    clearRiverDraft
  };
}
