// Campaign starter: live collection status + workflow-based mint plans.
import { createCollectionReadClient } from '@xtrata/sdk/simple';
import { chunkBytes, computeExpectedHash } from '@xtrata/sdk/mint';
import { buildCollectionMintWorkflowPlan } from '@xtrata/sdk/workflows';

const senderAddress = process.env.XTRATA_SENDER || 'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7';
const offlineMode = process.env.XTRATA_OFFLINE === '1';
const collectionContractId =
  process.env.XTRATA_COLLECTION_CONTRACT ||
  'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7.xtrata-collection-ahv0-34f95221';

const collection = createCollectionReadClient({
  contractId: collectionContractId,
  senderAddress
});

let effectiveOfflineMode = offlineMode;
let snapshot = {
  mintedCount: 0n,
  remaining: 0n,
  live: false,
  effectiveMintPrice: 1_000_000n
};

if (!offlineMode) {
  try {
    snapshot = await collection.getSnapshot();
  } catch (error) {
    effectiveOfflineMode = true;
    console.log({
      warning:
        'Collection snapshot fetch failed. Falling back to offline planning output.',
      reason: error instanceof Error ? error.message : String(error)
    });
  }
}

console.log({
  mode: effectiveOfflineMode ? 'offline' : 'network',
  minted: snapshot.mintedCount.toString(),
  remaining: snapshot.remaining.toString(),
  live: snapshot.live,
  effectiveMintPriceMicroStx: snapshot.effectiveMintPrice.toString()
});

const payloadBytes = new TextEncoder().encode('campaign-demo');
const expectedHash = computeExpectedHash(chunkBytes(payloadBytes));

const workflowPlan = buildCollectionMintWorkflowPlan({
  contract: collection.contract,
  xtrataContract: {
    address: process.env.XTRATA_CORE_ADDRESS || 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
    contractName: process.env.XTRATA_CORE_NAME || 'xtrata-v2-1-0',
    network: collection.contract.network
  },
  senderAddress,
  payloadBytes,
  expectedHash,
  mimeType: 'text/plain',
  tokenUri: 'ipfs://campaign-demo',
  mintPrice: snapshot.effectiveMintPrice,
  protocolFeeMicroStx: 100_000n
});

console.log({
  safetySummary: workflowPlan.safety.summaryLines,
  nextAction: workflowPlan.flow.nextAction,
  progressPercent: workflowPlan.flow.progressPercent,
  beginFunction: workflowPlan.beginCall.functionName,
  chunkBatchCalls: workflowPlan.addChunkBatchCalls.length,
  sealFunction: workflowPlan.sealCall.functionName
});

console.log('Built using Xtrata Protocol');
