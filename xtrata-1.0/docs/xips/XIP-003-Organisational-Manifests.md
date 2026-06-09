# XIP-003: Organisational Manifests

- XIP: 003
- Title: Organisational Manifests
- Status: Draft
- Category: Standards Track
- Requires: XIP-000, XIP-001, XIP-002
- Required-By: XIP-006, XIP-007
- Spec version: 1.0.0

> RFC 2119 / RFC 8174 keywords apply (see XIP-001).

## Abstract

XIP-003 defines the **organisational / curatorial** manifest types — the
human-facing groupings of Xtrata inscriptions: collections, albums, galleries,
exhibitions, archives, and playlists. Each is a thin **profile of the XIP-001
envelope**: it adds soft, presentational context and a member set, and adds
nothing to the canonicalisation, hashing, integrity, or authority machinery,
which it inherits unchanged.

This standard was separated from the original XIP-001 so the envelope can be a
clean, universally-reused foundation (and so XIP-008's "a package is not an
organisational type" carve-out becomes unnecessary — packages and collections are
peers, both envelope profiles).

## Core principle

> These manifests carry **meaning, not authority**. They group and present; they
> never assert a fact the contract could contradict.

## 1. Scope

XIP-003 defines envelope `type` values: `collection`, `album`, `gallery`,
`exhibition`, `archive`, `playlist`. They are **non-exclusive**: many manifests
may describe the same inscription differently, and that is legitimate (XIP-001
§5.2 precedence decides which is *canonical* for a given consumer view).

Out of scope (other XIPs): provenance views (XIP-004), names/uniqueness
(XIP-005), packages (XIP-008), marketplace economics (XIP-007). An organisational
manifest **SHOULD NOT** carry economic terms, namespace ownership, or provenance
claims.

## 2. Soft fields (all OPTIONAL, all non-authoritative)

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | Envelope field; display title. |
| `description` | string | Free text. |
| `artistDisplayName` | string | **Display only.** NOT identity — see §5. |
| `cover` | reference | Canonical reference (XIP-002) to a member used as cover art. |
| `tags` | string[] | Free-form. |
| `traits` | object[] | Per-member trait annotations (see §4). |
| `links` | object[] | `{ rel, href }` external links (lower-trust, off-chain). |

All soft fields are curatorial context. A consumer **SHOULD NOT** derive authority,
ownership, or economics from any of them.

## 3. Member set (REQUIRED)

Every organisational manifest **SHOULD** carry an XIP-001 `mapping` (§4 of XIP-001)
and, where `mapping.type` is `sequential` or `predicate`, an `integrity`
commitment. Members are referenced per XIP-002 (contract-qualified, or bare with
`defaultContract`).

```json
{
  "standard": "xip-001",
  "specVersion": "1.0.0",
  "type": "collection",
  "name": "Example Collection",
  "defaultContract": "SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-3",
  "membershipSemantics": "historical",
  "mapping": {
    "type": "explicit",
    "items": [
      { "inscriptionId": 359, "order": 1, "finalHash": "0x…" },
      { "inscriptionId": 360, "order": 2, "finalHash": "0x…" }
    ]
  }
}
```

- `membershipSemantics` (`historical` | `live`, default `historical`) governs
  burned/transferred members per XIP-002 §5.
- For 10,000-item collections, producers **SHOULD** use explicit mapping with an
  `integrity.root`, or sequential mapping that respects the offset boundary
  (XIP-002 §3); the expanded list **MAY** live off-chain and be verified against
  the inscribed root.

## 4. Per-type semantics

All six share the envelope and member-set rules; they differ only in
presentational intent. Consumers **MAY** treat unknown organisational types as
`collection`.

| `type` | Intent | Ordering significance |
|--------|--------|----------------------|
| `collection` | A body of works grouped by a creator/curator. | `order` is display order; not temporal. |
| `album` | Released set with a cover and sequence. | `order` is track/sequence order. |
| `gallery` | Curated visual arrangement. | `order` is hang order. |
| `exhibition` | Time- or theme-bounded show. | `order` is walkthrough; `meta.period` MAY note dates. |
| `archive` | Preservation grouping; completeness valued. | `order` arbitrary; `integrity.root` RECOMMENDED. |
| `playlist` | Sequenced media for playback. | `order` is playback order. |

These distinctions are advisory presentation hints. They introduce **no** new
normative behaviour beyond the envelope.

## 5. Authority & "official" status

Authority is inherited from XIP-001 §5 and resolved by XIP-001 §5.2 precedence:

- An **inscribed** organisational manifest's authority is its `creator`.
- Whether it is the *canonical* collection identity for a token is decided by
  precedence — strongest when **namespace-anchored** (XIP-005), then
  creator-authored, then owner-authored.
- `artistDisplayName` is **never** identity. To present a verified artist,
  resolve via namespace (XIP-005). A manifest claiming an artist name it cannot
  anchor **SHOULD** be shown as unverified (XIP-006 trust tiers).

A consumer grouping listings or building a collection page **SHOULD NOT** present a
tier-4/5 manifest as the official collection (XIP-007 enforces this for
marketplaces).

## 6. Relationships & nesting

- A collection **MAY** reference sub-collections by including child manifest
  references as members (`type`-agnostic references), forming a shallow tree.
  Cycles are PROHIBITED; a consumer **SHOULD** bound traversal depth and reject
  cycles.
- When an organisational manifest is itself an inscription, it **MAY** also
  express membership through the contract's `dependencies`/`parents` graph so the
  relationship becomes an on-chain fact (surfaced by XIP-004). The on-chain
  relation, where present, is stronger than the JSON member list.

## 7. Versioning

Per XIP-001 §6: a new version is a new inscription with the prior as `parent`;
the latest authoritative version is the unique parent-chain tip; forks fail
closed; retraction uses `withdrawn: true`.

## 8. Conformance

- **SHOULD** be a valid XIP-001 envelope (canonicalisation, mapping, integrity,
  authority all per XIP-001).
- **SHOULD** reference members per XIP-002 and honour `membershipSemantics`.
- **SHOULD NOT** carry economics, namespace ownership, or provenance claims.
- **SHOULD** treat `artistDisplayName` and `links` as non-authoritative.

## Summary

Organisational manifests are the friendly face of Xtrata data: titles, covers,
orderings and groupings — a pure profile of the XIP-001 envelope that adds meaning
without ever claiming authority the chain could refute.
