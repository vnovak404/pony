import { loadRuntime } from "./adventure/runtime.js";

const SELECTED_KEY = "WF_SELECTED_MISSION";
const DEFAULT_MISSION = "../missions/stellacorn/mission1/mission.json";
const PLAYER_SPRITE_META_URL =
  "../../assets/ponies/stellacorn/sheets/spritesheet.json";
const PLAYER_SPRITE_SHEET_URL =
  "../../assets/ponies/stellacorn/sheets/spritesheet.webp";

const elements = {
  canvas: document.getElementById("adventureCanvas"),
  ctx: null,
  promptEl: document.getElementById("prompt"),
  actionProgressEl: document.getElementById("action-progress"),
  actionLabelEl: document.getElementById("action-label"),
  actionFillEl: document.getElementById("action-fill"),
  dialogEl: document.getElementById("dialog"),
  dialogTextEl: document.getElementById("dialog-text"),
  dialogHeroEl: document.getElementById("dialog-hero"),
  dialogHeroImg: document.getElementById("dialog-hero-img"),
  dialogCloseBtn: document.getElementById("dialog-close"),
  hoverCardEl: document.getElementById("hover-card"),
  hoverNameEl: document.getElementById("hover-name"),
  returnBtn: document.getElementById("return-btn"),
  titleEl: document.getElementById("map-title"),
};

const ui = {
  objectiveEl: document.getElementById("objective"),
  objectiveProgressEl: document.getElementById("objective-progress"),
  questsEl: document.getElementById("quests"),
  worryMeterEl: document.getElementById("worry-meter"),
  worryLabelEl: document.getElementById("worry-label"),
  worryFillEl: document.getElementById("worry-fill"),
};

init();

async function init() {
  const runtime = await loadRuntime({
    missionPath: null,
    defaultMission: DEFAULT_MISSION,
    selectedKey: SELECTED_KEY,
    elements,
    playerSpriteMetaUrl: PLAYER_SPRITE_META_URL,
    playerSpriteSheetUrl: PLAYER_SPRITE_SHEET_URL,
  });
  if (!runtime) return;
  const missionConfig = runtime.getMissionConfig?.();
  const logicPath = missionConfig?.logic;
  if (logicPath) {
    const moduleUrl = runtime.resolveMissionUrl?.(logicPath);
    if (moduleUrl) {
      const module = await import(moduleUrl);
      const createMission = module?.createMission;
      if (typeof createMission === "function") {
        createMission(runtime, ui);
      }
    }
  }
  runtime.start();
}
