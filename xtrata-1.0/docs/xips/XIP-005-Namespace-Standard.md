# XIP-005: Xtrata Namespace

- XIP: 005
- Title: Namespace
- Status: Draft
- Category: Standards Track
- Requires: XIP-000, XIP-001, XIP-002
- Required-By: XIP-006, XIP-007
- Spec version: 1.0.0

> RFC 2119 / RFC 8174 keywords apply (see XIP-001).

## Abstract

XIP-005 defines how human-readable names resolve to Xtrata manifests and
inscriptions. Naming is a **uniqueness** problem, so it is kept out of the
non-exclusive manifest layer (XIP-003) and **anchored to an existing on-chain
uniqueness primitive — BNS / BNSv2** — that the authority verifiably controls.
Crucially, this revision specifies the previously-missing 80%: the **pointer-record
format**, the **deterministic resolution algorithm** (including multiple-candidate
handling), and **owner-change / finality** behaviour.

## Core principle

> Manifests may overlap freely; names may not. Uniqueness must come from a layer
> that already enforces it, and resolution must be deterministic or it must fail
> closed.

## 1. Why not a manifest-based registry

XIP-003 manifests are intentionally non-exclusive — many may describe the same
inscription — so they cannot arbitrate "who owns the name `studio`." A name needs
a single, on-chain, contestable owner. Therefore a namespace **MUST NOT** be
expressed as an organisational manifest type; it is anchored to BNS/BNSv2.

## 2. Anchoring model

A namespace is a Stacks **BNS/BNSv2 name** the authority controls. Authority over
everything under the name derives from a two-link chain:

```
controls the BNS name  →  authored (on-chain) the root manifest the name points to
```

- Name ownership is resolved on-chain via BNS/BNSv2.
- The name owner publishes a **pointer record** (§3) binding the name to a **root
  manifest inscription** of envelope type `namespace-root` (XIP-001).
- Because the root manifest is itself an inscription, its authorship is
  contract-attested.

The name is **not** restricted to the `.btc` namespace; any BNSv2 name
`name.<namespace>` is permitted. References generalise accordingly.

## 3. Pointer record (REQUIRED — the binding)

The pointer record is what makes resolution deterministic. It binds, on-chain,
`name → owner → root manifest`. Two binding methods are defined; a resolver
**MUST** support both and apply the precedence in §4.

### 3.1 Method A — BNS zonefile record (RECOMMENDED)

The name owner publishes, in the name's BNS/BNSv2 zonefile, a TXT-style record:

```
_xtrata.<fullName>   "xip-005=1; root=<canonical-reference>"
```

where `<fullName>` is the complete BNS name (e.g. `studio.btc`) and
`<canonical-reference>` is an XIP-002 reference
(`contract:inscriptionId`) to the `namespace-root` manifest. This is the
strongest binding: it is published by the name owner through the naming system
itself.

### 3.2 Method B — self-declaring root manifest

Absent (or in addition to) a zonefile record, the root manifest declares the
name it claims:

```json
{
  "standard": "xip-001",
  "specVersion": "1.0.0",
  "type": "namespace-root",
  "name": "studio",
  "namespace": { "system": "bnsv2", "name": "studio.btc" }
}
```

A Method-B claim is valid **only if** the manifest's inscription `creator` equals
the current BNS owner of `namespace.name`. If they differ, the claim is rejected
(this is the anti-spoof core of §6).

## 4. Resolution algorithm (deterministic, fail-closed)

A namespaced reference has the form:

```
<name>.<namespace>[/path][:inscriptionId]
```

```
function resolveNamespace(ref):
    (fullName, path, inscriptionId) = parse(ref)   # fullName = complete BNS name, e.g. "studio.btc"
    A = bnsOwner(fullName)                       # 1. on-chain owner, at trust depth (§5)
    if A is none: FAIL_CLOSED

    # 2. find the root manifest, by precedence
    root = null
    if zonefile record _xtrata.<fullName> exists and parses:    # Method A
        cand = inscription at record.root
        if cand.creator == A and cand.type == "namespace-root"
           and cand.namespace.name == fullName:
            root = cand
    if root is null:                                            # Method B fallback
        cands = inscribed manifests where type == "namespace-root"
                and namespace.name == fullName and creator == A
                and withdrawn != true
        root = latestVersion(A, cands)          # XIP-001 §6 parent-chain tip
        if root == UNRESOLVED: FAIL_CLOSED      # 0 or forked candidates

    # 3. authority check (XIP-001 §5)
    if not root.authorityVerified(A): FAIL_CLOSED

    # 4. descend
    node = root
    for seg in path: node = node.child(seg)     # sub-collections within manifest
                     if node is none: FAIL_CLOSED
    if inscriptionId present:
        return reference(node.defaultContract or canonical-core, inscriptionId)
    return node
```

**FAIL_CLOSED** means resolution returns "unresolved" and the consumer **MUST
NOT** fall back to an unverified or third-party manifest. Multiple Method-B
candidates that do not reduce to a single parent-chain tip are a **fork** and
**MUST** fail closed (no guessing).

## 5. Owner change & finality (anti-race)

BNS ownership can change. To prevent a name transferred mid-flight from hijacking
a brand:

- `bnsOwner(name)` **MUST** be read at a stated confirmation depth; resolvers
  **SHOULD** require the ownership state to be at least N confirmations deep
  (recommended N ≥ 6) before treating a resolution as trust-grade.
- A consumer making a **trust decision** (e.g. a marketplace asserting "official
  collection," a wallet showing a verified badge, a purchase) **MUST re-resolve**
  at the point of decision rather than trust a cached resolution.
- Cached resolutions **MUST** carry `asOfBlock`; a cache older than the consumer's
  freshness policy **MUST** be treated as advisory only.

## 6. Conflict & precedence (anti-spoof)

- The **current** BNS/BNSv2 owner of a name is the **sole** authority for that
  name. A namespace claim whose root-manifest `creator` does not match current
  BNS ownership **MUST** be rejected.
- If a name changes hands, resolution follows current ownership; prior root
  manifests lose authority over the name (their inscriptions remain valid as
  data, just not as *this name's* root).
- Namespace authority interacts with the rest of the corpus through the **single**
  precedence ladder in **XIP-001 §5.2**, where a namespace-anchored manifest is
  **tier 1 (strongest)** — above creator-only and owner-only manifests. This
  document does **not** define a competing order; it is the top rung of that one
  ladder. (This resolves the prior 001-vs-004 inconsistency: namespace-anchored
  outranks bare owner.)

## 7. Subnames & structured names

- **Paths** (`name.btc/artists/alice`) resolve **within** the root manifest as
  nested sub-collections (XIP-003 §6), under the single name owner's authority. No
  additional on-chain record is needed.
- **BNSv2 subdomains** (`alice.studio.btc`), where the naming system supports
  them, resolve as independent names with their **own** owner and pointer record
  via §4 — i.e. delegated authority is expressed by the naming system, not by the
  manifest.
- Artist names, collection names, package names (XIP-008), and application
  namespaces are all just names resolved by §4; their *type* is whatever the root
  (or descended) manifest declares.

## 8. Relationship to other layers

- **XIP-003 / XIP-008** — the manifest a name resolves to.
- **XIP-007** — marketplaces use a verified namespace as the **tier-1** signal of
  authoritative collection identity (XIP-001 §5.2).
- **XIP-004** — provenance is unaffected by naming; names are presentation.
- **XIP-006** — resolver conformance, caching, and trust-tier labelling.

## 9. Out of scope

A bespoke Xtrata-native name registry. This standard deliberately reuses BNS/BNSv2
rather than competing with it; a native registry, if ever desired, would be a
separate proposal.

## 10. Conformance

- **MUST** resolve names per §4, failing closed on missing owner, mismatched
  authorship, or fork.
- **MUST** reject Method-B claims whose `creator` ≠ current BNS owner (§3.2, §6).
- **MUST** re-resolve before trust decisions and honour finality depth (§5).
- **MUST** treat a namespace-anchored manifest as XIP-001 §5.2 tier 1, not invent
  a different order.

## Summary

Names resolve to inscribed manifests; their uniqueness is borrowed from BNS/BNSv2;
the binding is an explicit, on-chain pointer record; resolution is deterministic
and fails closed; and a name's authority is exactly its current on-chain owner —
giving Xtrata human-readable, contestable, spoof-resistant namespaces without a
new registry.
