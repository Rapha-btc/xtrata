# XIP-006: Indexer & Resolver Conformance

- XIP: 006
- Title: Indexer & Resolver Conformance
- Status: Draft
- Category: Informational
- Requires: XIP-001, XIP-002, XIP-003, XIP-004, XIP-005
- Spec version: 1.0.0

> RFC 2119 / RFC 8174 keywords apply (see XIP-001).

## Abstract

XIP-006 defines the **shared resolution behaviour and trust vocabulary** that
every Xtrata consumer — wallet, explorer, marketplace, indexer — relies on. The
rest of the corpus repeatedly says "treat as unverified," "lower-trust,"
"advisory," "fail closed," and "latest authoritative version" without ever
defining the tiers or the algorithms in one place. XIP-006 is that place. It
introduces no new on-chain behaviour; it makes independent indexers reach the
**same answer**.

## Core principle

> Two honest indexers given the same chain state and the same reference MUST
> return the same resolution and the same trust tier — or both MUST fail closed.

## 1. Trust tiers (normative vocabulary)

Every resolved identity claim carries exactly one tier. UIs **MUST** map tiers to
distinct visual treatments and **MUST NOT** present a lower tier as a higher one.

| Tier | Label | Meaning | Source |
|------|-------|---------|--------|
| **T1** | `verified-namespace` | Namespace-anchored; BNS owner == manifest creator. | XIP-005 + XIP-001 §5.2(1) |
| **T2** | `verified-creator` | Manifest inscribed by the token's creator. | XIP-001 §5.2(2) |
| **T3** | `verified-owner` | Manifest inscribed by current owner (item display only). | XIP-001 §5.2(3) |
| **T4** | `signed-offchain` | Off-chain manifest with a valid §5.1 signature. | XIP-001 §5.2(4) |
| **T5** | `unendorsed` | Third-party / unverified view. | XIP-001 §5.2(5) |
| **A** | `advisory` | Derivable-but-non-authoritative facts (e.g. `derivedHash`, unverified migration hop). | XIP-004 §4/§5 |

- A "verified" badge **MUST** be reserved for T1–T2 (and T3 only for item display,
  never collection identity).
- T4/T5/A **MUST NOT** be shown as canonical identity.

## 2. Canonical resolution (single algorithm)

```
function resolve(reference):                    # reference per XIP-002
    (contract, id) = qualify(reference)         # apply defaultContract if bare
    asset = readCoreFacts(contract, id)         # XIP-002 §7 getters
    if asset is none: return NotFound

    asset.migration = migrationChain(contract, id)     # XIP-002 §4.2 (label hops)
    asset.canonicalId = canonicalAssetId(asset)        # XIP-002 §4.3 (live token)

    identity = resolveIdentity(asset)           # §3 -> {manifest, tier} | none
    return { asset, identity }
```

All consumers **MUST** key assets by `canonicalId` so a migrated asset and its
originals collapse to one (XIP-002 §4.3).

## 3. Identity resolution (the §5.2 ladder, made executable)

```
function resolveIdentity(asset):
    # tier 1: namespace
    for ns in namespacesClaiming(asset):                  # XIP-005 §4, fail-closed
        r = resolveNamespace(ns)
        if r ok and r covers asset and r.root.creator == bnsOwner(ns):
            return { manifest: r.root, tier: T1 }
    # tier 2: creator-authored
    m = latestVersion(asset.creator, identityKey(asset))  # XIP-001 §6
    if m and m != UNRESOLVED: return { manifest: m, tier: T2 }
    # tier 3: owner-authored (item display only)
    m = latestVersion(asset.owner, identityKey(asset))
    if m and m != UNRESOLVED: return { manifest: m, tier: T3, scope: "item-display" }
    # tier 4/5 are returned only when explicitly requested, never as canonical
    return none
```

`latestVersion` returns **UNRESOLVED on a fork** (≥2 parent-chain tips); the
resolver **MUST** then fall through / fail closed, never pick arbitrarily.

## 4. Determinism requirements

To guarantee two indexers agree, an XIP-006-conformant resolver **MUST**:

1. Use XIP-001 canonicalisation/hashing for every manifest hash and integrity
   check (recompute, never trust a stated hash).
2. Use XIP-002 references and the per-contract **offset** (record it; reject
   offset-crossing sequential mappings).
3. Apply the **single** XIP-001 §5.2 precedence ladder — no local variations.
4. Select latest versions by parent-chain tip; **fail closed on forks**.
5. Recompute `integrity.root` for sequential/predicate mappings before trusting
   membership.
6. Stamp every cached result with `asOfBlock` and re-validate time-sensitive
   facts (ownership, `derivedHash`, `live` membership, namespace ownership) before
   any trust decision.

A resolver that "guesses" at any of these points is **non-conformant** and is the
root cause of indexer disagreement.

## 5. Caching & snapshots

- Read facts (creator, hash, parents, dependencies, migration source) are
  immutable once sealed and **MAY** be cached indefinitely.
- Mutable facts (owner, namespace ownership, `live` membership) **MUST** carry
  `asOfBlock` and be refreshed per the consumer's freshness policy and §4(6).
- An inscribed snapshot (provenance graph, member set) is citable but **MUST** be
  re-verified edge-by-edge / leaf-by-leaf against current chain state before being
  used to authorise value transfer.

## 6. Failure semantics

- Resolution failures (missing owner, fork, authority mismatch, integrity
  mismatch, offset-crossing) **MUST fail closed**: return unresolved, surface the
  reason, and **MUST NOT** substitute a lower-tier or third-party manifest.
- A consumer **MUST** be able to distinguish *NotFound* (no such inscription) from
  *Unverified* (inscription exists, no qualifying identity) from *Conflict* (fork
  / ambiguous).

## 7. Conformance checklist

A conformant indexer/resolver:

- [ ] reproduces XIP-001 §3.4 and §4.5 vectors;
- [ ] records per-contract offset; rejects offset-crossing sequential mappings;
- [ ] reconstructs and labels migration chains; keys by canonical-core identity;
- [ ] applies the XIP-001 §5.2 ladder and emits the §1 tier on every identity;
- [ ] fails closed on fork, authority mismatch, and integrity mismatch;
- [ ] never renders `get-royalty-recipient` as a sale royalty (XIP-002 §6);
- [ ] never presents T4/T5/A as canonical identity.

## Summary

XIP-006 turns the corpus's scattered "treat as unverified / fail closed / latest
version" language into one trust vocabulary and one set of deterministic
algorithms — so every Xtrata consumer resolves the same reference to the same
asset, the same canonical manifest, and the same trust tier.
