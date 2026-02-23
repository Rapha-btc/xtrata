# Optimisation + Refactor Plan (No Code Changes)

Purpose
- Provide a safe, sequenced refactor plan for maintainability and UX performance improvements.
- Preserve mint flow order (init -> batch/chunk -> seal), grid/preview constraints (4x4 square grid + square preview), and cache behavior (cache-first, stable keys).

Guardrails (Must Hold After Each Phase)
- Mint flow order unchanged, fee defaults unchanged, resume flow unchanged.
- Viewer grid remains 4x4 and square; preview remains square; metadata/actions outside the square; no inner scrolling in preview.
- Cache keys and stores remain stable; preview resolves from the same content path as the grid.
- No increase in read-only call volume or aggressive polling.

Phase 0: Baseline + Tests (Low Risk)
- Add or confirm unit tests for critical non-UI logic.
- Capture current behavior in a short checklist (mint step order, viewer load order, cache usage, read-only concurrency).
Deliverables
- Minimal test coverage for parsing, content caching, and viewer query keys.
- A short "invariants" checklist for regressions.

Phase 1: Pure Helper Extraction (Low Risk)
- Extract pure helpers from large files without changing behavior.
- Keep function signatures the same at public boundaries.
Deliverables
- Helper modules for media resolution, token uri handling, chunking helpers, and IDB utils.

Phase 2: Hooks + Subcomponents (Medium Risk)
- Split large components into hooks + subcomponents, preserving prop signatures and CSS classnames.
- Keep existing state transitions but isolate to hooks for testability.
Deliverables
- ViewerScreen, TokenContentPreview, TokenCardMedia, MintScreen reduced to thin render shells.

Phase 3: App Shell Deduplication (Medium Risk)
- Extract shared layout and state wiring between App and PublicApp into shared components or hooks.
Deliverables
- Shared "AppShell" + "WalletShell" modules, with App/PublicApp as small wrappers.

Phase 4: Mint Flow Stabilization (Optional, High Value)
- Introduce a reducer or state machine for mint steps, without changing user-visible behavior.
Deliverables
- A single place that defines step order and state transitions; smaller UI components.

Phase 5: Viewer/Wallet Consolidation (Optional)
- Remove duplicated wallet viewer behavior and use ViewerScreen wallet mode everywhere.
Deliverables
- One viewer path for grid/preview, reduced maintenance burden.

Verification Checklist (After Each Phase)
- Mint: init -> batch -> seal order preserved, same fee defaults, resume logic intact.
- Viewer: 4x4 grid and square preview, no layout shift, correct media in grid and preview.
- Cache: React Query keys unchanged; IndexedDB stores unchanged; cache hits still work.
- Performance: No additional read-only calls; prefetch and refresh behavior unchanged.

Additional Implementation Packs
- Portfolio summary + prioritization: `Refactor-Plans/REFRACTOR-PLANS-SUMMARY.md`
- Parent-child relationships (mint + viewer + tests): `Refactor-Plans/parent-child-implementation/README.md`
- Viewer page-loading optimization (budgeted full-content preload + cache eviction): `Refactor-Plans/viewer-page-loading-optimization/README.md`
- Market module + wallet controls UX (list/cancel/transfer in wallet view + seller management): `Refactor-Plans/market-module-wallet-controls/README.md`
