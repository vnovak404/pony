import assert from "node:assert/strict";
import test from "node:test";

import { applyRefinedMap } from "../tools/adventure-designer/src/refine.js";

function createContext(mapOverrides = {}) {
  const map = {
    width: 2,
    height: 2,
    tiles: [0, 0, 0, 0],
    notes: [],
    seed: "seed",
    ...mapOverrides
  };
  return {
    store: {
      getState() {
        return map;
      }
    },
    tilesByName: {
      grass: { id: 0 },
      water: { id: 1 },
      beach: { id: 2 },
      rock: { id: 3 },
      mountain: { id: 4 }
    },
    tilesById: {
      0: { id: 0, name: "grass" },
      1: { id: 1, name: "water" },
      2: { id: 2, name: "beach" },
      3: { id: 3, name: "rock" },
      4: { id: 4, name: "mountain" }
    },
    objectsByType: {}
  };
}

test("applyRefinedMap adds beach tiles on riverbanks", () => {
  const context = createContext();
  const refined = {
    base_resolution: [2, 2],
    target_resolution: [2, 2],
    layers: {
      terrain: ["wg", "gg"],
      water: null,
      roads: null,
      elevation: null
    },
    decor_rules: []
  };

  const result = applyRefinedMap(context, refined);

  assert.deepEqual(result.tiles, [1, 2, 2, 0]);
});

test("applyRefinedMap uses rock on rocky riverbanks", () => {
  const context = createContext();
  const refined = {
    base_resolution: [2, 2],
    target_resolution: [2, 2],
    layers: {
      terrain: ["mw", "gg"],
      water: null,
      roads: null,
      elevation: null
    },
    decor_rules: []
  };

  const result = applyRefinedMap(context, refined);

  assert.deepEqual(result.tiles, [3, 1, 0, 2]);
});
