// Pony Parade: map UI interactions (tooltips, drag/drop, commands).

import { HAS_API, apiUrl } from "../api_mode.js";

export const bindMapUI = ({
  ponyMap,
  mapTooltip,
  mapStatus,
  mapData,
  mapWidth,
  mapHeight,
  getScale,
  getStructureBounds,
  getActors,
  getCommandTarget,
  setCommandTarget,
  getTooltipLabel,
  getStructureLabel,
  updateAccessPointForItem,
  showCommandMenu,
  hideCommandMenu,
  assignManualTask,
  applyMagicWand,
  setLastPointer,
  dragState,
}) => {
  if (!ponyMap) return;
  const commandMenu = document.getElementById("pony-command-menu");

  if (commandMenu) {
    commandMenu.addEventListener("click", (event) => {
      const button = event.target.closest("[data-command]");
      if (!button) return;
      event.preventDefault();
      const command = button.dataset.command;
      if (command === "magic") {
        if (applyMagicWand) {
          applyMagicWand();
        }
        hideCommandMenu();
        return;
      }
      const commandTarget = getCommandTarget();
      if (commandTarget) {
        assignManualTask(commandTarget, command);
      }
      hideCommandMenu();
    });
  }

  document.addEventListener("pointerdown", (event) => {
    if (!commandMenu || commandMenu.hidden) return;
    if (commandMenu.contains(event.target)) return;
    hideCommandMenu();
  });

  if (!mapTooltip) return;

  const hideTooltip = () => {
    mapTooltip.classList.remove("is-visible");
    mapTooltip.setAttribute("aria-hidden", "true");
    mapTooltip.style.transform = "translate(-9999px, -9999px)";
  };

  const getCanvasPoint = (event) => {
    const canvasRect = ponyMap.getBoundingClientRect();
    return {
      x: event.clientX - canvasRect.left,
      y: event.clientY - canvasRect.top,
    };
  };

  const getHit = (point) =>
    getStructureBounds().find(
      (item) =>
        point.x >= item.x &&
        point.x <= item.x + item.width &&
        point.y >= item.y &&
        point.y <= item.y + item.height
    );

  const getPonyHit = (point) =>
    getActors().find(
      (actor) =>
        actor.bounds &&
        point.x >= actor.bounds.x &&
        point.x <= actor.bounds.x + actor.bounds.width &&
        point.y >= actor.bounds.y &&
        point.y <= actor.bounds.y + actor.bounds.height
    );

  const setCursor = (value) => {
    ponyMap.style.cursor = value;
  };

  const showTooltip = (label, clientX, clientY) => {
    const cardRect = ponyMap.parentElement?.getBoundingClientRect();
    if (!cardRect) return;
    const localX = clientX - cardRect.left;
    const localY = clientY - cardRect.top;
    if (label && typeof label === "object") {
      mapTooltip.innerHTML = label.html || "";
      mapTooltip.setAttribute("aria-label", label.text || "");
    } else {
      mapTooltip.textContent = label || "";
      mapTooltip.setAttribute("aria-label", label || "");
    }
    mapTooltip.classList.add("is-visible");
    mapTooltip.setAttribute("aria-hidden", "false");
    const tooltipWidth = mapTooltip.offsetWidth;
    const tooltipHeight = mapTooltip.offsetHeight;
    let left = localX + 14;
    let top = localY + 12;
    const maxLeft = cardRect.width - tooltipWidth - 8;
    const maxTop = cardRect.height - tooltipHeight - 8;
    if (left > maxLeft) left = maxLeft;
    if (top > maxTop) top = maxTop;
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    mapTooltip.style.transform = `translate(${left}px, ${top}px)`;
  };

  const handleMove = (event) => {
    if (dragState.active) return;
    const point = getCanvasPoint(event);
    setLastPointer(point);
    const hit = getHit(point);
    if (hit) {
      setCursor("grab");
      const label = getTooltipLabel ? getTooltipLabel(hit) : hit.label;
      showTooltip(label, event.clientX, event.clientY);
    } else {
      setCursor("default");
      hideTooltip();
    }
  };

  const handleDragStart = (event) => {
    const point = getCanvasPoint(event);
    const hit = getHit(point);
    if (!hit || !hit.item || hit.item.draggable === false) return;
    event.preventDefault();
    dragState.active = true;
    dragState.item = hit.item;
    dragState.offsetX = point.x - hit.anchorX;
    dragState.offsetY = point.y - hit.anchorY;
    dragState.pointerId = event.pointerId;
    ponyMap.setPointerCapture(event.pointerId);
    setCursor("grabbing");
    hideTooltip();
  };

  const handleDragMove = (event) => {
    if (!dragState.active || dragState.pointerId !== event.pointerId) {
      handleMove(event);
      return;
    }
    setLastPointer(null);
    const point = getCanvasPoint(event);
    const anchorX = point.x - dragState.offsetX;
    const anchorY = point.y - dragState.offsetY;
    const tileSize = mapData.meta.tileSize;
    const scale = getScale();
    const nextX = Math.max(0, Math.min(mapWidth, anchorX / scale));
    const nextY = Math.max(0, Math.min(mapHeight, anchorY / scale));
    dragState.item.at = {
      x: Number((nextX / tileSize).toFixed(2)),
      y: Number((nextY / tileSize).toFixed(2)),
    };
  };

  const saveStructureLocation = async (item) => {
    if (!HAS_API) {
      if (mapStatus) {
        mapStatus.textContent = "Map changes are local only.";
      }
      return { ok: true, skipped: true };
    }
    try {
      const response = await fetch(apiUrl(`/map/objects/${encodeURIComponent(item.id)}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ at: item.at }),
      });
      if (!response.ok) {
        throw new Error("Save failed.");
      }
      if (mapStatus) {
        mapStatus.textContent = `Saved ${getStructureLabel(item)}.`;
      }
      return { ok: true };
    } catch (error) {
      if (mapStatus) {
        mapStatus.textContent = "Unable to save map changes.";
      }
      return { ok: false };
    }
  };

  const handleDragEnd = async (event) => {
    if (!dragState.active || dragState.pointerId !== event.pointerId) return;
    ponyMap.releasePointerCapture(event.pointerId);
    setCursor("default");
    const item = dragState.item;
    dragState.active = false;
    dragState.item = null;
    dragState.pointerId = null;
    if (item) {
      updateAccessPointForItem(item);
      await saveStructureLocation(item);
    }
  };

  const handlePonyClick = (event) => {
    if (dragState.active) return;
    const point = getCanvasPoint(event);
    const hit = getPonyHit(point);
    if (hit) {
      if (commandMenu && getCommandTarget() === hit && !commandMenu.hidden) {
        hideCommandMenu();
        return;
      }
      setCommandTarget(hit);
      showCommandMenu(hit, event.clientX, event.clientY);
      hideTooltip();
    } else {
      hideCommandMenu();
    }
  };

  ponyMap.addEventListener("pointerdown", handleDragStart);
  ponyMap.addEventListener("pointermove", handleDragMove);
  ponyMap.addEventListener("pointerup", handleDragEnd);
  ponyMap.addEventListener("pointercancel", handleDragEnd);
  ponyMap.addEventListener("click", handlePonyClick);
  ponyMap.addEventListener("pointerleave", () => {
    if (!dragState.active) {
      setCursor("default");
      hideTooltip();
      setLastPointer(null);
    }
  });
};
