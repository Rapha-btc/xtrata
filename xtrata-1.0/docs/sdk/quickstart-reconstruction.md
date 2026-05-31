# SDK Quickstart: Independent Reconstruction

Use this when you want to rebuild inscription bytes from public chain data
without trusting `xtrata.xyz`.

Canonical public mainnet target:

`SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-1`

Fallback source chain:

1. `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0`
2. `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1`

## 20-line example

```ts
import { createXtrataReadClient, createXtrataReconstructionSources } from '@xtrata/sdk/simple';
import { reconstructXtrataInscription } from '@xtrata/reconstruction';

const contractId = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-1';
const senderAddress = contractId.split('.')[0];
const core = createXtrataReadClient({ contractId, senderAddress });
const legacy = createXtrataReadClient({
  contractId: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0',
  senderAddress
});

const result = await reconstructXtrataInscription({
  tokenId: 287n,
  sources: createXtrataReconstructionSources(core, [legacy]),
  strict: true,
  maxNodes: 64
});

console.log({
  tokenId: result.tokenId.toString(),
  mimeType: result.mimeType,
  bytes: result.bytes.length,
  tokenUri: result.tokenUri,
  finalHash: result.verification.expectedHashHex,
  chunkSource: result.diagnostics.chunkSourceId,
  dependencies: result.dependencies.nodes.map(String)
});
```

This example uses public Stacks read-only calls through the SDK defaults. To
avoid public rate limits, pass `apiBaseUrls` into `createXtrataReadClient`.
Platform adapters can also pass `isTerminalReadError` into
`reconstructXtrataInscription` so quota exhaustion stops immediately instead
of triggering fallback reads.

The first-party Cloudflare runtime uses the same reconstruction engine and
clamps cold-cache `get-chunk-batch` reads to 30 chunks. Production smoke checks
should confirm the response headers expose `X-Xtrata-Runtime-Cache: MISS` on a
purged token, `X-Xtrata-Runtime-Read-Batch-Size: 30`, low fallback/single-read
counts, and `X-Xtrata-Runtime-Cache: HIT` on the repeat request.

For the full reconstruction rules, see
[`docs/reconstruction-spec.md`](../reconstruction-spec.md).

## CLI proof

From the repo root:

```sh
npm run reconstruct -- 287 /tmp/xtrata-287.html
```

The CLI prints the requested contract, metadata source, chunk source, fallback
status, read mode, byte count, MIME type, token URI, dependency count, and
verified hash.
