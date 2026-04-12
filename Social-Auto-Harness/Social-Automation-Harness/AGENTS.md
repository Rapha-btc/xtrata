# Repository Guidelines

## Project Structure & Module Organization
This repo has two active Node.js systems. The API pipeline lives in `src/`: CLI stage runners are in `src/cli/`, shared logic is in `src/lib/`, config JSON lives in `config/`, and prompt templates are in `prompts/`. The browser-session harness lives in `modular-harness/src/` with domain folders such as `browser/`, `session/`, `x/`, `analysis/`, and `audit/`. Root pipeline tests live in `test/`; harness tests live in `modular-harness/test/`. Generated artifacts belong in `output/runs/`, while local SQLite and ledger state stay under `state/` and `modular-harness/state/`.

## Build, Test, and Development Commands
Use Node 22.5+.

- `npm test`: run the full `node --test` suite for both systems.
- `npm start` or `npm run`: execute the end-to-end API pipeline.
- `npm run dry-run`: exercise the API pipeline without writing run artifacts or DB state.
- `npm run collect|prefilter|score|draft|execute`: run individual API stages.
- `npm run harness:x-session -- --persona=xtrata`: verify the X browser session.
- `npm run harness:governance` or `npm run harness:analyze-candidates -- ...`: run targeted harness modules; use `README.md` and `modular-harness/README.md` for full flows.

## Coding Style & Naming Conventions
The codebase uses ESM `.js` files, 2-space indentation, semicolons, and double quotes. Keep modules small and single-purpose. Follow the existing naming pattern: kebab-case for CLI entrypoints such as `run-score.js`, descriptive module names for library files such as `sharedRulesEngine.js`, and `camelCase` for functions. Preserve the current JSON formatting style: pretty-printed with trailing newlines.

## Testing Guidelines
Tests use the built-in `node:test` runner with `assert/strict`. Name tests `*.test.js` and place them beside the subsystem they cover. Reuse fixtures from `test/fixtures/` when possible. Any behavior change should include a regression test; harness changes should also cover safety, dedupe, or audit-path behavior when applicable.

## Commit & Pull Request Guidelines
Recent commits use short, lower-case subjects such as `social auto` and `added multiagent`. Keep commit titles concise and imperative. PRs should state which subsystem changed (`src/` or `modular-harness/`), list the commands you ran, and include artifact paths or terminal evidence for behavior changes. If you touch harness execution or browser flows, review `modular-harness/PROJECT_CONTEXT.md` and `modular-harness/SAFETY_CONTROLS.md` first, and summarize any policy impact in the PR.
