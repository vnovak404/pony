// Pony Parade: magic wand helpers.

const resetActorState = (actor) => {
  if (!actor || !actor.stats) return;
  actor.stats.health = 100;
  actor.stats.hunger = 0;
  actor.stats.thirst = 0;
  actor.stats.boredom = 0;
  actor.stats.tiredness = 0;
  actor.task = null;
  actor.pendingRepairId = null;
  actor.path = null;
  actor.pathIndex = 0;
  actor.pathTargetKey = null;
  actor.pathBlockedUntil = 0;
  actor.sleepUntil = 0;
  actor.sleepSpotIndex = null;
  actor.sleepSpotOwner = null;
  actor.restTarget = null;
  actor.workUntil = 0;
  actor.workTargetId = null;
  actor.repairUntil = 0;
  actor.repairTargetId = null;
  actor.eatUntil = 0;
  actor.eatTargetId = null;
  actor.drinkUntil = 0;
  actor.drinkTargetId = null;
  actor.funUntil = 0;
  actor.funTargetId = null;
  actor.vetUntil = 0;
  actor.vetTargetId = null;
  actor.workCooldownUntil = 0;
  actor.eatCooldownUntil = 0;
  actor.drinkCooldownUntil = 0;
  actor.funCooldownUntil = 0;
  actor.vetCooldownUntil = 0;
  actor.homeCooldownUntil = 0;
  actor.innCooldownUntil = 0;
};

export const createMagicWand = ({
  mapStatus,
  inventoryState,
  ingredientState,
  houseStates,
  actors,
}) => {
  const applyMagicWand = () => {
    inventoryState.forEach((entry) => {
      if (!entry) return;
      entry.current = entry.max;
    });
    ingredientState.forEach((entry) => {
      if (!entry) return;
      entry.current = entry.max;
    });
    houseStates.forEach((state) => {
      if (!state) return;
      state.condition = 1;
      state.status = "ok";
      state.repairingUntil = 0;
      state.repairingBy = null;
    });
    actors.forEach((actor) => resetActorState(actor));
    if (mapStatus) {
      mapStatus.textContent = "Magic wand: everything is restored.";
    }
  };

  const bindMagicWandButton = (quickbar) => {
    if (!quickbar) return;
    const magicButton = quickbar.querySelector('[data-quickbar-action="magic"]');
    if (!magicButton) return;
    magicButton.addEventListener("click", (event) => {
      event.preventDefault();
      applyMagicWand();
    });
  };

  return { applyMagicWand, bindMagicWandButton };
};
