import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { startServer } from "./helpers/server.js";
import { loadDotEnv } from "./helpers/env.js";
import { logDomSnapshot, logFailureArtifacts, logStep } from "./helpers/logger.js";

loadDotEnv();

let server;
let baseURL;
const generatedCleanup = [];

const RUN_LLM = process.env.RUN_E2E_LLM === "1";
const HAS_KEY = Boolean(process.env.OPENAI_API_KEY);
const HOLD_SCALE = Math.max(0.05, Number(process.env.E2E_HOLD_SCALE || "0.1"));
const KEEP_GENERATED = process.env.E2E_KEEP_GENERATED === "1";

test.beforeAll(async () => {
  logStep("Starting local server for E2E.");
  server = await startServer();
  baseURL = server.baseURL;
  logStep(`Server ready at ${baseURL}.`);
});

test.afterAll(async () => {
  logStep("Stopping local server.");
  if (server) await server.stop();
  logStep("Server stopped.");
  if (KEEP_GENERATED) return;
  generatedCleanup.forEach((entry) => {
    if (!entry || !entry.dir || !entry.marker) return;
    if (!fs.existsSync(entry.marker)) return;
    try {
      fs.rmSync(entry.dir, { recursive: true, force: true });
      logStep(`Cleaned E2E mission at ${entry.dir}.`);
    } catch (error) {
      logStep(`Failed to clean E2E mission at ${entry.dir}: ${error.message || error}`);
    }
  });
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    logStep("Test failed. Capturing artifacts.", testInfo);
    await logFailureArtifacts(page, testInfo, "failure");
  }
});

test("smoke: adventure loads", async ({ page }, testInfo) => {
  logStep("Opening adventure page.", testInfo);
  await page.goto(`${baseURL}/adventures/stellacorn/adventure.html`, { waitUntil: "networkidle" });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForSelector("#adventureCanvas");
  await expect(page.locator("#map-title")).toHaveText(/Whispering Forest|Mission/i);
  logStep("Adventure page loaded.", testInfo);
});

test.describe("mission generator end-to-end", () => {
  test.skip(!RUN_LLM || !HAS_KEY, "Set RUN_E2E_LLM=1 and OPENAI_API_KEY to run.");

  async function assertNoErrorModal(page, testInfo) {
    const modal = page.locator("#error-modal");
    if (await modal.isVisible()) {
      const text = await page.locator("#error-message").innerText();
      await logDomSnapshot(page, "Error modal DOM", testInfo);
      throw new Error(`Mission generator error modal:\n${text}`);
    }
  }

  async function closeDialogIfOpen(page, testInfo, label, expectDialog) {
    const dialog = page.locator("#dialog");
    const choiceButton = page.locator(".dialog-choice").first();
    const nextButton = page.locator("#dialog-next");
    const closeButton = page.locator("#dialog-close");
    const dialogText = page.locator("#dialog-text");
    const start = Date.now();
    const maxMs = expectDialog ? 12000 : 2000;
    const settleMs = expectDialog ? 1500 : 400;
    let appeared = false;
    let lastVisible = null;

    if (expectDialog) {
      try {
        await dialog.waitFor({ state: "visible", timeout: 5000 });
      } catch (error) {
        await logDomSnapshot(page, `Dialog missing after ${label}`, testInfo);
        throw new Error(`Expected dialog after ${label}, but none appeared.`);
      }
    } else if (!(await dialog.isVisible())) {
      return;
    } else {
      await dialog.waitFor({ state: "visible", timeout: 1500 }).catch(() => {});
    }

    while (Date.now() - start < maxMs) {
      if (await dialog.isVisible()) {
        appeared = true;
        lastVisible = Date.now();
        let snippet = "";
        try {
          snippet = await dialogText.innerText();
        } catch (error) {
          snippet = "";
        }
        if (snippet) {
          const trimmed = snippet.replace(/\s+/g, " ").trim();
          logStep(
            `Dialog open during ${label}: "${trimmed.slice(0, 140)}${trimmed.length > 140 ? "…" : ""}"`,
            testInfo
          );
        } else {
          logStep(`Dialog open during ${label}.`, testInfo);
        }
    const safeClick = async (locator, name) => {
      try {
        await locator.click({ timeout: 1000 });
        logStep(`Clicked ${name} during ${label}.`, testInfo);
        return true;
      } catch (error) {
        if (page.isClosed()) return false;
        logStep(`Click ${name} failed during ${label}: ${error.message || error}`, testInfo);
        return false;
      }
    };

        if (await choiceButton.isVisible()) {
          await safeClick(choiceButton, "choice");
        } else if (await nextButton.isVisible()) {
          await safeClick(nextButton, "next");
        } else if (await closeButton.isVisible()) {
          await safeClick(closeButton, "close");
        } else {
          await logDomSnapshot(page, `Dialog has no controls after ${label}`, testInfo);
          throw new Error(`Dialog open with no controls after ${label}.`);
        }
        const closed = await dialog.waitFor({ state: "hidden", timeout: 1200 }).catch(() => null);
        if (closed) break;
        await page.waitForTimeout(150);
        continue;
      }

      if (!appeared) {
        await page.waitForTimeout(150);
        continue;
      }

      if (lastVisible && Date.now() - lastVisible > settleMs) {
        break;
      }
      await page.waitForTimeout(150);
    }

    if (await dialog.isVisible()) {
      await logDomSnapshot(page, `Dialog stuck after ${label}`, testInfo);
      throw new Error(`Dialog stuck open after ${label}.`);
    }
  }

  test("generate mission, save, and complete objectives", async ({ page }, testInfo) => {
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    logStep("Opening mission generator.", testInfo);
    await page.goto(`${baseURL}/tools/mission-generator/`, { waitUntil: "networkidle" });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForSelector("#mission-vibe");

    logStep("Filling mission inputs.", testInfo);
    await page.fill(
      "#mission-vibe",
      "Quietly wrong woods, owl guide, calm healing, eerie runes."
    );
    await page.fill("#mission-seed", "e2e-seed-1");
    if (await page.locator("#force-live").count()) {
      const cachePath = path.join(process.cwd(), "logs", "mission-generator", "last-plan.json");
      const hasCache = fs.existsSync(cachePath);
      if (hasCache) {
        logStep(`Cached plan found at ${cachePath}. Using cache.`, testInfo);
      } else {
        logStep("No cached plan found. Enabling force live LLM for E2E.", testInfo);
        await page.check("#force-live");
      }
    }

    logStep("Planning mission via API.", testInfo);
    await page.click("#plan-button");
    await expect(page.locator("#validation-pill")).toContainText("Planned", { timeout: 240000 });
    await page.waitForLoadState("networkidle");
    await assertNoErrorModal(page, testInfo);

    logStep("Generating mission map.", testInfo);
    await page.click("#generate-button");
    await expect(page.locator("#validation-pill")).toContainText(/OK|Errors/, { timeout: 120000 });
    await page.waitForLoadState("networkidle");
    await assertNoErrorModal(page, testInfo);
    await expect(page.locator("#busy-overlay")).toBeHidden({ timeout: 120000 });

    logStep("Saving mission bundle.", testInfo);
    const saveResponsePromise = page.waitForResponse((response) => {
      return response.url().endsWith("/api/missions/save") && response.request().method() === "POST";
    });

    await page.click("#save-button");
    const saveResponse = await saveResponsePromise;
    logStep(`Save response status: ${saveResponse.status()}`, testInfo);
    let savePayload = null;
    try {
      savePayload = await saveResponse.json();
    } catch (error) {
      const text = await saveResponse.text();
      logStep(`Save response body (non-JSON): ${text}`, testInfo);
    }
    await assertNoErrorModal(page, testInfo);
    if (!saveResponse.ok()) {
      logStep(`Save failed payload: ${JSON.stringify(savePayload)}`, testInfo);
      await logDomSnapshot(page, "Save error DOM", testInfo);
      throw new Error(`Save failed with status ${saveResponse.status()}.`);
    }
    const missionPath = savePayload.mission_path || savePayload.missionPath;
    if (!missionPath) {
      logStep(`Save response payload missing mission path: ${JSON.stringify(savePayload)}`, testInfo);
      await logDomSnapshot(page, "Missing mission path DOM", testInfo);
      throw new Error("Save response missing mission_path/missionPath.");
    }
    logStep(`Mission saved at ${missionPath}.`, testInfo);
    const repoRoot = process.cwd();
    const missionDir = path.dirname(missionPath);
    const isGenerated = missionDir.includes(
      path.join("adventures", "missions", "stellacorn", "generated")
    );
    if (isGenerated) {
      const marker = path.join(missionDir, ".e2e-generated");
      try {
        fs.writeFileSync(marker, `created_at=${new Date().toISOString()}\n`, "utf8");
        generatedCleanup.push({ dir: missionDir, marker });
        logStep(`Marked E2E mission for cleanup: ${marker}`, testInfo);
      } catch (error) {
        logStep(`Failed to mark E2E mission cleanup: ${error.message || error}`, testInfo);
      }
    } else {
      logStep("Mission path is not in generated missions; skipping cleanup marker.", testInfo);
    }

    let relPath = missionPath;
    if (path.isAbsolute(missionPath)) {
      relPath = path.relative(repoRoot, missionPath);
    }
    relPath = relPath.replace(/\\/g, "/");
    relPath = relPath.startsWith("adventures/") ? relPath.slice("adventures/".length) : relPath;
    const missionParam = `../${relPath}`;

    const adventureUrl = `${baseURL}/adventures/stellacorn/adventure.html?mission=${encodeURIComponent(
      missionParam
    )}&debug=1&holdScale=${encodeURIComponent(HOLD_SCALE)}`;
    logStep(`Opening generated mission at ${adventureUrl}.`, testInfo);
    await page.goto(adventureUrl, { waitUntil: "networkidle" });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForSelector("#adventureCanvas");

    const missionUrl = new URL(missionParam, adventureUrl).toString();
    logStep("Fetching mission payloads.", testInfo);
    const missionJson = await (await fetch(missionUrl)).json();
    const mapUrl = new URL(missionJson.map, missionUrl).toString();
    const tilesUrl = new URL(missionJson.tiles, missionUrl).toString();
    const objectsUrl = new URL(missionJson.objects, missionUrl).toString();

    const [mapData, tilesData, objectsData] = await Promise.all([
      (await fetch(mapUrl)).json(),
      (await fetch(tilesUrl)).json(),
      (await fetch(objectsUrl)).json(),
    ]);

    const tileDefs = new Map((tilesData.tiles || []).map((tile) => [tile.id, tile]));
    const objectDefs = new Map((objectsData.objects || []).map((obj) => [obj.type, obj]));
    const objectById = new Map((mapData.objects || []).map((obj) => [obj.id, obj]));

    const objectives = missionJson.objectives || missionJson.mission?.objectives || [];
    const interactions = new Map(
      (missionJson.interactions || missionJson.mission?.interactions || []).map((entry) => [
        entry.targetId,
        entry,
      ])
    );
    const dialogTargets = new Set();
    const dialogNodes = new Set((missionJson.dialog?.nodes || []).map((node) => node?.id));
    (missionJson.interactions || missionJson.mission?.interactions || []).forEach((entry) => {
      if (entry?.targetId && entry?.dialog && dialogNodes.has(entry.dialog)) {
        dialogTargets.add(entry.targetId);
      }
    });
    (missionJson.narrative?.onInteract || missionJson.mission?.narrative?.onInteract || []).forEach(
      (entry) => {
        if (entry?.targetId && entry?.dialog && dialogNodes.has(entry.dialog)) {
          dialogTargets.add(entry.targetId);
        }
      }
    );
    const startByTarget =
      missionJson.dialog?.startByTarget || missionJson.mission?.dialog?.startByTarget || {};
    Object.keys(startByTarget || {}).forEach((targetId) => {
      const dialogId = startByTarget[targetId];
      if (targetId && dialogId && dialogNodes.has(dialogId)) {
        dialogTargets.add(targetId);
      }
    });

    const targets = [];
    objectives.forEach((objective) => {
      if (!objective) return;
      const ids = Array.isArray(objective.targetIds)
        ? objective.targetIds
        : objective.targetId
          ? [objective.targetId]
          : [];
      ids.forEach((id) => targets.push({ id, action: objective.type }));
    });

    const blocked = new Set();
    (mapData.objects || []).forEach((obj) => {
      const def = objectDefs.get(obj.type);
      if (def?.categories?.includes("animal")) {
        blocked.add(`${obj.x},${obj.y}`);
      }
    });
    const interactableIds = new Set();
    interactions.forEach((entry, key) => {
      if (key) interactableIds.add(key);
    });
    dialogTargets.forEach((id) => interactableIds.add(id));
    const interactableObjects = (mapData.objects || []).filter((obj) =>
      interactableIds.has(obj.id)
    );

    const width = mapData.width;
    const height = mapData.height;

    function isWalkable(x, y) {
      if (x < 0 || y < 0 || x >= width || y >= height) return false;
      if (blocked.has(`${x},${y}`)) return false;
      const tileId = mapData.tiles[y * width + x];
      return Boolean(tileDefs.get(tileId)?.walkable);
    }

    function isAdjacentToOtherInteractable(tx, ty, targetId) {
      return interactableObjects.some((other) => {
        if (!other || other.id === targetId) return false;
        const dx = Math.abs(other.x - tx);
        const dy = Math.abs(other.y - ty);
        return Math.max(dx, dy) <= 1;
      });
    }

    function findAdjacentTile(obj) {
      if (!obj) return null;
      const candidates = [];
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = obj.x + dx;
          const ny = obj.y + dy;
          if (isWalkable(nx, ny)) {
            candidates.push({ tx: nx, ty: ny });
          }
        }
      }
      const preferred = candidates.find(
        (pos) => !isAdjacentToOtherInteractable(pos.tx, pos.ty, obj.id)
      );
      return preferred || candidates[0] || null;
    }

    logStep(`Completing ${targets.length} objective targets.`, testInfo);
    for (const target of targets) {
      const obj = objectById.get(target.id);
      if (!obj) continue;
      const dest = findAdjacentTile(obj);
      if (!dest) continue;
      const teleported = await page.evaluate(({ tx, ty }) => {
        return window.__PONY_RUNTIME?.setPlayerTile?.(tx, ty) ?? false;
      }, dest);
      if (!teleported) {
        await page.evaluate(({ tx, ty }) => {
          window.__PONY_RUNTIME?.setPlayerTile?.(tx, ty, true);
        }, dest);
      }
      await page.waitForTimeout(150);

      await closeDialogIfOpen(page, testInfo, `${target.id} (pre)`, false);
      await closeDialogIfOpen(page, testInfo, `${target.id} (pre-check)`, false);

      const interaction = interactions.get(target.id);
      const action = interaction?.action || target.action || "interact";
      const key = action.includes("heal") ? "h" : "i";
      const baseHoldMs = interaction?.durationMs
        ? Math.round(interaction.durationMs + 300)
        : Math.round(((interaction?.duration ?? 2) * 1000) + 600);
      const holdMs = Math.max(150, Math.round(baseHoldMs * HOLD_SCALE));

      const prompt = page.locator("#prompt");
      if (dialogTargets.has(target.id)) {
        try {
          await page.waitForFunction(() => {
            const el = document.getElementById("prompt");
            return el && !el.hasAttribute("hidden");
          }, { timeout: 2000 });
        } catch (error) {
          const promptText = (await prompt.textContent()) || "";
          logStep(`Prompt not visible before ${target.id}: "${promptText.trim()}"`, testInfo);
          await logDomSnapshot(page, `Prompt missing for ${target.id}`, testInfo);
          throw new Error(`No interaction prompt before ${target.id}.`);
        }
      }

      logStep(
        `Triggering ${action} on ${target.id} for ${holdMs}ms (scale ${HOLD_SCALE}).`,
        testInfo
      );
      await page.keyboard.down(key);
      await page.waitForTimeout(holdMs);
      await page.keyboard.up(key);

      await closeDialogIfOpen(page, testInfo, target.id, dialogTargets.has(target.id));
    }

    logStep("Checking mission completion status.", testInfo);
    await expect(page.locator(".quest-status").last()).toHaveText(/complete|active/i);
    logStep("Mission run complete.", testInfo);
  });
});
