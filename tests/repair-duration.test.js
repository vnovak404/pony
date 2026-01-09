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

test("repair duration is 30–50 seconds", () => {
  const actorsCore = readFile("assets/js/map/actors/core.js");
  const pattern = /repairTime\s*=\s*30000\s*\+\s*Math\.random\(\)\s*\*\s*20000/;

  assert.ok(
    pattern.test(actorsCore),
    "Expected repairTime to be 30000 + Math.random() * 20000"
  );
});
