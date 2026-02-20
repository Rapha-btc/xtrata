# game10_cipher_quest-v2 Workspace

This workspace is the enhancement lane for `game10_cipher_quest`.

## Purpose
- Build and test new gameplay iterations without editing runtime outputs directly.
- Promote only validated outputs into `recursive-apps/21-arcade/games/`.

## Standard Flow
1. Edit code in `src/`.
2. Run workspace build/test scripts.
3. Generate `games/game10_cipher_quest-v2.js`.
4. Regenerate `games/latest-manifest.js` with `npm run arcade:games:manifest`.
5. Verify behavior in arcade launcher.

## Strategy Review Gate
- Maintain `GAME_STRATEGY.json` for game-type specific scaling, iteration lanes, and QA focus.
- Strict gate before production promotion:
  - `npm run arcade:strategy:review -- --game game10_cipher_quest --strict`
- If game archetype/core loop changes, update strategy + AGENTS/README before coding new systems.

## Runtime Invariants
- Keep symbol `Game10` and id `cipher_quest` stable.
- Keep launcher API shape (`init`, `destroy`, `getTestHooks`) stable.
- Keep score submission path routed through shared high-score utilities.
