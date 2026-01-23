import { isTypingTarget } from "./utils.js";

export function bindUi(context, handlers) {
  document.querySelectorAll("[data-collapsible]").forEach((section) => {
    const toggle = section.querySelector(".section-toggle");
    if (!toggle) {
      return;
    }
    toggle.addEventListener("click", () => {
      const collapsed = section.classList.toggle("is-collapsed");
      toggle.setAttribute("aria-expanded", String(!collapsed));
    });
  });

  context.dom.toolButtons.forEach((button) => {
    button.addEventListener("click", () => {
      handlers.setTool(button.dataset.tool);
    });
  });

  if (context.dom.modeSketchBtn) {
    context.dom.modeSketchBtn.addEventListener("click", () => handlers.setMode("sketch"));
  }
  if (context.dom.modeTileBtn) {
    context.dom.modeTileBtn.addEventListener("click", () => handlers.setMode("tile"));
  }

  if (context.dom.workflowGenerateBtn) {
    context.dom.workflowGenerateBtn.addEventListener("click", () => handlers.generateTiles());
  }
  if (context.dom.workflowPrettifyBtn) {
    context.dom.workflowPrettifyBtn.addEventListener("click", () => handlers.prettifyTiles());
  }
  if (context.dom.workflowRefineBtn) {
    context.dom.workflowRefineBtn.addEventListener("click", () => handlers.refineMap());
  }

  context.dom.intentRun.addEventListener("click", () => handlers.runIntentProposal());
  context.dom.proposalApply.addEventListener("click", () => handlers.applyProposal());
  context.dom.proposalReject.addEventListener("click", () => handlers.clearProposal());
  context.dom.undoBtn.addEventListener("click", () => {
    context.undoStack.undo();
    handlers.refresh();
  });
  context.dom.redoBtn.addEventListener("click", () => {
    context.undoStack.redo();
    handlers.refresh();
  });
  context.dom.exportBtn.addEventListener("click", () => handlers.exportDraft());
  if (context.dom.importBtn && context.dom.importInput) {
    context.dom.importBtn.addEventListener("click", () => {
      context.dom.importInput.click();
    });
    context.dom.importInput.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) {
        return;
      }
      handlers.importDraft(file);
      context.dom.importInput.value = "";
    });
  }

  context.dom.brushSizeInput.addEventListener("input", () => {
    const value = parseInt(context.dom.brushSizeInput.value, 10);
    context.state.brushSize = Number.isNaN(value) ? 1 : value;
    context.dom.brushSizeLabel.textContent = String(context.state.brushSize);
  });

  context.dom.zoomInput.addEventListener("input", () => {
    const value = Number.parseFloat(context.dom.zoomInput.value);
    context.state.zoom = Number.isNaN(value) ? 1 : value;
    context.renderer.setZoom(context.state.zoom);
    handlers.syncZoomControls();
    handlers.updateMinimap();
  });

  window.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      if (isTypingTarget(event.target)) {
        return;
      }
      context.state.spaceDown = true;
      event.preventDefault();
    }
  });

  window.addEventListener("keyup", (event) => {
    if (event.code === "Space") {
      if (isTypingTarget(event.target)) {
        return;
      }
      context.state.spaceDown = false;
    }
  });

  if (context.dom.minimapCanvas) {
    context.dom.minimapCanvas.addEventListener("pointerdown", (event) => {
      handlers.jumpToMinimap(event);
      handlers.updateMinimap();
    });
  }

  const pointerTarget = context.renderer.getPointerTarget();
  pointerTarget.addEventListener("pointerdown", handlers.onPointerDown);
  pointerTarget.addEventListener("pointermove", handlers.onPointerMove);
  pointerTarget.addEventListener("pointerup", handlers.onPointerUp);
  pointerTarget.addEventListener("pointerleave", handlers.onPointerUp);
  pointerTarget.addEventListener("wheel", handlers.onWheelZoom, { passive: false });
}
