import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const readFile = (relativePath) =>
  fs.readFileSync(path.join(rootDir, relativePath), "utf8");

test("dev tools deck lists core tools", () => {
  const html = readFile("tools/dev-tools/index.html");
  const toolNames = [
    "Adventure Designer",
    "Map Refinement",
    "Asset Forge",
    "World Director",
    "Instance Map Editor",
    "Mission Builder"
  ];
  toolNames.forEach((name) => {
    assert.ok(html.includes(name), `Expected tool card for ${name}`);
  });
});

test("dev tools deck reflects procedural refinement copy", () => {
  const html = readFile("tools/dev-tools/index.html");
  assert.ok(html.includes("Procedural Refinement"));
});

test("adventure designer entrypoint exists", () => {
  assert.ok(fs.existsSync(path.join(rootDir, "tools/adventure-designer/index.html")));
  assert.ok(fs.existsSync(path.join(rootDir, "tools/adventure-designer/src/app.js")));
});

test("asset forge entrypoint exists", () => {
  assert.ok(fs.existsSync(path.join(rootDir, "tools/asset-forge/index.html")));
  assert.ok(fs.existsSync(path.join(rootDir, "tools/asset-forge/app.js")));
});

test("asset forge generation panel lists providers", () => {
  const html = readFile("tools/asset-forge/index.html");
  assert.ok(html.includes("generate-provider"));
  assert.ok(html.includes("OpenAI (configured)"));
  assert.ok(html.includes('value="xai" disabled'));
  assert.ok(html.includes('value="nano-banana" disabled'));
  assert.ok(html.includes('value="retrodiffusion" disabled'));
});

test("map refinement is wired to the programmatic refiner", () => {
  const handler = readFile("scripts/pony_server/handler.py");
  assert.ok(handler.includes("refine_map("), "Expected refine_map call in handler");
  assert.equal(handler.includes("openai_client"), false);
  assert.ok(fs.existsSync(path.join(rootDir, "scripts/pony_server/map_refine.py")));
});

test("asset generation endpoint is wired in the server", () => {
  const handler = readFile("scripts/pony_server/handler.py");
  assert.ok(handler.includes("/api/assets/generate"));
});

test("dev tools deck links to adventure designer and asset forge", () => {
  const html = readFile("tools/dev-tools/index.html");
  assert.ok(html.includes("../adventure-designer/index.html"));
  assert.ok(html.includes("../asset-forge/index.html"));
});
