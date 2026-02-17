# SDK Quickstart: First 30 Minutes

Audience: first-time integrators who want a reliable path from zero setup to a valid Xtrata workflow plan.

Goal after 30 minutes:
- read live protocol state
- generate a safe write workflow plan
- understand how to recover from common wallet failures

## 0) Prerequisites (2 minutes)

You need:
- Node.js 20+
- npm 10+
- a project folder

Create a project:

```bash
mkdir xtrata-sdk-demo
cd xtrata-sdk-demo
npm init -y
npm install @xtrata/sdk @xtrata/reconstruction
```

## 1) Confirm SDK install (2 minutes)

Create `check-sdk.mjs`:

```js
import { createSimpleSdk } from '@xtrata/sdk/simple';

const sdk = createSimpleSdk({
  senderAddress: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
  xtrataContractId: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0'
});

console.log(Boolean(sdk.xtrata));
```

Run:

```bash
node check-sdk.mjs
```

Expected output:
- `true`

## 2) Read live protocol state (8 minutes)

Create `read-only.mjs`:

```js
import { createXtrataReadClient } from '@xtrata/sdk/simple';

const client = createXtrataReadClient({
  contractId: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0',
  senderAddress: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X'
});

const [nextTokenId, feeUnit, paused] = await Promise.all([
  client.getNextTokenId(),
  client.getFeeUnit(),
  client.isPaused()
]);

console.log({
  nextTokenId: nextTokenId.toString(),
  feeUnitMicroStx: feeUnit.toString(),
  paused
});
```

Run:

```bash
node read-only.mjs
```

If this fails due to network/rate limits, configure your API routing as shown in `docs/sdk/quickstart-read-only.md`.

## 3) Build a safe mint workflow plan (10 minutes)

Create `workflow.mjs`:

```js
import { chunkBytes, computeExpectedHash } from '@xtrata/sdk/mint';
import { buildCoreMintWorkflowPlan } from '@xtrata/sdk/workflows';

const payloadBytes = new TextEncoder().encode('xtrata-sdk-demo');
const expectedHash = computeExpectedHash(chunkBytes(payloadBytes));

const plan = buildCoreMintWorkflowPlan({
  contract: {
    address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
    contractName: 'xtrata-v2-1-0',
    network: 'mainnet'
  },
  senderAddress: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
  payloadBytes,
  expectedHash,
  mimeType: 'text/plain',
  tokenUri: 'ipfs://xtrata-sdk-demo',
  mintPrice: 1_000_000n,
  protocolFeeMicroStx: 100_000n
});

console.log({
  nextAction: plan.flow.nextAction,
  beginFunction: plan.beginCall.functionName,
  chunkBatchCalls: plan.addChunkBatchCalls.length,
  sealFunction: plan.sealCall.functionName,
  safetySummary: plan.safety.summaryLines
});
```

Run:

```bash
node workflow.mjs
```

Expected:
- `begin-inscription` plan
- one or more chunk batch calls
- `seal-inscription` plan
- deterministic max-spend summary lines

## 4) Add wallet-failure recovery guidance (5 minutes)

Create `recovery.mjs`:

```js
import { buildMintRecoveryGuide } from '@xtrata/sdk/safe';

const guide = buildMintRecoveryGuide({
  errorMessage: 'Bad nonce supplied for transaction',
  attemptedStep: 'seal',
  beginConfirmed: true,
  uploadedChunkBatches: 3,
  totalChunkBatches: 3,
  sealConfirmed: false
});

console.log(guide);
```

Run:

```bash
node recovery.mjs
```

Use `recommendedAction` directly in your UI for human-readable recovery instructions.

## 5) What to do next

1. Use `docs/sdk/quickstart-simple-mode.md` for broader read-only coverage.
2. Use `docs/sdk/quickstart-workflows.md` for collection + market workflows.
3. Use `docs/sdk/troubleshooting.md` when integration errors appear.
4. Use `docs/sdk/migration-guide.md` when upgrading SDK versions or moving to collection-mint v1.2 policy.
