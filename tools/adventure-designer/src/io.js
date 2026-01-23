import { normalizeNotes } from "./notes.js";
import { createUndoStack } from "./undo.js";

export function exportDraft(context) {
  const map = context.store.getState();
  const content = JSON.stringify(map, null, 2);
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${map.id || "map"}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function importDraft(context, file, helpers) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const nextMap = normalizeImportedMap(data);
      if (!nextMap) {
        helpers.setStatus("Import failed: invalid map format.");
        return;
      }
      context.store.setState(nextMap);
      context.undoStack = createUndoStack(
        () => context.store.getState(),
        (next) => context.store.setState(next)
      );
      context.state.selection = null;
      context.state.lassoCells = null;
      context.state.intentLocked = false;
      helpers.clearProposal();
      context.renderer.setMap(
        context.store.getState(),
        context.tilesById,
        context.objectsByType
      );
      if (helpers.afterImport) {
        helpers.afterImport();
      }
      helpers.updateMinimap();
      helpers.updateStatus();
    } catch (error) {
      helpers.setStatus("Import failed: invalid JSON.");
    }
  };
  reader.readAsText(file);
}

export function normalizeImportedMap(data) {
  if (!data || typeof data !== "object") {
    return null;
  }
  if (!Number.isInteger(data.width) || !Number.isInteger(data.height)) {
    return null;
  }
  if (!Array.isArray(data.tiles) || data.tiles.length !== data.width * data.height) {
    return null;
  }
  const sketchTiles =
    Array.isArray(data.sketchTiles) && data.sketchTiles.length === data.width * data.height
      ? data.sketchTiles
      : null;
  const notes = normalizeNotes(data.notes);
  const refinement = data.refinement && typeof data.refinement === "object"
    ? data.refinement
    : null;
  return {
    id: data.id || "imported-map",
    version: Number.isInteger(data.version) ? data.version : 1,
    status: data.status === "deployed" ? "deployed" : "draft",
    width: data.width,
    height: data.height,
    tiles: data.tiles,
    sketchTiles,
    objects: Array.isArray(data.objects) ? data.objects : [],
    roads: Array.isArray(data.roads) ? data.roads : [],
    rivers: Array.isArray(data.rivers) ? data.rivers : [],
    storyZones: Array.isArray(data.storyZones) ? data.storyZones : [],
    notes,
    refinement,
    seed: data.seed || "seed",
    meta: data.meta && typeof data.meta === "object" ? data.meta : { name: "Imported Map" },
    draftMeta: data.draftMeta && typeof data.draftMeta === "object"
      ? data.draftMeta
      : { author: "import" }
  };
}

export function createEmptyMap() {
  const width = 50;
  const height = 50;
  return {
    id: "empty-map",
    version: 1,
    status: "draft",
    width,
    height,
    tiles: new Array(width * height).fill(0),
    objects: [],
    roads: [],
    rivers: [],
    storyZones: [],
    notes: [],
    refinement: null,
    seed: "seed",
    meta: { name: "Empty Map" },
    draftMeta: { author: "mapella" }
  };
}
