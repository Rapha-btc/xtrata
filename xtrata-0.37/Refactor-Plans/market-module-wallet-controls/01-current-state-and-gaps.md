# Current State and Gaps

## Ground Truth

1. The app currently mounts `ViewerScreen` and `MarketScreen` from `src/App.tsx`.
2. `MyWalletScreen` exists but is not mounted in the active app shell.
3. Wallet mode in `ViewerScreen` already resolves listing state for selected tokens, but wallet tools only expose transfer actions.
4. `MarketScreen` supports list/buy/cancel, but active listing cards do not provide a direct cancel flow for seller-owned listings.

## Current Wallet Mode Behavior

1. `ViewerScreen` computes listing index from market activity and selected listing lookups.
2. Wallet mode shows listed badges and listing metadata in preview.
3. Wallet tools drawer currently only contains transfer form/actions.
4. Result: users can see listing state but cannot list/cancel from the same wallet preview flow.

## Current Market Module Behavior

1. Active listing cards include quick buy action for non-seller users.
2. Seller-owned cards show non-actionable text (`Your listing`) instead of direct manage/cancel controls.
3. Cancel flow is form-driven by listing ID input, creating friction for seller workflows.
4. Listing lookup can load a listing, but action routing remains indirect.

## Data and Performance Gaps

1. Wallet listings query in `ViewerScreen` scans recent listing IDs (`get-last-listing-id` + repeated `get-listing`) to find seller listings.
2. This scan is bounded but still expensive relative to the UX need.
3. Listing accuracy for currently visible wallet tokens can be solved with page-scoped targeted lookups, avoiding broad scans.

## UX Gap to Fix

Primary requirement:

1. In wallet mode, when viewing owned inscriptions, users must be able to `list`, `cancel listing`, and `transfer` from one wallet tools area.

Secondary requirement:

1. In market module active listings, seller-owned listings should expose direct listing management and cancel affordances without forcing manual listing-id entry.
