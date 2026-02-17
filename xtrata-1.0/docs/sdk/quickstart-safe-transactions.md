# SDK Quickstart: Safe Transactions

Use `@xtrata/sdk/safe` to generate deterministic spend caps, post-conditions, and guided flow status.

## Core mint safety bundle

```ts
import { createCoreMintSafetyBundle } from '@xtrata/sdk/safe';

const safety = createCoreMintSafetyBundle({
  sender: 'SP...WALLET',
  mintPrice: 1_000_000n,
  protocolFeeMicroStx: 100_000n,
  totalChunks: 120
});

console.log(safety.summaryLines);
// Begin max spend: ...
// Seal max spend: ...
// Max combined spend: ...

// Use these in wallet transaction requests:
const beginPostConditions = safety.beginPostConditions;
const sealPostConditions = safety.sealPostConditions;
```

## Collection mint safety bundle

```ts
import { createCollectionMintSafetyBundle } from '@xtrata/sdk/safe';

const safety = createCollectionMintSafetyBundle({
  sender: 'SP...WALLET',
  mintPrice: 1_000_000n,
  protocolFeeMicroStx: 100_000n,
  totalChunks: 120
});

// begin cap includes collection mint price + deterministic protocol fee
console.log(safety.beginCapMicroStx, safety.sealCapMicroStx);
```

## Guided flow states (traffic-light ready)

```ts
import { buildGuidedMintFlow } from '@xtrata/sdk/safe';

const flow = buildGuidedMintFlow({
  beginConfirmed: true,
  uploadedChunkBatches: 2,
  totalChunkBatches: 5,
  sealConfirmed: false
});

console.log(flow.steps);
console.log(flow.nextAction); // "Continue chunk uploads."
console.log(flow.progressPercent);
```

This helper is designed for clear UX messaging and resume-friendly interfaces.

## Recovery guidance for failed wallet steps

```ts
import { buildMintRecoveryGuide } from '@xtrata/sdk/safe';

const recovery = buildMintRecoveryGuide({
  errorMessage: 'Bad nonce supplied for transaction',
  attemptedStep: 'seal',
  beginConfirmed: true,
  uploadedChunkBatches: 3,
  totalChunkBatches: 3,
  sealConfirmed: false
});

console.log(recovery.failedStep); // "seal"
console.log(recovery.failureType); // "bad-nonce"
console.log(recovery.recommendedAction);
```
