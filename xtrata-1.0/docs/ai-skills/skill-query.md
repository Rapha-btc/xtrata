---
name: xtrata-query-v2-only
description: >
  Teach any AI agent to inspect and view a Xtrata inscription from only a token
  ID on the mainnet V2 contract. Rebuild the file from chunk 0 plus ordered
  batch reads, and stop with a clear unsupported message for legacy V1 IDs or
  migrated tokens that do not store chunk data in V2.
version: "1.0"
contract: SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0
example-id: 100
---

# Xtrata Query Skill

## 1. Scope

This skill is for read-only viewing of one inscription by token ID on mainnet
V2.

Use it when the request is:
- "show inscription 100"
- "download token 100"
- "view the file for Xtrata ID 100"

Do not use this skill for minting or transfers. Use:
- [`skill-inscribe.md`](skill-inscribe.md) for one-item minting
- [`skill-batch-mint.md`](skill-batch-mint.md) for multi-item minting

## 2. Fixed Contract Reference

| Key | Value |
|-----|-------|
| Contract | `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0` |
| Network | `mainnet` |
| Primary API | `https://stacks-node-api.mainnet.stacks.co` |
| Fallback API | `https://api.mainnet.hiro.so` |
| CHUNK-SIZE | 16,384 bytes |
| MAX-BATCH-SIZE | 50 chunk indexes per `get-chunk-batch` |
| Example token | `100` |

## 3. V2-Only Policy

Keep this skill simple and strict:

- Only read `xtrata-v2-1-0`.
- Do not query `xtrata-v1-1-1`.
- Do not attempt legacy fallback.
- Do not attempt migrated-token recovery from V1 chunk storage.

If `get-inscription-meta(id)` returns `none`, stop and return:

`This ID is not available in the supported V2 contract. It may be legacy V1 or unminted. V1 is not supported by this skill.`

If `get-chunk(id, 0)` returns `none`, stop and return:

`This inscription does not have V2 chunk data available. It is likely legacy or migrated content backed by V1 chunks. That path is not supported by this skill.`

There is no separate "zero batch" concept on the read path. The critical
sentinel is chunk index `0`.

## 4. Required Read-Only Calls

Use these calls in this order:

1. `get-inscription-meta(id)`
2. `get-owner(id)` if owner is not already present in meta
3. `get-token-uri(id)` for optional metadata context
4. `get-dependencies(id)` to report recursive parents
5. `get-chunk(id, 0)` to prove the content is actually readable from V2
6. `get-chunk-batch(id, indexes)` for remaining chunks
7. `get-chunk(id, index)` only as a fallback when batch reads fail

## 5. Retrieval Workflow

1. Parse the token ID as a non-negative integer.
2. Call `get-inscription-meta(id)`.
3. If meta is missing, return the V1/unsupported message and stop.
4. Read `mime-type`, `total-size`, and `total-chunks` from the meta object.
5. Read `get-token-uri(id)` and `get-dependencies(id)` for context.
6. Call `get-chunk(id, 0)` before any batch read.
7. If chunk `0` is missing, return the migrated/legacy unsupported message and stop.
8. If `total-chunks === 1`, the file is just chunk `0`.
9. If `total-chunks > 1`, fetch indexes `1..total-chunks-1` in ordered groups of up to `50` with `get-chunk-batch`.
10. If a batch call fails because of endpoint limits or cost limits, retry the missing indexes one by one with `get-chunk`.
11. Concatenate the bytes in strict index order: `0, 1, 2, ...`.
12. Trim the final byte array to `total-size`.
13. Return the file plus metadata.

If any later chunk is missing from V2, stop and return:

`This inscription could not be fully reconstructed from V2 chunk data. Legacy or partial content is not supported by this skill.`

## 6. Rendering Rules

- `image/*`: save or display the binary as an image.
- `audio/*`: save the file and report the path; inline preview is optional.
- `video/*`: save the file and report the path; inline preview is optional.
- `text/*`, `application/json`, `application/xml`, `application/javascript`: decode as UTF-8, show a short preview, and provide the full file.
- `text/html`, `application/xhtml+xml`, `application/pdf`: treat as untrusted content; sandbox if rendering.
- Unknown MIME: save as binary and report the path.

`token-uri` is helpful context but not the source of truth. The on-chain chunks
are the authoritative file.

## 7. Example: View Inscription 100

For the demo path, use token ID `100`.

Execution plan:

1. `get-inscription-meta(100)`
2. `get-token-uri(100)`
3. `get-dependencies(100)`
4. `get-chunk(100, 0)`
5. `get-chunk-batch(100, [1..50])` as needed
6. Rebuild the file
7. Save or present it using the MIME type from meta

Expected result shape:

```json
{
  "tokenId": 100,
  "contractId": "SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0",
  "mimeType": "image/png",
  "totalSize": 12345,
  "totalChunks": 1,
  "owner": "SP...",
  "tokenUri": "https://...",
  "dependencies": [],
  "status": "supported-v2",
  "filePath": "./xtrata-100.png"
}
```

## 8. Minimal Pseudocode

```js
async function viewV2Only(id = 100n) {
  const meta = await readOnly('get-inscription-meta', [uintCV(id)]);
  if (!meta.value) {
    throw new Error(
      'This ID is not available in the supported V2 contract. It may be legacy V1 or unminted. V1 is not supported by this skill.'
    );
  }

  const firstChunk = await readOnly('get-chunk', [uintCV(id), uintCV(0n)]);
  if (!firstChunk.value) {
    throw new Error(
      'This inscription does not have V2 chunk data available. It is likely legacy or migrated content backed by V1 chunks. That path is not supported by this skill.'
    );
  }

  const totalChunks = Number(meta.value.value['total-chunks'].value);
  const chunks = [hexToBuffer(firstChunk.value.value)];

  for (let start = 1; start < totalChunks; start += 50) {
    const end = Math.min(start + 50, totalChunks);
    const indexes = [];
    for (let index = start; index < end; index += 1) {
      indexes.push(uintCV(BigInt(index)));
    }
    const batch = await readOnly('get-chunk-batch', [uintCV(id), listCV(indexes)]);
    for (const item of batch.value) {
      if (!item.value) {
        throw new Error(
          'This inscription could not be fully reconstructed from V2 chunk data. Legacy or partial content is not supported by this skill.'
        );
      }
      chunks.push(hexToBuffer(item.value.value));
    }
  }

  return Buffer.concat(chunks).subarray(0, Number(meta.value.value['total-size'].value));
}
```

## 9. Agent Output Contract

When the agent finishes, it should return:

- the token ID
- the V2 contract ID used
- MIME type
- size in bytes
- chunk count
- owner
- token URI if present
- dependency IDs if any
- whether the result was `supported-v2` or `unsupported`
- the saved file path or the rendered content itself

## 10. Companion References

- [`XTRATA_AGENT_SKILL.md`](../../XTRATA_AGENT_SKILL.md)
- [`docs/xtrata-inscription-handbook.md`](../xtrata-inscription-handbook.md)
- [`scripts/xtrata-query-example.js`](../../scripts/xtrata-query-example.js)
