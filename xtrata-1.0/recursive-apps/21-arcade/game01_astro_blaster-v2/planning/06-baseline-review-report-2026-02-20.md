# Stage 0 Baseline Review Report (2026-02-20)

## Scope
Baseline assessment of Astro Blaster v2 before major progression and narrative expansion.

## Post-Baseline Implementation Note
- Since this baseline snapshot, Stage 1 WP1-WP4 have been implemented (pacing runtime, narrative runtime, shield baseline, EMP special baseline) plus threat briefing + reputation runtime.

## Current State Summary
1. Core loop is solid and readable:
- Strong shoot-dodge loop.
- Clear enemy archetypes and wave scaling.
- Good immediate responsiveness.

2. Progression currently favors short power spikes:
- `spread`/`life` pickup loop is active and fast.
- Temporary power duration is fixed and resets to baseline after timer expiry.

3. Narrative depth is still light:
- Sector labels/themes exist.
- No real in-run storyline events or character beats yet.

4. Expanded systems mostly exist as data, not full gameplay:
- Upgrade catalog has shields/clones/advanced effects.
- Reward/hazard catalogs include richer entries.
- Runtime currently applies only a subset of those effects.

## Evidence Snapshot (Code-Backed)
### Progression pacing
- Max power level: 3.
- Spread duration: 720 frames.
- Spread drop chance in fallback logic: 0.78.
- Profile drop chance clamps between `0.025` and `0.22`.
- Source:
  - `src/modules/powerups-runtime.module.mjs`
  - `src/modules/wave-progression-runtime.module.mjs`

### Between-wave pacing
- Wave pause/`Ready` flow exists and improves control over tempo.
- Source:
  - `src/legacy/game01_astro_blaster.legacy.js`

### Mode scaffolding
- Campaign/Overdrive/Hardcore/Mutator mode metadata exists.
- Runtime mode-specific behavior is not yet deeply differentiated.
- Source:
  - `src/catalogs/game-modes.mjs`
  - `src/modules/modes.module.mjs`

### Upgrade/reward/hazard depth
- Catalog includes shields, clones, advanced offense/utility.
- Runtime pickup resolution currently maps mostly to:
  - life pickup
  - spread pickup
  - hazard weapon jam
- Many catalog effects are not yet fully wired into active combat.
- Source:
  - `src/catalogs/upgrades.mjs`
  - `src/catalogs/rewards.mjs`
  - `src/catalogs/hazards.mjs`
  - `src/modules/rewards-hazards-runtime.module.mjs`

## Top Friction Points
1. Upgrade pacing is still too frequent early for long-form progression.
2. Major upgrade systems (shield families, clone logic, special weapons) are under-realized in runtime.
3. Narrative beats are minimal, reducing emotional carry between waves.
4. Mode differentiation is mostly catalog-level, not behavior-level.
5. Negative box system exists but effect variety is not fully active.

## Current Strengths To Preserve
1. Tight movement/shooting feel.
2. High readability of enemy bullets and telegraphs.
3. Sector-theme wave composition framework.
4. Existing inter-wave `Ready` pause control.
5. On-chain score verification flow integration pattern.

## Priority Recommendations
### P0 (start now)
1. Introduce progression pacing controls:
- Lower early spread frequency.
- Move power spikes later.
- Add deterministic offer cadence rules.

2. Add narrative spine hooks:
- Sector briefings/transmissions between wave sets.
- Short contextual enemy-faction story events.

### P1 (next)
1. Implement first shield line with clear limits.
2. Implement one special weapon resource loop.
3. Wire at least 3 catalog effects currently not applied.

### P2
1. Mode-specific runtime modifiers.
2. Expanded hazard outcomes and trade-off crates.

## Baseline Metrics Needed Next (Instrumentation Pass)
1. Time to first major upgrade.
2. Average run length by skill bucket.
3. Pickup frequency per minute.
4. Death cause breakdown by enemy archetype.
5. Upgrade selection distribution once upgrade-choice system lands.
