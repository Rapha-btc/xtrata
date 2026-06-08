# XIP-002: Xtrata Marketplace Standard

- Status: Draft
- Category: Standards Track
- Depends on: XIP-001 (manifest envelope), XIP-003 (provenance), XIP-004 (namespace)

## Abstract

XIP-002 defines how marketplaces list, verify and trade Xtrata inscriptions
interoperably. It draws a hard line between **data** (the Xtrata core), **meaning**
(XIP-001 manifests) and **money** (a marketplace contract). Sale economics are
enforced on-chain by the marketplace contract; the manifest only points at it.

## Core principle

> Xtrata stores data. The manifest organises it. The marketplace contract sells
> it. None of the three impersonates another.

## Layering

| Layer | Holds | Trust |
|-------|-------|-------|
| Xtrata core | content, creator, owner, hash, lineage, storage-fee recipient | hard, on-chain |
| Manifest (XIP-001) | title, collection membership, display order | soft, verifiable if inscribed |
| Marketplace contract | price, sale split, settlement | hard, on-chain |

The Xtrata core's fee recipient is the **storage/protocol fee** only and MUST
NOT be read as a sale royalty (see XIP-001).

## Collection identity

A marketplace MUST establish an **authoritative collection identity** before
grouping listings, to prevent a third party from wrapping a token into a fake
collection:

1. Resolve the collection manifest (XIP-001).
2. Accept it only if it passes XIP-001 *Conflict precedence* — i.e. authored
   on-chain by the tokens' creator/owner, or anchored to a namespace the
   authority controls (XIP-004).
3. Verify the member set against the manifest's `integrityRoot`.

Listings whose collection identity fails verification MUST be shown as
unverified, never as the canonical collection.

## Membership & enumeration

- A marketplace MUST be able to enumerate a collection's exact member set and
  verify it is complete and tamper-evident.
- Membership comes from the XIP-001 mapping (explicit items, or sequential with
  `exclusions` + `integrityRoot`). Raw id ranges without an integrity commitment
  MUST NOT be trusted, because real id spaces contain gaps and migration offsets.

## Migration-aware identity

Tokens migrated into the canonical core carry their lineage as a hard contract
fact. A marketplace MUST treat a migrated token and its pre-migration original
as the **same logical asset** for the purposes of collection membership,
history, and de-duplication of listings.

## Economics (on-chain, contract-enforced)

Sale terms live in the marketplace contract, never in a manifest:

- The contract settles each sale and distributes proceeds in a single
  transaction.
- A typical split is a protocol fee divided between the **marketplace**, a
  **platform operator**, and the **artist** (who receives the remainder). Exact
  percentages are a property of the deployed marketplace contract, not of this
  standard.
- Settlement currencies (e.g. STX, sBTC, USDC) are a property of the contract;
  marketplaces SHOULD surface which the contract supports.
- The Xtrata core is referenced for asset identity and transfer only; it does
  not price or split.

A manifest references the governing economics contract via its `economics`
pointer (XIP-001); the marketplace reads terms from that contract on-chain.

## Read / verify interface

A conformant marketplace integration resolves, for any listing:

```
resolve(inscriptionId) -> {
  asset:      { contract, inscriptionId, creator, owner, hash, lineage },
  collection: { manifestId, authority, integrityRoot } | null,
  economics:  { contract, supportedCurrencies } | null
}
```

- `asset` is read from the Xtrata core (hard facts).
- `collection` is the verified XIP-001 manifest, or null if none passes
  precedence.
- `economics` is read from the marketplace contract referenced by the manifest,
  or discovered by the marketplace itself.

## Anti-fraud requirements

- Never present an unverified manifest as canonical collection identity.
- Never display the storage-fee recipient as a creator royalty.
- Always verify content hash and (where present) membership integrity root
  before asserting authenticity.

## Summary

Marketplaces trade Xtrata assets by reading hard facts from the core, verified
identity from inscribed manifests, and enforceable terms from a marketplace
contract — keeping data, meaning and money cleanly separated.
