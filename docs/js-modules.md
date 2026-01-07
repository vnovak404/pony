# Frontend JS Modules

This site now uses ES modules under `assets/js/` to keep responsibilities isolated and easier to maintain.

## Module Overview

- `assets/js/app.js` — App bootstrap; wires up vibes, pony cards, form, and map.
- `assets/js/dom.js` — Central DOM references shared by other modules.
- `assets/js/utils.js` — Lightweight helpers (fetch wrappers, text formatting, random picks).
- `assets/js/vibes.js` — Name-based vibe suggestions and random name generation.
- `assets/js/pony-form.js` — Pony creator form wiring and submission handling.
- `assets/js/pony-cards.js` — Pony card rendering plus sprite/spritesheet actions.
- `assets/js/map.js` — Ponyville map rendering, movement, tooltips, and drag/drop.

Each module has a short header comment describing its purpose.
