# Rollout and Test Plan

## Phase 1: policy finalization

- Finalize consent text (`consent-statement-v1.md`).
- Finalize TOS document and compute `tos_hash`.
- Freeze `policy_version`.

Exit criteria:

- hash values are approved and published.

## Phase 2: backend foundation

- Add D1 migration for legal tables.
- Implement `GET /legal/status`.
- Implement `POST /legal/challenge`.
- Implement `POST /legal/verify`.
- Add structured server logs for challenge + verify outcomes.

Exit criteria:

- API works in local dev and preview Pages environment.

## Phase 3: frontend wiring

- Add shared legal gate helper (`src/lib/legal/*`).
- Add gate to:
  - `MintScreen`
  - `CollectionMintLivePage`
  - `DeployWizardPanel`
- Add clear, compact UI copy and retry behavior.

Exit criteria:

- protected actions are blocked until signature exists.
- accepted addresses are not prompted again.

## Phase 4: soft launch

- Deploy with `LEGAL_ENFORCED=false` for short validation window.
- Track:
  - challenge success rate
  - verify success rate
  - cancel rate
  - average time-to-sign

Exit criteria:

- no critical errors in preview + production logs.

## Phase 5: enforcement

- Switch to `LEGAL_ENFORCED=true`.
- Monitor for spikes in failures or user drop-off.

Exit criteria:

- stable completion metrics after enforcement.

## Automated test matrix

### Unit tests

- message builder produces deterministic exact output.
- chain ID mapping is correct for network.
- status resolver correctly evaluates accepted scopes.

### API tests

- challenge endpoint rejects invalid domain/network/scope/address.
- verify rejects expired challenge.
- verify rejects reused challenge (replay).
- verify rejects bad signature and address mismatch.
- verify persists acceptance rows and returns scopes.

### UI tests (targeted integration)

- mint flow pauses at legal gate when unsigned.
- deploy flow pauses at legal gate when unsigned.
- once signed, action resumes without second prompt.
- canceling signature does not execute protected transaction.

### Regression checks

- wallet connect/disconnect behavior remains unchanged.
- no extra prompts after first success for same policy/TOS.
- no forced scroll/layout shift from legal modal.
