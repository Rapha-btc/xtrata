# Refactor Plans Portfolio Summary

Purpose: single summary of all current plans in `Refactor-Plans`, including technical requirements, relative safety/simplicity, and relative implementation reward.

Date: 2026-02-08

## Included Plan Sets

1. `Refactor-Plans/README.md` (core staged refactor program)
2. `Refactor-Plans/MODULE_CHECKLISTS.md` (extraction boundaries by file/module)
3. `Refactor-Plans/design-refactor/design-refactor-prompt` (public redesign program)
4. `Refactor-Plans/parent-child-implementation/README.md` (+ full folder)
5. `Refactor-Plans/viewer-page-loading-optimization/README.md` (+ full folder)
6. `Refactor-Plans/market-module-wallet-controls/README.md` (+ full folder)
7. `Refactor-Plans/Optimisation-Notes` (expanded operational improvements)

## Scoring Method

Scale: `1` (low) to `5` (high)

1. Safety: likelihood of shipping without regression risk.
2. Simplicity: implementation straightforwardness.
3. Reward: user value + product leverage + maintainability impact.

## Plan-by-Plan Technical Summary

## 1) Core Staged Refactor Program (`README.md` + `MODULE_CHECKLISTS.md`)

Primary objective:

1. Incremental decomposition of large screens/components into hooks/subcomponents while preserving behavior.

Technical requirements:

1. Maintain mint invariant flow (`init -> batch/chunk -> seal`) and fee defaults.
2. Keep 4x4 square grid and square preview constraints unchanged.
3. Keep cache/query key behavior stable.
4. Extract helpers and hooks across:
   - `MintScreen`,
   - `ViewerScreen`,
   - `TokenContentPreview`,
   - `TokenCardMedia`,
   - `MarketScreen`,
   - `App` shell/state wiring,
   - viewer/market/cache libs.
5. Add/confirm test coverage for parsing/cache/query-key invariants before deeper extraction.

Complexity drivers:

1. Very broad surface area across multiple large files.
2. Refactor-order sensitivity (stateful UI modules and shared libs).

Score:

1. Safety: `4` when executed phase-by-phase.
2. Simplicity: `3` (many files, but mostly non-behavioral extraction).
3. Reward: `4` (major maintainability payoff).

## 2) Parent-Child Implementation (`parent-child-implementation`)

Primary objective:

1. Full multi-parent recursive mint and parent/child relationship UX in mint + viewer.

Technical requirements:

1. Introduce canonical dependency domain layer (`src/lib/mint/dependencies.ts`).
2. Extend mint attempt persistence for dependency resume safety.
3. Update `MintScreen` to support multi-parent designation and `seal-recursive` path.
4. Add viewer-to-mint parent handoff (`App` + `ViewerScreen` + `MintScreen` wiring).
5. Add relationship module (`src/lib/viewer/relationships.ts`) for parents and child discovery.
6. Keep child discovery scan user-triggered, cancellable, and bounded.
7. Preserve non-recursive `CollectionMintScreen` behavior in initial scope.
8. Add app unit tests + clarinet tests for dependency semantics and recursive behavior.

Complexity drivers:

1. Cross-module state flow between viewer and mint.
2. Resume-path persistence changes.
3. New relationship discovery logic with bounded scanning.

Score:

1. Safety: `3` (safe if phased, but touches critical mint flow).
2. Simplicity: `2` (multi-surface feature addition).
3. Reward: `5` (major protocol capability surfaced in UX).

## 3) Viewer Page Loading Optimization (`viewer-page-loading-optimization`)

Primary objective:

1. Improve viewer UX by preloading full content for current/recent pages with strict read/load/storage guardrails.

Technical requirements:

1. Add preload configuration and mode controls.
2. Add IDB full-content budget tracking + eviction (LRU metadata/index).
3. Add deterministic preloader queue with:
   - bounded concurrency,
   - cancellation,
   - byte budgets.
4. Integrate queue into `ViewerScreen` lifecycle without blocking selection UX.
5. Add query-memory guardrails to avoid retaining off-page full bytes.
6. Optional adaptive batch optimization with fallback safety.
7. Feature-flag rollout and instrumentation.
8. Tests for queue, cache budget, integration behavior, and non-regression layout constraints.

Complexity drivers:

1. IndexedDB migration and eviction correctness.
2. Interaction between React Query memory + durable cache.
3. Read-only rate-limit/backoff dynamics under preload traffic.

Score:

1. Safety: `2` (higher risk due cache/network/perf coupling).
2. Simplicity: `2` (queue + cache + integration complexity).
3. Reward: `4` (major perceived performance gain if executed well).

## 4) Market Module + Wallet Controls (`market-module-wallet-controls`)

Primary objective:

1. Enable list/cancel/transfer in active wallet viewer mode and improve seller listing management in market module.

Technical requirements:

1. Treat `ViewerScreen` wallet mode as single active wallet UX path.
2. Add shared list/cancel validation helpers (`src/lib/market/actions.ts`).
3. Replace broad wallet listing scan with page-scoped listing resolution.
4. Add listing tools in wallet-mode token details:
   - list,
   - cancel listing,
   - transfer.
5. Improve `MarketScreen` active listing cards for seller actionability (`Manage` + cancel path).
6. Preserve all network/ownership/post-condition safety checks.
7. Add unit tests for action validation and listing-resolution behavior.
8. Keep square layout and panel stability constraints unchanged.

Complexity drivers:

1. `ViewerScreen` already large and stateful.
2. Requires careful action-guard consistency between viewer and market.

Score:

1. Safety: `4` (localized behavioral additions, strong existing patterns).
2. Simplicity: `4` (focused scope, clear target surface).
3. Reward: `5` (directly resolves active user friction).

## 5) Public Design Refactor (`design-refactor`)

Primary objective:

1. Premium public-facing redesign with new IA, shell, design system, trust/protocol surfaces, and upgraded presentation.

Technical requirements:

1. Build/introduce `PublicShell` and route hierarchy improvements.
2. Add reusable design system tokens + primitives.
3. Redesign high-impact screens incrementally (Viewer, WalletLookup, PublicMarket, Mint flows).
4. Add trust strip, protocol explainer, and live activity/stats surfaces.
5. Preserve admin tooling and existing mint functionality.
6. Apply performance controls (lazy loading, memoization, skeletons, error boundaries).
7. Centralize product copy in content modules.

Complexity drivers:

1. Very broad UX/UI scope across most public-facing screens.
2. High coordination cost across routing, layout, components, and copy.
3. Strong regression risk if done without strict incremental boundaries.

Score:

1. Safety: `2` (high breadth and visual/systemic change risk).
2. Simplicity: `1` (largest implementation surface).
3. Reward: `4` (strong perception and discoverability improvements).

## 6) Operational Notes (`Optimisation-Notes`)

Primary objective:

1. Smaller targeted improvements: log de-duplication, BNS name resolution, and external marketplace integration docs.

Technical requirements:

1. Logger de-dup mode + diagnostics toggle in admin screen.
2. BNS resolver module with caching, lookup integration, and bounded request behavior.
3. `docs/marketplace-integration.md` with canonical reconstruction algorithm and API guidance.

Complexity drivers:

1. BNS relies on external API and rate-limit sensitivity.
2. Logger changes are global and must avoid hiding first-seen failures.

Score:

1. Safety: `4` overall (doc/log are high-safety; BNS is medium).
2. Simplicity: `4` overall (BNS is moderate, others straightforward).
3. Reward: `3` overall (good quality-of-life and ecosystem enablement).

## Safest / Simplest Plans (Top to Bottom)

1. `market-module-wallet-controls` (highly focused, strong direct UX outcome, limited surface area).
2. `Optimisation-Notes` doc + log de-dup subset (low behavioral risk).
3. Core staged refactor Phases 0-1 (`README.md` + `MODULE_CHECKLISTS.md`) for non-behavioral extraction prep.
4. Parent-child Phase 1-2 subset (domain + persistence) before full UI wiring.

## Most Rewarding Plans (Top to Bottom)

1. `market-module-wallet-controls` (immediate user workflow unblocking).
2. `parent-child-implementation` (major feature capability aligned with protocol semantics).
3. `viewer-page-loading-optimization` (major speed/perceived-performance upside).
4. `design-refactor` (high public presentation value, but longer horizon and higher risk).

## Recommended Implementation Order (Balanced Risk/Reward)

1. Deliver `market-module-wallet-controls` first.
2. Deliver `parent-child-implementation` in phases:
   - Phase 1-3 first,
   - then viewer relationship scanning.
3. Start core staged refactor Phase 0-2 in parallel where it de-risks active feature work.
4. Deliver viewer loading optimization behind feature flags:
   - `current-page` mode first,
   - then `current-plus-recent` after telemetry validation.
5. Deliver selected `Optimisation-Notes` items:
   - marketplace integration doc,
   - log de-dup,
   - then BNS.
6. Execute public design refactor after functional/behavioral priorities stabilize.

## Cross-Plan Dependencies and Conflicts

1. `market-module-wallet-controls` and core refactor both target `ViewerScreen` and `MarketScreen`.
   - Mitigation: finish wallet-controls feature before deep extraction of those screens.
2. `parent-child-implementation` and design refactor both touch viewer/mint UX.
   - Mitigation: land parent-child behavior first; redesign should wrap stable behavior.
3. `viewer-page-loading-optimization` touches cache/content/query internals.
   - Mitigation: avoid simultaneous large refactors in `src/lib/viewer/*`.

## Minimum Governance Rules for All Plans

1. Preserve mint flow order and fee defaults unless explicitly approved.
2. Preserve square grid/preview behavior and avoid horizontal layout shifts.
3. Keep read-only traffic bounded and active-tab guarded.
4. Require targeted tests for each touched domain in the same change set.
