# XIP-007: Xtrata Marketplace

- XIP: 007
- Title: Marketplace
- Status: Draft
- Category: Standards Track
- Requires: XIP-001, XIP-002, XIP-003, XIP-005, XIP-006
- Spec version: 1.0.0

> RFC 2119 / RFC 8174 keywords apply (see XIP-001).

## Abstract

XIP-007 defines how marketplaces list, verify and trade Xtrata inscriptions
interoperably. It draws a hard line between **data** (the Xtrata core),
**meaning** (XIP-003 manifests) and **money** (a marketplace contract), and it
fixes the gap in the prior draft: it now defines a **marketplace contract trait**
so "read terms from the contract on-chain" is actually implementable, and it
describes the economics **as the deployed contracts actually implement them**
(a single protocol fee), not an aspirational multi-party split.

## Core principle

> Xtrata stores data. The manifest organises it. The marketplace contract sells
> it. None of the three impersonates another, and the standard never describes
> economics the contract does not enforce.

## 1. Layering

| Layer | Holds | Trust |
|-------|-------|-------|
| Xtrata core | content, creator, owner, hash, migration source, **global storage-fee recipient** | hard, on-chain |
| Manifest (XIP-003) | title, collection membership, display order | soft, verifiable if inscribed |
| Marketplace contract | listing, price, payment token, protocol fee, settlement | hard, on-chain |

The core's `get-royalty-recipient` is the **global storage/protocol-fee
recipient** only and **MUST NOT** be read or displayed as a sale royalty
(XIP-002 §6).

## 2. Collection identity (anti-fraud)

Before grouping listings, a marketplace **MUST** establish an authoritative
collection identity, to stop a third party wrapping a token into a fake
collection:

1. Resolve the collection manifest (XIP-003) via the XIP-006 resolver.
2. Accept it only at **tier T1 (verified-namespace)** or **T2 (verified-creator)**
   per XIP-001 §5.2 / XIP-006 §1. T3 (owner) is acceptable for *item display* but
   **MUST NOT** define collection membership. T4/T5 **MUST** be shown as
   unverified.
3. Verify the member set against the manifest's `integrity.root` (XIP-001 §4.4) —
   recomputed, never trusted as stated.

Listings whose collection identity fails verification **MUST** be shown as
unverified, never as the canonical collection.

## 3. Membership & enumeration

- A marketplace **MUST** be able to enumerate a collection's exact member set and
  verify it is complete and tamper-evident.
- Membership comes from the XIP-001 mapping (explicit, or sequential with
  `exclusions` + `integrity.root`). Raw id ranges without an integrity commitment
  **MUST NOT** be trusted; ranges that cross the id-space offset boundary
  **MUST** be rejected (XIP-002 §3).

## 4. Migration-aware identity

A migrated token and its pre-migration originals are the **same logical asset**
(XIP-002 §4.3). A marketplace **MUST** key listings by the **canonical-core
identity**, de-duplicate listings of the same logical asset, and present prior
references as historical aliases — so the same work cannot be double-listed as
"two NFTs."

## 5. Economics — honest, on-chain, contract-enforced

Sale terms live in the marketplace contract, never in a manifest.

**What the deployed Xtrata market contracts actually do today** (stated plainly so
the standard does not misrepresent royalties): each market holds a **single
protocol fee** (`get-fee-bps`) paid to the **market contract owner**, and settles
a sale by transferring `price − fee` to the **seller** and `fee` to the fee
recipient, in one transaction, in the contract's payment token. **There is no
automatic creator/artist royalty split in these contracts.** A consumer
**MUST NOT** imply the artist receives a secondary royalty unless a specific
deployed contract demonstrably enforces one.

A standard-conformant marketplace:

- **MUST** read fee and settlement terms from the marketplace contract via the
  trait (§6), not from any manifest.
- **MUST** surface the payment token and fee to the user before purchase.
- **MUST NOT** present the core storage-fee recipient as a creator royalty.
- **MAY**, where a contract *does* enforce a creator split, read and display it —
  but only from the contract, and labelled as enforced-on-chain.

> If the ecosystem wants enforced creator royalties, that is a property of a
> future marketplace contract (and a possible trait extension), **not** of this
> standard or of any manifest. Until such a contract is deployed and referenced,
> conformant UIs show the single-fee reality.

## 6. Marketplace contract trait (REQUIRED for interop)

For a marketplace contract to be discoverable and readable by third-party UIs, it
**SHOULD** implement the following Clarity trait. It is the minimal common
denominator across the deployed STX/sBTC/USDC markets, normalised:

```clarity
(define-trait xtrata-marketplace-trait
  (
    ;; identity of the core whose tokens this market trades
    (get-core-contract () (response principal uint))
    ;; payment token: none => STX; some(principal) => SIP-010 FT contract
    (get-payment-token () (response (optional principal) uint))
    ;; protocol fee in basis points (single fee model)
    (get-fee-bps () (response uint uint))
    ;; listing lookup by Xtrata inscription id
    (get-listing-by-token (principal uint)
       (response (optional {
          listing-id: uint, seller: principal, price: uint, active: bool
       }) uint))
    ;; settlement preview: what each party receives for a given listing
    (get-settlement-preview (uint)
       (response {
          price: uint, fee: uint, fee-recipient: principal,
          seller-proceeds: uint, payment-token: (optional principal)
       } uint))
  ))
```

- `get-core-contract` lets a UI confirm the market trades the expected Xtrata
  core (defends against a market pointed at a look-alike contract).
- `get-payment-token` `none` means STX; `some(ft)` names the SIP-010 token.
- `get-settlement-preview` is the honest "who gets paid what" function — it
  exposes exactly the single-fee split the contract enforces, with no room for a
  manifest to assert different terms.

Existing markets that predate this trait (`xtrata-market-stx/sbtc/usdc-v1.0`,
`xtrata-commerce`) expose **overlapping but non-identical** read-onlys; a
conformant integration **SHOULD** adapt them to this trait shape, and future
markets **SHOULD** implement the trait directly. Naming drift in the legacy set
(`get-nft-contract` vs `get-core-contract`, `get-last-listing-id` vs
`get-next-listing-id`, `list-token` vs `create-listing`) is exactly why the trait
exists.

## 7. Read / verify interface

A conformant marketplace integration resolves, for any listing, via XIP-006:

```
resolve(reference) -> {
  asset:      { contract, inscriptionId, creator, owner, hash, canonicalId, migration },
  collection: { manifest, tier, integrityVerified } | null,   // tier per XIP-006 §1
  market:     { contract, paymentToken, feeBps, settlementPreview } | null
}
```

- `asset` is read from the Xtrata core (hard facts, XIP-002).
- `collection` is the verified manifest at tier T1/T2 (or T3 for item display),
  or null if none passes precedence; `integrityVerified` is the recomputed result.
- `market` is read from the marketplace contract via the §6 trait, or null.

## 8. Anti-fraud requirements

- **MUST NOT** present an unverified (T3-for-membership / T4 / T5) manifest as
  canonical collection identity.
- **MUST NOT** display the core storage-fee recipient as a creator royalty.
- **MUST** verify content hash and (where present) membership `integrity.root`
  before asserting authenticity.
- **MUST** confirm the market's `get-core-contract` matches the asset's core
  before trusting a listing.
- **MUST** re-resolve namespace ownership and current owner at point of sale
  (XIP-005 §5, XIP-006 §4).

## 9. Conformance

A marketplace conforms to XIP-007 if it establishes collection identity per §2,
enumerates and integrity-checks membership per §3, de-duplicates migrated assets
per §4, reads economics solely from a trait-conformant contract per §5–§6,
exposes the §7 resolve shape, and enforces §8.

## Summary

Marketplaces trade Xtrata assets by reading hard facts from the core, verified
identity from inscribed manifests at a known trust tier, and **enforceable,
honestly-described terms** from a trait-conformant marketplace contract — keeping
data, meaning and money cleanly separated, and never describing economics the
contract does not actually enforce.
