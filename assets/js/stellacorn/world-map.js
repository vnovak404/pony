const MAP_URL = "./world-map.json";
const PROGRESS_KEY = "WF_PROGRESS_V1";
const SELECTED_KEY = "WF_SELECTED_MISSION";
const NODE_RADIUS = 22;

const canvas = document.getElementById("worldCanvas");
const ctx = canvas ? canvas.getContext("2d") : null;
const missionNameEl = document.getElementById("mission-name");
const missionStatusEl = document.getElementById("mission-status");
const missionStatsEl = document.getElementById("mission-stats");
const missionActionEl = document.getElementById("mission-action");
const exportBtn = document.getElementById("export-progress");
const importBtn = document.getElementById("import-progress");
const importFile = document.getElementById("import-file");

let worldMap = null;
let progress = null;
let hoverNode = null;
let selectedNode = null;

if (canvas && ctx) {
  canvas.addEventListener("click", onCanvasClick);
  canvas.addEventListener("mousemove", onCanvasMove);
  canvas.addEventListener("mouseleave", () => {
    hoverNode = null;
    updatePanel();
    drawMap();
  });
  exportBtn?.addEventListener("click", exportProgress);
  importBtn?.addEventListener("click", () => importFile?.click());
  importFile?.addEventListener("change", handleImportFile);
  missionActionEl?.addEventListener("click", () => {
    const node = hoverNode || selectedNode;
    if (node) startMission(node);
  });
  loadWorldMap();
}

async function loadWorldMap() {
  try {
    const response = await fetch(MAP_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`World map load failed: ${response.status}`);
    }
    worldMap = await response.json();
    ensureProgress();
    updatePanel();
    drawMap();
  } catch (error) {
    console.error(error);
    drawError("Whispering Forest map failed to load.");
  }
}

function ensureProgress() {
  progress = loadProgress();
  const baseUnlocked = (worldMap?.nodes || [])
    .filter((node) => node.unlocked)
    .map((node) => node.id);
  let changed = false;
  baseUnlocked.forEach((id) => {
    if (!progress.unlocked[id]) {
      progress.unlocked[id] = true;
      changed = true;
    }
  });
  if (changed) saveProgress();
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return { cleared: {}, unlocked: {} };
    const parsed = JSON.parse(raw);
    return {
      cleared: parsed.cleared || {},
      unlocked: parsed.unlocked || {},
    };
  } catch (error) {
    return { cleared: {}, unlocked: {} };
  }
}

function saveProgress() {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

function nodeUnlocked(node) {
  if (!node) return false;
  if (node.unlocked) return true;
  if (progress?.unlocked?.[node.id]) return true;
  const requires = Array.isArray(node.requires) ? node.requires : [];
  if (!requires.length) return false;
  return requires.every((id) => progress?.cleared?.[id]);
}

function nodeCleared(node) {
  if (!node) return false;
  return Boolean(progress?.cleared?.[node.id]);
}

function drawMap() {
  if (!ctx || !canvas || !worldMap) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  (worldMap.edges || []).forEach(([a, b]) => {
    const nodeA = getNode(a);
    const nodeB = getNode(b);
    if (!nodeA || !nodeB) return;
    const edgeLocked = !(nodeUnlocked(nodeA) && nodeUnlocked(nodeB));
    ctx.strokeStyle = edgeLocked ? "#6f7f7a" : "#4f6a62";
    ctx.setLineDash(edgeLocked ? [10, 8] : []);
    ctx.beginPath();
    ctx.moveTo(nodeA.x, nodeA.y);
    ctx.lineTo(nodeB.x, nodeB.y);
    ctx.stroke();
  });
  ctx.setLineDash([]);

  worldMap.nodes.forEach((node) => {
    const unlocked = nodeUnlocked(node);
    const cleared = nodeCleared(node);
    ctx.beginPath();
    ctx.arc(node.x, node.y, NODE_RADIUS, 0, Math.PI * 2);

    if (cleared) {
      ctx.fillStyle = "#b6dfc2";
      ctx.strokeStyle = "#244338";
      ctx.shadowColor = "rgba(182, 223, 194, 0.45)";
      ctx.shadowBlur = 12;
    } else if (unlocked) {
      ctx.fillStyle = "#dbe6d6";
      ctx.strokeStyle = "#3b4844";
      ctx.shadowColor = "rgba(219, 230, 214, 0.45)";
      ctx.shadowBlur = 12;
    } else {
      ctx.fillStyle = "#273130";
      ctx.strokeStyle = "#5b6b64";
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
    }
    ctx.fill();
    ctx.stroke();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    if (!unlocked) {
      ctx.fillStyle = "#6b756f";
      ctx.fillRect(node.x - 10, node.y - 5, 20, 14);
      ctx.beginPath();
      ctx.arc(node.x, node.y - 5, 10, Math.PI, 2 * Math.PI);
      ctx.fill();
    }

    const highlight = node === hoverNode || node === selectedNode;
    if (highlight) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
      ctx.lineWidth = 3;
      ctx.arc(node.x, node.y, NODE_RADIUS + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 4;
    }

    ctx.fillStyle = "#e3efe6";
    ctx.font = "bold 14px sans-serif";
    ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 1;
    ctx.fillText(
      node.name,
      node.x - ctx.measureText(node.name).width / 2,
      node.y + 42
    );
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  });
}

function drawError(message) {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#e3efe6";
  ctx.font = "16px sans-serif";
  ctx.fillText(message, 20, 40);
}

function onCanvasClick(event) {
  if (!worldMap || !canvas) return;
  const node = findNodeAt(event);
  if (!node) return;
  selectedNode = node;
  updatePanel();
  drawMap();
  startMission(node);
}

function onCanvasMove(event) {
  if (!worldMap || !canvas) return;
  const node = findNodeAt(event);
  if (node === hoverNode) return;
  hoverNode = node;
  updatePanel();
  drawMap();
}

function findNodeAt(event) {
  if (!canvas || !worldMap) return null;
  const rect = canvas.getBoundingClientRect();
  const mx = event.clientX - rect.left;
  const my = event.clientY - rect.top;
  return (
    worldMap.nodes.find((node) => {
      const dx = mx - node.x;
      const dy = my - node.y;
      return Math.hypot(dx, dy) < NODE_RADIUS + 4;
    }) || null
  );
}

function getNode(id) {
  if (!worldMap) return null;
  return worldMap.nodes.find((node) => node.id === id) || null;
}

function updatePanel() {
  const node = hoverNode || selectedNode;
  if (!missionNameEl || !missionStatusEl || !missionStatsEl || !missionActionEl) return;

  if (!node) {
    missionNameEl.textContent = "Hover a mission";
    missionStatusEl.textContent = "Select a node to see details.";
    missionStatsEl.innerHTML = "";
    missionActionEl.textContent = "Choose a mission";
    missionActionEl.disabled = true;
    return;
  }

  missionNameEl.textContent = node.name || "Unknown Mission";
  const unlocked = nodeUnlocked(node);
  const cleared = nodeCleared(node);
  const status = cleared ? "Cleared" : unlocked ? "Unlocked" : "Locked";
  missionStatusEl.textContent = `Status: ${status}`;

  missionStatsEl.innerHTML = "";
  const stats = Array.isArray(node.stats) ? node.stats : [];
  stats.forEach((stat) => {
    const li = document.createElement("li");
    li.textContent = stat;
    missionStatsEl.appendChild(li);
  });

  const hasMission = Boolean(node.mission);
  missionActionEl.textContent = hasMission
    ? unlocked
      ? "Start Mission"
      : "Locked"
    : "Coming Soon";
  missionActionEl.disabled = !unlocked || !hasMission;
}

function startMission(node) {
  if (!node || !nodeUnlocked(node) || !node.mission) return;
  localStorage.setItem(SELECTED_KEY, node.mission);
  window.location.href = "adventure.html";
}

function exportProgress() {
  if (!progress) return;
  const blob = new Blob([JSON.stringify(progress, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "whispering-forest-progress.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function handleImportFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || "{}"));
      progress = {
        cleared: parsed.cleared || {},
        unlocked: parsed.unlocked || {},
      };
      saveProgress();
      updatePanel();
      drawMap();
    } catch (error) {
      console.error(error);
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}
