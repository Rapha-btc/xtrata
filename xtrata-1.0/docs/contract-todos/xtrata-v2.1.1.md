# xtrata-v2.1.1 TODO

## Status
- In-repo upgrade candidate on top of `xtrata-v2.1.0`.
- Adds split fee controls but is not the default first-party production assumption in the current repo posture.

## What it does today
- Keeps the same core inscription, dependency, migration, and minted-index model as `xtrata-v2.1.0`.
- Changes fee configuration, not the recursion or provenance model.

## Shortcomings
- Inherits the same dependency-versus-parent problem as `xtrata-v2.1.0`.
- Still only migrates from `xtrata-v1.1.1`.
- Still relies on same-contract `uint` dependency ids.
- Does not provide a richer migration lineage model for clients.
- Upload pricing is still chunk-bucket based, so tiny files do not scale down proportionally by byte size.
- Fee exemptions and discounts are not modeled for wallets or collection contracts.
- The client-facing fee surface is still too thin for a policy-rich future core.

## TODO
- If the next core revision starts from `v2.1.1`, carry the split fee model forward.
- Replace chunk-bucket upload pricing with the byte-proportional fee model in `xtrata-v3-fee-spec.md`.
- Add explicit wallet and caller fee policy maps instead of implicit special-case free paths.
- Add a quote read-only so app and SDK spend caps stop depending on `get-fee-unit()` heuristics.
- Add separate parent/child storage and read-only access instead of overloading dependencies.
- Add migration from both `v1.1.1` and the active v2 core line if this contract becomes the base for a new rollout.
- Add explicit source-contract metadata for migrated content.

## Parent/child target model
- Keep dependencies open for reusable content references.
- Introduce parent relationships as a separate ownership-gated graph.
- Require parent ownership at child creation time, not for ordinary dependencies.
