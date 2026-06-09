# XIP-004: Xtrata Provenance Graph

- XIP: 004
- Title: Provenance Graph
- Status: Draft
- Category: Informational
- Requires: XIP-001, XIP-002
- Required-By: XIP-006, XIP-008
- Spec version: 1.0.0

> RFC 2119 / RFC 8174 keywords apply (see XIP-001).
>
> This XIP is **Informational**: it defines a derived *view*, not new on-chain or
> wire behaviour. Per XIP-000 §3, its normative keywords are confined to
> **fidelity constraints** — rules a graph must follow to remain a faithful lens
> over contract facts (e.g. "SHOULD NOT invent edges", "SHOULD label advisory
> edges"). Implementation mechanics (traversal limits, rendering) are expressed as
> SHOULD/MAY guidance.

## Abstract

XIP-004 defines a standard, verifiable **view** over the provenance facts the
Xtrata core already holds. A provenance graph does not create provenance — it
indexes, traverses, and presents on-chain truth so wallets, explorers and
marketplaces agree on what the chain already says. It is **Informational**: it
introduces no new on-chain or wire behaviour, only a faithful lens and the rules
for keeping that lens honest.

## Core principle

> Provenance is hard. The graph only reveals it. Anything the chain cannot
> confirm is curatorial context and belongs in an XIP-003 manifest, not here.

A provenance graph **SHOULD** be reconstructable purely from contract facts
(possibly across contracts, per XIP-002 §4) and **SHOULD NOT** introduce a claim
the chain cannot confirm.

## 1. Source facts (from the core, via XIP-002)

`creator`, current `owner` (and, via indexer event history, prior owners),
`final-hash`, `parents`, `dependencies`, single-hop `migration-source`,
`sealed`, and the advisory first-seen `get-id-by-hash`. List caps (`parents`,
`dependencies` ≤ 50 each) apply (XIP-002 §7).

## 2. Graph model

A directed graph of inscription **nodes**, each identified by the XIP-002
canonical reference `contract:inscriptionId`. Edges are typed; **each edge type
maps to one specific contract fact**:

| Edge `type` | Source fact | Authority | Direction |
|-------------|-------------|-----------|-----------|
| `parent` | `get-parents` | **authoritative + ownership-attested** (§3) | child → parent |
| `dependency` | `get-dependencies` | **authoritative (existence only)** (§3) | dependent → dependency |
| `migratedFrom` | `get-migration-source` (one hop) | **authoritative per hop** (§4) | migrated → source |
| `derivedHash` | `get-id-by-hash` collision | **advisory only** (§5) | later → first-seen |

```json
{
  "standard": "xip-001",
  "specVersion": "1.0.0",
  "type": "provenance-graph",
  "root": "SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-3:359",
  "edges": [
    { "type": "migratedFrom",
      "from": "SP….xtrata-v1-1-1:14",
      "to":   "SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-3:14",
      "verified": true },
    { "type": "parent",
      "from": "SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-3:360",
      "to":   "SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-3:359",
      "verified": true }
  ]
}
```

Node ids **SHOULD** be fully qualified (XIP-002 §1) — a provenance graph spans
contracts and bare ids are ambiguous.

## 3. Parent vs dependency — the authority asymmetry (IMPORTANT)

The core enforces **different invariants** on the two relations, and a faithful
graph **SHOULD** preserve the difference:

- **`parent`** — at seal time the core requires that **the creator owned each
  parent** (`validate-parent` asserts the parent's NFT owner equals the sealing
  `tx-sender`). A `parent` edge therefore attests *"the creator held this work
  when descending from it"* — a stronger, ownership-backed lineage claim. An
  edition that *descends from* another is a `parent`.
- **`dependency`** — the core requires only that **the dependency already existed**
  (`dep-id < next-id` at seal). It carries **no ownership claim**. A recursive
  inscription that *uses/references* another is a `dependency`.

Collapsing the two **SHOULD NOT** happen: it would either fabricate ownership
(treating a dependency as lineage) or discard it (treating lineage as a mere
reference). Consumers presenting "descends from" semantics **SHOULD** use `parent`
only.

## 4. Migration continuity (single-hop fact; multi-hop reconstruction)

`migratedFrom` is **one hop** — the core stores only the immediate predecessor
(XIP-002 §4). A v1 → v2 → v3 history is built by chaining `migratedFrom` across
contracts via XIP-002 §4.2. Therefore:

- Each `migratedFrom` edge is authoritative **for its single hop**, and **only if
  the source contract is reachable and the source token's record confirms it**.
- A consumer presenting multi-hop continuity **SHOULD** label it as an indexer
  reconstruction and **SHOULD** mark any hop whose source contract could not be
  verified with `"verified": false`.
- Canonical asset identity across the chain is the live canonical-core token
  (XIP-002 §4.3); the graph presents older tokens as historical, de-duplicated
  aliases, never as separate assets.

## 5. `derivedHash` is advisory (anti-spoof)

`get-id-by-hash` returns the **first** token sealed for a content hash (the core
uses `map-insert`, preserving the original). Identical content does **not** imply
intent, authorship, or relationship. The `derivedHash` edge:

- **SHOULD** be labelled advisory/non-authoritative wherever displayed,
- **SHOULD NOT** be used to assert authenticity, authorship, or "original vs copy,"
- **MAY** be surfaced as "same bytes also seen at …" for user awareness only.

This blocks the "my copy points at your original, so it looks endorsed" spoof.

## 6. Cycles, bounds, and traversal

- **Native edges are acyclic by core invariant.** `dependency` targets always
  have smaller ids (existed before seal) and `parent` targets are
  previously-sealed owned tokens — both strictly precede the sealing token within
  a contract, so native `parent`/`dependency` subgraphs are **DAGs by
  construction.** Cycle handling is therefore needed **only** across contracts
  (migration chains) and for the advisory `derivedHash` edge.
- A traversal **SHOULD** bound depth and total nodes (recommended defaults: depth
  ≤ 64, nodes ≤ 10,000) and **SHOULD** detect and break cross-contract cycles
  (track visited `contract:id`) — unbounded or cyclic traversal would not
  faithfully terminate.
- Fan-out per node is bounded by the core's 50-entry caps on each relation
  (XIP-002 §7); deep closures still require iterative expansion.

## 7. Snapshots & caching

- A graph **MAY** be inscribed (XIP-001 manifest-as-inscription) to make a
  **snapshot** permanent and citable. Because it is fully derivable, an
  off-chain/indexer-served graph is equally valid **as long as every edge
  re-verifies against the chain.**
- Inscribed snapshots **SHOULD** carry an `integrity.root` (XIP-001 §4.4) over
  the edge set; the leaf for an edge is the JCS bytes of
  `{ type, from, to }` (the `verified` flag is a presentation hint and is
  excluded from the leaf).
- Cached graphs **SHOULD** record an `asOfBlock`; owner/transfer history and
  `derivedHash` results are time-sensitive and **SHOULD** be re-validated before
  use in a trust decision (e.g. a marketplace sale).

## 8. Display rules (do not mislead)

- Authoritative edges (`parent`, `dependency`, verified `migratedFrom`) and
  advisory edges (`derivedHash`, unverified migration hops) **SHOULD** be visually
  distinguished.
- A UI **SHOULD NOT** render `derivedHash` as authorship or "verified original"
  (a fidelity/anti-spoof constraint, not mere styling).
- Multi-hop migration **SHOULD** render as one continuous asset with an expandable
  history, not as multiple assets.

## 9. Out of scope

- Curatorial groupings, titles, membership → XIP-003.
- Authorship endorsement / display identity → XIP-001 §5.2 precedence.
- Economic lineage (who got paid) → XIP-007.

## 10. Conformance

- **SHOULD** reconstruct every edge from contract facts; **SHOULD NOT** invent edges.
- **SHOULD** preserve the parent/dependency asymmetry (§3).
- **SHOULD** label advisory edges and unverified migration hops (§5, §4).
- **SHOULD** use fully-qualified node ids and cycle-protect traversal; **SHOULD**
  bound traversal depth/size (§2, §6).

## Summary

A provenance graph is a faithful, verifiable lens over the contract's own facts —
preserving the parent/dependency distinction, treating identical-hash as advisory,
reconstructing migration across contracts honestly, and never becoming a second,
softer source of truth.
