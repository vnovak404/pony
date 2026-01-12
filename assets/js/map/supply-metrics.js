// Pony Parade: supply logging utilities.

export const createSupplyLogger = ({
  hasApi,
  actors,
  supplySources,
  getStructureLabel,
  getSpotIngredients,
  intervalMs = 30000,
}) => {
  let lastSupplyLog = 0;

  const logSupplyStatus = (now) => {
    if (!hasApi) return;
    if (now - lastSupplyLog < intervalMs) return;
    lastSupplyLog = now;
    const timeLabel = new Date().toLocaleTimeString();
    const taskCounts = {
      supply: 0,
      restock: 0,
      repair: 0,
      work: 0,
    };
    const supplyByIngredient = {};
    const restockByType = {};
    const ponySummary = [];
    actors.forEach((actor) => {
      const task = actor.task;
      if (task && task.type === "supply") {
        taskCounts.supply += 1;
        const ingredient = task.ingredient || "mixed";
        supplyByIngredient[ingredient] =
          (supplyByIngredient[ingredient] || 0) + 1;
      }
      if (task && task.type === "restock") {
        taskCounts.restock += 1;
        const type = task.supplyType || "unknown";
        restockByType[type] = (restockByType[type] || 0) + 1;
      }
      if (task && task.type === "repair") {
        taskCounts.repair += 1;
      }
      if (task && task.type === "work") {
        taskCounts.work += 1;
      }
      const ponyName = actor.sprite?.pony?.name || actor.sprite?.pony?.slug || "pony";
      const stats = actor.stats || {};
      ponySummary.push({
        pony: ponyName,
        hunger: Math.round(stats.hunger ?? 0),
        thirst: Math.round(stats.thirst ?? 0),
        boredom: Math.round(stats.boredom ?? 0),
        tiredness: Math.round(stats.tiredness ?? 0),
        health: Math.round(stats.health ?? 0),
        task: task ? task.type : "idle",
      });
    });
    console.groupCollapsed(`[Supply Metrics ${timeLabel}]`);
    console.log("Active tasks", {
      ...taskCounts,
      supplyByIngredient,
      restockByType,
    });
    if (ponySummary.length) {
      console.log("Pony stats", ponySummary);
    }
    if (supplySources.length) {
      console.log("Ingredients");
      supplySources.forEach((spot) => {
        const label = getStructureLabel(spot);
        const ingredients = getSpotIngredients(spot);
        const ingredientSummary = ingredients.length
          ? ingredients
              .map(
                (entry) => `${entry.ingredient}:${entry.current}/${entry.max}`
              )
              .join(", ")
          : "none";
        console.log(
          `${label} (${spot.locationId || spot.id}) ingredients ${ingredientSummary}`
        );
      });
    }
    console.groupEnd();
  };

  return { logSupplyStatus };
};
