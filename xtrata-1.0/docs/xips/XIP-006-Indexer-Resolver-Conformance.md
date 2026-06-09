# XIP-006: Indexer & Resolver Conformance

- XIP: 006
- Title: Indexer & Resolver Conformance
- Status: Draft
- Category: Standards Track
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

Every resolved identity claim carries exactly one tier. UIs **SHOULD** map tiers to
distinct visual treatments and **MUST NOT** present a lower tier as a higher one.

| Tier | Label | Meaning | Source |
|------|-------|---------|--------|
| **T1** | `verified-namespace` | Namespace-anchored; BNS owner == manifest creator. | XIP-005 + XIP-001 §5.2(1) |
| **T2** | `verified-creator` | Manifest inscribed by the token's creator. | XIP-001 §5.2(2) |
| **T3** | `verified-owner` | Manifest inscribed by current owner (item display only). | XIP-001 §5.2(3) |
| **T4** | `signed-offchain` | Off-chain manifest with a valid §5.1 signature. | XIP-001 §5.2(4) |
| **T5** | `unendorsed` | Third-party / unverified view. | XIP-001 §5.2(5) |
| **A** | `advisory` | Derivable-but-non-authoritative facts (e.g. `derivedHash`, unverified migration hop). | XIP-004 §4/§5 |

- A "verified" badge **SHOULD** be reserved for T1–T2 (and T3 only for item display,
  never collection identity).
- T4/T5/A **MUST NOT** be shown as canonical identity.

## 2. Canonical resolution (single algorithm)

```
function resolve(reference, context = {}):      # reference per XIP-002
    (contract, id) = qualify(reference)         # apply defaultContract if bare
    asset = readCoreFacts(contract, id)         # XIP-002 §7 getters
    if asset is none: return NotFound

    asset.migration = migrationChain(contract, id)     # XIP-002 §4.2 (label hops)
    asset.canonicalId = canonicalAssetId(asset)        # XIP-002 §4.3 (live token)

    identity = resolveIdentity(asset, context)  # §3 -> {manifest, tier} | none
    return { asset, identity }
```

All consumers **MUST** key assets by `canonicalId` so a migrated asset and its
originals collapse to one (XIP-002 §4.3).

`context` is an OPTIONAL caller-supplied resolution context (§3.1). It may carry a
**claimed namespace** or a **claimed collection manifest** the caller wants
checked first. It can only ever cause a claim to be **verified or rejected** — it
**MUST NOT** be able to upgrade an asset's tier without passing the same checks a
discovered claim would.

## 3. Identity resolution (the §5.2 ladder, made executable)

```
function resolveIdentity(asset, context = {}):
    # tier 1: namespace — over the discovered ∪ caller-provided claim set (§3.1)
    for ns in namespacesClaiming(asset, context):        # XIP-005 §4, fail-closed
        r = resolveNamespace(ns)
        if r ok and r covers asset and r.root.creator == bnsOwner(ns):
            return { manifest: r.root, tier: T1, namespace: ns }
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

### 3.1 Namespace discovery (determinism rule)

"Which namespaces claim this asset" **SHOULD NOT** be magic — two indexers given the
same chain state and the same `context` **MUST** compute the same claim set.
`namespacesClaiming(asset, context)` is **exactly** the union of:

1. **Caller-provided** — any namespace in `context.namespace` (e.g. a marketplace
   resolving a listing it believes belongs to `studio.btc`).
2. **Pointer-record discovered** — every BNS/BNSv2 name whose `_xtrata.<fullName>`
   zonefile record (XIP-005 §3.1) resolves to a `namespace-root` manifest whose
   **resolved member set includes `asset.canonicalId`**.
3. **Manifest-discovered** — every inscribed `namespace-root` manifest whose
   member set includes `asset.canonicalId` **and** whose `namespace.name` the
   manifest `creator` currently owns in BNS (XIP-005 §3.2 / §6).

Every candidate is then independently re-verified by `resolveNamespace` (XIP-005
§4), so discovery only proposes; verification disposes. **If the set is empty, the
asset has no T1 identity** and resolution falls through to T2 — it does **not**
fail the whole resolution. A claim that fails `resolveNamespace` (missing owner,
authorship mismatch, fork) is **dropped**, never downgraded into a lower tier.

An indexer that limits discovery (e.g. to an indexed name allowlist) **SHOULD**
disclose that scope, because a peer with broader discovery may surface a T1
identity it does not — the two still agree *given the same configured scope*.

## 4. Determinism requirements

To guarantee two indexers agree, an XIP-006-conformant resolver **MUST**:

1. Use XIP-001 canonicalisation/hashing for every manifest hash and integrity
   check (recompute, never trust a stated hash).
2. Use XIP-002 references and the per-contract **offset** (record it; reject
   offset-crossing sequential mappings).
3. Apply the **single** XIP-001 §5.2 precedence ladder — no local variations.
4. Select latest versions by parent-chain tip; **fail closed on forks**.
5. Verify membership before trusting it: recompute `integrity.root` for
   sequential/predicate mappings, and for inscribed explicit mappings verify per
   XIP-001 §4.1 (manifest hash == sealed inscription hash, plus member hashes).
6. Stamp every cached result with `asOfBlock` and re-validate time-sensitive
   facts (ownership, `derivedHash`, `live` membership, namespace ownership) before
   any trust decision.

A resolver that "guesses" at any of these points is **non-conformant** and is the
root cause of indexer disagreement.

## 5. Caching & snapshots

- Read facts (creator, hash, parents, dependencies, migration source) are
  immutable once sealed and **MAY** be cached indefinitely.
- Mutable facts (owner, namespace ownership, `live` membership) **SHOULD** carry
  `asOfBlock` and be refreshed per the consumer's freshness policy and §4(6).
- An inscribed snapshot (provenance graph, member set) is citable but **SHOULD** be
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
