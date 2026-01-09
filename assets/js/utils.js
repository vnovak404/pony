// Pony Parade: shared utility helpers.

export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const unique = (list) => Array.from(new Set(list));

export const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });

const appendCacheBust = (path, cacheBust) => {
  if (!cacheBust) return path;
  return path.includes("?") ? `${path}&v=${cacheBust}` : `${path}?v=${cacheBust}`;
};

export const getWebpCandidates = (path) => {
  if (!path) return [];
  const [base, query = ""] = path.split("?");
  const suffix = query ? `?${query}` : "";
  if (base.endsWith(".png")) {
    return [`${base.slice(0, -4)}.webp${suffix}`, `${base}${suffix}`];
  }
  return [path];
};

export const loadImageCandidates = async (paths, { cacheBust } = {}) => {
  let lastError = null;
  for (const path of paths) {
    try {
      return await loadImage(appendCacheBust(path, cacheBust));
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) {
    throw lastError;
  }
  throw new Error("Failed to load image candidates.");
};

export const loadImageWithFallback = (path, options) =>
  loadImageCandidates(getWebpCandidates(path), options);

export const loadJson = async (path) => {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.json();
};

export const formatTalent = (talent) => {
  const clean = (talent || "").trim();
  if (!clean) return "making friends";
  const hasIng = /\b\w+ing\b/i.test(clean);
  return hasIng ? clean : `doing ${clean}`;
};

export const formatPersonality = (personality) => {
  return (personality || "").trim() || "kind and curious";
};

export const toTitleCase = (value) =>
  String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
