// Pony Parade: pony card rendering and actions.

import { ponyGrid } from "./dom.js";
import {
  formatTalent,
  formatPersonality,
  getWebpCandidates,
  loadImageCandidates,
  loadJson,
  toTitleCase,
} from "./utils.js";
import { HAS_API, apiUrl } from "./api_mode.js";

const BACKSTORY_PATH = "data/pony_backstories.json";
let backstoryCache = null;
let backstoryPromise = null;

const loadBackstories = async () => {
  if (backstoryCache) return backstoryCache;
  if (!backstoryPromise) {
    backstoryPromise = loadJson(`${BACKSTORY_PATH}?t=${Date.now()}`)
      .then((data) => {
        const backstories = data && data.backstories ? data.backstories : {};
        backstoryCache = backstories;
        return backstories;
      })
      .catch((error) => {
        backstoryPromise = null;
        throw error;
      });
  }
  return backstoryPromise;
};

const createParagraphs = (container, text) => {
  container.replaceChildren();
  const chunks = text.split(/\n\n+/).map((chunk) => chunk.trim()).filter(Boolean);
  if (!chunks.length) {
    container.textContent = text;
    return;
  }
  chunks.forEach((chunk) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = chunk;
    container.append(paragraph);
  });
};

const normalizeBackstoryText = (text) => {
  if (!text) return "";
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.includes("\"backstory\"")) {
    return text;
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && parsed.backstory) return String(parsed.backstory);
  } catch (error) {
    const marker = "\"backstory\"";
    const start = trimmed.indexOf(marker);
    if (start === -1) return text;
    const firstQuote = trimmed.indexOf("\"", start + marker.length);
    if (firstQuote === -1) return text;
    const suffixIndex = trimmed.lastIndexOf("\"");
    const raw = trimmed.slice(firstQuote + 1, suffixIndex > firstQuote ? suffixIndex : trimmed.length);
    return raw.replace(/\\n/g, "\n").replace(/\\"/g, "\"").trim();
  }
  return text;
};

const ensureBackstoryModal = () => {
  let modal = document.querySelector("[data-backstory-modal]");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.className = "backstory-modal";
  modal.dataset.backstoryModal = "true";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="backstory-card" role="dialog" aria-modal="true" aria-labelledby="backstory-title">
      <div class="backstory-hero">
        <img alt="" loading="lazy" />
      </div>
      <div class="backstory-header">
        <h3 id="backstory-title"></h3>
        <button class="btn ghost small" type="button" data-backstory-close>Close</button>
      </div>
      <div class="backstory-body" data-backstory-body></div>
    </div>
  `;
  document.body.append(modal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target.closest("[data-backstory-close]")) {
      modal.hidden = true;
    }
  });
  return modal;
};

const showBackstoryModal = (ponyName, text, imageSrc) => {
  const modal = ensureBackstoryModal();
  const title = modal.querySelector("#backstory-title");
  const body = modal.querySelector("[data-backstory-body]");
  const image = modal.querySelector(".backstory-hero img");
  if (title) title.textContent = ponyName ? `${ponyName}'s Backstory` : "Backstory";
  if (image) {
    if (imageSrc) {
      image.src = imageSrc;
      image.alt = ponyName ? `${ponyName} portrait` : "Pony portrait";
    } else {
      image.removeAttribute("src");
      image.alt = "";
    }
  }
  if (body) {
    if (text) {
      const normalized = normalizeBackstoryText(text);
      createParagraphs(body, normalized);
    } else {
      body.textContent = "Backstory not found yet. Generate lore or try again later.";
    }
  }
  modal.hidden = false;
};

export const renderPonyCard = (pony, imagePath, addToTop = false) => {
  if (!ponyGrid) return;
  const ponyId = pony.slug || "";
  const sheetPath = pony.sprites && pony.sprites.sheet ? pony.sprites.sheet : "";
  const metaPath = pony.sprites && pony.sprites.meta ? pony.sprites.meta : "";
  const jobTitle = pony.job && pony.job.title ? toTitleCase(pony.job.title) : "";
  const jobService = pony.job && pony.job.service ? pony.job.service : "";
  const jobLine =
    jobTitle && jobService
      ? `${jobTitle} - ${jobService}`
      : jobTitle || jobService;
  const jobMarkup = jobLine
    ? `<p class="pony-job"><span class="pony-job-label">Job:</span> ${jobLine}</p>`
    : "";
  const [primaryImage, fallbackImage] = getWebpCandidates(imagePath);
  const card = document.createElement("article");
  card.className = "pony-card pony-photo";
  card.innerHTML = `
    <div class="pony-art">
      <img
        src="${primaryImage || imagePath}"
        data-fallback="${fallbackImage || ""}"
        alt="${pony.name} the ${pony.species}"
        loading="lazy"
      />
    </div>
    <div class="pony-info">
      <h3>${pony.name}</h3>
      <p>${formatPersonality(pony.personality)} ${pony.species} who loves ${formatTalent(
        pony.talent
      )}.</p>
      ${jobMarkup}
      <p class="pony-skill">Colors: ${pony.body_color} + ${pony.mane_color}</p>
    </div>
    ${
      ponyId
        ? `<div class="pony-actions">
      <button class="btn ghost small" type="button" data-pony-backstory="${ponyId}">
        Read Backstory
      </button>
      <button class="btn ghost small" type="button" data-pony-action="sprites" data-pony-id="${ponyId}">
        Generate Sprites
      </button>
      <button class="btn ghost small" type="button" data-pony-action="spritesheet" data-pony-id="${ponyId}">
        Pack Sheet
      </button>
      <button class="btn ghost small" type="button" data-pony-sheet="${sheetPath}" data-pony-meta="${metaPath}">
        Show Spritesheet
      </button>
    </div>
    <p class="pony-status" data-pony-status></p>`
        : ""
    }
    <div class="pony-sheet-preview" hidden>
      <p class="pony-sheet-status"></p>
      <img alt="${pony.name} spritesheet" loading="lazy" />
    </div>
  `;
  if (addToTop) {
    ponyGrid.prepend(card);
  } else {
    ponyGrid.append(card);
  }
  const portrait = card.querySelector(".pony-art img");
  if (portrait && fallbackImage) {
    portrait.addEventListener("error", () => {
      if (portrait.src.endsWith(fallbackImage)) return;
      portrait.src = fallbackImage;
    });
  }
};

export const loadPonies = async () => {
  if (!ponyGrid) return;
  try {
    const response = await fetch("data/ponies.json");
    if (!response.ok) {
      throw new Error("Unable to load pony data.");
    }
    const data = await response.json();
    ponyGrid.innerHTML = "";
    (data.ponies || []).forEach((pony) => {
      const imagePath = `assets/ponies/${pony.slug}.png`;
      renderPonyCard(pony, imagePath);
    });
  } catch (error) {
    ponyGrid.innerHTML = `<p class="pony-grid-note">${error.message} Run the local server to see generated images.</p>`;
  }
};

const resolveSheetPath = (metaPath, meta, fallbackPath) => {
  const metaImage = meta && meta.meta && meta.meta.image ? meta.meta.image : "";
  const images =
    meta && meta.meta && Array.isArray(meta.meta.images) && meta.meta.images.length
      ? meta.meta.images
      : metaImage
        ? [metaImage]
        : [];
  const imageName = images[0] || "";
  if (!imageName) {
    return fallbackPath;
  }
  const basePath = metaPath.slice(0, metaPath.lastIndexOf("/") + 1);
  if (
    imageName.startsWith("/") ||
    imageName.startsWith("assets/") ||
    imageName.startsWith("../assets/")
  ) {
    return imageName;
  }
  return `${basePath}${imageName}`;
};

const updateCardStatus = (card, message) => {
  if (!card) return;
  const status = card.querySelector("[data-pony-status]");
  if (status) {
    status.textContent = message;
  }
};

const toggleCardButtons = (card, disabled) => {
  if (!card) return;
  const buttons = card.querySelectorAll("[data-pony-action]");
  buttons.forEach((button) => {
    button.disabled = disabled;
  });
};

export const bindPonyCardActions = () => {
  if (!ponyGrid) return;
  ponyGrid.addEventListener("click", async (event) => {
    const sheetButton = event.target.closest("[data-pony-sheet]");
    if (sheetButton) {
      const metaPath = sheetButton.dataset.ponyMeta || "";
      const fallbackSheet = sheetButton.dataset.ponySheet || "";
      const card = sheetButton.closest(".pony-card");
      if (!card) return;
      const preview = card.querySelector(".pony-sheet-preview");
      const status = card.querySelector(".pony-sheet-status");
      const image = card.querySelector(".pony-sheet-preview img");
      if (!preview || !status || !image) return;

      if (!metaPath && !fallbackSheet) {
        preview.hidden = false;
        status.textContent = "Spritesheet path not set.";
        image.hidden = true;
        return;
      }

      if (!preview.hidden && image.src) {
        preview.hidden = true;
        return;
      }

      preview.hidden = false;
      status.textContent = "Loading spritesheet...";
      image.hidden = true;

      try {
        let sheetPath = fallbackSheet;
        if (metaPath) {
          try {
            const sheetMeta = await loadJson(`${metaPath}?t=${Date.now()}`);
            sheetPath = resolveSheetPath(metaPath, sheetMeta, fallbackSheet);
          } catch (error) {
            if (!fallbackSheet) {
              throw error;
            }
          }
        }
        if (!sheetPath) {
          throw new Error("Spritesheet path not set.");
        }
        const sheetImage = await loadImageCandidates(getWebpCandidates(sheetPath), {
          cacheBust: Date.now(),
        });
        if (!sheetImage) {
          throw new Error("Spritesheet not found.");
        }
        image.src = sheetImage.src;
        image.hidden = false;
        status.textContent = "Spritesheet loaded.";
      } catch (error) {
        status.textContent = "Spritesheet not found. Generate and pack first.";
        image.hidden = true;
      }
      return;
    }

    const button = event.target.closest("[data-pony-action]");
    if (!button) return;
    const ponyId = button.dataset.ponyId;
    const action = button.dataset.ponyAction;
    const card = button.closest(".pony-card");
    if (!ponyId || !action) return;
    if (!HAS_API) {
      updateCardStatus(card, "Sprite generation is available in the local/dev version.");
      return;
    }

    updateCardStatus(card, "Working on sprites...");
    toggleCardButtons(card, true);

    try {
      const body = action === "sprites" ? { use_portrait: true } : {};
      const response = await fetch(apiUrl(`/ponies/${ponyId}/${action}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Sprite task failed.");
      }
      updateCardStatus(card, data.message || "Done.");
    } catch (error) {
      updateCardStatus(card, error.message);
    } finally {
      toggleCardButtons(card, false);
    }
  });
  ponyGrid.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-pony-backstory]");
    if (!button) return;
    const ponyId = button.dataset.ponyBackstory;
    if (!ponyId) return;
    const card = button.closest(".pony-card");
    const ponyName = card ? card.querySelector("h3")?.textContent : "Pony";
    const ponyImage = card ? card.querySelector(".pony-art img")?.src : "";
    try {
      const backstories = await loadBackstories();
      const story = backstories[ponyId] || "";
      showBackstoryModal(ponyName || "Pony", story, ponyImage);
    } catch (error) {
      showBackstoryModal(ponyName || "Pony", "", ponyImage);
    }
  });
};
