# XIP-001: Xtrata Manifest Standard

- Status: Draft
- Category: Standards Track
- Manifest format version: 1.0.0
- Supersedes: (none)

## Abstract

XIP-001 defines a standard **manifest** format for describing, organising and
presenting data inscribed on Xtrata. A manifest is *curatorial context* layered
on top of the *authoritative facts* the Xtrata contract already preserves.

This revision narrows XIP-001 to **organisational / curatorial** manifests and
hands authority-, uniqueness-, economics- and provenance-heavy concerns to the
standards that are built for them (XIP-002 marketplace, XIP-003 provenance,
XIP-004 namespace, XIP-005 packages).

## Core principle

> The contract preserves facts. The manifest preserves context.

A manifest **must not** override, contradict or re-assert any fact the contract
already holds. Where the contract is silent (a title, an ordering, a curatorial
grouping), the manifest may speak.

## Canonical core (single contract)

Going forward Xtrata is a **single canonical core** — the current v3 contract.
Earlier cores (v1, v2) are historical: their tokens are migrated into the
canonical core before being organised or sold, so in practice every manifest
references **one** contract.

- A token is identified by `inscriptionId` against the canonical core.
- A `contract` field MAY be supplied for historical or cross-core references; if
  omitted, consumers resolve against the canonical core.
- **Migration lineage stays a hard contract fact.** A token migrated from a
  prior core carries its lineage on-chain; manifests rely on that fact rather
  than restating it. Two records that are the same logical work across a
  migration are reconciled by the contract's lineage, not by the manifest.

## Hard provenance (contract facts — never restated by a manifest)

- creator
- owner
- final content hash
- mime type
- sealed status
- parents
- dependencies
- migration lineage
- **Xtrata fee recipient** — the contract's `get-royalty-recipient` is the
  recipient of **Xtrata storage/protocol fees** (paid to inscribe data). It is
  **not** a secondary-sale royalty. Spec consumers MUST NOT interpret it as one.
  Sale economics are out of scope for the core and for manifests (see
  *Economics & the marketplace boundary*).

Manifests must not override contract-level facts.

## Soft provenance (manifest context)

- title
- description
- artist display name
- collection / album / exhibition membership
- traits
- display order
- curatorial notes

All soft. Many manifests may describe the same inscription differently; that is
expected and legitimate.

## Manifests are Xtrata inscriptions

A conformant manifest **SHOULD itself be an Xtrata inscription** on the canonical
core. This is the only option consistent with XIP-000's principles (Permanence,
Verifiability, Decentralisation): a manifest that organises permanent on-chain
data but lives on a server reintroduces the pointer-rot Xtrata exists to remove.

Inscribing the manifest cascades cleanly:

- **Authority becomes verifiable for free** — the manifest inscription's
  contract-attested `creator` *is* its authority. No separate signed assertion
  is required.
- **Versioning is on-chain** — a new manifest version is a new inscription whose
  `parents` include the prior version. Supersession is a verifiable fact.
- **Integrity is sealed** — the manifest's content hash is held by the contract.

Recommended mime type for manifest inscriptions:
`application/vnd.xtrata.manifest+json`, so explorers and indexers can detect
them.

Off-chain manifests (URL/IPFS) are PERMITTED only as an explicitly lower-trust
tier (drafts, dynamic previews) and MUST be treated as non-authoritative.

For very large collections, a manifest MAY inscribe an **integrity commitment**
(a Merkle root over the resolved member set) rather than every item inline; the
expanded list may then live off-chain and be verified against the on-chain root.

## Root structure

```json
{
  "standard": "xip-001",
  "version": "1.0.0",
  "type": "collection",
  "name": "Example Collection"
}
```

## Authority

Authority is **verifiable**, not asserted.

- **Default (manifest-as-inscription):** authority is the manifest inscription's
  on-chain `creator`. No `authority` block is needed.
- **Off-chain / detached manifests:** MUST include a signature over the
  canonical manifest hash (see *Canonicalisation & integrity*) by the
  authority key:

```json
{
  "authority": {
    "type": "creator | owner | curator | delegated | contract",
    "address": "SP...",
    "signature": "..."
  }
}
```

### Conflict precedence

Because multiple manifests may reference the same inscription, consumers
resolving a *display identity* MUST apply, in order:

1. A manifest authored on-chain by the referenced token's `creator`.
2. A manifest authored on-chain by the token's current `owner`.
3. A manifest anchored to a namespace the authority verifiably controls (XIP-004).
4. Otherwise: treat as an unendorsed third-party view.

A manifest in tier 4 MUST NOT be presented as the canonical identity of a token
it does not own or create.

## Canonicalisation & integrity

Every verifiability claim depends on a single serialisation. Manifests MUST be
canonicalised before hashing or signing:

- UTF-8, object keys sorted lexicographically, no insignificant whitespace,
  no floating-point ambiguity (integers for ids).
- The manifest hash is `sha256` of the canonical bytes. For inscribed manifests
  this equals the contract's sealed content hash.
- Member sets that use an integrity commitment MUST specify the Merkle leaf
  encoding (`contract:inscriptionId` canonical string) and ordering.

## Manifest types (organisational only)

```
collection | album | gallery | exhibition | archive | playlist
```

The following are **out of scope** for XIP-001 and are defined by their own
standards; they MUST NOT be expressed as XIP-001 manifest types:

- provenance graphs → XIP-003 (a verifiable *view* over contract facts, never a
  soft re-assertion of provenance)
- namespaces → XIP-004 (a uniqueness/registry problem; see *Namespaces*)
- software packages → XIP-005
- marketplace launches → XIP-002 (economics live in a contract, see below)

XIP-001 is the **common envelope** (`standard / version / type / authority /
mapping / integrity`); XIP-002–005 profile it rather than duplicate it.

## Mapping

### Explicit (canonical)

The default. Each member is named and MAY carry its own integrity hash.

```json
{
  "mapping": {
    "type": "explicit",
    "items": [
      { "inscriptionId": 359, "order": 1 },
      { "inscriptionId": 360, "order": 2 }
    ]
  }
}
```

### Sequential (optional compression)

Permitted only with all of: explicit bounds, a contract reference (defaults to
the canonical core), an `exclusions` list for gaps/swaps, and an integrity
commitment so the resolved set is tamper-evident. Sequential mapping alone — as
in the prior draft — is unsafe over real id spaces, which contain gaps and
migration offsets.

```json
{
  "mapping": {
    "type": "sequential",
    "contract": "SP....xtrata-v3-2-3",
    "inscriptionStart": 360,
    "inscriptionEnd": 10359,
    "exclusions": [412, 588],
    "integrityRoot": "0x..."
  }
}
```

### Predicate (optional, dynamic)

By hash-set, creator, or trait — for generative or open-ended sets. Predicate
mapping depends on an indexer and is therefore a lower trust tier; it SHOULD
carry an integrity root snapshot for any fixed point in time.

## Collection relationships

- Collections reference inscriptions; inscriptions need not reference
  collections.
- Multiple manifests may reference the same inscription (resolved by *Conflict
  precedence*).
- A manifest MAY express membership through the contract's `dependencies` graph
  when it is itself an inscription, so relationships become on-chain facts.

## Economics & the marketplace boundary

Xtrata stores data. It does not price, sell, or split proceeds, and **manifests
never carry economic terms**.

- The Xtrata core's fee recipient covers **storage/protocol fees only**.
- **Secondary-sale economics are handled by a separate marketplace contract**
  that connects to the Xtrata core and enforces the split on-chain — for example
  a protocol fee split between the marketplace, a platform operator, and the
  artist. Any such figures are illustrative and are governed by the marketplace
  contract, not by this standard.
- A manifest MAY carry a **pointer** to the governing economics contract, never
  the terms themselves:

```json
{
  "economics": {
    "contract": "SP....marketplace-v1",
    "note": "Sale terms enforced on-chain by the marketplace contract."
  }
}
```

Authoritative collection identity (so a marketplace can reject fakes and group
listings correctly) is established by *Authority* + *Conflict precedence* above,
ideally namespace-anchored (XIP-004). Marketplace read/verify interfaces are
defined in XIP-002.

## Namespaces

Naming is a **uniqueness** problem and is out of scope for XIP-001's
non-exclusive manifests. XIP-004 defines namespace support by anchoring names to
an existing on-chain uniqueness primitive (BNS / BNSv2) the authority verifiably
controls, rather than inventing a manifest-based registry. A namespace then
resolves to a manifest inscription published by the verified name owner.

## Versioning & supersession

Manifest versions form a chain via the contract's `parents` graph: a new version
inscribes the prior version id as a parent. Consumers follow the chain from the
authority to find the latest authoritative version. `version` in the root
structure tracks the *format* version; supersession of a specific manifest is an
on-chain relationship, not a field.

## Relationship to other XIPs

- XIP-002 Marketplace — read/verify interface and on-chain economics boundary.
- XIP-003 Provenance — verifiable views over contract facts (not soft claims).
- XIP-004 Namespace — BNS-anchored naming and resolution.
- XIP-005 Software Package — package profile of this envelope.

## Summary

The Xtrata contract preserves content and provenance. The manifest layer
preserves meaning and organisation — verifiably, by being an inscription itself,
referencing one canonical core, asserting only soft context, and pointing at
(never defining) the contracts that govern names and money.
