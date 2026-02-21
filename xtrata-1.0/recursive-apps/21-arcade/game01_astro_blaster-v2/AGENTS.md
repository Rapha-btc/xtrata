# AGENTS - Astro Blaster v2 Workspace

This file governs updates inside `recursive-apps/21-arcade/game01_astro_blaster-v2`.

## Core Rules
1. Preserve runtime invariants from the live game contract with the launcher:
   - Global symbol remains `Game01`.
   - `Game01.id === "astro_blaster"`.
   - `Game01.scoreMode === "score"`.
   - Guarded score submit path remains in legacy gameplay body.
2. Treat `games/game01_astro_blaster-v2.js` as generated output only.
3. All feature planning metadata must be sourced from modules in `src/modules` and catalogs in `src/catalogs`.

## Build Workflow
1. Update source modules/catalogs/framework files.
2. Run `npm run arcade:astro-v2:build`.
   - This writes the canonical workspace output and auto-mints the next decimal runtime snapshot (`game01_astro_blaster-vX.Y.js`).
   - It also auto-regenerates `games/latest-manifest.js`.
3. Run `npm run arcade:astro-v2:test`.
4. Validate parser checks:
   - `node --check recursive-apps/21-arcade/games/game01_astro_blaster-v2.js`
   - `node --check recursive-apps/21-arcade/main.js`

## Game-Type Strategy Review (Required)
1. Keep `GAME_STRATEGY.json` updated for archetype fit, scaling priorities, and test focus.
2. Before promoting a version, run strict review:
   - `npm run arcade:strategy:review -- --game game01_astro_blaster --strict`
3. If archetype/core loop changes, update `GAME_STRATEGY.json`, this `AGENTS.md`, and `README.md` before promotion.

## Promotion to games/
1. Ensure build and tests pass in this workspace.
2. Confirm generated output exists at `recursive-apps/21-arcade/games/game01_astro_blaster-v2.js`.
3. Regenerate loader manifest from repo root:
   - `npm run arcade:games:manifest`
4. Validate in launcher that slot 01 resolves to latest version:
   - `games/latest-manifest.js` should list `game01_astro_blaster-v2.js` (or newer).
5. Run a playthrough sanity pass (launch, play, game over, submit prompt, restart, exit).

## Creating New Version Workspaces
Default progression after v2 is minor decimal unless explicitly overridden:
1. Suggested sequence: `v2 -> v2.1 -> v2.2 -> v2.3`.
2. Get suggested next target:
   - `npm run arcade:next-version -- --game game01_astro_blaster`
3. Explicit major jump (only when requested):
   - `npm run arcade:next-version -- --game game01_astro_blaster --version 3`
4. Create a new workspace folder for that chosen version (example: `recursive-apps/21-arcade/game01_astro_blaster-v2.1/`).
5. Copy this workspace structure:
   - `AGENTS.md`, `README.md`, `src/`, `tests/`, `scripts/`.
6. Update build script/output paths to target new output file:
   - `recursive-apps/21-arcade/games/game01_astro_blaster-v2.1.js`
7. Keep runtime invariants unchanged unless explicitly approved.
8. Add tests for any new module/system before promotion.

## Test Suite Maintenance Policy
When adding a new module, function, or catalog:
1. Add/extend unit coverage in `tests/` for the new behavior.
2. Ensure schema tests catch duplicate IDs and missing required fields.
3. Extend build output tests when output shape changes.
4. Keep tests deterministic and dependency-free (Node built-ins only).
5. Never merge module additions without a corresponding test update.

## Planning Workflow (Required for Major Features)
Use `planning/` for idea-to-implementation flow before coding large gameplay changes:
1. Baseline review in `planning/01-game-review-plan.md`.
2. Add ideas to `planning/03-brainstorm-backlog.md`.
3. Score candidates in `planning/04-idea-scorecard-template.md`.
4. Add approved work to `planning/02-progression-and-narrative-roadmap.md`.
5. Define validation in `planning/05-stage-gates-and-test-plan.md`.
6. Only then create/modify runtime modules and tests.

## Recommended Test Additions As Runtime Expands
1. Mode routing tests per leaderboard suffix.
2. Upgrade stacking limit and compatibility tests.
3. Hazard/reward conflict tests.
4. Performance budget checks for catalog growth.
5. Regression tests verifying `shared.highScores.maybeSubmit(...)` remains guarded and single-path.

## Non-Goals (for now)
- Do not rewrite the entire gameplay core in one iteration.
- Do not change launcher wiring away from `Game01` until all games can migrate together.
