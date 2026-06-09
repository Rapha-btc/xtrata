# XIP-001: Xtrata Manifest Envelope, Canonicalisation & Integrity

- XIP: 001
- Title: Manifest Envelope, Canonicalisation & Integrity
- Status: Draft
- Category: Standards Track
- Requires: XIP-000
- Required-By: XIP-002, XIP-003, XIP-004, XIP-005, XIP-006, XIP-007, XIP-008
- Spec version: 1.0.0

> The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**,
> **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this
> document are to be interpreted as described in RFC 2119 and RFC 8174.

## Abstract

XIP-001 defines the **shared manifest envelope** for the Xtrata ecosystem and —
critically — the **byte-exact rules** by which any manifest is canonicalised,
hashed, signed, and committed to with an integrity root. Every other Standards
Track XIP (organisational manifests, marketplace, namespace, packages) is a
**profile** of this envelope and inherits these rules unchanged.

This XIP exists because the rest of the corpus repeatedly relies on phrases like
"the canonical manifest hash", "verify against the `integrityRoot`", and "a
signature over the manifest" without ever defining the bytes. Until those bytes
are fixed, two conformant implementations will disagree. This document fixes
them, and ships **reproducible test vectors** so an implementer can self-check.

## Core principle

> The contract preserves facts. The manifest preserves context. Both must hash
> to the same bytes in every wallet, marketplace and indexer.

A manifest **MUST NOT** override, contradict, or re-assert any fact the Xtrata
core already holds (creator, owner, content hash, mime type, sealed status,
parents, dependencies, migration lineage, fee recipient — see XIP-002). Where the
contract is silent (a title, an ordering, a grouping), the manifest **MAY**
speak.

## 1. The envelope

Every XIP-001 manifest is a single JSON object with the following top-level
fields. Profiles defined by other XIPs add profile-specific fields or objects
(e.g. `package`, `namespace`) but **MUST NOT** redefine, repurpose, or relax the
envelope fields in this document.

| Field | Type | Req. | Description |
|-------|------|------|-------------|
| `standard` | string | MUST | Always the literal `"xip-001"` (lowercase). Identifies the envelope. |
| `specVersion` | string | MUST | Envelope format version, SemVer. `"1.0.0"` for this document. **Not** a content/revision counter — supersession is a graph relation (§6). |
| `type` | string | MUST | The profile type. One of the registered values (§1.1). |
| `name` | string | SHOULD | Human-readable label. Soft context. |
| `defaultContract` | string | SHOULD | Fully-qualified Xtrata core principal (`SP….xtrata-v3-2-3`) that bare inscription ids resolve against. REQUIRED if any reference in the manifest omits a contract. See XIP-002. |
| `authority` | object | conditional | REQUIRED for off-chain/detached manifests; OPTIONAL (and ignored) for inscribed manifests, whose authority is the inscription `creator`. See §5. |
| `mapping` | object | conditional | REQUIRED for any manifest that enumerates members (collections, packages). See §4. |
| `integrity` | object | SHOULD | Integrity commitment over the resolved member set. REQUIRED when `mapping.type` is `sequential` or `predicate`. See §4.4. |
| `economics` | object | MAY | A *pointer* to a governing economics contract. Never carries terms. See §7. |
| `supersedes` | string | MAY | Canonical reference (XIP-002) of the manifest this one replaces. Advisory mirror of the on-chain parent relation (§6). |
| `withdrawn` | boolean | MAY | If `true`, the authority retracts this manifest; consumers MUST treat it as non-authoritative (§6). |

Unknown top-level fields **MUST** be preserved by canonicalisation (they are
hashed) but **MAY** be ignored by consumers. Profiles **MUST** register any new
field they introduce in their own XIP.

### 1.1 Registered `type` values

| `type` | Defined by | Kind |
|--------|-----------|------|
| `collection`, `album`, `gallery`, `exhibition`, `archive`, `playlist` | XIP-003 | organisational |
| `provenance-graph` | XIP-004 | view |
| `software-package` | XIP-008 | profile |
| `namespace-root` | XIP-005 | profile |

`type` values **MUST NOT** be invented ad hoc; a new type requires a XIP that
profiles this envelope.

### 1.2 Minimal example

```json
{
  "standard": "xip-001",
  "specVersion": "1.0.0",
  "type": "collection",
  "name": "Example Collection",
  "defaultContract": "SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-3",
  "mapping": {
    "type": "explicit",
    "items": [
      { "inscriptionId": 359, "order": 1 },
      { "inscriptionId": 360, "order": 2 }
    ]
  }
}
```

## 2. Manifests are Xtrata inscriptions

A conformant manifest **SHOULD** itself be an Xtrata inscription on the canonical
core. This is the only option consistent with XIP-000's principles: a manifest
that organises permanent on-chain data but lives on a mutable server reintroduces
the pointer-rot Xtrata exists to remove.

Inscribing the manifest cascades cleanly:

- **Authority is free and verifiable** — the inscription's contract-attested
  `creator` *is* the manifest's authority. No `authority` block is needed.
- **Versioning is on-chain** — a new version is a new inscription whose `parents`
  include the prior version (§6).
- **Integrity is sealed** — the manifest's content hash equals the contract's
  sealed `final-hash` over the **canonical bytes** of §3.

Inscribed manifests **MUST** use the mime type
`application/vnd.xtrata.manifest+json` so explorers and indexers can detect them.

Off-chain manifests (HTTPS/IPFS) are **PERMITTED only as an explicitly
lower-trust tier** (drafts, dynamic previews). They **MUST** carry an `authority`
block with a valid signature (§5), **MUST** be treated as non-authoritative by
consumers resolving canonical identity, and **MUST NOT** be the sole source of an
`integrity` commitment a consumer treats as final.

## 3. Canonicalisation (normative)

Every hash, signature, and integrity commitment in the Xtrata corpus is computed
over the **canonical serialisation** defined here. Implementations **MUST**
produce identical bytes.

### 3.1 Profile

Manifests **MUST** be serialised per **RFC 8785 (JSON Canonicalization Scheme,
JCS)** with the following Xtrata restrictions that remove the only
underspecified corners of JSON:

1. **Encoding:** UTF-8. The document **MUST** be valid Unicode in **NFC**
   (Normalization Form C). Producers MUST normalise string values to NFC before
   serialisation.
2. **Numbers:** All numbers **MUST** be integers in the range
   `[0, 2^53−1]`. Floating-point, exponents, and negative numbers are
   **PROHIBITED** in any field a hash covers. (Ids, orders, sizes, counts are
   integers; everything fractional or signed belongs in a string or is out of
   scope.) This eliminates ECMAScript number-formatting ambiguity entirely.
3. **Object keys:** sorted by UTF-16 code unit per JCS. Keys **SHOULD** be ASCII;
   non-ASCII keys are permitted but discouraged.
4. **Strings:** JCS escaping (minimal escaping, lowercase hex in `\u` escapes
   only where required). Hash and address literals are lowercase (§3.3).
5. **Whitespace:** none (no spaces, no newlines) between tokens.
6. **Duplicate keys:** **PROHIBITED**. A manifest with duplicate object keys is
   invalid and **MUST** be rejected, not silently de-duplicated.
7. **Null vs absent:** semantically distinct. An absent optional field and a
   field explicitly set to `null` are different manifests and hash differently.
   Profiles **SHOULD** omit rather than null.

### 3.2 Manifest hash

```
manifestHash = SHA-256( JCS-bytes(manifest) )
```

For an inscribed manifest this value **MUST** equal the core's sealed
`get-inscription-hash` for that inscription. A consumer that finds a mismatch
**MUST** treat the manifest as corrupt and non-authoritative.

### 3.3 Literal conventions

- **Hash literals:** `0x`-prefixed, lowercase, exactly 64 hex chars for SHA-256.
- **Principals:** Stacks c32-encoded, uppercase as emitted by the chain
  (e.g. `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X`). Contract principals append
  `.contract-name`.
- **References:** canonical inscription references follow XIP-002
  (`contract:inscriptionId`).

### 3.4 Test vector — canonicalisation

Input manifest = the §1.2 example. Canonical bytes (272 bytes, shown verbatim):

```
{"defaultContract":"SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-3","mapping":{"items":[{"inscriptionId":359,"order":1},{"inscriptionId":360,"order":2}],"type":"explicit"},"name":"Example Collection","specVersion":"1.0.0","standard":"xip-001","type":"collection"}
```

```
manifestHash = 0xfe70c7740fddb6e9197bdae6183147ec1f2a1b95eb33af780bcbc13c73a33e46
```

An implementation that does not reproduce this hash from this input is
non-conformant. (Note the field reordering: source order `standard, specVersion,
type, name, defaultContract, mapping` becomes lexicographic
`defaultContract, mapping, name, specVersion, standard, type`.)

## 4. Mapping (member enumeration)

A manifest that enumerates inscriptions carries a `mapping`. Three forms, in
descending order of trust.

### 4.1 Explicit (canonical, RECOMMENDED)

Each member is named. This is the default and the only form requiring no
integrity root (the list *is* the commitment, once the manifest is inscribed).

```json
{
  "mapping": {
    "type": "explicit",
    "items": [
      { "inscriptionId": 359, "order": 1 },
      { "contract": "SP….xtrata-v1-1-1", "inscriptionId": 14, "order": 2 }
    ]
  }
}
```

- `inscriptionId` is REQUIRED; `contract` is OPTIONAL and defaults to
  `defaultContract` (XIP-002).
- `order` is REQUIRED and **MUST** be a strictly increasing integer sequence over
  the array as written. Items **MUST** be unique by `(contract, inscriptionId)`.
- Items **MAY** carry their own `finalHash` for stronger integrity leaves (§4.4).
- `integrity` is OPTIONAL for explicit mappings (RECOMMENDED for large
  collections and to enable partial/streamed verification). It is **not** required
  because the inscribed manifest's own sealed content hash already commits to the
  exact `items` list.

**Membership verification for explicit mappings (normative — referenced by
XIP-007).** A consumer **MUST** treat an inscribed explicit mapping as
integrity-verified when **both**: (a) the manifest's recomputed `manifestHash`
(§3.2) equals the contract's sealed `get-inscription-hash` for the manifest
inscription, and (b) each member's on-chain `get-inscription-hash` matches the
member's `finalHash` where the manifest supplies one. Where an `integrity.root`
is also present, the consumer **MUST** additionally recompute and match it (§4.4).
This is the single membership-verification rule; XIP-007 references it rather than
mandating a separate root.

### 4.2 Sequential (OPTIONAL compression)

Permitted **only** with all of: explicit bounds, a `contract`, an `exclusions`
list for gaps/swaps, and an `integrity` commitment (§4.4) so the resolved set is
tamper-evident. Sequential mapping **MUST NOT** cross the id-space offset
boundary defined in XIP-002 (the boundary between migrated/legacy ids and native
ids); a range that would cross it **MUST** be expressed as two manifests or as
explicit mapping.

> *Future note (non-normative):* a single collection that spans the offset
> boundary (e.g. migrated low ids plus native high ids) is awkward to express as
> two manifests. A `mapping.type: "segments"` form — an ordered array of
> per-region `sequential` blocks, each with its own bounds and exclusions, under
> one `integrity.root` — is the anticipated MINOR addition to this XIP. It is not
> defined in 1.0.0; until then, use explicit mapping for boundary-spanning
> collections.

```json
{
  "mapping": {
    "type": "sequential",
    "contract": "SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-3",
    "inscriptionStart": 360,
    "inscriptionEnd": 10359,
    "exclusions": [412, 588]
  },
  "integrity": { "algo": "xtrata-merkle-v1", "root": "0x…" }
}
```

**Expansion algorithm (normative, deterministic):**

```
function expandSequential(m):
    assert m.inscriptionStart <= m.inscriptionEnd
    assert not crossesOffsetBoundary(m.contract, m.inscriptionStart, m.inscriptionEnd)  # XIP-002
    ex = sortedUniqueAscending(m.exclusions)
    items = []
    order = 1
    for id in m.inscriptionStart .. m.inscriptionEnd inclusive:
        if id in ex: continue
        items.append({ contract: m.contract, inscriptionId: id, order: order })
        order += 1
    return items
```

The `integrity.root` **MUST** equal the Merkle root (§4.4) over the result of
`expandSequential`. A consumer **MUST** reject the manifest if recomputation
disagrees.

### 4.3 Predicate (OPTIONAL, dynamic, LOWEST trust)

By hash-set, creator, or trait — for generative or open-ended sets. Predicate
mapping depends on an indexer and is therefore the lowest trust tier (XIP-006).
It **MUST** carry an `integrity.root` **snapshot** pinned to a stated block
height; without a snapshot it conveys no integrity guarantee.

```json
{
  "mapping": { "type": "predicate", "by": "creator",
               "creator": "SP….", "asOfBlock": 812345 },
  "integrity": { "algo": "xtrata-merkle-v1", "root": "0x…", "asOfBlock": 812345 }
}
```

### 4.4 Integrity commitment (normative Merkle construction)

`integrity` commits to the **resolved member set**, binding not just membership
but content and order, so a marketplace verifying it knows *which* inscriptions
with *which* hashes in *which* order.

```json
{ "integrity": { "algo": "xtrata-merkle-v1", "root": "0x…" } }
```

`algo` **MUST** be `"xtrata-merkle-v1"`, defined as:

**Leaf.** For each member, the leaf input is the JCS bytes (§3) of the object:

```json
{ "contract": "<fully-qualified>", "inscriptionId": <int>,
  "finalHash": "<0x… or absent>", "order": <int> }
```

- `contract` is the member's resolved (never defaulted-away) fully-qualified
  principal.
- `finalHash`, if known, is the member's on-chain `get-inscription-hash`
  (lowercase, `0x`+64). If a producer omits it, it **MUST** be omitted from every
  leaf (a set either commits content or it does not — mixing is PROHIBITED).
- `order` is the member's order in the resolved set.

```
leafHash = SHA-256( 0x00 || JCS-bytes(leafObject) )
```

**Internal node.** With domain separation to defeat the duplicate-node /
leaf-as-node forgery (CVE-2012-2459 class):

```
nodeHash = SHA-256( 0x01 || left || right )
```

**Tree construction:**

```
function merkleRoot(members):
    if members is empty: return SHA-256( 0x00 )          # empty-set sentinel
    sorted = members sorted ascending by (contract, inscriptionId)
            # contract compared as UTF-8 bytes; inscriptionId as integer
    level = [ leafHash(m) for m in sorted ]
    while len(level) > 1:
        next = []
        for i in 0,2,4,… < len(level):
            L = level[i]
            R = level[i+1] if i+1 < len(level) else level[i]   # duplicate last on odd
            next.append( SHA-256( 0x01 || L || R ) )
        level = next
    return level[0]
```

Sorting is by `(contract, inscriptionId)`, **not** by display `order` — so the
root is independent of presentation. `order` is bound *inside* each leaf, so
re-ordering still changes the root.

### 4.5 Test vectors — integrity root

Three members on `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-3`,
ids 359/360/361, `finalHash` = `0xaa…`/`0xbb…`/`0xcc…` (64 nibbles each),
order 1/2/3. Odd count → last leaf duplicated at the second level.

```
leaf 359 = 0x263046c2cec65ecb9e6e5e4a550e1e64cdeb408d57c7f3c037151f10cc636fa2
leaf 360 = 0xc93f9cbd0dcd3be716c0e295a460ef8f09a39339261481e4a6cd7ffa708d0a3a
leaf 361 = 0x0c5c98fe26aded1d59aafae4b2eb218a25c5159ddb73bc557ec5c836cbdd69ae

integrityRoot (3 items)   = 0x2c9d8361cc7b6b507c3c67ff475330c2d8b9fec1a9afe4a9605df1ed89a21e97
integrityRoot (item 359)  = 0x263046c2cec65ecb9e6e5e4a550e1e64cdeb408d57c7f3c037151f10cc636fa2
integrityRoot (empty set) = 0x6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d
```

(For a single-item set the root equals the single leaf, as the loop body never
runs.) A reference generator for these vectors is normative-by-example; see the
*Reference implementation* note at the end.

## 5. Authority (verifiable, not asserted)

- **Default (manifest-as-inscription):** authority is the manifest inscription's
  on-chain `creator`. No `authority` block is needed; if present it is ignored.
- **Off-chain / detached manifests:** **MUST** include an `authority` block with
  a signature over the **signing message** (§5.1):

```json
{
  "authority": {
    "type": "creator | owner | curator | namespace | delegated",
    "address": "SP…",
    "signature": "0x…",
    "publicKey": "0x…"
  }
}
```

`type` values `delegated` and `curator` are reserved but **MUST NOT** be relied
on for canonical identity until a future XIP defines how delegation is proven;
consumers **MUST** treat them as tier-4 (unendorsed) today.

### 5.1 Signing message (normative, domain-separated)

Off-chain signatures **MUST** sign the following byte string, not the bare hash,
to prevent cross-context and cross-chain replay:

```
message = "XIP-001-v1\n"          (domain tag, exact, with trailing \n)
        || "manifest\n"
        || lowercase-hex(manifestHash) || "\n"
        || authority.type || "\n"                   # bound, so type cannot be swapped
        || authority.address || "\n"
        || chainId                                  # "stacks-mainnet" | "stacks-testnet"
```

- The `manifestHash` inside the message is computed with `authority` and
  `signature` **removed** from the object (you cannot sign your own signature):
  canonicalise the manifest with the entire `authority` field omitted, hash that,
  and that is the `manifestHash` bound in the message.
- **Signature (exact):** `sig = ECDSA-secp256k1( SHA-256(message) )` — a sign of
  the **raw 32-byte digest** (no Stacks `\x18Stacks Message…` wrapper; the
  `XIP-001-v1` domain tag *is* the separation). Encoded as the 65-byte
  recoverable form `R(32) || S(32) || recId(1)`, `0x`-prefixed lowercase.
- `S` **MUST** be low-S normalised (`S ≤ n/2`); a high-S signature **MUST** be
  rejected (non-malleability).
- `recId` ∈ {0,1,2,3} encodes recovery; the recovered key **MUST** equal
  `authority.publicKey`.
- `authority.publicKey` **MUST** be the 33-byte **compressed** secp256k1 point,
  `0x`-prefixed lowercase, and **MUST** derive (c32, same version byte as the
  declared `chainId`) to `authority.address`.
- A verifier **MUST** check, in order: low-S; recovery to `publicKey`; `publicKey`
  derives to `address`; the message rebuilds with the consumer's own
  recomputed `manifestHash`. Any failure ⇒ treat as tier-5 (unsigned).

### 5.2 Conflict precedence (single ruleset — referenced by XIP-007/004/008)

When multiple manifests reference the same inscription, a consumer resolving a
**collection / display identity** **MUST** apply, in order, stopping at the first
match:

1. **Namespace-anchored** manifest where the controlling BNS owner equals the
   manifest inscription `creator` (XIP-005). *Strongest: uniqueness + authorship.*
2. Manifest inscribed by the referenced token's **`creator`** — authoritative for
   **collection identity**.
3. Manifest inscribed by the token's current **`owner`** — authoritative for
   **item display only**; an owner manifest **MUST NOT** redefine collection
   membership for tokens it did not create.
4. Off-chain manifest with a valid §5.1 signature — lower tier, **never**
   presented as canonical.
5. Otherwise: **unendorsed third-party view.**

Ties **within** a tier are broken by the latest tip of the on-chain parent chain
(§6); if a single authority presents **two or more competing tips (a fork)**,
resolution **MUST fail closed** to "unverified" rather than guess. A tier-4/5
manifest **MUST NOT** be presented as the canonical identity of a token it does
not own or create.

> This ordering is the single source of truth. XIP-007 and XIP-005 reference it
> verbatim and **MUST NOT** restate a different order.

## 6. Versioning & supersession

- `specVersion` tracks the **envelope format**, not content revisions.
- Content supersession is an **on-chain relation**: a new manifest version is a
  new inscription whose `parents` include the prior version's id. The advisory
  `supersedes` field **MAY** mirror this but the parent edge is authoritative.
- **Latest authoritative version** (normative selection):

```
function latestVersion(authority, identityKey):
    cands = inscribed manifests where creator == authority
            and (type, name/namespace identity) == identityKey
            and withdrawn != true
    build DAG over cands via on-chain `parents`
    tips = cands with no child in the set
    if len(tips) == 1: return tips[0]
    else: return UNRESOLVED        # fork or empty -> consumer treats as unverified
```

- **Retraction:** a parent edge reads as *continuity*, so it cannot express "this
  was wrong." To retract, the authority inscribes a successor with
  `withdrawn: true` (and the prior as parent). Consumers **MUST** honour
  `withdrawn` and **MUST NOT** treat a withdrawn manifest as authoritative.

## 7. Economics & the marketplace boundary

Xtrata stores data. It does not price, sell, or split proceeds, and **manifests
never carry economic terms.**

- The Xtrata core's fee recipient (`get-royalty-recipient`) is a **single,
  global, admin-set storage/protocol-fee recipient**. Despite its on-chain name
  it is **NOT** a per-token or secondary-sale royalty, and consumers **MUST NOT**
  render it as a creator royalty. (See XIP-002 §"Fee recipient" for the naming
  hazard and the exact contract semantics.)
- Secondary-sale economics live in a **separate marketplace contract** (XIP-007)
  that enforces settlement on-chain. A manifest **MAY** carry a *pointer*, never
  terms:

```json
{ "economics": { "contract": "SP….marketplace-v1",
                 "note": "Sale terms enforced on-chain by the contract." } }
```

## 8. Profiles & relationship to other XIPs

XIP-001 is the **common envelope**. The following profile it and **MUST NOT**
duplicate §3–§5:

- **XIP-002 Identity** — how references, contracts, the id-space offset and
  migration identity work. *Every* `inscriptionId`/`contract` in a manifest is
  interpreted per XIP-002.
- **XIP-003 Organisational manifests** — the `collection | album | gallery |
  exhibition | archive | playlist` vocabulary.
- **XIP-004 Provenance** — `provenance-graph`, a verifiable view over contract
  facts.
- **XIP-005 Namespace** — `namespace-root`, BNS-anchored naming.
- **XIP-008 Software package** — `software-package`.
- **XIP-007 Marketplace** — read/verify interface and the economics boundary.
- **XIP-006 Indexer/Resolver conformance** — deterministic resolution and trust
  tiers used by all of the above.

## 9. Conformance

An implementation conforms to XIP-001 if it:

- **MUST** reproduce the §3.4 and §4.5 test vectors exactly.
- **MUST** reject manifests with duplicate keys, non-integer/-negative numbers in
  hashed fields, or non-NFC strings.
- **MUST** verify off-chain manifests' signatures per §5.1 and treat unsigned or
  invalid off-chain manifests as tier-5.
- **MUST** apply §5.2 precedence and §6 latest-version selection, failing closed
  on forks.
- **MUST** recompute and match `integrity.root` before trusting a sequential or
  predicate member set.

## Reference implementation

A reference generator for all vectors in this document (JCS profile + Merkle
`xtrata-merkle-v1`) is maintained alongside the XIPs at
[`vectors/generate.py`](vectors/generate.py) and is normative by example: where
prose and the reference generator disagree on a published vector, the vector is
authoritative and the prose is errata. Running `python3 vectors/generate.py`
reproduces and verifies every published hash in the corpus (XIP-001 §3.4/§4.5 and
XIP-002 §1.1) and emits [`vectors/vectors.json`](vectors/vectors.json).
Implementers **SHOULD** port it and diff before shipping.

## Summary

The Xtrata core preserves content and provenance. XIP-001 makes the manifest
layer *verifiable* by fixing one serialisation, one hash, one Merkle
construction, one signing message, and one precedence order — so every wallet,
marketplace and indexer computes the same bytes and reaches the same answer.
