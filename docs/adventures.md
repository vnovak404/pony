# Adventure Mission Layout Notes

These notes capture where mission data and assets live so new missions can be added quickly.

## Entry Points
- `adventures/world-map.html` + `assets/js/world-map.js`: Transylponia (Taticorn) world map.
- `adventures/stellacorn/world-map.html` + `assets/js/stellacorn/world-map.js`: Whispering Forest (Stellacorn) world map.
- `adventures/stellacorn/adventure.html` + `assets/js/stellacorn/adventure.js`: Stellacorn mission runtime.

## Stellacorn Missions
- `adventures/stellacorn/world-map.json` lists the mission nodes.
  - Each node can include `mission` with a path relative to `adventures/stellacorn/`.
  - Unlock flow is driven by `requires` and local progress.
- Each mission lives under `adventures/missions/stellacorn/<mission-id>/`.
  - `mission.json` is the mission config (map path, tile/object palettes, asset root, spawn).
  - `mission.js` holds the mission logic and should export `createMission(runtime, ui)`.
  - `data/adventure_tiles.json` defines tile metadata (walkable, color, asset).
  - `data/adventure_objects.json` defines object metadata (name, class, categories, asset).
  - `adventures/maps/_drafts/*.json` is the raw mapella export used by the runtime.

## Mission Assets
- Mission assets stay self-contained under the mission folder:
  - Tiles: `adventures/missions/stellacorn/<mission-id>/adventures/tiles/terrain/`
  - Sprites: `adventures/missions/stellacorn/<mission-id>/adventures/sprites/<mission-id>/`
- Tile/object palette assets use `/adventures/...` paths; the Stellacorn runtime rewrites them to the mission `assetRoot` from `mission.json`.

## Adding a New Mission (Quick Checklist)
1. Export the mapella map into `adventures/missions/stellacorn/<mission-id>/adventures/maps/_drafts/`.
2. Add or update `mission.json` with:
   - `map`, `tiles`, `objects`, `assetRoot`, `spawn`, and mission title.
3. Drop sprites/tiles into the mission `adventures/` asset folders.
4. Add a node in `adventures/stellacorn/world-map.json` with the mission path.
5. Extend mission logic in `assets/js/stellacorn/adventure.js` with new triggers.
