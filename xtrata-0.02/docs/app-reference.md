# App Reference Map

Purpose: one-stop map of where code lives and which files to touch for common updates.

## Top-level layout and navigation

- `src/App.tsx` owns the main layout, section order, anchor buttons, collapse state, deploy panel, and high-level app state wiring.
- `src/styles/app.css` owns layout tokens, widths, grid sizing, square preview frames, and global layout rules.
- `src/main.tsx` boots the app and wires providers (React Query) and global CSS.

## Screens and shared UI

- `src/screens/MintScreen.tsx` owns mint UI, file selection, cost/fee display, mint flow steps, and mint preview.
- `src/screens/ViewerScreen.tsx` owns the collection viewer grid, selection logic, and detailed preview panel.
- `src/screens/MyWalletScreen.tsx` owns the wallet grid, pagination, selection, and wallet preview panel.
- `src/components/TokenCardMedia.tsx` renders grid cell media (image/audio/video/html/text) and handles per-token loading.
- `src/components/TokenContentPreview.tsx` renders the large preview, resolves content, and exposes preview actions.

## Contracts, network, and wallet plumbing

- `src/data/contract-registry.json` stores the named contract list used by the selector.
- `src/lib/contract/registry.ts` loads the registry, normalizes entries, and exposes selection helpers.
- `src/lib/contract/config.ts` defines contract config types and helpers like `getContractId`.
- `src/lib/contract/client.ts` builds contract call options and read-only callers.
- `src/lib/contract/read-only.ts` wraps read-only calls with retry behavior.
- `src/lib/contract/selection.ts` manages contract selection logic for UI defaults.
- `src/lib/utils/tab-guard.ts` manages multi-tab activity so only one tab performs heavy reads.
- `src/lib/network/config.ts` defines network defaults and endpoints.
- `src/lib/network/stacks.ts` builds Stacks network objects.
- `src/lib/network/guard.ts` and `src/lib/network/rate-limit.ts` protect against aggressive polling.
- `src/lib/wallet/session.ts` and `src/lib/wallet/storage.ts` persist wallet sessions.
- `src/lib/wallet/adapter.ts` centralizes wallet request calls and types.

## Protocol, chunking, and viewer data

- `src/lib/protocol/types.ts` defines protocol types for inscriptions.
- `src/lib/protocol/clarity.ts` maps protocol values to clarity values.
- `src/lib/protocol/parsers.ts` parses contract read-only responses into app types.
- `src/lib/chunking/hash.ts` hashes and slices files for chunked minting.
- `src/lib/viewer/queries.ts` builds React Query calls for viewer data.
- `src/lib/viewer/content.ts` resolves content bytes, batch reads, and media handling.
- `src/lib/viewer/cache.ts` owns the IndexedDB cache and keying.
- `src/lib/viewer/model.ts` shapes viewer data records for grids and previews.
- `src/lib/viewer/ownership.ts` maps wallet ownership data for the wallet grid.
- `src/lib/viewer/recursive.ts` resolves recursive dependencies when viewing.
- `src/lib/viewer/types.ts` defines viewer models.

## Tests and fixtures

- `src/lib/**/__tests__/*.test.ts` covers unit tests for protocol, viewer, network, contract, and wallet utilities.
- `scripts/contract-variants.mjs` syncs and verifies SIP-009 trait variants for clarinet/testnet/mainnet.

## Update types (simple -> complex)

1) Text copy, labels, and button titles.
Files: `src/App.tsx`, `src/screens/MintScreen.tsx`, `src/screens/ViewerScreen.tsx`, `src/screens/MyWalletScreen.tsx`, `src/components/TokenContentPreview.tsx`.
Notes: prefer in-place edits; keep strings short for tight layouts.

2) Layout spacing, widths, and overall page density.
Files: `src/styles/app.css`, `src/App.tsx`.
Notes: use CSS variables and layout classes; avoid per-component inline styles.

3) Grid layout, square sizing, and preview sizing for viewer or wallet.
Files: `src/styles/app.css`, `src/screens/ViewerScreen.tsx`, `src/screens/MyWalletScreen.tsx`, `src/components/TokenCardMedia.tsx`, `src/components/TokenContentPreview.tsx`.
Notes: keep the square frame constraints in CSS and only control selection in screens.

4) Add or reorder modules/sections in the UI.
Files: `src/App.tsx`, `src/styles/app.css`.
Notes: add anchors and collapse wiring if a new module is added.

5) Contract list changes or new default contract.
Files: `src/data/contract-registry.json`, `src/lib/contract/registry.ts`, `src/lib/contract/selection.ts`.
Notes: keep contract id formatting consistent with `getContractId`.

5a) Contract read-only additions (protocol helpers or diagnostics).
Files: `docs/contract-inventory.md`, `src/lib/contract/client.ts`, `src/lib/protocol/parsers.ts`.
Notes: add helpers as read-only calls, ensure parsers and docs are updated.

6) Deploy flow UI and deploy logic updates.
Files: `src/App.tsx`, `src/lib/contract/client.ts`, `src/lib/network/stacks.ts`, `src/lib/wallet/adapter.ts`.
Notes: deploy UI lives in App; transaction building lives in contract client.

7) Wallet connect, disconnect, and session persistence changes.
Files: `src/lib/wallet/session.ts`, `src/lib/wallet/storage.ts`, `src/lib/wallet/adapter.ts`, `src/App.tsx`.
Notes: session persistence is separated from UI state and should stay that way.

8) Mint flow changes (file validation, hashing, fee logic, transaction steps).
Files: `src/screens/MintScreen.tsx`, `src/lib/chunking/hash.ts`, `src/lib/protocol/clarity.ts`, `src/lib/contract/client.ts`, `src/lib/wallet/adapter.ts`.
Notes: keep the three-step mint flow in MintScreen and avoid hiding errors.

9) Viewer data fetching, caching, and content decoding.
Files: `src/lib/viewer/queries.ts`, `src/lib/viewer/content.ts`, `src/lib/viewer/cache.ts`, `src/components/TokenCardMedia.tsx`, `src/components/TokenContentPreview.tsx`.
Notes: cache key changes must update both cache and queries.

10) Protocol parsing or contract read-only response changes.
Files: `src/lib/protocol/parsers.ts`, `src/lib/protocol/types.ts`, `src/lib/contract/read-only.ts`.
Notes: add or update tests in `src/lib/protocol/__tests__/`.

11) Network changes or new endpoint configuration.
Files: `src/lib/network/config.ts`, `src/lib/network/stacks.ts`, `src/lib/network/types.ts`.
Notes: ensure tests or guards in `src/lib/network/__tests__/` still pass.

12) New media types or preview behavior.
Files: `src/components/TokenCardMedia.tsx`, `src/components/TokenContentPreview.tsx`, `src/lib/viewer/content.ts`.
Notes: keep rendering logic consistent between grid and preview.
