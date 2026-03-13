# 08 — Network & API Reference

## Stacks Networks

### Mainnet (Production)

| Property | Value |
|----------|-------|
| Network name | `mainnet` |
| Address prefix | `SP` |
| Core contract address | `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X` |
| Core contract name | `xtrata-v2-1-0` |
| Core full contract ID | `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0` |
| Helper contract name | `xtrata-small-mint-v1-0` |
| Helper full contract ID | `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-small-mint-v1-0` |

### Testnet (Development)

| Property | Value |
|----------|-------|
| Network name | `testnet` |
| Address prefix | `ST` |

---

## Stacks API Endpoints

### Primary Endpoints

| Network | Primary URL | Fallback URL |
|---------|------------|--------------|
| Mainnet | `https://stacks-node-api.mainnet.stacks.co` | `https://api.mainnet.hiro.so` |
| Testnet | `https://stacks-node-api.testnet.stacks.co` | `https://api.testnet.hiro.so` |

### Network Object Setup

```javascript
import { StacksMainnet, StacksTestnet } from '@stacks/network';

// Mainnet (default API)
const mainnet = new StacksMainnet();

// Mainnet (custom API)
const mainnet = new StacksMainnet({
  url: 'https://stacks-node-api.mainnet.stacks.co'
});

// Testnet
const testnet = new StacksTestnet();
```

---

## API Endpoints Used by Xtrata Operations

### Account Information

```
GET /v2/accounts/{address}
```

Returns account balance and nonce.

```json
{
  "balance": "0x00000000000F4240",
  "locked": "0x0000000000000000",
  "unlock_height": 0,
  "nonce": 42
}
```

**Note:** Balance is returned as a hex string in microSTX. Convert:
```javascript
const balanceMicroStx = BigInt(data.balance);
```

### Read-Only Contract Calls

```
POST /v2/contracts/call-read/{contract_address}/{contract_name}/{function_name}
Content-Type: application/json

{
  "sender": "SP1...",
  "arguments": ["0x0100000000000000000000000000000001"]
}
```

Arguments are hex-encoded serialized Clarity values. Use `@stacks/transactions`
to serialize:

```javascript
import { serializeCV, uintCV } from '@stacks/transactions';

const serializedArg = '0x' + Buffer.from(serializeCV(uintCV(1n))).toString('hex');
```

### Transaction Broadcast

```
POST /v2/transactions
Content-Type: application/octet-stream
Body: <serialized transaction bytes>
```

Returns:
```json
"0x<txid>"
```

Or on error:
```json
{
  "error": "transaction rejected",
  "reason": "ConflictingNonceInMempool",
  "reason_data": { ... }
}
```

### Transaction Status

```
GET /extended/v1/tx/{txid}
```

Returns:
```json
{
  "tx_id": "0x...",
  "tx_status": "success",
  "tx_type": "contract_call",
  "contract_call": {
    "contract_id": "SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0",
    "function_name": "seal-inscription",
    "function_args": [ ... ]
  },
  "tx_result": {
    "hex": "0x...",
    "repr": "(ok u123)"
  },
  "block_height": 123456,
  ...
}
```

**Status values:**

| Status | Meaning |
|--------|---------|
| `success` | Transaction confirmed and executed successfully |
| `pending` | Transaction in mempool, not yet confirmed |
| `abort_by_response` | Contract function returned an `(err ...)` value |
| `abort_by_post_condition` | Post-conditions were not met |
| `dropped_replace_by_fee` | Transaction replaced by another with higher fee |
| `dropped_stale_garbage_collect` | Transaction expired from mempool |

Helper route transactions still appear as standard `contract_call` writes. The
key difference is that the contract ID will be the helper contract and the
function name will be `mint-small-single-tx` or `mint-small-single-tx-recursive`.

### Token Metadata (SIP-016)

For metadata resolution, some indexers support:

```
GET /metadata/v1/nft/SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0/{token_id}
```

---

## Rate Limiting

### Hiro API Rate Limits

The Hiro Stacks API has rate limits. If you receive HTTP 429:

1. Read the `Retry-After` header if present
2. Otherwise, apply exponential backoff:
   - Start: 15 seconds
   - Escalate: 15s → 30s → 60s → 120s
   - Add random jitter (±25%)

### Best Practices

- **Batch reads** where possible: `get-chunk-batch` reads up to 50 chunks in
  one call vs 50 separate `get-chunk` calls
- **Cache aggressively**: Inscription metadata and chunk data are immutable
  once sealed — they never change
- **Use fallback endpoints**: If one API is rate-limited, try the other
- **Limit concurrency**: Max 4 parallel read-only requests recommended
- **Delay between writes**: 5-second minimum between transaction broadcasts

---

## Using the @stacks/transactions Library

### Complete Example: Read-Only Call

```javascript
import {
  callReadOnlyFunction,
  uintCV,
  cvToJSON
} from '@stacks/transactions';
import { StacksMainnet } from '@stacks/network';

const network = new StacksMainnet();

async function getInscriptionMeta(tokenId, senderAddress) {
  const result = await callReadOnlyFunction({
    contractAddress: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
    contractName: 'xtrata-v2-1-0',
    functionName: 'get-inscription-meta',
    functionArgs: [uintCV(BigInt(tokenId))],
    senderAddress,
    network
  });

  return cvToJSON(result);
}
```

### Complete Example: Write Transaction

```javascript
import {
  makeContractCall,
  broadcastTransaction,
  bufferCV,
  stringAsciiCV,
  uintCV,
  AnchorMode,
  PostConditionMode,
  FungibleConditionCode,
  makeStandardSTXPostCondition
} from '@stacks/transactions';
import { StacksMainnet } from '@stacks/network';

const network = new StacksMainnet();

async function beginInscription(params) {
  const tx = await makeContractCall({
    contractAddress: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
    contractName: 'xtrata-v2-1-0',
    functionName: 'begin-or-get',
    functionArgs: [
      bufferCV(params.expectedHash),
      stringAsciiCV(params.mime),
      uintCV(params.totalSize),
      uintCV(params.totalChunks)
    ],
    senderKey: params.senderKey,
    network,
    postConditions: [
      makeStandardSTXPostCondition(
        params.senderAddress,
        FungibleConditionCode.LessEqual,
        params.feeUnitMicroStx
      )
    ],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });

  const result = await broadcastTransaction(tx, network);
  if (typeof result === 'string') {
    return result; // txid
  }
  if (result.error) {
    throw new Error(`${result.error}: ${result.reason}`);
  }
  return result.txid;
}
```

---

## Clarity Value Types Quick Reference

When constructing `functionArgs` for contract calls:

| Clarity Type | JavaScript Constructor | Example |
|-------------|----------------------|---------|
| `uint` | `uintCV(value)` | `uintCV(42n)` |
| `int` | `intCV(value)` | `intCV(-1n)` |
| `bool` | `trueCV()` / `falseCV()` | `trueCV()` |
| `principal` | `principalCV(addr)` | `principalCV('SP1...')` |
| `(buff N)` | `bufferCV(bytes)` | `bufferCV(new Uint8Array(32))` |
| `(string-ascii N)` | `stringAsciiCV(str)` | `stringAsciiCV('image/png')` |
| `(list ...)` | `listCV(items)` | `listCV([uintCV(1n), uintCV(2n)])` |
| `{ key: val }` | `tupleCV({...})` | `tupleCV({ hash: bufferCV(...), 'token-uri': stringAsciiCV(...) })` |
| `(optional ...)` | `someCV(val)` / `noneCV()` | `someCV(uintCV(1n))` |

### Parsing Responses

```javascript
import { cvToJSON } from '@stacks/transactions';

const result = await callReadOnlyFunction({ ... });
const json = cvToJSON(result);

// (ok u42) → { type: "ok", value: { type: "uint", value: "42" } }
// (err u100) → { type: "err", value: { type: "uint", value: "100" } }
// (some u5) → { type: "some", value: { type: "uint", value: "5" } }
// none → { type: "none" }
```
