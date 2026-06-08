# Xtrata v3.2.1 Mainnet Handover

This inscription records the mainnet handover to `xtrata-v3.2.1`.

## Contracts

- Previous live core: `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-1`
- New core: `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-1`

## What Changed

`xtrata-v3.2.1` preserves Xtrata as open inscription infrastructure while
hardening upload, relationship, migration, and reconstruction behavior.

Key protocol properties:

- fixed 16 KiB chunks;
- core upload payloads accept up to 32 chunks per upload batch;
- the core `mint-single-tx` route supports small inscriptions directly in one
  transaction;
- app tooling may use a 30 chunk practical policy for wallet and RPC safety;
- duplicate same-hash content is allowed to mint new token IDs;
- `get-id-by-hash` remains an advisory first-seen lookup;
- parent relationships and dependency relationships remain separate;
- migration from supported legacy Xtrata lines preserves token ownership,
  content metadata, token URI, and migration source records.

## Hash Lookup Policy

`HashToId` is not a strict canonical-content registry.

The first sealed or minted token for a final hash is recorded as the first-seen
ID. Later inscriptions with identical bytes can still mint distinct token IDs.
This keeps Xtrata available for artists, applications, mirrors, editions,
archives, and other use cases where identical content may legitimately appear in
different ownership or relationship contexts.

## Compatibility

Existing `xtrata-v2.1.x` inscriptions remain valid and reconstructable.
Migration into `xtrata-v3.2.1` is available for supported legacy lines where the
holder wants the v3 ownership, relationship, and resolver surface.

This inscription is intended to be the first public native inscription on the
new v3.2.1 mainnet contract after the one-shot next ID continuity setup.
