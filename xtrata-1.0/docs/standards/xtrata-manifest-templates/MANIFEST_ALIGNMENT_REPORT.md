# Xtrata Manifest Alignment Report

## Verdict

This folder is moving in the right direction. The package already has a strong modular shape: root-level common templates, deeper specialist folders, and a shared `manifest` block that makes each template inscribable, traceable, versionable and marketplace/indexer-readable.

The main thing to lock now is a core standards layer so every specialist manifest shares the same identity, inscription, validation, security and resolution rules. I have added `CORE-STANDARDS.md` and `schemas/xtrata-core-manifest-standard.json` for that purpose.

## Alignment scan

| File | Standard | Status | Notes |
|---|---:|---:|---|
| `00-manifest-index.json` | `INDEX` | ok | package index, not a manifest |
| `01-collection-minimal-marketplace-manifest.json` | `xtrata-collection-manifest` | ok | aligned with core manifest block |
| `02-namespace-manifest.json` | `xtrata-namespace-manifest` | ok | aligned with core manifest block |
| `03-data-vault-manifest.json` | `xtrata-data-vault-manifest` | ok | aligned with core manifest block |
| `04-runtime-app-manifest.json` | `xtrata-runtime-app-manifest` | ok | aligned with core manifest block |
| `05-financial-protocol-manifest.json` | `xtrata-financial-protocol-manifest` | ok | aligned with core manifest block |
| `06-asset-token-manifest.json` | `xtrata-asset-token-manifest` | ok | aligned with core manifest block |
| `07-treasury-split-manifest.json` | `xtrata-treasury-split-manifest` | ok | aligned with core manifest block |
| `collections/audiovisual-preservation-manifest.json` | `xtrata-collection-manifest` | ok | recommend renaming collection mappingType chunked -> chunked-explicit for final schema |
| `collections/full-composable-manifest.json` | `xtrata-collection-manifest` | ok | aligned with core manifest block |
| `collections/minimal-marketplace-manifest.json` | `xtrata-collection-manifest` | ok | aligned with core manifest block |
| `collections/preservation-migration-manifest.json` | `xtrata-collection-manifest` | ok | recommend renaming collection mappingType sequential -> sequential-range for final schema |
| `data/xtrata-bridge-crosschain-manifest.json` | `xtrata-bridge-crosschain-manifest` | ok | aligned with core manifest block |
| `data/xtrata-data-vault-manifest.json` | `xtrata-data-vault-manifest` | ok | aligned with core manifest block |
| `data/xtrata-event-log-manifest.json` | `xtrata-event-log-manifest` | ok | aligned with core manifest block |
| `finance/xtrata-asset-token-manifest.json` | `xtrata-asset-token-manifest` | ok | aligned with core manifest block |
| `finance/xtrata-financial-protocol-manifest.json` | `xtrata-financial-protocol-manifest` | ok | aligned with core manifest block |
| `finance/xtrata-oracle-index-manifest.json` | `xtrata-oracle-index-manifest` | ok | aligned with core manifest block |
| `finance/xtrata-treasury-split-manifest.json` | `xtrata-treasury-split-manifest` | ok | aligned with core manifest block |
| `governance-and-rights/xtrata-governance-manifest.json` | `xtrata-governance-manifest` | ok | aligned with core manifest block |
| `governance-and-rights/xtrata-rights-license-manifest.json` | `xtrata-rights-license-manifest` | ok | aligned with core manifest block |
| `identity-and-names/xtrata-identity-attestation-manifest.json` | `xtrata-identity-attestation-manifest` | ok | aligned with core manifest block |
| `identity-and-names/xtrata-namespace-manifest.json` | `xtrata-namespace-manifest` | ok | aligned with core manifest block |
| `runtime-and-agents/full-composable-runtime-collection-manifest.json` | `xtrata-collection-manifest` | ok | aligned with core manifest block |
| `runtime-and-agents/xtrata-agent-memory-manifest.json` | `xtrata-agent-memory-manifest` | ok | aligned with core manifest block |
| `runtime-and-agents/xtrata-runtime-app-manifest.json` | `xtrata-runtime-app-manifest` | ok | aligned with core manifest block |
| `schemas/xtrata-core-manifest-standard.json` | `?` | needs attention | missing top: manifest, security, validation; missing manifest fields: canonicalInscription, canonicalUri, createdAt, humanSummary, language, manifestId, network, schemaVersion, standard, status, supersedes, tier, updatedAt; missing canonicalInscription fields: contractId, finalHash, mimeType, tokenId |
| `schemas/xtrata-schema-manifest.json` | `xtrata-schema-manifest` | needs attention | missing top: validation |

## Recommendations before calling this v1.0

1. Keep the current modular folder structure. It is the right direction for Xtrata because it avoids one overloaded universal manifest while still using one common standards spine.
2. Treat collection manifests as first-class Xtrata resolver objects. This directly supports DYLE-style explicit mappings and Froggies-style sequential range mappings.
3. Finalise the collection `itemMap.mappingType` enum as `explicit`, `sequential-range`, `chunked-explicit`, and `resolver`.
4. Keep resolver contracts optional. Use manifest-only resolution for pre-inscribed collections, and resolver-contract resolution for live minting or contract-governed drops.
5. Add real JSON Schemas later. The current `schemas/xtrata-schema-manifest.json` is a schema manifest, not yet a strict JSON Schema validator.
6. Standardise final hashes before production. Some examples use `0x...`, others use `sha256:...`; the core standard now documents this, but the final validator should enforce exact formats.
