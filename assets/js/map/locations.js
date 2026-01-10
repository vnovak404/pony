// Pony Parade: location helpers.

import { toTitleCase } from "../utils.js";

export const buildLocationIndex = (locations) => {
  const locationIndex = new Map();
  locations.forEach((location) => {
    if (location && location.id) {
      locationIndex.set(location.id, location);
    }
  });
  return locationIndex;
};

export const createStructureLabeler = (locationIndex) => {
  return (item) => {
    if (!item) return "Ponyville";
    const baseLabel = item.label ? item.label : null;
    const location = item.locationId && locationIndex.get(item.locationId);
    const label = baseLabel || location?.name || toTitleCase(item.id);
    const residents = Array.isArray(item.residents)
      ? item.residents.filter(Boolean)
      : [];
    if (residents.length) {
      return `${label} — home of ${residents.join(", ")}`;
    }
    return label;
  };
};
