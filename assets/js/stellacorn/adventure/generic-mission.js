import {
  applyFlagUpdates,
  evaluateConditions,
  markTalkedTo,
  seedFirstTimeFlags,
} from "./dialog_state.js";

const GLOBAL_FLAGS_KEY = "PP_GLOBAL_FLAGS_V1";

export function createMission(runtime, ui) {
  const missionConfig = runtime.getMissionConfig?.() || {};
  const missionData = missionConfig.mission || missionConfig || {};
  const dialog = missionData.dialog || {};
  const narrative = missionData.narrative || {};
  const nodes = dialog.nodes || [];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  const state = {
    localFlags: new Map(Object.entries(missionData.flags?.local || {})),
    globalFlags: loadGlobalFlags(),
    talkedTo: new Set(),
    events: new Map(),
    objectives: (missionData.objectives || []).map((objective) => ({
      ...objective,
      progress: objective.progress || 0,
      completed: false,
    })),
  };

  const objectsById = new Map(runtime.getObjects().map((obj) => [obj.id, obj]));
  const interactionMap = new Map();

  const targetIds = new Set([
    ...Array.from(objectsById.keys()),
    ...Object.keys(dialog.startByTarget || {}),
    ...(missionData.interactions || []).map((entry) => entry.targetId),
  ].filter(Boolean));
  seedFirstTimeFlags(Array.from(targetIds), state);

  initInteractions();
  initUI();
  loadGlobalFlagsFromServer();
  initNarrative();
  initCheckpointDebug();

  runtime.setInteractionHandler((target, action) => {
    const interaction = interactionMap.get(target.id);
    if (interaction && !evaluateConditions(interaction.conditions || [], state)) {
      return;
    }
    handleInteraction(target, action, interaction);
  });

  runtime.setVisibilityHandler(() => {
    handleEnterZones();
  });

  function initInteractions() {
    const interactions = missionData.interactions || [];
    interactions.forEach((entry) => {
      if (!entry?.targetId) return;
      const target = objectsById.get(entry.targetId);
      if (!target) return;
      const durationMs =
        entry.durationMs ??
        (entry.duration != null ? Math.round(entry.duration * 1000) : null) ??
        2000;
      const interaction = {
        key: entry.key || resolveKey(entry.action),
        label: entry.label || resolveLabel(entry.action),
        durationMs,
        action: entry.action || "interact",
        dialog: entry.dialog,
        conditions: entry.conditions || [],
        setFlags: entry.setFlags || [],
        setGlobalFlags: entry.setGlobalFlags || [],
      };
      runtime.setInteraction(target, interaction);
      interactionMap.set(target.id, interaction);
    });

    const startByTarget = dialog.startByTarget || {};
    Object.entries(startByTarget).forEach(([targetId, dialogId]) => {
      if (interactionMap.has(targetId)) return;
      const target = objectsById.get(targetId);
      if (!target) return;
      const interaction = {
        key: "i",
        label: "Hold I to talk",
        durationMs: 1800,
        action: "talk",
        dialog: dialogId,
      };
      runtime.setInteraction(target, interaction);
      interactionMap.set(targetId, interaction);
    });
  }

  function initUI() {
    if (ui?.objectiveEl) {
      ui.objectiveEl.textContent = missionData.summary || missionData.title || "Mission in progress.";
    }
    renderObjectives();
  }

  function initNarrative() {
    const entry = dialog.entry;
    if (entry) {
      openDialog(entry, null);
      return;
    }
    const intro = narrative.intro;
    if (intro) {
      if (intro.dialog) {
        openDialog(intro.dialog, null);
      } else {
        openNarrative(intro);
      }
    }
  }

  function initCheckpointDebug() {
    const debug = new URLSearchParams(window.location.search).get("debug") === "1";
    if (!debug) return;
    const checkpoints = missionData.checkpoints || [];
    if (!checkpoints.length) return;
    const panel = document.createElement("div");
    panel.className = "debug-checkpoints";
    const label = document.createElement("span");
    label.textContent = "Checkpoint:";
    const select = document.createElement("select");
    const optionDefault = document.createElement("option");
    optionDefault.value = "";
    optionDefault.textContent = "Select";
    select.appendChild(optionDefault);
    const objectLookup = new Map(runtime.getObjects().map((obj) => [obj.id, obj]));
    checkpoints.forEach((checkpoint) => {
      if (!checkpoint) return;
      const option = document.createElement("option");
      option.value = checkpoint.id || "";
      option.textContent = checkpoint.label || checkpoint.id || "Checkpoint";
      let tx = checkpoint.tx;
      let ty = checkpoint.ty;
      if (checkpoint.targetId && objectLookup.has(checkpoint.targetId)) {
        const obj = objectLookup.get(checkpoint.targetId);
        tx = obj.tx;
        ty = obj.ty;
      }
      option.dataset.tx = tx;
      option.dataset.ty = ty;
      select.appendChild(option);
    });
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Jump";
    button.addEventListener("click", () => {
      const selected = select.selectedOptions[0];
      const tx = Number(selected?.dataset?.tx);
      const ty = Number(selected?.dataset?.ty);
      if (!Number.isInteger(tx) || !Number.isInteger(ty)) return;
      runtime.setPlayerTile?.(tx, ty);
    });
    panel.appendChild(label);
    panel.appendChild(select);
    panel.appendChild(button);
    document.body.appendChild(panel);
  }

  function renderObjectives() {
    if (!ui?.questsEl) return;
    ui.questsEl.innerHTML = "";
    state.objectives.forEach((objective) => {
      const row = document.createElement("div");
      row.className = "quest";
      const label = document.createElement("div");
      label.textContent = objective.label || objective.type || "Objective";
      const status = document.createElement("div");
      status.className = "quest-status";
      status.textContent = objective.completed ? "complete" : "active";
      row.appendChild(label);
      row.appendChild(status);
      if (objective.targetCount) {
        const progress = document.createElement("div");
        progress.className = "quest-progress";
        progress.textContent = `${objective.progress}/${objective.targetCount}`;
        row.appendChild(progress);
      }
      ui.questsEl.appendChild(row);
    });
    checkMissionCompletion();
  }

  function resolveKey(action) {
    if (action === "heal") return "h";
    return "i";
  }

  function resolveLabel(action) {
    if (action === "heal") return "Hold H to heal";
    if (action === "talk") return "Hold I to talk";
    return "Hold I to interact";
  }

  function handleInteraction(target, action, interaction) {
    const dialogId = interaction?.dialog || dialog.startByTarget?.[target.id];
    if (dialogId) {
      openDialog(dialogId, target);
    }
    if (action === "talk") {
      markTalkedTo(target.id, state);
    }
    handleNarrativeInteract(target, interaction);
    if (action === "heal") {
      incrementObjective("heal_count");
    }
    if (action === "magic") {
      incrementObjective("magic_count");
    }
    if (interaction) {
      applyFlagUpdates(interaction.setFlags, state);
      applyFlagUpdates(
        (interaction.setGlobalFlags || []).map((flag) => ({ ...flag, scope: "global" })),
        state
      );
      persistGlobalFlags();
    }
    incrementObjectiveByAction(action);
    renderObjectives();
  }

  function incrementObjectiveByAction(action) {
    if (action === "talk") {
      incrementObjective("talk_count");
    }
    if (action === "interact") {
      incrementObjective("interact_count");
    }
  }

  function incrementObjective(type) {
    state.objectives.forEach((objective) => {
      if (objective.type !== type || objective.completed) return;
      objective.progress = (objective.progress || 0) + 1;
      const targetCount = objective.targetCount || 1;
      if (objective.progress >= targetCount) {
        objective.completed = true;
      }
    });
  }

  function handleEnterZones() {
    const zones = missionData.zones || [];
    const triggers = missionData.triggers?.onEnterZones || [];
    const narrativeZones = narrative.onEnterZones || [];
    if (!zones.length || (!triggers.length && !narrativeZones.length)) return;
    const player = runtime.getPlayerTile?.();
    if (!player) return;

    triggers.forEach((trigger) => {
      const once = trigger.once !== false;
      if (once && state.events.get(trigger.id)) return;
      if (!evaluateConditions(trigger.conditions || [], state)) return;
      const zone = zones.find((entry) => entry.id === trigger.zoneId);
      if (!zone || !zone.rect) return;
      const inside =
        player.tx >= zone.rect.x &&
        player.tx <= zone.rect.x + zone.rect.w &&
        player.ty >= zone.rect.y &&
        player.ty <= zone.rect.y + zone.rect.h;
      if (!inside) return;
      if (once) {
        state.events.set(trigger.id, true);
      }
      applyFlagUpdates(trigger.setFlags || [], state);
      applyFlagUpdates(
        (trigger.setGlobalFlags || []).map((flag) => ({ ...flag, scope: "global" })),
        state
      );
      if (trigger.setGlobalFlags?.length) {
        persistGlobalFlags();
      }
      if (trigger.dialog) {
        openDialog(trigger.dialog, null);
      }
    });

    narrativeZones.forEach((entry, idx) => {
      if (!entry) return;
      const eventId = entry.id || `narrative_zone_${idx}`;
      const once = entry.once !== false;
      if (once && state.events.get(eventId)) return;
      if (!evaluateConditions(entry.conditions || [], state)) return;
      const zone = zones.find((item) => item.id === entry.zoneId);
      if (!zone || !zone.rect) return;
      const inside =
        player.tx >= zone.rect.x &&
        player.tx <= zone.rect.x + zone.rect.w &&
        player.ty >= zone.rect.y &&
        player.ty <= zone.rect.y + zone.rect.h;
      if (!inside) return;
      if (once) {
        state.events.set(eventId, true);
      }
      applyFlagUpdates(entry.setFlags || [], state);
      applyFlagUpdates(
        (entry.setGlobalFlags || []).map((flag) => ({ ...flag, scope: "global" })),
        state
      );
      if (entry.setGlobalFlags?.length) {
        persistGlobalFlags();
      }
      if (entry.dialog) {
        openDialog(entry.dialog, null);
      } else if (entry.text) {
        openNarrative(entry);
      }
    });
  }

  function openDialog(dialogId, target) {
    const node = nodeMap.get(dialogId);
    if (!node) {
      runtime.openDialog("...", target?.asset ? { src: target.asset } : null);
      return;
    }
    const choices = (node.choices || []).filter((choice) =>
      evaluateConditions(choice.conditions || [], state)
    );
    runtime.openDialogNode({
      text: (node.text || []).join("\n"),
      hero: target?.asset ? { src: target.asset, alt: target.name } : null,
      choices: choices.map((choice) => ({
        id: choice.id,
        text: choice.text,
        to: choice.to,
        conditions: choice.conditions,
        setFlags: choice.setFlags,
        setGlobalFlags: choice.setGlobalFlags,
      })),
      onChoice: (choice) => {
        applyFlagUpdates(choice.setFlags || [], state);
        applyFlagUpdates(
          (choice.setGlobalFlags || []).map((flag) => ({ ...flag, scope: "global" })),
          state
        );
        persistGlobalFlags();
        if (choice.to) {
          openDialog(choice.to, target);
        } else {
          runtime.closeDialog();
        }
      },
      onNext: node.next
        ? () => {
            openDialog(node.next, target);
          }
        : null,
    });
  }

  function openNarrative(block) {
    const text = Array.isArray(block)
      ? block.join("\n")
      : typeof block === "string"
        ? block
        : Array.isArray(block?.text)
          ? block.text.join("\n")
          : block?.text;
    runtime.openDialogNode({
      text: text || "...",
      hero: block?.hero || null,
      onNext: () => runtime.closeDialog(),
    });
  }

  function handleNarrativeInteract(target, interaction) {
    const list = narrative.onInteract || [];
    if (!list.length) return;
    list.forEach((entry, idx) => {
      if (!entry) return;
      if (entry.targetId && entry.targetId !== target.id) return;
      const eventId = entry.id || `narrative_interact_${target.id}_${idx}`;
      if (entry.once && state.events.get(eventId)) return;
      if (!evaluateConditions(entry.conditions || [], state)) return;
      state.events.set(eventId, true);
      applyFlagUpdates(entry.setFlags || [], state);
      applyFlagUpdates(
        (entry.setGlobalFlags || []).map((flag) => ({ ...flag, scope: "global" })),
        state
      );
      if (entry.setGlobalFlags?.length) {
        persistGlobalFlags();
      }
      if (entry.dialog) {
        openDialog(entry.dialog, target);
      } else if (entry.text) {
        openNarrative(entry);
      }
    });
  }

  function checkMissionCompletion() {
    if (state.events.get("mission_complete")) return;
    if (!state.objectives.length) return;
    const allDone = state.objectives.every((objective) => objective.completed);
    if (!allDone) return;
    state.events.set("mission_complete", true);
    const outro = narrative.outro;
    if (outro) {
      if (outro.dialog) {
        openDialog(outro.dialog, null);
        return;
      }
      const text = Array.isArray(outro)
        ? outro.join("\n")
        : typeof outro === "string"
          ? outro
          : Array.isArray(outro?.text)
            ? outro.text.join("\n")
            : outro?.text;
      runtime.openDialogNode({
        text: text || "Mission complete!",
        onNext: () => {
          runtime.closeDialog();
          if (missionData.returnToMapOnComplete) {
            runtime.returnToWorldMap?.();
          }
        },
      });
    }
  }

  function loadGlobalFlags() {
    try {
      const stored = localStorage.getItem(GLOBAL_FLAGS_KEY);
      if (!stored) return new Map();
      const parsed = JSON.parse(stored);
      return new Map(Object.entries(parsed || {}));
    } catch (error) {
      return new Map();
    }
  }

  function persistGlobalFlags() {
    const payload = Object.fromEntries(state.globalFlags.entries());
    localStorage.setItem(GLOBAL_FLAGS_KEY, JSON.stringify(payload));
    saveGlobalFlagsToServer(payload);
  }

  async function loadGlobalFlagsFromServer() {
    try {
      const response = await fetch("/api/mission-progress", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      const globals = data?.globals || {};
      state.globalFlags = new Map(Object.entries(globals));
    } catch (error) {
      // Ignore server load failures.
    }
  }

  async function saveGlobalFlagsToServer(globals) {
    try {
      await fetch("/api/mission-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: 1, globals, missions: {} }),
      });
    } catch (error) {
      // Ignore server save failures.
    }
  }
}
