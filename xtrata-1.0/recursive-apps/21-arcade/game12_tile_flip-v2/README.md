# game12_tile_flip-v2 Workspace

This workspace is the enhancement lane for `game12_tile_flip`.

## Purpose
- Build and test new gameplay iterations without editing runtime outputs directly.
- Promote only validated outputs into `recursive-apps/21-arcade/games/`.

## Standard Flow
1. Edit code in `src/`.
2. Run workspace build/test scripts.
3. Generate `games/game12_tile_flip-v2.js`.
4. Regenerate `games/latest-manifest.js` with `npm run arcade:games:manifest`.
5. Verify behavior in arcade launcher.

## Strategy Review Gate
- Maintain `GAME_STRATEGY.json` for game-type specific scaling, iteration lanes, and QA focus.
- Strict gate before production promotion:
  - `npm run arcade:strategy:review -- --game game12_tile_flip --strict`
- If game archetype/core loop changes, update strategy + AGENTS/README before coding new systems.

## Runtime Invariants
- Keep symbol `Game12` and id `tile_flip` stable.
- Keep launcher API shape (`init`, `destroy`, `getTestHooks`) stable.
- Keep score submission path routed through shared high-score utilities.
