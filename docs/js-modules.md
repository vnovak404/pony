# Frontend JS Modules

This repository uses ES modules under `assets/js/`. Keep this file up to date whenever module responsibilities or function signatures change. This list is intentionally exhaustive for future maintenance.

## Tests
- Run: `npm test`
- Tests live in `tests/*.test.js`.

## `assets/js/app.js`

- Purpose: app bootstrap (loads vibes, pony cards, form wiring, and map).
- Functions: none (module only imports + invokes other modules).

## `assets/js/dom.js`

- Purpose: central DOM references shared across modules.
- Functions: none (exports DOM nodes only).
- Exports: `ponyForm`, `ponyResult`, `ponyGrid`, `ponyNameButton`, `ponyNameInput`, `ponyBodyInput`, `ponyManeInput`, `ponyAccentInput`, `ponyTalentInput`, `ponyPersonalityInput`, `ponyMap`, `mapStatus`, `mapTooltip`, `mapLabelToggle`.

## `assets/js/utils.js`

- `pick(list)` — returns a random element from an array.
- `unique(list)` — de-duplicates an array while preserving order.
- `loadImage(src)` — Promise wrapper for image loading.
- `loadJson(path)` — fetches JSON with `cache: "no-store"`.
- `formatTalent(talent)` — normalizes talent text, ensuring an "-ing" phrase.
- `formatPersonality(personality)` — returns a safe personality fallback.
- `toTitleCase(value)` — converts identifiers to title case (hyphens/underscores to spaces).

## `assets/js/vibes.js`

- `ensureVibes()` — loads `/data/pony_vibes.json` once and caches it.
- `applySuggestions(name, fields, fillEmptyOnly)` — populates form fields with vibe-based suggestions.
- `buildRandomName()` — returns a two-term random pony name.
- Internal helpers:
  - `normalizeTerm(term)` — normalizes vibe tokens to lower-case.
  - `setVibeData(data)` — normalizes vibe groups and term map.
  - `loadVibes()` — fetches vibe data with fallback.
  - `gatherOptions(vibes, key)` — collects options from vibe groups.
  - `pickFrom(vibes, key, fallback)` — selects a random option with fallback.
  - `getVibesForName(name)` — resolves vibe groups based on name tokens.
  - `buildSuggestions(name)` — builds a suggestion bundle from vibe groups.

## `assets/js/pony-form.js`

- `initPonyForm()` — wires random name button, blur suggestions, and form submission flow.
- Internal data: `fieldInputs` maps form keys to DOM inputs.

## `assets/js/pony-cards.js`

- `renderPonyCard(pony, imagePath, addToTop)` — builds the pony card markup and inserts it.
- `loadPonies()` — fetches `/data/ponies.json` and renders all cards.
- `bindPonyCardActions()` — handles sprite generation and spritesheet preview buttons.
- Internal helpers:
  - `resolveSheetPath(metaPath, meta, fallbackPath)` — picks a preview sheet (prefers trot/walk).
  - `updateCardStatus(card, message)` — status line updates.
  - `toggleCardButtons(card, disabled)` — disables/enables action buttons.

## `assets/js/map.js`

- Purpose: legacy import compatibility.
- Functions: none (re-export only).
- Exports: `loadMap` (from `assets/js/map/index.js`).

## `assets/js/map/index.js`

- `loadMap()` — loads map + pony + world data, then calls `initMap`.
- Internal helper:
  - `loadRuntimeState()` — pulls persisted `/api/state` data if present.

## `assets/js/map/core.js`

- `initMap(mapData, ponies, locations, runtimeState)` — main map bootstrap:
  - loads spritesheets (including multi-page sheets) and status icons
  - builds structure/house indices and access points
  - creates actor state, command menu wiring, and render loop
  - persists runtime state periodically
- Internal helpers (exhaustive list):
  - `getStructureLabel(item)` — returns a display label for structures/houses.
  - `resize()` — resizes the canvas to its container.
  - `isInnObject(item)` — identifies inn objects.
  - `isFoodSpot(item)` — identifies food structures or locations.
  - `isDrinkSpot(item)` — identifies drink structures or locations.
  - `isFunSpot(item)` — identifies fun/recreation locations.
  - `isHealthSpot(item)` — identifies clinic/health locations.
  - `endpointKey(point)` — builds a string key for a road endpoint.
  - `addEndpoint(point, segment, end)` — indexes road endpoints for intersection lookup.
  - `isOffMap(point)` — checks if a point is off the map bounds.
  - `updateLakeState(item)` — caches lake anchor + splash radius for VFX.
  - `createVideo(src, loop)` — creates a configured `HTMLVideoElement`.
  - `pickNextSegment(choices, targetPoint, preferTarget)` — intersection routing choice logic.
  - `pickNeedCandidate(candidates)` — resolves need priority with wash margin.
  - `normalizeText(value)` — normalizes strings for preference matching.
  - `normalizePreferenceList(preference)` — normalizes preference arrays.
  - `matchesSpotPreference(spot, preferences)` — preference check for a spot.
  - `innSleepSpots()` — IIFE that seeds inn sleep spot offsets.
  - `claimInnSpot()` — claims a free inn sleep spot.
  - `releaseInnSpot(index)` — releases a claimed inn spot.
  - `formatHouseStatus(state)` — formats house condition/status text.
  - `getHouseSpots(houseId)` — returns cached sleep spots per house.
  - `claimHouseSpot(houseId)` — claims a free house sleep spot.
  - `releaseHouseSpot(houseId, index)` — releases a claimed house spot.
  - `nearestPointOnSegment(point, segment)` — returns nearest point on a segment.
  - `projectPointOnSegment(point, segment)` — projection math helper (used by nearest-point).
  - `findNearestSegmentToPoint(point)` — returns the closest road segment + projection info.
  - `snapActorToNearestSegment(actor, point)` — aligns actor to nearest road segment.
  - `computeAccessPoint(target)` — snaps a structure target to the nearest road point.
  - `updateInnAccessPoint()` — recomputes inn access point.
  - `getInnTargetPoint()` — returns cached inn access point.
  - `buildHouseAccessPoints()` — precomputes house access points.
  - `getHouseTargetPoint(houseId)` — returns cached house access point.
  - `buildFoodAccessPoints()` — precomputes food access points.
  - `getFoodTargetPoint(foodId)` — returns cached food access point.
  - `buildDrinkAccessPoints()` — precomputes drink access points.
  - `getDrinkTargetPoint(drinkId)` — returns cached drink access point.
  - `buildFunAccessPoints()` — precomputes fun access points.
  - `getFunTargetPoint(funId)` — returns cached fun access point.
  - `buildHealthAccessPoints()` — precomputes clinic access points.
  - `getHealthTargetPoint(healthId)` — returns cached clinic access point.
  - `getTaskTargetPoint(actor)` — resolves target point from task payload.
  - `updateAccessPointForItem(item)` — recomputes access points after drag updates.
  - `getFoodSpotAccessPoint(spot)` — returns access point for a food spot.
  - `getDrinkSpotAccessPoint(spot)` — returns access point for a drink spot.
  - `getFunSpotAccessPoint(spot)` — returns access point for a fun spot.
  - `getHealthSpotAccessPoint(spot)` — returns access point for a clinic spot.
  - `getSpotOffset(spot, key)` — resolves per-spot positional offset.
  - `pickFoodSpot(actor, position)` — picks a food target by distance/preferences.
  - `pickDrinkSpot(actor, position)` — picks a drink target by distance/preferences.
  - `pickFunSpot(actor, position)` — picks a fun target by distance.
  - `pickHealthSpot(actor, position)` — picks a clinic target by distance.
  - `getCriticalNeedTask(actor, position)` — urgent task selection at max need.
  - `getActorPosition(actor)` — returns current actor position for task decisions.
  - `assignManualTask(actor, command)` — converts a manual command (eat/drink/fun/rest/vet/repair) into a task.
  - `findRepairTarget()` — selects a house in need of repair.
  - `updateHouseStates(delta, now)` — decays/repairs house condition over time.
  - `getVariantPath(path, suffix)` — builds sprite variant file paths.
  - `hideCommandMenu()` — hides the command menu.
  - `resolveTaskLabel(actor, now)` — returns the UI "Heading:" line.
  - `updateCommandStats(now)` — updates the command menu stat display.
  - `showCommandMenu(actor, clientX, clientY)` — positions and shows the menu.
  - `setVideoActive(entry, video, active)` — starts/stops VFX videos.
  - `drawVideoOverlay(video, config, x, y)` — draws VFX frames on the map.
  - `draw(now)` — animation frame callback that renders each tick.
  - `getTooltipLabel(hit)` — returns tooltip text with house status detail.

## `assets/js/map/pathfinding.js`

- `createPathfinder({ roads, tileSize, width, height })` — builds a road grid and returns helpers.
- Internal helpers:
  - `tileKey(tileX, tileY)` — key for a tile coordinate.
  - `markRoadTile(tileX, tileY)` — marks a road tile in the grid.
  - `rasterizeRoad(start, end)` — Bresenham-style rasterization for road segments.
  - `tileCenter(tileX, tileY)` — converts tile coords into map pixel points.
  - `findNearestRoadTile(point)` — nearest road tile to a point.
  - `getNeighbors(tile)` — returns walkable neighbor tiles with costs.
  - `buildTilePath(startPoint, targetPoint)` — A* path along road tiles.
  - `advanceAlongPath(actor, delta)` — moves an actor along its path.

## `assets/js/map/actors.js`

- Purpose: re-export `createActors` + `createActorRenderer`.
- Functions: none (re-export only).

## `assets/js/map/actors/core.js`

- `createActors({ sprites, roadSegments, mapWidth, runtimeState, maxActors, ... })` — seeds actor state, position, speed, stats, and drive thresholds.
- Internal helpers in `createActors`:
  - `getSavedState(slug)` — returns persisted state for a pony slug.
  - `clamp(value, min, max)` — clamps numeric values (used for saved progress).
- `createActorRenderer(context)` — wires actor simulation and returns `{ drawActors }`.
- Internal helpers in `createActorRenderer`:
  - `drawActors(delta, now)` — per-frame update + draw:
    - updates needs (health/hunger/thirst/boredom/tiredness)
    - assigns manual, urgent, and auto tasks
    - builds or clears pathfinding state
    - advances movement along a path or road segment
    - handles eat/drink/rest/fun/repair sequences and cooldowns
    - draws sprite frames, labels, and any VFX overlays

## `assets/js/map/draw.js`

- `createRenderer({...})` — returns `{ drawFrame, getStructureBounds }`.
- Internal helpers:
  - `drawRoads(scale)` — paints road segments and highlights.
  - `drawDecor(scale)` — paints decor assets.
  - `drawStructures(scale)` — paints structures/houses and tracks hit bounds.
  - `drawFrame(delta, now)` — paints the full frame and runs per-frame updates.
  - `getStructureBounds()` — returns current structure hit-boxes.

## `assets/js/map/ui.js`

- `bindMapUI({...})` — wires pointer events, tooltips, drag/drop saving, and command menu actions.
- Internal helpers:
  - `hideTooltip()` — hides tooltip and resets its position.
  - `getCanvasPoint(event)` — maps pointer to canvas coordinates.
  - `getHit(point)` — returns the structure bounds hit by a point.
  - `getPonyHit(point)` — returns the pony bounds hit by a point.
  - `setCursor(value)` — updates the canvas cursor style.
  - `showTooltip(label, clientX, clientY)` — positions and shows the tooltip.
  - `handleMove(event)` — hover + tooltip handler.
  - `handleDragStart(event)` — starts dragging a structure.
  - `handleDragMove(event)` — updates drag position.
  - `saveStructureLocation(item)` — persists structure location to the server.
  - `handleDragEnd(event)` — releases drag state and saves.
  - `handlePonyClick(event)` — opens/updates the command menu.
