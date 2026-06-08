# Xtrata Manifest Use Guide

This guide expands the machine-readable manifest index into a human-readable map
of what each manifest is for, how it could be used, and how the pieces fit
together in real Xtrata projects.

The short version:

```text
manifest = what the thing is
contract = what the thing does
Xtrata core inscription = canonical on-chain content
validator = whether the manifest can be trusted for a given use
```

The index file, [`00-manifest-index.json`](00-manifest-index.json), is the
compact package map. This guide is the narrative layer for builders, artists,
marketplaces, wallets, archivists, indexers and protocol teams.

## How To Read The Manifest Set

The templates are intentionally modular. Xtrata should not need one enormous
universal manifest for every object. Instead, each manifest type explains one
kind of thing and can link to the others by Xtrata URI, hash, namespace record or
contract reference.

Common examples:

- A collection manifest says what a collection is, how its items map to Xtrata
  inscriptions, how marketplaces should display it, how it can be reconstructed
  and what rights apply.
- A namespace manifest defines the `.x` naming layer. The registry contract
  proves ownership; resolver manifests point names at collections, profiles,
  runtimes, data vaults or other manifests.
- A runtime manifest describes executable HTML, renderers, apps, games, widgets
  and BVST-style modules, including sandbox and dependency rules.
- A data vault manifest describes durable structured records, while an event log
  manifest describes append-only history.
- Financial manifests make protocols, assets, treasuries, oracles and governance
  legible without pretending to be the source of balances or live state.

All specialist manifests should share the same spine: a `manifest` block,
canonical inscription fields, validation rules, hashes, security sections,
amendments and extension space.

## Core Docs And Shared Standards

Use these files to understand or validate the whole package.

| File | What It Is | How It Should Be Used |
| --- | --- | --- |
| [`00-manifest-index.json`](00-manifest-index.json) | Machine-readable package index. | Use it to discover root templates, specialist folders and shared standards. It is useful for docs generation, repo agents, template pickers and CI coverage checks. It is not itself a project manifest. |
| [`README.md`](README.md) | Short package entry point. | Use it for a quick overview of the root templates and folder layout. |
| [`CORE-STANDARDS.md`](CORE-STANDARDS.md) | Human-readable common standards for every manifest type. | Use it before designing new manifests. It explains the shared rule that manifests describe, contracts enforce, and Xtrata core inscriptions hold canonical content. |
| [`MANIFEST_ALIGNMENT_REPORT.md`](MANIFEST_ALIGNMENT_REPORT.md) | Current alignment scan and v1.0 recommendations. | Use it when preparing the template package for production hardening. It calls out schema gaps, mapping enum cleanup and hash-format standardisation. |
| [`schemas/xtrata-core-manifest-standard.json`](schemas/xtrata-core-manifest-standard.json) | Machine-readable baseline standard. | Use it as a validator or repo-agent baseline for required common fields, hash policy, URI policy, collection mapping modes, security rules and validation expectations. It is a standards object, not an ordinary project manifest. |
| [`schemas/xtrata-schema-manifest.json`](schemas/xtrata-schema-manifest.json) | Template for describing schemas and validation profiles as Xtrata objects. | Use it when publishing a reusable JSON schema, field model, validation profile, examples or schema migration guide as an inscribable manifest. |

Related standards outside this folder:

- [`../xtrata-collection-manifest-standard.md`](../xtrata-collection-manifest-standard.md)
  defines the collection-level control document.
- [`../xtrata-manifest-validation.md`](../xtrata-manifest-validation.md)
  defines validation levels, canonicalization, error codes and validation report
  shape.

## Root Quick-Start Templates

The numbered root files are the most common templates placed at the top level so
builders can find them quickly. Each one is also present in its specialist
folder with identical content.

| Root File | Specialist Copy | Best First Use |
| --- | --- | --- |
| [`01-collection-minimal-marketplace-manifest.json`](01-collection-minimal-marketplace-manifest.json) | [`collections/minimal-marketplace-manifest.json`](collections/minimal-marketplace-manifest.json) | New Xtrata-native art collection or compact marketplace launch. |
| [`02-namespace-manifest.json`](02-namespace-manifest.json) | [`identity-and-names/xtrata-namespace-manifest.json`](identity-and-names/xtrata-namespace-manifest.json) | `.x` namespace root, naming rules and resolver standards. |
| [`03-data-vault-manifest.json`](03-data-vault-manifest.json) | [`data/xtrata-data-vault-manifest.json`](data/xtrata-data-vault-manifest.json) | Structured archive, dataset, encrypted bundle or machine-readable data store. |
| [`04-runtime-app-manifest.json`](04-runtime-app-manifest.json) | [`runtime-and-agents/xtrata-runtime-app-manifest.json`](runtime-and-agents/xtrata-runtime-app-manifest.json) | Interactive app, HTML runtime, renderer, game, widget or sandboxed module. |
| [`05-financial-protocol-manifest.json`](05-financial-protocol-manifest.json) | [`finance/xtrata-financial-protocol-manifest.json`](finance/xtrata-financial-protocol-manifest.json) | DeFi or financial protocol description for wallets, indexers and auditors. |
| [`06-asset-token-manifest.json`](06-asset-token-manifest.json) | [`finance/xtrata-asset-token-manifest.json`](finance/xtrata-asset-token-manifest.json) | Fungible, semi-fungible, wrapped, receipt or LP-style token metadata. |
| [`07-treasury-split-manifest.json`](07-treasury-split-manifest.json) | [`finance/xtrata-treasury-split-manifest.json`](finance/xtrata-treasury-split-manifest.json) | Revenue split, royalty routing, treasury policy or payment history. |

Use the root files when you want a fast starting point. Use the specialist
folders when you want to browse a family of related manifests.

## Collection Manifests

Collection manifests are the canonical control documents for Xtrata-backed
collections. They are broader than per-token NFT metadata. They can preserve
collection identity, supply, item mappings, provenance, reconstruction rules,
marketplace fields, traits, rights, runtime assets, audio and validation reports.

### Minimal Marketplace Collection

Files:

- [`01-collection-minimal-marketplace-manifest.json`](01-collection-minimal-marketplace-manifest.json)
- [`collections/minimal-marketplace-manifest.json`](collections/minimal-marketplace-manifest.json)

Use this for a simple fixed collection where the primary job is marketplace
display and item resolution. The current example is a DYLE/Fak.fun-style
three-piece Xtrata-native art collection.

It is useful when:

- the items are already fixed;
- item count is small enough for explicit mapping;
- each collection index maps directly to a known Xtrata inscription;
- no custom resolver contract is needed;
- the marketplace needs display data, royalties, rights and verified hashes.

The key idea is `itemMap.mappingType = explicit`: marketplaces read the manifest,
look up the requested item index, fetch the Xtrata inscription, verify the hash
and render by MIME type.

### Preservation Migration Collection

File:

- [`collections/preservation-migration-manifest.json`](collections/preservation-migration-manifest.json)

Use this for a fixed migration or archive, especially a large sequential set
such as a Froggies-style 10,000-piece preservation project.

It is useful when:

- an older collection depends on fragile storage or an abandoned protocol;
- original item order must be preserved;
- the Xtrata migration is pre-inscribed;
- item-to-inscription mapping can be represented by a range formula;
- source provenance, migration operator, source archive hash and holder
  snapshot matter.

The current example uses a sequential mapping from original item IDs 1 through
10,000 to Xtrata inscription IDs 25,000 through 34,999. A resolver contract is
not necessary when the mapping is permanent, deterministic and hash-verified.

Before calling this production-ready, align the final `mappingType` with the
v1.0 recommendation in the alignment report: `sequential-range` rather than the
older draft value `sequential`.

### Audiovisual Preservation Collection

File:

- [`collections/audiovisual-preservation-manifest.json`](collections/audiovisual-preservation-manifest.json)

Use this for audiovisual archives where images alone are not enough. The current
example is an NFTs-for-Peace-style 500-piece collection with visuals, audio,
metadata, generated works, human-created works and historical context.

It is useful when:

- each item may have visual and audio assets;
- playback rules, looping, duration, BPM or key matter;
- generated output is canonical but generator context should still be preserved;
- source collection references and creator notes matter;
- a chunked item map is better than one large explicit map.

The key idea is preservation-first reconstruction: the preserved outputs are the
canonical display assets, while generator data can explain history and process.

Before final v1.0, align the mapping enum with the recommendation
`chunked-explicit` rather than the older draft value `chunked`.

### Full Composable Collection

Files:

- [`collections/full-composable-manifest.json`](collections/full-composable-manifest.json)
- [`runtime-and-agents/full-composable-runtime-collection-manifest.json`](runtime-and-agents/full-composable-runtime-collection-manifest.json)

Use this for a Level 3 collection that behaves more like a creative system than
a static set of media. The current example combines Audionals-style music,
BVST-style runtime modules, deterministic generation, live minting and sandboxed
HTML rendering.

It is useful when:

- the collection is live-minted or capped rather than fully fixed;
- item mapping is controlled by a resolver contract;
- runtime dependencies, WASM modules, renderers or entrypoints must be verified;
- audio stems, mixes, BPM, key, loops and sample provenance matter;
- deterministic seed policy and reference outputs are important;
- marketplaces need sandbox rules before rendering HTML or JavaScript.

The key idea is `itemMap.mappingType = resolver`: the resolver answers live item
mapping questions, while the manifest explains the system, dependencies, rights,
display rules and validation expectations.

## Identity And Names

Identity and naming manifests make Xtrata objects addressable and verifiable by
humans without weakening the underlying proof model.

### Namespace Root Manifest

Files:

- [`02-namespace-manifest.json`](02-namespace-manifest.json)
- [`identity-and-names/xtrata-namespace-manifest.json`](identity-and-names/xtrata-namespace-manifest.json)

Use this as the root definition for Xtrata-native `.x` names. It defines the
namespace purpose, non-goals, reserved-name policy, registry contract interface,
resolver standard, name record shape, linked manifest roles, resolution paths,
reverse resolution rules, wallet hints, marketplace hints and threat model.

It is useful when:

- a wallet, collection, runtime, app, data vault or agent needs a human-readable
  handle such as `jim.x`, `dyle.x`, `froggies.x` or `agent.x`;
- marketplaces need to display names only after registry verification;
- wallets need forward and reverse resolution before using a name for identity
  or payment routing;
- names need to point at collection manifests, profiles, avatars, runtimes,
  archives or external URLs.

The important trust rule is that the registry contract proves uniqueness and
current ownership. Resolver manifests provide rich records. Linked target
manifests define the actual collection, identity, runtime, archive or data
object. A manifest-only alias can be useful for local labels, but not for
global ownership claims.

### Identity Attestation Manifest

File:

- [`identity-and-names/xtrata-identity-attestation-manifest.json`](identity-and-names/xtrata-identity-attestation-manifest.json)

Use this to describe a person, organisation, creator profile, publisher,
archivist, protocol team or agent controller. It links display identity to
wallet subjects, `.x` names, public keys, verified URLs, attestations and
recovery policy.

It is useful when:

- creator or publisher signatures need a profile context;
- a preservation operator needs to explain its authority;
- verified URLs, DNS proofs or signed messages should be recorded;
- identity data should be reusable across collection, rights, treasury and
  protocol manifests.

It should not replace namespace ownership checks. For canonical `.x` ownership,
verify the namespace registry. For real-world identity trust, verify the
attestations and evidence.

## Data Manifests

Data manifests make structured information reconstructable. They are useful for
archives, datasets, snapshots, logs, bridge mappings, validation artifacts and
machine-readable records that should survive beyond a website or API.

### Data Vault Manifest

Files:

- [`03-data-vault-manifest.json`](03-data-vault-manifest.json)
- [`data/xtrata-data-vault-manifest.json`](data/xtrata-data-vault-manifest.json)

Use this for a structured data vault, archive, dataset, encrypted bundle or
machine-readable data store. It declares the data model, schema manifest, record
type, chunk registry, access policy, provenance and reconstruction instructions.

It is useful when:

- large datasets need chunking and hash verification;
- collection traits, historical exports, source metadata or validation artifacts
  should be stored as records;
- records may be public, encrypted or controlled by a write policy;
- indexers need expected record counts and cache policy.

Consumers should load the schema manifest, load chunk metadata, fetch chunk
inscriptions, verify hashes and parse records according to the declared schema.

### Event Log Manifest

File:

- [`data/xtrata-event-log-manifest.json`](data/xtrata-event-log-manifest.json)

Use this for append-only history: protocol activity, provenance events, holder
snapshots, claims, governance actions, validation runs or audit trails.

It is useful when:

- history must not be rewritten;
- corrections should be appended as new events;
- segments need contiguous ranges and a hash chain;
- a publisher signature is required for log entries.

The event log is the right companion for systems where the latest manifest tells
the current truth, but the project also needs a durable audit trail of what
happened over time.

### Bridge And Cross-Chain Manifest

File:

- [`data/xtrata-bridge-crosschain-manifest.json`](data/xtrata-bridge-crosschain-manifest.json)

Use this for migrations, mirrors, wrapped assets, cross-chain references and
proof mappings. It declares the source chain or protocol, destination Xtrata
context, mapping file, proofs, claim contract and replay protection.

It is useful when:

- an Ethereum, Bitcoin, Ordinals, Stacks or other source object is mirrored into
  Xtrata;
- a holder snapshot or claim flow must be proven;
- source-to-destination mapping has exceptions or proof bundles;
- wrapped assets or migration receipts need a clear source and destination.

It should be paired with a collection manifest for migrated collections, an
asset-token manifest for wrapped assets, or a data vault/event log when the map
or proof history is large.

## Runtime And Agent Manifests

Runtime manifests make executable or interactive Xtrata objects inspectable
before they are run.

### Runtime App Manifest

Files:

- [`04-runtime-app-manifest.json`](04-runtime-app-manifest.json)
- [`runtime-and-agents/xtrata-runtime-app-manifest.json`](runtime-and-agents/xtrata-runtime-app-manifest.json)

Use this for a standalone interactive app, HTML runtime, renderer, game, wallet
widget or sandboxed module. It declares entrypoints, runtime requirements, asset
registry, dependencies, permissions, deterministic seed policy, reconstruction
steps and security expectations.

It is useful when:

- a wallet or marketplace needs to know whether content can be previewed safely;
- JavaScript, HTML, WASM or renderer dependencies must be hash-verified;
- deterministic output should be reproducible from seeds;
- external network, filesystem, wallet connection or dangerous APIs need clear
  policy.

The validation baseline should require entrypoints to resolve, hashes to match
and sandboxing to be declared before runtime content is rendered.

### Full Composable Runtime Collection

File:

- [`runtime-and-agents/full-composable-runtime-collection-manifest.json`](runtime-and-agents/full-composable-runtime-collection-manifest.json)

This is the runtime-family copy of the full composable collection template. Use
it when browsing the runtime and agent folder, especially if the collection's
main identity is a software-like, music-like or BVST-like runtime system.

It is useful when the project is both a collection and an executable artifact.
The collection fields handle supply, item mapping, marketplace display and
rights. The runtime, audio and software sections handle modules, dependencies,
stems, seeds, reproducibility and sandbox policy.

### Agent Memory Manifest

File:

- [`runtime-and-agents/xtrata-agent-memory-manifest.json`](runtime-and-agents/xtrata-agent-memory-manifest.json)

Use this for an AI agent identity, immutable memory log, data-source policy,
tool-permission policy and signed output trail.

It is useful when:

- an agent should have a canonical namespace and controller;
- model metadata, prompt hashes or weights references should be recorded;
- memory should be append-only and correction-based rather than silently edited;
- data vault access and tool permissions need to be auditable;
- generated outputs should be signed and logged;
- transactions, identity updates or financial claims require human approval.

This template is especially useful when agents interact with Xtrata manifests or
on-chain systems. It gives wallets, users and auditors a way to inspect what an
agent is allowed to read, write, sign or trigger.

## Finance Manifests

Finance manifests document financial systems so users and tools can inspect
contracts, assets, read-only calls, write surfaces, permissions, risk, audits and
dependencies. They should never be treated as the source of balances, reserves
or user positions. Contract state remains canonical.

### Financial Protocol Manifest

Files:

- [`05-financial-protocol-manifest.json`](05-financial-protocol-manifest.json)
- [`finance/xtrata-financial-protocol-manifest.json`](finance/xtrata-financial-protocol-manifest.json)

Use this for a DeFi or financial protocol: liquidity pools, lending systems,
routers, factories, fee collectors, protocol dashboards or other financial
contracts.

It is useful when:

- wallets need to display protocol contracts and risk warnings;
- indexers need read-only calls such as reserves, positions, fees and admins;
- auditors need public and admin function surfaces;
- dangerous functions, emergency controls, upgrade policy and timelocks should
  be visible;
- oracle dependencies and audit reports should be linked.

The manifest explains how to inspect the system. It does not make financial
state true by itself.

### Asset Token Manifest

Files:

- [`06-asset-token-manifest.json`](06-asset-token-manifest.json)
- [`finance/xtrata-asset-token-manifest.json`](finance/xtrata-asset-token-manifest.json)

Use this for a fungible, semi-fungible, wrapped, receipt or LP-style asset. It
declares symbol, token standard, contract ID, decimals, display assets, supply
policy, issuer, backing or redemption rules, permissions, markets, risks and
wallet/indexer hints.

It is useful when:

- a token needs a canonical Xtrata description beyond `token-uri`;
- wrapped assets need backing and redemption context;
- LP or receipt tokens need their mint/burn policy documented;
- wallet UIs need safe icons, balance functions and risk notes;
- markets and issuers should be verified by manifest hash and signature.

Pair it with a bridge manifest for wrapped or mirrored assets, a financial
protocol manifest for protocol-issued tokens, and a governance manifest if token
holders control upgrades or treasury policy.

### Treasury Split Manifest

Files:

- [`07-treasury-split-manifest.json`](07-treasury-split-manifest.json)
- [`finance/xtrata-treasury-split-manifest.json`](finance/xtrata-treasury-split-manifest.json)

Use this for royalties, revenue splits, team treasuries, payment histories or
protocol fee routing. It declares payment assets, recipients, basis points,
locking, payout rules, amendment policy, linked manifests, read-only calls and
history reports.

It is useful when:

- an art drop or music collection needs transparent royalty routing;
- a protocol needs a visible fee collector or treasury policy;
- recipients need stable attribution and locked split terms;
- marketplaces need basis-point validation and payout hints;
- payment history reports should be linked or inscribed.

The main validation rule is that recipient basis points must sum to the declared
total and recipient principals must be valid.

### Oracle And Index Manifest

File:

- [`finance/xtrata-oracle-index-manifest.json`](finance/xtrata-oracle-index-manifest.json)

Use this for oracle feeds, indexer outputs, snapshots, external state
attestations and staleness policies. It declares publisher identity, signing key,
data feeds, update frequency, staleness windows, publication method, verification
method, consumers and known risks.

It is useful when:

- a financial protocol depends on price feeds or indexed data;
- a consumer contract must reject stale values;
- off-chain source data needs signed payloads and hash-verifiable history;
- users need to see publisher failure, stale data or manipulation risk.

Pair it with financial protocol manifests for DeFi systems and event logs for
historical feed publications.

## Governance And Rights Manifests

Governance and rights manifests explain who can change a system and what use is
allowed.

### Governance Manifest

File:

- [`governance-and-rights/xtrata-governance-manifest.json`](governance-and-rights/xtrata-governance-manifest.json)

Use this for DAO, protocol, collection, namespace or treasury governance. It
declares governance contracts, voting token, voting power function, quorum,
approval threshold, proposal period, timelock, proposal functions, roles,
controlled contracts, treasuries and governance risks.

It is useful when:

- a protocol has upgradeable contracts;
- a collection or namespace has guardian powers or dispute processes;
- a treasury is controlled by votes or timelocks;
- wallets need to display proposal metadata and emergency powers;
- users need to understand governance capture, low quorum or admin risk.

Pair it with financial protocol, treasury split, namespace or collection
manifests depending on what governance controls.

### Rights And License Manifest

File:

- [`governance-and-rights/xtrata-rights-license-manifest.json`](governance-and-rights/xtrata-rights-license-manifest.json)

Use this for reusable rights packages, licenses, commercial terms, AI policy,
sample provenance, attribution and legal text.

It is useful when:

- multiple collections or assets share one rights package;
- commercial use, derivatives, redistribution, sublicensing or stem extraction
  need machine-readable policy;
- AI training, inference, style imitation or dataset inclusion terms matter;
- sample provenance and credit lines should be preserved;
- legal text and machine-readable terms should be linked by hash.

Pair it with collection, audiovisual, runtime, data vault and treasury manifests
whenever rights need more detail than a short collection-level summary.

## Schema Manifests

Schema manifests let Xtrata publish not just objects, but also the rules for
parsing and validating those objects.

### Core Manifest Standard Object

File:

- [`schemas/xtrata-core-manifest-standard.json`](schemas/xtrata-core-manifest-standard.json)

Use this as a machine-readable baseline for repo agents and validators. It
declares required common top-level sections, required manifest fields, canonical
inscription fields, allowed statuses and networks, hash policy, URI policy,
collection mapping rules, security expectations and validation expectations.

It is useful when:

- checking whether templates share the same spine;
- generating validator requirements;
- writing a new manifest family;
- enforcing the design principle that token URI is supplemental, not the content
  source of truth.

### Schema Manifest Template

File:

- [`schemas/xtrata-schema-manifest.json`](schemas/xtrata-schema-manifest.json)

Use this when a schema itself should be treated as an Xtrata object. It can point
to a JSON Schema inscription, field descriptions, validation profiles, examples,
compatible versions and migration instructions.

It is useful when:

- a manifest family needs a strict validator;
- schema versions should be published and superseded cleanly;
- examples and migration instructions should be hash-bound;
- wallets or developer tools need to discover validation profiles from Xtrata.

## Common Project Combinations

Most real projects will use more than one manifest. These combinations are good
starting points.

### Simple Marketplace Art Launch

Use:

- minimal marketplace collection manifest;
- treasury split manifest;
- rights/license manifest if rights are more complex than the collection summary;
- identity attestation manifest for creator and publisher verification;
- namespace manifest records such as `dyle.x` if human-readable resolution is
  desired.

Flow:

```text
dyle.x or marketplace listing
-> collection manifest
-> explicit item map
-> Xtrata core inscription
-> verified image bytes and marketplace display fields
```

### Large Preservation Migration

Use:

- preservation migration collection manifest;
- bridge/cross-chain manifest if source-to-Xtrata proof mapping matters;
- data vault for source metadata exports or large maps;
- event log for migration steps, validation runs and corrections;
- identity attestation manifest for archivist or migration operator;
- rights/license manifest if original rights are known, partial or uncertain.

Flow:

```text
source collection export
-> bridge or migration proof
-> preservation collection manifest
-> sequential range or chunked map
-> Xtrata core inscription
-> validation report and event log
```

### Audiovisual Archive

Use:

- audiovisual preservation collection manifest;
- data vault for metadata, source context or creator notes;
- rights/license manifest for audio, stems, samples, AI and commercial terms;
- event log for preservation and restoration events;
- identity attestation manifest for artists, archivists and publishers.

Flow:

```text
collection manifest
-> chunked item map
-> visual asset + audio asset + playback instructions
-> source/generator context
-> verified preserved output
```

### BVST Or Audionals Runtime Collection

Use:

- full composable collection manifest;
- runtime app manifest if the runtime also stands alone;
- rights/license manifest for stems, samples and generated outputs;
- treasury split manifest for revenue routing;
- namespace records for collection, runtime or subnames;
- event log for releases, amendments and validation reports.

Flow:

```text
collection resolver
-> Xtrata token id
-> runtime entrypoint and dependencies
-> hash verification
-> sandboxed deterministic rendering or playback
```

### DeFi Protocol

Use:

- financial protocol manifest;
- asset-token manifests for protocol, LP, receipt or wrapped tokens;
- treasury split manifest for fee routing;
- oracle/index manifest for price feeds or indexed state;
- governance manifest for upgrades, admin powers and votes;
- event log for audits, releases, incidents and proposal history;
- namespace manifest record such as `{protocol}.x`.

Flow:

```text
protocol namespace
-> financial protocol manifest
-> verified contracts, read-only calls and risk surface
-> linked asset, oracle, treasury and governance manifests
-> contract state remains canonical for balances and positions
```

### Agent Or Automated Workflow

Use:

- agent memory manifest;
- identity attestation manifest for controller or organisation;
- data vault manifests for allowed knowledge sources;
- event logs for decisions, signed outputs and corrections;
- governance manifest if humans or token holders control agent powers.

Flow:

```text
agent.x
-> agent memory manifest
-> declared model, memory logs, data sources and tool permissions
-> signed output log
-> human approval for transactions or financial claims
```

## Validation Expectations

The companion validation standard defines three practical levels:

- Level A checks JSON structure and schema compatibility.
- Level B checks internal references, item maps, chunks, rights, royalties and
  resolver declarations.
- Level C checks network and cryptographic claims such as Xtrata inscription
  resolution, asset hashes, resolver behavior and signatures.

For marketplace use, a manifest should at minimum have:

- Level A pass;
- Level B pass for item mapping;
- no critical security errors;
- manifest hash present;
- valid Xtrata core contract ID;
- resolver mapping or manifest item mapping;
- display fields present;
- rights notes present.

For preservation use, a manifest should also include source provenance,
migration reason, original-to-Xtrata mapping, source archive hash or a documented
reason for absence, archivist notes and verification reports.

For runtime use, a manifest should include entrypoints, dependency hashes,
sandbox requirements, external network policy, reproducibility instructions and
reference output hashes when deterministic rendering is claimed.

## Draft Notes Before v1.0

The current package is a strong modular draft, but a few details should be
settled before the manifest family is treated as production v1.0:

- Standardise final hash formats. The core standard prefers `sha256:<hex>` and
  accepts Xtrata core final hashes as `0x<32-byte-hex>` where applicable.
- Finalise collection mapping enums as `explicit`, `sequential-range`,
  `chunked-explicit` and `resolver`.
- Keep resolver contracts optional for fixed, hash-verified collections.
- Add strict JSON Schemas for each manifest family.
- Treat corrections as superseding manifests or signed amendments rather than
  editing immutable history in place.
- Require clear sandbox declarations for runtime, HTML, JavaScript and WASM
  content.

## Selection Checklist

Use this quick rule when choosing a template:

| Question | Start With |
| --- | --- |
| Is it a collection, drop, migration or archive of items? | Collection manifest. |
| Is it a human-readable name or alias? | Namespace manifest. |
| Is it a person, team, creator, publisher or attestation bundle? | Identity attestation manifest. |
| Is it structured data? | Data vault manifest. |
| Is it historical activity? | Event log manifest. |
| Is it a source-to-destination migration or cross-chain proof? | Bridge/cross-chain manifest. |
| Is it executable, interactive or sandboxed? | Runtime app manifest. |
| Is it an agent with memory, tools or signed outputs? | Agent memory manifest. |
| Is it a protocol with financial contracts? | Financial protocol manifest. |
| Is it a token, wrapped asset, receipt or LP share? | Asset token manifest. |
| Is it a split, royalty route or treasury? | Treasury split manifest. |
| Is it a feed, index, snapshot or attested external state? | Oracle/index manifest. |
| Is it a DAO, voting system, timelock or upgrade policy? | Governance manifest. |
| Is it a license, rights package or AI policy? | Rights/license manifest. |
| Is it a schema or validation profile? | Schema manifest. |

