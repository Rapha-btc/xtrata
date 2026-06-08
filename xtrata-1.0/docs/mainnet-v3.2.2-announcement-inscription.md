# Xtrata v3.2.2 Mainnet Handover

This inscription records the mainnet handover to `xtrata-v3.2.2`.

## Contracts

- Previous live core: `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0`
- New core: `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-2`

## What Changed

`xtrata-v3.2.2` is a clean, focused evolution from `xtrata-v3.2.1`. Core
inscription and upload logic is identical. The only protocol-level change is the
removal of the `migrate-from-v2-1-1` path, which referenced a contract
(`xtrata-v2-1-1`) that was never deployed to mainnet.

Key protocol properties preserved from v3.2.1:

- fixed 16 KiB chunks;
- core upload payloads accept up to 32 chunks per upload batch;
- the core `mint-single-tx` route supports small inscriptions directly in one
  transaction;
- app tooling may use a 30 chunk practical policy for wallet and RPC safety;
- duplicate same-hash content is allowed to mint new token IDs;
- `get-id-by-hash` remains an advisory first-seen lookup;
- parent relationships and dependency relationships remain separate;
- migration from `xtrata-v1-1-1` and `xtrata-v2-1-0` preserves token ownership,
  content metadata, token URI, and migration source records.

## Migration Support

`xtrata-v3.2.2` supports migration from the two contracts that were actually
deployed to mainnet:

- `xtrata-v1-1-1` via `migrate-from-v1`
- `xtrata-v2-1-0` via `migrate-from-v2-1-0`

The `migrate-from-v2-1-1` function has been removed. `xtrata-v2-1-1` was never
deployed to mainnet and has no live tokens.

## Hash Lookup Policy

`HashToId` is not a strict canonical-content registry.

The first sealed or minted token for a final hash is recorded as the first-seen
ID. Later inscriptions with identical bytes can still mint distinct token IDs.
This keeps Xtrata available for artists, applications, mirrors, editions,
archives, and other use cases where identical content may legitimately appear in
different ownership or relationship contexts.

## Compatibility

Existing `xtrata-v2.1.x` inscriptions remain valid and reconstructable.
Migration into `xtrata-v3.2.2` is available for supported legacy lines where the
holder wants the v3 ownership, relationship, and resolver surface.

This inscription is intended to be the first public native inscription on the
new v3.2.2 mainnet contract after the one-shot next ID continuity setup.
