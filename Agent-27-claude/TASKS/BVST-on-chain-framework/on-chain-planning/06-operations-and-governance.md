# Operations And Governance

## Release Discipline

This copied bundle should be treated as a frozen release artifact, not as an editable working tree.

Before any wallet action:

1. verify the staged bytes
2. refresh the live fee quote
3. initialize runtime execution state
4. confirm the signer is working from the generated runtime files, not from memory

## Roles

Even if one person performs all of them, keep these roles conceptually separate:

- planner: owns module boundaries, batch order, and release approval
- verifier: runs `verify-bundle.mjs` and reviews preflight output
- operator: performs the mint loop and records results after each success
- signer: approves and broadcasts transactions

The release is safer when the signer is not improvising file selection or dependency order.

## Canonical Runtime Files

These are the local files that define live release state:

- `configs/token-map.runtime.json`
- `verification/inscription-log.json`
- `verification/rendered-index.json`
- `verification/preflight.quote.json`
- `verification/inscription-status.json`

If these files drift from reality, the release becomes hard to resume safely.

## Operator Control Loop

After every successful mint:

1. run `apply-inscription-result.mjs`
2. confirm the token-map entry was updated
3. confirm the inscription log appended correctly
4. confirm rendered readiness changed only where expected
5. only then continue to the next artifact

This is the enforcement step that keeps downstream catalogs accurate.

## Hard Safety Controls

1. Never mint catalog templates from `catalogs/`.
2. Never overwrite an existing token-map entry with different on-chain data.
3. Never continue after a `route-mismatch` or unresolved rendered field.
4. Never accept a dependency signature change for an already inscribed catalog.
5. Always re-read `get-fee-unit` before final spend approval.
6. Keep signing keys separate from file preparation steps.

## Cost Controls

As of `2026-03-21`, protocol cost is no longer the dominant risk for this release:

- live fee-unit at quote time: `0.001 STX`
- total protocol-fee subtotal for `53` artifacts: `0.159 STX`

The larger cost variable is network mining fee. That means the operational emphasis should be:

- avoid failed retries
- avoid reminting already-known bytes
- avoid route drift
- keep dependency order correct so no transaction spends are wasted on unusable catalogs

Read the mining-fee section from `verification/preflight.quote.json` in two layers:

- `quote.miningFee.rough`: deterministic fallback using total bytes at `$1/MB`
- `quote.miningFee.live`: live network estimate from current fee endpoints when reachable

## Resume Safety

The runtime scripts were prepared specifically for restart-safe execution:

- rendered catalogs are keyed to a dependency-resolution signature
- rerunning the renderer does not rewrite a ready catalog if its dependency set is unchanged
- already-inscribed catalog signatures are treated as immutable
- recording the same inscription result again is idempotent

## Definition Of Done

A live release is done only when:

- all `53` artifacts have recorded token IDs
- rendered catalogs were the versions actually minted
- `verification/inscription-log.json` can be used as a complete replay log
- the final token IDs are committed back into repo-controlled release records
