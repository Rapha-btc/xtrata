# Xtrata Manifest Templates

A modular manifest template set for Xtrata.

## Root-level templates

The root contains the most common/useful templates so they are easy to find:

1. `01-collection-minimal-marketplace-manifest.json` - simple art/marketplace launches.
2. `02-namespace-manifest.json` - `.x` names and Xtrata namespace resolution.
3. `03-data-vault-manifest.json` - generic structured data storage, archives and datasets.
4. `04-runtime-app-manifest.json` - interactive HTML apps, renderers, games, widgets and BVST-like runtimes.
5. `05-financial-protocol-manifest.json` - DeFi and financial protocol descriptions.
6. `06-asset-token-manifest.json` - token, wrapped asset, receipt and LP token metadata.
7. `07-treasury-split-manifest.json` - royalties, revenue splits and treasuries.

## Folder structure

- `collections/` - fixed collections, migrations, AV preservation and full composable examples.
- `identity-and-names/` - namespace and identity/attestation manifests.
- `finance/` - financial protocols, assets, treasury splits and oracles/indexes.
- `data/` - data vaults, event logs and bridge/cross-chain manifests.
- `runtime-and-agents/` - runtime app, full composable runtime collection and agent memory manifests.
- `governance-and-rights/` - governance and rights/license manifests.
- `schemas/` - schema manifest template.

## Core principle

Contracts should enforce canonical financial state, ownership and permissions. Manifests should make systems legible, inspectable, reconstructable and verifiable.

For example:

- A registry contract proves who owns `jim.x`.
- A namespace manifest defines the `.x` standard.
- A resolver/name manifest explains what `jim.x` points to.
- A collection/runtime/data/finance manifest describes the target system.


## Core standards added

- `CORE-STANDARDS.md` - human-readable shared rules for all manifest templates.
- `MANIFEST_ALIGNMENT_REPORT.md` - current alignment scan and recommendations.
- `schemas/xtrata-core-manifest-standard.json` - machine-readable baseline standard for validators and repo agents.

