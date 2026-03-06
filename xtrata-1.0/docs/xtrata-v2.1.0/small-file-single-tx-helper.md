# Small File Single-Tx Helper (Optional)

Contract: `xtrata-small-mint-v1.0`
Mainnet deployment: `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-small-mint-v1-0`

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

## SDK + UI integration details (2026-03-05)
- SDK call builders:
  - `buildSmallMintSingleTxCall(...)`
  - `buildSmallMintSingleTxRecursiveCall(...)`
- SDK workflow planner:
  - `buildSmallMintSingleTxWorkflowPlan(...)`
  - validates `<= 30` chunks and returns one deny-mode call plan
- SDK spend-cap helper:
  - `resolveSmallMintSingleTxSpendCapMicroStx(...)`
  - cap basis is combined protocol fees for begin + seal (single wallet tx)
- First-party app route rule:
  - auto-route to helper when chunk count is `1..30`, no resume state exists,
    and contract capability is not legacy `v1.1.1`
  - route falls back to staged flow for `>30` chunks
- Helper function selection:
  - no dependencies: `mint-small-single-tx`
  - with dependencies: `mint-small-single-tx-recursive`
- UX behavior:
  - single wallet approval marks init/upload/seal stages as complete together
  - resume flow remains for staged minting path only

## Tradeoffs
- Simpler UX/signing flow for small files.
- Less granular resume behavior on the helper path (single call retries from
  the start if the transaction fails).
- Large files still use the standard staged flow.
