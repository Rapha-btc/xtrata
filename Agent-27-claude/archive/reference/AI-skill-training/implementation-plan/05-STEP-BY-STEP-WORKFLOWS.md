# 05 — Step-by-Step Workflows

Complete end-to-end walkthroughs for every major Xtrata operation.

---

## Workflow 1: Inscribe a File (Mint)

This is the most common operation. Inscribes any file on-chain and mints
an NFT representing ownership.

### Prerequisites

- Stacks wallet with sufficient STX (see fee estimates in `04-FEE-MODEL.md`)
- File data as `Uint8Array`
- MIME type of the file (e.g., `"image/png"`, `"text/html"`, `"audio/mpeg"`)

### Route Selection Rules

- Use the helper route when chunk count is `1..30` and there is no upload state to resume.
- Use the staged route for resumable uploads, files above 30 chunks, or helper-disabled environments.
- Recursive mints follow the same split:
  - helper route -> `mint-small-single-tx-recursive`
  - staged route -> `seal-recursive`

### Helper Single-Tx Example

```javascript
import {
  makeContractCall,
  broadcastTransaction,
  callReadOnlyFunction,
  bufferCV,
  contractPrincipalCV,
  principalCV,
  uintCV,
  stringAsciiCV,
  listCV,
  AnchorMode,
  PostConditionMode,
  FungibleConditionCode,
  makeStandardSTXPostCondition,
  cvToJSON
} from '@stacks/transactions';

const CONTRACT_ADDRESS = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const CONTRACT_NAME = 'xtrata-v2-1-0';
const HELPER_CONTRACT_NAME = 'xtrata-small-mint-v1-0';
const MAX_SMALL_MINT_CHUNKS = 30;

async function mintSmallRecursive({
  expectedHash,
  mimeType,
  totalSize,
  chunks,
  tokenUri,
  dependencies,
  senderAddress,
  senderKey,
  feeUnitMicroStx,
  network
}) {
  if (chunks.length < 1 || chunks.length > MAX_SMALL_MINT_CHUNKS) {
    throw new Error('Helper route only supports 1..30 chunks');
  }

  const uploadState = await callReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'get-upload-state',
    functionArgs: [bufferCV(expectedHash), principalCV(senderAddress)],
    senderAddress,
    network
  });
  if (cvToJSON(uploadState).value !== null) {
    throw new Error('Active upload state detected; use staged route instead');
  }

  const totalChunks = BigInt(chunks.length);
  const sealFee = feeUnitMicroStx * (1n + ((totalChunks + 49n) / 50n));
  const spendCap = feeUnitMicroStx + sealFee;

  const tx = await makeContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: HELPER_CONTRACT_NAME,
    functionName: 'mint-small-single-tx-recursive',
    functionArgs: [
      contractPrincipalCV(CONTRACT_ADDRESS, CONTRACT_NAME),
      bufferCV(expectedHash),
      stringAsciiCV(mimeType),
      uintCV(totalSize),
      listCV(chunks.map((chunk) => bufferCV(chunk))),
      stringAsciiCV(tokenUri),
      listCV(dependencies.map((id) => uintCV(id)))
    ],
    senderKey,
    network,
    postConditions: [
      makeStandardSTXPostCondition(
        senderAddress,
        FungibleConditionCode.LessEqual,
        spendCap
      )
    ],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });

  return broadcastTransaction(tx, network);
}
```

### Staged Fallback Example

```javascript
import { sha256 } from '@noble/hashes/sha256';
import {
  makeContractCall,
  broadcastTransaction,
  callReadOnlyFunction,
  bufferCV,
  principalCV,
  uintCV,
  stringAsciiCV,
  listCV,
  AnchorMode,
  PostConditionMode,
  FungibleConditionCode,
  makeStandardSTXPostCondition,
  cvToJSON
} from '@stacks/transactions';
import { StacksMainnet } from '@stacks/network';

// --- Configuration ---
const CONTRACT_ADDRESS = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const CONTRACT_NAME = 'xtrata-v2-1-0';
const CHUNK_SIZE = 16_384;
const MAX_BATCH_SIZE = 50;
const TX_DELAY_MS = 5_000;
const DEFAULT_TOKEN_URI = 'https://xvgh3sbdkivby4blejmripeiyjuvji3d4tycym6hgaxalescegjq.arweave.net/vUx9yCNSKhxwKyJZFDyIwmlUo2Pk8CwzxzAuBZJCIZM';

const network = new StacksMainnet();

// --- Step 1: Prepare the data ---

function chunkBytes(data) {
  const chunks = [];
  for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
    chunks.push(data.slice(offset, offset + CHUNK_SIZE));
  }
  return chunks;
}

function batchChunks(chunks) {
  const batches = [];
  for (let offset = 0; offset < chunks.length; offset += MAX_BATCH_SIZE) {
    batches.push(chunks.slice(offset, offset + MAX_BATCH_SIZE));
  }
  return batches;
}

function computeExpectedHash(chunks) {
  let runningHash = new Uint8Array(32); // 32 zero bytes
  for (const chunk of chunks) {
    const combined = new Uint8Array(runningHash.length + chunk.length);
    combined.set(runningHash, 0);
    combined.set(chunk, runningHash.length);
    runningHash = sha256(combined);
  }
  return runningHash;
}

// --- Step 2: Check for deduplication ---

async function checkExistingInscription(expectedHash, senderAddress) {
  const result = await callReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'get-id-by-hash',
    functionArgs: [bufferCV(expectedHash)],
    senderAddress,
    network
  });
  const json = cvToJSON(result);
  if (json.value) {
    return BigInt(json.value.value); // Returns existing token ID
  }
  return null; // Content not yet inscribed
}

// --- Step 3: Query current fee unit ---

async function getFeeUnit(senderAddress) {
  const result = await callReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'get-fee-unit',
    functionArgs: [],
    senderAddress,
    network
  });
  const json = cvToJSON(result);
  return BigInt(json.value.value);
}

// --- Step 4: Begin inscription ---

async function beginInscription({
  expectedHash, mime, totalSize, totalChunks,
  senderAddress, senderKey, feeUnitMicroStx
}) {
  const tx = await makeContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'begin-or-get',
    functionArgs: [
      bufferCV(expectedHash),
      stringAsciiCV(mime),
      uintCV(totalSize),
      uintCV(totalChunks)
    ],
    senderKey,
    network,
    postConditions: [
      makeStandardSTXPostCondition(
        senderAddress,
        FungibleConditionCode.LessEqual,
        feeUnitMicroStx
      )
    ],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });

  const result = await broadcastTransaction(tx, network);
  if (result.error) {
    throw new Error(`Begin failed: ${result.error} - ${result.reason}`);
  }
  return result.txid;
}

// --- Step 5: Upload chunks ---

async function uploadChunks({ expectedHash, batches, senderKey }) {
  const txids = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`Uploading batch ${i + 1}/${batches.length} (${batch.length} chunks)`);

    const tx = await makeContractCall({
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
      functionName: 'add-chunk-batch',
      functionArgs: [
        bufferCV(expectedHash),
        listCV(batch.map(chunk => bufferCV(chunk)))
      ],
      senderKey,
      network,
      postConditions: [],
      postConditionMode: PostConditionMode.Deny,
      anchorMode: AnchorMode.Any
    });

    const result = await broadcastTransaction(tx, network);
    if (result.error) {
      throw new Error(`Chunk upload failed: ${result.error} - ${result.reason}`);
    }
    txids.push(result.txid);

    // Wait between transactions to avoid nonce conflicts
    if (i < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, TX_DELAY_MS));
    }
  }

  return txids;
}

// --- Step 6: Seal inscription ---

async function sealInscription({
  expectedHash, tokenUri, totalChunks,
  senderAddress, senderKey, feeUnitMicroStx
}) {
  const batchSize = 50n;
  const feeBatches = (totalChunks + batchSize - 1n) / batchSize;
  const sealFee = feeUnitMicroStx * (1n + feeBatches);

  const tx = await makeContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'seal-inscription',
    functionArgs: [
      bufferCV(expectedHash),
      stringAsciiCV(tokenUri)
    ],
    senderKey,
    network,
    postConditions: [
      makeStandardSTXPostCondition(
        senderAddress,
        FungibleConditionCode.LessEqual,
        sealFee
      )
    ],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });

  const result = await broadcastTransaction(tx, network);
  if (result.error) {
    throw new Error(`Seal failed: ${result.error} - ${result.reason}`);
  }
  return result.txid;
}

// --- Step 7: Verify success ---

async function waitForConfirmation(txid) {
  const url = `${network.coreApiUrl}/extended/v1/tx/${txid}`;
  const maxAttempts = 60; // ~10 minutes at 10-second intervals
  const pollInterval = 10_000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(url);
      const data = await response.json();

      if (data.tx_status === 'success') {
        return { success: true, data };
      }
      if (data.tx_status === 'abort_by_response' || data.tx_status === 'abort_by_post_condition') {
        return { success: false, reason: data.tx_status, data };
      }
    } catch (e) {
      // Network error, continue polling
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Transaction ${txid} did not confirm within timeout`);
}

// --- Complete orchestration ---

async function inscribeFile({
  fileData,        // Uint8Array
  mimeType,        // string, e.g. "image/png"
  tokenUri,        // string (optional, defaults to standard URI)
  senderAddress,   // string
  senderKey        // string (hex private key)
}) {
  tokenUri = tokenUri || DEFAULT_TOKEN_URI;

  // 1. Chunk and hash
  const chunks = chunkBytes(fileData);
  const expectedHash = computeExpectedHash(chunks);
  const batches = batchChunks(chunks);
  const totalChunks = BigInt(chunks.length);
  const totalSize = BigInt(fileData.length);

  console.log(`File: ${mimeType}, ${fileData.length} bytes, ${chunks.length} chunks, ${batches.length} batches`);

  // 2. Check dedup
  const existingId = await checkExistingInscription(expectedHash, senderAddress);
  if (existingId !== null) {
    console.log(`Content already inscribed as token ID: ${existingId}`);
    return { tokenId: existingId, alreadyExisted: true };
  }

  // 3. Get fee unit
  const feeUnitMicroStx = await getFeeUnit(senderAddress);
  console.log(`Fee unit: ${Number(feeUnitMicroStx) / 1_000_000} STX`);

  // 4. Begin
  console.log('Beginning inscription...');
  const beginTxid = await beginInscription({
    expectedHash, mime: mimeType, totalSize, totalChunks,
    senderAddress, senderKey, feeUnitMicroStx
  });
  console.log(`Begin TX: ${beginTxid}`);

  // Wait for begin to confirm before uploading chunks
  const beginResult = await waitForConfirmation(beginTxid);
  if (!beginResult.success) {
    throw new Error(`Begin transaction failed: ${beginResult.reason}`);
  }

  // 5. Upload chunks
  console.log('Uploading chunks...');
  const chunkTxids = await uploadChunks({ expectedHash, batches, senderKey });

  // Wait for last chunk upload to confirm
  const lastChunkResult = await waitForConfirmation(chunkTxids[chunkTxids.length - 1]);
  if (!lastChunkResult.success) {
    throw new Error(`Chunk upload failed: ${lastChunkResult.reason}`);
  }

  // 6. Seal
  console.log('Sealing inscription...');
  const sealTxid = await sealInscription({
    expectedHash, tokenUri, totalChunks,
    senderAddress, senderKey, feeUnitMicroStx
  });
  console.log(`Seal TX: ${sealTxid}`);

  // 7. Verify
  const sealResult = await waitForConfirmation(sealTxid);
  if (!sealResult.success) {
    throw new Error(`Seal transaction failed: ${sealResult.reason}`);
  }

  console.log('Inscription sealed successfully!');
  return { sealTxid, beginTxid, chunkTxids, alreadyExisted: false };
}
```

For a complete dual-route example, use
`AI-skill-training/implementation-plan/scripts/xtrata-mint-example.js`.

### Usage

```javascript
import { readFileSync } from 'fs';

const fileData = new Uint8Array(readFileSync('./my-image.png'));

const result = await inscribeFile({
  fileData,
  mimeType: 'image/png',
  senderAddress: 'SP1YOUR_ADDRESS_HERE',
  senderKey: 'your-private-key-hex'
});
```

---

## Workflow 2: Transfer an Inscription

```javascript
async function transferInscription({
  tokenId,       // bigint
  sender,        // string (must be current owner)
  recipient,     // string
  senderKey,     // string
}) {
  const tx = await makeContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'transfer',
    functionArgs: [
      uintCV(tokenId),
      principalCV(sender),
      principalCV(recipient)
    ],
    senderKey,
    network,
    postConditions: [],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });

  const result = await broadcastTransaction(tx, network);
  if (result.error) {
    throw new Error(`Transfer failed: ${result.error} - ${result.reason}`);
  }

  const confirmation = await waitForConfirmation(result.txid);
  if (!confirmation.success) {
    throw new Error(`Transfer transaction failed: ${confirmation.reason}`);
  }

  return result.txid;
}
```

### Usage

```javascript
await transferInscription({
  tokenId: 42n,
  sender: 'SP1SENDER_ADDRESS',
  recipient: 'SP1RECIPIENT_ADDRESS',
  senderKey: 'sender-private-key-hex'
});
```

---

## Workflow 3: Query Inscription State

### Get Inscription Metadata

```javascript
async function getInscriptionInfo(tokenId, senderAddress) {
  const result = await callReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'get-inscription-meta',
    functionArgs: [uintCV(tokenId)],
    senderAddress,
    network
  });

  const json = cvToJSON(result);
  if (!json.value) return null;

  const meta = json.value.value;
  return {
    owner: meta.owner.value,
    creator: meta.creator.value,
    mimeType: meta['mime-type'].value,
    totalSize: BigInt(meta['total-size'].value),
    totalChunks: BigInt(meta['total-chunks'].value),
    sealed: meta.sealed.value,
    finalHash: meta['final-hash'].value
  };
}
```

### Get Token Owner

```javascript
async function getOwner(tokenId, senderAddress) {
  const result = await callReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'get-owner',
    functionArgs: [uintCV(tokenId)],
    senderAddress,
    network
  });

  const json = cvToJSON(result);
  return json.value?.value?.value ?? null;
}
```

### Enumerate All Minted Tokens

```javascript
async function listMintedTokens(senderAddress) {
  // Get total minted count
  const countResult = await callReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'get-minted-count',
    functionArgs: [],
    senderAddress,
    network
  });
  const count = Number(cvToJSON(countResult).value.value);

  // Enumerate by mint order
  const tokenIds = [];
  for (let i = 0; i < count; i++) {
    const idResult = await callReadOnlyFunction({
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
      functionName: 'get-minted-id',
      functionArgs: [uintCV(BigInt(i))],
      senderAddress,
      network
    });
    const json = cvToJSON(idResult);
    if (json.value) {
      tokenIds.push(BigInt(json.value.value));
    }
  }

  return tokenIds;
}
```

### Read Inscription Content

```javascript
async function readContent(tokenId, senderAddress) {
  const meta = await getInscriptionInfo(tokenId, senderAddress);
  if (!meta) throw new Error('Inscription not found');

  const totalChunks = Number(meta.totalChunks);
  const allChunks = [];

  // Read chunks in batches of 50
  for (let start = 0; start < totalChunks; start += 50) {
    const end = Math.min(start + 50, totalChunks);
    const indexes = [];
    for (let i = start; i < end; i++) {
      indexes.push(uintCV(BigInt(i)));
    }

    const result = await callReadOnlyFunction({
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
      functionName: 'get-chunk-batch',
      functionArgs: [uintCV(tokenId), listCV(indexes)],
      senderAddress,
      network
    });

    const json = cvToJSON(result);
    for (const item of json.value) {
      if (item.value) {
        allChunks.push(Buffer.from(item.value.value.slice(2), 'hex'));
      }
    }
  }

  // Concatenate all chunks
  const content = Buffer.concat(allChunks);
  return { content, mimeType: meta.mimeType };
}
```

---

## Workflow 4: Recursive Inscription

Seal an inscription that depends on other inscriptions.

```javascript
async function inscribeRecursive({
  fileData,
  mimeType,
  tokenUri,
  dependencies,    // bigint[] — token IDs this inscription depends on
  senderAddress,
  senderKey
}) {
  // Same steps 1-5 as Workflow 1 (chunk, hash, begin, upload)
  const chunks = chunkBytes(fileData);
  const expectedHash = computeExpectedHash(chunks);
  const batches = batchChunks(chunks);
  const totalChunks = BigInt(chunks.length);
  const totalSize = BigInt(fileData.length);
  const feeUnitMicroStx = await getFeeUnit(senderAddress);

  // Begin
  const beginTxid = await beginInscription({
    expectedHash, mime: mimeType, totalSize, totalChunks,
    senderAddress, senderKey, feeUnitMicroStx
  });
  await waitForConfirmation(beginTxid);

  // Upload chunks
  const chunkTxids = await uploadChunks({ expectedHash, batches, senderKey });
  await waitForConfirmation(chunkTxids[chunkTxids.length - 1]);

  // Seal with dependencies (uses seal-recursive instead of seal-inscription)
  const batchSize = 50n;
  const feeBatches = (totalChunks + batchSize - 1n) / batchSize;
  const sealFee = feeUnitMicroStx * (1n + feeBatches);

  const tx = await makeContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'seal-recursive',
    functionArgs: [
      bufferCV(expectedHash),
      stringAsciiCV(tokenUri || DEFAULT_TOKEN_URI),
      listCV(dependencies.map(dep => uintCV(dep)))
    ],
    senderKey,
    network,
    postConditions: [
      makeStandardSTXPostCondition(
        senderAddress,
        FungibleConditionCode.LessEqual,
        sealFee
      )
    ],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });

  const result = await broadcastTransaction(tx, network);
  if (result.error) {
    throw new Error(`Recursive seal failed: ${result.error}`);
  }

  const confirmation = await waitForConfirmation(result.txid);
  if (!confirmation.success) {
    throw new Error(`Recursive seal failed: ${confirmation.reason}`);
  }

  return result.txid;
}
```

### Usage

```javascript
// Inscribe an HTML page that references inscriptions #100, #101, and #102
await inscribeRecursive({
  fileData: new TextEncoder().encode('<html>...</html>'),
  mimeType: 'text/html',
  dependencies: [100n, 101n, 102n],
  senderAddress: 'SP1YOUR_ADDRESS',
  senderKey: 'your-key-hex'
});
```

---

## Workflow 5: Check Upload State (Resume)

If an upload was interrupted, check its state and resume:

```javascript
async function checkUploadState(expectedHash, ownerAddress, senderAddress) {
  const result = await callReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'get-upload-state',
    functionArgs: [bufferCV(expectedHash), principalCV(ownerAddress)],
    senderAddress,
    network
  });

  const json = cvToJSON(result);
  if (!json.value) return null;

  const state = json.value.value;
  return {
    mimeType: state['mime-type'].value,
    totalSize: BigInt(state['total-size'].value),
    totalChunks: BigInt(state['total-chunks'].value),
    currentIndex: BigInt(state['current-index'].value),
    runningHash: state['running-hash'].value
  };
}

// Resume: skip already-uploaded chunks
async function resumeUpload({ expectedHash, chunks, senderAddress, senderKey }) {
  const state = await checkUploadState(expectedHash, senderAddress, senderAddress);

  if (!state) {
    console.log('No active upload session found — start from beginning');
    return;
  }

  const uploadedCount = Number(state.currentIndex);
  const remainingChunks = chunks.slice(uploadedCount);
  console.log(`Resuming from chunk ${uploadedCount}, ${remainingChunks.length} remaining`);

  const batches = batchChunks(remainingChunks);
  await uploadChunks({ expectedHash, batches, senderKey });
}
```
