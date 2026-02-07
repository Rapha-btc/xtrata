# Detailed Implementation Plan

## Phase 0: Baseline and Invariants

1. Confirm no contract source changes are required for requested UX.
2. Capture baseline behavior in wallet mode and market active listings.
3. Record invariant checklist:
   - 4x4 square grid unchanged,
   - square preview unchanged,
   - no horizontal layout shift when panels open/close,
   - wallet/network guards unchanged.

## Phase 1: Shared Market Action Domain

Goal: reduce duplicated validation and make list/cancel behavior consistent.

1. Add `src/lib/market/actions.ts`.
2. Implement pure helpers for:
   - list price parsing and microstx normalization,
   - list eligibility checks,
   - cancel eligibility checks,
   - seller/owner/address comparison normalization.
3. Keep transaction broadcast code in screens, but route guard logic through shared helpers.

Acceptance:

1. Viewer wallet tools and market module use the same validation semantics.
2. Existing transfer validation remains unchanged in `src/lib/wallet/transfer.ts`.

## Phase 2: Listing Resolution Optimization

Goal: improve listing accuracy on current wallet page while reducing broad scans.

1. Add page-scoped listing resolver helper:
   - `src/lib/market/listing-resolution.ts` (new).
2. Build merged listing map from:
   - market activity index (fast path),
   - targeted per-token lookup for visible page tokens only when needed.
3. In `src/screens/ViewerScreen.tsx`, replace broad wallet listing scan query with page-scoped targeted lookups.
4. Keep bounded concurrency and active-tab guards.

Acceptance:

1. Listed state is accurate for visible wallet-page tokens.
2. Read-only calls are lower or equal versus current scan strategy.

## Phase 3: Wallet Tools Upgrade in Viewer

Goal: deliver required owner workflow in active wallet UI.

1. Update wallet-mode section in `TokenDetails` within `src/screens/ViewerScreen.tsx`.
2. Add `Listing tools` panel in wallet tools drawer with:
   - selected token,
   - market contract,
   - listing status,
   - price input,
   - `List`,
   - `Cancel listing`,
   - clear/reset.
3. Keep existing `Transfer inscription` panel in same wallet tools area.
4. Add listed-badge action in preview to open/focus listing controls.
5. Enforce owner/seller/network guards before list/cancel submission.

Acceptance:

1. Wallet mode allows `list + cancel + transfer` for owned inscriptions.
2. Wallet mode for non-owned lookup wallets remains safe and view-only.

## Phase 4: Market Module Seller Management UX

Goal: streamline seller cancellation and listing management.

1. Update active listing card actions in `src/screens/MarketScreen.tsx`:
   - seller cards: `Manage` and optional direct `Cancel listing`,
   - buyer cards: `Buy now`.
2. Add handler to preload selected listing id into actions area.
3. Ensure cancel action uses selected listing context when available.
4. Keep existing list/buy/cancel actions panel and network guards.

Acceptance:

1. Clicking seller listing exposes cancellation path without manual listing-id typing.
2. Buyer flow remains unchanged and safe.

## Phase 5: Optional Refactor for Maintainability

Goal: reduce future drift between market and viewer action logic.

1. Extract lightweight shared action runner:
   - `requestMarketContractCall` helper (local to market domain).
2. Extract shared listing-tool presentational component if needed:
   - `src/components/market/ListingToolsPanel.tsx`.
3. Keep CSS classnames compatible with existing layout.

Acceptance:

1. No behavior drift between viewer and market action semantics.
2. Layout remains stable with existing responsive behavior.

## Phase 6: Docs and App Reference Updates

1. Update `docs/app-reference.md` for new market helpers/components.
2. Add brief notes in `Refactor-Plans/README.md` linking this pack.

## File Touchpoints

New files:

1. `src/lib/market/actions.ts`
2. `src/lib/market/listing-resolution.ts`
3. `src/lib/market/__tests__/actions.test.ts`
4. `src/lib/market/__tests__/listing-resolution.test.ts`

Modified files:

1. `src/screens/ViewerScreen.tsx`
2. `src/screens/MarketScreen.tsx`
3. `src/styles/app.css`
4. `docs/app-reference.md`
