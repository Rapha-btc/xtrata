# Simplification and Safety Optimizations

This file captures optimizations that make implementation safer, smaller, and more efficient.

## 1) Use ViewerScreen as the Single Wallet UX Path

Reason:

1. `ViewerScreen` wallet mode is the active app path.
2. `MyWalletScreen` is currently unmounted and should not be treated as delivery target.

Action:

1. Implement wallet listing tools directly in `ViewerScreen`.
2. Reuse patterns from `MyWalletScreen`, but do not split delivery across two wallet UIs.

Benefit:

1. Lower implementation risk and no double-maintenance.

## 2) Replace Broad Wallet Listing Scan With Page-Scoped Resolution

Reason:

1. Current wallet listing scan loops through recent listing IDs and can over-fetch.
2. UX requirement is actionability for the current page and selected token.

Action:

1. Resolve listing state using:
   - activity index fast path,
   - targeted lookups for visible page tokens missing listing data.
2. Cap lookup concurrency (2).

Benefit:

1. Lower read-only call volume.
2. Better responsiveness and simpler reasoning.

## 3) Centralize List/Cancel Validation

Reason:

1. List/cancel guards are currently screen-specific and repetitive.

Action:

1. Move guard logic to `src/lib/market/actions.ts`.
2. Keep transaction execution in screen components.

Benefit:

1. Consistent behavior and easy unit testing.

## 4) Keep Contract Calls Simple and Deterministic

Reason:

1. Market actions are user-initiated and should avoid hidden retries or automatic rebroadcasts.

Action:

1. Preserve explicit user action per transaction.
2. Keep on-screen status messages for wallet confirmation, submit, cancel, and fail.

Benefit:

1. Predictable transaction UX and easier support/debug.

## 5) Make Ownership Rules Explicit in UI

Reason:

1. Users need clear explanation when viewing another wallet or when seller mismatch blocks cancel.

Action:

1. Show explicit reason labels in listing tools:
   - not owner,
   - seller mismatch,
   - market/network mismatch,
   - no active listing.

Benefit:

1. Fewer failed attempts and clearer behavior.

## 6) Preserve Layout Constraints by Reusing Existing Panel Patterns

Reason:

1. The app has strict square grid/preview and layout stability constraints.

Action:

1. Reuse `transfer-panel`, `detail-panel__tools`, and existing compact panel styles.
2. Avoid introducing new nested scrolling regions in preview area.

Benefit:

1. Lower visual regression risk.

## 7) Keep Read-Only Polling Bounded

Reason:

1. Market and viewer queries already use bounded stale/refetch settings.

Action:

1. Do not introduce tighter polling intervals.
2. Keep `isActiveTab` gating on all listing hydration queries.

Benefit:

1. Lower infra load and better client performance.
