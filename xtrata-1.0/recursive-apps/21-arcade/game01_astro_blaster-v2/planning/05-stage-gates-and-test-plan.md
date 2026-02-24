# Stage Gates and Test Plan

This file defines what must be true before each roadmap stage is considered complete.

## Cross-Stage Mandatory Checks
1. `npm run arcade:astro-v2:test`
2. `node --check recursive-apps/21-arcade/games/game01_astro_blaster-v2.js`
3. `node --check recursive-apps/21-arcade/main.js`
4. Score submit path still guarded and functional for end-game flow.
5. No regression in restart loop stability.

## Stage 1 Gates (Narrative + Pacing)
- Story beats do not block input/control responsiveness.
- Upgrade timing curve uses new cadence without starvation.
- Tests added for pacing thresholds and narrative trigger guards.

## Stage 2 Gates (Upgrade Expansion)
- New upgrade tiers validated for stacking limits.
- Negative boxes/debuffs have clear telegraphs.
- Tests added for:
  - Offer frequency rules
  - Upgrade branch compatibility
  - Debuff duration and cleanup

## Stage 3 Gates (Shields + Specials)
- Shield systems cannot create permanent invulnerability loops.
- Special weapons enforce cooldown/energy limits.
- Tests added for:
  - Shield break/recovery
  - Special charge spending
  - Interaction with enemy burst patterns

## Stage 4 Gates (Modes)
- Mode rules are explicit and isolated.
- Leaderboard mode mapping remains deterministic.
- Tests added for:
  - Mode-specific spawn/score configuration
  - Transition safety between modes

## Stage 5 Gates (Balance + Retention)
- Difficulty curve shows reduced frustration spikes in playtest review.
- Performance budgets respected during peak encounters.
- Regression suite passes across repeated run/restart cycles.

