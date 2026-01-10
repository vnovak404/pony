// Pony Parade: VFX helpers.

export const createVfxState = ({ ctx, mapData, ASSET_SCALE, getScale, objects }) => {
  const lakeObject =
    objects.find(
      (item) => item.id === "silver-lake" || item.locationId === "silver-lake"
    ) || null;
  const lakeState = { point: null, splashRadius: 0 };
  const updateLakeState = (item) => {
    if (!item || !item.at) return;
    const isLake = item.id === "silver-lake" || item.locationId === "silver-lake";
    if (!isLake) return;
    lakeState.point = {
      x: item.at.x * mapData.meta.tileSize,
      y: item.at.y * mapData.meta.tileSize,
    };
    lakeState.splashRadius =
      mapData.meta.tileSize * (item.splashRadius || lakeObject?.splashRadius || 1.4);
  };
  if (lakeObject) {
    updateLakeState(lakeObject);
  }

  const VFX_REGISTRY = [
    {
      id: "stellacorn-eating",
      pony: "stellacorn",
      trigger: "eat",
      src: "assets/ponies/stellacorn/animations/stellacorn-eating.mp4",
      scale: 1.1,
      offset: { x: 0, y: -0.35 },
      anchor: "pony",
      loop: false,
      blend: "screen",
    },
    {
      id: "stellacorn-splashing",
      pony: "stellacorn",
      trigger: "lake",
      src: "assets/ponies/stellacorn/animations/stella-corn-splashing.mp4",
      scale: 1.3,
      offset: { x: 0, y: -0.25 },
      anchor: "lake",
      loop: true,
      blend: "screen",
    },
  ];

  const createVideo = (src, loop) => {
    const video = document.createElement("video");
    video.src = src;
    video.preload = "auto";
    video.muted = true;
    video.loop = Boolean(loop);
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.load();
    return video;
  };

  const vfxVideos = new Map();
  const vfxByKey = new Map();
  const vfxState = new Map();
  VFX_REGISTRY.forEach((entry) => {
    vfxVideos.set(entry.id, createVideo(entry.src, entry.loop ?? true));
    vfxByKey.set(`${entry.pony}:${entry.trigger}`, entry);
  });

  const setVideoActive = (entry, video, active) => {
    if (!video || !entry) return;
    const state = vfxState.get(entry.id) || { active: false };
    if (active && !state.active) {
      try {
        video.currentTime = 0;
      } catch (error) {
        // Ignore seek errors on first play.
      }
    }
    if (active) {
      if (video.paused) {
        video.play().catch(() => {});
      }
    } else if (!video.paused) {
      video.pause();
    }
    state.active = active;
    vfxState.set(entry.id, state);
  };

  const drawVideoOverlay = (video, config, x, y) => {
    if (!video || !config) return;
    if (video.readyState < 2) return;
    const scale = getScale();
    const size =
      mapData.meta.tileSize * scale * ASSET_SCALE * (config.scale || 1);
    const offsetX =
      (config.offset?.x || 0) * mapData.meta.tileSize * scale * ASSET_SCALE;
    const offsetY =
      (config.offset?.y || 0) * mapData.meta.tileSize * scale * ASSET_SCALE;
    const drawX = x * scale - size * 0.5 + offsetX;
    const drawY = y * scale - size + offsetY;
    const blend = config.blend && config.blend !== "source-over";
    if (blend) {
      ctx.save();
      ctx.globalCompositeOperation = config.blend;
    }
    ctx.drawImage(video, drawX, drawY, size, size);
    if (blend) {
      ctx.restore();
    }
  };

  return {
    updateLakeState,
    lakeState,
    VFX_REGISTRY,
    vfxVideos,
    vfxByKey,
    setVideoActive,
    drawVideoOverlay,
  };
};
