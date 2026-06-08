# XIP-003: Xtrata Provenance Graph Standard

- Status: Draft
- Category: Standards Track
- Depends on: XIP-001 (manifest envelope)

## Abstract

XIP-003 defines a standard, verifiable **view** over the provenance facts the
Xtrata core already holds. A provenance graph does not create provenance — it
indexes, traverses and presents on-chain truth so wallets, explorers and
marketplaces agree on what the chain already says.

## Core principle

> Provenance is hard. The graph only reveals it.

A provenance graph MUST be reconstructable purely from contract facts. It MUST
NOT introduce a provenance claim the contract cannot confirm. Anything that
cannot be derived from the chain is curatorial context and belongs in an
XIP-001 manifest, not here.

## Source facts (from the Xtrata core)

- creator
- owner (current and, via indexers, transfer history)
- final content hash
- parents
- dependencies
- migration lineage
- sealed status

## Graph model

A provenance graph is a directed graph of inscriptions:

- **Nodes** are inscriptions, identified as `contract:inscriptionId`.
- **Edges** are typed and each edge type maps to a specific contract fact:
  - `parent` — from the contract's parent relation
  - `dependency` — from the contract's dependency relation
  - `migratedFrom` — from migration lineage (pre-migration original → migrated token)
  - `derivedHash` — same final content hash on a different node (advisory; the
    contract's first-seen hash lookup is advisory, so this edge is marked
    non-authoritative)

```json
{
  "standard": "xip-003",
  "version": "1.0.0",
  "type": "provenance-graph",
  "root": "SP....xtrata-v3-2-3:359",
  "edges": [
    { "type": "migratedFrom", "from": "SP....xtrata-v1-1-1:14", "to": "SP....xtrata-v3-2-3:14" },
    { "type": "parent", "from": "SP....xtrata-v3-2-3:360", "to": "SP....xtrata-v3-2-3:359" }
  ]
}
```

## Edge authority

Each edge MUST be independently verifiable against the contract:

- `parent`, `dependency`, `migratedFrom` are **authoritative** (direct contract
  facts).
- `derivedHash` is **advisory** — identical content does not imply a relationship
  of intent. Consumers MUST label it as such and MUST NOT use it to assert
  authenticity.

## Distinguishing parents from dependencies

The Xtrata core keeps **parents** (lineage / "descends from") and
**dependencies** ("requires / references") as separate relations. XIP-003
preserves that separation; collapsing them loses meaning. A recursive
inscription that *uses* another is a `dependency`; an edition that *descends
from* another is a `parent`.

## Migration continuity

`migratedFrom` is the canonical way to express that a token now on the canonical
core is the same logical work as a pre-migration original. Consumers SHOULD
follow `migratedFrom` to present continuous history across the v1 → v2 → v3
lineage without duplicating the asset.

## Provenance graphs as inscriptions

A provenance graph MAY be inscribed (XIP-001 manifest-as-inscription) to make a
*snapshot* permanent and citable, but because it is fully derivable, an
off-chain or indexer-served graph is equally valid as long as every edge
verifies against the chain. Inscribed snapshots SHOULD carry an `integrityRoot`
over their edge set.

## Out of scope

- Curatorial groupings, titles, collection membership → XIP-001.
- Authorship endorsement / display identity → XIP-001 authority + precedence.
- Economic lineage (who got paid) → XIP-002.

## Summary

A provenance graph is a faithful, verifiable lens over the contract's own facts
— never a second, softer source of truth.
