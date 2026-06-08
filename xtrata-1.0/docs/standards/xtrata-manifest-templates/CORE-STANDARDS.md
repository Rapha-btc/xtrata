# Xtrata Core Manifest Standards

This file defines the shared baseline that every Xtrata manifest template should follow. The direction of the current folder is right: it treats manifests as modular, inscribed, machine-readable standards rather than one giant metadata blob.

## Core idea

**Manifest = what the thing is. Contract = what the thing does. Xtrata core inscription = canonical on-chain content.**

For marketplaces and indexers, the safest universal rule is:

```text
manifest or resolver
→ collection/item/system reference
→ Xtrata core contract + token-id / inscription-id
→ verified on-chain chunks
→ rendered content by MIME type
```

`token-uri` may exist for compatibility, but it should never be treated as the source of truth for Xtrata content.

## Required `manifest` block

Every manifest, apart from the package index, should have a top-level `manifest` object containing:

- `standard`
- `schemaVersion`
- `tier`
- `manifestId`
- `network`
- `createdAt`
- `updatedAt`
- `status`
- `language`
- `canonicalUri`
- `canonicalInscription`
- `supersedes`
- `humanSummary`

`canonicalInscription` should contain:

- `contractId`
- `tokenId`
- `finalHash`
- `mimeType`

## Required common top-level sections

Every specialised manifest should include:

- `manifest`
- `validation`
- `security`
- `extensions`

Recommended where useful:

- `humanReadable`
- `interoperability`
- `assetRegistry`
- `reconstruction`

## Collection mapping standard

Collections should resolve through a strict `itemMap`. This is the key marketplace standard for DYLE, Froggies and future Xtrata collections.

Allowed mapping modes:

1. `explicit` - scattered pre-inscribed works, e.g. DYLE #1 → Xtrata #35.
2. `sequential-range` - large pre-inscribed sequential sets, e.g. Froggie #1 → start token + 0.
3. `chunked-explicit` - very large explicit maps split into map chunks.
4. `resolver` - live mint or contract-governed mapping via read-only contract calls.

Minimum fields:

- `mappingType`
- `indexBase`
- `count`
- `coreContractId`

The canonical marketplace path is:

```text
collection manifest inscription
→ itemMap
→ collection index
→ Xtrata core token-id / inscription-id
→ verified content
```

For live minting or contract-first collections, the canonical resolver interface is:

```clarity
(get-locked-core-contract () (response principal uint))
(get-minted-index-count () (response uint uint))
(get-minted-count () (response uint uint))
(get-minted-id (uint) (optional { token-id: uint }))
```

## Security and validation

All manifests should support:

- deterministic hashes for the manifest, asset registry and item map where applicable
- verified wallets/contracts/URLs where relevant
- signatures where the creator, deployer or marketplace needs to attest to the manifest
- `supersedes` and `security.amendments` for version history
- schema validation rules declared in `validation.validationRules`

## Practical recommendation

For Xtrata-native pre-inscribed collections, use the manifest as the canonical collection resolver.

For contract-minted collections, use the same manifest structure, but set `itemMap.mappingType` to `resolver` and point at the collection resolver contract.

This keeps DYLE, Froggies, runtime apps, data vaults and financial systems under one shared manifest philosophy while still allowing specialised templates where needed.
