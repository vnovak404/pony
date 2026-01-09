# Repository Guidelines

## Project Structure & Module Organization
This repository is currently empty aside from Git metadata. As code is added, keep a simple, predictable layout:

- `src/` for application or library source code.
- `tests/` (or `__tests__/`) for automated tests.
- `scripts/` for developer tooling and automation.
- `assets/` for static files (images, fixtures, sample data).

If you introduce a different structure (e.g., `packages/` for a monorepo), document it in this file.

## Build, Test, and Development Commands
No build or dev commands exist yet. Current tests:

- `npm test` — run the Node.js test runner over `tests/`.

When you add tooling, document it here with examples, e.g.:

- `npm run dev` — run the local development server.
- `npm test` — execute the test suite.
- `make build` — compile production artifacts.

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

## Commit & Pull Request Guidelines
There is no commit history yet, so no conventions are established. Until specified:

- Use short, imperative commit subjects (e.g., `Add parser for config files`).
- Include a brief description of intent when needed.
- In PRs, include a concise summary, testing notes, and relevant screenshots/logs.

## Configuration & Secrets
Do not commit secrets. Store local configuration in `.env` files and add them to `.gitignore`.

## Agent Instructions
- Avoid creating files over 500 lines. If a file approaches 500 lines, split the logic into smaller modules instead of extending the file.
- Before editing frontend JavaScript, read `docs/js-modules.md` and keep it updated with module/function changes.
- Before editing Python scripts, read `docs/python-scripts.md` and keep it updated with module/function changes.
