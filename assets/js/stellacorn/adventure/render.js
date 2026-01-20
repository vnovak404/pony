export function drawFrame(state) {
  if (!state.ctx || !state.canvas) return;
  state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
  drawTiles(state);
  drawObjects(state);
  drawPlayer(state);
}

export function drawError(ctx, canvas, message) {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#e3efe6";
  ctx.font = "16px sans-serif";
  ctx.fillText(message, 20, 40);
}

export function updatePlayerAnimation(state, delta) {
  const { playerSprite, activePath } = state;
  if (!playerSprite) return;
  const moving = activePath.length > 0;
  const nextAction = moving ? "walk" : "idle";
  if (playerSprite.action !== nextAction) {
    playerSprite.action = nextAction;
    playerSprite.frameIndex = 0;
    playerSprite.frameTimer = 0;
  }
  const fps = playerSprite.fps?.[playerSprite.action] || 8;
  const frameDuration = 1 / fps;
  playerSprite.frameTimer += delta;
  while (playerSprite.frameTimer >= frameDuration) {
    playerSprite.frameTimer -= frameDuration;
    playerSprite.frameIndex += 1;
  }
}

function drawTiles(state) {
  const {
    ctx,
    canvas,
    tileSize,
    mapWidth,
    mapHeight,
    tiles,
    tileDefs,
    tileImages,
    camera,
    isTileDiscovered,
    isTileVisible,
    fogHiddenAlpha,
    fogDimAlpha,
  } = state;
  if (!ctx || !canvas) return;
  const startX = Math.max(0, Math.floor(camera.x / tileSize));
  const startY = Math.max(0, Math.floor(camera.y / tileSize));
  const endX = Math.min(
    mapWidth,
    Math.ceil((camera.x + canvas.width) / tileSize)
  );
  const endY = Math.min(
    mapHeight,
    Math.ceil((camera.y + canvas.height) / tileSize)
  );

  for (let ty = startY; ty < endY; ty += 1) {
    for (let tx = startX; tx < endX; tx += 1) {
      const tileId = tiles[ty * mapWidth + tx] ?? 0;
      const def = tileDefs.get(tileId);
      const img = tileImages.get(tileId);
      const x = tx * tileSize - camera.x;
      const y = ty * tileSize - camera.y;
      if (!isTileDiscovered(tx, ty)) {
        ctx.fillStyle = `rgba(5, 7, 10, ${fogHiddenAlpha})`;
        ctx.fillRect(x, y, tileSize, tileSize);
        continue;
      }
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, x, y, tileSize, tileSize);
      } else {
        ctx.fillStyle = def?.color || "#3b4b45";
        ctx.fillRect(x, y, tileSize, tileSize);
      }
      if (!isTileVisible(tx, ty)) {
        ctx.fillStyle = `rgba(5, 8, 10, ${fogDimAlpha})`;
        ctx.fillRect(x, y, tileSize, tileSize);
      }
    }
  }
}

function drawObjects(state) {
  const { ctx, objects, camera, tileSize, objectSprites, getObjectSprite } = state;
  if (!ctx) return;
  objects.forEach((obj) => {
    if (obj.hidden) return;
    if (!state.isTileVisible(obj.tx, obj.ty)) return;
    const sprite = objectSprites.get(obj.type) || getObjectSprite(obj.type);
    const centerX = (obj.tx + 0.5) * tileSize - camera.x;
    const centerY = (obj.ty + 0.5) * tileSize - camera.y;
    const size = tileSize * 1.1;
    if (sprite && sprite.complete && sprite.naturalWidth > 0) {
      ctx.drawImage(sprite, centerX - size / 2, centerY - size / 2, size, size);
      return;
    }
    ctx.beginPath();
    ctx.fillStyle = "#f1dca0";
    ctx.strokeStyle = "#2a302e";
    ctx.lineWidth = 2;
    ctx.arc(centerX, centerY, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
}

function drawPlayer(state) {
  const { ctx, player, playerSprite, tileSize, playerScale, camera } = state;
  if (!ctx) return;
  if (playerSprite && playerSprite.image?.complete) {
    const frameNames = getPlayerFrameNames(playerSprite);
    const frameName =
      frameNames[playerSprite.frameIndex % frameNames.length] || frameNames[0];
    const entry = playerSprite.frames[frameName];
    const frame = entry?.frame;
    if (frame) {
      const anchor = entry.anchor || { x: frame.w / 2, y: frame.h };
      const scale = (tileSize * playerScale) / frame.w;
      const drawW = frame.w * scale;
      const drawH = frame.h * scale;
      const destX = player.px - camera.x - anchor.x * scale;
      const destY = player.py - camera.y - anchor.y * scale;
      if (player.facing === -1) {
        ctx.save();
        ctx.translate(destX + drawW, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(
          playerSprite.image,
          frame.x,
          frame.y,
          frame.w,
          frame.h,
          0,
          destY,
          drawW,
          drawH
        );
        ctx.restore();
        return;
      }
      ctx.drawImage(
        playerSprite.image,
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        destX,
        destY,
        drawW,
        drawH
      );
      return;
    }
  }
  const x = player.px - camera.x;
  const y = player.py - camera.y;
  ctx.beginPath();
  ctx.fillStyle = "#f7f2d6";
  ctx.strokeStyle = "#2b2f2f";
  ctx.lineWidth = 3;
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function getPlayerFrameNames(playerSprite) {
  const animation = playerSprite.animations?.[playerSprite.action];
  if (Array.isArray(animation) && animation.length) return animation;
  return Object.keys(playerSprite.frames || {});
}
