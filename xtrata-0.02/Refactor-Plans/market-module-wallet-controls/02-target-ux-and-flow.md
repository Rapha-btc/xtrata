# Target UX and Flow

## Product Outcomes

1. Wallet viewer mode supports all three owner actions in one place: `List`, `Cancel listing`, `Transfer`.
2. Seller-owned listings in market cards are actionable: users can open manage controls and cancel quickly.
3. Action availability is explicit and safe (owner checks, seller checks, network checks).

## Wallet Viewer Flow (Owned Token)

1. User enters wallet mode and selects a token.
2. Wallet tools show:
   - listing status,
   - market contract,
   - listing price (if listed),
   - list form,
   - cancel listing button,
   - transfer form.
3. If token is listed and seller is connected wallet, `Cancel listing` is enabled.
4. If token is unlisted and owned by connected wallet, `List` is enabled.
5. If token belongs to lookup wallet but not connected wallet, tools show view-only guidance and disable list/cancel/transfer.

## Wallet Viewer Flow (Listed Badge)

1. User clicks listed badge in preview.
2. Wallet tools drawer opens and focuses listing controls.
3. Listing ID and status are visible immediately.

## Market Module Flow (Seller Listing)

1. Seller sees own listings in Active Listings.
2. Card provides `Manage` action and optional direct `Cancel` action.
3. `Manage` preloads listing context into lookup/actions panel and scrolls to controls.
4. `Cancel` uses listing id from card context, no manual typing required.

## Market Module Flow (Buyer Listing)

1. Non-seller sees `Buy now`.
2. Precondition messaging remains clear (escrowed/stale/network mismatch).
3. No behavior change to buy post-condition safety.

## Permission and Safety Rules

1. List requires connected wallet, matching network, and selected token ownership.
2. Cancel requires connected wallet, matching network, active listing record, and seller match.
3. Transfer keeps existing validation and post-conditions.
4. Public variant keeps read-focused behavior and disables actions when transaction guards fail.
