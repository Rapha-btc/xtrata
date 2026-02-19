# Astro Blaster Evolution Playbook

This document is mandatory reading before any update to `game01_astro_blaster.js`.

## 1) Product Intent
- Astro Blaster is the long-life score chase game in this arcade.
- It must support 100+ meaningful levels plus post-campaign endless overdrive.
- Scoring should reward skill depth over time so leaderboard progression can continue for years.

## 2) Hard Invariants (Do Not Break)
- Keep metadata stable:
  - `id = "astro_blaster"`
  - `scoreMode = "score"`
- End-game score submission must go through exactly one guarded call:
  - `shared.highScores.maybeSubmit({ gameId: id, score, mode: 'score', title })`
- Respect the production test rule:
  - using **Next Wave** test control must disable score submissions for this browser session/profile.
- Keep `getTestHooks()` API shape:
  - `getState`, `completeLevel`, `forceWin`, `setDeterministicSeed`
- Keep keyboard controls stable unless explicitly changing UX:
  - Arrows move, Space shoots, R restarts.

## 3) Architecture Overview
- Wave generation is data-driven and scales by level profile (`budget`, `speedScale`, `fireScale`, `hpScale`).
- Enemy roster is declared in `ENEMY_TYPES` with unlock levels and costs.
- Formations are procedural (`line`, `stagger`, `columns`, `vee`, `swarm`, `ring`).
- Campaign runs through `MAX_CAMPAIGN_LEVEL`; then overdrive scaling continues indefinitely.

## 4) Difficulty Tuning Rules
- Add challenge through composition before raw stat spikes:
  - Mix enemy archetypes and formations first.
  - Increase shot pattern complexity second.
  - Increase HP/speed last.
- Preserve readable fairness:
  - Avoid unavoidable bullet walls.
  - Keep telegraphed motion on high-damage enemies.
- Powerups should offset difficulty but remain scarce enough for leaderboard integrity.

## 5) Visual Quality Rules
- Keep missiles visually distinct from enemy bullets.
- Every meaningful hit should produce feedback:
  - particle trail,
  - impact flash/ring,
  - audio cue.
- Avoid noise overload:
  - cap particle and explosion arrays.

## 6) Scoring Longevity Rules
- Score model should continue to separate skilled runs over long horizons.
- Prefer additive depth (combo, risk/reward) over random jackpot mechanics.
- Never introduce deterministic exploit loops that can inflate scores trivially.

## 7) Update Checklist (Run Every Change)
1. Read this playbook first.
2. Keep invariants in Section 2 intact.
3. Validate deterministic behavior via `setDeterministicSeed` when balancing waves.
4. Run syntax checks:
   - `node --check recursive-apps/21-arcade/games/game01_astro_blaster.js`
   - `node --check recursive-apps/21-arcade/main.js`
   - `node --check recursive-apps/21-arcade/lib/highscores.js`
5. Manual sanity pass:
   - launch game,
   - clear at least 3 levels,
   - verify restart and exit,
   - verify one score submission prompt at game over.

## 8) When Expanding Further
- New enemy types must include:
  - unlock level,
  - budget cost,
  - readable motion and fire pattern,
  - score value rationale.
- If level count logic changes, document campaign vs overdrive transition behavior in this file.
