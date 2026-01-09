// Pony Parade: map entrypoint.

import { ponyMap, mapStatus } from "../dom.js";
import { loadJson } from "../utils.js";
import { initMap } from "./core.js";

const loadRuntimeState = async () => {
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json();
    if (!payload || typeof payload !== "object") return null;
    return payload;
  } catch (error) {
    return null;
  }
};

export const loadMap = async () => {
  if (!ponyMap || !mapStatus) return;
  mapStatus.textContent = "Loading map...";
  try {
    const mapData = await loadJson("/assets/world/maps/ponyville.json");
    const ponyData = await loadJson("/data/ponies.json");
    const runtimeState = await loadRuntimeState();
    let locationData = { locations: [] };
    try {
      locationData = await loadJson("/data/world_locations.json");
    } catch (error) {
      locationData = { locations: [] };
    }
    await initMap(
      mapData,
      ponyData.ponies || [],
      locationData.locations || [],
      runtimeState
    );
  } catch (error) {
    mapStatus.textContent = "Map unavailable. Generate sprites to see ponies move.";
  }
};
