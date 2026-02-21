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

## Planning Workspace
- Future design/expansion planning lives in:
  - `recursive-apps/21-arcade/game01_astro_blaster-v2/planning/`
- Use it as the standard path:
  1. Review baseline gameplay and telemetry assumptions.
  2. Brainstorm ideas.
  3. Score ideas and pick approved candidates.
  4. Convert approved candidates into staged implementation specs.

## Implemented Updates (Current Baseline)
- Progression pacing runtime with threat-based cadence guardrails and starvation protection.
- Narrative runtime with sector briefings + transmissions rendered in intel feed (non-blocking).
- Threat briefing runtime for pre-wave composition visibility.
- Reputation runtime with deterministic profile transitions and branching comms.
- Shield baseline (`Aegis Shell`) integrated into drop/pickup/combat lifecycle.
- Special weapon baseline (`EMP Pulse`) with full-charge gate and cooldown enforcement.
- Hazard depth runtime (`v2.33`) for red-herring crates:
  - weapon jam, movement drag, radial shard burst, and ambush reinforcement scheduling.
- Branch-lock archetype runtime (`v2.34`):
  - `Sentinel`, `Skirmisher`, `Striker` run paths with pickup-driven lock and drop-bias identity.
- Combat intel panel with live status board and animated preview tiles.

## Promotion Checklist
1. Build and tests pass.
2. Output file exists and syntax check passes.
3. Manifest regenerated.
4. Launcher resolves slot 01 to latest version.
5. Manual sanity pass completed (launch, play, submit prompt, restart, exit).
