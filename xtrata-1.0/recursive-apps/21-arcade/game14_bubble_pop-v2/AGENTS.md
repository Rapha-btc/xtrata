# AGENTS - game14_bubble_pop-v2 Workspace

This file governs updates inside `recursive-apps/21-arcade/game14_bubble_pop-v2/`.

## Core Rules
1. Preserve launcher contract invariants:
   - Global symbol remains `Game14`.
   - `id` remains `bubble_pop`.
   - `scoreMode` must stay aligned with live slot behavior unless explicitly changed.
2. Treat `recursive-apps/21-arcade/games/game14_bubble_pop-v2.js` as generated output only.
3. Make source changes in `src/`; keep `tests/` deterministic and dependency-light.

## Workspace Structure
- `src/`: modular source (systems, state, entities, rendering, balancing data).
- `tests/`: deterministic tests for game logic and regressions.
- `scripts/`: build/test tooling for workspace output.
- `README.md`: implementation notes and promotion flow.

## Game-Type Strategy Review (Required)
1. Keep `GAME_STRATEGY.json` updated for this workspace archetype, scaling priorities, and test focus.
2. Before promoting a version, run strict review:
   - `npm run arcade:strategy:review -- --game game14_bubble_pop --strict`
3. If game archetype or core loop changes, update `GAME_STRATEGY.json`, this `AGENTS.md`, and `README.md` before promotion.

## Build and Test Workflow
1. Implement or update modules in `src/`.
2. Run this workspace build command (add in root `package.json` if missing):
   - `npm run arcade:bubble_pop:v2:build`
3. Run this workspace test command (add in root `package.json` if missing):
   - `npm run arcade:bubble_pop:v2:test`
4. Validate generated JS:
   - `node --check recursive-apps/21-arcade/games/game14_bubble_pop-v2.js`

## Promotion to Runtime `games/`
1. Confirm workspace build and tests pass.
2. Ensure output exists at `recursive-apps/21-arcade/games/game14_bubble_pop-v2.js`.
3. Regenerate manifest:
   - `npm run arcade:games:manifest`
4. Launch arcade and verify slot `14` resolves to latest file.
5. Run quick sanity pass:
   - launch -> play -> game over -> score submit prompt -> restart -> exit.

## New Version Iteration (Default v2.x)
1. Keep minor decimal progression by default: `v2 -> v2.1 -> v2.2 -> v2.3`.
2. Get suggested next target:
   - `npm run arcade:next-version -- --game game14_bubble_pop`
3. Explicit major jump only when requested:
   - `npm run arcade:next-version -- --game game14_bubble_pop --version 3`
4. Copy this workspace to the chosen version folder and update runtime output path to match.
5. Add tests for every new module/mechanic before promotion.
6. Keep global symbol, game id, and launcher API shape backward-compatible.

## Test Suite Maintenance Rules
1. Every new module/function must include matching tests.
2. Keep tests deterministic (seed randomness, fixed clocks, controlled inputs).
3. Add regression tests for score calculation, round flow, pause/resume, and cleanup.
4. If UI hooks change, add a smoke test for launcher lifecycle compatibility.
5. Do not promote new versions without updated tests.
