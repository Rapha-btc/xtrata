# SDK Quickstart: Simple Mode (Recommended)

Simple Mode is the easiest way to integrate Xtrata.

You pass a contract ID once, bind a sender once, and call clear methods without repeating network/sender plumbing.

Import note:
- Use published package entrypoints: `@xtrata/sdk/*`

## 1) Core Xtrata read-only in minutes

```ts
import { createXtrataReadClient } from '@xtrata/sdk/simple';

const core = createXtrataReadClient({
  contractId: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0',
  senderAddress: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X'
});

const nextTokenId = await core.getNextTokenId();
const paused = await core.isPaused();
const token = await core.getTokenSnapshot(58n);

console.log({ nextTokenId, paused, token });
```

## 2) Collection mint status in one call

```ts
import { createCollectionReadClient } from '@xtrata/sdk/simple';

const collection = createCollectionReadClient({
  contractId: 'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7.xtrata-collection-ahv0-34f95221',
  senderAddress: 'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7'
});

const snapshot = await collection.getSnapshot();

console.log({
  live: snapshot.live,
  minted: snapshot.mintedCount,
  remaining: snapshot.remaining,
  effectiveMintPrice: snapshot.effectiveMintPrice
});
```

## 3) Market reads with the same pattern

```ts
import { createMarketReadClient } from '@xtrata/sdk/simple';

const market = createMarketReadClient({
  contractId: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-market-stx-v1-0',
  senderAddress: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X'
});

const lastListingId = await market.getLastListingId();
const listing = await market.getListing(lastListingId);

console.log({ lastListingId, listing });
```

## 4) One-suite setup (optional)

```ts
import { createSimpleSdk } from '@xtrata/sdk/simple';

const sdk = createSimpleSdk({
  senderAddress: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
  xtrataContractId: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0',
  collectionContractId:
    'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7.xtrata-collection-ahv0-34f95221'
});

const [nextTokenId, collectionSnapshot] = await Promise.all([
  sdk.xtrata?.getNextTokenId(),
  sdk.collection?.getSnapshot()
]);
```

## When to use advanced modules

Use `client`, `mint`, `deploy`, and lower-level helpers when you need:
- custom transaction payload orchestration
- custom infra routing and explicit retry control
- specialized lifecycle or deployment workflows
