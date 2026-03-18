# 03 — Transaction Construction

This document covers how to build, sign, and broadcast Stacks transactions
for every Xtrata operation.

## Contract Target

All transactions target the current production contract:

```
Address:       SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X
Contract name: xtrata-v2-1-0
Full ID:       SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0
```

## Transaction Type

Every Xtrata operation is a **contract-call** transaction on Stacks. This means
you call a specific public function on the deployed contract with typed
arguments (Clarity values).

## Required Packages

```bash
npm install @stacks/transactions @stacks/network @noble/hashes
```

```javascript
import {
  callReadOnlyFunction,
  makeContractCall,
  broadcastTransaction,
  bufferCV,
  contractPrincipalCV,
  uintCV,
  stringAsciiCV,
  listCV,
  principalCV,
  tupleCV,
  cvToJSON,
  AnchorMode,
  PostConditionMode,
  FungibleConditionCode,
  makeStandardSTXPostCondition,
  getNonce
} from '@stacks/transactions';
import { StacksMainnet, StacksTestnet } from '@stacks/network';
```

## Network Setup

```javascript
// Mainnet
const network = new StacksMainnet();

// Testnet
const network = new StacksTestnet();

// Custom API endpoint
const network = new StacksMainnet({ url: 'https://stacks-node-api.mainnet.stacks.co' });
```

### API Endpoints

| Network | Primary | Fallback |
|---------|---------|----------|
| Mainnet | `https://stacks-node-api.mainnet.stacks.co` | `https://api.mainnet.hiro.so` |
| Testnet | `https://stacks-node-api.testnet.stacks.co` | `https://api.testnet.hiro.so` |

---

## Contract Constants for Transaction Building

```javascript
const CONTRACT_ADDRESS = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const CONTRACT_NAME = 'xtrata-v2-1-0';
const HELPER_CONTRACT_NAME = 'xtrata-small-mint-v1-0';
const MAX_SMALL_MINT_CHUNKS = 30;
```

---

## Mint Route Selection

Before constructing a mint transaction, determine whether the file should use
the helper route or the staged route.

```javascript
async function shouldUseSmallMintHelper({
  expectedHash,
  owner,
  totalChunks,
  senderAddress,
  network
}) {
  if (totalChunks < 1n || totalChunks > BigInt(MAX_SMALL_MINT_CHUNKS)) {
    return false;
  }

  const uploadState = await callReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'get-upload-state',
    functionArgs: [bufferCV(expectedHash), principalCV(owner)],
    senderAddress,
    network
  });

  return cvToJSON(uploadState).value === null;
}
```

Rules:
- Use helper only for fresh uploads with `1..30` chunks.
- Use staged flow for resumable uploads or files above 30 chunks.
- Helper spend cap must cover `begin + seal` in one deny-mode transaction.

---

## Transaction: mint-small-single-tx

This helper call combines `begin-or-get`, `add-chunk-batch`, and
`seal-inscription` into one wallet transaction.

```javascript
async function buildSmallMintSingleTxCall({
  expectedHash,
  mime,
  totalSize,
  chunks,
  tokenUri,
  senderAddress,
  senderKey,
  feeUnitMicroStx,
  network
}) {
  const totalChunks = BigInt(chunks.length);
  const sealFee = feeUnitMicroStx * (1n + ((totalChunks + 49n) / 50n));
  const spendCap = feeUnitMicroStx + sealFee;

  return makeContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: HELPER_CONTRACT_NAME,
    functionName: 'mint-small-single-tx',
    functionArgs: [
      contractPrincipalCV(CONTRACT_ADDRESS, CONTRACT_NAME),
      bufferCV(expectedHash),
      stringAsciiCV(mime),
      uintCV(totalSize),
      listCV(chunks.map((chunk) => bufferCV(chunk))),
      stringAsciiCV(tokenUri)
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
}
```

---

## Transaction: mint-small-single-tx-recursive

Same helper route, but seals the inscription with dependencies.

```javascript
async function buildSmallMintSingleTxRecursiveCall({
  expectedHash,
  mime,
  totalSize,
  chunks,
  tokenUri,
  dependencies,
  senderAddress,
  senderKey,
  feeUnitMicroStx,
  network
}) {
  const totalChunks = BigInt(chunks.length);
  const sealFee = feeUnitMicroStx * (1n + ((totalChunks + 49n) / 50n));
  const spendCap = feeUnitMicroStx + sealFee;

  return makeContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: HELPER_CONTRACT_NAME,
    functionName: 'mint-small-single-tx-recursive',
    functionArgs: [
      contractPrincipalCV(CONTRACT_ADDRESS, CONTRACT_NAME),
      bufferCV(expectedHash),
      stringAsciiCV(mime),
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
}
```

---

## Transaction: begin-or-get

Starts an inscription upload session (or returns existing token ID if content
is already sealed).

```javascript
async function buildBeginOrGetTx({
  expectedHash,     // Uint8Array (32 bytes)
  mime,             // string, e.g. "image/png"
  totalSize,        // bigint, total byte count
  totalChunks,      // bigint, number of chunks
  senderAddress,    // string, sender's STX address
  senderKey,        // string, sender's private key (hex)
  feeUnitMicroStx,  // bigint, current fee unit (query with get-fee-unit)
  network           // StacksNetwork
}) {
  const postConditions = [
    makeStandardSTXPostCondition(
      senderAddress,
      FungibleConditionCode.LessEqual,
      feeUnitMicroStx  // begin fee = 1 fee-unit
    )
  ];

  const txOptions = {
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
    postConditions,
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  };

  return makeContractCall(txOptions);
}
```

---

## Transaction: add-chunk-batch

Uploads a batch of chunks (up to 50). **No STX fee** is charged for chunk
uploads.

```javascript
async function buildAddChunkBatchTx({
  expectedHash,  // Uint8Array (32 bytes)
  chunks,        // Uint8Array[] (1-50 chunks)
  senderKey,     // string
  network        // StacksNetwork
}) {
  const txOptions = {
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'add-chunk-batch',
    functionArgs: [
      bufferCV(expectedHash),
      listCV(chunks.map(chunk => bufferCV(chunk)))
    ],
    senderKey,
    network,
    postConditions: [],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  };

  return makeContractCall(txOptions);
}
```

---

## Transaction: seal-inscription

Seals the inscription and mints the NFT.

```javascript
async function buildSealInscriptionTx({
  expectedHash,      // Uint8Array (32 bytes)
  tokenUri,          // string (max 256 chars)
  totalChunks,       // bigint
  senderAddress,     // string
  senderKey,         // string
  feeUnitMicroStx,   // bigint
  network            // StacksNetwork
}) {
  // Seal fee = feeUnit * (1 + ceil(totalChunks / 50))
  const batchSize = 50n;
  const feeBatches = (totalChunks + batchSize - 1n) / batchSize;
  const sealFee = feeUnitMicroStx * (1n + feeBatches);

  const postConditions = [
    makeStandardSTXPostCondition(
      senderAddress,
      FungibleConditionCode.LessEqual,
      sealFee
    )
  ];

  const txOptions = {
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'seal-inscription',
    functionArgs: [
      bufferCV(expectedHash),
      stringAsciiCV(tokenUri)
    ],
    senderKey,
    network,
    postConditions,
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  };

  return makeContractCall(txOptions);
}
```

---

## Transaction: seal-recursive

Seals with dependencies.

```javascript
async function buildSealRecursiveTx({
  expectedHash,      // Uint8Array (32 bytes)
  tokenUri,          // string (max 256 chars)
  dependencies,      // bigint[] (token IDs, max 50)
  totalChunks,       // bigint
  senderAddress,     // string
  senderKey,         // string
  feeUnitMicroStx,   // bigint
  network            // StacksNetwork
}) {
  const batchSize = 50n;
  const feeBatches = (totalChunks + batchSize - 1n) / batchSize;
  const sealFee = feeUnitMicroStx * (1n + feeBatches);

  const postConditions = [
    makeStandardSTXPostCondition(
      senderAddress,
      FungibleConditionCode.LessEqual,
      sealFee
    )
  ];

  const txOptions = {
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'seal-recursive',
    functionArgs: [
      bufferCV(expectedHash),
      stringAsciiCV(tokenUri),
      listCV(dependencies.map(dep => uintCV(dep)))
    ],
    senderKey,
    network,
    postConditions,
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  };

  return makeContractCall(txOptions);
}
```

---

## Transaction: seal-inscription-batch

Batch seal multiple inscriptions.

```javascript
async function buildSealBatchTx({
  items,             // Array<{ expectedHash: Uint8Array, tokenUri: string, totalChunks: bigint }>
  senderAddress,     // string
  senderKey,         // string
  feeUnitMicroStx,   // bigint
  network            // StacksNetwork
}) {
  // Total seal fee is sum of individual seal fees
  const batchSize = 50n;
  let totalSealFee = 0n;
  for (const item of items) {
    const feeBatches = (item.totalChunks + batchSize - 1n) / batchSize;
    totalSealFee += feeUnitMicroStx * (1n + feeBatches);
  }

  const postConditions = [
    makeStandardSTXPostCondition(
      senderAddress,
      FungibleConditionCode.LessEqual,
      totalSealFee
    )
  ];

  const txOptions = {
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'seal-inscription-batch',
    functionArgs: [
      listCV(items.map(item =>
        tupleCV({
          'hash': bufferCV(item.expectedHash),
          'token-uri': stringAsciiCV(item.tokenUri)
        })
      ))
    ],
    senderKey,
    network,
    postConditions,
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  };

  return makeContractCall(txOptions);
}
```

---

## Transaction: transfer

Transfer an inscription NFT to another wallet.

```javascript
async function buildTransferTx({
  tokenId,        // bigint
  sender,         // string (sender's address, must be current owner)
  recipient,      // string (recipient's address)
  senderKey,      // string
  network         // StacksNetwork
}) {
  const txOptions = {
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
  };

  return makeContractCall(txOptions);
}
```

---

## Broadcasting Transactions

After building any transaction, broadcast it to the network:

```javascript
async function broadcastTx(transaction, network) {
  const result = await broadcastTransaction(transaction, network);

  if (result.error) {
    throw new Error(`Broadcast failed: ${result.error} - ${result.reason}`);
  }

  return result.txid; // Transaction ID (hex string)
}
```

---

## Nonce Management

Each Stacks account has a nonce that increments with each transaction. For
sequential operations (begin → add-chunk-batch → seal), you must manage nonces:

```javascript
import { getNonce } from '@stacks/transactions';

// Get current nonce
const nonce = await getNonce(senderAddress, network);

// Set nonce explicitly on transaction options
txOptions.nonce = nonce;

// For sequential transactions, increment manually:
// TX 1: nonce = currentNonce
// TX 2: nonce = currentNonce + 1
// TX 3: nonce = currentNonce + 2
```

### Important: Inter-Transaction Delays

When sending multiple transactions in sequence (e.g., multiple `add-chunk-batch`
calls), wait at least **5 seconds** between broadcasts to avoid nonce
conflicts. The recommended delay is:

```javascript
const TX_DELAY_MS = 5000; // 5 seconds between transactions
```

---

## Transaction Fees (Network Fees)

Separate from the Xtrata protocol fees, every Stacks transaction also requires
a **network transaction fee** (gas). This is typically a small amount of STX.

The `@stacks/transactions` library estimates this automatically when you call
`makeContractCall`. You can also set it explicitly:

```javascript
txOptions.fee = 10000n; // 10,000 microSTX = 0.01 STX
```

For large `add-chunk-batch` calls with many chunks, the network fee may be
higher due to the larger transaction payload.

---

## Post-Condition Mode

Always use `PostConditionMode.Deny` to ensure the transaction cannot spend
more STX than the post-conditions allow. This protects the agent's wallet.

```javascript
postConditionMode: PostConditionMode.Deny
```

---

## Read-Only Calls (No Transaction Needed)

Read-only functions don't require signing or broadcasting. They're free:

```javascript
import { callReadOnlyFunction } from '@stacks/transactions';

async function callReadOnly(functionName, functionArgs, senderAddress, network) {
  return callReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName,
    functionArgs,
    senderAddress,
    network
  });
}

// Example: get inscription metadata
const result = await callReadOnly(
  'get-inscription-meta',
  [uintCV(1n)],
  senderAddress,
  network
);
```
