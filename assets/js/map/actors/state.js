// Pony Parade: actor state creation.

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
      jobLocationId:
        sprite.pony.job && sprite.pony.job.locationId
          ? sprite.pony.job.locationId
          : null,
      segment,
      t: savedT !== null ? savedT : Math.random(),
      baseSpeed: startSpeed,
      speed: startSpeed,
      direction: savedDirection !== null ? savedDirection : Math.random() > 0.5 ? 1 : -1,
      facing: savedDirection !== null ? savedDirection : 1,
      position: null,
      lastMoveAt: 0,
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
      workUntil: 0,
      workTargetId: null,
      workOffset: { x: 0, y: 0 },
      workCooldownUntil: 0,
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
