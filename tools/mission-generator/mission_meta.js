import { state } from "./state.js";
import { els } from "./dom.js";
import { renderDialogGraph } from "./dialog.js";
import { renderCheckpoints } from "./mission_ui.js";
import { renderMap } from "./render.js";
import { showError } from "./errors.js";

export function buildMissionMetaSource(source) {
  const dialog = source?.dialog || {};
  return {
    interactions: source?.interactions || [],
    objectives: source?.objectives || [],
    zones: source?.zones || [],
    triggers: source?.triggers || {},
    narrative: source?.narrative || {},
    flags: source?.flags || {},
    checkpoints: source?.checkpoints || [],
    dialog: {
      entry: dialog.entry || "",
      startByTarget: dialog.startByTarget || {},
    },
  };
}

export function syncMissionMeta() {
  if (!els.missionMeta) return;
  const source = state.bundle?.mission || state.plan || {};
  const meta = buildMissionMetaSource(source);
  const serialized = JSON.stringify(meta, null, 2);
  els.missionMeta.value = serialized;
  state.missionMetaBaseline = serialized;
}

export function mergeMissionMeta(target, meta) {
  if (!target || !meta) return;
  if (meta.interactions) target.interactions = meta.interactions;
  if (meta.objectives) target.objectives = meta.objectives;
  if (meta.zones) target.zones = meta.zones;
  if (meta.triggers) target.triggers = meta.triggers;
  if (meta.narrative) target.narrative = meta.narrative;
  if (meta.flags) target.flags = meta.flags;
  if (meta.checkpoints) target.checkpoints = meta.checkpoints;
  if (meta.dialog) {
    target.dialog = target.dialog || {};
    if (meta.dialog.entry !== undefined) target.dialog.entry = meta.dialog.entry;
    if (meta.dialog.startByTarget) target.dialog.startByTarget = meta.dialog.startByTarget;
  }
}

export function applyMissionMeta() {
  if (!els.missionMeta) return true;
  const raw = els.missionMeta.value || "{}";
  if (state.missionMetaBaseline && raw.trim() === state.missionMetaBaseline.trim()) {
    return true;
  }
  let meta = null;
  try {
    meta = JSON.parse(raw);
  } catch (error) {
    showError("Mission metadata JSON is invalid.");
    return false;
  }
  mergeMissionMeta(state.plan, meta);
  if (state.bundle?.mission) {
    mergeMissionMeta(state.bundle.mission, meta);
    state.interactions = buildInteractionMap(state.bundle);
  }
  if (meta.checkpoints) {
    state.checkpoints = meta.checkpoints;
  }
  renderDialogGraph();
  renderCheckpoints();
  renderMap();
  state.missionMetaBaseline = raw;
  return true;
}

export function buildInteractionMap(bundle) {
  const map = new Map();
  const interactions = bundle?.mission?.interactions || [];
  interactions.forEach((entry) => {
    if (!entry?.targetId) return;
    map.set(entry.targetId, entry);
  });
  const startByTarget = bundle?.mission?.dialog?.startByTarget || {};
  Object.entries(startByTarget).forEach(([targetId, dialogId]) => {
    if (map.has(targetId)) return;
    map.set(targetId, { targetId, action: "talk", dialog: dialogId });
  });
  return map;
}

export function getSelectedAssets() {
  const selected = [];
  const checkboxes = els.assetList.querySelectorAll("input[type=checkbox]");
  checkboxes.forEach((box) => {
    if (box.checked) {
      const asset = state.assetRequests[Number(box.dataset.index)];
      if (asset) selected.push(asset);
    }
  });
  return selected;
}
