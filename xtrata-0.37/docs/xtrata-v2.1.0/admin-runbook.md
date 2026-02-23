# Xtrata v2.1.0 Admin Runbook

This runbook covers deployment and operational tasks for v2.1.0.

## Deployment Checklist
1) Deploy the contract (clarinet/testnet/mainnet variants are managed by
   `scripts/contract-variants.mjs`).
2) Set the royalty recipient:
   - `set-royalty-recipient(recipient)`
3) Set the fee unit (optional if default is acceptable):
   - `set-fee-unit(new-fee)`
4) Set the ID offset once (recommended for continuity):
   - `set-next-id(last-v1-id + 1)`
5) Configure allowlist (optional):
   - `set-allowed-caller(contract, true)`
6) Unpause when ready:
   - `set-paused(false)`

## v1 Finalization (recommended)
- Pause v1 to stop public minting:
  - `set-paused(true)`
- Transfer v1 ownership to a lock/burn principal:
  - `transfer-contract-ownership(lock-principal)`
- This permanently prevents new v1 mints and guarantees a single ID sequence.

## Fee Model Notes
- Begin fee = fee-unit.
- Seal fee = fee-unit * (1 + ceil(total-chunks / 50)).
- Migration fee = fee-unit.
- Fee-unit changes are bounded:
  - new-fee <= old * 2
  - new-fee >= old / 10
  - new-fee within [FEE-MIN, FEE-MAX]

## Pause Strategy
- Pausing blocks inscription writes only.
- Transfers and read-only calls continue while paused.
- Allowlisted contract-callers can write while paused.
- If v2 is unpaused, public wallets can mint directly in the app.

## Allowlist Guidance
- Allowlist checks `contract-caller`, not `tx-sender`.
- Intended for trusted helper contracts (collection mint contracts, relayers).
- Remove allowlist entries when no longer needed.

## Migration Operations
- Migration uses `migrate-from-v1(token-id)` and charges fee-unit.
- If paused, users must be owner or allowlisted contract-caller.
- Consider a temporary unpause window or a dedicated migration helper.

## Monitoring and Indexing
- `get-last-token-id` returns the highest minted ID.
- `get-minted-count` and `get-minted-id` provide enumeration without assuming
  contiguous IDs.

## Admin Safety
- Protect the contract-owner key.
- Avoid allowlisting untrusted contracts.
- Set next-id only once; it cannot be changed later.
