import { CanvasRenderer } from "./canvas-renderer.js";
import { PhaserRenderer } from "./phaser-renderer.js";

export function createRenderer(container, options) {
  if (window.Phaser) {
    return new PhaserRenderer(container, options);
  }
  return new CanvasRenderer(container, options);
}
