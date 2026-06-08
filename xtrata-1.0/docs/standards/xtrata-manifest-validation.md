# Xtrata Manifest Validation

Status: Draft companion document  
Companion standard: [`xtrata-collection-manifest-standard.md`](xtrata-collection-manifest-standard.md)  
Schema target: [`../../schemas/xtrata-collection-manifest.schema.json`](../../schemas/xtrata-collection-manifest.schema.json)

## Purpose

This document defines the expected behavior for future Xtrata Collection Manifest validators.

The validator is not only a JSON syntax checker. It should determine whether a manifest can be trusted by marketplaces, indexers, wallets, preservation teams and developer tools as a collection-level control document.

Validation should answer four practical questions:

1. Is the manifest structurally valid?
2. Can every declared item mapping be resolved?
3. Can every declared asset, hash, inscription and dependency be verified?
4. Are the trust assumptions, signatures, amendments and resolver behavior clear enough for third-party integration?

## Validation Levels

Validators SHOULD support three validation levels.

### Level A: Structural Validation

Level A checks JSON syntax and schema compatibility.

Required checks:

- document parses as JSON;
- document validates against `schemas/xtrata-collection-manifest.schema.json`;
- required root sections are present;
- `manifest.standard` equals `xtrata-collection-manifest`;
- `manifest.schemaVersion` is supported;
- `manifest.tier` is one of `level-1`, `level-2` or `level-3`;
- unknown custom fields are namespaced under `extensions`.

Level A does not require network access.

### Level B: Referential Validation

Level B checks whether manifest references are internally consistent.

Required checks:

- `collection.supply.declared` matches the item map count for fixed collections;
- explicit item indexes are unique;
- sequential ranges are contiguous;
- sequential range counts match inscription ID counts;
- chunked maps do not overlap unless they explicitly supersede earlier maps;
- asset IDs referenced by item maps, audio sections, runtime sections and software sections exist in `assetRegistry.assets`;
- trait data uses declared trait schema fields;
- royalty and split basis points are valid;
- resolver configuration is present when `itemMap.mappingType` is `resolver`.

Level B can run locally if all referenced chunk maps are available locally.

### Level C: Network and Cryptographic Validation

Level C verifies external truth claims.

Required checks:

- Xtrata inscription IDs resolve on the declared network;
- `get-inscription-meta` exists and returns sealed metadata for declared inscriptions;
- reconstructed inscription bytes match the declared Xtrata final hash;
- asset hashes match fetched bytes;
- source archive hashes match fetched bytes;
- chunked item maps match declared hashes;
- resolver contracts expose the declared read-only surface;
- resolver outputs match manifest mappings where both are present;
- creator, publisher, marketplace and archivist signatures verify;
- superseded manifests resolve and hash-verify;
- validation reports referenced by the manifest hash-verify.

Level C requires Stacks read-only access and, where applicable, access to external content-addressed assets.

## Recommended Validator Pipeline

Validators SHOULD run checks in this order.

1. Parse JSON.
2. Validate against JSON Schema.
3. Canonicalize the manifest.
4. Compute manifest hash.
5. Validate internal references.
6. Expand item mappings.
7. Validate sequential ranges and chunked maps.
8. Verify asset registry references.
9. Verify Xtrata inscription metadata and content hashes.
10. Verify resolver behavior.
11. Verify signatures.
12. Verify amendments and supersession chain.
13. Emit a validation report.

The validator SHOULD fail fast for parse errors and schema errors. It SHOULD continue collecting non-fatal warnings after the document is structurally readable.

## Canonicalization

Manifest signing and hashing require stable bytes.

Until a formal Xtrata canonicalization package exists, validators SHOULD use a documented JSON canonicalization method with these properties:

- UTF-8 encoding;
- object keys sorted lexicographically;
- no insignificant whitespace;
- JSON strings escaped consistently;
- arrays preserved in declared order;
- numbers serialized without non-standard formatting;
- no comments or trailing commas.

The manifest hash SHOULD be computed over canonical bytes.

Recommended hash field:

```json
{
  "security": {
    "hashes": {
      "manifestHash": "sha256:..."
    }
  }
}
```

When signatures are present, the signed message SHOULD be the manifest hash or a domain-separated message that includes the manifest hash.

Recommended domain-separated signing message:

```text
Xtrata Collection Manifest
standard: xtrata-collection-manifest
schemaVersion: 0.1.0
manifestId: {manifest.manifestId}
network: {manifest.network}
manifestHash: sha256:{canonicalManifestHash}
```

## Item Mapping Validation

### Explicit Maps

For `itemMap.mappingType = explicit`, validators MUST check:

- `explicitItems.length` equals `itemMap.count` unless omissions are intentionally documented;
- each item index is unique;
- each `collectionItemId` is unique;
- each item has a valid `xtrataInscription`;
- image, animation and metadata references resolve if present;
- source item references are present for migration manifests.

### Sequential Ranges

For `itemMap.mappingType = sequential`, validators MUST check:

- every range has `firstItemIndex`, `lastItemIndex`, `firstXtrataInscriptionId` and `lastXtrataInscriptionId`;
- item range count equals inscription ID range count;
- ranges do not overlap;
- ranges cover the declared collection count unless gaps are documented;
- exceptions fall inside a declared range;
- exceptions do not duplicate one another;
- verification hash matches the canonical serialized range definition.

Formula validation SHOULD be deterministic. The recommended baseline formula is:

```text
xtrataTokenId = firstXtrataInscriptionId + (itemIndex - firstItemIndex)
```

Custom formulas SHOULD be treated as unsupported unless the validator explicitly implements them or the manifest provides a hashed precomputed map.

### Chunked Maps

For `itemMap.chunkedMaps`, validators MUST check:

- every chunk has `chunkId`, index bounds, URI, hash and item count;
- chunk bounds are consistent with item count;
- chunk bytes hash to the declared hash;
- decoded chunk data conforms to the expected item-map chunk shape;
- chunks cover the expected range;
- overlaps are rejected unless explicitly marked as amendments or supersessions.

### Resolver Maps

For resolver-backed collections, validators MUST check:

- `resolverConfig.required` is true when the resolver is mandatory;
- `resolverConfig.contractId` matches `itemMap.resolver.contractId`;
- `get-locked-core-contract` returns the declared core contract;
- `get-minted-index-count` returns a count compatible with the manifest;
- `get-minted-id(index)` returns the expected Xtrata token ID for sampled or complete indexes;
- returned token IDs resolve as Xtrata inscriptions.

For live-minted collections, a resolver may return fewer minted items than maximum supply. That is valid if `collection.supply.supplyType` is `capped`, `open` or `dynamic`.

## Asset Verification

Validators SHOULD treat URLs as retrieval hints, not proof.

For each asset:

- fetch or reconstruct bytes from the declared URI;
- compute the declared hash;
- verify MIME type if possible;
- verify Xtrata final hash when `asset.xtrata` is present;
- record retrieval failures separately from hash mismatches.

Hash mismatch is an error. Retrieval failure is a warning if another verified mirror succeeds, otherwise it is an error.

## Xtrata Reconstruction Checks

For every declared Xtrata inscription, a Level C validator SHOULD:

1. Call `get-inscription-meta(tokenId)`.
2. Confirm the inscription is sealed.
3. Read chunks with `get-chunk-batch` where available.
4. Fall back to `get-chunk` when needed.
5. Reconstruct bytes in ascending chunk order.
6. Trim to `total-size`.
7. Recompute the incremental Xtrata hash.
8. Compare it with `final-hash`.
9. Compare MIME type with manifest expectations.

If fallback contracts are declared, validators SHOULD try them in manifest order when primary chunks are missing.

## Signature Verification

Validators SHOULD verify signatures in `security.signatures`.

Each signature should include:

- signer wallet;
- signer role;
- signed message hash;
- signature bytes;
- signing timestamp;
- canonicalization method.

A valid signature proves that a wallet signed the manifest hash. It does not by itself prove that the signer is the real-world creator. That trust link must come from verified URLs, known contracts, marketplace verification, prior collection records or other documented evidence.

## Amendments and Supersession

Immutable manifests should not be edited in place after publication. Corrections should be represented by a new manifest that references the old manifest.

Validators SHOULD check:

- `manifest.previousManifest` hash resolves;
- `manifest.supersedes` entries resolve;
- `security.amendments` explain the change;
- amendments are signed by an appropriate signer;
- corrected fields do not pretend historical immutable data changed.

Amendment types:

| Type | Meaning |
| --- | --- |
| `correction` | Fixes a typo, trait label, URL, attribution or non-content field. |
| `clarification` | Adds explanatory context without changing mapping or content. |
| `supersession` | Replaces a manifest with a newer canonical manifest. |
| `security-warning` | Warns about compromised links, spoofed mirrors or unsafe runtime behavior. |

## Security Warnings

Validators SHOULD emit warnings for:

- unverified creator wallets;
- unverified marketplace URLs;
- missing manifest signature;
- missing asset hashes;
- mutable HTTP URLs without content hashes;
- resolver contract mismatch;
- runtime content without sandbox requirement;
- HTML or JavaScript assets with network permission;
- missing rights notes;
- migration manifest without source provenance;
- preservation manifest without archivist notes;
- collection name collision with an existing verified collection.

## Suggested Error Codes

Use stable error codes so marketplaces and CI systems can interpret failures.

| Code | Severity | Meaning |
| --- | --- | --- |
| `XM001` | error | JSON parse failed. |
| `XM002` | error | Schema validation failed. |
| `XM003` | error | Required section missing for declared tier. |
| `XM010` | error | Item count does not match declared fixed supply. |
| `XM011` | error | Duplicate item index. |
| `XM012` | error | Sequential range is not contiguous. |
| `XM013` | error | Sequential range inscription count mismatch. |
| `XM014` | error | Chunked map hash mismatch. |
| `XM020` | error | Asset hash mismatch. |
| `XM021` | warning | Asset retrieval failed but unverified fallback may exist. |
| `XM030` | error | Xtrata inscription metadata missing. |
| `XM031` | error | Xtrata inscription hash mismatch. |
| `XM032` | warning | Xtrata fallback contract used for chunk source. |
| `XM040` | error | Resolver contract does not expose required read-only call. |
| `XM041` | error | Resolver core contract mismatch. |
| `XM042` | error | Resolver item mapping mismatch. |
| `XM050` | error | Signature verification failed. |
| `XM051` | warning | Manifest is unsigned. |
| `XM060` | warning | Creator wallet is not verified. |
| `XM061` | warning | Marketplace URL is not verified. |
| `XM070` | error | Superseded manifest hash mismatch. |
| `XM080` | warning | Runtime asset requires sandbox but sandbox is not declared. |
| `XM081` | error | Runtime dependency hash mismatch. |
| `XM090` | warning | Rights or AI policy is incomplete. |

## Validation Report Format

Validators SHOULD emit a deterministic JSON report.

Recommended report shape:

```json
{
  "standard": "xtrata-manifest-validation-report",
  "reportVersion": "0.1.0",
  "manifestId": "xtrata-manifest:example:2026-06-05",
  "manifestHash": "sha256:...",
  "schemaVersion": "0.1.0",
  "validator": {
    "name": "xtrata-manifest-validator",
    "version": "0.1.0",
    "environment": "node"
  },
  "validatedAt": "2026-06-05T00:00:00Z",
  "level": "A | B | C",
  "status": "pass | warn | fail",
  "summary": {
    "errors": 0,
    "warnings": 0,
    "checkedItems": 10000,
    "checkedAssets": 12,
    "checkedInscriptions": 10000
  },
  "checks": [
    {
      "code": "XM012",
      "severity": "error",
      "path": "itemMap.sequentialRanges[0]",
      "message": "Sequential range inscription count does not match item count.",
      "evidence": {
        "firstItemIndex": 1,
        "lastItemIndex": 10000
      }
    }
  ],
  "artifacts": {
    "canonicalManifestHash": "sha256:...",
    "itemMapHash": "sha256:...",
    "assetRegistryHash": "sha256:..."
  }
}
```

The report itself MAY be inscribed on Xtrata or referenced from the manifest by hash.

## Tooling Roadmap

Recommended future validator package:

```text
packages/xtrata-manifest-validator
```

Recommended CLI:

```text
xtrata-manifest validate docs/standards/xtrata-manifest-templates/collections/minimal-marketplace-manifest.json
xtrata-manifest validate --level C --network mainnet manifest.json
xtrata-manifest canonicalize manifest.json
xtrata-manifest report manifest.json --out validation-report.json
```

Recommended SDK exports:

```ts
parseManifest(json)
validateManifestSchema(manifest)
canonicalizeManifest(manifest)
hashManifest(manifest)
expandItemMap(manifest)
validateSequentialRanges(manifest)
validateResolverMapping(manifest, client)
validateXtrataAssets(manifest, reconstructionSources)
createValidationReport(result)
```

## Minimum Acceptance For Marketplace Use

A marketplace SHOULD require at least:

- Level A pass;
- Level B pass for item mapping;
- no critical security errors;
- manifest hash present;
- valid Xtrata core contract ID;
- either resolver mapping or manifest item mapping;
- display fields present;
- rights notes present.

For verified collection badges, a marketplace SHOULD additionally require:

- creator or publisher signature;
- verified creator wallet;
- verified marketplace or project URL;
- Level C inscription checks for a complete set or statistically meaningful sample;
- validation report hash.

## Minimum Acceptance For Preservation Use

A preservation manifest SHOULD require:

- original/source collection references;
- migration or preservation reason;
- original-to-Xtrata mapping;
- source archive hash or documented reason for absence;
- archivist notes;
- holder snapshot where claims are involved;
- verification report;
- clear rights state, even if rights are unknown.

## Minimum Acceptance For Runtime Use

A runtime or BVST-style manifest SHOULD require:

- declared runtime requirements;
- module and dependency hashes;
- sandbox requirements;
- external network policy;
- entrypoints;
- reproducibility instructions;
- reference output hashes where deterministic rendering is claimed.

## Summary

The validator is the enforcement layer for boring infrastructure. The manifest standard defines what a collection should say. Validation determines whether the collection said it clearly, whether the mapping works, whether the assets verify, and whether third-party tools can integrate without hidden assumptions.
