import { els } from "./dom.js";

let lastMessage = "";

function normalizeMessage(message) {
  if (message === undefined || message === null) return "Unknown error.";
  if (typeof message === "string") return message;
  if (message?.message) return message.message;
  try {
    return JSON.stringify(message, null, 2);
  } catch (error) {
    return String(message);
  }
}

export function showError(message) {
  const text = normalizeMessage(message);
  lastMessage = text;
  if (els.errorMessage) {
    els.errorMessage.textContent = text;
  }
  if (els.errorModal) {
    els.errorModal.removeAttribute("hidden");
  } else {
    alert(text);
  }
}

export function hideError() {
  if (els.errorModal) {
    els.errorModal.setAttribute("hidden", "true");
  }
}

export async function copyError() {
  const text = lastMessage || els.errorMessage?.textContent || "";
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    const field = document.createElement("textarea");
    field.value = text;
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    document.execCommand("copy");
    document.body.removeChild(field);
  }
  if (els.errorCopy) {
    const original = els.errorCopy.textContent;
    els.errorCopy.textContent = "Copied";
    setTimeout(() => {
      if (els.errorCopy) els.errorCopy.textContent = original;
    }, 1200);
  }
}
