# Codex Instruction Package - Pony Parade "Static Public Website v1"

## Context (what exists today)
Pony Parade is currently a browser game run via a local Python HTTP server
(`scripts/pony_server.py`). The server does multiple things beyond "serve files": it
powers `/api/*` endpoints for pony creation, sprite/portrait generation, map edit
persistence, and runtime state persistence. See `docs/python-scripts.md` section for
`pony_server.py` endpoints.
Key endpoints today include:
- `POST /api/ponies` (create pony, may trigger async generation)
- `POST /api/ponies/<slug>/sprites`, `/spritesheet` (generation tooling)
- `POST /api/map/objects/<id>` (persist map edits)
- runtime state persistence via `/api/state` (documented in JS modules doc as
  `loadRuntimeState()` pulling `/api/state`)

## Initial Intent (what user wants now)
Ship a public static website first:
- No backend required
- No auth required
- No sessions required
- No cross-device persistence requirement
- "Generate assets" can remain a local/dev-only feature for now (or be disabled in the
  public build)

## Final Intent (where this is going later)
Later versions will add:
- login-gated generation
- coin/credit-gated generation (server-authoritative)
- proper sessions (cookie/JWT) and job queue for generation
BUT: do not implement any of that now.

## What you should actually do right now (deliverables)
Goal: the site should run cleanly as a static-only app with no dependency on
`pony_server.py` or `/api/*`.

### A) Add a frontend storage abstraction (to avoid future refactors)
Create a small "state store" layer with a default in-memory implementation.

1) New file: `assets/js/state_store.js` (or similar central location)
   - Export an interface-ish shape and a default store instance.
   - Implement `MemoryStateStore`:
     - `getRuntimeState(): object | null`
     - `setRuntimeState(state: object): void`
     - `getPonies(): array | null` (optional, only if needed)
     - `setPonies(ponies: array): void` (optional)
   - Keep it minimal; do not introduce a framework.

2) Update any runtime-state load/save code to use the store instead of `/api/state`.
   - In "static mode" runtime state should be:
     - empty on first load
     - persisted only for the current tab lifetime (memory)
   - If there is code that saves state to server, change it to save into the store.

### B) Remove/disable server API dependency paths (graceful, not brittle)
Make sure the app works when hosted as static files (Cloudflare Pages / Netlify / S3 /
 etc).

1) Any code path that calls:
   - `/api/state`
   - `/api/ponies`
   - `/api/map/...`
   must be either:
   - disabled in static mode, OR
   - replaced with a local-only behavior.

2) Pony creation UI:
   - If the current pony creation form submits to `POST /api/ponies`, change behavior
     for static mode:
     - Option 1 (preferred for now): keep pony creator UI but make it "local-only": it
       creates a pony record in-memory and uses existing pre-generated assets only
       (no generation).
     - Option 2: disable the pony creator UI in static mode with a small banner:
       "Creation is available in the local/dev version." (No broken buttons.)

3) Map object drag/drop persistence:
   - If it currently `POST`s to `/api/map/objects/<id>`, disable persistence in static
     mode (changes are ephemeral).
   - Keep the drag/drop behavior if possible; just do not persist.

### C) Add a "static mode" toggle (simple and explicit)
Introduce a single config flag in one place. Do NOT build a complex build system.

Implementation options (pick one, keep it simple):
- `window.PONY_PARADE_STATIC = true;` set via a `<script>` tag in `index.html`
OR
- `assets/js/config.js` exporting `STATIC_MODE = true`

Then: guard all server-fetch code with `if (!STATIC_MODE) { ... }`.

### D) Update docs for the new run modes
Update:
- `README.md`
- `docs/js-modules.md` (or the provided `js-modules.md` if that is the canonical doc)
- `docs/python-scripts.md` (or provided `python-scripts.md`)

Required documentation changes:
1) "Static mode (no server)" instructions:
   - Recommend running a generic static server locally for module loading:
     - `python3 -m http.server 8000`
   - Confirm it works when deployed as a static host.

2) Clarify "Local dev + generation mode" still uses `python3 scripts/pony_server.py`
   and `.env OPENAI_API_KEY`.

### E) Acceptance criteria (must pass)
1) When served by a dumb static server (e.g. `python3 -m http.server`):
   - No calls to `/api/*` are made (verify in devtools Network tab).
   - No uncaught exceptions occur.
   - The main sim renders and runs.

2) Pony creation:
   - Either works locally without server (local-only pony record) OR is clearly
     disabled without errors.

3) Map interactions:
   - If there is drag/drop, it works but is non-persistent (fine).

4) No secrets, no `.env`, no backend required.

## Non-goals (explicitly do NOT do these now)
- Do not implement login, wallets, sessions, JWT, cookies, or credit accounting
- Do not implement serverless functions or a production backend
- Do not refactor the whole app; keep changes surgical and reversible
- Do not remove the existing Python generation tooling; just decouple static runtime
  from it

## Notes / rationale
This change is about making a clean static public v1 while preserving the ability to
add:
- anonymous sessions later
- then login
- then coin/credit gating
without having to rip out hardcoded `/api/*` assumptions.

Keep modules small and update docs whenever you change module responsibilities.
