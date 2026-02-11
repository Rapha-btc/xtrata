# Contract v1.0 Capabilities and Gaps

Reference contract:

- `contracts/live/xtrata-collection-mint-v1.0.clar`

Primary behavior summary:

1. Per-collection mint coordinator with one-time mint fee collection.
2. Fee split support across artist, marketplace, and operator recipients.
3. Allowlist mode and per-wallet cap support.
4. Max supply + reservation accounting + finalization lock.
5. Proxy mint flow into core xtrata contract (`mint-begin -> mint-add-chunk-batch -> mint-seal` and `mint-seal-batch`).

## What v1.0 already supports

1. Collection mint economics
- `set-mint-price`
- `set-recipients`
- `set-splits`

2. Collection controls
- `set-max-supply` (single set)
- `set-paused`
- `finalize`

3. Access and limits
- `set-allowlist-enabled`
- `set-allowlist` / `set-allowlist-batch` / `clear-allowlist`
- `set-max-per-wallet`

4. Recovery and safety
- `release-reservation(owner, hash)`
- reservation and minted counters

5. Read-only endpoints for UI
- owner, pause, price, supply, minted/reserved counts, finalized,
- recipients, splits,
- allowlist flags and entries,
- wallet stats.

## Hard constraints and product implications

1. No on-chain collection display metadata
- No collection title/description/banner field on this contract.
- Implication: portal must store display metadata off-chain.

2. No on-chain staged asset inventory
- Contract does not store a preloaded catalog of files.
- Implication: "artist uploads folder for others to mint" needs off-chain manifest/storage.

3. No per-asset mint claim state
- Contract tracks wallet and collection totals, not asset-level claim IDs.
- Implication: one-file-one-mint guarantees are off-chain unless a new contract version adds claim tracking.

4. Owner-only admin writes
- Settings can be changed only by `contract-owner`.
- Implication: portal must verify owner for each managed collection contract.

5. Max supply is immutable after first set
- `set-max-supply` fails after first success.
- Implication: portal must include explicit confirmation and preflight checks.

6. Finalize is irreversible
- Finalized contract blocks settings and mint actions.
- Implication: finalize needs a gated checklist UX.

7. Paused default on deploy
- Contract starts with `paused=true`.
- Implication: setup flow should include guided "configure then unpause" sequencing.

## Existing app alignment

Current screens already prove major capabilities:

1. `src/screens/CollectionMintAdminScreen.tsx`
- Manages collection-mint settings and allowlists.

2. `src/screens/CollectionMintScreen.tsx`
- Runs collection-mint begin/chunk/seal flow for local files.

Gap versus requested artist experience:

1. No dedicated artist page with scoped access.
2. No guided deploy wizard specific to collection contracts.
3. No shared staged inventory service for buyers.
4. No artist-centric collection operations dashboard.
