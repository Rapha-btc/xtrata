# SDK Quickstart: Collection Mint Status + Lifecycle

Use the collection client + lifecycle helpers to derive live/public state.

Policy:
- Active SDK support target is `xtrata-collection-mint-v1.4`.
- Legacy `v1.0` and `v1.1` collection-mint contracts are archived for new SDK work.

```ts
import {
  createCollectionMintClient,
  createCollectionMintSnapshot,
  shouldShowLiveMintPage,
  parseContractId
} from '@xtrata/sdk';

const parsed = parseContractId(
  'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7.xtrata-collection-ahv0-34f95221'
);
if (!parsed.config) {
  throw new Error(parsed.error ?? 'Invalid collection contract id');
}

const client = createCollectionMintClient({ contract: parsed.config });
const sender = parsed.config.address;

const status = await client.getStatus(sender);
const snapshot = createCollectionMintSnapshot(status);

const showLivePage = shouldShowLiveMintPage({
  state: 'published',
  status
});

console.log({
  minted: snapshot.mintedCount,
  remaining: snapshot.remaining,
  live: snapshot.live,
  showLivePage
});
```

Guidance:
- Use `published` state + on-chain status together to decide public visibility.
- Use `snapshot.remaining` for sold-out handling and UI state stamping.
