# AGENTS

This file captures the core development rules and app constraints for V16.

## Development Rules

1) Before making any decision or code change, read `docs/app-reference.md`.
2) Keep layout stable: avoid horizontal shifts when panels open/close; preserve scrollbar stability and responsive widths.
3) Preserve square grid/preview behavior: 4x4 grids, square cells, square preview frame; metadata and actions stay outside the square; no scrolling needed to see the full asset inside the square.
4) Avoid unnecessary network calls: prefer IndexedDB cache + React Query; reuse already-loaded grid content in previews.
5) Preserve the mint flow order (init -> batch/chunk -> seal) and current fee defaults unless explicitly changed.
6) Keep deploy flow user-driven (contract name + source input) with clear logs for each deploy step and wallet response.
7) Maintain wallet session persistence and network guards (see `docs/assumptions.md`).
8) Keep contract sources and registries in sync when adding versions.
   - Use `scripts/contract-variants.mjs` (`npm run contracts:sync`) to keep
     clarinet/testnet/mainnet SIP-009 trait blocks aligned.
9) Add or update tests for lib changes; prefer targeted unit tests in `src/lib/**/__tests__`.

## App Overview

- Single-page React app with a minting flow, collection viewer, and wallet viewer.
- Contract-driven inscriptions using Stacks read-only calls and wallet transactions.
- Content viewing uses IndexedDB caching and React Query to reduce network load.

## Key Folders

- `src/` app source (components, screens, lib helpers, styles).
- `docs/` project documentation, assumptions, and contract inventory.
- `contracts/` contract sources and references (`contracts/clarinet/`, `contracts/live/`, `contracts/other/`).
- `recursive-apps/` supporting recursive app assets.

## UI/UX Constraints

- Grids must remain 4x4 and square at all responsive sizes.
- Preview panels must display a square preview plus metadata/actions without inner scrolling.
- Simple modules stay compact and can stack; complex modules should fit in the viewport when opened.
- Collapsing/expanding modules should not shift horizontal layout.

## Data and Cache Behavior

- Viewer content should use cache-first behavior; avoid refetching if content is already cached.
- Preview should render the same resolved content as the grid, not a different fallback path.
- Prefer batch chunk reads when supported; fall back to per-chunk reads if cost limits are hit.

## Minting and Deploying

- Minting uses three explicit steps with logs and visible progress states.
- Fee logic defaults should remain stable unless explicitly approved.
- Deploy uses input contract name + source, then triggers a wallet transaction.

## Networking and Wallets

- Network inference rules live in `docs/assumptions.md` and should stay aligned with session logic.
- Guard against aggressive polling and keep network retries bounded.

## Testing

- Unit tests live in `src/lib/**/__tests__`.
- Update or add tests for any protocol, parsing, or network behavior changes.
- The test suite is expected to evolve alongside new features; add tests when introducing new modules or processes.
- Prefer adding automated tests as part of the same change set to keep development efficient and on course.
