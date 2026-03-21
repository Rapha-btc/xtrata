---
name: xtrata-aibtc-training
description: >
  Complete training guide for AIBTC platform agents to autonomously run the
  Xtrata inscription lifecycle. Covers MCP tool mapping, SDK fallback for
  buffer-heavy writes, all supported mint routes, and known tool limitations.
  Designed to work with the standalone skill modules.
version: "2.0"
standalone: true
---

# AIBTC Agent Training Guide for Xtrata

Audience: AIBTC agents that execute on Stacks via MCP wallet tooling.

## Goal

Train an AIBTC agent to autonomously inscribe, query, transfer, and batch-mint
on the Xtrata protocol using the skill modules:

| Skill | Use Case |
|-------|----------|
| `xtrata-release-plan` | Quote and plan multi-artifact releases before any write |
| `skill-inscribe` | Inscribe one file (helper or staged route) |
| `skill-batch-mint` | Coordinated drop of 2-50 non-recursive items |
| `skill-query` | View/download one inscription by token ID |
| `skill-transfer` | Move an inscription to another wallet |

## Required MCP Tools

| Xtrata operation | AIBTC MCP tool |
|---|---|
| Wallet address | `get_wallet_info` |
| STX balance check | `get_stx_balance` |
| Read-only calls | `call_read_only_function` |
| Write contract call | `call_contract` |
| Broadcast signed tx | `broadcast_transaction` |
| Transaction status | `get_transaction_status` |

## Core Constants

| Name | Value |
|---|---|
| Core contract | `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0` |
| Helper contract | `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-small-mint-v1-0` |
| Chunk size | 16,384 bytes |
| Upload batch size | 50 chunks |
| Helper chunk ceiling | 30 chunks |
| Final batch item limit | 50 items |
| Max chunks per inscription | 2,048 |
| Max size | 32 MiB |

## Training Sequence

1. **Hash derivation**: Incremental SHA-256 chain.
   - Start with 32 zero bytes.
   - For each chunk: `running = sha256(running || chunk)`.
   - Final value is `expected-hash`.

2. **Fee model**:
   - begin fee = `fee-unit`
   - seal fee = `fee-unit * (1 + ceil(totalChunks / 50))`
   - helper spend cap = begin + seal in one deny-mode post-condition
   - Always query `get-fee-unit` before building transactions.

3. **Route selection**:
   - One item, 1..30 chunks, helper deployed, no staged upload -> helper route
   - One item otherwise -> staged route
   - 2..50 non-recursive items -> batch route
   - Recursive dependencies -> individual mints only
   - Never assume a multi-file helper path exists

4. **Post-condition policy**: `PostConditionMode.Deny` for fee-paying writes.

5. **Confirmation gating**: Every write tx must confirm before the next dependent tx.

6. **Recovery policy**:
   - Duplicate -> resolve canonical ID by hash
   - Active upload state -> stay on staged route and resume
   - Expired/not-found -> restart begin path
   - Hash mismatch -> restart with clean chunk state

## CRITICAL: MCP Buffer Bug

Some MCP implementations silently send empty buffers when large hex-encoded data
is passed in nested `list(buff)` arguments.

**Fingerprint**: If the running hash equals
`66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925`,
the tool sent empty data instead of your chunks.

**Use the `@stacks/transactions` SDK directly** for:
- `add-chunk-batch`
- `mint-add-chunk-batch`
- `mint-small-single-tx`
- `mint-small-single-tx-recursive`

**Safe through MCP** (no chunk buffers):
- `begin-or-get`
- `seal-inscription`
- `seal-recursive`
- `seal-inscription-batch`
- `mint-begin`
- `mint-seal-batch`
- All read-only calls

## Single-Item Mint Run Loop

1. Get address and STX balance.
2. Chunk data and compute expected hash.
3. Dedupe with `get-id-by-hash`, then query `get-upload-state`.
4. If helper eligible: one helper tx with combined spend cap.
5. Otherwise: staged begin -> upload batches -> seal.
6. Wait for each tx to confirm before proceeding.
7. Verify metadata and canonical hash->id mapping.
8. Return structured output.

## Batch Mint Run Loop

1. Normalize ordered manifest.
2. Read, chunk, and hash every file.
3. Deduplicate within request and against chain state.
4. Reject any items requiring recursive dependencies.
5. Stage each item: `begin-or-get` + `add-chunk-batch`.
6. Wait for all staging txs to confirm.
7. Send one `seal-inscription-batch`.
8. Map returned `{ start, count }` to manifest order.
9. Return structured output with token ID mappings.

## Resume Path

Staged uploads are resume-safe for ~30 days (4,320 blocks):
1. `get-upload-state(expected-hash, owner)` -> check `current-index`
2. Resume uploading from the next missing chunk.
3. Do not switch an active staged upload onto the helper route.

For batch resume: treat each item as its own staged upload state.

## Operational Safeguards

- Start on testnet for new workflows.
- Keep write retries bounded.
- Back off on rate limits: 15s -> 30s -> 60s -> 120s.
- Never expose secret material in prompts, logs, or traces.
- Log tx IDs, expected hashes, resolved token IDs, and route choice.
- Surface unsupported plans early: recursive batch, >50 items, multi-file helper.
