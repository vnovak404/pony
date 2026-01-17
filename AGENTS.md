# Repository Guidelines

## Project Structure & Module Organization
This repository contains a browser-based simulation game with
JavaScript frontend modules, Python-based asset generation tooling,
and a lightweight local HTTP server.

High-level layout:

- `index.html`, `styles.css` — static entrypoint and styles
- `assets/js/` — ES module frontend (map sim, UI, actors)
- `data/` — game data and runtime state (`data/_generated/`)
- `scripts/` — Python asset generation + local server
- `docs/` — authoritative developer documentation
- `tests/` — Node.js tests for map logic and simulation rules
- `assets/world/`, `assets/ponies/`, `assets/ui/` — generated assets

## Build, Test, and Development Commands
Frontend:
- Open `index.html` directly in a browser for static viewing.

Local server (recommended):
- `python3 scripts/pony_server.py`
  Runs a local HTTP server for pony creation, asset generation,
  map edits, and runtime state persistence.

Tests:
- `npm test`
  Runs Node.js tests under `tests/` using `node:test`.

Asset generation:
- See `docs/python-scripts.md` for detailed CLI usage.

## Coding Style & Naming Conventions
No style rules are defined yet. Until tooling is added:

- Prefer 2-space indentation for JavaScript/TypeScript, 4 spaces for Python.
- Use `kebab-case` for filenames and `camelCase` for variables/functions.
- Use `PascalCase` for types/classes.

If you add formatters/linters (e.g., `prettier`, `ruff`, `golangci-lint`), list them and the exact commands.

## Testing Guidelines
Tests use Node.js built-in `node:test`. When adding tests:

- Keep test files next to code (e.g., `src/foo.test.ts`) or under `tests/`.
- Use descriptive test names (e.g., `should_parse_valid_input`).
- Document the test runner and how to run targeted tests.
- Tests focus on simulation logic (pathfinding, repair timing, house state transitions) and avoid DOM or canvas rendering.

## Commit & Pull Request Guidelines
There is no commit history yet, so no conventions are established. Until specified:

- Use short, imperative commit subjects (e.g., `Add parser for config files`).
- Include a brief description of intent when needed.
- In PRs, include a concise summary, testing notes, and relevant screenshots/logs.

## Configuration & Secrets
Do not commit secrets. Store local configuration in `.env` files and add them to `.gitignore`.

## Agent Instructions
- Prefer small, single-purpose modules. Frontend logic is intentionally split across many files under `assets/js/`. Keep files under 500-600 lines and split them up if they get bigger than that.
- Before editing frontend JavaScript, read `docs/js-modules.md` and keep it updated with module/function changes.
- Before editing Python scripts, read `docs/python-scripts.md` and keep it updated with module/function changes.
- When running Python scripts from the repo, use the local virtual environment interpreter (e.g. `.venv/bin/python`) to ensure required libraries are available.
- For new visuals, you may generate images/textures via the OpenAI image API. Convert any asset to `.webp` for use in-repo, and move the original source file outside the repo into `../pony_generated_assets`. Avoid SVG creation except for basic filler (e.g., simple grass).
- When providing the after-action-report, first provide it normally, then on a new line preface with ">>> For a 7 year old >>>" and provide a concise version summarized for a girl with the intellectual level of a 9-10 year old.
