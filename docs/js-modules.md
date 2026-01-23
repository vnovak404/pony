# Frontend JS Modules

This repository uses ES modules under `assets/js/`. Keep this file up to date whenever module responsibilities or function signatures change. This list is intentionally exhaustive for future maintenance.

## Tests
- Run: `npm test`
- Tests live in `tests/*.test.js`.

## `assets/js/app.js`

- Purpose: app bootstrap (loads vibes, pony cards, form wiring, map, and speech UI).
- Functions: none (module only imports + invokes other modules).

## `assets/js/world-map.js`

- Purpose: render the adventure world map from `assets/world/maps/world-map.json` (used by `adventures/world-map.html`).

## `assets/js/dom.js`

- Purpose: central DOM references shared across modules.
- Functions: none (exports DOM nodes only).
- Exports: `ponyForm`, `ponyResult`, `ponyGrid`, `ponyNameButton`, `ponyNameInput`, `ponyBodyInput`, `ponyManeInput`, `ponyAccentInput`, `ponyTalentInput`, `ponyPersonalityInput`, `ponyMap`, `mapStatus`, `mapTooltip`, `mapLabelToggle`.

## `assets/js/utils.js`

- `pick(list)` — returns a random element from an array.
- `unique(list)` — de-duplicates an array while preserving order.
- `loadImage(src)` — Promise wrapper for image loading.
- `getWebpCandidates(path)` — returns WebP-first fallback list for PNG paths.
- `loadImageCandidates(paths, { cacheBust })` — loads the first available image path.
- `loadImageWithFallback(path, options)` — loads WebP when present, falls back to PNG.
- `loadJson(path)` — fetches JSON with `cache: "no-store"`.
- `formatTalent(talent)` — normalizes talent text, ensuring an "-ing" phrase.
- `formatPersonality(personality)` — returns a safe personality fallback.
- `toTitleCase(value)` — converts identifiers to title case (hyphens/underscores to spaces).

## `assets/js/api_mode.js`

- `HAS_API` — module-level flag set by `detectApi`.
- `detectApi()` — probes `/api/health` and stores availability (requires `{ "ok": true }`).
- `apiUrl(path)` — prefixes `/api` for a given path.

## `assets/js/vibes.js`

- `ensureVibes()` — loads `data/pony_vibes.json` once and caches it.
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
  - Pony creation uses `apiUrl("/ponies")` and is gated by `HAS_API`.
- Internal data: `fieldInputs` maps form keys to DOM inputs.

## `assets/js/pony-cards.js`

- `renderPonyCard(pony, imagePath, addToTop)` — builds the pony card markup and inserts it.
- `loadPonies()` — fetches `data/ponies.json` and renders all cards.
- `bindPonyCardActions()` — handles sprite generation and spritesheet preview buttons (API calls gated by `HAS_API`).
- Internal helpers:
- `loadBackstories()` — loads `data/pony_backstories.json` once and caches it.
  - `normalizeBackstoryText(text)` — strips JSON-wrapped backstory payloads.
  - `showBackstoryModal(ponyName, text, imageSrc)` — opens the backstory overlay with the pony portrait.
  - `resolveSheetPath(metaPath, meta, fallbackPath)` — picks a preview sheet (prefers trot/walk).
  - `updateCardStatus(card, message)` — status line updates.
  - `toggleCardButtons(card, disabled)` — disables/enables action buttons.

## `assets/js/speech/actions.js`

- `dispatchSpeechCommand(action)` — emits a `pony-speech-command` event for the map listener.

## `assets/js/speech/audio.js`

- `downsampleBuffer(buffer, inputRate, targetRate)` — simple averaging downsampler for mic capture.
- `floatTo16BitPCM(buffer)` — converts float audio to PCM16.
- `encodePCM16(pcm16)` — base64-encodes PCM16 for websocket payloads.
- `decodePCM16(base64)` — decodes base64 PCM16 from websocket payloads.
- `concatInt16(chunks)` — concatenates PCM chunks for playback replay.
- `pcm16ToWav(pcm16, sampleRate)` — wraps PCM audio in a WAV container.
- `PcmStreamPlayer` — queues PCM16 chunks for near-realtime playback; accepts an optional `onPlaybackStart({ scheduledStart, delayMs })` hook.

## `assets/js/speech/client.js`

- `SpeechClient` — websocket bridge for realtime speech; handles mic capture, audio streaming, transcripts, and audio playback.
  - Emits `onTranscript({ text, final })` and `onReply({ text, final, reset })` for UI consumers.
  - Emits `onAudioActivity(active)` when audio response chunks start/end.
  - Supports pipeline vs realtime with `setMode`, `startConvo`, `hangup`, and `isLiveReady` for session lifecycle.
  - Sends telemetry over the websocket for latency markers (`capture_start`, `utterance_stop`, `tts_first_audio_byte`, `audio_play_start`); toggle via `config.telemetry`.

## `assets/js/speech/ui.js`

- `initSpeechUI()` — async; wires the speech UI, loads pony selector, manages pipeline vs Live (STS) mode with Start Convo/Hang Up controls + auto-close warning, starts/stops pipeline listening (hold-to-speak button with mouse/keyboard + spacebar push-to-talk), streams hands-free audio in Live mode, updates pronunciation/actions, maintains a combined transcript log, updates the active pony avatar, and toggles the pronunciation helper panel.
  - Detects HTTPS helper on HTTP pages; override with `speech_helper_scheme` query param or `localStorage.speechHelperScheme`.

## `assets/js/map.js`

- Purpose: legacy import compatibility.
- Functions: none (re-export only).
- Exports: `loadMap` (from `assets/js/map/index.js`).

## `assets/js/map/index.js`

- `loadMap()` — loads map + pony + world data, then calls `initMap`.
- Internal helper:
  - `loadRuntimeState()` — pulls persisted runtime state via `apiUrl("/state")` when `HAS_API` is true.

## `assets/js/map/core.js`

- `initMap(mapData, ponies, locations, runtimeState)` — orchestrates map bootstrap (scaling, indices, assets, actors, render loop, runtime saves).
  - Listens for `pony-speech-command` events to issue manual tasks.
  - Defers pony spritesheet loading so the map renders before ponies stream in.

## `assets/js/map/config.js`

- `MAP_CONFIG` — simulation constants (rates, thresholds, intervals).
- `SUPPLY_TYPE_FOOD`, `SUPPLY_TYPE_DRINK`, `SUPPLY_TYPE_REPAIR` — supply identifiers.
- `SUPPLY_SOURCE_BY_TYPE` — location id mapping for supply sources.
- `SUPPLY_RECIPES_BY_TYPE`, `SUPPLY_RECIPES_BY_LOCATION` — ingredient recipes for restocking.
- `PRODUCER_INGREDIENT_OUTPUTS`, `INGREDIENT_WORK_DURATION_MULTIPLIERS`, `INGREDIENT_RESTOCK_MULTIPLIERS`, `INGREDIENT_ICON_MAP`, `LOCATION_SERVICE_ICONS`, `LOCATION_UPKEEP_ICONS`, `INGREDIENT_SUPPLY_TYPES`, `INGREDIENT_DESTINATIONS`, `UNLIMITED_INGREDIENTS` — ingredient + tooltip icon config.

## `assets/js/map/decor.js`

- `createDecorPlan({ mapData, objects, roadSegments, getStructureLabel })` — randomizes decor placement away from roads/structures and generates signpost objects near roads.

## `assets/js/map/locations.js`

- `buildLocationIndex(locations)` — returns `Map(id -> location)`.
- `createStructureLabeler(locationIndex)` — returns `getStructureLabel(item)`.

## `assets/js/map/inventory.js`

- `createInventoryState({ locationIndex, runtimeState })` — inventory state factory.
  - returns `inventoryState`, `ingredientState`, `getSpotInventory`, `getIngredientEntry`, `getSpotIngredients`, `isSpotStocked`, `consumeSpotInventory`, `restockSpotInventory`, `restockIngredient`, `consumeIngredients`.
  - Inventory entries are only created when a location defines an `inventory` block.

## `assets/js/map/spots.js`

- `createSpotHelpers(locationIndex)` — returns spot predicates (`isFoodSpot`, `isDrinkSpot`, `isFunSpot`, `isSupplySource`, etc) + `getSupplyTypesForSpot`.
- `createSpotIndex({ objects, getSpotInventory, helpers })` — returns spot arrays/maps + `spotByLocationId`.

## `assets/js/map/roads.js`

- `createRoadNetwork({ mapData, roads, mapWidth, mapHeight })` — road + pathfinding helpers.
  - returns `roadSegments`, `tileKey`, `findNearestRoadTile`, `buildTilePath`, `advanceAlongPath`, `endpointIndex`, `endpointKey`, `isOffMap`, `pickNextSegment`, `computeAccessPoint`, `findNearestSegmentToPoint`, `snapActorToNearestSegment`.

## `assets/js/map/houses.js`

- `createHouseState({ mapData, objects, runtimeState, config })` — house state + sleep spot helpers.
  - returns `houseObjects`, `housesById`, `houseStates`, `formatHouseStatus`, `innSleepSpots`, `claimInnSpot`, `releaseInnSpot`, `claimHouseSpot`, `releaseHouseSpot`, `findRepairTarget`, `updateHouseStates`.

## `assets/js/map/access.js`

- `createAccessPoints({...})` — builds access point maps.
  - returns `getInnTargetPoint`, `getHouseTargetPoint`, `getFoodTargetPoint`, `getDrinkTargetPoint`, `getFunTargetPoint`, `getHealthTargetPoint`, `getSupplyTargetPoint`, `getSupplySpotAccessPoint`, `getFoodSpotAccessPoint`, `getDrinkSpotAccessPoint`, `getFunSpotAccessPoint`, `getHealthSpotAccessPoint`, `updateAccessPointForItem`.

## `assets/js/map/needs.js`

- `createNeedHelpers({...})` — need prioritization + spot selection.
  - returns `pickNeedCandidate`, `normalizePreferenceList`, `matchesSpotPreference`, `pickFoodSpot`, `pickDrinkSpot`, `pickFunSpot`, `pickHealthSpot`, `getCriticalNeedTask`.

## `assets/js/map/tasks.js`

- `createTaskHelpers({...})` — task selection utilities and manual commands.
  - returns `getSpotForLocationId`, `getSupplySourceForType`, `getRestockSupplyType`, `createRestockTask`, `createRepairTask`, `getTaskTargetPoint`, `getActorPosition`, `assignManualTask`.
  - `assignManualTask` supports a `market` command to trigger a market supply run.
  - `assignManualTask` also accepts `{ command, ingredient }` for speech-triggered `gather` actions.

## `assets/js/map/assets.js`

- `loadStructureSprites({...})` — loads building/house sprites with repair variants.
- `loadDecorSprites({...})` — loads decor sprites.
- `loadStatusIcons({...})` — loads stat icon sprites.
- `loadPonySprites({...})` — loads pony spritesheets + animation metadata.

## `assets/js/map/command-menu.js`

- `createCommandMenu({...})` — command menu state + quickbar wiring.
  - returns `commandMenu`, `getCommandTarget`, `setCommandTarget`, `lastCommandStatsUpdate`, `hideCommandMenu`, `showCommandMenu`, `resolveTaskLabel`, `updateCommandStats`, `renderPonyQuickbar`, `bindPonyQuickbar`.

## `assets/js/map/magic-wand.js`

- `createMagicWand({...})` — global reset helper for supplies/repairs/stats.
  - returns `applyMagicWand`, `bindMagicWandButton`.

## `assets/js/map/vfx.js`

- `createVfxState({...})` — VFX registry + lake state.
  - returns `lakeState`, `updateLakeState`, `VFX_REGISTRY`, `vfxVideos`, `vfxByKey`, `setVideoActive`, `drawVideoOverlay`.

## `assets/js/map/runtime.js`

- `createRuntimeSaver({...})` — persists runtime state.
  - returns `saveRuntimeState`, `start`.
  - saves both `inventory` and `ingredients` snapshots.

## `assets/js/map/pony-loader.js`

- `createPonyLoader({...})` — async pony sprite loading + actor seeding.
  - returns `loadPonyActors`.

## `assets/js/map/supply-metrics.js`

- `createSupplyLogger({...})` — timed supply metrics logging.
  - returns `logSupplyStatus`.

## `assets/js/map/helpers.js`

- `createSpotOffset(mapData)` — returns `getSpotOffset(spot, key)`.
- `structureScale` — scale map for structure rendering.
- `createDragState()` — initializes drag state.
- `createTooltipLabel({...})` — builds tooltip label formatter with ingredient icons for markets, producers, and recipe inputs.
- `createMapScale({...})` — manages canvas resize and returns `getScale()`.

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

- Purpose: re-export `createActors` (state) + `createActorRenderer` (renderer).

## `assets/js/map/actors/state.js`

- `createActors({ sprites, roadSegments, mapWidth, runtimeState, maxActors, ... })` — seeds actor state, position, speed, stats, and drive thresholds.

## `assets/js/map/actors/supply.js`

- `createSupplyHelpers({...})` — supply task helpers.
  - returns `pickSupplyProducer`, `findSupplyNeed`, `getRestockSupplyType`, `createRestockTask`, `createRepairTask`, `getRestockRecipe`, `getSupplyAvailable`, `consumeSupplyFromSource`, `getProducerIngredients`, `getIngredientDestination`.

## `assets/js/map/actors/tasks.js`

- `createTaskHelpers({...})` — task selection/validation.
  - returns `updateActorTask`.

## `assets/js/map/actors/movement.js`

- `createMovementHandler({...})` — pathing + wandering movement.
  - returns `updateActorMovement`.

## `assets/js/map/actors/actions-needs.js`

- `createNeedActions({...})` — need actions.
  - returns `handleEatTask`, `handleDrinkTask`, `handleFunTask`, `handleVetTask`.

## `assets/js/map/actors/actions-work.js`

- `createWorkActions({...})` — work actions.
  - returns `handleRestockTask`, `handleSupplyTask`, `handleRepairPickupTask`, `handleWorkTask`, `handleRepairTask`.

## `assets/js/map/actors/actions-rest.js`

- `createRestActions({...})` — rest actions.
  - returns `handleInnRest`, `handleHomeRest`.

## `assets/js/map/actors/actions.js`

- `createActionHandlers({...})` — orchestrates action handlers.
  - returns `handleActorActions`.

## `assets/js/map/actors/updater.js`

- `createActorUpdater({...})` — per-actor update loop.
  - returns `updateActor`.

## `assets/js/map/actors/draw.js`

- `createActorDrawer({...})` — sprite + label rendering.
  - returns `drawActor`.
  - respects `pony.sprite_flip` and optional `pony.sprite_flip_actions` for per-action mirroring.

## `assets/js/map/actor-pipeline.js`

- `createActorPipeline({...})` — builds the actor renderer context from map systems.
  - returns `drawActors`.

## `assets/js/map/actors/renderer.js`

- `createActorRenderer(context)` — wires update + draw and returns `{ drawActors }`.

## `assets/js/map/draw.js`

- `createRenderer({...})` — returns `{ drawFrame, getStructureBounds }`.
- Internal helpers:
  - `drawRoads(scale)` — paints road segments and highlights.
  - `drawDecor(scale)` — paints decor assets.
  - `drawStructures(scale)` — paints structures/houses and tracks hit bounds.
  - `drawInventoryBars(scale)` — draws stock bars for inventory spots.
  - `drawFrame(delta, now)` — paints the full frame and runs per-frame updates.
  - `getStructureBounds()` — returns current structure hit-boxes.

## `assets/js/map/ui.js`

- `bindMapUI({...})` — wires pointer events, tooltips, drag/drop saving, and command menu actions.
  - Map persistence posts are gated by `HAS_API` and use `apiUrl(...)`.
  - Supports a `magic` command that applies the global reset helper when provided.
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

## `assets/js/stellacorn/world-map.js`

- Purpose: renders the Whispering Forest mission map, manages unlock/clear state, and exports/imports progress.
- Functions: none (module script).

## `assets/js/stellacorn/adventure.js`

- Purpose: entrypoint for Stellacorn missions; boots the runtime + mission script.
- Functions: none (module script).

## `assets/js/stellacorn/adventure/runtime.js`

- Purpose: mission runtime engine (map load, fog-of-war, movement, interactions, and render loop).
- `loadRuntime({...})` — loads mission config + assets, wires input, and returns a runtime API.
- Runtime API note: `openDialog(text, hero)` accepts an optional hero image, and `returnToWorldMap()` navigates back to the Whispering Forest map.

## `adventures/missions/stellacorn/*/mission.js`

- Purpose: mission-specific story logic co-located with mission assets (loaded dynamically via `mission.json`).
- `createMission(runtime, ui)` — configures interactions and visibility triggers for the mission.

## `assets/js/stellacorn/adventure/render.js`

- Purpose: rendering helpers for the Stellacorn mission runtime.
- `drawFrame(state)` — paints tiles, objects, and player each frame.
- `updatePlayerAnimation(state, delta)` — steps sprite animation timing.

## `assets/js/stellacorn/adventure/pathfinding.js`

- Purpose: shared A* pathfinding helpers for Stellacorn missions.
- `findPath(start, goal, { neighbors, isWalkable, heuristic })` — returns a tile path using callbacks for grid rules.

## Adventure Designer (`tools/adventure-designer/`)

### `tools/adventure-designer/index.html`
- Purpose: Adventure Designer entrypoint markup.

### `tools/adventure-designer/src/app.js`
- Purpose: boots the Adventure Designer UI, loads data, manages Sketch/Tile mode, and wires workflow actions.

### `tools/adventure-designer/src/context.js`
- Purpose: central DOM/state registry for the editor.

### `tools/adventure-designer/src/data.js`
- `getEditorConfig()` — resolves `tiles`, `objects`, `map` query params.
- `loadJson(path, fallback)` — fetches JSON with fallback.
- `loadPhaserIfAvailable()` — loads Phaser if present under `node_modules`.

### `tools/adventure-designer/src/editor.js`
- `createEditorHandlers(context, helpers)` — pointer + tool handlers for paint, fill, roads, rivers, lasso, delete, notes.

### `tools/adventure-designer/src/io.js`
- `exportDraft(context)` — downloads the current map JSON.
- `importDraft(context, file, helpers)` — imports map JSON and refreshes state.
- `normalizeImportedMap(data)` — validates and normalizes map shape.
- `createEmptyMap()` — fallback blank map.

### `tools/adventure-designer/src/intent-engine.js`
- `interpretIntent(description)` — keyword-to-tag mapper.
- `suggestTilesFromIntent(selection, map, intentTags, tilesByName)` — intent-to-tile edits.

### `tools/adventure-designer/src/minimap.js`
- `updateMinimap(context)` — renders tile or sketch minimap + note overlays.
- `jumpToMinimap(context, event)` — pans view to minimap click.

### `tools/adventure-designer/src/palette.js`
- `buildPalettes(context, setTool)` — tile/object palette UI.
- `updatePaletteActive(container, key, value)` — palette selection UI helper.

### `tools/adventure-designer/src/notes.js`
- `ensureNotesLayer(map)` — ensures `map.notes` exists.
- `readNoteDraft(context)` — pulls note text + size from the UI.
- `addNoteAt(context, grid)` — adds a note at the grid coordinate.
- `removeNote(context, noteId)` — deletes a note.
- `renderNotesList(context, handlers)` — renders notes list UI + remove wiring.
- `normalizeNotes(notes)` — normalizes raw note arrays.
- `formatNoteLabel(note)` — formats note list labels.

### `tools/adventure-designer/src/refine.js`
- `syncRefineDefaults(context)` — syncs base/target resolution inputs.
- `requestMapRefine(context)` — POSTs intent map + refinement params to `/api/map/refine`.
- `applyRefinedMap(context, refined)` — converts refined layers + decor rules into map data.

### `tools/adventure-designer/src/refine-decor.js`
- `applyDecorRules({ context, refined, terrainGrid, roadGrid, waterGrid, normalizeToken, isRoadToken, isWaterToken })` — deterministic decor placement from decor rules.

### `tools/adventure-designer/src/proposals.js`
- `runIntentProposal(context, helpers)` — generates local intent proposals.
- `applyProposal(context, helpers)` — applies proposal edits to the map.
- `clearProposal(context)` — clears proposal UI.

### `tools/adventure-designer/src/renderer/*`
- Purpose: Canvas/Phaser renderers for map preview.

### `tools/adventure-designer/src/selection.js`
- Purpose: selection + lasso helpers.

### `tools/adventure-designer/src/sketch.js`
- Purpose: sketch palette, sketch tile painting, and sketch-to-tile conversion helpers.

### `tools/adventure-designer/src/status.js`
- Purpose: status/hover readouts + zoom label updates.

### `tools/adventure-designer/src/ui.js`
- Purpose: binds DOM events to editor handlers.

### `tools/adventure-designer/src/utils.js`
- `clamp(value, min, max)` — numeric clamp.
- `interpolateLinePoints(start, end)` — line rasterization for roads/rivers.

### `tools/adventure-designer/src/store.js`
- Purpose: map state container + mutation helpers.

### `tools/adventure-designer/src/undo.js`
- Purpose: simple undo/redo stack.
