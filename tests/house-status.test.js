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

test("house status uses desperately_needs_repair and Ruined label", () => {
  const mapCore = readFile("assets/js/map/core.js");

  assert.ok(
    mapCore.includes('state.status = "desperately_needs_repair"'),
    "Expected desperately_needs_repair status assignment"
  );
  assert.ok(
    mapCore.includes('return "Ruined"'),
    "Expected Ruined label in formatHouseStatus"
  );
});

test("needs_repair renders ruined image", () => {
  const draw = readFile("assets/js/map/draw.js");

  assert.ok(
    draw.includes('state.status === "needs_repair"'),
    "Expected needs_repair branch in draw code"
  );
  assert.ok(
    draw.includes("spriteEntry.ruined"),
    "Expected ruined sprite fallback for needs_repair"
  );
});
