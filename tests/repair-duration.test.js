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
  const actionsWork = readFile("assets/js/map/actors/actions-work.js");
  const minPattern = /const\s+minRepair\s*=\s*Number\.isFinite\(REPAIR_DURATION_MIN\)\s*\?\s*REPAIR_DURATION_MIN\s*:\s*30000/;
  const maxPattern = /const\s+maxRepair\s*=\s*Number\.isFinite\(REPAIR_DURATION_MAX\)\s*\?\s*REPAIR_DURATION_MAX\s*:\s*50000/;
  const repairPattern = /const\s+repairTime\s*=\s*minRepair\s*\+\s*Math\.random\(\)\s*\*\s*Math\.max\(0,\s*maxRepair\s*-\s*minRepair\)/;

  assert.ok(
    minPattern.test(actionsWork),
    "Expected repair min fallback to 30000"
  );
  assert.ok(
    maxPattern.test(actionsWork),
    "Expected repair max fallback to 50000"
  );
  assert.ok(
    repairPattern.test(actionsWork),
    "Expected repairTime calculation from min/max"
  );
});
