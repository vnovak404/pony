# Python Scripts and Modules

This repository uses Python for asset generation, server helpers, and sprite tooling.
This document lives at `docs/python-scripts.md`.
Update this file whenever a script changes behavior, CLI flags, or function signatures.

## `scripts/generate_pony_images.py`

- Purpose: generate hero portrait WebP images for ponies/unicorns from `data/ponies.json`.
- Uses: OpenAI Images API via raw `urllib` requests.
- Environment: `OPENAI_API_KEY` (from env or `.env`).
- CLI:
  - `--data` path to `data/ponies.json` (default `data/ponies.json`).
  - `--output-dir` output folder (default `assets/ponies`).
  - `--model`, `--size`, `--quality`, `--count` for API settings.
  - `--target-size` final output size in pixels (default 512).
  - `--only` pony slugs to generate (comma separated).
  - `--extra-prompt` appended prompt text.
  - `--sleep` seconds between requests.
  - `--dry-run` print prompts only.
  - `--overwrite` overwrite existing files.
  - `--env-file` for local key (default `.env`).
  - `--api-url` override endpoint (default OpenAI images).
- Key functions:
  - `load_pony_data(path)` — loads style + ponies from JSON.
  - `is_gpt_image_model(model)` — model gate for response format.
  - `resolve_request_size(model, size)` — ensures valid API sizes for gpt-image-1.
  - `load_env_value(path, key)` — parses `.env` style files.
  - `slugify(name)` — slug helper for filenames.
  - `build_prompt(pony, style, extra_prompt)` — constructs portrait prompt.
  - `request_images(...)` — POSTs to the Images API and returns data payload.
  - `save_images(image_data, output_dir, slug, overwrite, target_size)` — writes WebP files.
  - `parse_args()` / `main()` — CLI entrypoint.
- Example usage:
  - `python3 scripts/generate_pony_images.py`
  - `python3 scripts/generate_pony_images.py --only golden-violet`
  - `python3 scripts/generate_pony_images.py --size 1024x1024 --quality auto`
  - `python3 scripts/generate_pony_images.py --target-size 512`
  - `python3 scripts/generate_pony_images.py --dry-run`

## `scripts/pony_server.py`

- Purpose: serve the Pony Parade site and local API endpoints for pony creation and map edits.
- CLI:
  - `--host`, `--port` server bind (default `127.0.0.1:8000`).
  - `--data` path to `data/ponies.json`.
  - `--output-dir` output folder for generated portraits.
  - `--env-file` `.env` path for `OPENAI_API_KEY`.
  - `--map` path to the Ponyville map JSON.
  - `--state` path for runtime state persistence.
  - `--asset-manifest` path to the asset library manifest JSON.
- Behavior:
  - On pony creation, runs sprite generation, spritesheet packing, house assets, and pony lore generation.
  - `POST /api/map/refine` accepts a low-res intent map + legend + refinement params, runs a deterministic in-process refiner, and returns structured map layers + decor rules (no images).
    - The refiner expands macro-cells to the target resolution and applies a seeded boundary jitter + smoothing pass.
  - `POST /api/assets/generate` accepts asset payloads (type, prompt, provider, sizes), writes a WebP into the asset library, and appends a manifest entry.
    - Supports provider `openai` only; writes raw PNGs to `../pony_generated_assets/asset_forge/`.
  - `GET /api/assets/manifest` returns the asset library manifest JSON (read from disk each request).

## `scripts/generate_pony_sprites.py`

- Purpose: generate per-action sprite frames for each pony (idle first when editing from a portrait).
- Uses: `scripts/sprites/prompting.py`, `scripts/sprites/images_api.py`, `scripts/sprites/qc.py`.
- Environment: `OPENAI_API_KEY` (via `images_api.ensure_api_key()`).
- CLI:
  - `--pony` pony slug (optional; all ponies by default).
  - `--actions` comma-separated action IDs (default all).
  - `--force` overwrite existing frames.
  - `--dry-run` print prompts only.
  - `--jobs` parallel workers (default 6).
  - `--max-retries` per-frame retry cap (default 5).
  - `--size` frame size override (default from `data/pony_actions.json`).
  - `--source-image` edit from a source image (single pony only).
  - `--use-portrait` use existing portrait as the source image for idle, then edit other actions from idle.
  - `--data` pony JSON path.
  - `--actions-data` actions JSON path.
  - `--auto-flip` auto-flip frames to face right.
- Key functions:
  - `load_json(path)` — reads JSON from disk.
  - `build_frame_name(action_id, index, frame_count)` — uses prompt phase names.
  - `select_actions(action_list, selected)` — filters actions list.
  - `generate_frame(task)` — single frame pipeline: prompt -> API -> QC -> retry.
  - `log(prefix, message)` — prefixed logging.
  - `main()` — builds task list and runs in a thread pool.
- Example usage:
  - `python3 scripts/generate_pony_sprites.py --pony golden-violet`
  - `python3 scripts/generate_pony_sprites.py --pony golden-violet --actions idle,walk`
  - `python3 scripts/generate_pony_sprites.py --pony golden-violet --use-portrait`
  - `python3 scripts/generate_pony_sprites.py --dry-run`

## `scripts/pony_server/asset_generation.py`

- Purpose: API-backed asset generation helper for Asset Forge (`POST /api/assets/generate`).
- Supports: provider `openai` only (uses `scripts/sprites/images_api.py`).
- Outputs: WebP files in `assets/library/maps/<type>/<stage>/` and raw PNGs in `../pony_generated_assets/asset_forge/`.
- Key function:
  - `generate_asset(payload, manifest_path, library_root, generated_root, env_file)` — validates payload, generates/converts image, appends manifest entry.

## `scripts/pack_spritesheet.py`

- Purpose: pack sprite frames into a single spritesheet WebP + JSON metadata.
- Uses: Pillow for image IO, `scripts/sprites/qc.py`, `scripts/sprites/prompting.py`.
- Output: `spritesheet.webp` + `spritesheet.json` (PNG is temporary and removed).
- CLI:
  - `--pony` pony slug (optional; all ponies with frames by default).
  - `--columns` spritesheet columns (default 8).
  - `--frame-size` frame size in pixels (default 512).
  - `--frames-subdir` frames subdirectory under each pony (default `frames`).
  - `--fallback-subdir` fallback frames subdirectory for missing actions (default `frames_dense`).
  - `--prefer-dense` prefer numeric dense frames when explicit keyframes exist (default on).
  - `--no-prefer-dense` prefer explicit keyframes when both exist.
  - `--max-size` max sheet width/height in pixels (default 8192).
  - `--retime` scale FPS by dense frame count (default on).
  - `--no-retime` keep original FPS.
  - `--max-fps` FPS cap when retiming (default 60).
  - `--actions-data` path to actions JSON.
  - `--auto-flip` auto-flip frames to face right.
- Key functions:
  - `load_json(path)` — loads action data.
  - `collect_action_frames(frames_dir, action_id, prefer_dense)` — orders frames for one action.
  - `pack_single_sheet(...)` — packs all frames into one spritesheet.
  - `pack_spritesheet(pony_id, frame_size, columns, action_data, auto_flip, frames_subdir, prefer_dense, max_size, fallback_subdir, retime, max_fps)` — writes WebP + JSON.
  - `main()` — iterates ponies and packs sheets.
- Example usage:
  - `python3 scripts/pack_spritesheet.py --pony golden-violet`
  - `python3 scripts/pack_spritesheet.py --columns 6 --frame-size 512`
  - `python3 scripts/pack_spritesheet.py --pony golden-violet --max-size 8192`
  - `python3 scripts/pack_spritesheet.py --pony golden-violet --fallback-subdir frames_dense --no-prefer-dense`

## `scripts/validate_spritesheets.py`

- Purpose: validate spritesheet WebP/JSON pairs for each pony and required actions.
- Checks:
  - `spritesheet.webp` (or `.png`) + `spritesheet.json` exist per pony.
  - JSON parses and includes animations/frames.
  - Each action has frames or falls back to idle.
- Example usage:
  - `python3 scripts/validate_spritesheets.py`

## `scripts/build_public.py`

- Purpose: build a minimal `public/` folder for static deployment.
- Output includes:
  - `index.html`, `styles.css`, `styles/` (CSS partials)
  - `adventures/` (world map + adventure prototype pages/assets)
  - `assets/js/`, `assets/ui/`, `assets/world/` (prefers `.webp` for image assets)
  - `assets/ponies/*.webp` (falls back to `.png` if no WebP)
  - `assets/ponies/<pony>/sheets/spritesheet.webp` + `spritesheet.json`
  - `data/*.json` (excluding `runtime_state.json`)
- CLI:
  - `--output` output directory (default: `public`)
  - `--clean` delete output directory before copying
- Example usage:
  - `python3 scripts/build_public.py --clean`

## `scripts/build_asset_manifest.py`

- Purpose: build the centralized asset library manifest consumed by Asset Forge.
- Output: `assets/library/manifest.json`.
- Reads: asset files under `assets/library/maps/` and prompt dictionaries in `scripts/generate_adventure_assets.py`.
- Includes: per-asset prompts, prompt profiles, and regeneration commands when available.
- CLI:
  - `--output` output manifest path (default `assets/library/manifest.json`).
  - `--library-root` asset library root (default `assets/library/maps`).
- Example usage:
  - `.venv/bin/python scripts/build_asset_manifest.py`

## `scripts/convert_assets_webp.py`

- Purpose: generate `.webp` copies of asset images under `assets/`.
- Defaults:
  - converts `.png`, `.jpg`, `.jpeg`
  - skips `frames/` and `frames_dense/` unless `--include-frames` is set
- CLI:
  - `--root` assets root (default `assets/`).
  - `--quality` lossy quality (default 85).
  - `--lossless` use lossless WebP.
  - `--method` compression method 0-6 (default 6).
  - `--force` overwrite existing `.webp`.
  - `--include-frames` include pony frame directories.
- `--prune-source` delete source images after conversion.
- `--dry-run` print planned conversions.
- Example usage:
  - `python3 scripts/convert_assets_webp.py --dry-run`
  - `python3 scripts/convert_assets_webp.py --quality 82`
  - `python3 scripts/convert_assets_webp.py --lossless --include-frames`
  - `python3 scripts/convert_assets_webp.py --prune-source`

## `scripts/generate_pony_lore.py`

- Purpose: generate pony backstories and relationship opinions using the OpenAI API.
- Environment: `OPENAI_API_KEY` (from env or `.env`).
- Optional env: `OPENAI_LORE_MODEL` to override the default lore model.
- Output: prints per-pony progress updates during generation.
- Notes: writes ~100-word backstory summaries into `data/pony_lore.json`.
- Reads:
  - `data/ponies.json` (pony roster).
  - `data/pony_lore.json` (lore + opinions output).
  - `data/pony_backstories.json` (backstory output).
  - `data/lore_arcs.json` (arc bundles/slots used to vary backstory beats).
- CLI:
  - `--data`, `--lore`, `--backstories` data paths.
  - `--arcs` arc JSON path (default `data/lore_arcs.json`).
  - `--env-file` path to `.env` with `OPENAI_API_KEY`.
  - `--model` OpenAI model for generation.
  - `--word-target` target word count for backstories (default 900).
  - `--max-retries` regeneration attempts if family rules are violated.
  - `--arc-variants` number of candidate arc tuples to store (default 1).
  - `--refresh-arcs` regenerate arc tuples even if already stored.
  - `--seed` set RNG seed for arc selection.
  - `--only` comma-separated slugs to generate.
  - `--skip-backstories` skip backstory generation.
  - `--summaries-only` only generate 100-word backstory summaries.
  - `--refresh-summaries` regenerate summaries even if present.
  - `--update-opinions` generate opinions via the API.
  - `--opinions-scope` `all` or `selected` (when used with `--only`).
  - `--force` overwrite existing backstories.
  - `--seed-only` only seed lore entries/opinion matrix (no API calls).
  - `--dry-run` print prompts only.
- Example usage:
  - `.venv/bin/python scripts/generate_pony_lore.py --seed-only`
  - `.venv/bin/python scripts/generate_pony_lore.py --update-opinions`
  - `.venv/bin/python scripts/generate_pony_lore.py --only moonbeam --word-target 900`
  - `.venv/bin/python scripts/generate_pony_lore.py --arc-variants 2 --refresh-arcs`

## `scripts/speech_helper.py`

- Purpose: run the local BYOK speech helper for realtime speech (S2S) plus pronunciation handling.
- Environment: `OPENAI_API_KEY` (from env or `.env`).
- Optional env:
  - `SPEECH_MODE` (`realtime` or `pipeline`, default `realtime`).
  - `SPEECH_FORCE_FALLBACK` (`1` or `0`, default `0`) to bypass LLM and use the fallback reply.
  - `SPEECH_HISTORY_TURNS` (default `4`) to keep the last N user/pony turns in the LLM context.
  - `SPEECH_MAX_OUTPUT_TOKENS` (default `3000`) to cap LLM output length in pipeline mode.
  - `SPEECH_TLS_CERT`, `SPEECH_TLS_KEY` for HTTPS/WSS helper mode.
  - `OPENAI_REALTIME_MODEL` (default `gpt-4o-realtime-preview`).
  - `OPENAI_REALTIME_VOICE` (default `coral`).
  - `OPENAI_REALTIME_TRANSCRIPTION_MODEL` (default `whisper-1`).
  - `OPENAI_REALTIME_INPUT_FORMAT` (default `pcm16`).
  - `OPENAI_REALTIME_OUTPUT_FORMAT` (default `pcm16`).
  - `OPENAI_REALTIME_IDLE_TIMEOUT` (default `120` seconds; 0 disables).
  - `OPENAI_REALTIME_MAX_SESSION` (default `900` seconds; 0 disables).
  - `OPENAI_REALTIME_SILENCE_DURATION_MS` (default `500`; 0 disables).
  - `OPENAI_REALTIME_BARGE_IN_MIN_CHARS` (default `4`; min transcript chars to cancel playback).
  - `OPENAI_FAST_MODEL`, `OPENAI_SMART_MODEL` (defaults to `gpt-5-nano-2025-08-07`).
- Reads:
  - `data/pony_lore.json` (pony lore + opinions).
  - `data/pony_backstories.json` (long-form backstories served via tool calls; not embedded in prompt context).
  - `data/world_locations.json` (location summary).
  - `data/_generated/speech_recent_actions.json` (recent actions).
  - `data/_generated/pronunciation_guide.json` (pronunciation entries).
  - Prompt context includes: location names + tags, the active pony's attitudes toward other ponies, and recent actions.
  - Pronunciation guide is used for STT normalization, not included in the LLM prompt.
- Writes:
  - `logs/conversations/<pony-slug>-timestamp.txt` (conversation transcripts).
  - Log timestamps are written in UTC with a `Z` suffix.
- Endpoints:
  - `GET /health` - service status.
  - `POST /stt` - audio in, normalized text out (legacy).
  - `POST /chat` - text in, LLM reply out (legacy).
  - `POST /tts` - text in, audio out (legacy).
  - `GET /pronunciation-guide` - fetch pronunciation entries.
  - `POST /pronunciation-guide` - update pronunciation entries.
  - `POST /actions` - append a recent action.
- WebSocket:
  - `ws://<host>:<ws-port>` - speech bridge for audio/text streaming (pipeline or realtime).
- Pipeline mode:
  - `SPEECH_MODE=pipeline` switches the WS bridge to STT → LLM → QA/FILTER/RETRY → TTS.
  - Audio is synthesized via `tts-1` with `response_format=pcm` and streamed from the API as base64 PCM16 chunks.
  - Logs include a brief response-shape hint when the LLM returns empty text.
  - Tool calls (`pony_action`, `pony_backstory`) are supported in pipeline mode.
  - LLM replies stream token deltas and forward them over WS as `llm_delta` messages.
  - Turns shorter than 0.5s (button hold) are skipped before STT/LLM/TTS.
- Realtime mode:
  - Hands-free STS: client sends `start_convo` to begin; server VAD handles turn detection with `create_response=true`.
  - Client streams continuous audio chunks; no manual `commit` or `response.create` on stop.
  - Session update uses a short persona anchor; place names + pony attitudes are inserted once per session, and the full backstory follows as a system item.
  - Transcript events are treated as rolling updates; the helper emits a single `final` transcript per turn at the model response boundary.
  - Barge-in is supported: server VAD `input_audio_buffer.speech_started` cancels playback (with a short grace window + debounce).
- Latency telemetry:
  - Logs stage markers with millisecond timestamps (`capture_start`, `utterance_stop`, `stt_start`, `stt_first_partial`, `stt_final`, `llm_start`, `llm_first_token`, `llm_done`, `tts_start`, `tts_first_audio_byte`, `tts_done`, `audio_play_start`).
  - Logs `latency_excl_speech ms=<n>` using client timestamps when available.
  - Client-side telemetry is sent over the WS for capture/playback milestones.
- Dependency: install `websockets` (`pip install websockets`) for realtime mode.
- CLI:
  - `--host`, `--port` server bind (default `127.0.0.1:8091`).
  - `--ws-port` websocket bind (default `8092`).
  - `--env-file` path to `.env` with `OPENAI_API_KEY`.
  - `--lore`, `--backstories`, `--map`, `--locations`, `--actions`, `--pronunciation-guide` data paths.
  - `--allowed-origin` repeatable CORS allowlist entries.
  - `--allow-null-origin` allow `file://` origins.
  - `--fast-model`, `--smart-model`, `--stt-model`, `--tts-model`, `--tts-voice`.
  - `--realtime-model`, `--realtime-voice`, `--realtime-transcription-model`.
  - `--realtime-input-format`, `--realtime-output-format`.
  - `--realtime-url` override websocket endpoint (default `wss://api.openai.com/v1/realtime?model={model}`).
  - `--realtime-idle-timeout` idle seconds before closing a realtime session.
  - `--realtime-max-session` max seconds before forcing a realtime reconnect.
  - `--realtime-silence-duration-ms` sets server VAD silence detection for hands-free STS.
  - `--realtime-barge-in-min-chars` minimum transcript chars to trigger barge-in cancel.
  - `--speech-mode` set `realtime` or `pipeline`.
  - `--tls-cert`, `--tls-key` enable HTTPS/WSS (required for https sites).
  - If `certs/localhost-cert.pem` + `certs/localhost-key.pem` exist, the helper auto-loads them.
  - `--no-fallback-smart` disable smart-model fallback.
- Example usage:
  - `.venv/bin/python scripts/speech_helper.py`
  - `.venv/bin/python scripts/speech_helper.py --allow-null-origin`
  - The realtime prompt inserts the full backstory once per session for the active pony.

## `scripts/setup_local_tls.py`

- Purpose: generate a local CA + localhost cert (SANs for `localhost` + `127.0.0.1`) so the helper can run on HTTPS/WSS for `https://` sites.
- Output: `certs/ponyparade-ca-cert.pem`, `certs/ponyparade-ca-key.pem`, `certs/localhost-cert.pem`, `certs/localhost-key.pem`.
- CLI:
  - `--output-dir` (default `certs`)
  - `--ca-name` CA common name
  - `--hostname`, `--ip` for SAN entries (default `localhost`, `127.0.0.1`)
  - `--days` cert validity (default 365)
  - `--force` overwrite existing files
  - `--install` attempt to install CA into the OS trust store
- Example usage:
  - `.venv/bin/python scripts/setup_local_tls.py`
  - `.venv/bin/python scripts/setup_local_tls.py --install`
  - `.venv/bin/python scripts/speech_helper.py --tls-cert certs/localhost-cert.pem --tls-key certs/localhost-key.pem`

## `scripts/interpolate_pony_sprites.py`

- Purpose: generate dense walk/trot frames via optical-flow interpolation.
- Uses: OpenCV + numpy, `scripts/sprites/qc.py`, `scripts/sprites/prompting.py`.
- CLI:
  - `--pony` pony slug (optional; all ponies by default).
  - `--actions` comma-separated action IDs (default `walk,trot`).
  - `--frames-root` root folder for pony assets.
  - `--input-subdir` keyframe directory (default `frames`).
  - `--output-subdir` dense frame directory (default `frames_dense`).
  - `--walk-inbetweens` in-betweens per walk gap (default 10).
  - `--trot-inbetweens` in-betweens per trot gap (default 12).
  - `--pad` zero padding for output names (default 4).
  - `--alpha-threshold` alpha cutoff for foot stabilization (default 16).
  - `--normalize` normalize frame scale from keyframes (default on).
  - `--no-normalize` skip scale normalization.
  - `--scale-min` min normalization scale (default 0.75).
  - `--scale-max` max normalization scale (default 1.35).
  - `--global-reference` action ID used as global size reference (default `walk`).
  - `--max-shift` max Y shift in pixels (default 8).
  - `--winsize`, `--levels`, `--iterations`, `--poly-n`, `--poly-sigma` — optical flow tuning.
  - `--force` overwrite existing dense frames.
  - `--no-qc` skip QC checks.
  - `--dry-run` print planned output only.
- Key functions:
  - `interpolate_action(keyframes, inbetweens, flow_cfg)` — yields interpolated frames.
  - `qc_dense_frame(path)` — QC for dense frames with tighter bounds.
  - `load_keyframes(frames_dir, action_id)` — loads keyframes in phase order.
  - `write_dense_frames(...)` — writes dense frames and runs QC.
- Example usage:
  - `python3 scripts/interpolate_pony_sprites.py --pony golden-violet`
  - `python3 scripts/interpolate_pony_sprites.py --pony golden-violet --walk-inbetweens 10 --trot-inbetweens 12`
  - `python3 scripts/interpolate_pony_sprites.py --pony golden-violet --output-subdir frames_dense`

## `scripts/generate_structure_assets.py`

- Purpose: generate building and map decor WebP assets.
- Uses: `scripts/sprites/images_api.py`.
- Prompts: `scripts/structure_prompts.json` (editable).
- CLI:
  - `--output-dir` override target folder.
  - `--size` output size (default 512).
  - `--force` overwrite existing assets.
  - `--only` comma-separated IDs.
  - `--decor` generate `DECOR` instead of `STRUCTURES`.
  - `--prompts` path to JSON prompt definitions (default `scripts/structure_prompts.json`).
- Key functions:
  - `parse_args()` / `main()` — dispatches assets from `STRUCTURES` or `DECOR`.
- Example usage:
  - `python3 scripts/generate_structure_assets.py`
  - `python3 scripts/generate_structure_assets.py --only inn_01,bakery_01`
  - `python3 scripts/generate_structure_assets.py --decor`

## `scripts/generate_pony_houses.py`

- Purpose: generate per-house WebP sprites based on resident pony traits.
- Uses: `scripts/sprites/images_api.py`.
- Environment: `OPENAI_API_KEY`.
- CLI:
  - `--data` path to `ponies.json`.
  - `--output-dir` output folder (default `assets/world/houses`).
  - `--only` comma-separated house IDs.
  - `--pony` comma-separated pony slugs.
  - `--size` output size (default 512).
  - `--force` overwrite.
  - `--dry-run` print prompts only.
- Key functions:
  - `load_data(path)` — reads JSON.
  - `sanitize(value)` — trims text.
  - `build_house_prompt(house)` — crafts a prompt from residents, colors, jobs.
  - `collect_houses(ponies, only_houses, only_ponies)` — builds house data from ponies.
  - `parse_args()` / `main()` — CLI entrypoint.
- Data notes:
  - `house.palette` (optional) — override palette colors for the house prompt.
  - `house.prompt` (optional) — extra prompt text appended to the house prompt.
- Example usage:
  - `python3 scripts/generate_pony_houses.py`
  - `python3 scripts/generate_pony_houses.py --pony golden-violet`
  - `python3 scripts/generate_pony_houses.py --only house-golden-violet`
  - `python3 scripts/generate_pony_houses.py --dry-run`

## `scripts/generate_house_state_assets.py`

- Purpose: generate repair/ruined WebP variants for house sprites.
- Uses: `scripts/generate_pony_houses.py` for house collection + style bible.
- Uses: `scripts/sprites/images_api.py` (image edit endpoint).
- CLI:
  - `--data` path to `ponies.json`.
  - `--output-dir` output folder (default `assets/world/houses`).
  - `--only` comma-separated house IDs.
  - `--pony` comma-separated pony slugs.
  - `--states` comma-separated states (`repair`, `ruined`).
  - `--size` output size or `"auto"`.
  - `--force` overwrite.
  - `--dry-run` print prompts only.
- Key functions:
  - `build_prompt(house, state)` — builds edit prompt for repair/ruined states.
  - `main()` — validates base sprites exist and writes variants.
- Example usage:
  - `python3 scripts/generate_house_state_assets.py`
  - `python3 scripts/generate_house_state_assets.py --pony golden-violet`
  - `python3 scripts/generate_house_state_assets.py --states repair`
  - `python3 scripts/generate_house_state_assets.py --dry-run`

## `scripts/generate_ui_icons.py`

- Purpose: generate UI WebP icons for needs (health, thirst, hunger, tired, boredom, repair).
- Uses: `scripts/sprites/images_api.py`.
- CLI:
  - `--icons` comma-separated icon IDs (default all).
  - `--size` output size (default 256).
  - `--force` overwrite.
  - `--dry-run` print prompts only.
- Key functions:
  - `build_prompt(base)` — combines prompt with shared style.
  - `main()` — iterates icons and writes WebP files.
- Example usage:
  - `python3 scripts/generate_ui_icons.py`
  - `python3 scripts/generate_ui_icons.py --icons health,thirst`
  - `python3 scripts/generate_ui_icons.py --size 512 --force`
  - `python3 scripts/generate_ui_icons.py --dry-run`

## `scripts/generate_adventure_assets.py`

- Purpose: generate adventure prototype tiles/icons/sprites via OpenAI ImageGen.
- Uses: `scripts/sprites/images_api.py`.
- Output:
  - Original PNGs: `../pony_generated_assets/adventure_assets/{tiles,icons,sprites}`.
  - WebP outputs: `adventures/{tiles,icons,sprites}`.
  - Forest overlays: `adventures/tiles/forest-canopy.webp`, `adventures/tiles/forest-border.webp`.
  - Tree sprites: `adventures/overlays/forest-tree-*.webp`.
  - Overlay icons: `adventures/overlays/mouse.webp`.
  - Letter backgrounds: `adventures/letters/scroll-letter.webp`, `adventures/letters/torn-letter.webp`.
  - Hero portraits: `adventures/heroes/*-scared.webp`, `adventures/heroes/*-pile.webp`.
  - Icons + hero portraits are auto-trimmed to center opaque content before resizing.
- CLI:
  - `--generated-root` override PNG output root (default `../pony_generated_assets/adventure_assets`).
  - `--target-root` override WebP output root (default `adventures`).
  - `--request-size` API size (default 1024).
  - `--tile-size`, `--icon-size`, `--sprite-size`, `--tree-size`, `--overlay-size`, `--letter-size`, `--hero-size` WebP sizes.
  - `--tiles`, `--icons`, `--sprites`, `--trees`, `--overlays`, `--letters`, `--heroes` to limit which groups are generated.
  - `--tile <name>`, `--icon <name>`, `--sprite <name>`, `--tree <name>`, `--overlay <name>`, `--letter <name>`, `--hero <name>` to generate specific assets (repeatable).
  - `--force` overwrite existing WebPs.
  - `--dry-run` print prompts only.
- Example usage:
  - `.venv/bin/python scripts/generate_adventure_assets.py`
  - `.venv/bin/python scripts/generate_adventure_assets.py --tiles`
  - `.venv/bin/python scripts/generate_adventure_assets.py --icons --force`
  - `.venv/bin/python scripts/generate_adventure_assets.py --trees --force`
  - `.venv/bin/python scripts/generate_adventure_assets.py --overlays --force`
  - `.venv/bin/python scripts/generate_adventure_assets.py --heroes --force`
  - `.venv/bin/python scripts/generate_adventure_assets.py --dry-run`

## `scripts/generate_prompt_variations.py`

- Purpose: generate image variations from a JSON prompt list (mission-specific assets).
- Uses: `scripts/sprites/images_api.py`.
- Output:
  - Original PNGs: `../pony_generated_assets/adventure_assets/sprites/mission2` (default).
  - WebP outputs: `adventures/missions/stellacorn/mission2/adventures/sprites/mission2` (default).
- CLI:
  - `--prompt-json` path to the JSON prompt file.
  - `--source-image` optional reference image for edit-based generation.
  - `--generated-root`, `--target-root` override output folders.
  - `--force` overwrite existing outputs.
  - `--dry-run` print prompts only.
- Example usage:
  - `.venv/bin/python scripts/generate_prompt_variations.py --prompt-json adventures/missions/stellacorn/mission2/prompts/corrupted-oak.json --dry-run`
  - `.venv/bin/python scripts/generate_prompt_variations.py --prompt-json adventures/missions/stellacorn/mission2/prompts/corrupted-oak.json --source-image ../pony_generated_assets/stellacorn/corrupted-oak-source.png`

## `scripts/pony_server.py`

- Purpose: local HTTP server for creating ponies, triggering sprite generation,
  saving map edits, and persisting runtime state.
- Entry point: `scripts/pony_server.py` (wrapper for `scripts/pony_server/app.py`).
- CLI:
  - `--host`, `--port` for server binding.
  - `--data` ponies JSON path.
  - `--output-dir` portrait output directory.
  - `--env-file` for `OPENAI_API_KEY`.
  - `--map` map JSON path.
  - `--state` runtime state JSON path (default: `data/_generated/runtime_state.json`).
- HTTP endpoints:
  - `POST /api/ponies` — create pony (also generates portrait, spawns async sprite/house jobs).
  - `POST /api/ponies/<slug>/sprites` — run `generate_pony_sprites.py`.
  - `POST /api/ponies/<slug>/spritesheet` — run `pack_spritesheet.py`.
  - `POST /api/map/objects/<id>` — persist drag/drop map changes.
  - `GET /api/state` — fetch persisted runtime state.
  - `POST /api/state` — save runtime state payload.
  - `GET /api/health` — health check (returns `{ "ok": true }`).
- Modules:
  - `scripts/pony_server/config.py` — defaults + constants.
  - `scripts/pony_server/utils.py` — `slugify`, `sanitize_value`, `normalize_name`.
  - `scripts/pony_server/io.py` — `load_data`, `save_data`, `load_json_body`.
  - `scripts/pony_server/pony.py` — `build_pony`, `assign_house`, `ensure_house_on_map`, `ensure_output_dir`, `ensure_pony_asset_dirs`.
  - `scripts/pony_server/generators.py` — `run_generator`, `run_sprite_generator`, `run_spritesheet_packer`, `run_interpolator`, `run_house_generator`, `run_house_state_generator`, `run_post_create_tasks`, `launch_async`.
    - Auto sprite pipeline now skips interpolation and packs from `frames/` only.
  - `scripts/pony_server/handler.py` — `PonyHandler` endpoints.
  - `scripts/pony_server/app.py` — `parse_args()` / `main()`.
- Example usage:
  - `python3 scripts/pony_server.py`
  - `python3 scripts/pony_server.py --port 8001`
  - `python3 scripts/pony_server.py --data data/ponies.json --map assets/world/maps/ponyville.json`

## `scripts/sprites/images_api.py`

- Purpose: low-level OpenAI Images API client (generate + edit).
- Environment:
  - `OPENAI_API_KEY` (required).
  - `OPENAI_SPRITE_MODEL` overrides image model (default `gpt-image-1`).
- Key functions:
  - `load_env_value(path, key)` — `.env` parser.
  - `get_api_key()` / `ensure_api_key()` — key retrieval + validation.
  - `is_gpt_image_model(model)` — model gate.
  - `_parse_target_size(size)` — numeric size parsing.
  - `_resolve_request_size(model, size)` — adapts size by model rules.
  - `_resize_image(path, target_size)` — post-resize for `gpt-image-*`.
  - `resize_image(path, target_size)` — public wrapper for resizing.
  - `convert_to_webp(source_path, output_path, ...)` — convert images to WebP.
  - `_request_images(payload, api_key)` — JSON POST to generations endpoint.
  - `_encode_multipart(fields, files)` — builds edit payload body.
  - `_request_edit(fields, files, api_key)` — multipart POST to edits endpoint.
  - `generate_png(prompt, size, out_path)` — generate PNG from prompt.
  - `generate_png_from_image(prompt, size, out_path, image_path)` — edit from source image.
- Example usage:
  - `python3 -c "from scripts.sprites import images_api; images_api.generate_png('pony icon', 512, 'assets/ponies/test.png')"`
  - `python3 -c \"from scripts.sprites import images_api; images_api.generate_png_from_image('add sparkles', 512, 'assets/ponies/test_edit.png', 'assets/ponies/test.png')\"`

## `scripts/sprites/prompting.py`

- Purpose: deterministic prompt builder + frame naming for sprites.
- Key constants:
  - `STYLE_BIBLE` — global prompt constraints (single-frame only).
  - `WALK_TROT_STYLE` — stricter walk/trot styling.
  - `WALK_PHASES` / `TROT_PHASES` — named phase definitions.
  - `PHASES_BY_ACTION` — action -> phases map.
- Key functions:
  - `_format_identity(pony, force_regular=False)` — identity block for a pony (includes accent/markings/accessories when present).
  - `_format_action_cue(pony, action_id, frame_index, frame_count)` — non-walk action cues.
  - `_format_gait_intent(action_id)` — walk/trot intent cue.
  - `_format_phase_exclusions(phase_name, excludes)` — phase exclusion text.
  - `_format_canvas(pony)` — per-frame canvas size text.
  - `get_action_frame_name(action_id, frame_index, frame_count)` — file naming.
  - `get_action_frame_order(action_id)` — ordered phase list (if any).
  - `build_sprite_prompt(pony, action_id, frame_index, frame_count)` — main prompt builder with gait intent for walk/trot.
- Example usage:
  - `python3 -c "from scripts.sprites.prompting import build_sprite_prompt; print(build_sprite_prompt({'name':'Demo','species':'pony'}, 'idle', 0, 1))"`

## `scripts/sprites/interpolation.py`

- Purpose: shared optical-flow + normalization helpers for interpolation.
- Key functions:
  - `interpolate_action(keyframes, inbetweens, flow_cfg)` — yields interpolated frames.
  - `compute_target_bbox(keyframes, threshold)` — median bbox stats for normalization.
  - `normalize_frame_scale(image, target_bbox, threshold, scale_min, scale_max)` — scales frames to consistent size.
  - `stabilize_frame(image, target_y_max, threshold, max_shift)` — aligns foot baseline.

## `scripts/sprites/qc.py`

- Purpose: QC checks and image fixes for generated sprite frames.
- Key functions:
  - `ensure_pillow()` — validates Pillow availability.
  - `_load_image(path)` — opens an image using Pillow.
  - `try_fix_transparency(path, tolerance)` — makes background transparent by sampling corners.
  - `needs_horizontal_flip(path, threshold, balance_threshold)` — heuristic facing check.
  - `enforce_facing_right(path)` — flips image if facing left.
  - `qc_image(path)` — validates alpha, subject area, and padding.
- Example usage:
  - `python3 -c \"from scripts.sprites import qc; print(qc.qc_image('assets/ponies/demo.png'))\"`

## `scripts/__init__.py`

- Purpose: marks `scripts/` as a Python package (empty file).

## `scripts/sprites/__init__.py`

- Purpose: marks `scripts/sprites/` as a Python package (empty file).
