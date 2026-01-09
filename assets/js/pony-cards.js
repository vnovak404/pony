// Pony Parade: pony card rendering and actions.

import { ponyGrid } from "./dom.js";
import {
  formatTalent,
  formatPersonality,
  getWebpCandidates,
  loadImageCandidates,
  loadJson,
} from "./utils.js";
import { HAS_API, apiUrl } from "./api_mode.js";

export const renderPonyCard = (pony, imagePath, addToTop = false) => {
  if (!ponyGrid) return;
  const ponyId = pony.slug || "";
  const sheetPath = pony.sprites && pony.sprites.sheet ? pony.sprites.sheet : "";
  const metaPath = pony.sprites && pony.sprites.meta ? pony.sprites.meta : "";
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
      <p class="pony-skill">Colors: ${pony.body_color} + ${pony.mane_color}</p>
    </div>
    ${
      ponyId
        ? `<div class="pony-actions">
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
  if (imageName.startsWith("/") || imageName.startsWith("assets/")) {
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
};
