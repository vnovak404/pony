// Pony Parade: actor movement and pathing.

export const createMovementHandler = (context) => {
  const {
    getTaskTargetPoint,
    findNearestRoadTile,
    buildTilePath,
    tileKey,
    advanceAlongPath,
    isOffMap,
    endpointIndex,
    endpointKey,
    pickNextSegment,
    roadSegments,
    MANUAL_SPEED_MULTIPLIER,
  } = context;

  const updateActorMovement = (actor, delta, now, currentPosition) => {
    if (!actor || !actor.segment) return currentPosition;
    let from = actor.direction === 1 ? actor.segment.from : actor.segment.to;
    let to = actor.direction === 1 ? actor.segment.to : actor.segment.from;
    let x = currentPosition.x;
    let y = currentPosition.y;

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
          const lastPoint = path[path.length - 1];
          if (
            lastPoint &&
            Math.hypot(lastPoint.x - targetPoint.x, lastPoint.y - targetPoint.y) >
              0.1
          ) {
            path.push({ x: targetPoint.x, y: targetPoint.y });
          }
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
            roadSegments[Math.floor(Math.random() * roadSegments.length)] ||
            actor.segment;
          actor.direction = Math.random() > 0.5 ? 1 : -1;
        } else {
          const key = endpointKey(to);
          const options = endpointIndex.get(key) || [];
          const nextOptions = options.filter((item) => item.segment !== actor.segment);
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

    return { x, y };
  };

  return { updateActorMovement };
};
