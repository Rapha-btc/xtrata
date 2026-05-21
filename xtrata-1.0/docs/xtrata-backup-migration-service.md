# Xtrata Backup Migration Service

This document defines the first implementation path for backing up IPFS-hosted
SIP-009 collections onto Xtrata during a collection contract migration.

## Goal

Offer a migration service where a legacy collection keeps its token IDs and
metadata behavior, while the replacement SIP-009 contract exposes an immutable
Xtrata backup pointer for each migrated token.

The new collection contract should remain marketplace-compatible:

- `get-owner`, `transfer`, `get-token-uri`, and `get-last-token-id` keep SIP-009
  behavior.
- `get-token-uri` returns the same metadata URI used by the source collection
  unless a project explicitly approves a different metadata strategy.
- Backup data is exposed through additional read-only functions such as
  `get-backup` and `get-backup-uri`.

## Non-Goal

The Stacks contract cannot fetch IPFS bytes. The service must fetch, normalize,
chunk, and submit the bytes from an off-chain migration builder before or during
the holder migration process.

## Primary Service Mode

Use a pre-inscribed migration for the first production service.

1. The collection owner requests a migration and supplies source contract
   details.
2. The off-chain migration builder enumerates source token IDs and reads
   `get-token-uri`.
3. The builder fetches IPFS metadata and referenced media, then creates a
   deterministic backup payload for each token.
4. The builder inscribes each backup payload through Xtrata:
   `begin-or-get -> add-chunk-batch -> seal-inscription`.
5. The builder registers the immutable backup pointer in
   `xtrata-backup-registry-v1.0`.
6. Holders migrate into the replacement collection contract. The migration
   function verifies ownership of the old token, verifies a backup pointer is
   registered, escrows the old token, mints the replacement token with the same
   ID, and stores the backup pointer locally.

This mode is safer than asking holders to upload IPFS bytes themselves. It lets
the service retry gateways, pin data, audit failures, and publish a complete
migration manifest before users move tokens.

## Backup Payload

The canonical payload should be a JSON document with enough information to
restore the token without depending on IPFS:

```json
{
  "schema": "xtrata.collection-backup.v1",
  "source": {
    "contract": "SP...old-collection",
    "tokenId": "123",
    "tokenUri": "ipfs://..."
  },
  "metadata": {
    "contentType": "application/json",
    "bytesSha256": "..."
  },
  "assets": [
    {
      "field": "image",
      "uri": "ipfs://...",
      "contentType": "image/png",
      "bytesSha256": "...",
      "data": "base64..."
    }
  ]
}
```

For small collections, the first version can embed asset bytes directly in this
payload. For large video/audio collections, the builder can inscribe metadata
and assets as separate Xtrata inscriptions, then use recursive dependencies.

## Registry Contract

`xtrata-backup-registry-v1.0` records immutable pointers keyed by source
collection and source token ID.

Fields:

- `xtrata-contract`: the Xtrata contract that stores the backup inscription.
- `inscription-id`: the Xtrata token ID.
- `content-hash`: the final content hash verified against Xtrata.
- `metadata-uri`: the original source token URI.
- `backup-uri`: a compact permanent pointer string for display and off-chain
  clients.
- `registered-at`: Stacks block height.
- `registrar`: principal that recorded the pointer.

The prototype registry is locked to the current Xtrata core contract and
verifies that `get-inscription-hash` for the referenced inscription matches
`content-hash` before accepting the record. A missing inscription returns no hash
and is rejected.
Future registries can be versioned per Xtrata core contract if a later core adds
a response-shaped read trait for generic hash verification.

Records are append-only. A bad record requires a new migration contract or a
separately documented correction process; the registry does not mutate pointers.

## Migrated Collection Contract

Each migrated collection should lock these deployment constants:

- source SIP-009 contract
- backup registry contract
- collection name and symbol

Migration rules:

- Caller must own the source token.
- Source token must not already be migrated.
- A registry backup must exist before migration.
- Source token is transferred into the migrated collection contract as escrow.
- Replacement token is minted with the same ID.
- Original `get-token-uri` value is copied into the replacement contract.
- Backup pointer is copied into the replacement contract for stable local reads.

Recommended extra read-only functions:

- `get-source-contract()`
- `get-backup-registry()`
- `is-migrated(token-id)`
- `get-migrated-count()`
- `get-migrated-id(index)`
- `get-backup(token-id)`
- `get-backup-uri(token-id)`

## Marketplace Positioning

The replacement contract stays SIP-009-compatible, but marketplaces may still
treat a new contract address as a new collection. The service should describe
this accurately:

> Migrates the collection to a SIP-009-compatible contract with identical token
> URI behavior plus Xtrata on-chain backup pointers.

Marketplace collection grouping, old listings, floor history, and verification
badges may require marketplace coordination.

## First Implementation Scope

The initial repo implementation includes:

- `contracts/clarinet/contracts/xtrata-backup-registry-v1.0.clar`
- `contracts/clarinet/contracts/mock-ipfs-collection.clar`
- `contracts/clarinet/contracts/xtrata-migrated-ipfs-collection-v1.0.clar`
- focused Clarinet tests covering registration, Xtrata hash verification,
  owner-only migration, source-token escrow, URI preservation, and backup reads.

The prototype intentionally stays in `contracts/clarinet` until the service
contract names, registry ownership model, and production deployment addresses
are approved.
