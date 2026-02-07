# Viewer Page Loading Optimization Pack

Purpose: implementation-ready plan to improve viewer UX by preloading full content for current/recent pages while keeping read-only traffic, memory, and IndexedDB usage bounded.

This pack is designed so a new assistant can implement without rediscovery.

## Documents

1. `01-current-state-and-risks.md`
Current loading behavior and bottlenecks.

2. `02-target-architecture.md`
Target design for budgeted preloading, caching, and cancellation.

3. `03-implementation-plan.md`
Concrete phased implementation with file-level touchpoints.

4. `04-cache-budget-and-eviction-spec.md`
Storage and eviction rules (IDB + query-memory behavior).

5. `05-test-and-validation-plan.md`
Unit/integration/manual validation plan and success criteria.

6. `06-rollout-checklist.md`
Execution checklist and safe rollout strategy.

7. `07-context-map.md`
Code navigation index of relevant files and call sites.

## Quick Start

1. Read `docs/app-reference.md`.
2. Read `01-current-state-and-risks.md`.
3. Follow `03-implementation-plan.md` in order.
4. Validate against `05-test-and-validation-plan.md`.
