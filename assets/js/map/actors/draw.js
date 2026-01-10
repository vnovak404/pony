// Pony Parade: actor drawing and labels.

export const createActorDrawer = (context) => {
  const {
    ctx,
    mapData,
    ASSET_SCALE,
    statusIcons,
    resolveTaskLabel,
    vfxByKey,
    vfxVideos,
    VFX_REGISTRY,
    setVideoActive,
    drawVideoOverlay,
    lakeState,
  } = context;

  const drawActor = (actor, delta, now, scale, lastPointer, labelsEnabled) => {
    if (!actor || !actor.sprite || !actor.segment) return;
    const { sprite, segment } = actor;
    const meta = sprite.meta;
    const frames = meta.frames;
    const anchor = Object.values(frames)[0]?.anchor || { x: 256, y: 480 };
    const sleeping = actor.sleepUntil > now;
    const eating = actor.eatUntil > now;
    const drinking = actor.drinkUntil > now;
    const playing = actor.funUntil > now;
    const healing = actor.vetUntil > now;
    const working = actor.workUntil > now;
    const repairing = actor.repairUntil > now;

    const rushTask = actor.task && (actor.task.manual || actor.task.urgent);
    const rushMoveType =
      rushTask && meta.animations.trot ? "trot" : sprite.moveType;
    const moveFrames = meta.animations[rushMoveType] || sprite.moveFrames;
    const frameNames = sleeping
      ? sprite.sleepFrames
      : eating
        ? sprite.eatFrames || sprite.idleFrames
        : drinking
          ? sprite.drinkFrames || sprite.idleFrames
          : healing
            ? sprite.vetFrames || sprite.idleFrames
            : repairing
              ? sprite.repairFrames || sprite.idleFrames
              : playing
                ? sprite.idleFrames
                : moveFrames;
    const actionId = sleeping
      ? "sleep"
      : eating
        ? "eat"
        : drinking
          ? "drink"
          : healing
            ? "vet"
            : repairing
              ? "repair"
              : playing
                ? "idle"
                : rushMoveType;
    const fps = sleeping
      ? meta.fps.sleep || meta.fps.idle || 2
      : eating
        ? meta.fps.eat || meta.fps.idle || 2
        : drinking
          ? meta.fps.drink || meta.fps.idle || 2
          : healing
            ? meta.fps.vet || meta.fps.idle || 2
            : repairing || playing
              ? meta.fps.idle || 2
              : meta.fps[rushMoveType] || 6;
    actor.lastFrame += delta;
    const frameDuration = 1000 / fps;
    if (actor.lastFrame >= frameDuration) {
      actor.frameIndex = (actor.frameIndex + 1) % frameNames.length;
      actor.lastFrame = 0;
    }
    if (actor.frameIndex >= frameNames.length) {
      actor.frameIndex = 0;
    }

    const frameEntry = frames[frameNames[actor.frameIndex]];
    const frame = frameEntry?.frame;
    if (!frame) return;
    const sheetIndex = Number.isFinite(frameEntry.sheet) ? frameEntry.sheet : 0;
    const sheetImage = sprite.sheets
      ? sprite.sheets[sheetIndex] || sprite.sheets[0]
      : sprite.sheet;
    if (!sheetImage) return;

    let x = actor.position?.x;
    let y = actor.position?.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      const from = actor.direction === 1 ? segment.from : segment.to;
      const to = actor.direction === 1 ? segment.to : segment.from;
      x = from.x + (to.x - from.x) * actor.t;
      y = from.y + (to.y - from.y) * actor.t;
      actor.position = { x, y };
    }

    const frameScale = (mapData.meta.tileSize * scale * ASSET_SCALE) / frame.w;
    const destX = x * scale - anchor.x * frameScale;
    const destY = y * scale - anchor.y * frameScale;
    const drawW = frame.w * frameScale;
    const drawH = frame.h * frameScale;
    const directionFlip = actor.facing === -1;
    const actionFlip =
      Array.isArray(sprite.pony.sprite_flip_actions) &&
      sprite.pony.sprite_flip_actions.includes(actionId);
    const baseFlip = Boolean(sprite.pony.sprite_flip);
    const flip = directionFlip !== (actionFlip ? !baseFlip : baseFlip);

    if (flip) {
      ctx.save();
      ctx.translate(destX + drawW, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(
        sheetImage,
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        0,
        destY,
        drawW,
        drawH
      );
      ctx.restore();
    } else {
      ctx.drawImage(
        sheetImage,
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        destX,
        destY,
        drawW,
        drawH
      );
    }

    VFX_REGISTRY.forEach((entry) => {
      if (entry.pony !== sprite.pony.slug) {
        return;
      }
      const video = vfxVideos.get(entry.id);
      if (!video) return;
      let shouldPlay = false;
      if (entry.trigger === "eat") {
        shouldPlay = eating;
      } else if (entry.trigger === "lake") {
        const point = lakeState?.point;
        const splashRadius = lakeState?.splashRadius ?? 0;
        shouldPlay =
          !sleeping &&
          !eating &&
          point &&
          Math.hypot(x - point.x, y - point.y) < splashRadius;
      } else if (entry.trigger === "sleep") {
        shouldPlay = sleeping;
      }
      setVideoActive(entry, video, shouldPlay);
      if (!shouldPlay) return;
      if (entry.anchor === "lake" && lakeState?.point) {
        drawVideoOverlay(video, entry, lakeState.point.x, lakeState.point.y);
      } else {
        drawVideoOverlay(video, entry, x, y);
      }
    });

    actor.bounds = {
      x: destX - 6,
      y: destY - 6,
      width: drawW + 12,
      height: drawH + 12,
    };

    const ponySlug = (sprite.pony.slug || "").toLowerCase();
    const isHovered =
      lastPointer &&
      lastPointer.x >= actor.bounds.x &&
      lastPointer.x <= actor.bounds.x + actor.bounds.width &&
      lastPointer.y >= actor.bounds.y &&
      lastPointer.y <= actor.bounds.y + actor.bounds.height;
    const showLabel =
      labelsEnabled && (Boolean(sprite.pony.label_always_on) || isHovered);
    if (!showLabel) return;
    const labelName = sprite.pony.name || "Pony";
    const jobTitle = (sprite.pony.job && sprite.pony.job.title) || "helper";
    const stats = actor.stats || {};
    const health = Number.isFinite(stats.health) ? Math.round(stats.health) : 92;
    const thirst = Number.isFinite(stats.thirst) ? Math.round(stats.thirst) : 20;
    const hunger = Number.isFinite(stats.hunger) ? Math.round(stats.hunger) : 28;
    const tiredness = Number.isFinite(stats.tiredness) ? Math.round(stats.tiredness) : 35;
    const boredom = Number.isFinite(stats.boredom) ? Math.round(stats.boredom) : 24;
    const fontSize = Math.max(11, Math.round(12 * scale * ASSET_SCALE));
    ctx.font = `${fontSize}px "Nunito", sans-serif`;
    const iconSize = Math.round(fontSize * 1.35);
    const lineHeight = Math.max(fontSize + 6, iconSize + 6);
    const labelX = Math.round(x * scale);
    const labelY = Math.round(destY - 8);
    const paddingX = 12;
    const paddingY = 8;
    const iconGap = Math.max(4, Math.round(fontSize * 0.3));
    const groupGap = Math.max(10, Math.round(fontSize * 0.8));
    const jobLabel = jobTitle ? `${jobTitle} ·` : "";
    const jobWidth = jobLabel ? ctx.measureText(jobLabel).width : 0;
    const statItems = [
      { key: "health", value: health, label: "H" },
      { key: "thirst", value: thirst, label: "Th" },
      { key: "hunger", value: hunger, label: "Hu" },
      { key: "tiredness", value: tiredness, label: "T" },
      { key: "boredom", value: boredom, label: "B" },
    ];
    const statRuns = statItems.map((item) => {
      const icon = statusIcons[item.key] || null;
      const valueText = String(item.value);
      const labelText = icon ? "" : `${item.label}:`;
      const labelWidth = labelText ? ctx.measureText(labelText).width : 0;
      const valueWidth = ctx.measureText(valueText).width;
      const width = (icon ? iconSize : labelWidth) + iconGap + valueWidth;
      return {
        icon,
        labelText,
        labelWidth,
        valueText,
        valueWidth,
        width,
      };
    });
    let statsLineWidth = jobWidth;
    if (jobLabel) {
      statsLineWidth += groupGap;
    }
    statRuns.forEach((run, index) => {
      statsLineWidth += run.width;
      if (index < statRuns.length - 1) {
        statsLineWidth += groupGap;
      }
    });
    const showHeading = isHovered;
    const headingText = showHeading ? resolveTaskLabel(actor, now) : "";
    const headingWidth = headingText ? ctx.measureText(headingText).width : 0;
    const nameWidth = ctx.measureText(labelName).width;
    const boxWidth = Math.max(nameWidth, statsLineWidth, headingWidth) + paddingX * 2;
    const lineCount = showHeading ? 3 : 2;
    const boxHeight = lineHeight * lineCount + paddingY * 2 - 4;
    const labelThemes = {
      stellacorn: {
        textPrimary: "#ffe27a",
        textSecondary: "#fff2b8",
        box: "rgba(44, 32, 10, 0.75)",
      },
      "blue-wonder": {
        textPrimary: "#9fd6ff",
        textSecondary: "#cde9ff",
        box: "rgba(12, 24, 40, 0.75)",
      },
      "raging-torrent": {
        textPrimary: "#b7f59a",
        textSecondary: "#dcffd1",
        box: "rgba(16, 36, 18, 0.75)",
      },
    };
    const theme = labelThemes[ponySlug] || {
      textPrimary: "#fff7d6",
      textSecondary: "#f1e9ff",
      box: "rgba(20, 16, 28, 0.7)",
    };
    const boxLeft = Math.round(labelX - boxWidth / 2);
    const boxTop = Math.round(labelY - boxHeight);
    ctx.fillStyle = theme.box;
    ctx.fillRect(boxLeft, boxTop, boxWidth, boxHeight);
    ctx.fillStyle = theme.textPrimary;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const nameY = Math.round(boxTop + paddingY);
    ctx.fillText(labelName, labelX, nameY);
    ctx.fillStyle = theme.textSecondary;
    ctx.textAlign = "left";
    const statsY = Math.round(nameY + lineHeight);
    const textY = Math.round(statsY + (lineHeight - fontSize) / 2);
    const iconY = Math.round(statsY + (lineHeight - iconSize) / 2);
    let cursorX = labelX - statsLineWidth / 2;
    if (jobLabel) {
      ctx.fillText(jobLabel, Math.round(cursorX), textY);
      cursorX += jobWidth + groupGap;
    }
    statRuns.forEach((run, index) => {
      if (run.icon) {
        ctx.drawImage(run.icon, Math.round(cursorX), iconY, iconSize, iconSize);
        cursorX += iconSize + iconGap;
      } else {
        ctx.fillText(run.labelText, Math.round(cursorX), textY);
        cursorX += run.labelWidth + iconGap;
      }
      ctx.fillText(run.valueText, Math.round(cursorX), textY);
      cursorX += run.valueWidth;
      if (index < statRuns.length - 1) {
        cursorX += groupGap;
      }
    });
    if (showHeading) {
      ctx.fillStyle = theme.textSecondary;
      ctx.textAlign = "center";
      const headingY = Math.round(nameY + lineHeight * 2);
      ctx.fillText(headingText, labelX, headingY);
    }
  };

  return { drawActor };
};
