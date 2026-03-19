# 00 — Project Overview

## What Is Xtrata?

Xtrata is a contract-driven, on-chain data layer for Bitcoin Layer-2 (Stacks)
that enables permanent, composable, and recursive data infrastructure secured
directly to Bitcoin. It treats inscriptions not as isolated artifacts but as
structured, addressable data blocks designed to be reused, referenced, and
rebuilt on-chain.

Inscriptions on Xtrata cost roughly 1/100 to 1/1000 of Bitcoin ordinal
inscriptions. The protocol supports files up to 32 MiB via a chunked upload
system, and all content is immutable once sealed.

## Why This Skill File Matters

AI agents — particularly autonomous trading agents from the aibtc platform —
need to learn Xtrata as a new skill. These agents already have Stacks wallets
with STX and can sign and broadcast transactions. What they lack is the
specific knowledge of:

- Which contracts to call and their exact function signatures
- How to chunk data and compute the expected hash
- How to construct valid Stacks transactions for each operation
- How the fee model works and how to set post-conditions
- How to verify success after broadcasting

This documentation provides everything an AI needs to inscribe data
autonomously, without any human guidance.

## Blockchain Context

- **Blockchain:** Stacks (Bitcoin Layer-2)
- **Token for gas:** STX
- **Address format:** `SP...` (mainnet), `ST...` (testnet)
- **Block time:** ~10 minutes (anchored to Bitcoin)
- **Smart contract language:** Clarity (decidable, non-Turing-complete)
- **NFT standard:** SIP-009

## Protocol Version

The current production contract is **xtrata-v2.1.0**, deployed at:

```
SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0
```

Small files can also use the helper contract:

```
SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-small-mint-v1-0
```

The helper is not a second storage system. It simply collapses `begin-or-get`,
`add-chunk-batch`, and `seal-inscription` / `seal-recursive` into one wallet
transaction for files up to 30 chunks when there is no upload state to resume.

The legacy contract **xtrata-v1.1.1** remains deployed at the same address:

```
SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1
```

v2.1.0 is a superset of v1.1.1. New agents should always use v2.1.0 for all
operations. The legacy contract is only relevant for reading chunk data from
tokens that were migrated from v1 to v2.

## Core Capabilities

| Operation | Description |
|-----------|-------------|
| **Inscribe** | Upload any file (image, audio, video, HTML, text, SVG, JSON) permanently on-chain |
| **Mint** | Seal an inscription to receive an NFT token representing ownership |
| **Transfer** | Move inscription NFTs between wallets (SIP-009 standard) |
| **Query** | Read inscription metadata, content, ownership, and dependencies |
| **Recursive inscribe** | Seal inscriptions that explicitly reference other inscriptions as dependencies |
| **Batch seal** | Seal multiple inscriptions in a single transaction (up to 50) |
| **Deduplicate** | Content-addressed storage prevents duplicate inscriptions of identical data |

## Required Dependencies

Agents need the following npm packages:

```
@stacks/transactions   — Clarity value construction, transaction building, signing
@stacks/network        — Network configuration (mainnet/testnet)
@stacks/connect        — Wallet authentication (browser contexts only)
@noble/hashes          — SHA-256 for incremental content hashing
```

For server-side or headless agents (like aibtc agents), `@stacks/connect` is
not required. Transaction signing is done directly with `@stacks/transactions`.

## Architecture Summary

```
┌─────────────────────────────────────────────────┐
│                  Agent / Client                  │
│                                                  │
│  1. Read file bytes                              │
│  2. Chunk into 16,384-byte segments              │
│  3. Compute SHA-256 chain hash                   │
│  4. Route select:                                │
│     - helper single-tx for 1..30 fresh chunks    │
│     - staged begin/upload/seal otherwise         │
│  5. Verify inscription indexed on-chain          │
└──────────────────────┬──────────────────────────┘
                       │ Stacks contract calls
                       ▼
┌─────────────────────────────────────────────────┐
│ Core: xtrata-v2-1-0 + helper: small-mint v1.0   │
│                                                  │
│  - Stores chunks in on-chain maps               │
│  - Verifies hash incrementally                  │
│  - Mints SIP-009 NFT on seal                    │
│  - Content-addressed deduplication              │
│  - Immutable once sealed                        │
└──────────────────────┬──────────────────────────┘
                       │ Anchored to
                       ▼
┌─────────────────────────────────────────────────┐
│               Bitcoin (Layer 1)                  │
│         Security and finality anchor             │
└─────────────────────────────────────────────────┘
```
