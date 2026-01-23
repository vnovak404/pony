import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createEmptyMap, normalizeImportedMap } from "../tools/adventure-designer/src/io.js";
import { formatNoteLabel, normalizeNotes } from "../tools/adventure-designer/src/notes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const readFile = (relativePath) =>
  fs.readFileSync(path.join(rootDir, relativePath), "utf8");

test("createEmptyMap seeds notes array", () => {
  const map = createEmptyMap();
  assert.ok(Array.isArray(map.notes), "Expected notes array on empty map");
  assert.equal(map.notes.length, 0);
});

test("createEmptyMap seeds refinement slot", () => {
  const map = createEmptyMap();
  assert.equal(map.refinement, null);
});

test("normalizeImportedMap keeps notes payload", () => {
  const data = {
    id: "test-map",
    width: 2,
    height: 2,
    tiles: [0, 0, 0, 0],
    notes: [{ id: "note-1", x: 1, y: 0, w: 2, h: 1, text: "House" }]
  };
  const map = normalizeImportedMap(data);
  assert.ok(map);
  assert.equal(map.notes.length, 1);
  assert.equal(map.notes[0].text, "House");
});

test("normalizeNotes sanitizes entries", () => {
  const notes = normalizeNotes([null, { x: "a", y: 2 }]);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].x, 0);
  assert.equal(notes[0].y, 2);
  assert.ok(notes[0].w >= 1);
  assert.ok(notes[0].h >= 1);
});

test("formatNoteLabel includes coordinates and size", () => {
  const label = formatNoteLabel({ x: 3, y: 4, w: 2, h: 1, text: "Inn" });
  assert.equal(label, "(3, 4) 2x1 - Inn");
});

test("refine request posts notes payload", () => {
  const refine = readFile("tools/adventure-designer/src/refine.js");
  assert.ok(refine.includes("/api/map/refine"), "Expected refine API call");
  assert.ok(refine.includes("notes"), "Expected notes payload in refine request");
});
