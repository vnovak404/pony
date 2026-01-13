# Speech Pipeline Todo + Memory

This file is a running checklist and memory dump for the speech pipeline and pony lore work.
Keep it up to date if work spans multiple sessions.

## Decisions (locked in)

- Source of truth for lore: `data/pony_lore.json`.
- Initial manual lore: Taticorn, Stellacorn, Catohorn, Tiny Horn, Nessie Star (2000-word backstories).
- Personal feedback entries captured for the manual lore ponies.
- New pony lore: generated via API call on creation (future helper).
- Relationship matrix: per-pony opinions of every other pony.
- Stellacorn sentiment: neutral at worst. Tiny Horn: universally loved.
- Speech helper: local service assembles session context (lore, opinions, layout, recent actions).
- Model policy: realtime S2S via `gpt-4o-realtime-preview` by default.

## Immediate Todo

- [x] Build `data/pony_lore.json` with:
  - [x] Personal feedback notes for those five.
  - [x] Opinions matrix for all ponies (no high negativity toward Stellacorn, all positive for Tiny Horn).
- [x] Move backstories to `data/pony_backstories.json` for long-form lore.
- [x] Scaffold local speech helper service (Python):
  - [x] Endpoints: `/health`, `/stt`, `/chat`, `/tts`, `/pronunciation-guide` (GET/POST).
  - [x] CORS allowlist for known local origins + optional `null` origin.
  - [x] Load API key from env or `.env`.
  - [x] Prompt assembly includes lore, opinions, Ponyville layout, and recent actions.
- [x] Add pronuncation guide storage:
  - [x] File: `data/_generated/pronunciation_guide.json` (create if missing).
  - [x] Support upserts + deletes via API.
- [x] Add realtime S2S bridge (WebSocket) for `gpt-4o-realtime-preview`.
- [x] Wire frontend mic capture + audio streaming + playback in UI.
- [x] Wire pronunciation guide + action log updates from UI.
- [ ] Generate backstories for remaining ponies via API.

## Next

- [x] Add a lore generator helper (API call) for new ponies:
  - [x] Writes into `data/pony_lore.json`.
  - [x] Also writes opinions for new pony and updates others' opinions.
- [x] Store recent actions:
  - [x] File: `data/_generated/speech_recent_actions.json`.
  - [x] Keep last 30 actions, newest last.
- [x] Ponyville layout summary helper:
  - [x] Pull from `assets/world/maps/ponyville.json` + `data/world_locations.json`.
  - [x] Provide quick list of landmarks, houses, and locations for LLM context.

## Later

- [x] Streaming audio support via realtime WS bridge.
- [ ] Cache frequent replies locally.
- [ ] Optional local offline fallback (STT/LLM/TTS).
- [ ] Packaging:
  - [ ] Start with Python install + script entrypoint.
  - [ ] Evaluate native binary or Electron wrapper later.

## Notes

- If Taticorn lore needs alignment with an earlier draft, ask for pointers and revise.
- Ensure new helpers are documented in `docs/python-scripts.md`.
