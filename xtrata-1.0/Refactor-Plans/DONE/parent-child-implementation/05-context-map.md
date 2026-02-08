# Context Map (Code Navigation)

This map is a quick index of the files and call sites involved in parent-child implementation.

## Contract and Protocol

1. On-chain dependency storage:
- `contracts/live/xtrata-v1.1.1.clar:145`

2. Recursive sealing and validation:
- `contracts/live/xtrata-v1.1.1.clar:789`
- `contracts/live/xtrata-v1.1.1.clar:792`
- `contracts/live/xtrata-v1.1.1.clar:794`

3. Read dependencies:
- `contracts/live/xtrata-v1.1.1.clar:873`

4. Contract error code:
- `contracts/live/xtrata-v1.1.1.clar:60`
- `src/lib/protocol/types.ts:30`

5. Parser and client glue:
- `src/lib/protocol/parsers.ts:186`
- `src/lib/contract/client.ts:186`
- `src/lib/contract/client.ts:484`

## Minting Flow

1. Current dependency source in mint:
- `src/screens/MintScreen.tsx:1156`

2. Recursive seal branch:
- `src/screens/MintScreen.tsx:1427`
- `src/screens/MintScreen.tsx:1438`
- `src/screens/MintScreen.tsx:1445`

3. Resume recursive seal branch:
- `src/screens/MintScreen.tsx:1629`
- `src/screens/MintScreen.tsx:1642`
- `src/screens/MintScreen.tsx:1649`

4. Delegate clone hooks:
- `src/screens/MintScreen.tsx:289`
- `src/screens/MintScreen.tsx:976`
- `src/screens/MintScreen.tsx:1765`

5. SIP-016 dependency metadata insertion:
- `src/screens/MintScreen.tsx:766`

6. Mint attempt persistence touchpoints:
- `src/lib/mint/attempt-cache.ts`
- `src/screens/MintScreen.tsx:899`
- `src/screens/MintScreen.tsx:910`

## Viewer Flow

1. Existing dependency read in details panel:
- `src/screens/ViewerScreen.tsx:286`
- `src/screens/ViewerScreen.tsx:292`
- `src/screens/ViewerScreen.tsx:688`

2. Candidate insertion point for relationship actions:
- `src/screens/ViewerScreen.tsx` token details area around dependency output.

3. Existing content/query infra to reuse:
- `src/lib/viewer/queries.ts`
- `src/lib/viewer/content.ts`
- `src/lib/viewer/cache.ts`
- `src/lib/viewer/types.ts`

## App Wiring

1. Top-level state/prop wiring:
- `src/App.tsx`

2. Viewer and mint mounting sites:
- `src/App.tsx` (`ViewerScreen`, `MintScreen`).

## Collection Mint (Scope Note)

1. Current batch seal uses non-recursive method:
- `src/screens/CollectionMintScreen.tsx:519`

This is intentionally not changed in initial parent-child implementation scope.

## Existing Tests

1. Clarinet recursive dependency test:
- `contracts/clarinet/tests/xtrata-v1.1.0.test.ts:537`
- `contracts/clarinet/tests/xtrata-v1.1.0.test.ts:556`

2. Parser dependency test:
- `src/lib/protocol/__tests__/parsers.test.ts:124`

## New Test Destinations

1. `src/lib/mint/__tests__/dependencies.test.ts`
2. `src/lib/mint/__tests__/attempt-cache.test.ts`
3. `src/lib/viewer/__tests__/relationships.test.ts`
4. `contracts/clarinet/tests/xtrata-v1.1.0.test.ts` (additional cases)
