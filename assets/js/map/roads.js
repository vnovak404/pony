// Pony Parade: road network helpers.

import { createPathfinder } from "./pathfinding.js";

export const createRoadNetwork = ({ mapData, roads, mapWidth, mapHeight }) => {
  const roadSegments = roads.map((segment) => {
    const from = {
      x: segment.from.x * mapData.meta.tileSize,
      y: segment.from.y * mapData.meta.tileSize,
    };
    const to = {
      x: segment.to.x * mapData.meta.tileSize,
      y: segment.to.y * mapData.meta.tileSize,
    };
    return {
      id: segment.id,
      from,
      to,
      length: Math.hypot(to.x - from.x, to.y - from.y),
    };
  });

  const { tileKey, findNearestRoadTile, buildTilePath, advanceAlongPath } =
    createPathfinder({
      roads,
      tileSize: mapData.meta.tileSize,
      width: mapData.meta.width,
      height: mapData.meta.height,
    });

  const endpointKey = (point) => `${point.x},${point.y}`;
  const endpointIndex = new Map();
  const addEndpoint = (point, segment, end) => {
    const key = endpointKey(point);
    if (!endpointIndex.has(key)) {
      endpointIndex.set(key, []);
    }
    endpointIndex.get(key).push({ segment, end });
  };

  roadSegments.forEach((segment) => {
    addEndpoint(segment.from, segment, "from");
    addEndpoint(segment.to, segment, "to");
  });

  const isOffMap = (point) =>
    point.x < 0 || point.x > mapWidth || point.y < 0 || point.y > mapHeight;

  const PROMENADE_PREFIX = "loop-";
  const pickNextSegment = (choices, targetPoint, preferTarget) => {
    if (!choices.length) return null;
    if (targetPoint) {
      const scored = choices
        .map((choice) => {
          const endPoint = nearestPointOnSegment(targetPoint, choice.segment);
          return {
            choice,
            distance: Math.hypot(
              endPoint.x - targetPoint.x,
              endPoint.y - targetPoint.y
            ),
          };
        })
        .sort((a, b) => a.distance - b.distance);
      const pickFrom = scored
        .slice(0, Math.min(2, scored.length))
        .map((item) => item.choice);
      if (pickFrom.length && preferTarget) {
        return pickFrom[0];
      }
      if (pickFrom.length && Math.random() < 0.75) {
        return pickFrom[Math.floor(Math.random() * pickFrom.length)];
      }
    }
    const promenade = choices.filter((item) =>
      String(item.segment.id || "").startsWith(PROMENADE_PREFIX)
    );
    if (promenade.length && Math.random() < 0.7) {
      return promenade[Math.floor(Math.random() * promenade.length)];
    }
    return choices[Math.floor(Math.random() * choices.length)];
  };

  function nearestPointOnSegment(point, segment) {
    const dx = segment.to.x - segment.from.x;
    const dy = segment.to.y - segment.from.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) {
      return { x: segment.from.x, y: segment.from.y };
    }
    const t =
      ((point.x - segment.from.x) * dx + (point.y - segment.from.y) * dy) /
      lengthSquared;
    const clamped = Math.max(0, Math.min(1, t));
    return {
      x: segment.from.x + dx * clamped,
      y: segment.from.y + dy * clamped,
    };
  }

  const projectPointOnSegment = (point, segment) => {
    const dx = segment.to.x - segment.from.x;
    const dy = segment.to.y - segment.from.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) {
      return { t: 0, point: { x: segment.from.x, y: segment.from.y } };
    }
    const t =
      ((point.x - segment.from.x) * dx + (point.y - segment.from.y) * dy) /
      lengthSquared;
    const clamped = Math.max(0, Math.min(1, t));
    return {
      t: clamped,
      point: {
        x: segment.from.x + dx * clamped,
        y: segment.from.y + dy * clamped,
      },
    };
  };

  const findNearestSegmentToPoint = (point) => {
    if (!point || !roadSegments.length) return null;
    let best = null;
    roadSegments.forEach((segment) => {
      const projection = projectPointOnSegment(point, segment);
      const distance = Math.hypot(
        projection.point.x - point.x,
        projection.point.y - point.y
      );
      if (!best || distance < best.distance) {
        best = {
          segment,
          point: projection.point,
          distance,
          t: projection.t,
        };
      }
    });
    return best;
  };

  const snapActorToNearestSegment = (actor, point) => {
    if (!actor || !point) return;
    const nearest = findNearestSegmentToPoint(point);
    if (!nearest) return;
    actor.segment = nearest.segment;
    if (actor.direction !== 1 && actor.direction !== -1) {
      actor.direction = actor.facing === -1 ? -1 : 1;
    }
    const baseT = nearest.t ?? 0;
    actor.t = actor.direction === 1 ? baseT : 1 - baseT;
    actor.position = { x: nearest.point.x, y: nearest.point.y };
  };

  const computeAccessPoint = (target) => {
    if (!roadSegments.length) {
      return target;
    }
    let bestPoint = null;
    let bestDistance = Infinity;
    roadSegments.forEach((segment) => {
      const point = nearestPointOnSegment(target, segment);
      const distance = Math.hypot(point.x - target.x, point.y - target.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestPoint = point;
      }
    });
    return bestPoint || target;
  };

  return {
    roadSegments,
    tileKey,
    findNearestRoadTile,
    buildTilePath,
    advanceAlongPath,
    endpointIndex,
    endpointKey,
    isOffMap,
    pickNextSegment,
    computeAccessPoint,
    findNearestSegmentToPoint,
    snapActorToNearestSegment,
  };
};
