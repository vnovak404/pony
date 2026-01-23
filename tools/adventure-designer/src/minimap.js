import { clamp } from "./utils.js";

export function updateMinimap(context) {
  if (!context.dom.minimapCtx || !context.dom.minimapCanvas) {
    return;
  }
  const map = context.store.getState();
  const useSketch = context.state.mode === "sketch" && Array.isArray(map.sketchTiles);
  const canvasWidth = context.dom.minimapCanvas.width;
  const canvasHeight = context.dom.minimapCanvas.height;
  context.dom.minimapCtx.clearRect(0, 0, canvasWidth, canvasHeight);

  const scale = Math.min(canvasWidth / map.width, canvasHeight / map.height);
  const offsetX = Math.floor((canvasWidth - map.width * scale) / 2);
  const offsetY = Math.floor((canvasHeight - map.height * scale) / 2);

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const index = y * map.width + x;
      const id = useSketch ? map.sketchTiles[index] : map.tiles[index];
      const palette = useSketch ? context.sketchPaletteById : context.tilesById;
      const tile = palette[id] || { color: "#d8c7b0" };
      context.dom.minimapCtx.fillStyle = tile.color;
      context.dom.minimapCtx.fillRect(offsetX + x * scale, offsetY + y * scale, scale, scale);
    }
  }

  const notes = Array.isArray(map.notes) ? map.notes : [];
  if (notes.length > 0) {
    context.dom.minimapCtx.save();
    context.dom.minimapCtx.fillStyle = "rgba(200, 116, 46, 0.2)";
    context.dom.minimapCtx.strokeStyle = "rgba(200, 116, 46, 0.9)";
    context.dom.minimapCtx.lineWidth = 1;
    notes.forEach((note) => {
      const w = Math.max(1, note.w || 1) * scale;
      const h = Math.max(1, note.h || 1) * scale;
      const x = offsetX + note.x * scale;
      const y = offsetY + note.y * scale;
      context.dom.minimapCtx.fillRect(x, y, w, h);
      context.dom.minimapCtx.strokeRect(x, y, w, h);
    });
    context.dom.minimapCtx.restore();
  }

  const view = context.renderer.getViewBounds ? context.renderer.getViewBounds() : null;
  if (view) {
    context.dom.minimapCtx.strokeStyle = "rgba(250, 210, 120, 0.95)";
    context.dom.minimapCtx.lineWidth = 2;
    context.dom.minimapCtx.strokeRect(
      offsetX + view.x * scale,
      offsetY + view.y * scale,
      view.w * scale,
      view.h * scale
    );
  }
}

export function jumpToMinimap(context, event) {
  if (!context.dom.minimapCanvas || !context.dom.minimapCtx) {
    return;
  }
  const map = context.store.getState();
  const rect = context.dom.minimapCanvas.getBoundingClientRect();
  const scale = Math.min(
    context.dom.minimapCanvas.width / map.width,
    context.dom.minimapCanvas.height / map.height
  );
  const offsetX = (context.dom.minimapCanvas.width - map.width * scale) / 2;
  const offsetY = (context.dom.minimapCanvas.height - map.height * scale) / 2;
  const x = (event.clientX - rect.left - offsetX) / scale;
  const y = (event.clientY - rect.top - offsetY) / scale;
  if (Number.isNaN(x) || Number.isNaN(y)) {
    return;
  }
  const view = context.renderer.getViewBounds ? context.renderer.getViewBounds() : null;
  if (!view) {
    return;
  }
  const targetX = clamp(x, 0, map.width);
  const targetY = clamp(y, 0, map.height);
  const deltaX = targetX - (view.x + view.w / 2);
  const deltaY = targetY - (view.y + view.h / 2);
  context.renderer.panBy(-deltaX * context.renderer.tileSize, -deltaY * context.renderer.tileSize);
}
