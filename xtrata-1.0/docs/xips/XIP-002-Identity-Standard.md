# XIP-002: Canonical Inscription Reference & Identity

- XIP: 002
- Title: Canonical Inscription Reference & Identity
- Status: Draft
- Category: Standards Track
- Requires: XIP-000, XIP-001
- Required-By: XIP-003, XIP-004, XIP-005, XIP-006, XIP-007, XIP-008
- Spec version: 1.0.0

> RFC 2119 / RFC 8174 keywords apply (see XIP-001).

## Abstract

XIP-002 defines **how an Xtrata asset is named, referenced, and reconciled across
contracts and migrations.** It is the second foundational standard: every
`inscriptionId`, every `contract` field, every provenance node, every marketplace
listing, and every package dependency in the corpus is a reference, and a
reference with ambiguous meaning is a fraud vector. This XIP removes the
ambiguity.

It also documents, precisely and honestly, three pieces of **real core
behaviour** that the rest of the corpus had been describing aspirationally:

1. the **id-space offset** that separates migrated/legacy ids from native ids;
2. that **migration lineage on the core is single-hop**, not a stored chain; and
3. that the core's **fee recipient is a single global admin value** misleadingly
   named `royalty-recipient`.

## Core principle

> An asset's identity is what the chain can prove about it — not what a manifest
> asserts. References are explicit, contract-qualified, and migration-aware.

## 1. Canonical inscription reference

The canonical, byte-stable form of a reference is:

```
<contract-principal>:<inscriptionId>
```

e.g. `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-3:359`.

- `<contract-principal>` is the fully-qualified Stacks principal of an Xtrata
  **core** contract (uppercase c32 issuer + `.` + contract name).
- `<inscriptionId>` is the unsigned integer token id within that contract.
- The two are joined by a single ASCII colon. This exact string is the input to
  any hash that references an inscription (e.g. provenance-graph node ids,
  XIP-001 Merkle leaves use the structured object, but human/index references use
  this string).

**Bare ids.** A manifest **MAY** use a bare integer `inscriptionId` *only* when
the enclosing manifest declares `defaultContract` (XIP-001 §1); the canonical
form is then `defaultContract:inscriptionId`. Stored/inscribed provenance and
cross-contract references **MUST** be fully qualified — bare ids **MUST NOT**
appear in an XIP-004 graph or an XIP-001 integrity leaf.

### 1.1 Test vector

```
reference        = SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-3:359
sha256(reference)= 0x8856e9b194e4b03513d0f5f887cb822a0a4e5c360949262230abc07f0bcffce7
```

## 2. The canonical core and historical cores

Xtrata has a **current canonical core** (the live v3 contract) and **historical
cores** (v1, v2, earlier v3 point releases). Tokens are migrated forward into the
canonical core before being organised or sold, so in normal operation a manifest
references **one** contract — but the reference model **MUST** remain
contract-qualified because:

- migrated tokens carry a cross-contract `migratedFrom` relation (§4);
- historical cores remain on-chain and queryable, and assets may still be
  referenced there;
- the canonical core itself changes across point releases.

A manifest **MUST NOT** assume an unqualified id resolves against whatever a
reader happens to think "current" is. `defaultContract` makes the assumption
explicit and inscribed.

## 3. The id-space offset (REAL, load-bearing)

The core assigns ids in **two regions** separated by a one-time **offset**:

- **Migrated/legacy region** — tokens migrated in from a prior core **preserve
  their original source id**. These occupy the low id range.
- **Native region** — natively-minted tokens start at the configured offset
  (set once via the core's one-shot `set-next-id`) and increment by one. The
  offset is chosen **above** the legacy id range so native mints never collide
  with same-id migrated tokens.

Consequences that implementers **MUST** honour:

- The id space is **not** a single contiguous range. It is
  `[migrated ids…] ‖ (gap) ‖ offset ‖ [native ids…]`, with arbitrary gaps in the
  migrated region (only the subset of legacy tokens that were actually migrated
  exists) and gaps in the native region (burns, never-minted ids).
- The **offset value is per-deployment.** The core does not currently expose a
  named getter for it; indexers determine it from the `set-next-id` transaction
  and/or by observing the lowest native id. A future core revision **SHOULD** add
  `get-offset`; until then XIP-006 indexers **MUST** record it per contract.
- **Sequential mapping (XIP-001 §4.2) MUST NOT cross the offset boundary.** A
  range spanning migrated and native regions silently mis-enumerates. Express
  such collections as explicit mapping, or as two manifests.

`crossesOffsetBoundary(contract, start, end)` (used by XIP-001 §4.2) is true iff
`start < offset(contract) <= end`.

## 4. Migration-aware identity (single-hop on-chain; chain reconstructed off-chain)

The core records, **for a migrated token only**, a single relation:

```
get-migration-source(id) -> { source-contract, source-id } | none
```

This is the token's **immediate** predecessor — **not** a full lineage chain.

### 4.1 What is and isn't a contract fact

- **Contract fact (authoritative):** "canonical-core token `N` was migrated from
  `source-contract:source-id`." One hop.
- **NOT a contract fact:** a v1 → v2 → v3 chain. If a token went v1→v2→v3, the v3
  core's `MigrationSource` points at the **v2** token; recovering the v1 origin
  requires querying the **v2 contract's** own `get-migration-source`. Each hop is
  a separate query against a separate, still-deployed contract.

Therefore: a "v1 → v2 → v3" continuity view is an **indexer reconstruction**
(XIP-006), authoritative only insofar as each hop independently verifies, and
**MUST** be labelled as derived where displayed (XIP-004). Any XIP or UI that
presents multi-hop lineage as "a single core fact" is incorrect.

### 4.2 Multi-hop resolution (normative)

```
function migrationChain(contract, id):
    chain = []
    cur = { contract, id }
    seen = set()
    loop:
        if cur in seen: break            # defensive; cross-contract cycle
        seen.add(cur)
        src = call cur.contract.get-migration-source(cur.id)
        if src is none: break
        if cur.contract not reachable/queryable:
            mark chain UNVERIFIED-TAIL; break
        chain.append({ from: src.contract:src.id, to: cur.contract:cur.id })
        cur = { contract: src.contract, id: src.id }
    return chain   # ordered oldest-edge-last; each edge independently verifiable
```

### 4.3 Canonical asset identity across migration

For de-duplication (one logical work shown once across its migration history),
the **canonical identity of a migrated asset is the reference of its token on the
current canonical core** — i.e. the *newest* token, not the oldest origin.
Rationale: the canonical-core token is the one that transfers, lists, and is
owned today; the origin is history. Consumers:

- **MUST** treat a canonical-core token and its pre-migration originals as the
  **same logical asset** for membership, history, and listing de-duplication
  (XIP-007).
- **MUST** key that asset by the canonical-core reference.
- **SHOULD** present prior-core references as historical aliases via the
  migration chain (§4.2), each labelled with its verification state.

## 5. Gaps, burns, and purged data

- **Gaps** (skipped/never-minted ids, un-migrated legacy ids) are normal. A
  reference to a non-existent id resolves to "not found"; manifests **MUST NOT**
  imply a contiguous range (this is why sequential mapping needs `exclusions`).
- **Burns.** A token transferred to an unspendable/burn principal still exists as
  a record but has no controlling owner. A manifest **MUST** declare how burned
  members are treated via `membershipSemantics`:
  - `"historical"` — once a member, always listed (membership is a fact about the
    past).
  - `"live"` — members are filtered to currently-owned (non-burned) tokens at
    read time; integrity roots over a `live` set MUST be pinned `asOfBlock`.
  Default when omitted: `"historical"`.
- **Purged pre-seal data.** The core can purge *expired upload chunks* before
  seal. Purged uploads never became inscriptions and have no id; they are not
  referenceable and **MUST NOT** appear in any manifest. Sealed content is
  immutable and never purged.

## 6. Fee recipient (naming hazard — normative clarification)

The core exposes `get-royalty-recipient` / `set-royalty-recipient` over a single
global `royalty-recipient` data var, **set by the contract admin**. Despite the
name:

- It is the recipient of **storage/protocol fees** paid to inscribe data.
- It is **global**, not per-token, and **not** tied to any creator.
- It is **NOT** a secondary-sale royalty and **NOT** an artist payout.

Consumers (wallets, marketplaces, explorers) **MUST NOT** render
`get-royalty-recipient` as a creator/artist royalty under any circumstances. A
future core **SHOULD** rename this to `get-fee-recipient`; until then this XIP is
the authoritative interpretation and XIP-001 §7 / XIP-007 reference it.

> Implementation note: because `creator` is set to the inscribing `tx-sender`, in
> tool- or contract-mediated mints the `creator` is the *minting agent*, not
> necessarily the human artist. Standards that need "artist" identity (XIP-007,
> XIP-005) **MUST** resolve it via namespace/authority (XIP-005 / XIP-001 §5.2),
> **not** by assuming `creator == artist`.

## 7. Source facts this XIP relies on (from the core)

Read-only getters an XIP-002-conformant indexer uses, all on the core:

| Getter | Returns | Used for |
|--------|---------|----------|
| `get-owner(id)` | current owner principal | ownership, transfers |
| `get-inscription-creator(id)` | immutable creator | authorship/authority |
| `get-inscription-hash(id)` | sealed `final-hash` | content integrity |
| `get-inscription-meta(id)` | owner/creator/mime/size/chunks/sealed/hash | summary |
| `get-parents(id)` | list ≤50 | lineage (XIP-004) |
| `get-dependencies(id)` | list ≤50 | requires/closure (XIP-004/005) |
| `get-migration-source(id)` | `{source-contract, source-id}` \| none | migration (§4) |
| `get-id-by-hash(hash)` | first-seen token id (advisory) | duplicate detection (XIP-004 `derivedHash`) |

**List caps.** `parents` and `dependencies` are capped at **50 each** per
inscription on the core. Standards building closures/graphs over them (XIP-004,
XIP-008) **MUST** handle the cap (composition, pagination) rather than assume
unbounded fan-out.

## 8. Conformance

An XIP-002-conformant implementation:

- **MUST** treat references as contract-qualified; **MUST NOT** resolve a bare id
  without a declared `defaultContract`.
- **MUST** record and respect the per-contract offset boundary; **MUST** reject
  sequential mappings that cross it.
- **MUST** reconstruct migration chains per §4.2, labelling each hop's
  verification state, and key canonical asset identity to the canonical-core
  token (§4.3).
- **MUST NOT** render `get-royalty-recipient` as a sale royalty (§6).
- **MUST** honour `membershipSemantics` for burns (§5).

## Summary

XIP-002 is the identity spine: explicit contract-qualified references, an honest
account of the id-space offset, single-hop on-chain migration with off-chain
multi-hop reconstruction, canonical asset identity keyed to the live token, and a
hard correction of the misleadingly-named global fee recipient. Everything else
in the corpus references assets through this lens.
