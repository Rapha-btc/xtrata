# 04 — Fee Model

## Overview

Xtrata uses a **one-knob fee model** where a single configurable value
(`fee-unit`) determines all protocol fees. This is separate from Stacks
network transaction fees (gas).

## Current Fee Unit

The default `fee-unit` is **100,000 microSTX = 0.1 STX**.

To query the current fee unit on-chain:

```javascript
const feeUnit = await client.getFeeUnit(senderAddress);
// Returns: bigint (in microSTX)
```

### Fee Bounds

The admin can adjust `fee-unit` within strict bounds:

| Bound | Value (microSTX) | Value (STX) |
|-------|------------------|-------------|
| Minimum (`FEE-MIN`) | 1,000 | 0.001 |
| Maximum (`FEE-MAX`) | 1,000,000 | 1.0 |

---

## Fee Schedule

### Begin Fee

Charged once when creating a new upload session via `begin-inscription` or
`begin-or-get`.

```
begin_fee = fee-unit
```

With default fee-unit: **0.1 STX**

### Seal Fee

Charged when sealing an inscription. Scales with the number of chunks:

```
seal_fee = fee-unit * (1 + ceil(total_chunks / 50))
```

### Examples

| File Size | Chunks | Begin Fee | Seal Fee | Total Protocol Fee |
|-----------|--------|-----------|----------|--------------------|
| 10 KB | 1 | 0.1 STX | 0.2 STX | 0.3 STX |
| 50 KB | 4 | 0.1 STX | 0.2 STX | 0.3 STX |
| 100 KB | 7 | 0.1 STX | 0.2 STX | 0.3 STX |
| 500 KB | 31 | 0.1 STX | 0.2 STX | 0.3 STX |
| 800 KB | 49 | 0.1 STX | 0.2 STX | 0.3 STX |
| 1 MB | 62 | 0.1 STX | 0.3 STX | 0.4 STX |
| 5 MB | 306 | 0.1 STX | 0.8 STX | 0.9 STX |
| 32 MB | 2,048 | 0.1 STX | 4.2 STX | 4.3 STX |

### Batch Seal Fee

When using `seal-inscription-batch`, the total fee is the sum of each item's
individual seal fee:

```
batch_seal_fee = sum(fee-unit * (1 + ceil(item_chunks / 50)) for each item)
```

### Migration Fee

When using `migrate-from-v1`:

```
migration_fee = fee-unit
```

### Fee Waiver

If `tx-sender == royalty-recipient`, no fee transfer is performed.

### Helper Route Spend Cap

The helper route does not change protocol economics. It still covers:

```
helper_spend_cap = begin_fee + seal_fee
```

What changes is wallet UX: the caller signs one deny-mode transaction instead
of separate begin and seal transactions. This helper route is only valid for
fresh uploads of `1..30` chunks.

---

## Fee Calculation in JavaScript

```javascript
const MICROSTX_PER_STX = 1_000_000;
const MAX_BATCH_SIZE = 50;

function estimateFees(totalChunks, feeUnitMicroStx = 100_000n) {
  const feeBatches = totalChunks > 0n
    ? (totalChunks + BigInt(MAX_BATCH_SIZE) - 1n) / BigInt(MAX_BATCH_SIZE)
    : 0n;

  const beginFee = feeUnitMicroStx;
  const sealFee = totalChunks > 0n
    ? feeUnitMicroStx * (1n + feeBatches)
    : 0n;

  return {
    beginFee,        // microSTX
    sealFee,         // microSTX
    totalFee: beginFee + sealFee  // microSTX
  };
}

// Example usage:
const fees = estimateFees(4n);
// { beginFee: 100000n, sealFee: 200000n, totalFee: 300000n }
// = 0.1 STX begin + 0.2 STX seal = 0.3 STX total
```

---

## Post-Conditions

Post-conditions are safety guards that prevent transactions from spending more
STX than expected. Always set them for fee-paying operations.

### Begin Post-Condition

```javascript
import {
  makeStandardSTXPostCondition,
  FungibleConditionCode
} from '@stacks/transactions';

// Limit begin tx to spending at most fee-unit
const beginPostCondition = makeStandardSTXPostCondition(
  senderAddress,
  FungibleConditionCode.LessEqual,
  feeUnitMicroStx  // begin fee = 1 fee-unit
);
```

### Seal Post-Condition

```javascript
// Calculate seal spend cap
const batchSize = 50n;
const feeBatches = (totalChunks + batchSize - 1n) / batchSize;
const sealCap = feeUnitMicroStx * (1n + feeBatches);

const sealPostCondition = makeStandardSTXPostCondition(
  senderAddress,
  FungibleConditionCode.LessEqual,
  sealCap
);
```

### Chunk Upload Post-Condition

No post-condition needed — `add-chunk-batch` does not charge fees.

```javascript
const chunkPostConditions = []; // Empty — no fees
```

### Helper Post-Condition

```javascript
const helperSpendCap = beginFee + sealFee;

const helperPostCondition = makeStandardSTXPostCondition(
  senderAddress,
  FungibleConditionCode.LessEqual,
  helperSpendCap
);
```

### Always Use PostConditionMode.Deny

```javascript
postConditionMode: PostConditionMode.Deny
```

This ensures the transaction fails if it would spend more than the
post-conditions allow. This is critical for autonomous agents to prevent
accidental overspend.

---

## Minimum Balance Check

Before starting an inscription, agents should verify they have sufficient STX:

```javascript
async function checkBalance(senderAddress, network) {
  const url = `${network.coreApiUrl}/v2/accounts/${senderAddress}`;
  const response = await fetch(url);
  const data = await response.json();
  return BigInt(data.balance); // Balance in microSTX
}

async function hasEnoughBalance(senderAddress, totalChunks, network) {
  const balance = await checkBalance(senderAddress, network);
  const fees = estimateFees(totalChunks);

  // Add buffer for network transaction fees (~0.01 STX per tx)
  const networkFeeBuffer = 50_000n; // 0.05 STX buffer for multiple txs
  const requiredBalance = fees.totalFee + networkFeeBuffer;

  return balance >= requiredBalance;
}
```

---

## Network Transaction Fees (Gas)

Separate from protocol fees, each Stacks transaction requires a network fee.
These are typically small:

| Operation | Typical Network Fee |
|-----------|-------------------|
| `begin-or-get` | ~0.001-0.01 STX |
| `mint-small-single-tx` / `mint-small-single-tx-recursive` | ~0.001-0.02 STX |
| `add-chunk-batch` (small batch) | ~0.001-0.01 STX |
| `add-chunk-batch` (50 chunks) | ~0.01-0.05 STX |
| `seal-inscription` | ~0.001-0.01 STX |
| `transfer` | ~0.001 STX |

The `@stacks/transactions` library auto-estimates network fees. For large
chunk uploads, you may want to set fees explicitly to avoid overpaying:

```javascript
txOptions.fee = 20000n; // 0.02 STX — reasonable for most operations
```
