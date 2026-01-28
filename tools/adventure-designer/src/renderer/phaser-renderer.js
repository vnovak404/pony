export class PhaserRenderer {
  constructor(container, options = {}) {
    if (!window.Phaser) {
      throw new Error("Phaser not available");
    }

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
    this.ready = false;
    this.pendingResize = false;
    this.pendingTextureLoad = false;
    this.loadingTextures = false;
    this.texturesLoaded = false;
    this.loadedAssets = new Map();
    this.assetSignature = "";
    this.roadGraphics = null;
    this.noteLayer = null;

    const Phaser = window.Phaser;
    const renderer = this;
    const scene = new Phaser.Scene("mapella");

    scene.create = function () {
      renderer.scene = this;
      renderer.baseGraphics = this.add.graphics();
      renderer.tileLayer = this.add.container(0, 0);
      renderer.roadGraphics = this.add.graphics();
      renderer.objectLayer = this.add.container(0, 0);
      renderer.noteLayer = this.add.container(0, 0);
      renderer.overlayGraphics = this.add.graphics();
      renderer.ready = true;
      renderer.resize();
      void renderer.loadTexturesIfNeeded();
    };

    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      width: container.clientWidth || 800,
      height: container.clientHeight || 600,
      parent: container,
      backgroundColor: "#fef8ef",
      scene
    });

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
    const nextSignature = computeAssetSignature(tilesById, objectsByType);
    if (nextSignature !== this.assetSignature) {
      this.assetSignature = nextSignature;
      this.texturesLoaded = false;
      this.pendingTextureLoad = true;
    }
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
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    const viewX = (-this.offsetX) / this.tileSize;
    const viewY = (-this.offsetY) / this.tileSize;
    const viewW = width / this.tileSize;
    const viewH = height / this.tileSize;
    return clampBounds(viewX, viewY, viewW, viewH, this.map.width, this.map.height);
  }

  setIntentLock(selection) {
    this.intentLock = selection;
    this.draw();
  }

  getPointerTarget() {
    if (this.game && this.game.canvas) {
      return this.game.canvas;
    }
    return this.container;
  }

  screenToGrid(clientX, clientY) {
    if (!this.map) {
      return null;
    }

    const rect = this.container.getBoundingClientRect();
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
    if (!this.map || !this.game) {
      return;
    }

    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    if (this.game.scale) {
      this.game.scale.resize(width, height);
    }

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
    if (!this.map || !this.game) {
      this.offsetX = this.baseOffsetX + this.panX;
      this.offsetY = this.baseOffsetY + this.panY;
      return;
    }
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    const mapWidth = this.map.width * this.tileSize;
    const mapHeight = this.map.height * this.tileSize;
    const minOffsetX = Math.min(0, width - mapWidth);
    const minOffsetY = Math.min(0, height - mapHeight);
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
    if (
      !this.ready ||
      !this.map ||
      !this.baseGraphics ||
      !this.overlayGraphics ||
      !this.roadGraphics
    ) {
      return;
    }

    void this.loadTexturesIfNeeded();

    this.baseGraphics.clear();
    this.roadGraphics.clear();
    this.overlayGraphics.clear();
    if (this.tileLayer) {
      this.tileLayer.removeAll(true);
    }

    const isSketch = this.renderMode === "sketch";
    this.drawTiles(this.baseGraphics);
    if (!isSketch) {
      this.drawTileImages();
    }
    this.drawGrid(this.baseGraphics);
    if (!isSketch) {
      this.drawRivers(this.roadGraphics);
      this.drawRoads(this.roadGraphics);
      this.drawObjects();
      this.drawBridges(this.overlayGraphics);
      this.drawStoryZones(this.overlayGraphics);
      this.drawRiverDraft(this.overlayGraphics);
      this.drawRoadDraft(this.overlayGraphics);
    }
    this.drawNotes(this.overlayGraphics);
    this.drawProposal(this.overlayGraphics);
    this.drawIntentLock(this.overlayGraphics);
    this.drawSelection(this.overlayGraphics);
  }

  drawTiles(g) {
    const useSketch = this.renderMode === "sketch" && Array.isArray(this.sketchTiles);
    const { width, height } = this.map;
    const tiles = useSketch ? this.sketchTiles : this.map.tiles;
    const palette = useSketch ? this.sketchPaletteById : this.tilesById;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = tiles[y * width + x];
        const tile = palette[id] || { color: "#d8c7b0" };
        g.fillStyle(hexToNumber(tile.color), 1);
        g.fillRect(
          this.offsetX + x * this.tileSize,
          this.offsetY + y * this.tileSize,
          this.tileSize,
          this.tileSize
        );
      }
    }
  }

  drawTileImages() {
    if (!this.tileLayer || !this.scene) {
      return;
    }

    const { width, height, tiles } = this.map;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = tiles[y * width + x];
        const tile = this.tilesById[id];
        if (!tile) {
          continue;
        }
        const key = getTileTextureKey(tile);
        if (!key || !this.scene.textures.exists(key)) {
          continue;
        }
        const image = this.scene.add.image(
          this.offsetX + x * this.tileSize,
          this.offsetY + y * this.tileSize,
          key
        );
        image.setOrigin(0, 0);
        image.setDisplaySize(this.tileSize, this.tileSize);
        this.tileLayer.add(image);
      }
    }
  }

  drawGrid(g) {
    const { width, height } = this.map;
    g.lineStyle(1, hexToNumber("#2b251f"), 0.2);

    for (let x = 0; x <= width; x += 1) {
      const xPos = this.offsetX + x * this.tileSize + 0.5;
      g.beginPath();
      g.moveTo(xPos, this.offsetY);
      g.lineTo(xPos, this.offsetY + height * this.tileSize);
      g.strokePath();
    }

    for (let y = 0; y <= height; y += 1) {
      const yPos = this.offsetY + y * this.tileSize + 0.5;
      g.beginPath();
      g.moveTo(this.offsetX, yPos);
      g.lineTo(this.offsetX + width * this.tileSize, yPos);
      g.strokePath();
    }
  }


  drawRoads(g) {
    const lineWidth = Math.max(3, Math.floor(this.tileSize / 6));
    g.lineStyle(lineWidth, hexToNumber("#7a4d2b"), 1);
    (this.map.roads || []).forEach((road) => {
      if (!road.points || road.points.length < 2) {
        return;
      }
      g.beginPath();
      road.points.forEach((point, index) => {
        const x = this.offsetX + (point.x + 0.5) * this.tileSize;
        const y = this.offsetY + (point.y + 0.5) * this.tileSize;
        if (index === 0) {
          g.moveTo(x, y);
        } else {
          g.lineTo(x, y);
        }
      });
      g.strokePath();
    });
  }

  drawRivers(g) {
    const lineWidth = Math.max(3, Math.floor(this.tileSize / 5));
    g.lineStyle(lineWidth, hexToNumber("#4b87c9"), 1);
    (this.map.rivers || []).forEach((river) => {
      if (!river.points || river.points.length < 2) {
        return;
      }
      g.beginPath();
      river.points.forEach((point, index) => {
        const x = this.offsetX + (point.x + 0.5) * this.tileSize;
        const y = this.offsetY + (point.y + 0.5) * this.tileSize;
        if (index === 0) {
          g.moveTo(x, y);
        } else {
          g.lineTo(x, y);
        }
      });
      g.strokePath();
    });
  }

  drawBridges(g) {
    const intersections = collectOverlayIntersections(this.map.roads || [], this.map.rivers || []);
    if (intersections.length === 0) {
      return;
    }
    const size = this.tileSize * 0.6;
    g.fillStyle(hexToNumber("#d8b47f"), 1);
    intersections.forEach((point) => {
      const x = this.offsetX + (point.x + 0.5) * this.tileSize - size / 2;
      const y = this.offsetY + (point.y + 0.5) * this.tileSize - size / 2;
      g.fillRect(x, y, size, size);
    });
  }

  drawRoadDraft(g) {
    if (!this.roadDraft || !this.roadDraft.points || this.roadDraft.points.length < 2) {
      return;
    }
    const lineWidth = Math.max(2, Math.floor(this.tileSize / 7));
    g.lineStyle(lineWidth, hexToNumber("#f7d77b"), 0.9);
    g.beginPath();
    this.roadDraft.points.forEach((point, index) => {
      const x = this.offsetX + (point.x + 0.5) * this.tileSize;
      const y = this.offsetY + (point.y + 0.5) * this.tileSize;
      if (index === 0) {
        g.moveTo(x, y);
      } else {
        g.lineTo(x, y);
      }
    });
    g.strokePath();
  }

  drawRiverDraft(g) {
    if (!this.riverDraft || !this.riverDraft.points || this.riverDraft.points.length < 2) {
      return;
    }
    const lineWidth = Math.max(2, Math.floor(this.tileSize / 7));
    g.lineStyle(lineWidth, hexToNumber("#6ba5e0"), 0.9);
    g.beginPath();
    this.riverDraft.points.forEach((point, index) => {
      const x = this.offsetX + (point.x + 0.5) * this.tileSize;
      const y = this.offsetY + (point.y + 0.5) * this.tileSize;
      if (index === 0) {
        g.moveTo(x, y);
      } else {
        g.lineTo(x, y);
      }
    });
    g.strokePath();
  }

  drawObjects() {
    if (!this.objectLayer) {
      return;
    }

    this.objectLayer.removeAll(true);
    this.map.objects.forEach((object) => {
      const objDef = this.objectsByType[object.type] || { color: "#5c4b3b" };
      const key = getObjectTextureKey(objDef);
      const centerX = this.offsetX + (object.x + 0.5) * this.tileSize;
      const centerY = this.offsetY + (object.y + 0.5) * this.tileSize;
      const size = this.tileSize * 0.8;

      if (key && this.scene.textures.exists(key)) {
        const image = this.scene.add.image(centerX, centerY, key);
        image.setDisplaySize(size, size);
        this.objectLayer.add(image);
      } else {
        const rect = this.scene.add.rectangle(centerX, centerY, size, size, hexToNumber(objDef.color), 1);
        this.objectLayer.add(rect);
      }
    });
  }

  drawStoryZones(g) {
    g.lineStyle(2, hexToNumber("#9b5822"), 0.6);
    this.map.storyZones.forEach((zone) => {
      const { x, y, w, h } = zone.bounds;
      g.strokeRect(
        this.offsetX + x * this.tileSize,
        this.offsetY + y * this.tileSize,
        w * this.tileSize,
        h * this.tileSize
      );
    });
  }

  drawNotes(g) {
    const notes = this.map.notes || [];
    if (!this.noteLayer) {
      return;
    }
    this.noteLayer.removeAll(true);
    if (notes.length === 0) {
      return;
    }
    const fontSize = Math.max(10, Math.floor(this.tileSize / 2));
    notes.forEach((note) => {
      const w = Math.max(1, note.w || 1) * this.tileSize;
      const h = Math.max(1, note.h || 1) * this.tileSize;
      const x = this.offsetX + note.x * this.tileSize;
      const y = this.offsetY + note.y * this.tileSize;
      g.fillStyle(hexToNumber("#c8742e"), 0.12);
      g.fillRect(x, y, w, h);
      g.lineStyle(2, hexToNumber("#c8742e"), 0.85);
      g.strokeRect(x, y, w, h);
      if (note.text && this.scene) {
        const label = note.text.trim();
        if (label) {
          const text =
            label.length > 28 ? `${label.slice(0, 25)}...` : label;
          const textNode = this.scene.add.text(x + 6, y + 4, text, {
            fontSize: `${fontSize}px`,
            color: "#2b251f",
            fontFamily: "Avenir Next, Futura, Gill Sans, sans-serif"
          });
          textNode.setOrigin(0, 0);
          this.noteLayer.add(textNode);
        }
      }
    });
  }

  drawSelection(g) {
    if (!this.selection) {
      return;
    }
    const bounds = this.selection.bounds || this.selection;
    g.fillStyle(hexToNumber("#c8742e"), 0.18);
    if (this.selection.cells && this.selection.cells.length > 0) {
      this.selection.cells.forEach((cell) => {
        g.fillRect(
          this.offsetX + cell.x * this.tileSize,
          this.offsetY + cell.y * this.tileSize,
          this.tileSize,
          this.tileSize
        );
      });
    }
    if (bounds) {
      g.lineStyle(2, hexToNumber("#c8742e"), 0.8);
      g.strokeRect(
        this.offsetX + bounds.x * this.tileSize,
        this.offsetY + bounds.y * this.tileSize,
        bounds.w * this.tileSize,
        bounds.h * this.tileSize
      );
    }
  }

  drawProposal(g) {
    g.fillStyle(hexToNumber("#4c8cc8"), 0.25);
    if (this.proposalEdits && this.proposalEdits.length > 0) {
      this.proposalEdits.forEach((edit) => {
        g.fillRect(
          this.offsetX + edit.x * this.tileSize,
          this.offsetY + edit.y * this.tileSize,
          this.tileSize,
          this.tileSize
        );
      });
    }

    if (this.proposalObjects && this.proposalObjects.length > 0) {
      g.fillStyle(hexToNumber("#50a05a"), 0.7);
      this.proposalObjects.forEach((placement) => {
        const centerX = this.offsetX + (placement.x + 0.5) * this.tileSize;
        const centerY = this.offsetY + (placement.y + 0.5) * this.tileSize;
        const radius = this.tileSize * 0.22;
        g.fillCircle(centerX, centerY, radius);
      });
    }

    if (this.proposalRivers && this.proposalRivers.length > 0) {
      g.lineStyle(Math.max(2, Math.floor(this.tileSize / 7)), hexToNumber("#6ba5e0"), 0.8);
      this.proposalRivers.forEach((river) => {
        if (!river.points || river.points.length < 2) {
          return;
        }
        g.beginPath();
        river.points.forEach((point, index) => {
          const x = this.offsetX + (point.x + 0.5) * this.tileSize;
          const y = this.offsetY + (point.y + 0.5) * this.tileSize;
          if (index === 0) {
            g.moveTo(x, y);
          } else {
            g.lineTo(x, y);
          }
        });
        g.strokePath();
      });
    }

    if (this.proposalRoads && this.proposalRoads.length > 0) {
      g.lineStyle(Math.max(2, Math.floor(this.tileSize / 7)), hexToNumber("#f7d77b"), 0.85);
      this.proposalRoads.forEach((road) => {
        if (!road.points || road.points.length < 2) {
          return;
        }
        g.beginPath();
        road.points.forEach((point, index) => {
          const x = this.offsetX + (point.x + 0.5) * this.tileSize;
          const y = this.offsetY + (point.y + 0.5) * this.tileSize;
          if (index === 0) {
            g.moveTo(x, y);
          } else {
            g.lineTo(x, y);
          }
        });
        g.strokePath();
      });
    }
  }

  drawIntentLock(g) {
    if (!this.intentLock) {
      return;
    }
    const bounds = this.intentLock.bounds || this.intentLock;
    if (!bounds) {
      return;
    }
    g.fillStyle(hexToNumber("#1e1e1e"), 0.25);
    g.fillRect(
      this.offsetX + bounds.x * this.tileSize,
      this.offsetY + bounds.y * this.tileSize,
      bounds.w * this.tileSize,
      bounds.h * this.tileSize
    );
    g.lineStyle(2, hexToNumber("#f7d77b"), 0.9);
    g.strokeRect(
      this.offsetX + bounds.x * this.tileSize,
      this.offsetY + bounds.y * this.tileSize,
      bounds.w * this.tileSize,
      bounds.h * this.tileSize
    );
  }

  async loadTexturesIfNeeded() {
    if (!this.pendingTextureLoad || this.loadingTextures || !this.scene) {
      return;
    }

    this.pendingTextureLoad = false;
    this.loadingTextures = true;

    const assets = [];
    Object.values(this.tilesById).forEach((tile) => {
      const key = getTileTextureKey(tile);
      if (tile.asset && key && !this.scene.textures.exists(key)) {
        assets.push({ key, url: tile.asset });
      }
    });

    Object.values(this.objectsByType).forEach((obj) => {
      const key = getObjectTextureKey(obj);
      if (obj.asset && key && !this.scene.textures.exists(key)) {
        assets.push({ key, url: obj.asset });
      }
    });

    const assetsToLoad = [];
    assets.forEach((asset) => {
      const previousUrl = this.loadedAssets.get(asset.key);
      if (previousUrl && previousUrl !== asset.url && this.scene.textures.exists(asset.key)) {
        this.scene.textures.remove(asset.key);
      }
      if (!this.scene.textures.exists(asset.key) || previousUrl !== asset.url) {
        assetsToLoad.push(asset);
      }
    });

    if (assetsToLoad.length === 0) {
      this.loadingTextures = false;
      this.texturesLoaded = true;
      return;
    }

    const existing = await filterExistingAssets(assetsToLoad);
    if (existing.length === 0) {
      this.loadingTextures = false;
      this.texturesLoaded = true;
      return;
    }

    const loader = this.scene.load;

    existing.forEach((asset) => {
      loader.image(asset.key, asset.url);
    });

    loader.once("complete", () => {
      this.loadingTextures = false;
      this.texturesLoaded = true;
      existing.forEach((asset) => {
        this.loadedAssets.set(asset.key, asset.url);
      });
      this.draw();
    });

    loader.start();
  }

  destroy() {
    this.resizeObserver.disconnect();
    if (this.game) {
      this.game.destroy(true);
    }
  }
}

function getTileTextureKey(tile) {
  return tile && tile.name ? `tile:${tile.name}` : null;
}

function getObjectTextureKey(obj) {
  return obj && obj.type ? `object:${obj.type}` : null;
}

async function filterExistingAssets(assets) {
  const checks = await Promise.all(
    assets.map(async (asset) => {
      try {
        const response = await fetch(asset.url, { method: "HEAD" });
        return response.ok ? asset : null;
      } catch (error) {
        return null;
      }
    })
  );
  return checks.filter(Boolean);
}

function hexToNumber(hex) {
  return parseInt(hex.replace("#", ""), 16);
}

function computeAssetSignature(tilesById, objectsByType) {
  const tileSig = Object.values(tilesById)
    .map((tile) => `${tile.name}:${tile.asset || ""}`)
    .sort()
    .join("|");
  const objSig = Object.values(objectsByType)
    .map((obj) => `${obj.type}:${obj.asset || ""}`)
    .sort()
    .join("|");
  return `${tileSig}::${objSig}`;
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
