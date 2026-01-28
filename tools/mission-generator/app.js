import { state } from "./state.js";
import { els } from "./dom.js";
import { slugify, isTimeoutError, parseBatchList } from "./utils.js";
import { showError, hideError, copyError } from "./errors.js";
import {
  renderMap,
  updateActionPrompt,
  startHold,
  cancelHold,
  isWalkableTile,
  panCamera,
  findNearbyInteraction,
} from "./render.js";
import {
  renderDialogGraph,
  updateNodeFromEditor,
  ensureDialogNodes,
  handleAddNode,
  handleAddChoice,
} from "./dialog.js";
import {
  syncObjectives,
  renderMissionGraph,
  renderCheckpoints,
  jumpToCheckpoint,
  renderAssetRequests,
} from "./mission_ui.js";
import { applyMissionMeta, buildInteractionMap, getSelectedAssets, syncMissionMeta } from "./mission_meta.js";

const DEFAULT_ADVENTURE_ACTIONS = [
  { id: "talk", key: "i", label: "Talk" },
  { id: "interact", key: "i", label: "Interact" },
  { id: "heal", key: "h", label: "Heal" },
  { id: "magic", key: "i", label: "Magic" },
];

async function apiPost(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

async function apiGet(path) {
  const response = await fetch(path, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function setBusy(active, label = "Working...") {
  if (!els.busyOverlay) return;
  if (active) {
    els.busyOverlay.removeAttribute("hidden");
  } else {
    els.busyOverlay.setAttribute("hidden", "true");
  }
  if (els.busyLabel) {
    els.busyLabel.textContent = label;
  }
}

async function loadAdventures() {
  if (!els.adventureSelect) return;
  try {
    const response = await apiGet("/api/adventures");
    const adventures = response.adventures || [];
    els.adventureSelect.innerHTML = "";
    adventures.forEach((adventure) => {
      const option = document.createElement("option");
      option.value = adventure.id;
      option.textContent = `${adventure.id}${adventure.title ? ` — ${adventure.title}` : ""}`;
      option.dataset.title = adventure.title || "";
      els.adventureSelect.appendChild(option);
    });
    if (!adventures.length) {
      const fallback = document.createElement("option");
      fallback.value = "stellacorn";
      fallback.textContent = "stellacorn";
      els.adventureSelect.appendChild(fallback);
    }
    syncAdventureFields();
  } catch (error) {
    // Ignore list failures; allow manual entry.
  }
}

function syncAdventureFields() {
  const mode = els.adventureMode?.value || "existing";
  const selectedId = els.adventureSelect?.value || "stellacorn";
  if (els.adventureId) {
    els.adventureId.value = mode === "existing" ? selectedId : els.adventureId.value;
  }
  const showNew = mode === "new";
  toggleField(els.adventureSelect, !showNew);
  toggleField(els.adventureTitle, showNew);
  toggleField(els.adventureHeroName, showNew);
  toggleField(els.adventureHeroMeta, showNew);
  toggleField(els.adventureHeroSheet, showNew);
  toggleField(els.adventureActions, showNew);
  toggleField(els.adventureBg, showNew);
}

function toggleField(element, show) {
  if (!element) return;
  if (show) {
    element.closest(".field")?.classList.remove("hidden");
  } else {
    element.closest(".field")?.classList.add("hidden");
  }
}

function parseAdventureActions() {
  if (!els.adventureActions) return DEFAULT_ADVENTURE_ACTIONS;
  try {
    const value = JSON.parse(els.adventureActions.value || "[]");
    if (Array.isArray(value) && value.length) return value;
  } catch (error) {
    // Ignore invalid JSON; fallback to defaults.
  }
  return DEFAULT_ADVENTURE_ACTIONS;
}

function getAdventurePayload() {
  const mode = els.adventureMode?.value || "existing";
  const adventureId = els.adventureId?.value?.trim() || "stellacorn";
  const payload = { adventureId };
  if (mode === "new") {
    payload.createAdventure = true;
    payload.adventureTitle = els.adventureTitle?.value?.trim() || adventureId;
    payload.adventureHero = {
      name: els.adventureHeroName?.value?.trim() || "Hero",
      sheet: els.adventureHeroSheet?.value?.trim() || "",
      meta: els.adventureHeroMeta?.value?.trim() || "",
    };
    payload.adventureActions = parseAdventureActions();
    const background = els.adventureBg?.value?.trim();
    if (background) payload.adventureBackground = background;
  }
  return payload;
}

function updatePills(ok, message) {
  if (els.validationPill) {
    els.validationPill.textContent = message || "Validation: Pending";
    els.validationPill.classList.toggle("pill--ok", Boolean(ok));
    els.validationPill.classList.toggle("pill--error", ok === false);
  }
}

function setMissionSummary(text) {
  if (els.missionSummary) {
    els.missionSummary.textContent = text || "Mission draft ready.";
  }
  if (els.missionPill) {
    els.missionPill.textContent = state.plan?.title || state.bundle?.mission?.title || "Mission Draft";
  }
}

function readSeed() {
  const value = els.missionSeed.value.trim();
  return value || null;
}


async function handlePlan() {
  const vibe = els.missionVibe.value.trim();
  if (!vibe) {
    showError("Mission vibe is required.");
    return;
  }
  const seed = readSeed();
  const forceLive = Boolean(els.forceLive?.checked);
  const cacheOnly = !forceLive;
  updatePills(true, "Validation: Planning...");
  setBusy(true, "Planning mission...");
  try {
    if (forceLive) {
      if (!confirm("Plan mission with OpenAI (costs credits)?")) {
        updatePills(false, "Validation: Plan canceled");
        setBusy(false);
        return;
      }
    }
    const batchList = parseBatchList(els.missionBatch.value || "");
    const variantCount = Math.max(1, Number(els.missionVariants.value) || 1);
    if (batchList.length) {
      state.batchPlans = [];
      for (const entry of batchList) {
        const response = await apiPost("/api/missions/plan", {
          vibe: entry,
          seed,
          forceLive,
          cacheOnly,
        });
        state.batchPlans.push(response.plan);
      }
      state.plan = state.batchPlans[0] || null;
    } else if (variantCount > 1) {
      state.batchPlans = [];
      for (let idx = 0; idx < variantCount; idx += 1) {
        const variantSeed = seed ? `${seed}-${idx + 1}` : null;
        const response = await apiPost("/api/missions/plan", {
          vibe,
          seed: variantSeed,
          forceLive,
          cacheOnly,
        });
        state.batchPlans.push(response.plan);
      }
      state.plan = state.batchPlans[0] || null;
    } else {
      const response = await apiPost("/api/missions/plan", { vibe, seed, forceLive, cacheOnly });
      state.plan = response.plan;
      state.batchPlans = [];
    }
    state.bundle = null;
    state.assetRequests = state.plan?.assetRequests || state.plan?.assets || [];
    setMissionSummary(state.plan?.summary || state.plan?.title || "Mission planned.");
    syncObjectives();
    syncMissionMeta();
    ensureDialogNodes();
    state.dialogNodes = state.plan?.dialog?.nodes || state.dialogNodes;
    renderDialogGraph();
    renderAssetRequests();
    renderMissionGraph(() => syncMissionMeta());
    updatePills(true, "Validation: Planned");
  } catch (error) {
    updatePills(false, "Validation: Plan failed");
    showError(error);
  } finally {
    setBusy(false);
  }
}

async function handleGenerate() {
  if (!state.plan) {
    showError("Plan a mission first.");
    return;
  }
  updatePills(true, "Validation: Generating...");
  setBusy(true, "Generating map...");
  try {
    if (!applyMissionMeta()) return;
    if (state.dialogNodes.length) {
      state.plan.dialog = state.plan.dialog || {};
      state.plan.dialog.nodes = state.dialogNodes;
    }
    const response = await apiPost("/api/missions/generate", {
      plan: state.plan,
      seed: readSeed(),
    });
    state.bundle = response.bundle;
    state.interactions = buildInteractionMap(state.bundle);
    state.checkpoints = state.bundle.mission?.checkpoints || [];
    setMissionSummary(state.bundle.mission?.summary || state.plan.summary || "Mission generated.");
    syncObjectives();
    syncMissionMeta();
    if (state.bundle.map?.spawn) {
      state.player = { x: state.bundle.map.spawn.tx, y: state.bundle.map.spawn.ty };
      state.camera = { x: state.player.x - 4, y: state.player.y - 3 };
    }
    renderCheckpoints();
    renderMap();
    updatePills(response.ok, response.ok ? "Validation: OK" : "Validation: Errors");
    if (response.errors?.length) {
      showError(response.errors.join("\n"));
    }
  } catch (error) {
    updatePills(false, "Validation: Generate failed");
    showError(error);
  } finally {
    setBusy(false);
  }
}

async function handleValidate() {
  if (!state.bundle) {
    showError("Generate a mission first.");
    return;
  }
  setBusy(true, "Validating...");
  try {
    if (!applyMissionMeta()) return;
    const response = await apiPost("/api/missions/validate", { bundle: state.bundle });
    updatePills(response.ok, response.ok ? "Validation: OK" : "Validation: Errors");
    if (!response.ok) {
      showError(response.errors.join("\n"));
    }
  } catch (error) {
    updatePills(false, "Validation: Failed");
    showError(error);
  } finally {
    setBusy(false);
  }
}

async function handleSave(force = false) {
  if (!state.bundle) {
    showError("Generate a mission first.");
    return;
  }
  setBusy(true, "Saving mission...");
  try {
    if (!applyMissionMeta()) return;
    if (state.dialogNodes.length && state.bundle.mission) {
      state.bundle.mission.dialog = state.bundle.mission.dialog || {};
      state.bundle.mission.dialog.nodes = state.dialogNodes;
    }
    const payload = {
      bundle: state.bundle,
      force,
      ...getAdventurePayload(),
    };
    const response = await apiPost("/api/missions/save", payload);
    alert(`Mission saved: ${response.mission_path || response.missionPath || "ok"}`);
  } catch (error) {
    if (isTimeoutError(error)) {
      showError("Save timed out. Try force save or check server logs.");
    } else {
      showError(error);
    }
  } finally {
    setBusy(false);
  }
}

async function handleGenerateAssets() {
  if (!state.bundle) {
    showError("Generate a mission first.");
    return;
  }
  const selected = getSelectedAssets();
  if (!selected.length) {
    showError("Select at least one asset request.");
    return;
  }
  if (!confirm("Generate assets with OpenAI (costs credits)?")) return;
  setBusy(true, "Generating assets...");
  try {
    for (const asset of selected) {
      const response = await apiPost("/api/assets/generate", asset);
      if (response.asset?.id) {
        setMissionSummary(`Generated asset: ${response.asset.id}`);
      }
    }
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
}

function toggleMissionGraph() {
  if (!els.missionGraph) return;
  const isHidden = els.missionGraph.hasAttribute("hidden");
  if (isHidden) {
    els.missionGraph.removeAttribute("hidden");
  } else {
    els.missionGraph.setAttribute("hidden", "true");
  }
}

async function handleOpenEditor() {
  if (!state.bundle) {
    showError("Generate a mission first.");
    return;
  }
  const editorWindow = window.open("about:blank", "_blank");
  if (!editorWindow) {
    showError("Popup blocked. Allow popups for this site to open the editor.");
    return;
  }
  setBusy(true, "Preparing editor...");
  try {
    if (!applyMissionMeta()) return;
    if (state.dialogNodes.length && state.bundle.mission) {
      state.bundle.mission.dialog = state.bundle.mission.dialog || {};
      state.bundle.mission.dialog.nodes = state.dialogNodes;
    }
    const response = await apiPost("/api/missions/draft", { bundle: state.bundle });
    const params = new URLSearchParams();
    const normalizePath = (path) => {
      if (!path) return path;
      if (window.location.protocol === "file:") {
        const clean = path.startsWith("/") ? path.slice(1) : path;
        return `../../${clean}`;
      }
      return path;
    };
    const mapPath = normalizePath(response.mapPath);
    const tilesPath = normalizePath(response.tilesPath);
    const objectsPath = normalizePath(response.objectsPath);
    if (mapPath) params.set("map", mapPath);
    if (tilesPath) params.set("tiles", tilesPath);
    if (objectsPath) params.set("objects", objectsPath);
    if (![response.mapPath, response.tilesPath, response.objectsPath].some(Boolean)) {
      showError("Draft saved, but no map/tiles/objects paths were returned.");
      editorWindow.close();
      return;
    }
    const url = `../adventure-designer/?${params.toString()}`;
    editorWindow.location = url;
  } catch (error) {
    showError(error);
    editorWindow.close();
  } finally {
    setBusy(false);
  }
}

function togglePlaytest() {
  state.playtest = !state.playtest;
  if (els.playtestButton) {
    els.playtestButton.textContent = state.playtest ? "Stop Playtest" : "Playtest";
  }
  updateActionPrompt();
  renderMap();
}

function initAdventureDefaults() {
  if (!els.adventureId || !els.adventureHeroMeta || !els.adventureHeroSheet) return;
  const id = slugify(els.adventureId.value || "stellacorn");
  els.adventureHeroMeta.value = els.adventureHeroMeta.value || `../../assets/ponies/${id}/sheets/spritesheet.json`;
  els.adventureHeroSheet.value = els.adventureHeroSheet.value || `../../assets/ponies/${id}/sheets/spritesheet.webp`;
  if (els.adventureActions && !els.adventureActions.value.trim()) {
    els.adventureActions.value = JSON.stringify(DEFAULT_ADVENTURE_ACTIONS, null, 2);
  }
}

function initRenderToggle() {
  if (!els.renderAssets) return;
  state.renderAssets = Boolean(els.renderAssets.checked);
  els.renderAssets.addEventListener("change", () => {
    state.renderAssets = Boolean(els.renderAssets.checked);
    renderMap();
  });
}

function handleKeyDown(event) {
  if (!state.playtest) return;
  if (!state.bundle?.map) return;
  const key = event.key.toLowerCase();
  if (key === "w") state.player.y -= 1;
  if (key === "s") state.player.y += 1;
  if (key === "a") state.player.x -= 1;
  if (key === "d") state.player.x += 1;
  if (key === "h" || key === "i") {
    const nearby = state.action.active ? state.action.target : state.interactions.size ? findNearbyInteraction() : null;
    if (nearby) {
      startHold(key, nearby);
    }
  }
  if (key === "arrowup") panCamera(0, -1);
  if (key === "arrowdown") panCamera(0, 1);
  if (key === "arrowleft") panCamera(-1, 0);
  if (key === "arrowright") panCamera(1, 0);
  if (!isWalkableTile(state.player.x, state.player.y)) {
    if (key === "w") state.player.y += 1;
    if (key === "s") state.player.y -= 1;
    if (key === "a") state.player.x += 1;
    if (key === "d") state.player.x -= 1;
  }
  renderMap();
  updateActionPrompt();
}

function handleKeyUp(event) {
  const key = event.key.toLowerCase();
  if (key === "h" || key === "i") {
    cancelHold();
  }
}

state.onHoldComplete = (interaction, target) => {
  const action = interaction?.action || "interact";
  const targetId = target?.id || "target";
  setMissionSummary(`Playtest: ${action} on ${targetId}`);
};

els.planButton?.addEventListener("click", handlePlan);
els.generateButton?.addEventListener("click", handleGenerate);
els.validateButton?.addEventListener("click", handleValidate);
els.saveButton?.addEventListener("click", () => handleSave(false));
els.forceSaveButton?.addEventListener("click", () => handleSave(true));
els.generateAssets?.addEventListener("click", handleGenerateAssets);
els.addNode?.addEventListener("click", handleAddNode);
els.addChoice?.addEventListener("click", handleAddChoice);
els.updateNode?.addEventListener("click", updateNodeFromEditor);
els.toggleGraph?.addEventListener("click", toggleMissionGraph);
els.playtestButton?.addEventListener("click", togglePlaytest);
els.jumpCheckpoint?.addEventListener("click", () => {
  jumpToCheckpoint();
  renderMap();
});
els.openEditor?.addEventListener("click", handleOpenEditor);
els.applyMissionMeta?.addEventListener("click", applyMissionMeta);
els.adventureMode?.addEventListener("change", syncAdventureFields);
els.adventureSelect?.addEventListener("change", syncAdventureFields);
els.adventureId?.addEventListener("change", initAdventureDefaults);
els.errorClose?.addEventListener("click", hideError);
els.errorCopy?.addEventListener("click", () => {
  copyError().catch(() => {});
});
els.errorModal?.addEventListener("click", (event) => {
  if (event.target === els.errorModal) hideError();
});

window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);
window.addEventListener("blur", cancelHold);

loadAdventures();
initAdventureDefaults();
initRenderToggle();
ensureDialogNodes();
renderDialogGraph();
