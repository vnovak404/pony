// Pony Parade: app bootstrap.

import { ensureVibes } from "./vibes.js";
import { loadPonies, bindPonyCardActions } from "./pony-cards.js";
import { initPonyForm } from "./pony-form.js";
import { loadMap } from "./map.js";
import { detectApi } from "./api_mode.js";
import { initSpeechUI } from "./speech/ui.js";

const boot = async () => {
  await detectApi();
  ensureVibes();
  loadPonies();
  bindPonyCardActions();
  initPonyForm();
  loadMap();
  initSpeechUI();
};

boot();
