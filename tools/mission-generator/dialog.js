import { state } from "./state.js";
import { els } from "./dom.js";
import { showError } from "./errors.js";

let dragging = null;

export function ensureDialogLayout() {
  if (!state.dialogNodes.length) return;
  state.dialogNodes.forEach((node, idx) => {
    if (typeof node.x !== "number") node.x = 40 + (idx % 4) * 220;
    if (typeof node.y !== "number") node.y = 40 + Math.floor(idx / 4) * 140;
  });
}

export function renderDialogGraph() {
  if (!els.dialogNodes || !els.dialogEdges) return;
  ensureDialogLayout();
  els.dialogNodes.innerHTML = "";
  els.dialogEdges.innerHTML = "";
  const nodeMap = new Map();
  state.dialogNodes.forEach((node) => nodeMap.set(node.id, node));

  state.dialogNodes.forEach((node) => {
    const card = document.createElement("div");
    card.className = "dialog-node";
    if (node.id === state.selectedNodeId) {
      card.classList.add("dialog-node--selected");
    }
    card.style.left = `${node.x}px`;
    card.style.top = `${node.y}px`;
    card.innerHTML = `
      <div class="dialog-node__title">${node.speaker || "Narrator"}</div>
      <div class="dialog-node__body">${(node.text || []).slice(0, 2).join(" ")}</div>
      <div class="dialog-node__meta">${node.id}</div>
    `;
    card.addEventListener("pointerdown", (event) => startDrag(event, node));
    card.addEventListener("click", () => selectNode(node.id));
    els.dialogNodes.appendChild(card);
  });

  state.dialogNodes.forEach((node) => {
    (node.choices || []).forEach((choice) => {
      if (!choice.to || !nodeMap.has(choice.to)) return;
      drawEdge(node, nodeMap.get(choice.to));
    });
  });
}

function drawEdge(from, to) {
  const startX = from.x + 160;
  const startY = from.y + 30;
  const endX = to.x;
  const endY = to.y + 30;
  const midX = (startX + endX) / 2;
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`);
  path.setAttribute("stroke", "rgba(255, 255, 255, 0.5)");
  path.setAttribute("fill", "transparent");
  path.setAttribute("stroke-width", "2");
  els.dialogEdges.appendChild(path);
}

function startDrag(event, node) {
  dragging = {
    id: node.id,
    offsetX: event.clientX - node.x,
    offsetY: event.clientY - node.y,
  };
  document.addEventListener("pointermove", onDrag);
  document.addEventListener("pointerup", endDrag);
}

function onDrag(event) {
  if (!dragging) return;
  const node = state.dialogNodes.find((entry) => entry.id === dragging.id);
  if (!node) return;
  node.x = event.clientX - dragging.offsetX;
  node.y = event.clientY - dragging.offsetY;
  renderDialogGraph();
}

function endDrag() {
  dragging = null;
  document.removeEventListener("pointermove", onDrag);
  document.removeEventListener("pointerup", endDrag);
}

export function selectNode(nodeId) {
  const node = state.dialogNodes.find((entry) => entry.id === nodeId);
  if (!node) return;
  state.selectedNodeId = nodeId;
  if (els.nodeId) els.nodeId.value = node.id;
  if (els.nodeSpeaker) els.nodeSpeaker.value = node.speaker || "";
  if (els.nodeText) els.nodeText.value = (node.text || []).join("\n");
  if (els.nodeChoices) els.nodeChoices.value = JSON.stringify(node.choices || [], null, 2);
  renderDialogGraph();
}

export function updateNodeFromEditor() {
  const node = state.dialogNodes.find((entry) => entry.id === state.selectedNodeId);
  if (!node) return;
  node.id = els.nodeId.value.trim() || node.id;
  node.speaker = els.nodeSpeaker.value.trim();
  node.text = els.nodeText.value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  try {
    node.choices = JSON.parse(els.nodeChoices.value || "[]");
  } catch (error) {
    showError("Choices JSON is invalid.");
  }
  renderDialogGraph();
}

export function ensureDialogNodes() {
  if (state.dialogNodes.length) return;
  state.dialogNodes = [
    {
      id: "node_intro",
      speaker: "Narrator",
      text: ["A new mission begins..."],
      choices: [],
      x: 40,
      y: 40,
    },
  ];
}

export function handleAddNode() {
  const nodeId = `node_${state.dialogNodes.length + 1}`;
  state.dialogNodes.push({
    id: nodeId,
    speaker: "Narrator",
    text: ["..."] ,
    choices: [],
    x: 40 + state.dialogNodes.length * 30,
    y: 60 + state.dialogNodes.length * 30,
  });
  selectNode(nodeId);
  renderDialogGraph();
}

export function handleAddChoice() {
  const node = state.dialogNodes.find((entry) => entry.id === state.selectedNodeId);
  if (!node) return;
  node.choices = node.choices || [];
  node.choices.push({ text: "New choice", to: null, conditions: [], setFlags: [], setGlobalFlags: [] });
  renderDialogGraph();
}
