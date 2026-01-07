// Pony Parade: pony creation form wiring.

import {
  ponyForm,
  ponyResult,
  ponyNameButton,
  ponyNameInput,
  ponyBodyInput,
  ponyManeInput,
  ponyAccentInput,
  ponyTalentInput,
  ponyPersonalityInput,
} from "./dom.js";
import { ensureVibes, applySuggestions, buildRandomName } from "./vibes.js";
import { renderPonyCard } from "./pony-cards.js";

const fieldInputs = {
  body_color: ponyBodyInput,
  mane_color: ponyManeInput,
  accent_color: ponyAccentInput,
  talent: ponyTalentInput,
  personality: ponyPersonalityInput,
};

export const initPonyForm = () => {
  const vibeReady = ensureVibes();

  if (ponyNameButton && ponyNameInput) {
    ponyNameButton.addEventListener("click", async () => {
      await vibeReady;
      const name = buildRandomName();
      ponyNameInput.value = name;
      applySuggestions(name, fieldInputs, false);
      ponyNameInput.focus();
    });
  }

  if (ponyNameInput) {
    ponyNameInput.addEventListener("blur", async () => {
      await vibeReady;
      applySuggestions(ponyNameInput.value.trim(), fieldInputs, true);
    });
  }

  if (ponyForm) {
    ponyForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (ponyResult) {
        ponyResult.textContent = "Creating your pony...";
      }
      const formData = new FormData(ponyForm);
      const payload = Object.fromEntries(formData.entries());
      if (!payload.name || !payload.name.trim()) {
        if (ponyResult) {
          ponyResult.textContent = "Please give your pony a name.";
        }
        return;
      }

      const submitButton = ponyForm.querySelector("button[type='submit']");
      if (submitButton) {
        submitButton.disabled = true;
      }

      try {
        const response = await fetch("/api/ponies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Something went wrong.");
        }

        renderPonyCard(data.pony, `${data.image_path}?t=${Date.now()}`, true);
        if (ponyResult) {
          ponyResult.textContent = `${data.pony.name} joined the parade!`;
        }
        ponyForm.reset();
      } catch (error) {
        if (ponyResult) {
          ponyResult.textContent = error.message;
        }
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
        }
      }
    });
  }
};
