export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function slugify(value) {
  if (!value) return "";
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export function isTimeoutError(error) {
  const message = error?.message || "";
  return message.includes("timeout") || message.includes("timed out");
}

export function parseBatchList(text) {
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*\d+\.?\s*/, "").trim())
    .filter(Boolean);
}

export function resolveActionKey(action) {
  if (action === "heal") return "H";
  return "I";
}

export function resolveActionLabel(action) {
  switch (action) {
    case "heal":
      return "Heal";
    case "talk":
      return "Talk";
    case "magic":
      return "Magic";
    default:
      return "Interact";
  }
}
