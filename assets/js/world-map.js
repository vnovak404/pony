const MAP_URL = "assets/world/maps/world-map.json";
const PROGRESS_KEY = "PP_PROGRESS_V1";
const SELECTED_KEY = "PP_SELECTED_NODE";
const NODE_RADIUS = 22;

const canvas = document.getElementById("worldCanvas");
const ctx = canvas ? canvas.getContext("2d") : null;

let worldMap = null;
let progress = null;

if (canvas && ctx) {
  canvas.addEventListener("click", onCanvasClick);
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
    drawMap();
  } catch (error) {
    console.error(error);
    drawError("World map failed to load.");
  }
}

function getNode(id) {
  if (!worldMap) return null;
  return worldMap.nodes.find((node) => node.id === id) || null;
}

function neighborsOf(id) {
  if (!worldMap) return [];
  return worldMap.edges
    .filter((edge) => edge.includes(id))
    .map((edge) => (edge[0] === id ? edge[1] : edge[0]));
}

function determineUnlocked() {
  const unlocked = new Set();
  (worldMap?.nodes || []).forEach((node) => {
    if (node.unlocked) {
      unlocked.add(node.id);
    }
  });
  if (progress && progress.unlocked) {
    Object.entries(progress.unlocked).forEach(([id, value]) => {
      if (value) {
        unlocked.add(id);
      }
    });
  }
  const revealLocked = new Set();
  unlocked.forEach((nodeId) => {
    neighborsOf(nodeId).forEach((neighborId) => {
      if (!unlocked.has(neighborId)) {
        revealLocked.add(neighborId);
      }
    });
  });
  const visible = new Set([...unlocked, ...revealLocked]);
  return { unlocked, revealLocked, visible };
}

function drawMap() {
  if (!ctx || !canvas || !worldMap) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const { unlocked, revealLocked, visible } = determineUnlocked();

  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  worldMap.edges.forEach(([a, b]) => {
    if (!visible.has(a) || !visible.has(b)) return;
    const nodeA = getNode(a);
    const nodeB = getNode(b);
    if (!nodeA || !nodeB) return;
    const edgeLocked = !(unlocked.has(a) && unlocked.has(b));
    ctx.strokeStyle = edgeLocked ? "#7f8e86" : "#5f786d";
    ctx.setLineDash(edgeLocked ? [10, 8] : []);
    ctx.beginPath();
    ctx.moveTo(nodeA.x, nodeA.y);
    ctx.lineTo(nodeB.x, nodeB.y);
    ctx.stroke();
  });
  ctx.setLineDash([]);

  worldMap.nodes.forEach((node) => {
    const isUnlocked = unlocked.has(node.id);
    const isReveal = revealLocked.has(node.id);
    if (!visible.has(node.id)) return;

    ctx.beginPath();
    ctx.arc(node.x, node.y, NODE_RADIUS, 0, Math.PI * 2);

    if (isUnlocked) {
      ctx.fillStyle = "#dbe6d6";
      ctx.strokeStyle = "#3b4844";
      ctx.shadowColor = "rgba(219, 230, 214, 0.45)";
      ctx.shadowBlur = 12;
    } else if (isReveal) {
      ctx.fillStyle = "#2a3331";
      ctx.strokeStyle = "#5b6b64";
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
    }
    ctx.fill();
    ctx.stroke();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    if (!isUnlocked && isReveal) {
      ctx.fillStyle = "#6b756f";
      ctx.fillRect(node.x - 10, node.y - 5, 20, 14);
      ctx.beginPath();
      ctx.arc(node.x, node.y - 5, 10, Math.PI, 2 * Math.PI);
      ctx.fill();
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
  const rect = canvas.getBoundingClientRect();
  const mx = event.clientX - rect.left;
  const my = event.clientY - rect.top;

  const { unlocked } = determineUnlocked();

  worldMap.nodes.forEach((node) => {
    if (!unlocked.has(node.id)) return;
    const dx = mx - node.x;
    const dy = my - node.y;
    if (Math.hypot(dx, dy) < NODE_RADIUS) {
      startAdventure(node.id);
    }
  });
}

function startAdventure(nodeId) {
  localStorage.setItem(SELECTED_KEY, nodeId);
  window.location.href = "prototype/adventure.html";
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
  if (changed) {
    saveProgress();
  }
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
