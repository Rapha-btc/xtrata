# Xtrata v2.1.0 One Pager (Layman Friendly)

Xtrata v2.1.0 is the next step in the Xtrata inscription protocol. It keeps
everything you already rely on from v1.1.1, but adds smarter controls for
partner drops, optional migration, and long-term collection continuity.

This is a user-first upgrade: no reset, no new collection, no broken NFTs.
Just a better foundation for minting, collaboration, and scale.

---

## The short version

- Same collection, same IDs, same rules.
- Optional migration for anyone who wants v2 benefits.
- Built-in support for partner contracts and custom mint pricing.
- All inscriptions still seal on-chain in Xtrata, exactly as before.

---

## What stays the same (from v1.1.1)

- The core mint flow: begin -> upload chunks -> seal.
- Immutable content once sealed.
- Content-addressed IDs (same file = same hash).
- SIP-009 compatible NFTs that wallets and marketplaces already understand.
- Chunked uploads, batch reads, and recursive dependencies.

If you minted on v1.1.1, nothing breaks. Your NFTs stay valid and tradable.

---

## What is new in v2.1.0

### 1) One collection forever (ID continuity)
We can now set a one-time ID offset so v2 picks up exactly where v1 left off.
No new collection. No reboot. ID #0 and #1 stay #0 and #1 forever.

### 2) Optional migration for existing holders
If users want v2 features, they can migrate their v1 NFT. This:
- Escrows the v1 token inside v2
- Mints the same ID in v2
- Keeps the collection neat and unified

Migration is optional. If you do nothing, your v1 NFT stays valid.

### 3) Allowlisted partner contracts
v2 can trust approved contracts to mint while the main contract is paused.
This is built for collection contracts and partner drops.

### 4) Better indexing for large drops
v2 tracks minted IDs explicitly so indexers and apps can list collections
without assuming IDs are contiguous.

---

## What it means for users and collectors

- Your NFTs do not change or disappear.
- You can keep v1 NFTs as-is, or migrate if you want v2 utilities.
- v2 remains fully compatible with SIP-009 wallets and marketplaces.

---

## What it means for inscribers

- Same three-step mint flow you know.
- Same fee model (one begin fee, one seal fee).
- Uploads can still be resumed, abandoned, or purged.
- v2 is built for higher-volume drops with better enumeration.

---

## What it means for recursive app builders

- Recursion stays first-class.
- Dependencies can be sealed into new inscriptions exactly as before.
- v2 adds better indexing to support large, multi-part recursive apps.

---

## What it means for artists and marketplaces

v2 is designed for collaboration. You can deploy a small collection contract
for each drop. That contract can:

- Set a custom mint price
- Split fees between artist + marketplace + operator
- Handle the initial payment in one clean user step

After that, the contract calls Xtrata v2.1.0 to actually inscribe and seal.
This ensures the final asset is a true Xtrata inscription on-chain.

### Why this matters
- Artists get paid directly and transparently
- Marketplaces can apply their own fee logic
- Xtrata still handles the on-chain inscription and final seal

---

## The high-level user journey

1) User mints from a collection contract
   - Pays the artist + marketplace + operator split
2) The collection contract calls Xtrata v2.1.0
   - The user completes the begin / batch / seal steps
3) The NFT is sealed on-chain as a true Xtrata inscription

This keeps pricing flexible while preserving the trust and permanence of
Xtrata’s core inscription layer.

---

## Why this upgrade matters

Xtrata v2.1.0 is not a reset. It is a continuity upgrade.

- Same collection, same IDs, same permanence
- Better partner tooling for real-world mint drops
- Optional migration for users who want it
- Stronger indexing for large-scale projects

This is how Xtrata scales without breaking its history.
