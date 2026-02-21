# Stage 1 Delivery Plan - Narrative + Pacing Foundations

## Objective
Deliver the first meaningful leap in engagement by improving progression pacing and introducing lightweight narrative beats without destabilizing core combat.

## Status Snapshot (2026-02-20)
- WP1 (progression cadence runtime): completed
- WP2 (narrative runtime hooks): completed
- WP3 (shield prototype): selected as next-best update and implemented as `Aegis Shell` baseline
- WP4 (special weapon prototype): implemented as `EMP Pulse` with full-charge resource gate + cooldown + cleanup checks
- Stage 1 gate status: complete (runtime + tests integrated)
- Latest validated build snapshot for this milestone: `game01_astro_blaster-v2.32.js`

## Next Focus (Stage 2 Entry)
- Hazard depth + clarity update delivered in `v2.33`:
  - Runtime now applies jam, drag-slow, shard burst, and ambush reinforcement scheduling from hazard effects.
  - Mission feed/intel now surface hazard state more clearly.
- Branch-lock archetype update delivered in `v2.34`:
  - Runtime archetype lock model (`Sentinel`, `Skirmisher`, `Striker`) now tracks pickup behavior.
  - Locked archetype biases future reward drops to create stronger run identity.
- Directional shield update delivered in `v2.36`:
  - Aegis shield interception now uses front-arc gating instead of omnidirectional blocking.
  - Arc facing updates from movement input to add tactical positioning value.
- Remaining Stage 2 entry priority:
  - Mode runtime differentiation and retention loops.

## Implementation Order
1. **Pacing controls (first)**
- Add configurable upgrade cadence gates (time/wave/threat based).
- Reduce early upgrade frequency.
- Add deterministic guardrails to avoid reward starvation.

2. **Narrative hooks (second)**
- Add sector intro cards with short story copy.
- Add inter-wave transmission events tied to sector milestones.
- Ensure narrative overlays never block control during active combat.

3. **Early depth unlock (third)**
- Wire one shield mechanic (Aegis Shell baseline behavior).
- Add one special weapon prototype (single cooldown model).
- Ensure both are visible and understandable in UI/intel displays.

## Technical Work Packages
### WP1 - Progression Cadence Runtime
- Target modules:
  - `src/modules/powerups-runtime.module.mjs`
  - `src/modules/rewards-hazards-runtime.module.mjs`
- Add:
  - cadence config (min-wave/min-seconds between major pickups)
  - quality ramp curve by level/sector
  - anti-streak safety (guaranteed reward window)

### WP2 - Narrative Runtime Hooks
- New module proposal:
  - `src/modules/narrative-runtime.module.mjs`
- Add:
  - sector story snippets
  - trigger rules
  - non-blocking overlay lifecycle

### WP3 - Shield Prototype (Tier 1)
- Use catalog entry:
  - `shield_aegis_shell`
- Add:
  - shield charge state
  - hit consumption behavior
  - recharge/expiry presentation

### WP4 - Special Weapon Prototype
- Add one special with clear resource cost and cooldown.
- Ensure no invulnerability or infinite-fire loops.

## Tests Required
1. Cadence rules tests:
- no early flood
- no starvation beyond max window

2. Narrative trigger tests:
- events trigger exactly once per milestone
- events do not block gameplay loop

3. Shield tests:
- hit consumption order
- shield expiry/recovery behavior

4. Special weapon tests:
- cooldown/resource enforcement
- effect cleanup on death/restart

## Acceptance Criteria
1. Average early-run power escalation is slower and clearer.
2. Players receive narrative context at sector transitions.
3. One shield + one special are stable and understandable.
4. Existing run/restart/high-score flow remains intact.

## Commands (Gate)
1. `npm run arcade:astro-v2:test`
2. `node --check recursive-apps/21-arcade/games/game01_astro_blaster-v2.js`
3. `node --check recursive-apps/21-arcade/main.js`
