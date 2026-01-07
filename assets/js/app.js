// Pony Parade: app bootstrap.

import { ensureVibes } from "./vibes.js";
import { loadPonies, bindPonyCardActions } from "./pony-cards.js";
import { initPonyForm } from "./pony-form.js";
import { loadMap } from "./map.js";

ensureVibes();
loadPonies();
bindPonyCardActions();
initPonyForm();
loadMap();
