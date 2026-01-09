import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const moduleUrl = pathToFileURL(
  path.join(rootDir, "assets/js/map/pathfinding.js")
).href;

test("buildTilePath returns a connected path along a road", async () => {
  const { createPathfinder } = await import(moduleUrl);
  const finder = createPathfinder({
    roads: [{ from: { x: 0, y: 0 }, to: { x: 4, y: 0 } }],
    tileSize: 1,
    width: 6,
    height: 3,
  });

  const pathPoints = finder.buildTilePath({ x: 0, y: 0 }, { x: 4, y: 0 });
  assert.ok(Array.isArray(pathPoints), "Expected a path array");
  assert.ok(pathPoints.length >= 2, "Expected multiple path points");
  assert.deepEqual(pathPoints[0], { x: 0, y: 0 });
  assert.deepEqual(pathPoints[pathPoints.length - 1], { x: 4, y: 0 });

  for (let i = 1; i < pathPoints.length; i += 1) {
    const prev = pathPoints[i - 1];
    const next = pathPoints[i];
    const step = Math.hypot(next.x - prev.x, next.y - prev.y);
    assert.ok(step <= Math.SQRT2 + 1e-6, "Path steps stay adjacent");
  }
});

test("buildTilePath returns null for disconnected roads", async () => {
  const { createPathfinder } = await import(moduleUrl);
  const finder = createPathfinder({
    roads: [
      { from: { x: 0, y: 0 }, to: { x: 2, y: 0 } },
      { from: { x: 10, y: 0 }, to: { x: 12, y: 0 } },
    ],
    tileSize: 1,
    width: 14,
    height: 3,
  });

  const pathPoints = finder.buildTilePath({ x: 0, y: 0 }, { x: 12, y: 0 });
  assert.equal(pathPoints, null);
});

test("advanceAlongPath moves an actor along the path", async () => {
  const { createPathfinder } = await import(moduleUrl);
  const finder = createPathfinder({
    roads: [],
    tileSize: 1,
    width: 1,
    height: 1,
  });
  const actor = {
    path: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
    pathIndex: 0,
    speed: 0.01,
    position: null,
  };

  const heading = finder.advanceAlongPath(actor, 1000);
  assert.deepEqual(actor.position, { x: 10, y: 0 });
  assert.equal(actor.pathIndex, 2);
  assert.ok(heading, "Expected a heading result");
});
