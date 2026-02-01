# Recursive inscriptions on Xtrata

This document explains how recursive inscriptions work in Xtrata, how the
contract models dependencies on-chain, and how to use the contract correctly
with code examples from this repo.

## What “recursive” means in Xtrata

A recursive inscription is an inscription whose content or metadata depends on
other inscriptions. Xtrata makes this explicit on-chain by storing a dependency
list for each recursive inscription and exposing it via read-only calls. This
lets clients resolve the dependency graph deterministically without off-chain
indexes.

## Contract primitives (as implemented in this repo)

The Clarity contract used by this app defines:

- `InscriptionDependencies` map: `uint -> (list 50 uint)`
- `seal-recursive(expected-hash, token-uri-string, dependencies)`
- `get-dependencies(id)` (read-only)

Key behavior enforced by the contract:

- The dependency list is a `(list 50 uint)` — max 50 dependencies.
- Dependencies must already exist when sealing.
  - The contract checks existence with `dep-exists?`, which treats a dependency
    as valid if `dep-id < next-id` at seal time.
- Ordering and de-duplication are **not** enforced by the contract.

See: `contracts/live/xtrata-v1.1.0.clar` (or the current live contract source)
for the definitive implementation.

## Recursive workflow (recommended)

1) **Mint leaf inscriptions first.**
   - These are the assets your recursive app will reference (images, audio,
     scripts, data blocks, etc.).

2) **Build the parent content.**
   - Encode dependency IDs inside the parent file (JSON/HTML/JS).
   - Keep an authoritative dependency list to pass into `seal-recursive`.

3) **Seal the parent with `seal-recursive`.**
   - Dependencies must already exist or the seal will fail.

4) **Resolve dependencies in the client.**
   - Use `get-dependencies(id)` to read the on-chain dependency list.
   - Fetch content by chunk for deterministic reconstruction.

## Code examples

### 1) Chunking + expected hash

```ts
import { chunkBytes, computeExpectedHash, CHUNK_SIZE } from '../lib/chunking/hash';
import { bytesToHex } from '../lib/utils/encoding';

const bytes = new Uint8Array(await file.arrayBuffer());
const chunks = chunkBytes(bytes, CHUNK_SIZE);
const expectedHash = computeExpectedHash(chunks);
const expectedHashHex = bytesToHex(expectedHash);
```

### 2) Seal a recursive inscription (Stacks Connect)

This uses the helper builders in `src/lib/contract/client.ts` and submits each
call via `showContractCall`.

```ts
import { showContractCall } from '@stacks/connect';
import { toStacksNetwork } from '../lib/network/stacks';
import {
  buildBeginInscriptionCall,
  buildAddChunkBatchCall,
  buildSealRecursiveCall
} from '../lib/contract/client';
import type { ContractConfig } from '../lib/contract/config';

const contract: ContractConfig = {
  address: 'SP...YOUR_CONTRACT_ADDRESS',
  contractName: 'xtrata-v1-1-1',
  network: 'mainnet'
};

const network = toStacksNetwork(contract.network);

// 1) begin-inscription
await showContractCall(
  buildBeginInscriptionCall({
    contract,
    network,
    expectedHash,
    mime: file.type || 'application/octet-stream',
    totalSize: BigInt(bytes.length),
    totalChunks: BigInt(chunks.length)
  })
);

// 2) add-chunk-batch (repeat for each batch of 50 chunks)
await showContractCall(
  buildAddChunkBatchCall({
    contract,
    network,
    expectedHash,
    chunks: chunks.slice(0, 50)
  })
);

// 3) seal-recursive (dependencies must already exist)
await showContractCall(
  buildSealRecursiveCall({
    contract,
    network,
    expectedHash,
    tokenUri: 'https://example.com/metadata.json',
    dependencies: [1n, 2n, 3n]
  })
);
```

### 3) Read dependencies + resolve child content

```ts
import { createXtrataClient } from '../lib/contract/client';
import { fetchOnChainContent } from '../lib/viewer/content';

const client = createXtrataClient({ contract });
const deps = await client.getDependencies(42n, senderAddress);

for (const depId of deps) {
  const meta = await client.getInscriptionMeta(depId, senderAddress);
  if (!meta) continue;
  const bytes = await fetchOnChainContent({
    client,
    id: depId,
    senderAddress,
    totalSize: meta.totalSize,
    mimeType: meta.mimeType
  });
  // Assemble or render `bytes` as part of your recursive app.
}
```

### 4) HTML recursion (viewer bridge)

When HTML inscriptions are rendered in the app, the viewer injects a small
bridge script (`src/lib/viewer/recursive.ts`) that can service `call-read`
requests without requiring your HTML to hold API keys. The bridge only allows
these read-only functions:

- `get-chunk`
- `get-inscription-meta`
- `get-token-uri`
- `get-owner`
- `get-dependencies`
- `get-svg`
- `get-svg-data-uri`

Example snippet (inside your HTML inscription) that calls `get-dependencies`:

```html
<script>
async function callReadOnly(fn, args) {
  const url = `https://api.mainnet.hiro.so/v2/contracts/call-read/${CONTRACT_ADDRESS}/${CONTRACT_NAME}/${fn}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sender: CONTRACT_ADDRESS, arguments: args })
  });
  const json = await res.json();
  if (!json.okay) throw new Error(json.cause || "Read-only failed");
  return json.result;
}

// Example: get-dependencies(token-id)
const tokenIdArg = "0x0100000000000000000000000000000001"; // uint CV hex for 1
const deps = await callReadOnly("get-dependencies", [tokenIdArg]);
</script>
```

Note: the injected bridge only activates inside the Xtrata viewer. If your
HTML runs elsewhere, you must call the Hiro API directly or provide your own
bridge.

## Practical guidance

- **Seal children before parents.** Dependency validation requires that
  referenced IDs already exist.
- **Keep dependency lists compact.** The on-chain list is capped at 50 IDs.
- **Store the full graph in the content.** Use the on-chain dependency list as
  an authoritative index, but encode the full structure in your JSON/HTML for
  richer recursion patterns.
