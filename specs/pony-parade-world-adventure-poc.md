# PONY PARADE — HOMM-STYLE WORLD + ADVENTURE MAP (POC SPEC FOR CODEX)

## Node 1 (“The Quiet Woods”) in this model

### Map layout
- Small overworld region.
- Mostly forest tiles.
- Few landmarks.
- Long sightlines, low density.

### Dynamics
- Player can walk freely.
- Roads exist but feel underused.
- Creatures are present but withdrawn.
- Ambient sounds are sparse.

### Completion condition
Not “reach X”, but:
- Talk to 2–3 creatures.
- Or visit 2–3 landmarks.
- Or cross a certain threshold of the map.

Same engine. Same rules. Different content density.

---

Goal: add a NEW, SEPARATE prototype (do NOT touch existing game code) that implements:
1) An ABSTRACT WORLD MAP (progress graph) page
2) A HOMM-II-LIKE ADVENTURE MAP (2D tile map) page entered from the world map
3) Progression: completing an adventure node unlocks neighbor nodes; show only 1-step locked neighbors

Target stack: vanilla ES modules + HTML5 Canvas + custom loop. Minimal placeholder visuals (colored tiles, circles).

---

## FILES / PATHS (suggested)
Create a new folder so nothing collides with existing site:
- `adventures/world-map.html`
- `adventures/adventure.html`
- `adventures/adventure.js`
- `adventures/maps/QUIET_WOODS.json`

Add a link from `index.html` to the adventure map:
- `<a href="./adventures/world-map.html">World Map</a>`

---

## WORLD MAP REQUIREMENTS (adventures/world-map.html)

### World map behavior
- World map is an abstract progression graph with nodes + edges.
- Nodes have states: unlocked, locked (visible if 1-step from any unlocked node), hidden otherwise.
- Unlocked nodes: normal style, clickable.
- Locked (visible): gray + lock icon, NOT clickable.
- Hidden: not drawn.

### Progression persistence
- Use `localStorage` to store:
  - `PP_PROGRESS_V1` (JSON string)
  - Structure:
    ```json
    {
      "cleared": { "QUIET_WOODS": true },
      "unlocked": { "QUIET_WOODS": true }
    }
    ```
- On load, compute unlocked nodes from stored progress.
- When an adventure is completed, `adventure.html` sets progress and redirects back here; world map reflects new unlocks.

### World map node graph (initial)
Use chapter "Taticorn in Transylponia". Keep node IDs stable.

Nodes:
- `QUIET_WOODS` (start; initially unlocked)
- `WHISPERING_FOREST` (locked, revealed from QUIET_WOODS)
- `HIDDEN_WORKSHOPS` (locked, revealed from WHISPERING_FOREST)
- `LANTERNLESS_VILLAGE` (locked, revealed from HIDDEN_WORKSHOPS)

Edges:
- QUIET_WOODS — WHISPERING_FOREST
- WHISPERING_FOREST — HIDDEN_WORKSHOPS
- HIDDEN_WORKSHOPS — LANTERNLESS_VILLAGE

### World map rendering
- Canvas-based.
- Draw edges as thick lines.
- Draw nodes as circles with labels underneath.
- Locked nodes: gray circle + lock icon inside circle.
- Edge styling:
  - If either endpoint is locked/hidden, edge should be lighter (optional).
- Clicking an unlocked node navigates to `adventure.html` with that node as selected location:
  - store `localStorage.PP_SELECTED_NODE = "<NODE_ID>"`
  - `location.href = "./adventure.html"`

---

## ADVENTURE MAP REQUIREMENTS (adventures/adventure.html + adventures/adventure.js)

### General model
- HOMM-like 2D map: tile grid with camera following player.
- Under-the-hood grid; pixel-smooth movement.
- Placeholder rendering: colored rectangles for tiles.
- A* pathfinding for click-to-move.

### Controls (HOMM-like)
- Single click on map: compute a path to clicked tile; display as "preview path" (overlay).
- Double click: commit and start moving along that preview path.
- Double-click definition: 2 clicks within ~300ms on same target tile (or within 1 tile tolerance).
- If user single-clicks a new target, update preview to new path.
- Movement begins ONLY after double click.

### Player movement
- Player has pixel position `(px, py)` and current tile `(tx, ty)`.
- Move along path tile-by-tile but smoothly:
  - Path is list of tile coords.
  - Player moves toward the center of next tile at speed = `BASE_SPEED * tileSpeedMult(currentTile)`.
- If path becomes blocked (shouldn't happen in POC), stop.

### Tile system (MVP)
Tile size: `tileSize = 32`.

Use numeric tile IDs in map JSON:
- 0 GRASS: walkable=true, speedMult=1.0, color="#8fd16a"
- 1 FOREST: walkable=true, speedMult=0.7, color="#2f8f4e"
- 2 ROAD: walkable=true, speedMult=1.25, color="#b08a5a"
- 3 MOUNTAIN: walkable=false, color="#6b6b6b"
- 4 WATER: walkable=false, color="#4a79d8"
- 5 VILLAGE: walkable=true, speedMult=1.0, color="#d6c2a3"

Road subtile variants: NOT required for MVP. Use a single ROAD tile. (Later: compute autotile shapes based on neighbors.)

Village: multi-tile area by placing multiple VILLAGE tiles in the grid.

### Adventure map JSON format (adventures/maps/QUIET_WOODS.json)
Example structure:
```json
{
  "id": "QUIET_WOODS",
  "tileSize": 32,
  "w": 30,
  "h": 20,
  "tiles": [ ... length w*h ints ... ],
  "spawn": { "tx": 3, "ty": 14 },
  "objects": [
    { "id":"OWL", "kind":"CREATURE", "tx": 9, "ty": 6, "r": 1.2, "text": ["The branches should sing...", "But they don’t."] },
    { "id":"SQUIRREL", "kind":"CREATURE", "tx": 14, "ty": 10, "r": 1.2, "text": ["We don’t chatter when the mist stays."] },
    { "id":"DEER", "kind":"CREATURE", "tx": 22, "ty": 12, "r": 1.5, "text": ["Something listens now."] }
  ],
  "complete": { "type":"TALK_COUNT", "count": 2 },
  "unlocks": ["WHISPERING_FOREST"]
}
```

### Interaction model
- Each creature/object has a minimum interaction distance r (in tiles).
- Convert to pixels: rPx = r * tileSize.
- If player is within range of an object:
  - show a small UI prompt: Press E to talk (or show a Talk button).
- On E (or click object), show a modal text box with the object’s text.
- Mark that object as interacted=true (persist only during this run; no need to store per-object state in localStorage for MVP).

### Completion rule for QUIET_WOODS
- When interacted count >= complete.count, show “Completed!” and enable Return button.

### Completion + return to world map
- On completion:
  - Update progress in `localStorage.PP_PROGRESS_V1`:
    - set cleared[mapId]=true
    - set unlocked[mapId]=true
    - for each ID in map JSON unlocks, set unlocked[thatId]=true
  - Then navigate back:
    - `location.href = "./world-map.html"`

### Camera
- Camera follows player smoothly (or just hard follow).
- Compute camX, camY so player is centered.
- Clamp camera to map bounds.
- Render loop: clear -> draw tiles -> draw objects -> draw player -> draw preview path -> draw UI overlays.

### Rendering requirements
- Draw tiles as solid colored rects.
- Draw objects as simple circles or icons.
- Draw player as a colored circle with an outline.
- Draw preview path as semi-transparent small squares or dots along tiles.

### Pathfinding requirements (A*)
- 4-direction movement for MVP (N/E/S/W). (Optional: allow diagonals later.)
- Cost:
  - base cost 1 per step
  - optionally weight by inverse speed (not required)
- Only walkable tiles considered.
- Return list of tile coords including start->goal (or start excluded; implement as convenient).
- If no path, preview path should clear and maybe flash “blocked”.

---

## WORLD MAP UNLOCK VISIBILITY RULE (1 step deep)
On world map, visible nodes are:
- all unlocked nodes
- plus locked nodes that are direct neighbors of any unlocked node
All other locked nodes are hidden.

---

## ACCEPTANCE TESTS (manual)
1. Open adventures/world-map.html:
   - See QUIET_WOODS unlocked and clickable.
   - See WHISPERING_FOREST as gray + lock.
   - HIDDEN_WORKSHOPS and LANTERNLESS_VILLAGE are hidden.
2. Click QUIET_WOODS:
   - Goes to adventure page, loads QUIET_WOODS map, spawns player.
3. Single click somewhere reachable:
   - Preview path appears, player does NOT move.
4. Double click same target quickly:
   - Player starts moving along preview path.
5. Walk near a creature:
   - Prompt appears. Press E to talk. Text shows. Counts as interacted.
6. After talking to 2 creatures:
   - Completion triggers; returns to world map.
7. Back on world map:
   - WHISPERING_FOREST becomes unlocked and clickable (since QUIET_WOODS map JSON has unlocks: ["WHISPERING_FOREST"]).
   - Show 1-step locked preview beyond WHISPERING_FOREST (HIDDEN_WORKSHOPS appears gray+lock).

---

## NOTES / FUTURE (NOT in MVP)
- Road subtile rendering (autotiling)
- Diagonal movement + diagonal road tiles
- Turn-based day/movement points
- Building entry sub-scenes
- Saving per-object interactions
- Art assets / sprites
