// Pony Parade: async pony sprite loading.

import { createActors } from "./actors.js";
import { loadPonySprites } from "./assets.js";

export const createPonyLoader = ({
  ponies,
  loadImageWithFallback,
  loadJson,
  mapStatus,
  roadSegments,
  mapWidth,
  runtimeState,
  maxActors,
  eatThresholdDefault,
  drinkThresholdDefault,
  funThresholdDefault,
  healthThresholdDefault,
  actors,
  actorBySlug,
  commandMenu,
}) => {
  const loadPonyActors = async () => {
    if (mapStatus) {
      mapStatus.textContent = "Loading ponies...";
    }
    const sprites = await loadPonySprites({
      ponies,
      loadImageWithFallback,
      loadJson,
    });
    const activeSprites = sprites.filter(Boolean);
    if (!activeSprites.length) {
      if (mapStatus) {
        mapStatus.textContent = "No spritesheets found. Pack sprites to animate.";
      }
    } else {
      const missingCount = ponies.length - activeSprites.length;
      if (activeSprites.length > maxActors) {
        mapStatus.textContent = `Showing ${maxActors} of ${activeSprites.length} ponies.`;
      } else if (missingCount > 0) {
        mapStatus.textContent = `${missingCount} ponies missing spritesheets.`;
      } else {
        mapStatus.textContent = "Ponyville is live.";
      }
    }
    const { actors: newActors } = createActors({
      sprites: activeSprites,
      roadSegments,
      mapWidth,
      runtimeState,
      maxActors,
      eatThresholdDefault,
      drinkThresholdDefault,
      funThresholdDefault,
      healthThresholdDefault,
    });
    actors.splice(0, actors.length, ...newActors);
    actorBySlug.clear();
    actors.forEach((actor) => {
      const slug = actor.sprite?.pony?.slug;
      if (slug) {
        actorBySlug.set(slug, actor);
      }
    });
    commandMenu.renderPonyQuickbar();
  };

  return { loadPonyActors };
};
