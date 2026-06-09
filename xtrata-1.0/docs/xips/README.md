# Xtrata Improvement Proposals (XIPs)

XIPs define the standards, formats, conventions and interoperability rules for the Xtrata ecosystem.

The simple rule is:

> The contract holds **facts**.  
> Manifests hold **meaning**.  
> Dedicated contracts and name systems hold **money** and **names**.

Xtrata inscriptions preserve bytes on-chain. XIPs explain how those bytes should be described, grouped, resolved, verified, displayed, traded and composed by wallets, indexers, marketplaces, explorers and applications.

## The corpus

The current XIP corpus is:

| XIP | Title | Category | Status | Requires |
|---|---|---|---|---|
| [000](XIP-000-XIP-Process.md) | XIP Process | Process | Active | — |
| [001](XIP-001-Manifest-Standard.md) | Manifest Envelope, Canonicalisation & Integrity | Standards Track | Draft | 000 |
| [002](XIP-002-Identity-Standard.md) | Canonical Inscription Reference & Identity | Standards Track | Draft | 000, 001 |
| [003](XIP-003-Organisational-Manifests.md) | Organisational Manifests | Standards Track | Draft | 001, 002 |
| [004](XIP-004-Provenance-Graph-Standard.md) | Provenance Graph | Informational | Draft | 001, 002 |
| [005](XIP-005-Namespace-Standard.md) | Namespace | Standards Track | Draft | 001, 002 |
| [006](XIP-006-Indexer-Resolver-Conformance.md) | Indexer & Resolver Conformance | Standards Track | Draft | 001–005 |
| [007](XIP-007-Marketplace-Standard.md) | Marketplace | Standards Track | Draft | 001, 002, 003, 005, 006 |
| [008](XIP-008-Software-Package-Standard.md) | Software Package | Standards Track | Draft | 001, 002, 004, 006 |

Dependencies are declared explicitly in each XIP's `Requires` header. The table above mirrors those headers.

XIP numbers are stable identifiers, not the dependency graph itself. The real dependency graph lives in each document's `Requires` and `Required-By` metadata.

## How the XIPs fit together

- **XIP-000** defines the XIP process: how standards are proposed, reviewed, versioned, superseded and advanced.
- **XIP-001** is the manifest foundation: the shared envelope, byte-exact canonicalisation, SHA-256 hashing, Merkle integrity, signing message and test vectors.
- **XIP-002** is the identity spine: contract-qualified references, canonical inscription identity, migration-aware identity, id-space boundaries and fee terminology.
- **XIP-003** defines human-facing organisational manifests: collections, albums, galleries, exhibitions, archives and playlists.
- **XIP-004** defines provenance graph views over contract facts. It does not invent provenance; it displays what the contract proves.
- **XIP-005** defines namespace resolution, including BNS/BNSv2-style naming and fail-closed pointer resolution.
- **XIP-006** defines resolver and indexer conformance, trust tiers and deterministic interpretation rules, so independent systems reach the same answer.
- **XIP-007** defines marketplace interoperability: verified collection identity, marketplace traits, deployed economics and safe listing behaviour.
- **XIP-008** defines software package manifests: entry points, verified file closure, pinned dependencies and safe no-egress execution.

Together, these standards turn Xtrata from a system that stores permanent bytes into a shared ecosystem for permanent, verifiable, composable data.

## On-chain XIP corpus

The XIP corpus is designed to be inscribed on Xtrata itself.

Once the XIP corpus is inscribed, the XIP-000 inscription SHOULD act as the root of the inscribed standards family. Individual XIPs, corpus manifests, schemas, examples, vector scripts and release archives SHOULD reference the XIP-000 inscription as their corpus root.

Each XIP version is immutable. A later version MUST NOT replace or mutate an earlier version. Instead, the later version SHOULD be inscribed as a new document that supersedes the previous version.

For example:

```text
XIP-000
  ├── README
  ├── XIP-001 v1.0.0
  │     └── XIP-001 v1.0.1
  │           └── XIP-001 v1.1.0
  ├── XIP-002 v1.0.0
  ├── XIP Corpus Manifest v1.0.0
  │     └── XIP Corpus Manifest v1.0.1
  └── xips-v1.0.0.zip
```

The parent/supersession graph provides discoverability and historical continuity. It lets people and indexers discover the XIP family and trace the history of each individual XIP.

However, the parent graph SHOULD NOT be the only mechanism used to decide which version is current. A corpus manifest SHOULD provide the current map of the standards set.

## Corpus manifest

A corpus manifest is the machine-readable contents page for a XIP release.

It SHOULD point to:

- the XIP-000 corpus root;
- the current recommended version of each XIP;
- each XIP's status and document version;
- each XIP's inscription reference once inscribed;
- each XIP's document hash;
- related schemas, examples and vector scripts;
- optional release archives, such as a zip snapshot.

When the current standards set changes, a new corpus manifest SHOULD be inscribed. The new corpus manifest SHOULD supersede the previous corpus manifest.

In short:

- **XIP-000** is the permanent root.
- **Each XIP** has its own immutable version chain.
- **The corpus manifest** tells consumers which versions are current.
- **Old versions remain available forever.**
- **Nothing is deleted or overwritten.**

A namespace pointer, such as a BNS/BNSv2 name controlled by the recognised XIP authority, MAY point to the latest corpus manifest for easy discovery. The namespace pointer is a convenience layer for finding the current corpus. It does not erase, replace or mutate earlier inscriptions.

A typical resolution path is:

```text
namespace pointer, known root, or published XIP-000 inscription
  ↓
latest valid corpus manifest
  ↓
current XIP map
  ↓
current version of each XIP
  ↓
older versions via supersession history
```

## Recommended ratification order

Foundations should be ratified before the standards that depend on them.

Recommended order:

1. **XIP-001** and **XIP-002**  
   Manifest integrity and canonical identity.
2. **XIP-003**, **XIP-004**, **XIP-005** and **XIP-006**  
   Organisational vocabulary, provenance views, namespaces and resolver conformance.
3. **XIP-007** and **XIP-008**  
   Marketplace interoperability and software packages.

A XIP SHOULD NOT advance beyond the status of a XIP it requires.

## Authoring

New XIPs follow the template and rules in [XIP-000](XIP-000-XIP-Process.md).

Any XIP defining a hash, signature, Merkle root, integrity commitment, resolver output or other reproducible value MUST include test vectors. Standards that depend on reproducible integrity behaviour SHOULD also include a small reference implementation or vector generator.

The reference vector generator lives at [`vectors/generate.py`](vectors/generate.py). Running `python3 vectors/generate.py` recomputes every reproducible hash in the corpus and verifies it against the value published in the specs (exit non-zero on any mismatch), emitting [`vectors/vectors.json`](vectors/vectors.json).

## Current status

This corpus is currently in Draft.

The documents are intended for review by protocol contributors, indexer implementers, marketplace builders, wallet developers, artists, collectors and other ecosystem participants before any Final status is proposed.
