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

test("repair command wiring exists", () => {
  const indexHtml = readFile("index.html");
  const mapCore = readFile("assets/js/map/core.js");

  assert.ok(
    indexHtml.includes('data-command="repair"'),
    "Expected repair button in index.html"
  );
  assert.ok(
    mapCore.includes('command === "repair"'),
    "Expected repair command handler in map core"
  );
  assert.ok(
    mapCore.includes("taticorn"),
    "Expected repair handler to gate on Taticorn"
  );
  assert.ok(
    mapCore.includes('type: "repair", houseId: target.id, manual: true'),
    "Expected repair task assignment"
  );
});
