# SDK Quickstart: Read-only

Use `@xtrata/sdk` clients to read core protocol state with retry + fallback behavior.

If you are new, use `docs/sdk/quickstart-first-30-minutes.md` first.
If you want the easiest setup for production usage, use `docs/sdk/quickstart-simple-mode.md`.

```ts
import {
  createXtrataClient,
  parseContractId
} from '@xtrata/sdk';

const parsed = parseContractId(
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0'
);
if (!parsed.config) {
  throw new Error(parsed.error ?? 'Invalid contract id');
}

const client = createXtrataClient({ contract: parsed.config });
const sender = parsed.config.address;

const [nextTokenId, paused, feeUnit] = await Promise.all([
  client.getNextTokenId(sender),
  client.isPaused(sender),
  client.getFeeUnit(sender)
]);

console.log({ nextTokenId, paused, feeUnit });
```

Notes:
- Use `apiBaseUrl`/`apiBaseUrls` in client options to control infrastructure routing.
- Read-only retries/backoff are enabled by default.
