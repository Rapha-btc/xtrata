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

## Arcade Versioning Rules

- Arcade runtime lives under `recursive-apps/21-arcade/` and uses latest-version loading.
- The launcher main app (`recursive-apps/21-arcade/main.js`) must resolve games through:
  - `recursive-apps/21-arcade/games/latest-manifest.js`
  - `recursive-apps/21-arcade/lib/game-loader.js`
- Version progression policy for arcade game outputs:
  - default after `v2` is decimal minor (`v2.1`, `v2.2`, `v2.3`, ...)
  - major jumps only when explicitly requested
  - helper command: `npm run arcade:next-version -- --game gameNN_slug`
- Build policy for arcade workspaces:
  - each new workspace build should mint the next decimal runtime version file in `recursive-apps/21-arcade/games/`
  - example sequence for repeated builds: `v2 -> v2.1 -> v2.2 -> v2.3`
  - regenerate `recursive-apps/21-arcade/games/latest-manifest.js` after each build/promotion
- Launcher tile policy:
  - main arcade tiles must display resolved version labels in decimal form (`v1.0`, `v2.0`, `v2.1`, ...)
- Game-type strategy review gate:
  - initialize strategy profiles: `npm run arcade:strategy:init`
  - review/audit all workspaces: `npm run arcade:strategy:review`
  - strict per-game gate before promotion:
    - `npm run arcade:strategy:review -- --game gameNN_slug --strict`
- After any promoted game output version, regenerate manifest:
  - `npm run arcade:games:manifest`

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


## Xtrata Fee Structure (Reference)

Costs per inscription have two components. **Always use this reference when making cost claims or per-MB comparisons.** Never extrapolate per-unit costs from small samples where fixed overhead dominates.

### Fixed costs (per inscription, regardless of data size)

| Call | Protocol Fee | Notes |
|---|---|---|
| `begin-or-get` | 1 × fee-unit (~0.1 STX) | Opens the upload session |
| `seal-recursive` | 2 × fee-unit (~0.2 STX) | Seals and mints the token |
| **Total fixed** | **~0.3 STX** | Same whether 1KB or 4MB |

### Variable costs (scale with data size)

| Call | Cost Driver | Notes |
|---|---|---|
| `add-chunk-batch` | Network mining fee, scales with byte count | Each batch holds up to ~440KB |

At current average fee rates since launch:
- ~0.5 STX per 440KB batch (mining fees)
- A 16KB file = 1 batch, ~0.04 STX mining fee
- A 4MB file = ~10 batches, ~5.0 STX mining fees

### Cost examples at scale

| Data Size | Mining Fees | Fixed Fees | Protocol Fees | Total STX | USD (@ $0.21/STX) | Per-MB USD |
|---|---|---|---|---|---|---|
| 16KB | ~0.04 | ~0.30 | ~0.01 | ~0.35 | ~$0.07 | ~$4.48 (misleading — fixed costs dominate) |
| 440KB | ~0.50 | ~0.30 | ~0.01 | ~0.81 | ~$0.17 | ~$0.39 |
| 4MB | ~5.00 | ~0.30 | ~0.10 | ~5.40 | ~$1.13 | ~$0.28 |

### Rules for cost claims

- **NEVER** extrapolate per-MB cost from a single 16KB sample — fixed costs are 89% of that total and do not scale
- Always separate fixed (begin, seal) from variable (chunk mining fees) components
- Use `get-fee-unit` to check current protocol fees before cost calculations
- Compare against actual tx fees from recent inscriptions in ledger.md
- The per-MB cost **drops** as file size increases because fixed costs amortize
- When comparing to Arweave or other storage, use the 440KB+ per-MB figure, not the 16KB figure
