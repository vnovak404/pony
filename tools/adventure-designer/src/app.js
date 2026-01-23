import { createContext } from "./context.js";
import { getEditorConfig, loadJson, loadPhaserIfAvailable } from "./data.js";
import { createRenderer } from "./renderer/index.js";
import { createStore } from "./store.js";
import { createUndoStack } from "./undo.js";
import { buildPalettes } from "./palette.js";
import { createEditorHandlers } from "./editor.js";
import { applyProposal, clearProposal, runIntentProposal } from "./proposals.js";
import { updateMinimap, jumpToMinimap } from "./minimap.js";
import { exportDraft, importDraft, createEmptyMap } from "./io.js";
import {
  buildSketchPalette,
  ensureSketchLayer,
  generateTilesFromSketch,
  initSketchPalette,
  prettifyTiles
} from "./sketch.js";
import { addNoteAt, ensureNotesLayer, removeNote, renderNotesList } from "./notes.js";
import { applyRefinedMap, requestMapRefine, syncRefineDefaults } from "./refine.js";
import { bindUi } from "./ui.js";
import { setStatus, syncZoomControls, updateHoverInfo, updateStatus } from "./status.js";
import { updateLassoSelection, updateRectSelection } from "./selection.js";

const context = createContext();

boot();

async function boot() {
  await loadPhaserIfAvailable();
  await init();
}

async function init() {
  const config = getEditorConfig();
  const [tilesData, objectsData, mapData] = await Promise.all([
    loadJson(config.tilesPath, { tiles: [] }),
    loadJson(config.objectsPath, { objects: [] }),
    loadJson(config.mapPath, createEmptyMap())
  ]);

  tilesData.tiles.forEach((tile) => {
    context.tilesById[tile.id] = tile;
    context.tilesByName[tile.name] = tile;
  });

  objectsData.objects.forEach((obj) => {
    context.objectsByType[obj.type] = obj;
  });

  context.store = createStore(mapData);
  context.undoStack = createUndoStack(
    () => context.store.getState(),
    (next) => context.store.setState(next)
  );

  initSketchPalette(context);
  ensureSketchLayer(context);
  ensureNotesLayer(context.store.getState());

  context.renderer = createRenderer(context.dom.viewport, { tileSize: 32 });
  context.renderer.setMap(context.store.getState(), context.tilesById, context.objectsByType);
  context.renderer.setSketchLayer(context.store.getState().sketchTiles, context.sketchPaletteById);

  const updateStatusFn = () => updateStatus(context);
  const setStatusFn = (message) => setStatus(context, message);
  const updateMinimapFn = () => updateMinimap(context);
  const syncZoomControlsFn = () => syncZoomControls(context);
  const updateHoverInfoFn = (grid) => updateHoverInfo(context, grid, updateStatusFn);
  const updateRectSelectionFn = (start, end) =>
    updateRectSelection(context, start, end, updateStatusFn);
  const updateLassoSelectionFn = () => updateLassoSelection(context, updateStatusFn);

  const syncSketchLayer = () => {
    ensureSketchLayer(context);
    context.renderer.setSketchLayer(
      context.store.getState().sketchTiles,
      context.sketchPaletteById
    );
  };

  const refresh = () => {
    syncSketchLayer();
    context.renderer.setMap(context.store.getState(), context.tilesById, context.objectsByType);
    updateMinimapFn();
    updateStatusFn();
  };

  const handleRemoveNote = (note) => {
    context.undoStack.push();
    removeNote(context, note.id);
    renderNotesList(context, { onRemove: handleRemoveNote });
    refresh();
  };

  const editorHandlers = createEditorHandlers(context, {
    updateStatus: updateStatusFn,
    updateMinimap: updateMinimapFn,
    clearProposal: () => clearProposal(context),
    refresh,
    updateRectSelection: updateRectSelectionFn,
    updateLassoSelection: updateLassoSelectionFn,
    syncZoomControls: syncZoomControlsFn,
    updateHoverInfo: updateHoverInfoFn,
    addNote: (grid) => {
      const note = addNoteAt(context, grid);
      renderNotesList(context, { onRemove: handleRemoveNote });
      refresh();
      setStatusFn(`Added note at (${note.x}, ${note.y}).`);
    }
  });

  buildSketchPalette(context, editorHandlers.setTool);
  buildPalettes(context, editorHandlers.setTool);
  context.dom.brushSizeLabel.textContent = String(context.state.brushSize);
  syncZoomControlsFn();

  const setMode = (mode) => {
    const nextMode = mode === "tile" ? "tile" : "sketch";
    context.state.mode = nextMode;
    const isSketch = nextMode === "sketch";
    context.renderer.setRenderMode(isSketch ? "sketch" : "tiles");
    syncSketchLayer();
    if (context.dom.modeSketchBtn) {
      context.dom.modeSketchBtn.classList.toggle("is-active", isSketch);
    }
    if (context.dom.modeTileBtn) {
      context.dom.modeTileBtn.classList.toggle("is-active", !isSketch);
    }
    if (context.dom.sketchPaletteSection) {
      context.dom.sketchPaletteSection.classList.toggle("is-hidden", !isSketch);
    }
    if (context.dom.tilePaletteSection) {
      context.dom.tilePaletteSection.classList.toggle("is-hidden", isSketch);
    }
    if (context.dom.objectPaletteSection) {
      context.dom.objectPaletteSection.classList.toggle("is-hidden", isSketch);
    }
    context.dom.toolButtons.forEach((button) => {
      const tool = button.dataset.tool;
      const disable =
        isSketch && (tool === "intent" || tool === "road" || tool === "river" || tool === "object");
      button.disabled = disable;
      if (disable && context.state.tool === tool) {
        context.state.tool = "paint";
      }
    });
    if (context.dom.intentRun) {
      context.dom.intentRun.disabled = isSketch;
    }
    if (isSketch) {
      clearProposal(context);
    }
    editorHandlers.setTool(context.state.tool);
    refresh();
  };

  const generateFromSketch = () => {
    context.undoStack.push();
    const result = generateTilesFromSketch(context);
    setStatusFn(`Generated ${result.changed} tiles from sketch.`);
    refresh();
    if (context.state.mode === "sketch") {
      setMode("tile");
    }
  };

  const prettifyForest = () => {
    context.undoStack.push();
    const result = prettifyTiles(context);
    setStatusFn(`Prettified ${result.changed} forest tiles.`);
    refresh();
  };

  const refineMap = async () => {
    if (context.dom.workflowRefineBtn) {
      context.dom.workflowRefineBtn.disabled = true;
    }
    setStatusFn("Requesting refinement...");
    const result = await requestMapRefine(context);
    if (context.dom.workflowRefineBtn) {
      context.dom.workflowRefineBtn.disabled = false;
    }
    if (!result.ok) {
      setStatusFn(result.error || "Map refinement failed.");
      return;
    }
    context.undoStack.push();
    const nextMap = applyRefinedMap(context, result.refined);
    context.store.setState(nextMap);
    ensureNotesLayer(context.store.getState());
    renderNotesList(context, { onRemove: handleRemoveNote });
    setMode("tile");
    refresh();
    syncRefineDefaults(context);
    setStatusFn("Refinement applied.");
  };

  setMode(context.state.mode);

  bindUi(context, {
    setTool: editorHandlers.setTool,
    setMode,
    generateTiles: generateFromSketch,
    prettifyTiles: prettifyForest,
    refineMap,
    runIntentProposal: () => {
      if (context.state.mode === "sketch") {
        setStatusFn("Switch to Tile Mode to run intent proposals.");
        return;
      }
      runIntentProposal(context, { setStatus: setStatusFn, updateStatus: updateStatusFn });
    },
    applyProposal: () => applyProposal(context, { refresh }),
    clearProposal: () => clearProposal(context),
    refresh,
    exportDraft: () => exportDraft(context),
    importDraft: (file) =>
      importDraft(context, file, {
        setStatus: setStatusFn,
        clearProposal: () => clearProposal(context),
        updateMinimap: updateMinimapFn,
        updateStatus: updateStatusFn,
        afterImport: () => {
          syncSketchLayer();
          ensureNotesLayer(context.store.getState());
          renderNotesList(context, { onRemove: handleRemoveNote });
          setMode(context.state.mode);
          syncRefineDefaults(context);
        }
      }),
    syncZoomControls: syncZoomControlsFn,
    updateMinimap: updateMinimapFn,
    updateStatus: updateStatusFn,
    jumpToMinimap: (event) => jumpToMinimap(context, event),
    onPointerDown: editorHandlers.onPointerDown,
    onPointerMove: editorHandlers.onPointerMove,
    onPointerUp: editorHandlers.onPointerUp,
    onWheelZoom: editorHandlers.onWheelZoom
  });

  updateStatusFn();
  updateMinimapFn();
  renderNotesList(context, { onRemove: handleRemoveNote });
  syncRefineDefaults(context);
}
