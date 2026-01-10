// Pony Parade: actor rendering orchestration.

import { createActorUpdater } from "./updater.js";
import { createActorDrawer } from "./draw.js";

export const createActorRenderer = (context) => {
  const { actors, getScale, getLastPointer, isLabelsEnabled } = context;
  const { updateActor } = createActorUpdater(context);
  const { drawActor } = createActorDrawer(context);

  const drawActors = (delta, now) => {
    const scale = getScale();
    const lastPointer = getLastPointer();
    const labelsEnabled = isLabelsEnabled();
    actors.forEach((actor) => {
      updateActor(actor, delta, now);
      drawActor(actor, delta, now, scale, lastPointer, labelsEnabled);
    });
  };

  return { drawActors };
};
