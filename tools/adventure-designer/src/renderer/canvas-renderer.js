export class CanvasRenderer {
  constructor(container, options = {}) {
    this.container = container;
    this.tileSize = options.tileSize || 32;
    this.map = null;
    this.tilesById = {};
    this.objectsByType = {};
    this.selection = null;
    this.proposalEdits = [];
    this.proposalObjects = [];
    this.proposalRoads = [];
    this.proposalRivers = [];
    this.roadDraft = null;
    this.riverDraft = null;
    this.intentLock = null;
    this.renderMode = "tiles";
    this.sketchTiles = null;
    this.sketchPaletteById = {};
    this.baseTileSize = this.tileSize;
    this.zoom = 1;
    this.minZoom = 0.5;
    this.maxZoom = 4;
    this.panX = 0;
    this.panY = 0;
    this.baseOffsetX = 0;
    this.baseOffsetY = 0;
    this.offsetX = 0;
    this.offsetY = 0;

    this.canvas = document.createElement("canvas");
    this.canvas.className = "map-canvas";
    this.ctx = this.canvas.getContext("2d");
    this.container.appendChild(this.canvas);

    this.pendingResize = false;
    this.resizeObserver = new ResizeObserver(() => {
      if (this.pendingResize) {
        return;
      }
      this.pendingResize = true;
      requestAnimationFrame(() => {
        this.pendingResize = false;
        this.resize();
      });
    });
    this.resizeObserver.observe(this.container);
  }

  setMap(map, tilesById, objectsByType) {
    this.map = map;
    this.tilesById = tilesById;
    this.objectsByType = objectsByType;
    this.resize();
  }

  setRenderMode(mode) {
    this.renderMode = mode;
    this.draw();
  }

  setSketchLayer(sketchTiles, sketchPaletteById) {
    this.sketchTiles = sketchTiles;
    this.sketchPaletteById = sketchPaletteById || {};
    this.draw();
  }

  setSelection(bounds) {
    this.selection = bounds;
    this.draw();
  }

  setProposal(proposal) {
    const tileEdits = proposal && proposal.tileEdits ? proposal.tileEdits : [];
    const objectPlacements = proposal && proposal.objectPlacements ? proposal.objectPlacements : [];
    const roadEdits = proposal && proposal.roadEdits ? proposal.roadEdits : [];
    const riverEdits = proposal && proposal.riverEdits ? proposal.riverEdits : [];
    this.proposalEdits = tileEdits;
    this.proposalObjects = objectPlacements;
    this.proposalRoads = roadEdits;
    this.proposalRivers = riverEdits;
    this.draw();
  }

  setRoadDraft(road) {
    this.roadDraft = road;
    this.draw();
  }

  setRiverDraft(river) {
    this.riverDraft = river;
    this.draw();
  }

  setZoom(zoom) {
    this.zoom = clamp(zoom, this.minZoom, this.maxZoom);
    this.tileSize = Math.max(4, Math.round(this.baseTileSize * this.zoom));
    this.updateOffsets();
    this.draw();
  }

  zoomAt(clientX, clientY, zoomDelta) {
    if (!this.map) {
      return;
    }
    const worldX = (clientX - this.offsetX) / this.tileSize;
    const worldY = (clientY - this.offsetY) / this.tileSize;
    const nextZoom = clamp(this.zoom * zoomDelta, this.minZoom, this.maxZoom);
    this.zoom = nextZoom;
    this.tileSize = Math.max(4, Math.round(this.baseTileSize * this.zoom));
    this.updateOffsets();
    this.panX = clientX - worldX * this.tileSize - this.baseOffsetX;
    this.panY = clientY - worldY * this.tileSize - this.baseOffsetY;
    this.updateOffsets();
    this.draw();
  }

  panBy(dx, dy) {
    this.panX += dx;
    this.panY += dy;
    this.updateOffsets();
    this.draw();
  }

  getViewBounds() {
    if (!this.map) {
      return null;
    }
    const viewX = (-this.offsetX) / this.tileSize;
    const viewY = (-this.offsetY) / this.tileSize;
    const viewW = this.canvas.width / this.tileSize;
    const viewH = this.canvas.height / this.tileSize;
    return clampBounds(viewX, viewY, viewW, viewH, this.map.width, this.map.height);
  }

  setIntentLock(selection) {
    this.intentLock = selection;
    this.draw();
  }

  getPointerTarget() {
    return this.canvas;
  }

  screenToGrid(clientX, clientY) {
    if (!this.map) {
      return null;
    }

    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left - this.offsetX;
    const y = clientY - rect.top - this.offsetY;
    if (x < 0 || y < 0) {
      return null;
    }

    const gridX = Math.floor(x / this.tileSize);
    const gridY = Math.floor(y / this.tileSize);
    if (gridX < 0 || gridY < 0 || gridX >= this.map.width || gridY >= this.map.height) {
      return null;
    }

    return { x: gridX, y: gridY };
  }

  resize() {
    if (!this.map) {
      return;
    }

    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.canvas.width = width;
    this.canvas.height = height;

    const tileSizeX = Math.floor(width / this.map.width);
    const tileSizeY = Math.floor(height / this.map.height);
    this.baseTileSize = Math.max(12, Math.min(tileSizeX, tileSizeY));
    this.tileSize = Math.max(4, Math.round(this.baseTileSize * this.zoom));
    this.updateOffsets();

    this.draw();
  }

  updateOffsets() {
    this.baseOffsetX = 0;
    this.baseOffsetY = 0;
    if (!this.map) {
      this.offsetX = this.baseOffsetX + this.panX;
      this.offsetY = this.baseOffsetY + this.panY;
      return;
    }
    const mapWidth = this.map.width * this.tileSize;
    const mapHeight = this.map.height * this.tileSize;
    const minOffsetX = Math.min(0, this.canvas.width - mapWidth);
    const minOffsetY = Math.min(0, this.canvas.height - mapHeight);
    const maxOffsetX = 0;
    const maxOffsetY = 0;
    const rawOffsetX = this.baseOffsetX + this.panX;
    const rawOffsetY = this.baseOffsetY + this.panY;
    this.offsetX = clamp(rawOffsetX, minOffsetX, maxOffsetX);
    this.offsetY = clamp(rawOffsetY, minOffsetY, maxOffsetY);
    if (this.offsetX !== rawOffsetX) {
      this.panX = this.offsetX - this.baseOffsetX;
    }
    if (this.offsetY !== rawOffsetY) {
      this.panY = this.offsetY - this.baseOffsetY;
    }
  }

  draw() {
    if (!this.map) {
      return;
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const isSketch = this.renderMode === "sketch";

    this.drawTiles(ctx);
    this.drawGrid(ctx);
    if (!isSketch) {
      this.drawRivers(ctx);
      this.drawRoads(ctx);
      this.drawBridges(ctx);
      this.drawRiverDraft(ctx);
      this.drawRoadDraft(ctx);
      this.drawObjects(ctx);
      this.drawStoryZones(ctx);
    }
    this.drawNotes(ctx);
    this.drawProposal(ctx);
    this.drawIntentLock(ctx);
    this.drawSelection(ctx);
  }

  drawTiles(ctx) {
    const useSketch = this.renderMode === "sketch" && Array.isArray(this.sketchTiles);
    const { width, height } = this.map;
    const tiles = useSketch ? this.sketchTiles : this.map.tiles;
    const palette = useSketch ? this.sketchPaletteById : this.tilesById;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = tiles[y * width + x];
        const tile = palette[id] || { color: "#d8c7b0" };
        ctx.fillStyle = tile.color;
        ctx.fillRect(
          this.offsetX + x * this.tileSize,
          this.offsetY + y * this.tileSize,
          this.tileSize,
          this.tileSize
        );
      }
    }
  }

  drawGrid(ctx) {
    const { width, height } = this.map;
    ctx.strokeStyle = "rgba(43, 37, 31, 0.15)";
    ctx.lineWidth = 1;

    for (let x = 0; x <= width; x += 1) {
      const xPos = this.offsetX + x * this.tileSize + 0.5;
      ctx.beginPath();
      ctx.moveTo(xPos, this.offsetY);
      ctx.lineTo(xPos, this.offsetY + height * this.tileSize);
      ctx.stroke();
    }

    for (let y = 0; y <= height; y += 1) {
      const yPos = this.offsetY + y * this.tileSize + 0.5;
      ctx.beginPath();
      ctx.moveTo(this.offsetX, yPos);
      ctx.lineTo(this.offsetX + width * this.tileSize, yPos);
      ctx.stroke();
    }
  }

  drawRoads(ctx) {
    ctx.strokeStyle = "#7a4d2b";
    ctx.lineWidth = Math.max(3, Math.floor(this.tileSize / 6));
    this.map.roads.forEach((road) => {
      if (!road.points || road.points.length < 2) {
        return;
      }
      ctx.beginPath();
      road.points.forEach((point, index) => {
        const x = this.offsetX + (point.x + 0.5) * this.tileSize;
        const y = this.offsetY + (point.y + 0.5) * this.tileSize;
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    });
  }

  drawRivers(ctx) {
    ctx.strokeStyle = "#4b87c9";
    ctx.lineWidth = Math.max(3, Math.floor(this.tileSize / 5));
    (this.map.rivers || []).forEach((river) => {
      if (!river.points || river.points.length < 2) {
        return;
      }
      ctx.beginPath();
      river.points.forEach((point, index) => {
        const x = this.offsetX + (point.x + 0.5) * this.tileSize;
        const y = this.offsetY + (point.y + 0.5) * this.tileSize;
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    });
  }

  drawBridges(ctx) {
    const intersections = collectOverlayIntersections(this.map.roads || [], this.map.rivers || []);
    if (intersections.length === 0) {
      return;
    }
    const size = this.tileSize * 0.6;
    ctx.save();
    ctx.fillStyle = "#d8b47f";
    intersections.forEach((point) => {
      const x = this.offsetX + (point.x + 0.5) * this.tileSize - size / 2;
      const y = this.offsetY + (point.y + 0.5) * this.tileSize - size / 2;
      ctx.fillRect(x, y, size, size);
    });
    ctx.restore();
  }


  drawRiverDraft(ctx) {
    if (!this.riverDraft || !this.riverDraft.points || this.riverDraft.points.length < 2) {
      return;
    }
    ctx.save();
    ctx.strokeStyle = "rgba(90, 150, 220, 0.9)";
    ctx.lineWidth = Math.max(2, Math.floor(this.tileSize / 7));
    ctx.setLineDash([Math.max(4, Math.floor(this.tileSize / 3)), 4]);
    ctx.beginPath();
    this.riverDraft.points.forEach((point, index) => {
      const x = this.offsetX + (point.x + 0.5) * this.tileSize;
      const y = this.offsetY + (point.y + 0.5) * this.tileSize;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  drawRoadDraft(ctx) {
    if (!this.roadDraft || !this.roadDraft.points || this.roadDraft.points.length < 2) {
      return;
    }
    ctx.save();
    ctx.strokeStyle = "rgba(250, 210, 120, 0.9)";
    ctx.lineWidth = Math.max(2, Math.floor(this.tileSize / 7));
    ctx.setLineDash([Math.max(4, Math.floor(this.tileSize / 3)), 4]);
    ctx.beginPath();
    this.roadDraft.points.forEach((point, index) => {
      const x = this.offsetX + (point.x + 0.5) * this.tileSize;
      const y = this.offsetY + (point.y + 0.5) * this.tileSize;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  drawObjects(ctx) {
    this.map.objects.forEach((object) => {
      const objDef = this.objectsByType[object.type] || { color: "#5c4b3b" };
      ctx.fillStyle = objDef.color;
      ctx.fillRect(
        this.offsetX + object.x * this.tileSize + this.tileSize * 0.2,
        this.offsetY + object.y * this.tileSize + this.tileSize * 0.2,
        this.tileSize * 0.6,
        this.tileSize * 0.6
      );
    });
  }

  drawStoryZones(ctx) {
    ctx.strokeStyle = "rgba(155, 88, 34, 0.6)";
    ctx.lineWidth = 2;
    this.map.storyZones.forEach((zone) => {
      const { x, y, w, h } = zone.bounds;
      ctx.strokeRect(
        this.offsetX + x * this.tileSize,
        this.offsetY + y * this.tileSize,
        w * this.tileSize,
        h * this.tileSize
      );
    });
  }

  drawNotes(ctx) {
    const notes = this.map.notes || [];
    if (notes.length === 0) {
      return;
    }
    ctx.save();
    ctx.fillStyle = "rgba(200, 116, 46, 0.12)";
    ctx.strokeStyle = "rgba(200, 116, 46, 0.85)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    const fontSize = Math.max(10, Math.floor(this.tileSize / 2));
    ctx.font = `${fontSize}px Avenir Next, sans-serif`;
    ctx.fillStyle = "rgba(43, 37, 31, 0.85)";

    notes.forEach((note) => {
      const w = Math.max(1, note.w || 1) * this.tileSize;
      const h = Math.max(1, note.h || 1) * this.tileSize;
      const x = this.offsetX + note.x * this.tileSize;
      const y = this.offsetY + note.y * this.tileSize;
      ctx.save();
      ctx.fillStyle = "rgba(200, 116, 46, 0.12)";
      ctx.strokeStyle = "rgba(200, 116, 46, 0.85)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      const label = note.text ? note.text.trim() : "";
      if (label) {
        const text =
          label.length > 28 ? `${label.slice(0, 25)}...` : label;
        ctx.fillStyle = "rgba(43, 37, 31, 0.9)";
        ctx.fillText(text, x + 6, y + fontSize + 4);
      }
      ctx.restore();
    });
    ctx.setLineDash([]);
    ctx.restore();
  }

  drawSelection(ctx) {
    if (!this.selection) {
      return;
    }
    const bounds = this.selection.bounds || this.selection;
    ctx.save();
    ctx.fillStyle = "rgba(200, 116, 46, 0.18)";
    ctx.strokeStyle = "rgba(200, 116, 46, 0.8)";
    ctx.lineWidth = 2;

    if (this.selection.cells && this.selection.cells.length > 0) {
      this.selection.cells.forEach((cell) => {
        ctx.fillRect(
          this.offsetX + cell.x * this.tileSize,
          this.offsetY + cell.y * this.tileSize,
          this.tileSize,
          this.tileSize
        );
      });
    }

    if (bounds) {
      ctx.strokeRect(
        this.offsetX + bounds.x * this.tileSize,
        this.offsetY + bounds.y * this.tileSize,
        bounds.w * this.tileSize,
        bounds.h * this.tileSize
      );
    }
    ctx.restore();
  }

  drawProposal(ctx) {
    ctx.save();
    if (this.proposalEdits && this.proposalEdits.length > 0) {
      ctx.fillStyle = "rgba(76, 140, 200, 0.25)";
      this.proposalEdits.forEach((edit) => {
        ctx.fillRect(
          this.offsetX + edit.x * this.tileSize,
          this.offsetY + edit.y * this.tileSize,
          this.tileSize,
          this.tileSize
        );
      });
    }

    if (this.proposalObjects && this.proposalObjects.length > 0) {
      ctx.fillStyle = "rgba(80, 160, 90, 0.7)";
      this.proposalObjects.forEach((placement) => {
        const centerX = this.offsetX + (placement.x + 0.5) * this.tileSize;
        const centerY = this.offsetY + (placement.y + 0.5) * this.tileSize;
        const radius = this.tileSize * 0.22;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    if (this.proposalRivers && this.proposalRivers.length > 0) {
      ctx.strokeStyle = "rgba(90, 150, 220, 0.8)";
      ctx.lineWidth = Math.max(2, Math.floor(this.tileSize / 7));
      ctx.setLineDash([Math.max(4, Math.floor(this.tileSize / 3)), 4]);
      this.proposalRivers.forEach((river) => {
        if (!river.points || river.points.length < 2) {
          return;
        }
        ctx.beginPath();
        river.points.forEach((point, index) => {
          const x = this.offsetX + (point.x + 0.5) * this.tileSize;
          const y = this.offsetY + (point.y + 0.5) * this.tileSize;
          if (index === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }

    if (this.proposalRoads && this.proposalRoads.length > 0) {
      ctx.strokeStyle = "rgba(250, 210, 120, 0.85)";
      ctx.lineWidth = Math.max(2, Math.floor(this.tileSize / 7));
      ctx.setLineDash([Math.max(4, Math.floor(this.tileSize / 3)), 4]);
      this.proposalRoads.forEach((road) => {
        if (!road.points || road.points.length < 2) {
          return;
        }
        ctx.beginPath();
        road.points.forEach((point, index) => {
          const x = this.offsetX + (point.x + 0.5) * this.tileSize;
          const y = this.offsetY + (point.y + 0.5) * this.tileSize;
          if (index === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  drawIntentLock(ctx) {
    if (!this.intentLock) {
      return;
    }
    const bounds = this.intentLock.bounds || this.intentLock;
    if (!bounds) {
      return;
    }
    ctx.save();
    ctx.fillStyle = "rgba(30, 30, 30, 0.25)";
    ctx.fillRect(
      this.offsetX + bounds.x * this.tileSize,
      this.offsetY + bounds.y * this.tileSize,
      bounds.w * this.tileSize,
      bounds.h * this.tileSize
    );
    ctx.strokeStyle = "rgba(250, 210, 120, 0.9)";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      this.offsetX + bounds.x * this.tileSize,
      this.offsetY + bounds.y * this.tileSize,
      bounds.w * this.tileSize,
      bounds.h * this.tileSize
    );
    ctx.font = `${Math.max(10, Math.floor(this.tileSize / 2))}px Avenir Next, sans-serif`;
    ctx.fillStyle = "rgba(250, 210, 120, 0.95)";
    ctx.fillText(
      "Working...",
      this.offsetX + bounds.x * this.tileSize + 6,
      this.offsetY + bounds.y * this.tileSize + 18
    );
    ctx.restore();
  }

  destroy() {
    this.resizeObserver.disconnect();
    this.canvas.remove();
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampBounds(x, y, w, h, maxW, maxH) {
  const clampedX = Math.max(0, Math.min(x, maxW));
  const clampedY = Math.max(0, Math.min(y, maxH));
  const clampedW = Math.max(0, Math.min(w, maxW - clampedX));
  const clampedH = Math.max(0, Math.min(h, maxH - clampedY));
  return { x: clampedX, y: clampedY, w: clampedW, h: clampedH };
}

function collectOverlayIntersections(roads, rivers) {
  const roadPoints = new Set();
  roads.forEach((road) => {
    (road.points || []).forEach((point) => {
      roadPoints.add(`${point.x},${point.y}`);
    });
  });
  const intersections = [];
  const seen = new Set();
  rivers.forEach((river) => {
    (river.points || []).forEach((point) => {
      const key = `${point.x},${point.y}`;
      if (roadPoints.has(key) && !seen.has(key)) {
        seen.add(key);
        intersections.push(point);
      }
    });
  });
  return intersections;
}
