import { interpretIntent, suggestTilesFromIntent } from "./intent-engine.js";

export function runIntentProposal(context, helpers) {
  if (!context.state.selection) {
    helpers.setStatus("Select a region to paint intent.");
    return;
  }

  const description = context.dom.intentInput.value.trim();
  if (!description) {
    helpers.setStatus("Enter an intent description first.");
    return;
  }

  const selection = context.state.selection;
  const mapSnapshot = context.store.getState();

  let edits;
  let roadEdits = [];
  let riverEdits = [];
  let summary = "";
  let objectPlacements = [];

  const intent = interpretIntent(description);
  edits = suggestTilesFromIntent(selection, mapSnapshot, intent.intentTags, context.tilesByName);
  summary = `Local proposal: ${intent.intentTags.join(", ")}`;

  edits = filterEditsToSelection(edits, selection);
  edits = edits.filter((edit) => context.tilesById[edit.tileId]);
  roadEdits = filterRoadEditsToSelection(roadEdits, selection);
  riverEdits = filterRiverEditsToSelection(riverEdits, selection);
  objectPlacements = filterObjectsToSelection(objectPlacements, selection);
  objectPlacements = filterObjectPlacementsForOverlap(objectPlacements, mapSnapshot);

  context.state.proposal = {
    summary,
    tileEdits: edits,
    roadEdits,
    riverEdits,
    objectPlacements
  };

  showProposal(context);
  helpers.updateStatus();
}

export function showProposal(context) {
  if (!context.state.proposal) {
    return;
  }

  context.renderer.setProposal(context.state.proposal);
  context.dom.proposalSummary.textContent = context.state.proposal.summary;
  context.dom.proposalList.innerHTML = "";

  context.state.proposal.tileEdits.slice(0, 20).forEach((edit) => {
    const item = document.createElement("li");
    const tile = context.tilesById[edit.tileId];
    item.textContent = `(${edit.x}, ${edit.y}) -> ${tile ? tile.name : edit.tileId}`;
    context.dom.proposalList.appendChild(item);
  });

  context.state.proposal.roadEdits.slice(0, 5).forEach((road) => {
    const points = Array.isArray(road.points) ? road.points : [];
    if (points.length < 2) {
      return;
    }
    const start = points[0];
    const end = points[points.length - 1];
    const item = document.createElement("li");
    item.textContent =
      `road (${points.length} pts) from (${start.x}, ${start.y}) to (${end.x}, ${end.y})`;
    context.dom.proposalList.appendChild(item);
  });

  context.state.proposal.riverEdits.slice(0, 5).forEach((river) => {
    const points = Array.isArray(river.points) ? river.points : [];
    if (points.length < 2) {
      return;
    }
    const start = points[0];
    const end = points[points.length - 1];
    const item = document.createElement("li");
    item.textContent =
      `river (${points.length} pts) from (${start.x}, ${start.y}) to (${end.x}, ${end.y})`;
    context.dom.proposalList.appendChild(item);
  });

  context.state.proposal.objectPlacements.slice(0, 20).forEach((placement) => {
    const item = document.createElement("li");
    item.textContent = `add ${placement.type} at (${placement.x}, ${placement.y})`;
    context.dom.proposalList.appendChild(item);
  });

  if (context.state.proposal.tileEdits.length === 0) {
    if (
      context.state.proposal.objectPlacements.length === 0 &&
      context.state.proposal.roadEdits.length === 0 &&
      context.state.proposal.riverEdits.length === 0
    ) {
      const item = document.createElement("li");
      item.textContent = "No changes suggested.";
      context.dom.proposalList.appendChild(item);
    }
  }

  context.dom.proposalApply.disabled =
    context.state.proposal.tileEdits.length === 0 &&
    context.state.proposal.objectPlacements.length === 0 &&
    context.state.proposal.roadEdits.length === 0 &&
    context.state.proposal.riverEdits.length === 0;
  context.dom.proposalReject.disabled = false;
}

export function applyProposal(context, helpers) {
  if (
    !context.state.proposal ||
    (context.state.proposal.tileEdits.length === 0 &&
      context.state.proposal.objectPlacements.length === 0 &&
      context.state.proposal.roadEdits.length === 0 &&
      context.state.proposal.riverEdits.length === 0)
  ) {
    return;
  }
  context.undoStack.push();
  if (context.state.proposal.tileEdits.length > 0) {
    context.store.applyTileEdits(context.state.proposal.tileEdits);
  }
  if (context.state.proposal.roadEdits.length > 0) {
    const roads = context.state.proposal.roadEdits.map((road, index) => ({
      id: road.id || `road-${Date.now()}-${index}`,
      type: road.type || "path",
      points: road.points || [],
      props: road.props || { source: "ai" }
    }));
    context.store.addRoads(roads);
  }
  if (context.state.proposal.riverEdits.length > 0) {
    const rivers = context.state.proposal.riverEdits.map((river, index) => ({
      id: river.id || `river-${Date.now()}-${index}`,
      type: river.type || "river",
      points: river.points || [],
      props: river.props || { source: "ai" }
    }));
    context.store.addRivers(rivers);
  }
  if (context.state.proposal.objectPlacements.length > 0) {
    context.state.proposal.objectPlacements.forEach((placement, index) => {
      const id = `obj-${placement.type}-${Date.now()}-${index}`;
      context.store.addObject({
        id,
        type: placement.type,
        x: placement.x,
        y: placement.y,
        w: 1,
        h: 1,
        props: placement.props || { source: "ai" }
      });
    });
  }
  clearProposal(context);
  helpers.refresh();
}

export function clearProposal(context) {
  context.state.proposal = null;
  context.renderer.setProposal(null);
  context.dom.proposalSummary.textContent = "No proposals yet.";
  context.dom.proposalList.innerHTML = "";
  context.dom.proposalApply.disabled = true;
  context.dom.proposalReject.disabled = true;
}

export function normalizeSelectionPayload(selection) {
  const bounds = selection.bounds || selection;
  return {
    bounds,
    cells: selection.cells || null
  };
}

export function normalizeTileEdits(aiResult) {
  if (Array.isArray(aiResult.tileEdits)) {
    return aiResult.tileEdits;
  }
  const area = aiResult.area || aiResult.areaTiles;
  if (area && Array.isArray(area.cellTiles)) {
    return area.cellTiles.map((cell) => ({
      x: cell.x,
      y: cell.y,
      tileId: cell.tileId
    }));
  }
  return [];
}

export function normalizeObjectPlacements(aiResult) {
  if (Array.isArray(aiResult.objectPlacements)) {
    return aiResult.objectPlacements;
  }
  if (Array.isArray(aiResult.placements)) {
    return aiResult.placements
      .map((placement) => ({
        type: placement.type || placement.objectId,
        x: placement.x,
        y: placement.y,
        reason: placement.reason
      }))
      .filter((placement) => placement.type);
  }
  return [];
}

export function normalizeRoadEdits(aiResult) {
  const roads = Array.isArray(aiResult.roadEdits)
    ? aiResult.roadEdits
    : Array.isArray(aiResult.roads)
      ? aiResult.roads
      : [];
  return roads
    .map((road) => ({
      id: road.id,
      type: road.type || "path",
      points: Array.isArray(road.points)
        ? road.points.map((point) => ({ x: point.x, y: point.y }))
        : []
    }))
    .filter((road) => road.points.length >= 2);
}

export function normalizeRiverEdits(aiResult) {
  const rivers = Array.isArray(aiResult.riverEdits)
    ? aiResult.riverEdits
    : Array.isArray(aiResult.rivers)
      ? aiResult.rivers
      : [];
  return rivers
    .map((river) => ({
      id: river.id,
      type: river.type || "river",
      points: Array.isArray(river.points)
        ? river.points.map((point) => ({ x: point.x, y: point.y }))
        : []
    }))
    .filter((river) => river.points.length >= 2);
}

export function filterEditsToSelection(edits, selection) {
  if (!selection || !selection.cells || selection.cells.length === 0) {
    return edits;
  }
  const allowed = new Set(selection.cells.map((cell) => `${cell.x},${cell.y}`));
  return edits.filter((edit) => allowed.has(`${edit.x},${edit.y}`));
}

export function filterObjectsToSelection(placements, selection) {
  if (!selection) {
    return placements;
  }
  if (selection.cells && selection.cells.length > 0) {
    const allowed = new Set(selection.cells.map((cell) => `${cell.x},${cell.y}`));
    return placements.filter((placement) => allowed.has(`${placement.x},${placement.y}`));
  }
  if (selection.bounds) {
    const { x, y, w, h } = selection.bounds;
    return placements.filter(
      (placement) =>
        placement.x >= x &&
        placement.x < x + w &&
        placement.y >= y &&
        placement.y < y + h
    );
  }
  return placements;
}

export function filterObjectPlacementsForOverlap(placements, mapSnapshot) {
  const occupied = new Set(
    (mapSnapshot.objects || []).map((object) => `${object.x},${object.y}`)
  );
  const result = [];
  placements.forEach((placement) => {
    const key = `${placement.x},${placement.y}`;
    if (occupied.has(key)) {
      return;
    }
    occupied.add(key);
    result.push(placement);
  });
  return result;
}

export function filterRoadEditsToSelection(roads, selection) {
  if (!selection || !Array.isArray(roads)) {
    return Array.isArray(roads) ? roads : [];
  }
  const bounds = selection.bounds || selection;
  if (!bounds) {
    return roads;
  }
  const { x, y, w, h } = bounds;
  const allowed =
    selection.cells && selection.cells.length > 0
      ? new Set(selection.cells.map((cell) => `${cell.x},${cell.y}`))
      : null;
  return roads
    .map((road) => {
      const points = (road.points || []).filter((point) => {
        if (allowed) {
          return allowed.has(`${point.x},${point.y}`);
        }
        return point.x >= x && point.x < x + w && point.y >= y && point.y < y + h;
      });
      return { ...road, points };
    })
    .filter((road) => road.points.length >= 2);
}

export function filterRiverEditsToSelection(rivers, selection) {
  if (!selection || !Array.isArray(rivers)) {
    return Array.isArray(rivers) ? rivers : [];
  }
  const bounds = selection.bounds || selection;
  if (!bounds) {
    return rivers;
  }
  const { x, y, w, h } = bounds;
  const allowed =
    selection.cells && selection.cells.length > 0
      ? new Set(selection.cells.map((cell) => `${cell.x},${cell.y}`))
      : null;
  return rivers
    .map((river) => {
      const points = (river.points || []).filter((point) => {
        if (allowed) {
          return allowed.has(`${point.x},${point.y}`);
        }
        return point.x >= x && point.x < x + w && point.y >= y && point.y < y + h;
      });
      return { ...river, points };
    })
    .filter((river) => river.points.length >= 2);
}

export function buildAreaTiles(selectionPayload, mapSnapshot) {
  if (!selectionPayload || !selectionPayload.bounds) {
    return null;
  }
  const bounds = selectionPayload.bounds;
  const cells = selectionPayload.cells;
  if (cells && cells.length > 0) {
    return {
      bounds,
      cellTiles: cells.map((cell) => ({
        x: cell.x,
        y: cell.y,
        tileId: mapSnapshot.tiles[cell.y * mapSnapshot.width + cell.x]
      }))
    };
  }
  const tiles = [];
  for (let y = bounds.y; y < bounds.y + bounds.h; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.w; x += 1) {
      const index = y * mapSnapshot.width + x;
      tiles.push(mapSnapshot.tiles[index]);
    }
  }
  return {
    bounds,
    width: bounds.w,
    height: bounds.h,
    tiles
  };
}

export function buildSelectionContext(selectionPayload, mapSnapshot) {
  const bounds = selectionPayload.bounds;
  const cells = selectionPayload.cells;
  return {
    roads: filterRoadsToSelection(bounds, mapSnapshot.roads || []),
    rivers: filterRiversToSelection(bounds, mapSnapshot.rivers || []),
    storyZones: filterZonesToSelection(bounds, mapSnapshot.storyZones || []),
    objects: filterObjectsInSelection(bounds, cells, mapSnapshot.objects || [])
  };
}

export function filterObjectsInSelection(bounds, cells, objects) {
  if (!bounds) {
    return objects;
  }
  if (cells && cells.length > 0) {
    const allowed = new Set(cells.map((cell) => `${cell.x},${cell.y}`));
    return objects.filter((object) => allowed.has(`${object.x},${object.y}`));
  }
  const { x, y, w, h } = bounds;
  return objects.filter(
    (object) => object.x >= x && object.x < x + w && object.y >= y && object.y < y + h
  );
}

export function filterZonesToSelection(bounds, zones) {
  if (!bounds) {
    return zones;
  }
  const { x, y, w, h } = bounds;
  return zones.filter((zone) => {
    const zx = zone.bounds?.x ?? 0;
    const zy = zone.bounds?.y ?? 0;
    const zw = zone.bounds?.w ?? 0;
    const zh = zone.bounds?.h ?? 0;
    return zx < x + w && zx + zw > x && zy < y + h && zy + zh > y;
  });
}

export function filterRoadsToSelection(bounds, roads) {
  if (!bounds) {
    return roads;
  }
  const { x, y, w, h } = bounds;
  return roads.filter((road) => {
    if (!Array.isArray(road.points)) {
      return false;
    }
    return road.points.some(
      (point) => point.x >= x && point.x < x + w && point.y >= y && point.y < y + h
    );
  });
}

export function filterRiversToSelection(bounds, rivers) {
  if (!bounds) {
    return rivers;
  }
  const { x, y, w, h } = bounds;
  return rivers.filter((river) => {
    if (!Array.isArray(river.points)) {
      return false;
    }
    return river.points.some(
      (point) => point.x >= x && point.x < x + w && point.y >= y && point.y < y + h
    );
  });
}

export function lockIntentArea(context, message, helpers) {
  context.state.intentLocked = true;
  context.dom.intentRun.disabled = true;
  if (context.renderer.setIntentLock) {
    context.renderer.setIntentLock(context.state.selection);
  }
  helpers.setStatus(message);
}

export function unlockIntentArea(context) {
  context.state.intentLocked = false;
  context.dom.intentRun.disabled = false;
  if (context.renderer.setIntentLock) {
    context.renderer.setIntentLock(null);
  }
}
