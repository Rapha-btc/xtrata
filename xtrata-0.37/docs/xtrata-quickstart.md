# Xtrata Quickstart (for integrators)

This is a compact, practical guide to reading and displaying Xtrata inscriptions.
For full detail, see `docs/xtrata-inscription-handbook.md`.

---

## 1) Pick the right contract

- **Current:** `xtrata-v2.1.0`
- **Legacy:** `xtrata-v1.1.1` (used for chunk data of migrated tokens)

**Rule:** Ownership + metadata live in v2, but chunk data may still live in v1.
If v2 chunks are empty, fall back to v1 for the same ID.

---

## 2) Read a token

Recommended read-only calls:
- `get-inscription-meta(id)`
- `get-owner(id)`
- `get-token-uri(id)` (optional metadata)
- `get-chunk-batch(id, indexes)` (preferred)

---

## 3) Reconstruct content

1) Read `InscriptionMeta` to get `total-chunks` and `mime-type`.
2) Build `indexes = 0..total-chunks-1`.
3) Fetch chunks in batches of 50 with `get-chunk-batch`.
4) Concatenate bytes in order.
5) Render based on `mime-type` (image, audio, video, html, text).

---

## 4) Handle migration

For tokens migrated from v1 to v2:
- Read metadata + ownership in v2.
- Try `get-chunk-batch` in v2 first.
- If empty, read chunks from v1.

---

## 5) Enumeration (v2 only)

Do **not** assume IDs are contiguous.
Use:
- `get-minted-count()`
- `get-minted-id(index)`

`get-last-token-id()` returns the **highest minted ID**, not the count.

---

## 6) Recursion

If you need dependencies:
- Use `get-dependencies(id)`.
- Dependencies must exist before `seal-recursive`.
- Max 50 dependencies.

---

## 7) Rendering tips

- Use `object-fit: contain` to avoid cropping.
- Cache chunks and metadata locally (IndexedDB) to reduce API calls.
- Avoid aggressive polling; batch reads and reuse cached data.

---

## 8) Minting flow (reference)

Standard:
1) `begin-or-get` 2) `add-chunk-batch` (repeat) 3) `seal-inscription`

Recursive:
- `seal-recursive(expected-hash, token-uri, dependencies)`

Batch mint:
- `seal-inscription-batch` (max 50 items)

---

If you need full details, read `docs/xtrata-inscription-handbook.md`.
