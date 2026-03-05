# Small File Single-Tx Helper (Optional)

Contract: `xtrata-small-mint-v1.0`

This helper adds a one-call write path for small payloads while keeping
`xtrata-v2.1.0` as the canonical inscription core.

## Goal
- Allow one user transaction for small files (`<= 30` chunks) by combining:
  - `begin-or-get`
  - `add-chunk-batch`
  - `seal-inscription` (or `seal-recursive`)

## Why this is a helper (not a core replacement)
- Core invariants, dedupe, ID assignment, and content storage still happen in
  `xtrata-v2.1.0`.
- The helper only changes UX/orchestration for small uploads.
- Duplicate content still resolves to the canonical existing ID via dedupe.
- Core target defaults to `xtrata-v2.1.0` and is owner-configurable for
  local/testnet/mainnet deployments.

## Limits
- Helper chunk cap: `30` chunks.
- Core chunk size still applies: `16,384` bytes.
- Approximate payload target: `~440KB to ~492KB` depending on final chunk size.

## Behavior
- If hash already exists, helper returns existing ID and does not mint.
- If hash is new, helper mints in one transaction and returns new ID.
- If core is paused, helper must be allowlisted in core (`set-allowed-caller`)
  because v2 pause checks `contract-caller`.

## Tradeoffs
- Simpler UX/signing flow for small files.
- Less granular resume behavior on the helper path (single call retries from
  the start if the transaction fails).
- Large files still use the standard staged flow.
