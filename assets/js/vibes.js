// Pony Parade: vibe suggestion engine.

import { pick, unique } from "./utils.js";

const fallbackVibe = {
  body_colors: ["sunny yellow", "soft lavender", "buttercream"],
  mane_colors: ["royal purple", "sunshine yellow", "violet"],
  accent_colors: ["gold", "lavender mist", "cream"],
  talents: [
    "cloud sculpting",
    "star catching",
    "garden growing",
    "rainbow building",
    "sparkle sprinkling",
  ],
  personalities: ["cheerful and gentle", "curious and brave", "kind and thoughtful"],
};

const vibeState = {
  defaults: fallbackVibe,
  groups: [],
  termMap: new Map(),
  allTerms: [],
};

const normalizeTerm = (term) => term.toLowerCase();

const setVibeData = (data) => {
  const groups = Array.isArray(data.vibes) ? data.vibes : [];
  const defaults = data.defaults || fallbackVibe;
  const termMap = new Map();
  const allTerms = [];

  groups.forEach((group) => {
    (group.terms || []).forEach((term) => {
      const key = normalizeTerm(term);
      if (!termMap.has(key)) {
        termMap.set(key, group);
      }
      allTerms.push(term);
    });
  });

  vibeState.defaults = defaults;
  vibeState.groups = groups;
  vibeState.termMap = termMap;
  vibeState.allTerms = allTerms;
};

const loadVibes = async () => {
  try {
    const response = await fetch("/data/pony_vibes.json");
    if (!response.ok) {
      throw new Error("Unable to load vibe data.");
    }
    const data = await response.json();
    setVibeData(data);
  } catch (error) {
    console.warn("Using fallback vibe data.", error);
  }
};

let vibeReady = null;
export const ensureVibes = () => {
  if (!vibeReady) {
    vibeReady = loadVibes();
  }
  return vibeReady;
};

const gatherOptions = (vibes, key) => {
  const options = [];
  vibes.forEach((vibe) => {
    (vibe[key] || []).forEach((item) => options.push(item));
  });
  return unique(options);
};

const pickFrom = (vibes, key, fallback) => {
  const options = gatherOptions(vibes, key);
  if (!options.length) return fallback;
  return pick(options);
};

const getVibesForName = (name) => {
  const tokens = name
    .split(/[^a-zA-Z]+/)
    .filter(Boolean)
    .map((token) => normalizeTerm(token));
  const vibes = tokens
    .map((token) => vibeState.termMap.get(token))
    .filter(Boolean);
  return vibes.length ? vibes : [vibeState.defaults];
};

const buildSuggestions = (name) => {
  const vibes = getVibesForName(name);
  const defaults = vibeState.defaults;
  return {
    body_color: pickFrom(
      vibes,
      "body_colors",
      pickFrom([defaults], "body_colors", "sunny yellow")
    ),
    mane_color: pickFrom(
      vibes,
      "mane_colors",
      pickFrom([defaults], "mane_colors", "royal purple")
    ),
    accent_color: pickFrom(
      vibes,
      "accent_colors",
      pickFrom([defaults], "accent_colors", "buttercream")
    ),
    talent: pickFrom(
      vibes,
      "talents",
      pickFrom([defaults], "talents", "making friends")
    ),
    personality: pickFrom(
      vibes,
      "personalities",
      pickFrom([defaults], "personalities", "kind and curious")
    ),
  };
};

export const applySuggestions = (name, fields, fillEmptyOnly = true) => {
  if (!name) return;
  const suggestions = buildSuggestions(name);

  Object.entries(fields).forEach(([key, input]) => {
    if (!input) return;
    if (fillEmptyOnly && input.value.trim()) return;
    input.value = suggestions[key];
  });
};

export const buildRandomName = () => {
  const terms = vibeState.allTerms.length
    ? vibeState.allTerms
    : [
        "Sunrise",
        "Luna",
        "Cocoa",
        "Golden",
        "Sparkle",
        "Velvet",
        "Honey",
        "Nova",
        "Willow",
        "Pepper",
      ];
  let first = pick(terms);
  let second = pick(terms);
  let guard = 0;
  while (second === first && guard < 5) {
    second = pick(terms);
    guard += 1;
  }
  return `${first} ${second}`;
};
