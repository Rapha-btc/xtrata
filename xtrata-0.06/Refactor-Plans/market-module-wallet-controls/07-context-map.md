# Context Map

## App Wiring

1. `src/App.tsx`
Mounts active `ViewerScreen` and `MarketScreen`; this is the real integration surface.

## Wallet Viewer Surface

1. `src/screens/ViewerScreen.tsx`
Collection/wallet mode, selected token preview, listed state, wallet tools drawer, and listing queries.

2. `src/components/TokenContentPreview.tsx`
Preview renderer used by wallet and collection flows.

3. `src/components/TokenCardMedia.tsx`
Grid media rendering and cache-backed content loading.

## Market Module Surface

1. `src/screens/MarketScreen.tsx`
Market contract selection, active listings, lookup, list/buy/cancel actions.

2. `src/screens/PublicMarketScreen.tsx`
Public wrapper variant for market module.

## Market Data + Contracts

1. `src/lib/market/client.ts`
Read-only market client (`getLastListingId`, `getListing`, `getListingIdByToken`, etc.).

2. `src/lib/market/indexer.ts`
Activity fetch and active listing index build.

3. `src/lib/market/types.ts`
Listing/activity types.

4. `src/lib/market/parsers.ts`
Read-only result parsing for listings.

5. `src/lib/market/cache.ts`
IndexedDB snapshot storage for market/nft activity.

6. `contracts/live/xtrata-market-v1.1.clar`
Market contract behavior used by current market UI assumptions.

7. `contracts/clarinet/tests/xtrata-market-v1.1.test.ts`
Contract tests for list/buy behavior.

## Shared Guard/Validation Modules

1. `src/lib/wallet/transfer.ts`
Transfer validation and user-facing validation messages.

2. `src/lib/network/guard.ts`
Network mismatch logic used across wallet and market actions.

3. `src/lib/contract/post-conditions.ts`
NFT and contract post-condition builders used for transaction safety.

## Styles

1. `src/styles/app.css`
Viewer, wallet tools, transfer panel, market listing card, and module layout constraints.

## Legacy Reference

1. `src/screens/MyWalletScreen.tsx`
Contains prior combined list/cancel/transfer wallet tools pattern; not currently mounted in active app shell but useful as implementation reference.
