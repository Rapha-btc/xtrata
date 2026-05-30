# @xtrata/reconstruction

Deterministic reconstruction helpers for rebuilding Xtrata inscription bytes
from public chain data.

Core helpers:
- Chunk assembly
- Incremental hash verification
- Strict verification assertions
- Dependency graph resolution
- End-to-end reconstruction primitive

Current packaging mode:
- Source of truth: `src/`
- Build output: `dist/`
- Package entrypoint resolves from `dist/index.js`

## Strict reconstruction

```ts
import { createXtrataReadClient } from '@xtrata/sdk/simple';
import { reconstructInscription } from '@xtrata/reconstruction';

const core = createXtrataReadClient({
  contractId: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-1',
  senderAddress: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X'
});

const result = await reconstructInscription(287n, core, { strict: true });
console.log(result.mimeType, result.bytes.length, result.verification.expectedHashHex);
```

`strict: true` throws `ReconstructionVerificationError` if the rebuilt payload
does not match the on-chain `final-hash`.

Full rules: `docs/reconstruction-spec.md` in the main repository.
