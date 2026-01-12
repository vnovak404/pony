// Pony Parade: actor update loop.

import { createSupplyHelpers } from "./supply.js";
import { createTaskHelpers } from "./tasks.js";
import { createMovementHandler } from "./movement.js";
import { createActionHandlers } from "./actions.js";

export const createActorUpdater = (context) => {
  const supplyHelpers = createSupplyHelpers(context);
  const { updateActorTask } = createTaskHelpers({ ...context, ...supplyHelpers });
  const { updateActorMovement } = createMovementHandler(context);
  const { handleActorActions } = createActionHandlers({ ...context, ...supplyHelpers });

  const {
    mapData,
    releaseInnSpot,
    releaseHouseSpot,
    housesById,
    houseStates,
    innObject,
    foodSpotById,
    drinkSpotById,
    funSpotById,
    healthSpotById,
    getSpotForLocationId,
    getHouseTargetPoint,
    snapActorToNearestSegment,
    vfxByKey,
    vfxVideos,
    HUNGER_RATE,
    THIRST_RATE,
    BOREDOM_RATE,
    HEALTH_DECAY_RATE,
    ACTOR_STUCK_TIMEOUT,
  } = context;

  const updateActor = (actor, delta, now) => {
    if (!actor || !actor.sprite || !actor.segment) return;
    const { segment } = actor;
    const previousPosition = actor.position
      ? { x: actor.position.x, y: actor.position.y }
      : null;
    const sleeping = actor.sleepUntil > now;
    const eating = actor.eatUntil > now;
    const drinking = actor.drinkUntil > now;
    const playing = actor.funUntil > now;
    const healing = actor.vetUntil > now;
    const working = actor.workUntil > now;
    const repairing = actor.repairUntil > now;
    const inAction =
      sleeping || eating || drinking || playing || healing || working || repairing;

    if (!sleeping && actor.sleepSpotOwner) {
      if (actor.sleepSpotOwner.kind === "inn") {
        releaseInnSpot(actor.sleepSpotIndex);
      } else if (actor.sleepSpotOwner.kind === "house") {
        releaseHouseSpot(actor.sleepSpotOwner.id, actor.sleepSpotIndex);
      }
      actor.sleepSpotIndex = null;
      actor.sleepSpotOwner = null;
      actor.restTarget = null;
    }
    if (!eating && actor.eatTargetId) {
      actor.eatTargetId = null;
      actor.eatOffset = { x: 0, y: 0 };
    }
    if (!drinking && actor.drinkTargetId) {
      actor.drinkTargetId = null;
      actor.drinkOffset = { x: 0, y: 0 };
    }
    if (!playing && actor.funTargetId) {
      actor.funTargetId = null;
      actor.funOffset = { x: 0, y: 0 };
    }
    if (!working && actor.workTargetId) {
      actor.workTargetId = null;
      actor.workOffset = { x: 0, y: 0 };
    }
    if (!healing && actor.vetTargetId) {
      actor.vetTargetId = null;
      actor.vetOffset = { x: 0, y: 0 };
    }
    if (!repairing && actor.repairTargetId) {
      actor.repairTargetId = null;
      actor.repairOffset = { x: 0, y: 0 };
    }

    let from = actor.direction === 1 ? segment.from : segment.to;
    let to = actor.direction === 1 ? segment.to : segment.from;
    let x = from.x + (to.x - from.x) * actor.t;
    let y = from.y + (to.y - from.y) * actor.t;
    if (!actor.position) {
      actor.position = { x, y };
    } else if (!actor.task) {
      actor.position.x = x;
      actor.position.y = y;
    }
    if (actor.position) {
      x = actor.position.x;
      y = actor.position.y;
    }

    let skipAutoUpdate = false;
    if (sleeping && actor.restTarget) {
      if (actor.restTarget.kind === "house") {
        const house = housesById.get(actor.restTarget.id);
        if (house) {
          x = house.at.x * mapData.meta.tileSize + actor.sleepOffset.x;
          y = house.at.y * mapData.meta.tileSize + actor.sleepOffset.y;
          skipAutoUpdate = true;
        }
      } else if (actor.restTarget.kind === "inn" && innObject) {
        x = innObject.at.x * mapData.meta.tileSize + actor.sleepOffset.x;
        y = innObject.at.y * mapData.meta.tileSize + actor.sleepOffset.y;
        skipAutoUpdate = true;
      }
    } else if (eating && actor.eatTargetId) {
      const spot = foodSpotById.get(actor.eatTargetId);
      if (spot) {
        x = spot.at.x * mapData.meta.tileSize + actor.eatOffset.x;
        y = spot.at.y * mapData.meta.tileSize + actor.eatOffset.y;
        skipAutoUpdate = true;
      } else {
        actor.eatUntil = 0;
        actor.eatTargetId = null;
        actor.eatOffset = { x: 0, y: 0 };
      }
    } else if (drinking && actor.drinkTargetId) {
      const spot = drinkSpotById.get(actor.drinkTargetId);
      if (spot) {
        x = spot.at.x * mapData.meta.tileSize + actor.drinkOffset.x;
        y = spot.at.y * mapData.meta.tileSize + actor.drinkOffset.y;
        skipAutoUpdate = true;
      } else {
        actor.drinkUntil = 0;
        actor.drinkTargetId = null;
        actor.drinkOffset = { x: 0, y: 0 };
      }
    } else if (playing && actor.funTargetId) {
      const spot = funSpotById.get(actor.funTargetId);
      if (spot) {
        x = spot.at.x * mapData.meta.tileSize + actor.funOffset.x;
        y = spot.at.y * mapData.meta.tileSize + actor.funOffset.y;
        skipAutoUpdate = true;
      } else {
        actor.funUntil = 0;
        actor.funTargetId = null;
        actor.funOffset = { x: 0, y: 0 };
      }
    } else if (healing && actor.vetTargetId) {
      const spot = healthSpotById.get(actor.vetTargetId);
      if (spot) {
        x = spot.at.x * mapData.meta.tileSize + actor.vetOffset.x;
        y = spot.at.y * mapData.meta.tileSize + actor.vetOffset.y;
        skipAutoUpdate = true;
      } else {
        actor.vetUntil = 0;
        actor.vetTargetId = null;
        actor.vetOffset = { x: 0, y: 0 };
      }
    } else if (working && actor.workTargetId) {
      const spot = getSpotForLocationId(actor.workTargetId);
      if (spot) {
        x = spot.at.x * mapData.meta.tileSize + actor.workOffset.x;
        y = spot.at.y * mapData.meta.tileSize + actor.workOffset.y;
        skipAutoUpdate = true;
      } else {
        actor.workUntil = 0;
        actor.workTargetId = null;
        actor.workOffset = { x: 0, y: 0 };
      }
    } else if (repairing && actor.repairTargetId) {
      const house = housesById.get(actor.repairTargetId);
      if (house) {
        const accessPoint = getHouseTargetPoint(actor.repairTargetId);
        const repairX = accessPoint ? accessPoint.x : house.at.x * mapData.meta.tileSize;
        const repairY = accessPoint ? accessPoint.y : house.at.y * mapData.meta.tileSize;
        x = repairX + actor.repairOffset.x;
        y = repairY + actor.repairOffset.y;
        skipAutoUpdate = true;
      } else {
        actor.repairUntil = 0;
        actor.repairTargetId = null;
        actor.repairOffset = { x: 0, y: 0 };
      }
    } else if (sleeping && innObject) {
      x = innObject.at.x * mapData.meta.tileSize + actor.sleepOffset.x;
      y = innObject.at.y * mapData.meta.tileSize + actor.sleepOffset.y;
      skipAutoUpdate = true;
    }

    if (!skipAutoUpdate) {
      actor.stats.tiredness = Math.min(100, actor.stats.tiredness + delta * 0.00006);
      actor.stats.hunger = Math.min(100, actor.stats.hunger + delta * HUNGER_RATE);
      actor.stats.thirst = Math.min(100, actor.stats.thirst + delta * THIRST_RATE);
      actor.stats.boredom = Math.min(100, actor.stats.boredom + delta * BOREDOM_RATE);
      if (!healing) {
        actor.stats.health = Math.max(
          0,
          Math.min(100, actor.stats.health - delta * HEALTH_DECAY_RATE)
        );
      }

      updateActorTask(actor, { x, y }, now);

      const position = updateActorMovement(actor, delta, now, { x, y });
      x = position.x;
      y = position.y;
      actor.position = { x, y };

      handleActorActions(actor, now, { x, y }, vfxByKey, vfxVideos);

      if (!actor.task && actor.path) {
        actor.path = null;
        actor.pathIndex = 0;
        actor.pathTargetKey = null;
        actor.pathBlockedUntil = 0;
        snapActorToNearestSegment(actor, { x, y });
        from = actor.direction === 1 ? actor.segment.from : actor.segment.to;
        to = actor.direction === 1 ? actor.segment.to : actor.segment.from;
        x = actor.position.x;
        y = actor.position.y;
      }
    }

    actor.position = { x, y };
    if (previousPosition) {
      const dx = x - previousPosition.x;
      if (Math.abs(dx) > 0.5) {
        actor.facing = dx >= 0 ? 1 : -1;
      }
    }
    const moved = previousPosition
      ? Math.hypot(x - previousPosition.x, y - previousPosition.y) > 0.5
      : true;
    if (moved || !actor.lastMoveAt) {
      actor.lastMoveAt = now;
    }
    const stuckTimeout = Number.isFinite(ACTOR_STUCK_TIMEOUT)
      ? ACTOR_STUCK_TIMEOUT
      : 8000;
    if (!inAction && actor.task && actor.lastMoveAt) {
      const stuckFor = now - actor.lastMoveAt;
      if (stuckFor > stuckTimeout) {
        const preserveTask = Boolean(actor.task.manual || actor.task.urgent);
        actor.path = null;
        actor.pathIndex = 0;
        actor.pathTargetKey = null;
        actor.pathBlockedUntil = 0;
        snapActorToNearestSegment(actor, { x, y });
        if (!preserveTask) {
          actor.task = null;
        }
        actor.lastMoveAt = now;
      }
    }

  };

  return { updateActor };
};
