// Pony Parade: map rendering helpers.

export const createRenderer = ({
  ctx,
  ponyMap,
  mapData,
  getScale,
  ASSET_SCALE,
  roadSegments,
  decorItems,
  decorSprites,
  objects,
  structureSprites,
  structureScale,
  houseStates,
  getStructureLabel,
  updateHouseStates,
  renderActors,
  commandMenu,
  getCommandTarget,
  updateCommandStats,
  lastCommandStatsUpdateRef,
}) => {
  const pattern = (() => {
    const tile = document.createElement("canvas");
    tile.width = 140;
    tile.height = 140;
    const tctx = tile.getContext("2d");
    if (!tctx) return null;
    const gradient = tctx.createLinearGradient(0, 0, 140, 140);
    gradient.addColorStop(0, "#f6ffe6");
    gradient.addColorStop(1, "#e4f5d2");
    tctx.fillStyle = gradient;
    tctx.fillRect(0, 0, tile.width, tile.height);
    for (let i = 0; i < 80; i += 1) {
      tctx.fillStyle =
        i % 2 === 0 ? "rgba(170, 210, 140, 0.4)" : "rgba(200, 230, 170, 0.5)";
      tctx.beginPath();
      tctx.arc(
        Math.random() * tile.width,
        Math.random() * tile.height,
        1.2 + Math.random() * 1.8,
        0,
        Math.PI * 2
      );
      tctx.fill();
    }
    return ctx.createPattern(tile, "repeat");
  })();

  let structureBounds = [];
  const drawRoads = (scale) => {
    if (!roadSegments.length) return;
    const roadWidth = Math.max(6, mapData.meta.tileSize * scale * 0.28);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(188, 150, 90, 0.9)";
    ctx.lineWidth = roadWidth;
    roadSegments.forEach((segment) => {
      ctx.beginPath();
      ctx.moveTo(segment.from.x * scale, segment.from.y * scale);
      ctx.lineTo(segment.to.x * scale, segment.to.y * scale);
      ctx.stroke();
    });

    ctx.strokeStyle = "rgba(242, 216, 165, 0.9)";
    ctx.lineWidth = roadWidth * 0.55;
    roadSegments.forEach((segment) => {
      ctx.beginPath();
      ctx.moveTo(segment.from.x * scale, segment.from.y * scale);
      ctx.lineTo(segment.to.x * scale, segment.to.y * scale);
      ctx.stroke();
    });
  };

  const drawDecor = (scale) => {
    if (!decorItems.length) return;
    decorItems.forEach((item) => {
      if (!item || !item.at) return;
      const sprite = decorSprites[item.id];
      if (!sprite) return;
      const size =
        (item.scale || item.size || 0.8) * mapData.meta.tileSize * scale * ASSET_SCALE;
      const x = item.at.x * mapData.meta.tileSize * scale;
      const y = item.at.y * mapData.meta.tileSize * scale;
      ctx.drawImage(sprite, x - size * 0.5, y - size, size, size);
    });
  };

  const drawStructures = (scale) => {
    const nextBounds = [];
    objects.forEach((item) => {
      const spriteEntry = structureSprites[item.id];
      if (!spriteEntry) return;
      let sprite = spriteEntry;
      if (item.kind === "house" && spriteEntry.base) {
        const state = houseStates.get(item.id);
        if (state && state.status === "repairing") {
          sprite = spriteEntry.repair || spriteEntry.base;
        } else if (state && state.status === "needs_repair") {
          sprite = spriteEntry.ruined || spriteEntry.repair || spriteEntry.base;
        } else if (
          state &&
          (state.status === "desperately_needs_repair" ||
            state.status === "under_construction")
        ) {
          sprite = spriteEntry.repair || spriteEntry.base;
        } else {
          sprite = spriteEntry.base;
        }
      }
      if (!sprite) return;
      const scaleFactor = item.scale || structureScale[item.kind] || 1.6;
      const x = item.at.x * mapData.meta.tileSize * scale;
      const y = item.at.y * mapData.meta.tileSize * scale;
      const size = mapData.meta.tileSize * scale * scaleFactor * ASSET_SCALE;
      const destX = x - size * 0.5;
      const destY = y - size;
      ctx.drawImage(sprite, destX, destY, size, size);
      nextBounds.push({
        id: item.id,
        label: getStructureLabel(item),
        x: destX,
        y: destY,
        width: size,
        height: size,
        anchorX: x,
        anchorY: y,
        item,
      });
    });
    structureBounds = nextBounds;
  };

  const drawFrame = (delta, now) => {
    const scale = getScale();
    ctx.clearRect(0, 0, ponyMap.width, ponyMap.height);
    ctx.fillStyle = pattern || "#eaf7da";
    ctx.fillRect(0, 0, ponyMap.width, ponyMap.height);
    drawRoads(scale);
    drawDecor(scale);
    drawStructures(scale);
    updateHouseStates(delta, now);
    renderActors(delta, now);
    if (commandMenu && !commandMenu.hidden && getCommandTarget()) {
      const lastTick = lastCommandStatsUpdateRef?.value ?? 0;
      if (now - lastTick > 500) {
        updateCommandStats(now);
        if (lastCommandStatsUpdateRef) {
          lastCommandStatsUpdateRef.value = now;
        }
      }
    }
  };

  const getStructureBounds = () => structureBounds;

  return {
    drawFrame,
    getStructureBounds,
  };
};
