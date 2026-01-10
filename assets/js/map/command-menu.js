// Pony Parade: command menu + quickbar helpers.

export const createCommandMenu = ({
  ponyMap,
  actors,
  actorBySlug,
  getWebpCandidates,
  getStructureLabel,
  getSpotForLocationId,
  foodSpotById,
  drinkSpotById,
  funSpotById,
  healthSpotById,
  housesById,
  innObject,
}) => {
  const commandMenu = document.getElementById("pony-command-menu");
  const commandTitle = commandMenu
    ? commandMenu.querySelector(".pony-command-title")
    : null;
  const commandStats = commandMenu
    ? commandMenu.querySelector("[data-command-stats]")
    : null;
  const commandTargetLabel = commandMenu
    ? commandMenu.querySelector("[data-command-target]")
    : null;
  const commandRepairButton = commandMenu
    ? commandMenu.querySelector('[data-command="repair"]')
    : null;
  let commandTarget = null;
  const lastCommandStatsUpdate = { value: 0 };

  const hideCommandMenu = () => {
    if (!commandMenu) return;
    commandMenu.hidden = true;
    commandTarget = null;
  };

  const resolveTaskLabel = (actor, now) => {
    if (!actor) return "Heading: Wandering";
    const task = actor.task;
    if (task && task.type === "eat") {
      const spot = foodSpotById.get(task.foodId);
      return spot ? `Heading: ${getStructureLabel(spot)}` : "Heading: Food spot";
    }
    if (task && task.type === "drink") {
      const spot = drinkSpotById.get(task.drinkId);
      return spot
        ? `Heading: ${getStructureLabel(spot)}`
        : "Heading: Drink spot";
    }
    if (task && task.type === "fun") {
      const spot = funSpotById.get(task.funId);
      return spot ? `Heading: ${getStructureLabel(spot)}` : "Heading: Fun spot";
    }
    if (task && task.type === "restock") {
      const targetSpot = task.targetLocationId
        ? getSpotForLocationId(task.targetLocationId)
        : null;
      const sourceSpot = task.sourceLocationId
        ? getSpotForLocationId(task.sourceLocationId)
        : null;
      if (task.phase === "pickup") {
        return sourceSpot
          ? `Heading: ${getStructureLabel(sourceSpot)}`
          : "Heading: Gathering supplies";
      }
      if (task.phase === "deliver") {
        return targetSpot
          ? `Heading: Restock ${getStructureLabel(targetSpot)}`
          : "Heading: Restocking";
      }
    }
    if (task && task.type === "supply") {
      const spot = getSpotForLocationId(task.locationId);
      return spot
        ? `Heading: Harvesting at ${getStructureLabel(spot)}`
        : "Heading: Gathering supplies";
    }
    if (task && task.type === "work") {
      const spot = getSpotForLocationId(task.locationId);
      return spot
        ? `Heading: Stocking ${getStructureLabel(spot)}`
        : "Heading: Stocking";
    }
    if (task && task.type === "vet") {
      const spot = healthSpotById.get(task.clinicId);
      return spot ? `Heading: ${getStructureLabel(spot)}` : "Heading: Vet clinic";
    }
    if (task && task.type === "rest") {
      if (task.houseId) {
        const house = housesById.get(task.houseId);
        return house ? `Heading: ${getStructureLabel(house)}` : "Heading: Home";
      }
      if (task.inn && innObject) {
        return `Heading: ${getStructureLabel(innObject)}`;
      }
      return "Heading: Rest stop";
    }
    if (task && task.type === "repair") {
      if (task.phase === "pickup" && task.sourceLocationId) {
        const sourceSpot = getSpotForLocationId(task.sourceLocationId);
        return sourceSpot
          ? `Heading: ${getStructureLabel(sourceSpot)}`
          : "Heading: Repair supplies";
      }
      const house = housesById.get(task.houseId);
      return house ? `Heading: ${getStructureLabel(house)}` : "Heading: Repair";
    }
    if (actor.eatUntil > now && actor.eatTargetId) {
      const spot = foodSpotById.get(actor.eatTargetId);
      return spot ? `Eating at ${getStructureLabel(spot)}` : "Eating";
    }
    if (actor.drinkUntil > now && actor.drinkTargetId) {
      const spot = drinkSpotById.get(actor.drinkTargetId);
      return spot ? `Drinking at ${getStructureLabel(spot)}` : "Drinking";
    }
    if (actor.funUntil > now && actor.funTargetId) {
      const spot = funSpotById.get(actor.funTargetId);
      return spot ? `Frolicking at ${getStructureLabel(spot)}` : "Frolicking";
    }
    if (actor.vetUntil > now && actor.vetTargetId) {
      const spot = healthSpotById.get(actor.vetTargetId);
      return spot ? `At ${getStructureLabel(spot)}` : "At the clinic";
    }
    if (actor.repairUntil > now && actor.repairTargetId) {
      const house = housesById.get(actor.repairTargetId);
      return house ? `Repairing ${getStructureLabel(house)}` : "Repairing";
    }
    if (actor.sleepUntil > now && actor.restTarget) {
      if (actor.restTarget.kind === "house") {
        const house = housesById.get(actor.restTarget.id);
        return house ? `Resting at ${getStructureLabel(house)}` : "Resting";
      }
      if (actor.restTarget.kind === "inn" && innObject) {
        return `Resting at ${getStructureLabel(innObject)}`;
      }
      return "Resting";
    }
    return "Heading: Wandering";
  };

  const updateCommandStats = (now) => {
    if (!commandStats || !commandTarget) return;
    const stats = commandTarget.stats || {};
    const values = {
      health: Number.isFinite(stats.health) ? Math.round(stats.health) : 0,
      thirst: Number.isFinite(stats.thirst) ? Math.round(stats.thirst) : 0,
      hunger: Number.isFinite(stats.hunger) ? Math.round(stats.hunger) : 0,
      tiredness: Number.isFinite(stats.tiredness) ? Math.round(stats.tiredness) : 0,
      boredom: Number.isFinite(stats.boredom) ? Math.round(stats.boredom) : 0,
    };
    commandStats.querySelectorAll(".pony-command-stat").forEach((item) => {
      const key = item.dataset.stat;
      if (!key || !(key in values)) return;
      const valueEl = item.querySelector(".pony-command-value");
      if (valueEl) {
        valueEl.textContent = values[key];
      }
    });
    if (commandTargetLabel) {
      commandTargetLabel.textContent = resolveTaskLabel(commandTarget, now);
    }
  };

  const showCommandMenu = (actor, clientX, clientY) => {
    if (!commandMenu || !ponyMap) return;
    const cardRect = ponyMap.parentElement?.getBoundingClientRect();
    if (!cardRect) return;
    commandTarget = actor;
    if (commandTitle) {
      commandTitle.textContent = actor?.sprite?.pony?.name || "Pony";
    }
    if (commandRepairButton) {
      const ponySlug = (actor?.sprite?.pony?.slug || "").toLowerCase();
      const isBuilder = ponySlug === "taticorn";
      commandRepairButton.hidden = false;
      commandRepairButton.title = isBuilder ? "Repair House" : "Work shift";
      commandRepairButton.setAttribute(
        "aria-label",
        isBuilder ? "Repair House" : "Work shift"
      );
    }
    updateCommandStats(performance.now());
    commandMenu.hidden = false;
    const menuWidth = commandMenu.offsetWidth || 160;
    const menuHeight = commandMenu.offsetHeight || 100;
    let left = clientX - cardRect.left;
    let top = clientY - cardRect.top;
    const maxLeft = cardRect.width - menuWidth - 8;
    const maxTop = cardRect.height - menuHeight - 8;
    if (left > maxLeft) left = maxLeft;
    if (top > maxTop) top = maxTop;
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    commandMenu.style.left = `${left}px`;
    commandMenu.style.top = `${top}px`;
  };

  const renderPonyQuickbar = () => {
    const quickbar = document.getElementById("pony-quickbar");
    if (!quickbar) return;
    const list = quickbar.querySelector("[data-pony-quickbar-list]") || quickbar;
    list.innerHTML = "";
    actors.forEach((actor) => {
      const pony = actor.sprite?.pony;
      if (!pony || !pony.slug) return;
      const imagePath = `assets/ponies/${pony.slug}.png`;
      const [primaryImage, fallbackImage] = getWebpCandidates(imagePath);
      const button = document.createElement("button");
      const ponyName = pony.name || "Pony";
      button.type = "button";
      button.className = "pony-miniicon";
      button.dataset.ponySlug = pony.slug;
      button.dataset.ponyName = ponyName;
      button.title = ponyName;
      button.setAttribute("aria-label", `Commands for ${ponyName}`);
      const img = document.createElement("img");
      img.src = primaryImage || imagePath;
      img.alt = ponyName;
      img.loading = "lazy";
      if (fallbackImage) {
        img.dataset.fallback = fallbackImage;
        img.addEventListener("error", () => {
          if (img.src.endsWith(fallbackImage)) return;
          img.src = fallbackImage;
        });
      }
      button.appendChild(img);
      list.appendChild(button);
    });
  };

  const bindPonyQuickbar = () => {
    const quickbar = document.getElementById("pony-quickbar");
    if (!quickbar) return;
    const list = quickbar.querySelector("[data-pony-quickbar-list]") || quickbar;
    list.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    list.addEventListener("click", (event) => {
      const button = event.target.closest("[data-pony-slug]");
      if (!button) return;
      event.preventDefault();
      const slug = button.dataset.ponySlug;
      if (!slug) return;
      const actor = actorBySlug.get(slug);
      if (!actor) return;
      if (commandMenu && commandTarget === actor && !commandMenu.hidden) {
        hideCommandMenu();
        return;
      }
      const rect = button.getBoundingClientRect();
      const clientX = rect.left + rect.width / 2;
      const clientY = rect.top + rect.height / 2;
      showCommandMenu(actor, clientX, clientY);
    });
  };

  return {
    commandMenu,
    getCommandTarget: () => commandTarget,
    setCommandTarget: (actor) => {
      commandTarget = actor;
    },
    lastCommandStatsUpdate,
    hideCommandMenu,
    showCommandMenu,
    resolveTaskLabel,
    updateCommandStats,
    renderPonyQuickbar,
    bindPonyQuickbar,
  };
};
