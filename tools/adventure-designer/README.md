# Adventure Designer

Browser-based editor for Stellacorn-style tile maps.
Start in Sketch Mode, paint a rough layout, then convert to tiles and refine.

## Open
- `tools/adventure-designer/index.html`

## Workflow
- Sketch Mode: paint rough regions with the sketch palette.
- `Generate Tiles from Sketch` to populate the tile grid.
- `Prettify Forest Edge` to add forest border/canopy tiles.
- Add Map Notes (Note tool) to annotate key placements for AI minimap generation.
- `Refine Map (LLM)` sends the intent map + notes to the local server for structured map refinement.
- Switch to Tile Mode for roads/objects/intent edits.
- Save Draft to export JSON; Import Draft to continue work.

## Data Inputs
Defaults target mission1 data:
- Tiles: `adventures/missions/stellacorn/mission1/data/adventure_tiles.json`
- Objects: `adventures/missions/stellacorn/mission1/data/adventure_objects.json`
- Draft map: none (empty map if `map` is omitted)

Override via query params:
- `?tiles=...&objects=...&map=...`

## Draft Format
Maps are JSON with `width`, `height`, `tiles`, optional `objects`, `roads`,
`rivers`, `storyZones`, and optional `notes`. Sketch Mode also stores `sketchTiles`.
