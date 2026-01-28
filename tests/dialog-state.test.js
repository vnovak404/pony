import assert from "node:assert/strict";
import { test } from "node:test";

import {
  evaluateConditions,
  applyFlagUpdates,
  markTalkedTo,
  seedFirstTimeFlags,
} from "../assets/js/stellacorn/adventure/dialog_state.js";

function createState() {
  return {
    localFlags: new Map(),
    globalFlags: new Map(),
    talkedTo: new Set(),
    events: new Map(),
  };
}

test("evaluateConditions respects local and global flags", () => {
  const state = createState();
  state.localFlags.set("badger_healed", true);
  state.globalFlags.set("forest_cleansed", false);

  assert.equal(
    evaluateConditions([{ type: "flag", flag: "badger_healed", value: true }], state),
    true
  );
  assert.equal(
    evaluateConditions([{ type: "flag", scope: "global", flag: "forest_cleansed", value: true }], state),
    false
  );
});

test("first_time conditions use talkedTo state", () => {
  const state = createState();
  seedFirstTimeFlags(["owl_01"], state);
  assert.equal(
    evaluateConditions([{ type: "first_time", targetId: "owl_01" }], state),
    true
  );
  markTalkedTo("owl_01", state);
  assert.equal(
    evaluateConditions([{ type: "first_time", targetId: "owl_01" }], state),
    false
  );
});

test("first_time_speaking conditions honor first_time_speaking_to flags", () => {
  const state = createState();
  seedFirstTimeFlags(["badger_02"], state);
  assert.equal(
    evaluateConditions([{ type: "first_time_speaking", targetId: "badger_02" }], state),
    true
  );
  state.localFlags.set("first_time_speaking_to_badger_02", false);
  assert.equal(
    evaluateConditions([{ type: "first_time_speaking_to", target: "badger_02" }], state),
    false
  );
});

test("applyFlagUpdates writes values", () => {
  const state = createState();
  applyFlagUpdates([{ flag: "found_trail", value: true }], state);
  applyFlagUpdates([{ scope: "global", flag: "met_queen", value: true }], state);
  assert.equal(state.localFlags.get("found_trail"), true);
  assert.equal(state.globalFlags.get("met_queen"), true);
});
