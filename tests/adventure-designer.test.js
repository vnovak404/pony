import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ensureSketchLayer,
  generateTilesFromSketch,
  initSketchPalette,
  prettifyTiles
} from "../tools/adventure-designer/src/sketch.js";

function createContext({ width = 3, height = 3, tiles = null, sketchTiles } = {}) {
  const map = {
    width,
    height,
    tiles: tiles ?? new Array(width * height).fill(0)
  };
  if (sketchTiles !== undefined) {
    map.sketchTiles = sketchTiles;
  }

  const context = {
    store: {
      getState() {
        return map;
      }
    },
    state: {
      brushSize: 1,
      selectedSketchId: null
    },
    tilesByName: {
      grass: { id: 0 },
      forest: { id: 1 },
      water: { id: 2 },
      mountain: { id: 3 },
      village: { id: 4 },
      "plains-dirt": { id: 5 },
      "forest-border": { id: 6 },
      "forest-canopy": { id: 7 }
    },
    sketchPaletteById: {}
  };

  initSketchPalette(context);
  return context;
}

test("ensureSketchLayer seeds sketch tiles", () => {
  const context = createContext({ width: 2, height: 2 });
  const map = context.store.getState();
  assert.equal(map.sketchTiles, undefined);

  ensureSketchLayer(context);

  assert.equal(map.sketchTiles.length, 4);
  assert.equal(map.sketchTiles.every((entry) => entry === "grass"), true);
});

test("generateTilesFromSketch maps sketch ids to tile ids", () => {
  const context = createContext({
    width: 2,
    height: 1,
    tiles: [0, 0],
    sketchTiles: ["forest", "water"]
  });

  const result = generateTilesFromSketch(context);
  const map = context.store.getState();

  assert.equal(result.changed, 2);
  assert.deepEqual(map.tiles, [1, 2]);
});

test("prettifyTiles applies forest border and canopy", () => {
  const context = createContext({ width: 3, height: 3, tiles: new Array(9).fill(1) });
  const result = prettifyTiles(context);
  const map = context.store.getState();

  assert.equal(result.changed, 9);
  assert.deepEqual(map.tiles, [
    6, 6, 6,
    6, 7, 6,
    6, 6, 6
  ]);
});
