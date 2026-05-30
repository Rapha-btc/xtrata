# @xtrata/reconstruction

Deterministic reconstruction helpers for rebuilding Xtrata inscription bytes
from public chain data.

Core helpers:

- Chunk assembly
- Incremental hash verification
- Strict verification assertions
- Batch-first chunk reads with per-chunk fallback
- Ordered fallback source reconstruction for migrated content
- Provenance and read diagnostics
- Dependency graph resolution
- End-to-end reconstruction primitive

Current packaging mode:

- Source of truth: `src/`
- Build output: `dist/`
- Package entrypoint resolves from `dist/index.js`

## Strict reconstruction

```ts
import { createXtrataReadClient, createXtrataReconstructionSources } from '@xtrata/sdk/simple';
import { reconstructXtrataInscription } from '@xtrata/reconstruction';

const core = createXtrataReadClient({
  contractId: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-1',
  senderAddress: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X'
});
const legacy = createXtrataReadClient({
  contractId: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0',
  senderAddress: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X'
});

const result = await reconstructXtrataInscription({
  tokenId: 287n,
  sources: createXtrataReconstructionSources(core, [legacy]),
  strict: true,
  batchSize: 8,
  concurrency: 4
});

console.log(result.mimeType, result.bytes.length, result.diagnostics.chunkSourceId);
```

`strict: true` throws `ReconstructionVerificationError` if the rebuilt payload
does not match the on-chain `final-hash`. It also rejects unsealed metadata
when that flag is exposed.

`batchSize` and `concurrency` are optional. `batchSize` is clamped to the
production ceiling of 30 chunks per read batch. These settings let production
callers keep read-only reconstruction fast while preserving deterministic chunk
order and strict hash verification. Platform adapters can also provide
`isTerminalReadError` to stop immediately when retry or per-chunk fallback
would only amplify an exhausted upstream quota.

Full rules: `docs/reconstruction-spec.md` in the main repository.
