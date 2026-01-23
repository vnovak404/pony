import { cloneMap } from "./store.js";

export function createUndoStack(getState, setState) {
  const past = [];
  const future = [];

  return {
    push() {
      past.push(cloneMap(getState()));
      future.length = 0;
    },
    canUndo() {
      return past.length > 0;
    },
    canRedo() {
      return future.length > 0;
    },
    undo() {
      if (past.length === 0) {
        return;
      }
      const current = cloneMap(getState());
      const previous = past.pop();
      future.push(current);
      setState(previous);
    },
    redo() {
      if (future.length === 0) {
        return;
      }
      const current = cloneMap(getState());
      const next = future.pop();
      past.push(current);
      setState(next);
    }
  };
}
