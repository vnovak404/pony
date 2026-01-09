// Pony Parade: actor creation and per-frame rendering.

export const createActors = ({
  sprites,
  roadSegments,
  mapWidth,
  runtimeState,
  maxActors,
  eatThresholdDefault,
  drinkThresholdDefault,
  funThresholdDefault,
  healthThresholdDefault,
}) => {
  const runtimePonies = runtimeState && runtimeState.ponies ? runtimeState.ponies : {};
  const getSavedState = (slug) => {
    const saved = runtimePonies[slug];
    if (!saved || typeof saved !== "object") return null;
    return saved;
  };
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const shuffledSprites = sprites.slice();
  for (let i = shuffledSprites.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledSprites[i], shuffledSprites[j]] = [shuffledSprites[j], shuffledSprites[i]];
  }
  const limitedSprites = shuffledSprites.slice(0, maxActors);

  const actors = limitedSprites.map((sprite, index) => {
    const savedState = getSavedState(sprite.pony.slug);
    const savedSegmentId = savedState ? savedState.segmentId : null;
    const savedSegment =
      savedSegmentId && roadSegments.length
        ? roadSegments.find((segment) => segment.id === savedSegmentId)
        : null;
    const segment =
      savedSegment ||
      (roadSegments.length > 0
        ? roadSegments[index % roadSegments.length]
        : { from: { x: 0, y: 0 }, to: { x: mapWidth, y: 0 } });
    const baseSpeed = sprite.moveType === "trot" ? 0.3 : 0.1;
    const startSpeed = baseSpeed + Math.random() * baseSpeed;
    const baseStats = sprite.pony.stats || {};
    const savedStats = savedState && savedState.stats ? savedState.stats : {};
    const driveEat =
      sprite.pony.drives && sprite.pony.drives.eat ? sprite.pony.drives.eat : {};
    const driveDrink =
      sprite.pony.drives && sprite.pony.drives.drink ? sprite.pony.drives.drink : {};
    const driveHealth =
      sprite.pony.drives && sprite.pony.drives.health ? sprite.pony.drives.health : {};
    const eatThreshold = Number.isFinite(driveEat.threshold)
      ? driveEat.threshold
      : eatThresholdDefault;
    const drinkThreshold = Number.isFinite(driveDrink.threshold)
      ? driveDrink.threshold
      : drinkThresholdDefault;
    const savedDirection =
      savedState && (savedState.direction === 1 || savedState.direction === -1)
        ? savedState.direction
        : null;
    const savedT =
      savedState && Number.isFinite(savedState.t)
        ? clamp(savedState.t, 0, 1)
        : null;
    const driveFun =
      sprite.pony.drives && sprite.pony.drives.fun ? sprite.pony.drives.fun : {};
    const funThreshold = Number.isFinite(driveFun.threshold)
      ? driveFun.threshold
      : funThresholdDefault;
    const healthThreshold = Number.isFinite(driveHealth.threshold)
      ? driveHealth.threshold
      : healthThresholdDefault;
    const actorStats = {
      health: Number.isFinite(savedStats.health)
        ? savedStats.health
        : Number.isFinite(baseStats.health)
          ? baseStats.health
          : 92,
      hunger: Number.isFinite(savedStats.hunger)
        ? savedStats.hunger
        : Number.isFinite(baseStats.hunger)
          ? baseStats.hunger
          : 28,
      thirst: Number.isFinite(savedStats.thirst)
        ? savedStats.thirst
        : Number.isFinite(baseStats.thirst)
          ? baseStats.thirst
          : 20,
      boredom: Number.isFinite(savedStats.boredom)
        ? savedStats.boredom
        : Number.isFinite(baseStats.boredom)
          ? baseStats.boredom
          : 24,
      tiredness: Number.isFinite(savedStats.tiredness)
        ? savedStats.tiredness
        : Number.isFinite(baseStats.tiredness)
          ? baseStats.tiredness
          : 35,
    };
    return {
      sprite,
      segment,
      t: savedT !== null ? savedT : Math.random(),
      baseSpeed: startSpeed,
      speed: startSpeed,
      direction: savedDirection !== null ? savedDirection : Math.random() > 0.5 ? 1 : -1,
      facing: savedDirection !== null ? savedDirection : 1,
      position: null,
      path: null,
      pathIndex: 0,
      pathTargetKey: null,
      pathBlockedUntil: 0,
      frameIndex: Math.floor(Math.random() * sprite.moveFrames.length),
      lastFrame: 0,
      sleepUntil: 0,
      sleepOffset: { x: 0, y: 0 },
      sleepSpotIndex: null,
      innCooldownUntil: 0,
      bounds: null,
      stats: actorStats,
      homeId: sprite.pony.house ? sprite.pony.house.id : null,
      restTarget: null,
      sleepSpotOwner: null,
      homeCooldownUntil: 0,
      task: null,
      repairUntil: 0,
      repairTargetId: null,
      repairOffset: { x: 0, y: 0 },
      eatUntil: 0,
      eatTargetId: null,
      eatOffset: { x: 0, y: 0 },
      eatCooldownUntil: 0,
      eatThreshold,
      foodPreference: driveEat.preference || null,
      drinkUntil: 0,
      drinkTargetId: null,
      drinkOffset: { x: 0, y: 0 },
      drinkCooldownUntil: 0,
      drinkThreshold,
      drinkPreference: driveDrink.preference || null,
      funUntil: 0,
      funTargetId: null,
      funOffset: { x: 0, y: 0 },
      funCooldownUntil: 0,
      funThreshold,
      vetUntil: 0,
      vetTargetId: null,
      vetOffset: { x: 0, y: 0 },
      vetCooldownUntil: 0,
      healthThreshold,
    };
  });

  return { actors, limitedSprites };
};

export const createActorRenderer = (context) => {
  const {
    ctx,
    mapData,
    ASSET_SCALE,
    actors,
    statusIcons,
    getScale,
    getLastPointer,
    isLabelsEnabled,
    resolveTaskLabel,
    releaseInnSpot,
    releaseHouseSpot,
    claimInnSpot,
    claimHouseSpot,
    innSleepSpots,
    housesById,
    houseStates,
    innObject,
    foodSpotById,
    drinkSpotById,
    funSpotById,
    healthSpotById,
    foodSpots,
    drinkSpots,
    funSpots,
    healthSpots,
    getHouseTargetPoint,
    getFoodSpotAccessPoint,
    getDrinkSpotAccessPoint,
    getFunSpotAccessPoint,
    getHealthSpotAccessPoint,
    getSpotOffset,
    findRepairTarget,
    getCriticalNeedTask,
    pickNeedCandidate,
    pickFoodSpot,
    pickDrinkSpot,
    pickFunSpot,
    pickHealthSpot,
    getTaskTargetPoint,
    snapActorToNearestSegment,
    findNearestRoadTile,
    buildTilePath,
    tileKey,
    advanceAlongPath,
    isOffMap,
    endpointIndex,
    endpointKey,
    pickNextSegment,
    roadSegments,
    vfxByKey,
    vfxVideos,
    VFX_REGISTRY,
    setVideoActive,
    drawVideoOverlay,
    lakePoint,
    lakeSplashRadius,
    EAT_THRESHOLD_DEFAULT,
    DRINK_THRESHOLD_DEFAULT,
    BOREDOM_THRESHOLD_DEFAULT,
    HUNGER_RATE,
    THIRST_RATE,
    BOREDOM_RATE,
    HEALTH_DECAY_RATE,
    HEALTH_THRESHOLD_DEFAULT,
    EAT_RADIUS_TILES,
    EAT_DURATION_MIN,
    EAT_DURATION_MAX,
    EAT_COOLDOWN_MIN,
    EAT_COOLDOWN_MAX,
    DRINK_RADIUS_TILES,
    DRINK_DURATION_MIN,
    DRINK_DURATION_MAX,
    DRINK_COOLDOWN_MIN,
    DRINK_COOLDOWN_MAX,
    FUN_RADIUS_TILES,
    FUN_DURATION_MIN,
    FUN_DURATION_MAX,
    FUN_COOLDOWN_MIN,
    FUN_COOLDOWN_MAX,
    VET_RADIUS_TILES,
    VET_DURATION_MIN,
    VET_DURATION_MAX,
    VET_COOLDOWN_MIN,
    VET_COOLDOWN_MAX,
    MANUAL_SPEED_MULTIPLIER,
  } = context;

  const drawActors = (delta, now) => {
    const scale = getScale();
    const lastPointer = getLastPointer();
    const labelsEnabled = isLabelsEnabled();
    actors.forEach((actor) => {
      const { sprite, segment } = actor;
      const previousPosition = actor.position
        ? { x: actor.position.x, y: actor.position.y }
        : null;
      const meta = sprite.meta;
      const frames = meta.frames;
      const anchor = Object.values(frames)[0]?.anchor || { x: 256, y: 480 };
      const sleeping = actor.sleepUntil > now;
      const eating = actor.eatUntil > now;
      const drinking = actor.drinkUntil > now;
      const playing = actor.funUntil > now;
      const healing = actor.vetUntil > now;
      const repairing = actor.repairUntil > now;
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
      if (!healing && actor.vetTargetId) {
        actor.vetTargetId = null;
        actor.vetOffset = { x: 0, y: 0 };
      }
      if (!repairing && actor.repairTargetId) {
        actor.repairTargetId = null;
        actor.repairOffset = { x: 0, y: 0 };
      }
      const rushTask = actor.task && (actor.task.manual || actor.task.urgent);
      const rushMoveType =
        rushTask && meta.animations.trot ? "trot" : sprite.moveType;
      const moveFrames = meta.animations[rushMoveType] || sprite.moveFrames;
      const frameNames = sleeping
        ? sprite.sleepFrames
        : eating
          ? sprite.eatFrames || sprite.idleFrames
          : drinking
            ? sprite.drinkFrames || sprite.idleFrames
            : healing
              ? sprite.vetFrames || sprite.idleFrames
              : repairing
                ? sprite.repairFrames || sprite.idleFrames
                : playing
                  ? sprite.idleFrames
                  : moveFrames;
      const fps = sleeping
        ? meta.fps.sleep || meta.fps.idle || 2
        : eating
          ? meta.fps.eat || meta.fps.idle || 2
          : drinking
            ? meta.fps.drink || meta.fps.idle || 2
            : healing
              ? meta.fps.vet || meta.fps.idle || 2
              : repairing || playing
                ? meta.fps.idle || 2
                : meta.fps[rushMoveType] || 6;
      actor.lastFrame += delta;
      const frameDuration = 1000 / fps;
      if (actor.lastFrame >= frameDuration) {
        actor.frameIndex = (actor.frameIndex + 1) % frameNames.length;
        actor.lastFrame = 0;
      }
      if (actor.frameIndex >= frameNames.length) {
        actor.frameIndex = 0;
      }

      const frameEntry = frames[frameNames[actor.frameIndex]];
      const frame = frameEntry?.frame;
      if (!frame) return;
      const sheetIndex = Number.isFinite(frameEntry.sheet) ? frameEntry.sheet : 0;
      const sheetImage = sprite.sheets
        ? sprite.sheets[sheetIndex] || sprite.sheets[0]
        : sprite.sheet;
      if (!sheetImage) return;

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
      let startedEating = false;
      let startedDrinking = false;
      let startedFun = false;
      let startedHealing = false;
      let startedRepairing = false;

      if (sleeping && actor.restTarget) {
        if (actor.restTarget.kind === "house") {
          const house = housesById.get(actor.restTarget.id);
          if (house) {
            x = house.at.x * mapData.meta.tileSize + actor.sleepOffset.x;
            y = house.at.y * mapData.meta.tileSize + actor.sleepOffset.y;
          }
        } else if (actor.restTarget.kind === "inn" && innObject) {
          x = innObject.at.x * mapData.meta.tileSize + actor.sleepOffset.x;
          y = innObject.at.y * mapData.meta.tileSize + actor.sleepOffset.y;
        }
      } else if (eating && actor.eatTargetId) {
        const spot = foodSpotById.get(actor.eatTargetId);
        if (spot) {
          x = spot.at.x * mapData.meta.tileSize + actor.eatOffset.x;
          y = spot.at.y * mapData.meta.tileSize + actor.eatOffset.y;
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
        } else {
          actor.vetUntil = 0;
          actor.vetTargetId = null;
          actor.vetOffset = { x: 0, y: 0 };
        }
      } else if (repairing && actor.repairTargetId) {
        const house = housesById.get(actor.repairTargetId);
        if (house) {
          const accessPoint = getHouseTargetPoint(actor.repairTargetId);
          const repairX = accessPoint ? accessPoint.x : house.at.x * mapData.meta.tileSize;
          const repairY = accessPoint ? accessPoint.y : house.at.y * mapData.meta.tileSize;
          x = repairX + actor.repairOffset.x;
          y = repairY + actor.repairOffset.y;
        } else {
          actor.repairUntil = 0;
          actor.repairTargetId = null;
          actor.repairOffset = { x: 0, y: 0 };
        }
      } else if (sleeping && innObject) {
        x = innObject.at.x * mapData.meta.tileSize + actor.sleepOffset.x;
        y = innObject.at.y * mapData.meta.tileSize + actor.sleepOffset.y;
      } else {
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

        const ponySlug = (sprite.pony.slug || "").toLowerCase();
        const isBuilder = ponySlug === "taticorn";
        const eatThreshold = Number.isFinite(actor.eatThreshold)
          ? actor.eatThreshold
          : EAT_THRESHOLD_DEFAULT;
        const drinkThreshold = Number.isFinite(actor.drinkThreshold)
          ? actor.drinkThreshold
          : DRINK_THRESHOLD_DEFAULT;
        const healthThreshold = Number.isFinite(actor.healthThreshold)
          ? actor.healthThreshold
          : HEALTH_THRESHOLD_DEFAULT;
        const hasManualTask = actor.task && actor.task.manual;
        const hasUrgentTask = actor.task && actor.task.urgent;
        if (!hasManualTask && !hasUrgentTask) {
          const urgentTask = getCriticalNeedTask(actor, { x, y });
          if (urgentTask) {
            actor.task = urgentTask;
          }
        }
        const hasActiveTask = Boolean(actor.task);
        if (!hasActiveTask) {
          const canEat = foodSpots.length > 0 && now > actor.eatCooldownUntil;
          const canDrink = drinkSpots.length > 0 && now > actor.drinkCooldownUntil;
          const canFun = funSpots.length > 0 && now > actor.funCooldownUntil;
          const canHeal = healthSpots.length > 0 && now > actor.vetCooldownUntil;
          const candidates = [];
          const healthLevel = Number.isFinite(actor.stats.health)
            ? actor.stats.health
            : 100;
          if (canHeal && healthLevel <= healthThreshold) {
            const target = pickHealthSpot(actor, { x, y });
            if (target) {
              const healthNeed = Math.max(0, 100 - healthLevel) + 20;
              candidates.push({
                need: "health",
                level: healthNeed,
                task: { type: "vet", clinicId: target.id },
              });
            }
          }
          if (canEat && actor.stats.hunger >= eatThreshold) {
            const target = pickFoodSpot(actor, { x, y });
            if (target) {
              candidates.push({
                need: "hunger",
                level: actor.stats.hunger,
                task: { type: "eat", foodId: target.id },
              });
            }
          }
          if (canDrink && actor.stats.thirst >= drinkThreshold) {
            const target = pickDrinkSpot(actor, { x, y });
            if (target) {
              candidates.push({
                need: "thirst",
                level: actor.stats.thirst,
                task: { type: "drink", drinkId: target.id },
              });
            }
          }
          if (actor.stats.tiredness > 60 && actor.homeId && housesById.has(actor.homeId)) {
            candidates.push({
              need: "tired",
              level: actor.stats.tiredness,
              task: { type: "rest", houseId: actor.homeId },
            });
          }
          const boredomThreshold = Number.isFinite(actor.funThreshold)
            ? actor.funThreshold
            : BOREDOM_THRESHOLD_DEFAULT;
          if (canFun && actor.stats.boredom >= boredomThreshold) {
            const target = pickFunSpot(actor, { x, y });
            if (target) {
              candidates.push({
                need: "boredom",
                level: actor.stats.boredom,
                task: { type: "fun", funId: target.id },
              });
            }
          }
          const chosenNeed = pickNeedCandidate(candidates);
          if (chosenNeed) {
            actor.task = chosenNeed.task;
          } else if (isBuilder) {
            const target = findRepairTarget();
            if (target) {
              actor.task = { type: "repair", houseId: target.id };
            }
          }
        }

        if (actor.task && actor.task.type === "rest" && actor.task.houseId) {
          const state = houseStates.get(actor.task.houseId);
          if (
            actor.task.type === "rest" &&
            (!state ||
              state.status === "repairing" ||
              state.status === "desperately_needs_repair" ||
              state.status === "under_construction")
          ) {
            actor.task = null;
          }
        }
        if (actor.task && actor.task.type === "rest" && actor.task.inn && !innObject) {
          actor.task = null;
        }
        if (actor.task && actor.task.type === "eat") {
          const spot = foodSpotById.get(actor.task.foodId);
          if (!spot) {
            actor.task = null;
          }
        }
        if (actor.task && actor.task.type === "drink") {
          const spot = drinkSpotById.get(actor.task.drinkId);
          if (!spot) {
            actor.task = null;
          }
        }
        if (actor.task && actor.task.type === "fun") {
          const spot = funSpotById.get(actor.task.funId);
          if (!spot) {
            actor.task = null;
          }
        }
        if (actor.task && actor.task.type === "vet") {
          const spot = healthSpotById.get(actor.task.clinicId);
          if (!spot) {
            actor.task = null;
          }
        }
        const targetPoint = getTaskTargetPoint(actor);
        const hasRushTask = actor.task && (actor.task.manual || actor.task.urgent);
        actor.speed = hasRushTask
          ? actor.baseSpeed * MANUAL_SPEED_MULTIPLIER
          : actor.baseSpeed;
        const shouldPath = Boolean(actor.task && targetPoint);
        if (shouldPath && now > actor.pathBlockedUntil) {
          const targetTile = findNearestRoadTile(targetPoint);
          const targetKey = targetTile ? tileKey(targetTile.x, targetTile.y) : null;
          const pathExpired =
            !actor.path ||
            actor.pathIndex >= actor.path.length ||
            actor.pathTargetKey !== targetKey;
          if (targetKey && pathExpired) {
            const startPoint = actor.position ? actor.position : { x, y };
            if (!actor.position) {
              actor.position = { x: startPoint.x, y: startPoint.y };
            }
            const path = buildTilePath(startPoint, targetPoint);
            if (path && path.length) {
              actor.path = path;
              actor.pathIndex = 0;
              actor.pathTargetKey = targetKey;
              while (
                actor.pathIndex < actor.path.length &&
                Math.hypot(
                  actor.path[actor.pathIndex].x - startPoint.x,
                  actor.path[actor.pathIndex].y - startPoint.y
                ) < 4
              ) {
                actor.pathIndex += 1;
              }
            } else {
              actor.path = null;
              actor.pathIndex = 0;
              actor.pathTargetKey = null;
              actor.pathBlockedUntil = now + 2000;
            }
          }
        }
        if (!shouldPath) {
          actor.path = null;
          actor.pathIndex = 0;
          actor.pathTargetKey = null;
        }

        let heading = null;
        const hasPath = actor.task && actor.path && actor.path.length;
        if (hasPath) {
          if (actor.pathIndex < actor.path.length) {
            const before = actor.position
              ? { x: actor.position.x, y: actor.position.y }
              : { x, y };
            heading = advanceAlongPath(actor, delta);
            x = actor.position.x;
            y = actor.position.y;
            if (heading && heading.to) {
              const dx = heading.to.x - before.x;
              if (Math.abs(dx) > 1) {
                actor.facing = dx >= 0 ? 1 : -1;
              }
              from = before;
              to = heading.to;
            }
          } else if (actor.position) {
            x = actor.position.x;
            y = actor.position.y;
          }
        } else {
          const distance = Math.hypot(to.x - from.x, to.y - from.y);
          actor.t += (actor.speed * delta) / Math.max(distance, 1);
          if (actor.t >= 1) {
            actor.t = 0;
            if (isOffMap(to)) {
              actor.segment =
                roadSegments[Math.floor(Math.random() * roadSegments.length)] || segment;
              actor.direction = Math.random() > 0.5 ? 1 : -1;
            } else {
              const key = endpointKey(to);
              const options = endpointIndex.get(key) || [];
              const nextOptions = options.filter((item) => item.segment !== segment);
              const choicePool = nextOptions.length ? nextOptions : options;
              const preferTarget = Boolean(actor.task && targetPoint);
              const next = pickNextSegment(choicePool, targetPoint, preferTarget);
              if (next) {
                actor.segment = next.segment;
                actor.direction = next.end === "from" ? 1 : -1;
              } else {
                actor.direction *= -1;
              }
            }
          }
          from = actor.direction === 1 ? actor.segment.from : actor.segment.to;
          to = actor.direction === 1 ? actor.segment.to : actor.segment.from;
          x = from.x + (to.x - from.x) * actor.t;
          y = from.y + (to.y - from.y) * actor.t;
          actor.position = { x, y };
          actor.facing = actor.direction;
        }

        if (actor.task && actor.task.type === "eat") {
          const spot = foodSpotById.get(actor.task.foodId);
          if (spot) {
            const accessPoint = getFoodSpotAccessPoint(spot);
            const foodX = accessPoint.x;
            const foodY = accessPoint.y;
            const distToFood = Math.hypot(x - foodX, y - foodY);
            const eatRadiusTiles = spot.eatRadius || EAT_RADIUS_TILES;
            const eatRadius = mapData.meta.tileSize * eatRadiusTiles;
            if (distToFood < eatRadius && now > actor.eatCooldownUntil) {
              let eatDuration =
                EAT_DURATION_MIN + Math.random() * (EAT_DURATION_MAX - EAT_DURATION_MIN);
              const vfxEntry = vfxByKey.get(`${sprite.pony.slug}:eat`);
              const vfxVideo = vfxEntry ? vfxVideos.get(vfxEntry.id) : null;
              if (vfxVideo && Number.isFinite(vfxVideo.duration) && vfxVideo.duration > 0) {
                eatDuration = vfxVideo.duration * 1000;
              }
              actor.eatUntil = now + eatDuration;
              actor.eatCooldownUntil =
                actor.eatUntil +
                EAT_COOLDOWN_MIN +
                Math.random() * (EAT_COOLDOWN_MAX - EAT_COOLDOWN_MIN);
              actor.eatTargetId = spot.id;
              actor.eatOffset = {
                x: (Math.random() - 0.5) * mapData.meta.tileSize * 0.2,
                y: (Math.random() - 0.5) * mapData.meta.tileSize * 0.2,
              };
              actor.frameIndex = 0;
              actor.lastFrame = 0;
              actor.stats.hunger = 0;
              actor.task = null;
              startedEating = true;
            }
          }
        }

        if (actor.task && actor.task.type === "drink") {
          const spot = drinkSpotById.get(actor.task.drinkId);
          if (spot) {
            const accessPoint = getDrinkSpotAccessPoint(spot);
            const drinkX = accessPoint.x;
            const drinkY = accessPoint.y;
            const distToDrink = Math.hypot(x - drinkX, y - drinkY);
            const drinkRadiusTiles = spot.drinkRadius || DRINK_RADIUS_TILES;
            const drinkRadius = mapData.meta.tileSize * drinkRadiusTiles;
            if (distToDrink < drinkRadius && now > actor.drinkCooldownUntil) {
              const drinkDuration =
                DRINK_DURATION_MIN +
                Math.random() * (DRINK_DURATION_MAX - DRINK_DURATION_MIN);
              actor.drinkUntil = now + drinkDuration;
              actor.drinkCooldownUntil =
                actor.drinkUntil +
                DRINK_COOLDOWN_MIN +
                Math.random() * (DRINK_COOLDOWN_MAX - DRINK_COOLDOWN_MIN);
              actor.drinkTargetId = spot.id;
              actor.drinkOffset = {
                x: (Math.random() - 0.5) * mapData.meta.tileSize * 0.2,
                y: (Math.random() - 0.5) * mapData.meta.tileSize * 0.2,
              };
              actor.frameIndex = 0;
              actor.lastFrame = 0;
              actor.stats.thirst = 0;
              actor.task = null;
              startedDrinking = true;
            }
          }
        }

        if (actor.task && actor.task.type === "fun") {
          const spot = funSpotById.get(actor.task.funId);
          if (spot) {
            const accessPoint = getFunSpotAccessPoint(spot);
            const funX = accessPoint.x;
            const funY = accessPoint.y;
            const distToFun = Math.hypot(x - funX, y - funY);
            const funRadiusTiles = spot.funRadius || FUN_RADIUS_TILES;
            const funRadius = mapData.meta.tileSize * funRadiusTiles;
            if (distToFun < funRadius && now > actor.funCooldownUntil) {
              const baseOffset = getSpotOffset(spot, "funOffset");
              const funDuration =
                FUN_DURATION_MIN + Math.random() * (FUN_DURATION_MAX - FUN_DURATION_MIN);
              actor.funUntil = now + funDuration;
              actor.funCooldownUntil =
                actor.funUntil +
                FUN_COOLDOWN_MIN +
                Math.random() * (FUN_COOLDOWN_MAX - FUN_COOLDOWN_MIN);
              actor.funTargetId = spot.id;
              actor.funOffset = {
                x: baseOffset.x + (Math.random() - 0.5) * mapData.meta.tileSize * 0.2,
                y: baseOffset.y + (Math.random() - 0.5) * mapData.meta.tileSize * 0.2,
              };
              actor.frameIndex = 0;
              actor.lastFrame = 0;
              actor.stats.boredom = 0;
              actor.task = null;
              startedFun = true;
            }
          }
        }

        if (actor.task && actor.task.type === "vet") {
          const spot = healthSpotById.get(actor.task.clinicId);
          if (spot) {
            const accessPoint = getHealthSpotAccessPoint(spot);
            const healthX = accessPoint.x;
            const healthY = accessPoint.y;
            const distToClinic = Math.hypot(x - healthX, y - healthY);
            const vetRadiusTiles = spot.vetRadius || VET_RADIUS_TILES;
            const vetRadius = mapData.meta.tileSize * vetRadiusTiles;
            if (distToClinic < vetRadius && now > actor.vetCooldownUntil) {
              const vetDuration =
                VET_DURATION_MIN + Math.random() * (VET_DURATION_MAX - VET_DURATION_MIN);
              actor.vetUntil = now + vetDuration;
              actor.vetCooldownUntil =
                actor.vetUntil +
                VET_COOLDOWN_MIN +
                Math.random() * (VET_COOLDOWN_MAX - VET_COOLDOWN_MIN);
              actor.vetTargetId = spot.id;
              actor.vetOffset = {
                x: (Math.random() - 0.5) * mapData.meta.tileSize * 0.2,
                y: (Math.random() - 0.5) * mapData.meta.tileSize * 0.2,
              };
              actor.frameIndex = 0;
              actor.lastFrame = 0;
              actor.stats.health = Math.min(100, actor.stats.health + 28);
              actor.task = null;
              startedHealing = true;
            }
          }
        }

        const skipAutoRest =
          actor.task &&
          (actor.task.manual || actor.task.urgent) &&
          actor.task.type !== "rest";
        if (
          innObject &&
          !startedEating &&
          !startedDrinking &&
          !startedFun &&
          !startedHealing &&
          !startedRepairing &&
          !skipAutoRest
        ) {
          const innX = innObject.at.x * mapData.meta.tileSize;
          const innY = innObject.at.y * mapData.meta.tileSize;
          const distToInn = Math.hypot(x - innX, y - innY);
          const sleepRadiusTiles = innObject.sleepRadius || 0.6;
          const sleepRadius = mapData.meta.tileSize * sleepRadiusTiles;
          const forceRestAtInn =
            actor.task && actor.task.type === "rest" && actor.task.inn;
          if (distToInn < sleepRadius && now > actor.innCooldownUntil) {
            const tirednessLevel = Number.isFinite(actor.stats.tiredness)
              ? actor.stats.tiredness
              : 35;
            const restChance = forceRestAtInn
              ? 1
              : Math.min(0.9, Math.max(0.15, tirednessLevel / 100));
            if (!forceRestAtInn && Math.random() > restChance) {
              actor.innCooldownUntil = now + 2000 + Math.random() * 2000;
            } else {
              const homeState = actor.homeId ? houseStates.get(actor.homeId) : null;
              const canRestAtHome =
                actor.homeId &&
                housesById.has(actor.homeId) &&
                homeState &&
                homeState.status !== "repairing" &&
                homeState.status !== "desperately_needs_repair" &&
                homeState.status !== "under_construction";
              if (!forceRestAtInn && canRestAtHome && Math.random() < 0.9) {
                actor.innCooldownUntil = now + 2000 + Math.random() * 2000;
              } else {
                const spotIndex = claimInnSpot();
                if (spotIndex !== null) {
                  const napTime = 2000 + Math.random() * 3000;
                  actor.sleepSpotIndex = spotIndex;
                  actor.sleepOffset = innSleepSpots[spotIndex];
                  actor.sleepSpotOwner = { kind: "inn", id: "inn" };
                  actor.restTarget = { kind: "inn", id: "inn" };
                  actor.sleepUntil = now + napTime;
                  actor.innCooldownUntil =
                    actor.sleepUntil + 8000 + Math.random() * 4000;
                  actor.frameIndex = 0;
                  actor.lastFrame = 0;
                  actor.stats.tiredness = 0;
                  if (forceRestAtInn) {
                    actor.task = null;
                  }
                } else {
                  actor.innCooldownUntil = now + 3000 + Math.random() * 2000;
                }
              }
            }
          }
        }

        const skipHomeRest =
          actor.task &&
          (actor.task.manual || actor.task.urgent) &&
          actor.task.type === "rest" &&
          actor.task.inn;
        if (
          actor.homeId &&
          !startedEating &&
          !startedDrinking &&
          !startedFun &&
          !startedHealing &&
          !startedRepairing &&
          !skipAutoRest &&
          !skipHomeRest
        ) {
          const house = housesById.get(actor.homeId);
          const state = house ? houseStates.get(actor.homeId) : null;
          if (house && state) {
            const accessPoint = getHouseTargetPoint(actor.homeId);
            const homeX = accessPoint ? accessPoint.x : house.at.x * mapData.meta.tileSize;
            const homeY = accessPoint ? accessPoint.y : house.at.y * mapData.meta.tileSize;
            const distToHome = Math.hypot(x - homeX, y - homeY);
            const restRadiusTiles = house.restRadius || 0.9;
            const restRadius = mapData.meta.tileSize * restRadiusTiles;
            if (
              distToHome < restRadius &&
              now > actor.homeCooldownUntil &&
              state.status !== "repairing" &&
              state.status !== "desperately_needs_repair" &&
              state.status !== "under_construction"
            ) {
              const spot = claimHouseSpot(actor.homeId);
              if (spot) {
                const napTime = 2500 + Math.random() * 3500;
                actor.sleepSpotIndex = spot.index;
                actor.sleepOffset = spot.offset;
                actor.sleepSpotOwner = { kind: "house", id: actor.homeId };
                actor.restTarget = { kind: "house", id: actor.homeId };
                actor.sleepUntil = now + napTime;
                actor.homeCooldownUntil = actor.sleepUntil + 9000 + Math.random() * 5000;
                actor.frameIndex = 0;
                actor.lastFrame = 0;
                actor.stats.health = Math.min(100, actor.stats.health + 6);
                actor.stats.tiredness = 0;
                if (actor.task && actor.task.type === "rest") {
                  actor.task = null;
                }
              } else {
                actor.homeCooldownUntil = now + 2500 + Math.random() * 2000;
              }
            }
          }
        }

        if (actor.task && actor.task.type === "repair") {
          const house = housesById.get(actor.task.houseId);
          const state = house ? houseStates.get(actor.task.houseId) : null;
          if (house && state && state.status !== "repairing") {
            const accessPoint = getHouseTargetPoint(actor.task.houseId);
            const homeX = accessPoint ? accessPoint.x : house.at.x * mapData.meta.tileSize;
            const homeY = accessPoint ? accessPoint.y : house.at.y * mapData.meta.tileSize;
            const distToHome = Math.hypot(x - homeX, y - homeY);
            const repairRadius = mapData.meta.tileSize * 0.6;
            if (distToHome < repairRadius) {
            const repairTime = 30000 + Math.random() * 20000;
              state.status = "repairing";
              state.repairingUntil = now + repairTime;
              state.repairingBy = actor;
              actor.repairUntil = state.repairingUntil;
              actor.repairTargetId = actor.task.houseId;
              actor.repairOffset = {
                x: (Math.random() - 0.5) * mapData.meta.tileSize * 0.1,
                y: (Math.random() - 0.5) * mapData.meta.tileSize * 0.1,
              };
              actor.frameIndex = 0;
              actor.lastFrame = 0;
              actor.task = null;
              startedRepairing = true;
            }
          }
        }

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

      const frameScale = (mapData.meta.tileSize * scale * ASSET_SCALE) / frame.w;
      const destX = x * scale - anchor.x * frameScale;
      const destY = y * scale - anchor.y * frameScale;
      const drawW = frame.w * frameScale;
      const drawH = frame.h * frameScale;
      const directionFlip = actor.facing === -1;
      const flip = directionFlip !== Boolean(sprite.pony.sprite_flip);

      if (flip) {
        ctx.save();
        ctx.translate(destX + drawW, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(
          sheetImage,
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
      } else {
        ctx.drawImage(
          sheetImage,
          frame.x,
          frame.y,
          frame.w,
          frame.h,
          destX,
          destY,
          drawW,
          drawH
        );
      }

      VFX_REGISTRY.forEach((entry) => {
        if (entry.pony !== sprite.pony.slug) {
          return;
        }
        const video = vfxVideos.get(entry.id);
        if (!video) return;
        let shouldPlay = false;
        if (entry.trigger === "eat") {
          shouldPlay = eating;
        } else if (entry.trigger === "lake") {
          shouldPlay =
            !sleeping &&
            !eating &&
            lakePoint &&
            Math.hypot(x - lakePoint.x, y - lakePoint.y) < lakeSplashRadius;
        } else if (entry.trigger === "sleep") {
          shouldPlay = sleeping;
        }
        setVideoActive(entry, video, shouldPlay);
        if (!shouldPlay) return;
        if (entry.anchor === "lake" && lakePoint) {
          drawVideoOverlay(video, entry, lakePoint.x, lakePoint.y);
        } else {
          drawVideoOverlay(video, entry, x, y);
        }
      });

      actor.bounds = {
        x: destX - 6,
        y: destY - 6,
        width: drawW + 12,
        height: drawH + 12,
      };

      const ponySlug = (sprite.pony.slug || "").toLowerCase();
      const isHovered =
        lastPointer &&
        lastPointer.x >= actor.bounds.x &&
        lastPointer.x <= actor.bounds.x + actor.bounds.width &&
        lastPointer.y >= actor.bounds.y &&
        lastPointer.y <= actor.bounds.y + actor.bounds.height;
      const showLabel =
        labelsEnabled && (Boolean(sprite.pony.label_always_on) || isHovered);
      if (showLabel) {
        const labelName = sprite.pony.name || "Pony";
        const jobTitle = (sprite.pony.job && sprite.pony.job.title) || "helper";
        const stats = actor.stats || {};
        const health = Number.isFinite(stats.health) ? Math.round(stats.health) : 92;
        const thirst = Number.isFinite(stats.thirst) ? Math.round(stats.thirst) : 20;
        const hunger = Number.isFinite(stats.hunger) ? Math.round(stats.hunger) : 28;
        const tiredness = Number.isFinite(stats.tiredness) ? Math.round(stats.tiredness) : 35;
        const boredom = Number.isFinite(stats.boredom) ? Math.round(stats.boredom) : 24;
        const fontSize = Math.max(11, Math.round(12 * scale * ASSET_SCALE));
        ctx.font = `${fontSize}px "Nunito", sans-serif`;
        const iconSize = Math.round(fontSize * 1.35);
        const lineHeight = Math.max(fontSize + 6, iconSize + 6);
        const labelX = Math.round(x * scale);
        const labelY = Math.round(destY - 8);
        const paddingX = 12;
        const paddingY = 8;
        const iconGap = Math.max(4, Math.round(fontSize * 0.3));
        const groupGap = Math.max(10, Math.round(fontSize * 0.8));
        const jobLabel = jobTitle ? `${jobTitle} ·` : "";
        const jobWidth = jobLabel ? ctx.measureText(jobLabel).width : 0;
        const statItems = [
          { key: "health", value: health, label: "H" },
          { key: "thirst", value: thirst, label: "Th" },
          { key: "hunger", value: hunger, label: "Hu" },
          { key: "tiredness", value: tiredness, label: "T" },
          { key: "boredom", value: boredom, label: "B" },
        ];
        const statRuns = statItems.map((item) => {
          const icon = statusIcons[item.key] || null;
          const valueText = String(item.value);
          const labelText = icon ? "" : `${item.label}:`;
          const labelWidth = labelText ? ctx.measureText(labelText).width : 0;
          const valueWidth = ctx.measureText(valueText).width;
          const width = (icon ? iconSize : labelWidth) + iconGap + valueWidth;
          return {
            icon,
            labelText,
            labelWidth,
            valueText,
            valueWidth,
            width,
          };
        });
        let statsLineWidth = jobWidth;
        if (jobLabel) {
          statsLineWidth += groupGap;
        }
        statRuns.forEach((run, index) => {
          statsLineWidth += run.width;
          if (index < statRuns.length - 1) {
            statsLineWidth += groupGap;
          }
        });
        const showHeading = isHovered;
        const headingText = showHeading ? resolveTaskLabel(actor, now) : "";
        const headingWidth = headingText ? ctx.measureText(headingText).width : 0;
        const nameWidth = ctx.measureText(labelName).width;
        const boxWidth =
          Math.max(nameWidth, statsLineWidth, headingWidth) + paddingX * 2;
        const lineCount = showHeading ? 3 : 2;
        const boxHeight = lineHeight * lineCount + paddingY * 2 - 4;
        const labelThemes = {
          stellacorn: {
            textPrimary: "#ffe27a",
            textSecondary: "#fff2b8",
            box: "rgba(44, 32, 10, 0.75)",
          },
          "blue-wonder": {
            textPrimary: "#9fd6ff",
            textSecondary: "#cde9ff",
            box: "rgba(12, 24, 40, 0.75)",
          },
          "raging-torrent": {
            textPrimary: "#b7f59a",
            textSecondary: "#dcffd1",
            box: "rgba(16, 36, 18, 0.75)",
          },
        };
        const theme = labelThemes[ponySlug] || {
          textPrimary: "#fff7d6",
          textSecondary: "#f1e9ff",
          box: "rgba(20, 16, 28, 0.7)",
        };
        const boxLeft = Math.round(labelX - boxWidth / 2);
        const boxTop = Math.round(labelY - boxHeight);
        ctx.fillStyle = theme.box;
        ctx.fillRect(boxLeft, boxTop, boxWidth, boxHeight);
        ctx.fillStyle = theme.textPrimary;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const nameY = Math.round(boxTop + paddingY);
        ctx.fillText(labelName, labelX, nameY);
        ctx.fillStyle = theme.textSecondary;
        ctx.textAlign = "left";
        const statsY = Math.round(nameY + lineHeight);
        const textY = Math.round(statsY + (lineHeight - fontSize) / 2);
        const iconY = Math.round(statsY + (lineHeight - iconSize) / 2);
        let cursorX = labelX - statsLineWidth / 2;
        if (jobLabel) {
          ctx.fillText(jobLabel, Math.round(cursorX), textY);
          cursorX += jobWidth + groupGap;
        }
        statRuns.forEach((run, index) => {
          if (run.icon) {
            ctx.drawImage(run.icon, Math.round(cursorX), iconY, iconSize, iconSize);
            cursorX += iconSize + iconGap;
          } else {
            ctx.fillText(run.labelText, Math.round(cursorX), textY);
            cursorX += run.labelWidth + iconGap;
          }
          ctx.fillText(run.valueText, Math.round(cursorX), textY);
          cursorX += run.valueWidth;
          if (index < statRuns.length - 1) {
            cursorX += groupGap;
          }
        });
        if (showHeading) {
          ctx.fillStyle = theme.textSecondary;
          ctx.textAlign = "center";
          const headingY = Math.round(nameY + lineHeight * 2);
          ctx.fillText(headingText, labelX, headingY);
        }
      }
    });
  };

  return { drawActors };
};
