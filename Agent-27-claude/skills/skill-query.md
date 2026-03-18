---
name: xtrata-query-v2-only
description: >
  Teach any AI agent to inspect and view a Xtrata inscription from only a token
  ID on the mainnet V2 contract. Rebuild the file from chunk 0 plus ordered
  batch reads, and stop with a clear unsupported message for legacy V1 IDs or
  migrated tokens that do not store chunk data in V2. Includes complete
  implementation code.
version: "2.0"
contract: SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0
standalone: true
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
- `skill-inscribe` for one-item minting
- `skill-batch-mint` for multi-item minting
- `skill-transfer` for moving inscriptions between wallets

## 2. Fixed Contract Reference

| Key | Value |
|-----|-------|
| Contract | `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0` |
| Network | `mainnet` |
| Primary API | `https://stacks-node-api.mainnet.stacks.co` |
| Fallback API | `https://api.mainnet.hiro.so` |
| CHUNK-SIZE | 16,384 bytes |
| MAX-BATCH-SIZE | 50 chunk indexes per `get-chunk-batch` |

## 3. Required Imports

```js
const {
  callReadOnlyFunction, bufferCV, uintCV, listCV,
  principalCV, cvToJSON
} = require('@stacks/transactions');
const { StacksMainnet } = require('@stacks/network');

const network = new StacksMainnet();
const CONTRACT_ADDRESS = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const CONTRACT_NAME = 'xtrata-v2-1-0';
```

## 4. Read-Only Helper

```js
async function readOnly(fn, args, sender) {
  const r = await callReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: fn,
    functionArgs: args,
    senderAddress: sender,
    network
  });
  return cvToJSON(r);
}
```

## 5. V2-Only Policy

Keep this skill simple and strict:

- Only read `xtrata-v2-1-0`.
- Do not query `xtrata-v1-1-1`.
- Do not attempt legacy fallback.
- Do not attempt migrated-token recovery from V1 chunk storage.

If `get-inscription-meta(id)` returns `none`, stop and return:

`This ID is not available in the supported V2 contract. It may be legacy V1 or unminted. V1 is not supported by this skill.`

If `get-chunk(id, 0)` returns `none`, stop and return:

`This inscription does not have V2 chunk data available. It is likely legacy or migrated content backed by V1 chunks. That path is not supported by this skill.`

## 6. Required Read-Only Calls

Use these calls in this order:

1. `get-inscription-meta(id)` — core metadata
2. `get-owner(id)` — current owner
3. `get-token-uri(id)` — optional metadata context
4. `get-dependencies(id)` — recursive parents
5. `get-chunk(id, 0)` — prove content is readable from V2
6. `get-chunk-batch(id, indexes)` — remaining chunks
7. `get-chunk(id, index)` — fallback when batch reads fail

## 7. Complete Retrieval Implementation

```js
function hexToBuffer(hex) {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  return Buffer.from(clean, 'hex');
}

async function viewInscription(id, senderAddress) {
  const tokenId = BigInt(id);

  // Step 1: Get metadata
  const meta = await readOnly(
    'get-inscription-meta', [uintCV(tokenId)], senderAddress);
  if (!meta.value) {
    return {
      tokenId: Number(tokenId), status: 'unsupported',
      error: 'This ID is not available in the supported V2 contract. ' +
             'It may be legacy V1 or unminted.'
    };
  }

  const mimeType = meta.value.value['mime-type'].value;
  const totalSize = Number(meta.value.value['total-size'].value);
  const totalChunks = Number(meta.value.value['total-chunks'].value);
  const creator = meta.value.value['creator'].value;
  const sealed = meta.value.value['sealed'].value;
  const finalHash = meta.value.value['final-hash'].value;

  // Step 2: Get owner, URI, dependencies
  const owner = await readOnly('get-owner', [uintCV(tokenId)], senderAddress);
  const uri = await readOnly('get-token-uri', [uintCV(tokenId)], senderAddress);
  const deps = await readOnly('get-dependencies', [uintCV(tokenId)], senderAddress);

  // Step 3: Validate chunk 0 exists in V2
  const firstChunk = await readOnly(
    'get-chunk', [uintCV(tokenId), uintCV(0n)], senderAddress);
  if (!firstChunk.value) {
    return {
      tokenId: Number(tokenId), status: 'unsupported',
      error: 'This inscription does not have V2 chunk data available. ' +
             'It is likely legacy or migrated content backed by V1 chunks.'
    };
  }

  // Step 4: Retrieve all chunks
  const chunks = [hexToBuffer(firstChunk.value.value)];

  for (let start = 1; start < totalChunks; start += 50) {
    const end = Math.min(start + 50, totalChunks);
    const indexes = [];
    for (let i = start; i < end; i++) indexes.push(uintCV(BigInt(i)));

    const batch = await readOnly(
      'get-chunk-batch', [uintCV(tokenId), listCV(indexes)], senderAddress);

    for (const item of batch.value) {
      if (!item.value) {
        return {
          tokenId: Number(tokenId), status: 'unsupported',
          error: 'This inscription could not be fully reconstructed ' +
                 'from V2 chunk data.'
        };
      }
      chunks.push(hexToBuffer(item.value.value));
    }
  }

  // Step 5: Concatenate and trim to total-size
  const fileData = Buffer.concat(chunks).subarray(0, totalSize);

  // Step 6: Extract dependency IDs
  const dependencies = deps.value
    ? deps.value.map(d => Number(d.value))
    : [];

  return {
    tokenId: Number(tokenId),
    contractId: `${CONTRACT_ADDRESS}.${CONTRACT_NAME}`,
    mimeType,
    totalSize,
    totalChunks,
    sealed,
    creator,
    owner: owner.value?.value?.value || null,
    tokenUri: uri.value?.value?.value || null,
    dependencies,
    finalHash,
    status: 'supported-v2',
    fileData
  };
}
```

## 8. Rendering Rules

- `image/*`: save or display the binary as an image.
- `audio/*`: save the file and report the path; inline preview is optional.
- `video/*`: save the file and report the path; inline preview is optional.
- `text/*`, `application/json`, `application/xml`, `application/javascript`: decode as UTF-8, show a short preview, and provide the full file.
- `text/html`, `application/xhtml+xml`, `application/pdf`: treat as untrusted content; sandbox if rendering.
- Unknown MIME: save as binary and report the path.

`token-uri` is helpful context but not the source of truth. The on-chain chunks
are the authoritative file.

## 9. AIBTC MCP Tool Note

AIBTC agents can use `call_read_only_function` for all query operations. The
buffer-corruption issue only affects write calls with `list(buff)` arguments.
Query operations are fully safe through MCP.

## 10. Agent Output Contract

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

## 11. Operational Notes

- All operations are read-only. No STX is spent.
- Back off on `429` / `5xx` responses with bounded retries.
- If a batch read fails, retry missing indexes individually with `get-chunk`.
- Log all query attempts for auditability.
