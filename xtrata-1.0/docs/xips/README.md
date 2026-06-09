# Xtrata Improvement Proposals (XIPs)

XIPs define the standards, formats, conventions and interoperability rules for
the Xtrata ecosystem. The contract holds **facts**, manifests hold **meaning**,
and dedicated contracts hold **money** and **names**.

## The corpus

The numbering follows the conceptual stack: governance first, then the two
foundations everything builds on (envelope and identity), then the manifest
semantics, then the cross-cutting resolution layer, then the application layers.

| XIP | Title | Category | Status | Requires |
|-----|-------|----------|--------|----------|
| [000](XIP-000-XIP-Process.md) | XIP Process | Process | Active | — |
| [001](XIP-001-Manifest-Standard.md) | Manifest Envelope, Canonicalisation & Integrity | Standards Track | Draft | 000 |
| [002](XIP-002-Identity-Standard.md) | Canonical Inscription Reference & Identity | Standards Track | Draft | 000, 001 |
| [003](XIP-003-Organisational-Manifests.md) | Organisational Manifests | Standards Track | Draft | 001, 002 |
| [004](XIP-004-Provenance-Graph-Standard.md) | Provenance Graph | Informational | Draft | 001, 002 |
| [005](XIP-005-Namespace-Standard.md) | Namespace | Standards Track | Draft | 001, 002 |
| [006](XIP-006-Indexer-Resolver-Conformance.md) | Indexer & Resolver Conformance | Informational | Draft | 001–005 |
| [007](XIP-007-Marketplace-Standard.md) | Marketplace | Standards Track | Draft | 001, 002, 003, 005, 006 |
| [008](XIP-008-Software-Package-Standard.md) | Software Package | Standards Track | Draft | 001, 002, 004, 006 |

Dependencies are also declared explicitly in each XIP's `Requires` header (see
XIP-000 §5); the table above mirrors them. The numbering is an ordering aid, not
a substitute for the `Requires` graph.

## How they fit together

- **XIP-001** is the foundation: the shared envelope plus the byte-exact
  canonicalisation (RFC 8785 / JCS), SHA-256 hashing, domain-separated Merkle
  (`xtrata-merkle-v1`), and off-chain signing message — with reproducible test
  vectors. Everything else profiles it and inherits these rules unchanged.
- **XIP-002** is the identity spine: contract-qualified references, the real
  id-space offset, single-hop on-chain migration with off-chain multi-hop
  reconstruction, and the corrected reading of the misleadingly-named global fee
  recipient.
- **XIP-003** carries the human-facing vocabulary (collections, albums,
  galleries, exhibitions, archives, playlists) — a clean profile of the envelope.
- **XIP-004** (Informational) is a verifiable *view* over contract provenance,
  never a softer second source of truth.
- **XIP-005** anchors names to BNS/BNSv2 with an explicit pointer-record format
  and deterministic, fail-closed resolution.
- **XIP-006** (Informational) is the shared trust vocabulary and resolution
  algorithm, so independent indexers reach the same answer.
- **XIP-007** trades assets by reading hard facts from the core, verified identity
  from manifests at a known trust tier, and **honestly-described** terms from a
  trait-conformant marketplace contract.
- **XIP-008** stores executable packages with a fully-covering, no-egress
  verified closure.

## Recommended ratification order

Foundations first — **001 and 002** — then **003 / 004 / 005 / 006**, then the
application layers **007 and 008** (see XIP-000 §6: a XIP MUST NOT advance past
Review while a XIP it Requires is below the same status).

## Authoring

New XIPs follow the template and rules in [XIP-000](XIP-000-XIP-Process.md). Any
standard defining a hash, signature, or integrity commitment **MUST** ship
reproducible test vectors and a reference implementation (XIP-000 §9).
