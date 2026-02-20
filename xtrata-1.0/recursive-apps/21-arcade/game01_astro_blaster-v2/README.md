# Astro Blaster v2 Workspace

This workspace is the enhancement lane for `game01_astro_blaster`.

## Purpose
- Build and test gameplay upgrades without editing runtime outputs directly.
- Promote only validated builds into `recursive-apps/21-arcade/games/`.

## Commands
- Build: `npm run arcade:astro-v2:build`
  - Auto-mints the next decimal runtime version in `games/` (`v2.1`, `v2.2`, `v2.3`, ...)
  - Auto-regenerates `games/latest-manifest.js`
- Test: `npm run arcade:astro-v2:test`
- Refresh latest-version manifest: `npm run arcade:games:manifest`
- Suggest next version (default decimal after v2): `npm run arcade:next-version -- --game game01_astro_blaster`
- Explicit major override: `npm run arcade:next-version -- --game game01_astro_blaster --version 3`

## Strategy Review Gate
- Maintain `GAME_STRATEGY.json` for game-type specific scaling, iteration lanes, and QA focus.
- Strict gate before production promotion:
  - `npm run arcade:strategy:review -- --game game01_astro_blaster --strict`
- If game archetype/core loop changes, update strategy + AGENTS/README before coding new systems.

## Output Target
- `recursive-apps/21-arcade/games/game01_astro_blaster-v2.js`

## Promotion Checklist
1. Build and tests pass.
2. Output file exists and syntax check passes.
3. Manifest regenerated.
4. Launcher resolves slot 01 to latest version.
5. Manual sanity pass completed (launch, play, submit prompt, restart, exit).
