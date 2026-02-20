# game04_maze_escape-v2 Workspace

This workspace is the enhancement lane for `game04_maze_escape`.

## Purpose
- Build and test new gameplay iterations without editing runtime outputs directly.
- Promote only validated outputs into `recursive-apps/21-arcade/games/`.

## Standard Flow
1. Edit code in `src/`.
2. Run workspace build/test scripts.
3. Generate `games/game04_maze_escape-v2.js`.
4. Regenerate `games/latest-manifest.js` with `npm run arcade:games:manifest`.
5. Verify behavior in arcade launcher.

## Strategy Review Gate
- Maintain `GAME_STRATEGY.json` for game-type specific scaling, iteration lanes, and QA focus.
- Strict gate before production promotion:
  - `npm run arcade:strategy:review -- --game game04_maze_escape --strict`
- If game archetype/core loop changes, update strategy + AGENTS/README before coding new systems.

## Runtime Invariants
- Keep symbol `Game04` and id `maze_escape` stable.
- Keep launcher API shape (`init`, `destroy`, `getTestHooks`) stable.
- Keep score submission path routed through shared high-score utilities.
