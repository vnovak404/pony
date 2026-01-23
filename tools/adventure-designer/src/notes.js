import { clamp } from "./utils.js";

const DEFAULT_NOTE_WIDTH = 4;
const DEFAULT_NOTE_HEIGHT = 4;

export function ensureNotesLayer(map) {
  if (!map || typeof map !== "object") {
    return;
  }
  if (!Array.isArray(map.notes)) {
    map.notes = [];
  }
}

export function readNoteDraft(context) {
  const text = context.dom.noteText ? context.dom.noteText.value.trim() : "";
  const widthValue = context.dom.noteWidth ? parseInt(context.dom.noteWidth.value, 10) : NaN;
  const heightValue = context.dom.noteHeight ? parseInt(context.dom.noteHeight.value, 10) : NaN;
  const w = Number.isNaN(widthValue) ? DEFAULT_NOTE_WIDTH : Math.max(1, widthValue);
  const h = Number.isNaN(heightValue) ? DEFAULT_NOTE_HEIGHT : Math.max(1, heightValue);
  return {
    text,
    w,
    h
  };
}

export function addNoteAt(context, grid) {
  const map = context.store.getState();
  ensureNotesLayer(map);
  const { text, w, h } = readNoteDraft(context);
  const note = {
    id: `note-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    x: clamp(grid.x, 0, Math.max(0, map.width - w)),
    y: clamp(grid.y, 0, Math.max(0, map.height - h)),
    w,
    h,
    text
  };
  map.notes.push(note);
  return note;
}

export function removeNote(context, noteId) {
  const map = context.store.getState();
  ensureNotesLayer(map);
  map.notes = map.notes.filter((note) => note.id !== noteId);
}

export function renderNotesList(context, handlers = {}) {
  if (!context.dom.notesList) {
    return;
  }
  const map = context.store.getState();
  ensureNotesLayer(map);
  context.dom.notesList.innerHTML = "";
  if (map.notes.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No notes yet.";
    context.dom.notesList.appendChild(empty);
    return;
  }

  map.notes.forEach((note) => {
    const item = document.createElement("div");
    item.className = "note-item";
    const label = document.createElement("div");
    label.className = "note-label";
    const desc = formatNoteLabel(note);
    label.textContent = desc;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "note-remove";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      if (handlers.onRemove) {
        handlers.onRemove(note);
      }
    });
    item.appendChild(label);
    item.appendChild(remove);
    context.dom.notesList.appendChild(item);
  });
}

export function normalizeNotes(notes) {
  if (!Array.isArray(notes)) {
    return [];
  }
  return notes.filter((note) => note && typeof note === "object").map((note) => ({
    id: typeof note.id === "string" ? note.id : `note-${Date.now()}`,
    x: Number.isFinite(note.x) ? note.x : 0,
    y: Number.isFinite(note.y) ? note.y : 0,
    w: Number.isFinite(note.w) && note.w > 0 ? note.w : DEFAULT_NOTE_WIDTH,
    h: Number.isFinite(note.h) && note.h > 0 ? note.h : DEFAULT_NOTE_HEIGHT,
    text: typeof note.text === "string" ? note.text : ""
  }));
}

export function formatNoteLabel(note) {
  const text = (note.text || "").trim();
  const textLabel = text ? ` - ${text}` : "";
  return `(${note.x}, ${note.y}) ${note.w}x${note.h}${textLabel}`;
}
