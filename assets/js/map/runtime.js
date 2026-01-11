// Pony Parade: runtime state persistence.

export const createRuntimeSaver = ({
  HAS_API,
  apiUrl,
  actors,
  houseStates,
  inventoryState,
  ingredientState,
  intervalMs,
}) => {
  const saveRuntimeState = async () => {
    if (!actors.length) return;
    if (!HAS_API) return { ok: true, skipped: true };
    const payload = {
      version: 1,
      updatedAt: Date.now(),
      ponies: {},
      houses: {},
      inventory: {},
      ingredients: {},
    };
    actors.forEach((actor) => {
      const slug = actor.sprite.pony.slug;
      if (!slug) return;
      payload.ponies[slug] = {
        segmentId: actor.segment && actor.segment.id ? actor.segment.id : null,
        t: Number.isFinite(actor.t) ? actor.t : 0,
        direction: actor.direction === -1 ? -1 : 1,
        stats: actor.stats,
      };
    });
    houseStates.forEach((state, houseId) => {
      payload.houses[houseId] = {
        condition: state.condition,
        status: state.status,
        repairingUntil: state.repairingUntil || 0,
      };
    });
    inventoryState.forEach((entry, key) => {
      payload.inventory[key] = {
        current: entry.current,
        max: entry.max,
      };
    });
    ingredientState.forEach((entry) => {
      if (!entry || !entry.locationId || !entry.ingredient) return;
      if (!payload.ingredients[entry.locationId]) {
        payload.ingredients[entry.locationId] = {};
      }
      payload.ingredients[entry.locationId][entry.ingredient] = {
        current: entry.current,
        max: entry.max,
      };
    });
    try {
      await fetch(apiUrl("/state"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return { ok: true };
    } catch (error) {
      return { ok: false };
    }
  };

  const start = () => {
    window.setInterval(saveRuntimeState, intervalMs);
  };

  return { saveRuntimeState, start };
};
