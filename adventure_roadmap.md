# Adventure Designer Roadmap

## North Star
Build a standalone, UI-based adventure map designer with a prompt-first flow
that integrates with Codex for generation, supports paint/drag refinement,
auto-validates quality, and only deploys maps after explicit user approval.

## Core Workflow (agreed)
1. Prompt-first with Codex.
2. Painter refine (large/small brush, drag/drop).
3. Codex rebuild pass.
4. Review.
5. Refine or deploy.

## Constraints
- Drafts live in a separate folder until deploy.
- Auto-validation required before deploy.
- Numeric tile IDs only; conversion tables live in JSON.
- Seeded generation is required.
- Large/small brush supported.
- Road network auto-generated but user-editable.
- Story zones supported (beats, encounters, narrative triggers).
- Objects (plot buildings, creatures) are movable after placement.

## Proposed File Layout (initial)
- Tool UI: `tools/adventure-designer/`
- Draft maps: `adventures/maps/_drafts/`
- Deployed maps: `adventures/maps/`
- Libraries:
  - `data/adventure_tiles.json`
  - `data/adventure_structures.json`
  - `data/adventure_creatures.json`
  - `data/adventure_biomes.json` (brush presets)
  - `data/adventure_story_zones.json` (zone templates)

## Validation (baseline checks)
- All actors/plot objects reachable from spawn.
- No actors/objects on blocked tiles.
- Road endpoints that claim to exit must touch map edge.
- Required story zones exist and are connected to roads.
- Resource goals are achievable within reachable tiles.
- Seed + generator parameters are stored with the map.

## Deploy Step (definition)
- Copy a draft map from `adventures/maps/_drafts/` to `adventures/maps/`.
- Strip editor-only fields (`draft`, `storyZones` if not runtime-facing).
- Preserve `id`, `title`, `tileSize`, `w`, `h`, `tiles`, `spawn`, `objects`.

## Roadmap (todo)

### Phase 0 — Decisions + Spec
- [x] Confirm tool home: `tools/adventure-designer/`.
- [x] Lock draft folder name: `adventures/maps/_drafts/`.
- [x] Define map JSON schema for drafts (extra metadata allowed): `schemas/adventure-map-draft.schema.json`.
- [x] Define deploy step (copy/normalize draft -> deployed map).

### Phase 1 — Libraries + Tables
- [ ] Create `data/adventure_tiles.json` with numeric IDs + properties.
- [ ] Create `data/adventure_structures.json` (IDs, sizes, placement rules).
- [ ] Create `data/adventure_creatures.json` (IDs, sizes, dialog hooks).
- [ ] Create `data/adventure_biomes.json` for brush presets.
- [ ] Create `data/adventure_story_zones.json` (zone templates).
- [ ] Add conversion helpers in the tool for numeric IDs <-> names.

### Phase 2 — Generator Core
- [ ] Seeded RNG utilities.
- [ ] Terrain pass (biome fills + edges).
- [ ] Feature pass (mountains, water, canyons, gulfs).
- [ ] Road pass (auto-generate from endpoints/waypoints).
- [ ] Structure pass (story buildings, towns, ruins).
- [ ] Creature pass (story/ambient).
- [ ] Object placement constraints + collision resolution.
- [ ] Generator config saved with draft map.

### Phase 3 — UI (Painter + DnD)
- [ ] Canvas renderer (tile grid + overlays).
- [ ] Large brush + fine brush.
- [ ] Drag/drop objects (structures, creatures, story triggers).
- [ ] Palette panes for tiles/structures/creatures.
- [ ] Story zone editor (visual region + metadata).
- [ ] Undo/redo stack and region lock.

### Phase 4 — Codex Integration
- [ ] Prompt panel with structured fields (theme, geography, beats).
- [ ] Export prompt + generator config to a JSON brief.
- [ ] Codex rebuild hook reads brief, regenerates draft, preserves locks.
- [ ] Diff/preview mode (before/after in UI).

### Phase 5 — Validation + Deploy
- [ ] Autovalidation checks with warnings list.
- [ ] One-click "Fix suggestions" (optional).
- [ ] Deploy action (writes to `adventures/maps/`).
- [ ] Deploy log (versioned backups).

### Phase 6 — Content Scale-Up
- [ ] Expand tile library (priority list to be confirmed).
- [ ] Expand structure library.
- [ ] Expand creature library.
- [ ] Template packs for common map types (forest, sea, mountain pass).

## Open Decisions (to resolve later)
- Whether the tool should be browser-only or include a CLI companion.
- How much Codex should auto-edit vs generate deltas for review.
- Final validation rules for “quality checks.”
