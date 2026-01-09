import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const readFile = (relativePath) =>
  fs.readFileSync(path.join(rootDir, relativePath), "utf8");

test("repair animation frames are wired", () => {
  const mapCore = readFile("assets/js/map/core.js");
  const actorsCore = readFile("assets/js/map/actors/core.js");

  assert.ok(
    mapCore.includes("repairFrames"),
    "Expected repairFrames in sprite assembly"
  );
  assert.ok(
    mapCore.includes("meta.animations.repair"),
    "Expected repair animation lookup in sprite assembly"
  );
  assert.ok(
    actorsCore.includes("sprite.repairFrames"),
    "Expected repair frames usage in actor render loop"
  );
});
