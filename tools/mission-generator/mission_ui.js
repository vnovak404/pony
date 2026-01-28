import { state } from "./state.js";
import { els } from "./dom.js";
import { renderDialogGraph } from "./dialog.js";

export function syncObjectives() {
  if (!els.objectiveList) return;
  const objectives = state.plan?.objectives || state.bundle?.mission?.objectives || [];
  els.objectiveList.innerHTML = "";
  objectives.forEach((objective, idx) => {
    const row = document.createElement("div");
    row.className = "objective";
    const label = objective.label || `Objective ${idx + 1}`;
    const count = objective.targetCount ? ` • ${objective.targetCount}` : "";
    row.textContent = `${label}${count}`;
    els.objectiveList.appendChild(row);
  });
}

export function renderMissionGraph(onSelectPlan) {
  if (!els.missionGraph) return;
  els.missionGraph.innerHTML = "";
  const plans = state.batchPlans.length ? state.batchPlans : state.plan ? [state.plan] : [];
  plans.forEach((plan, index) => {
    const node = document.createElement("div");
    node.className = "mission-node";
    const objectiveCount = plan?.objectives?.length || 0;
    const zoneCount = plan?.zones?.length || 0;
    const interactionCount = plan?.interactions?.length || 0;
    node.innerHTML = `
      <div class="mission-node__title">${plan.title || plan.summary || `Mission ${index + 1}`}</div>
      <div class="mission-node__meta">Objectives ${objectiveCount} • Zones ${zoneCount}</div>
      <div class="mission-node__meta">Interactions ${interactionCount} • Seed ${plan.seed || "auto"}</div>
    `;
    if (index === 0) node.classList.add("mission-node--active");
    node.addEventListener("click", () => {
      state.plan = plan;
      syncObjectives();
      state.dialogNodes = plan.dialog?.nodes || state.dialogNodes;
      renderDialogGraph();
      if (typeof onSelectPlan === "function") {
        onSelectPlan(plan);
      }
      renderMissionGraph(onSelectPlan);
    });
    els.missionGraph.appendChild(node);
  });
}

export function renderCheckpoints() {
  if (!els.checkpointSelect) return;
  const checkpoints = state.bundle?.mission?.checkpoints || state.checkpoints || [];
  els.checkpointSelect.innerHTML = "<option value=\"\">Checkpoint</option>";
  checkpoints.forEach((checkpoint) => {
    const option = document.createElement("option");
    option.value = checkpoint.id || "";
    option.textContent = checkpoint.label || checkpoint.id || "Checkpoint";
    els.checkpointSelect.appendChild(option);
  });
  if (els.checkpointPill) {
    els.checkpointPill.textContent = `Checkpoint: ${checkpoints[0]?.label || "Start"}`;
  }
}

export function jumpToCheckpoint() {
  const id = els.checkpointSelect.value;
  if (!id || !state.bundle?.mission) return;
  const checkpoints = state.bundle.mission.checkpoints || [];
  const checkpoint = checkpoints.find((entry) => entry.id === id);
  if (!checkpoint) return;
  if (checkpoint.targetId) {
    const target = state.bundle.map?.objects?.find((obj) => obj.id === checkpoint.targetId);
    if (!target) return;
    state.player = { x: target.x, y: target.y };
  } else if (typeof checkpoint.tx === "number" && typeof checkpoint.ty === "number") {
    state.player = { x: checkpoint.tx, y: checkpoint.ty };
  }
}

export function renderAssetRequests() {
  if (!els.assetList) return;
  els.assetList.innerHTML = "";
  state.assetRequests.forEach((asset, index) => {
    const row = document.createElement("label");
    row.className = "asset-item";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.index = index;
    checkbox.checked = true;

    const info = document.createElement("div");
    info.innerHTML = `
      <strong>${asset.title || asset.name || asset.id || "Asset"}</strong>
      <div>${asset.type || "sprite"} • ${asset.slug || ""}</div>
    `;

    row.appendChild(checkbox);
    row.appendChild(info);
    els.assetList.appendChild(row);
  });
}
