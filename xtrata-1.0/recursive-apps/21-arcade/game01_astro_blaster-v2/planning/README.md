# Astro Blaster Future Development Planning

This folder is the working space for brainstorming, review, and staged design decisions before implementation.

## Workflow
1. Run baseline review: `01-game-review-plan.md`
2. Capture raw ideas: `03-brainstorm-backlog.md`
3. Score and prioritize ideas: `04-idea-scorecard-template.md`
4. Promote approved items into staged roadmap: `02-progression-and-narrative-roadmap.md`
5. Define quality gates and tests: `05-stage-gates-and-test-plan.md`
6. Publish baseline findings: `06-baseline-review-report-2026-02-20.md`
7. Execute stage plan: `07-stage1-delivery-plan.md`
8. Track scored decisions: `08-initial-scorecards.md`
9. Add and group new concepts: `09-enhancement-idea-bank-2026-02-20.md`
10. Implement in modules/tests only after roadmap approval.

## Planning Goals
- Make gameplay more meaningful and high-retention.
- Stretch session pacing so power spikes arrive later and feel earned.
- Expand upgrade depth (tiers, variants, trade-offs, downsides).
- Add durable systems (shields, special weapons, mode variety) with clear balance rules.
- Keep score integrity and runtime stability intact.

## Implemented Baseline (through v2.32)
- Stage 1 WP1: threat-based progression cadence runtime.
- Stage 1 WP2: non-blocking narrative runtime (sector/transmission overlays).
- Stage 1 WP3: shield baseline (`Aegis Shell`) with deterministic interception lifecycle.
- Stage 1 WP4: special baseline (`EMP Pulse`) with charge/cooldown constraints.
- Supporting UX/runtime: threat briefing overlay, reputation runtime, combat intel panel, score-flow test coverage.
- Stage 2 entry update: hazard-depth runtime for red-herring crates (jam, drag slow, shard burst, ambush scheduling) with intel/feed visibility.
- Stage 2 entry update: branch-lock archetype runtime (`Sentinel`, `Skirmisher`, `Striker`) with pickup-driven lock and drop-bias progression.
