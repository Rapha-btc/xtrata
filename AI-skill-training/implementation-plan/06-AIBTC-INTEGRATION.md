# 06 — aibtc Agent Integration

This document describes how aibtc agents (from aibtc.dev) bridge their existing
wallet capabilities with Xtrata operations.

## What Are aibtc Agents?

aibtc agents are autonomous AI agents that:

- Operate on the Stacks blockchain
- Have their own wallets via the **aibtc MCP server**
- Can sign and broadcast transactions
- Can swap tokens on ALEX DEX
- Can interact with DeFi protocols
- Communicate via **MCP (Model Context Protocol)** tools
- Have access to the **Hiro Stacks API** for blockchain interaction

They need Xtrata as a **new skill** — the ability to inscribe data on-chain.

---

## MCP Wallet Integration Pattern

aibtc agents interact with the blockchain through MCP tools. The integration
pattern maps MCP wallet operations to Xtrata contract calls.

### Step 1: Get Agent's Stacks Address

The agent retrieves its own address from the MCP wallet:

```
MCP Tool: wallet_get_address
Result: "SP1AGENT_ADDRESS_HERE"
```

### Step 2: Check STX Balance

```
MCP Tool: wallet_get_balance
Result: { "stx": "5000000" }  // 5 STX in microSTX
```

The agent should verify it has enough STX for the inscription:
- Begin fee: 0.1 STX (100,000 microSTX)
- Seal fee: 0.2+ STX (depends on chunk count)
- Network fees: ~0.05 STX buffer
- **Minimum recommended:** 0.5 STX for a small inscription

### Step 3: Construct Xtrata Transaction

Using the transaction construction patterns from `03-TRANSACTION-CONSTRUCTION.md`,
the agent builds the contract-call transaction. The key difference for aibtc
agents is that they sign via the MCP server rather than with a raw private key.

```
MCP Tool: stacks_call_contract
Parameters:
  contractAddress: "SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X"
  contractName: "xtrata-v2-1-0"
  functionName: "begin-or-get"
  functionArgs: [<encoded args>]
  postConditions: [<STX spend cap>]
```

### Step 4: Broadcast

```
MCP Tool: stacks_broadcast_transaction
Parameters:
  signedTransaction: <serialized tx bytes>
Result: { "txid": "0x..." }
```

### Step 5: Verify

```
MCP Tool: stacks_get_transaction
Parameters:
  txid: "0x..."
Result: { "tx_status": "success" }
```

---

## Autonomous Inscription Loop

This is the complete decision loop an aibtc agent follows when instructed to
inscribe content:

```
1.  Agent receives instruction: "Inscribe [content] on-chain via Xtrata"

2.  BALANCE CHECK
    → Query wallet balance via MCP
    → Calculate required fees (see 04-FEE-MODEL.md)
    → If balance < required: ABORT with "Insufficient STX balance"

3.  PREPARE DATA
    → Convert content to Uint8Array
    → Determine MIME type
    → Chunk into 16,384-byte segments
    → Compute expected hash (incremental SHA-256 chain)

4.  DEDUP CHECK
    → Call get-id-by-hash(expected-hash) read-only
    → If content already exists: RETURN existing token ID
    → If not: proceed to inscription

5.  BEGIN INSCRIPTION
    → Call begin-or-get(expected-hash, mime, total-size, total-chunks)
    → Post-condition: LessEqual fee-unit STX
    → If returns (some id): content was sealed between check and begin, RETURN id
    → If returns none: upload session created

6.  WAIT FOR CONFIRMATION
    → Poll transaction status every 10 seconds
    → Max 60 attempts (~10 minutes)
    → If failed: check error code, see 07-ERROR-HANDLING.md

7.  UPLOAD CHUNKS
    → For each batch of 50 chunks:
      → Call add-chunk-batch(expected-hash, chunks)
      → No post-conditions needed (no fee)
      → Wait 5 seconds between batches
    → Wait for last batch to confirm

8.  SEAL INSCRIPTION
    → Call seal-inscription(expected-hash, token-uri)
    → Post-condition: LessEqual seal-fee STX
    → Wait for confirmation

9.  VERIFY
    → Call get-inscription-meta(token-id) to confirm sealed = true
    → Call get-id-by-hash(expected-hash) to get canonical token ID
    → Verify inscription content matches by reading chunks

10. REPORT
    → Return: { tokenId, txid, mimeType, totalSize, hash }
    → If any step failed: Return error with specific error code and resolution
```

---

## Mapping MCP Tools to Xtrata Operations

| Xtrata Operation | MCP Tool | Parameters |
|-----------------|----------|------------|
| Check balance | `wallet_get_balance` | — |
| Get address | `wallet_get_address` | — |
| Read-only query | `stacks_call_read_only` | contractAddress, contractName, functionName, functionArgs, senderAddress |
| Begin inscription | `stacks_call_contract` | (see begin-or-get params) |
| Upload chunks | `stacks_call_contract` | (see add-chunk-batch params) |
| Seal inscription | `stacks_call_contract` | (see seal-inscription params) |
| Transfer NFT | `stacks_call_contract` | (see transfer params) |
| Check tx status | `stacks_get_transaction` | txid |

---

## Hiro API Integration

aibtc agents have access to the Hiro Stacks API. Useful endpoints:

### Account Balance

```
GET https://api.mainnet.hiro.so/v2/accounts/{address}
→ { "balance": "0x...", "nonce": 42, ... }
```

### Transaction Status

```
GET https://api.mainnet.hiro.so/extended/v1/tx/{txid}
→ { "tx_status": "success" | "pending" | "abort_by_response" | ... }
```

### Read-Only Contract Call

```
POST https://api.mainnet.hiro.so/v2/contracts/call-read/SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X/xtrata-v2-1-0/{function-name}
Body: {
  "sender": "SP1...",
  "arguments": ["0x..."]  // Serialized Clarity values
}
→ { "okay": true, "result": "0x..." }
```

---

## Error Recovery for Autonomous Agents

When an operation fails, the agent should follow this decision tree:

```
ERROR RECEIVED
  │
  ├── ERR-PAUSED (u109)
  │   → Xtrata is paused. Retry later or abort.
  │
  ├── ERR-DUPLICATE (u114)
  │   → Content already inscribed. Call get-id-by-hash to get existing ID.
  │
  ├── ERR-NOT-FOUND (u101)
  │   → Upload session expired or doesn't exist. Restart from begin-or-get.
  │
  ├── ERR-EXPIRED (u112)
  │   → Upload session timed out. Restart from begin-or-get.
  │
  ├── ERR-HASH-MISMATCH (u103)
  │   → Chunk data was corrupted or out of order. Restart from begin-or-get.
  │
  ├── ERR-INVALID-BATCH (u102)
  │   → Too many chunks or invalid size. Check chunk size = 16,384.
  │
  ├── ERR-NOT-AUTHORIZED (u100)
  │   → Wallet is not the owner. Check sender address.
  │
  ├── Balance too low
  │   → Need more STX. Report minimum required amount.
  │
  └── Network error
      → Retry with exponential backoff (1s, 2s, 4s, 8s, max 120s).
```

---

## Security Notes for Autonomous Agents

1. **Never expose private keys** — Use MCP wallet signing, not raw keys in code
2. **Always use PostConditionMode.Deny** — Prevents unexpected STX spending
3. **Set spend caps via post-conditions** — Never allow unlimited spending
4. **Validate data before inscription** — Check MIME type, file size limits
5. **Use testnet first** — Test workflows on testnet before mainnet operations
6. **Fee limits** — The protocol caps fee-unit between 0.001-1.0 STX
7. **Check balance before every operation** — Don't assume balance is sufficient
8. **Log transaction IDs** — Always record txids for audit and debugging
