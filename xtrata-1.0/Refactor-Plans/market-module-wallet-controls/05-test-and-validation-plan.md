# Test and Validation Plan

## Test Goals

1. Wallet viewer supports `list + cancel + transfer` for owned inscriptions.
2. Seller listing management in market module is directly actionable.
3. Read-only volume is bounded and listing state remains accurate for visible tokens.
4. Existing buy and transfer safety is preserved.

## Unit Tests (Required)

### A. Market action validation

File:

1. `src/lib/market/__tests__/actions.test.ts`

Cases:

1. List blocked when wallet missing.
2. List blocked on network mismatch.
3. List blocked when token not selected.
4. List blocked when owner mismatch.
5. List blocked on invalid price.
6. Cancel blocked when listing missing.
7. Cancel blocked when seller mismatch.
8. Cancel allowed when seller matches and listing exists.

### B. Listing resolution

File:

1. `src/lib/market/__tests__/listing-resolution.test.ts`

Cases:

1. Activity index hit avoids targeted lookup.
2. Missing index entry triggers targeted lookup.
3. Non-escrow owner skips targeted lookup.
4. Concurrency cap is respected.
5. Merge output is deterministic and keyed by `nftContract:tokenId`.

### C. Existing market/indexer tests

Files to update if needed:

1. `src/lib/market/__tests__/indexer.test.ts`
2. `src/lib/market/__tests__/parsers.test.ts`

Cases:

1. No regression in active listing index behavior.
2. No regression in listing parser for optional fields.

## Contract Tests (Recommended)

File:

1. `contracts/clarinet/tests/xtrata-market-v1.1.test.ts`

Add/extend cases:

1. `get-listing-id-by-token` returns listing id after `list-token`.
2. `cancel` clears listing map and token mapping.
3. `buy` clears listing map and token mapping.

Reason:

1. UI plan relies on listing id by token and active-status semantics.

## Manual Validation Matrix

1. Wallet mode, owned unlisted token: list succeeds, token shows listed state.
2. Wallet mode, owned listed token: cancel succeeds.
3. Wallet mode, owned token: transfer still succeeds.
4. Wallet mode, lookup of non-owned wallet: actions disabled with clear reason.
5. Market active listing card (seller): manage opens actions with prefilled listing; cancel works.
6. Market active listing card (buyer): buy still works.
7. Market/network mismatch states show unchanged guard messages.
8. Responsive layout still preserves square grid and square preview with no horizontal shift.

## Regression Commands

1. `npm run test:app`
2. `npm run test:clarinet`
3. `npm run lint`
