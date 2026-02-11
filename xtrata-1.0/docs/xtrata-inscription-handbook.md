# Xtrata Inscription Data Guide

This document explains how to access, compile, and display Xtrata inscriptions.
It is written for indexers, marketplaces, galleries, databases, app builders,
artists, and anyone who needs to handle Xtrata data correctly.

Scope:
- Core contracts: xtrata-v2.1.0 (current) and xtrata-v1.1.1 (legacy).
- Data model, mint flows, read-only APIs, reconstruction, and display.
- Migration and recursion rules.

If you only read one doc to integrate Xtrata, read this one.

---

## 1) Which contract to target

- **Current:** `xtrata-v2.1.0` is the canonical contract for new mints.
- **Legacy:** `xtrata-v1.1.1` remains the source of chunk data for migrated tokens.

Important v2 behavior:
- v2 can set a one-time ID offset to continue IDs from v1.
- v2 introduces optional migration: v1 tokens can be escrowed and re-minted in v2
  with the same ID.
- v2 minted IDs may be **non-contiguous** (offset or migration).

If you render tokens minted or migrated into v2:
- Ownership and metadata live in v2.
- Chunk data can still live in v1 for migrated tokens.
- If v2 chunk reads are empty, **fall back to v1** for chunk data.

---

## 2) Core data model

Xtrata inscriptions are SIP-009 NFTs with on-chain content stored in chunks.
Read-only types (from the contract inventory):

**InscriptionMeta**
- `owner` (principal)
- `creator` (principal or null)
- `mime-type` (string-ascii 64)
- `total-size` (uint)
- `total-chunks` (uint)
- `sealed` (bool)
- `final-hash` (buff 32)

**UploadState**
- `mime-type`, `total-size`, `total-chunks`, `current-index`, `running-hash`
- `last-touched`, `purge-index`

The **token URI** is stored separately (`get-token-uri` / `get-token-uri-raw`).
It can point to off-chain metadata, but the inscription content is always
on-chain and can be reconstructed from chunks.

---

## 3) Invariants and limits

From v2.1.0 overview:
- Chunk size is fixed at **16,384 bytes**.
- Max chunks per inscription: **2,048**.
- Max total size: **32 MiB** (2,048 * 16,384).
- Batch size for chunk upload and batch sealing: **50**.
- Uploads expire after `UPLOAD-EXPIRY-BLOCKS` if inactive.

Once sealed, inscription content is immutable.

---

## 4) Content addressing and dedupe

Xtrata is content-addressed:
- Compute `expected-hash` from the ordered chunk list.
- Use `begin-or-get(expected-hash, ...)` to avoid duplicate uploads.
- Use `get-id-by-hash(hash)` to detect existing content.

This allows multiple token URIs or views to point to the same underlying
content safely.

---

## 5) Mint flows (write path)

### Standard flow (single inscription)
1) Compute the expected hash from chunks.
2) `begin-or-get(expected-hash, mime, total-size, total-chunks)`
3) `add-chunk-batch(hash, chunks)` (repeat until all chunks uploaded)
4) `seal-inscription(expected-hash, token-uri-string)`

Fee notes (v2.1.0):
- Begin charges **fee-unit once**.
- `add-chunk-batch` has **no fee**.
- Seal fee = **fee-unit * (1 + ceil(total-chunks / 50))**.

### Batch sealing
- `seal-inscription-batch(items)` mints up to 50 items in one tx.
- Each item pays its own seal fee; total is summed in the batch call.

### Recursive sealing
- Use `seal-recursive(expected-hash, token-uri-string, dependencies)`.
- Dependencies must already exist.
- Dependency list is capped at 50.

---

## 6) Reading and reconstruction (display path)

### Recommended read-only calls
- `get-inscription-meta(id)`
- `get-owner(id)`
- `get-token-uri(id)` or `get-token-uri-raw(id)`
- `get-chunk-batch(id, indexes)` (preferred)
- `get-chunk(id, index)` (fallback)
- `get-dependencies(id)` for recursive content

### Reconstruction steps
1) Read `InscriptionMeta`.
2) Create the index list `0..total-chunks-1`.
3) Fetch chunks in batches of 50 via `get-chunk-batch`.
4) Concatenate bytes in order to rebuild the payload.
5) Render based on `mime-type`.

### Display guidance
- **Images:** use `object-fit: contain` to avoid cropping.
- **Audio/Video:** stream or buffer incrementally (do not load all at once).
- **HTML:** sandbox in an iframe; treat as untrusted content.
- **Text/JSON:** show a preview and allow download of full bytes.

Optional integrity check:
- Recompute the expected hash and compare to `final-hash`.

---

## 7) Migration-aware reads

If a token was migrated from v1 to v2:
- `get-inscription-meta` and ownership live in v2.
- Chunk data remains in v1.
- If `get-chunk-batch` on v2 returns empty chunks, read the same chunks from v1.

This is the expected behavior and should be handled by clients.

---

## 8) Enumeration and indexing

Do not assume IDs are contiguous in v2.

Use minted enumeration helpers:
- `get-minted-count()`
- `get-minted-id(index)`

`get-last-token-id()` returns the **highest minted ID**, not `next-id - 1`.

This is critical for indexers, marketplaces, and galleries.

---

## 9) Recursive inscriptions

Recursive inscriptions explicitly reference dependencies on-chain.
Rules:
- Dependencies list max 50 IDs.
- Dependencies must already exist when sealing.
- Ordering and dedupe are not enforced by the contract.

For display:
- Read `get-dependencies(id)`.
- Resolve child content by reading each dependency.

---

## 10) Best practices for marketplaces and galleries

- Always use SIP-009 ownership (`get-owner`).
- Prefer metadata in `get-token-uri`, but treat it as optional.
- Always be able to reconstruct on-chain bytes from chunks.
- Cache metadata and chunk bytes locally to reduce rate limits.
- Use `get-chunk-batch` for efficiency.
- Avoid aggressive polling; batch reads and cache results.

---

## 11) Quick reference: read-only surface

Core reads:
- `get-inscription-meta`
- `get-owner`
- `get-token-uri` / `get-token-uri-raw`
- `get-chunk` / `get-chunk-batch`
- `get-inscription-size`
- `get-inscription-chunks`
- `get-inscription-hash`
- `inscription-exists`
- `is-inscription-sealed`

Enumeration:
- `get-minted-count`
- `get-minted-id`
- `get-last-token-id`

Recursion:
- `get-dependencies`

Upload diagnostics:
- `get-pending-chunk`

---

## 12) Summary

Xtrata inscriptions are SIP-009 NFTs whose content is stored on-chain in
fixed-size chunks. To integrate safely:
- Use v2.1.0 for new content.
- Enumerate with `get-minted-count` + `get-minted-id`.
- Reconstruct bytes from chunks with batch reads.
- Handle migration by falling back to v1 chunk reads.
- Render media with safe, non-cropping layouts.
- Cache aggressively and avoid excessive read-only calls.

This guarantees consistent, correct rendering across marketplaces, galleries,
apps, and archival databases.
