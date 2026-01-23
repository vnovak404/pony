import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

test("asset generation dry run writes manifest and preview", () => {
  const tempRoot = fs.mkdtempSync(path.join(rootDir, "data/_generated/asset-gen-"));
  const manifestPath = path.join(tempRoot, "manifest.json");
  const libraryRoot = path.join(tempRoot, "library");
  const generatedRoot = path.join(tempRoot, "generated");
  try {
    fs.mkdirSync(libraryRoot, { recursive: true });
    fs.mkdirSync(generatedRoot, { recursive: true });
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({ schema_version: 2, generated_at: "test", assets: [] }, null, 2),
      "utf8"
    );

    const payload = {
      provider: "openai",
      type: "tile",
      title: "Test Tile",
      prompt: "Test tile prompt",
      system: "adventure_map",
      stage: "generated",
      dry_run: true
    };

    const script = [
      "import json, sys",
      "sys.path.insert(0, 'scripts')",
      "from pony_server.asset_generation import generate_asset",
      "payload = json.loads(sys.argv[1])",
      "asset = generate_asset(payload, manifest_path=sys.argv[2], library_root=sys.argv[3], generated_root=sys.argv[4])",
      "print(asset['id'])",
    ].join("\n");

    const result = spawnSync(
      "python3",
      ["-c", script, JSON.stringify(payload), manifestPath, libraryRoot, generatedRoot],
      { encoding: "utf8" }
    );
    assert.equal(result.status, 0, result.stderr);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    assert.equal(manifest.assets.length, 1);
    const asset = manifest.assets[0];
    assert.equal(asset.type, "tile");
    assert.equal(asset.prompt, payload.prompt);
    assert.ok(asset.preview);

    const previewPath = path.resolve(rootDir, asset.preview.replace(/^\//, ""));
    assert.ok(fs.existsSync(previewPath), `Expected preview file at ${previewPath}`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
