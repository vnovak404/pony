export function createMission(runtime, ui) {
  const PROGRESS_KEY = "WF_PROGRESS_V1";
  const MISSION_ID = "WF_M1";

  const state = {
    objective: "Deliver salt to the deer.",
    objectiveProgress: "",
    worry: 0,
    healGoal: 6,
    healed: 0,
    triggered: {
      saltDropped: false,
      rabbitFootprints: false,
      rabbitSeen: false,
      hedgehogBerries: false,
      hedgehogTracks: false,
      foxLeaves: false,
      foxTrail: false,
      owlFeathers: false,
      owlTrail: false,
      badgerBurrow: false,
      badgerTrail: false,
      deerHoofprints: false,
      deerTrail: false,
      deerHealed: false,
      bloodTrailVisible: false,
      bloodTrailInvestigated: false,
      bearHealed: false,
      bearDialogOpen: false,
      bearDialogComplete: false,
      missionCompleteOpen: false,
      missionCompleteDone: false,
    },
  };

  const quests = [
    {
      id: "deliverSalt",
      label: "Deliver salt to the deer",
      status: "active",
      progress: "",
    },
    {
      id: "findDeer",
      label: "Find the deer",
      status: "locked",
      progress: "",
    },
    {
      id: "healAnimals",
      label: "Heal the animals",
      status: "locked",
      progress: `Healed ${state.healed}/${state.healGoal}`,
    },
    {
      id: "findBear",
      label: "Find the bear",
      status: "locked",
      progress: "",
    },
  ];
  const questMap = new Map(quests.map((quest) => [quest.id, quest]));

  const clues = {
    rabbitFootprints: runtime.findObject(
      (obj) => obj.type === "clue-rabbit-footprints-anchor"
    ),
    hedgehogBerries: runtime.findObject(
      (obj) => obj.type === "clue-hedgehog-berries-anchor"
    ),
    hedgehogTracks: runtime.findObject(
      (obj) => obj.type === "clue-hedgehog-tracks-anchor"
    ),
    foxLeaves: runtime.findObject(
      (obj) => obj.type === "clue-fox-leaves-anchor"
    ),
    owlFeathers: runtime.findObject(
      (obj) => obj.type === "clue-owl-feathers-anchor"
    ),
    badgerBurrow: runtime.findObject(
      (obj) => obj.type === "clue-badger-burrow-anchor"
    ),
    deerHoofprints: runtime.findObject(
      (obj) => obj.type === "clue-deer-hoofprints-anchor"
    ),
    bloodTrail: runtime.findObject(
      (obj) => obj.type === "clue-bear-blood-anchor"
    ),
  };

  const trails = {
    rabbit: collectTrail(["clue-rabbit-footprints-trail"]),
    hedgehog: collectTrail(["clue-hedgehog-trail"]),
    fox: collectTrail(["clue-fox-trail"]),
    owl: collectTrail(["clue-owl-trail"], ["clue-owl-feather-loose"]),
    badger: collectTrail(["clue-badger-trail"]),
    deer: collectTrail(["clue-deer-trail"]),
    bear: collectTrail(["clue-bear-trail"]),
  };

  Object.values(trails).forEach((trail) => hideTrail(trail));
  [trails.hedgehog, trails.fox, trails.owl, trails.badger, trails.deer, trails.bear].forEach(
    (trail) => blockTrail(trail)
  );
  if (clues.bloodTrail) {
    runtime.setHidden(clues.bloodTrail, true);
  }

  const saltDropoff = runtime.findObject((obj) =>
    obj.type.includes("prop-salt-dropoff")
  );
  if (saltDropoff) {
    runtime.setObjectType(saltDropoff, "prop-salt-dropoff-without-salt");
    runtime.setInteraction(saltDropoff, {
      key: "i",
      label: "Hold I to drop off salt",
      durationMs: 2000,
      action: "salt",
    });
  }

  const healData = {
    "animal-rabbit-sick": {
      healedType: "animal-rabbit-healed",
      message:
        "Thank you. Many of us have been getting sick. Please be careful out there.",
      counts: true,
    },
    "animal-hedgehog-sick": {
      healedType: "animal-hedgehog-healed",
      message:
        "You're kind to stop. The forest hasn't felt right lately...",
      counts: true,
    },
    "animal-fox-sick": {
      healedType: "animal-fox-healed",
      message: "I hid, but it didn't help. Others were hurt too.",
      counts: true,
    },
    "animal-owl-sick": {
      healedType: "animal-owl-healed",
      message: "The forest is being harmed on purpose. Be wary.",
      counts: true,
    },
    "animal-badger-sick": {
      healedType: "animal-badger-healed",
      message:
        "I've never seen wounds like these... something strong is hurt too.",
      counts: true,
    },
    "animal-deer-sick": {
      healedType: "animal-deer-healed",
      message:
        "I could not come to the salt. A great one was hurt... bleeding badly. You must find the bear.",
      counts: true,
    },
    "animal-bear-sick": {
      healedType: "animal-bear-healed",
      message:
        "Someone has been laying traps all over the forest. I tried to find them and punish them, but I was hurt doing so.",
      counts: false,
    },
  };

  runtime.getObjects().forEach((obj) => {
    if (healData[obj.type]) {
      runtime.setInteraction(obj, {
        key: "h",
        label: "Hold H to heal",
        durationMs: 6000,
        action: "heal",
      });
    }
  });

  setInvestigateInteraction(clues.rabbitFootprints, "rabbit-footprints");
  setInvestigateInteraction(clues.hedgehogTracks, "hedgehog-tracks");
  setInvestigateInteraction(clues.foxLeaves, "fox-trail");
  setInvestigateInteraction(clues.owlFeathers, "owl-trail");
  setInvestigateInteraction(clues.badgerBurrow, "badger-trail");
  setInvestigateInteraction(clues.deerHoofprints, "deer-trail");

  runtime.blockTile(5, 33);
  blockRect(2, 24, 8, 26);
  updateObjective(state.objective, state.objectiveProgress);
  renderQuests();

  runtime.setInteractionHandler((target, action) => {
    if (action === "salt") handleSaltDropoff(target);
    if (action === "heal") handleHeal(target, healData);
    if (action === "rabbit-footprints") handleRabbitFootprints(target);
    if (action === "hedgehog-tracks") handleHedgehogTracks(target);
    if (action === "fox-trail") handleFoxTrail(target);
    if (action === "owl-trail") handleOwlTrail(target);
    if (action === "badger-trail") handleBadgerTrail(target);
    if (action === "deer-trail") handleDeerTrail(target);
    if (action === "bear-trail") handleBearTrail(target);
  });

  runtime.setVisibilityHandler(() => {
    if (runtime.isDialogOpen?.()) return;

    if (state.triggered.missionCompleteOpen) {
      state.triggered.missionCompleteOpen = false;
      state.triggered.missionCompleteDone = true;
      markMissionCleared();
      runtime.returnToWorldMap?.();
      if (!runtime.returnToWorldMap) {
        window.location.href = "world-map.html";
      }
      return;
    }

    if (state.triggered.bearDialogOpen) {
      state.triggered.bearDialogOpen = false;
      state.triggered.bearDialogComplete = true;
    }

    if (
      state.triggered.bearDialogComplete &&
      !state.triggered.missionCompleteDone &&
      allCriteriaMet()
    ) {
      openMissionCompleteDialog();
      return;
    }

    if (triggerClue(
      clues.hedgehogBerries,
      "hedgehogBerries",
      "These berries appear to have been poisoned...",
      10
    )) {
      return;
    }

    if (triggerClue(
      clues.foxLeaves,
      "foxLeaves",
      "These leaves are all torn up... something struggled here.",
      10
    )) {
      return;
    }

    if (triggerClue(
      clues.owlFeathers,
      "owlFeathers",
      "These feathers... an owl must have been hurt.",
      10
    )) {
      return;
    }

    if (triggerClue(
      clues.badgerBurrow,
      "badgerBurrow",
      "This burrow looks damaged... something big passed through.",
      15
    )) {
      return;
    }

    if (triggerClue(
      clues.deerHoofprints,
      "deerHoofprints",
      "Hoofprints... the deer were here after all.",
      15
    )) {
      return;
    }

    const rabbit = runtime.findObject((obj) => obj.type === "animal-rabbit-sick");
    if (
      rabbit &&
      !state.triggered.rabbitSeen &&
      runtime.isTileVisible(rabbit.tx, rabbit.ty)
    ) {
      state.triggered.rabbitSeen = true;
      updateObjective(
        "Heal the animals.",
        `Healed ${state.healed}/${state.healGoal}`
      );
      setQuestStatus(
        "healAnimals",
        "active",
        `Healed ${state.healed}/${state.healGoal}`
      );
    }
  });

  function handleSaltDropoff(target) {
    if (state.triggered.saltDropped) return;
    state.triggered.saltDropped = true;
    runtime.setObjectType(target, "prop-salt-dropoff-with-salt");
    runtime.setInteraction(target, null);
    const hero = target?.asset
      ? { src: target.asset, alt: target.name || "Salt" }
      : null;
    runtime.openDialog(
      "I left the salt, but the deer are gone. They are always here, and they love the salt. Where did they run off to?",
      hero
    );
    addWorry(10);
    updateObjective("Find the deer.", "");
    setQuestStatus("deliverSalt", "complete");
    setQuestStatus("findDeer", "active");
  }

  function handleRabbitFootprints(target) {
    if (state.triggered.rabbitFootprints) return;
    state.triggered.rabbitFootprints = true;
    runtime.setInteraction(target, null);
    const hero = target?.asset
      ? { src: target.asset, alt: target.name || "Clue" }
      : null;
    runtime.openDialog(
      "Those rabbit footprints look odd, as if the rabbit were limping or dragging a foot.",
      hero
    );
    addWorry(10);
    revealTrail(trails.rabbit);
    runtime.unblockTile(5, 33);
  }

  function handleHeal(target, dataMap) {
    const wasType = target?.type;
    const entry = dataMap[wasType];
    if (!entry) return;
    runtime.setObjectType(target, entry.healedType);
    runtime.setInteraction(target, null);
    if (entry.counts) {
      state.healed += 1;
      if (!state.triggered.bloodTrailVisible) {
        updateObjective(
          "Heal the animals.",
          `Healed ${state.healed}/${state.healGoal}`
        );
      }
      setQuestStatus(
        "healAnimals",
        state.healed >= state.healGoal ? "complete" : "active",
        `Healed ${state.healed}/${state.healGoal}`
      );
    }
    if (wasType === "animal-deer-sick") {
      state.triggered.deerHealed = true;
      setQuestStatus("findDeer", "complete");
      updateObjective("Find the bear.", "");
    }
    if (entry.message) {
      const hero = target?.asset
        ? { src: target.asset, alt: target.name || "Creature" }
        : null;
      runtime.openDialog(entry.message, hero);
    }
    if (
      entry.counts &&
      state.triggered.deerHealed &&
      state.healed >= state.healGoal
    ) {
      triggerBloodTrail();
    }
    if (wasType === "animal-bear-sick") {
      state.triggered.bearHealed = true;
      setQuestStatus("findBear", "complete");
      if (entry.message) {
        state.triggered.bearDialogOpen = true;
      } else {
        state.triggered.bearDialogComplete = true;
      }
    }
  }

  function handleHedgehogTracks(target) {
    if (state.triggered.hedgehogTracks) return;
    state.triggered.hedgehogTracks = true;
    runtime.setInteraction(target, null);
    revealTrail(trails.hedgehog);
    unlockTrail(trails.hedgehog);
    unlockRect(2, 24, 8, 26);
  }

  function handleFoxTrail(target) {
    if (state.triggered.foxTrail) return;
    state.triggered.foxTrail = true;
    runtime.setInteraction(target, null);
    revealTrail(trails.fox);
    unlockTrail(trails.fox);
  }

  function handleOwlTrail(target) {
    if (state.triggered.owlTrail) return;
    state.triggered.owlTrail = true;
    runtime.setInteraction(target, null);
    revealTrail(trails.owl);
    unlockTrail(trails.owl);
  }

  function handleBadgerTrail(target) {
    if (state.triggered.badgerTrail) return;
    state.triggered.badgerTrail = true;
    runtime.setInteraction(target, null);
    revealTrail(trails.badger);
    unlockTrail(trails.badger);
  }

  function handleDeerTrail(target) {
    if (state.triggered.deerTrail) return;
    state.triggered.deerTrail = true;
    runtime.setInteraction(target, null);
    revealTrail(trails.deer);
    unlockTrail(trails.deer);
  }

  function handleBearTrail(target) {
    if (state.triggered.bloodTrailInvestigated) return;
    state.triggered.bloodTrailInvestigated = true;
    runtime.setInteraction(target, null);
    revealTrail(trails.bear);
    unlockTrail(trails.bear);
  }

  function triggerBloodTrail() {
    if (state.triggered.bloodTrailVisible) return;
    state.triggered.bloodTrailVisible = true;
    if (clues.bloodTrail) {
      runtime.setHidden(clues.bloodTrail, false);
      runtime.setInteraction(clues.bloodTrail, {
        key: "i",
        label: "Hold I to investigate",
        durationMs: 2000,
        action: "bear-trail",
      });
    }
    addWorry(20);
    updateObjective("Find the bear.", "");
    setQuestStatus("findBear", "active");
  }

  function setInvestigateInteraction(target, action) {
    if (!target) return;
    runtime.setInteraction(target, {
      key: "i",
      label: "Hold I to investigate",
      durationMs: 2000,
      action,
    });
  }

  function triggerClue(target, key, message, worry, onReveal) {
    if (!target || state.triggered[key]) return false;
    if (!runtime.isTileVisible(target.tx, target.ty)) return false;
    state.triggered[key] = true;
    const hero = target?.asset
      ? { src: target.asset, alt: target.name || "Clue" }
      : null;
    runtime.openDialog(message, hero);
    addWorry(worry);
    if (onReveal) onReveal();
    return true;
  }

  function collectTrail(prefixes, extraTypes = []) {
    const objects = runtime.getObjects().filter((obj) => {
      if (extraTypes.includes(obj.type)) return true;
      return prefixes.some((prefix) => obj.type.startsWith(prefix));
    });
    const tiles = [];
    const seen = new Set();
    objects.forEach((obj) => {
      const key = `${obj.tx},${obj.ty}`;
      if (seen.has(key)) return;
      seen.add(key);
      tiles.push({ tx: obj.tx, ty: obj.ty });
    });
    return { objects, tiles };
  }

  function hideTrail(trail) {
    trail.objects.forEach((obj) => runtime.setHidden(obj, true));
  }

  function revealTrail(trail) {
    trail.objects.forEach((obj) => runtime.setHidden(obj, false));
  }

  function unlockTrail(trail) {
    trail.tiles.forEach((tile) => {
      runtime.unblockTile(tile.tx, tile.ty);
      runtime.allowTile(tile.tx, tile.ty);
    });
  }

  function blockTrail(trail) {
    trail.tiles.forEach((tile) => {
      runtime.blockTile(tile.tx, tile.ty);
      runtime.disallowTile(tile.tx, tile.ty);
    });
  }

  function unlockRect(startX, startY, endX, endY) {
    for (let ty = startY; ty <= endY; ty += 1) {
      for (let tx = startX; tx <= endX; tx += 1) {
        runtime.unblockTile(tx, ty);
        runtime.allowTile(tx, ty);
      }
    }
  }

  function blockRect(startX, startY, endX, endY) {
    for (let ty = startY; ty <= endY; ty += 1) {
      for (let tx = startX; tx <= endX; tx += 1) {
        runtime.blockTile(tx, ty);
        runtime.disallowTile(tx, ty);
      }
    }
  }

  function addWorry(amount) {
    state.worry = Math.min(100, state.worry + amount);
    if (ui.worryMeterEl) {
      ui.worryMeterEl.removeAttribute("hidden");
    }
    if (ui.worryLabelEl) {
      ui.worryLabelEl.textContent = `Worry ${state.worry}/100`;
    }
    if (ui.worryFillEl) {
      ui.worryFillEl.style.width = `${state.worry}%`;
    }
  }

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

  function setQuestStatus(id, status, progress) {
    const quest = questMap.get(id);
    if (!quest) return;
    if (status) quest.status = status;
    if (progress !== undefined) quest.progress = progress;
    renderQuests();
  }

  function renderQuests() {
    if (!ui.questsEl) return;
    ui.questsEl.innerHTML = quests
      .filter((quest) => quest.status !== "locked")
      .map((quest) => {
        const statusLabel =
          quest.status === "complete"
            ? "Complete"
            : quest.status === "active"
              ? "Active"
              : "Locked";
        const progress = quest.progress
          ? `<div class="quest-progress">${quest.progress}</div>`
          : "";
        return `
          <div class="quest">
            <div>
              <div>${quest.label}</div>
              ${progress}
            </div>
            <div class="quest-status ${quest.status}">${statusLabel}</div>
          </div>
        `;
      })
      .join("");
  }

  function allCriteriaMet() {
    return (
      state.triggered.saltDropped &&
      state.triggered.deerHealed &&
      state.triggered.bearHealed &&
      state.healed >= state.healGoal
    );
  }

  function openMissionCompleteDialog() {
    state.triggered.missionCompleteOpen = true;
    const hero = saltDropoff?.asset
      ? { src: saltDropoff.asset, alt: saltDropoff.name || "Salt" }
      : null;
    runtime.openDialog("Mission complete: The Missing Deer.", hero);
  }

  function markMissionCleared() {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      const parsed = raw ? JSON.parse(raw) : { cleared: {}, unlocked: {} };
      parsed.cleared = parsed.cleared || {};
      parsed.unlocked = parsed.unlocked || {};
      parsed.cleared[MISSION_ID] = true;
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(parsed));
    } catch (error) {
      console.warn("Unable to save mission progress.", error);
    }
  }
}
