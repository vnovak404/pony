# Python Scripts and Modules

This repository uses Python for asset generation, server helpers, and sprite tooling.
Update this file whenever a script changes behavior, CLI flags, or function signatures.

## `scripts/generate_pony_images.py`

- Purpose: generate hero portrait PNGs for ponies/unicorns from `data/ponies.json`.
- Uses: OpenAI Images API via raw `urllib` requests.
- Environment: `OPENAI_API_KEY` (from env or `.env`).
- CLI:
  - `--data` path to `data/ponies.json` (default `data/ponies.json`).
  - `--output-dir` output folder (default `assets/ponies`).
  - `--model`, `--size`, `--quality`, `--count` for API settings.
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
  - `load_env_value(path, key)` — parses `.env` style files.
  - `slugify(name)` — slug helper for filenames.
  - `build_prompt(pony, style, extra_prompt)` — constructs portrait prompt.
  - `request_images(...)` — POSTs to the Images API and returns data payload.
  - `save_images(image_data, output_dir, slug, overwrite)` — writes PNG files.
  - `parse_args()` / `main()` — CLI entrypoint.
- Example usage:
  - `python3 scripts/generate_pony_images.py`
  - `python3 scripts/generate_pony_images.py --only golden-violet`
  - `python3 scripts/generate_pony_images.py --size 1024x1024 --quality auto`
  - `python3 scripts/generate_pony_images.py --dry-run`

## `scripts/generate_pony_sprites.py`

- Purpose: generate per-action sprite frames for each pony.
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
  - `--use-portrait` use existing portrait as the source image.
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

## `scripts/pack_spritesheet.py`

- Purpose: pack sprite frames into action-scoped spritesheet PNGs + JSON metadata.
- Uses: Pillow for image IO, `scripts/sprites/qc.py`, `scripts/sprites/prompting.py`.
- Output: `spritesheet.json` includes `meta.images`/`meta.sheets` plus per-frame `sheet` indices.
- CLI:
  - `--pony` pony slug (optional; all ponies with frames by default).
  - `--columns` spritesheet columns (default 8).
  - `--frame-size` frame size in pixels (default 512).
  - `--frames-subdir` frames subdirectory under each pony (default `frames_dense`).
  - `--fallback-subdir` fallback frames subdirectory for missing actions (default `frames`).
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
  - `pack_action_pages(...)` — splits an action across sheets if needed.
  - `pack_spritesheet(pony_id, frame_size, columns, action_data, auto_flip, frames_subdir, prefer_dense, max_size, fallback_subdir, retime, max_fps)` — writes PNGs + JSON.
  - `main()` — iterates ponies and packs sheets.
- Example usage:
  - `python3 scripts/pack_spritesheet.py --pony golden-violet`
  - `python3 scripts/pack_spritesheet.py --columns 6 --frame-size 512`
  - `python3 scripts/pack_spritesheet.py --pony golden-violet --max-size 8192`
  - `python3 scripts/pack_spritesheet.py --pony golden-violet --fallback-subdir frames --no-prefer-dense`

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

- Purpose: generate building and map decor PNG assets.
- Uses: `scripts/sprites/images_api.py`.
- CLI:
  - `--output-dir` override target folder.
  - `--size` output size (default 512).
  - `--force` overwrite existing assets.
  - `--only` comma-separated IDs.
  - `--decor` generate `DECOR` instead of `STRUCTURES`.
- Key functions:
  - `parse_args()` / `main()` — dispatches assets from `STRUCTURES` or `DECOR`.
- Example usage:
  - `python3 scripts/generate_structure_assets.py`
  - `python3 scripts/generate_structure_assets.py --only inn_01,bakery_01`
  - `python3 scripts/generate_structure_assets.py --decor`

## `scripts/generate_pony_houses.py`

- Purpose: generate per-house sprites based on resident pony traits.
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
- Example usage:
  - `python3 scripts/generate_pony_houses.py`
  - `python3 scripts/generate_pony_houses.py --pony golden-violet`
  - `python3 scripts/generate_pony_houses.py --only house-golden-violet`
  - `python3 scripts/generate_pony_houses.py --dry-run`

## `scripts/generate_house_state_assets.py`

- Purpose: generate repair/ruined variants for house sprites.
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

- Purpose: generate UI icons for needs (health, thirst, hunger, tired, boredom).
- Uses: `scripts/sprites/images_api.py`.
- CLI:
  - `--icons` comma-separated icon IDs (default all).
  - `--size` output size or `"auto"`.
  - `--force` overwrite.
  - `--dry-run` print prompts only.
- Key functions:
  - `build_prompt(base)` — combines prompt with shared style.
  - `main()` — iterates icons and writes PNGs.
- Example usage:
  - `python3 scripts/generate_ui_icons.py`
  - `python3 scripts/generate_ui_icons.py --icons health,thirst`
  - `python3 scripts/generate_ui_icons.py --size 512 --force`
  - `python3 scripts/generate_ui_icons.py --dry-run`

## `scripts/pony_server.py`

- Purpose: local HTTP server for creating ponies, triggering sprite generation,
  saving map edits, and persisting runtime state.
- CLI:
  - `--host`, `--port` for server binding.
  - `--data` ponies JSON path.
  - `--output-dir` portrait output directory.
  - `--env-file` for `OPENAI_API_KEY`.
  - `--map` map JSON path.
  - `--state` runtime state JSON path.
- HTTP endpoints:
  - `POST /api/ponies` — create pony (also generates portrait, spawns async sprite/house jobs).
  - `POST /api/ponies/<slug>/sprites` — run `generate_pony_sprites.py`.
  - `POST /api/ponies/<slug>/spritesheet` — run `pack_spritesheet.py`.
  - `POST /api/map/objects/<id>` — persist drag/drop map changes.
  - `GET /api/state` — fetch persisted runtime state.
  - `POST /api/state` — save runtime state payload.
- Key functions:
  - `slugify(name)` — slug helper.
  - `load_data(path)` / `save_data(path, payload)` — JSON IO helpers.
  - `sanitize_value(value, fallback, max_len)` — input sanitizer.
  - `normalize_name(name)` — name collision normalization.
  - `build_pony(payload)` — constructs a pony record with drives, stats, sprites.
  - `run_generator(args, slug)` — runs `generate_pony_images.py`.
  - `_coerce_actions(actions)` — normalizes action lists for CLI.
  - `_truncate_output(text, limit)` — output limiter for API responses.
  - `run_sprite_generator(slug, payload)` — runs `generate_pony_sprites.py`.
  - `run_interpolator(slug, payload)` — runs `interpolate_pony_sprites.py`.
  - `run_spritesheet_packer(slug, payload)` — runs `pack_spritesheet.py`.
  - `run_house_generator(slug)` — runs `generate_pony_houses.py`.
  - `run_house_state_generator(slug)` — runs `generate_house_state_assets.py`.
  - `ensure_output_dir(path)` / `ensure_pony_asset_dirs(slug)` — directory creation.
  - `assign_house(ponies, pony)` — assigns pony to a house, possibly shared.
  - `ensure_house_on_map(map_path, house, residents)` — updates map JSON with house.
  - `launch_async(target, *args)` — fire-and-forget worker thread.
  - `run_post_create_tasks(slug, generate_house_variants)` — async sprite + interpolation + pack + house jobs.
  - `load_json_body(handler)` — JSON body parser.
  - `PonyHandler` — HTTP handler with `_handle_*` endpoints.
  - `parse_args()` / `main()` — CLI entrypoint.
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
