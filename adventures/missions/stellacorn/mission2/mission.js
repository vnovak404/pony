export function createMission(runtime, ui) {
  const state = {
    objective: "Investigate the forest.",
    objectiveProgress: "",
  };

  updateObjective(state.objective, state.objectiveProgress);

  function updateObjective(text, progressText) {
    state.objective = text || "";
    state.objectiveProgress = progressText || "";
    if (ui.objectiveEl) {
      ui.objectiveEl.textContent = state.objective
        ? `Objective: ${state.objective}`
        : "Objective: Explore the forest.";
    }
    if (ui.objectiveProgressEl) {
      ui.objectiveProgressEl.textContent = state.objectiveProgress;
    }
  }
}
