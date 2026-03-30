# xtrata Collection Mint vNext Spec

## Scope
- Working note for the next collection-mint template that will launch against `xtrata-v3.0.0`.
- Covers required compatibility changes plus optional product and protocol-facing upgrades worth considering before writing the new contract line.

## Recommendation
- Keep collection mint as an external contract.
- Do not fold collection sale logic into the core `xtrata` contract.

## Why keep it external
- Collection mint is a launch-policy layer, not a core inscription primitive.
- The current collection contract owns:
  - phases
  - allowlists
  - per-wallet caps
  - reservations
  - payout splits
  - minted index and mint context
- Those are collection-specific sale rules and should remain optional product modules around the core protocol.
- Keeping them outside the core preserves a cleaner protocol surface for third-party builders, simpler audits, and smaller upgrade blast radius.

## Current `v1.4` posture
- `xtrata-collection-mint-v1.4` is hard-locked to `xtrata-v2-1-0`.
- Existing deployed collection contracts cannot be repointed to `v3`.
- The app and deploy flow already assume the collection contract and core contract are separate concerns.

## Required `v3` changes

### 1. Ship a new collection-mint contract version
- Do not silently continue `v1.4`.
- Deploy a new template line for `v3`, likely `xtrata-collection-mint-v1.5` if the public surface is mostly preserved, or `xtrata-collection-mint-v2.0` if the mint API is intentionally cleaned up.
- Existing live `v1.4` collections stay on their original core.
- New collection deployments after `v3` goes live should use the new template only.

### 2. Retarget the trait to `v3` capabilities
- The next collection-mint trait should include the `v3` relationship-aware seal paths:
  - `seal-with-relationships`
  - `mint-single-tx`
  - `mint-single-tx-recursive`
  - `mint-single-tx-with-relationships`
- Keep `begin-inscription`, `add-chunk-batch`, `seal-inscription`, and `seal-inscription-batch` for staged and batch flows.
- Keep `get-admin` for recipient-editor authorization flow unless that admin model changes in the core.
- Add `quote-inscription-fee` to the trait only if the collection contract itself needs on-chain quoting. Otherwise let the app and SDK call the core directly.

### 3. Stop using the old helper-style small mint pattern
- `v1.4` small single-tx mint still composes:
  - `begin-or-get`
  - `add-chunk-batch`
  - `seal-inscription` or `seal-recursive`
- The next collection-mint contract should route single-tx mints into `v3` core-native single-tx entry points instead.
- This removes unnecessary reliance on older dedupe-era flow shape and lines the collection contract up with the intended `v3` core path.

### 4. Separate dependencies from parents
- Collection-level defaults should remain dependency-only.
- Do not create collection-level default parents.
- Parent relationships should be user-supplied at mint time and validated by the core at seal time.
- The next collection-mint line should support:
  - staged mint with explicit `parents`
  - single-tx mint with explicit `parents`
- Keep parent inputs optional so collections that do not need provenance links are not forced into extra arguments.

### 5. Update staged seal flow for `v3`
- The current `mint-seal` chooses between:
  - `seal-inscription`
  - `seal-recursive`
- The next line should choose among:
  - `seal-inscription`
  - `seal-recursive`
  - `seal-with-relationships`
- Selection should depend on whether the caller supplied:
  - no dependencies and no parents
  - dependencies only
  - dependencies plus parents

### 6. Keep the deployed core target immutable
- New contracts should still be locked to one allowed core principal once deployed.
- That immutability is good for launch safety and auditability.
- It is fine to continue using source-template replacement for `ALLOWED-XTRATA-CONTRACT`.
- A write-once `set-core-contract` initializer is possible, but it adds deployment complexity and more state to audit.
- Unless there is a strong tooling reason to avoid source replacement, keep the current immutable target model.

## App and SDK follow-on work
- Update collection deploy defaults to point at `xtrata-v3-0-0`.
- Update collection live mint UI to use the new collection contract version as the preferred template.
- Quote protocol fees from the core with:
  - `payer = buyer wallet`
  - `caller = collection contract principal`
- Keep collection mint price and protocol fee distinct in UI and spend-cap messaging.
- Update collection fee guidance code to stop assuming `v2`-style fee-unit heuristics.

## Recommended public API changes in the next collection-mint line

### Keep
- `mint-begin`
- `mint-add-chunk-batch`
- `mint-seal`
- `mint-seal-batch`
- allowlist and phase admin functions
- split and recipient admin functions
- minted index and mint context readers

### Add
- `mint-seal-with-relationships(...)`
- `mint-small-single-tx-with-relationships(...)`
- read-only summary getter for collection sale configuration

### Consider renaming or simplifying
- `mint-small-single-tx`
  - keep as a compatibility alias if helpful
  - or rename to a more general `mint-single-tx` if the contract supports more than one single-tx tier

## Potential upgrades worth considering

### 1. Collection-level quote read-only
- Add one read-only that returns a buyer-facing mint quote summary:
  - collection mint price
  - active phase price
  - core contract target
  - whether single-tx route is available
  - recommended protocol fee quote inputs
- This would reduce UI scatter across multiple getters and make public mint pages easier to integrate.

### 2. Two single-tx tiers
- Keep a conservative route for `<= 30` chunks.
- Optionally add an extended route for `<= 50` chunks if wallet testing proves it safe.
- If both exist, expose them as policy or read-only status, not hidden client heuristics.

### 3. Better collection-level price controls
- Today the contract supports fixed mint prices and phase prices.
- The next line could also support:
  - per-phase free mint
  - per-phase discounted mint
  - reserved free mints or sponsor-backed mints for allowlisted wallets
- Keep these separate from core protocol fee overrides.
- Collection price policy and core protocol fee policy should remain independently controllable.

### 4. Cleaner launch-status readers
- Add a single read-only status shape for:
  - paused
  - finalized
  - active phase
  - supply counts
  - price
  - allowlist mode
  - core target
- This would simplify the first-party live mint screen and reduce app call fan-out.

### 5. Reservation tooling
- Current reservation release and expiry tools are good, but the next line could add:
  - batch expired reservation release
  - read-only reservation counts by owner
  - summary reader for reservation expiry policy
- Useful operationally for large live launches.

### 6. Relationship-aware batch minting
- Possible but not required for first release.
- If added, batch item shapes would need per-item parent and dependency lists.
- This adds complexity quickly and should only be implemented if there is a real collection workflow that needs it.
- Recommendation: defer unless there is a proven launch use case.

### 7. Sponsored mint support
- If relayed or sponsored minting becomes important, add it deliberately rather than by overloading current wallet assumptions.
- That would likely require:
  - explicit caller policy
  - clear payer semantics
  - tighter quote and post-condition handling
- Recommendation: not part of the first `v3` collection-mint release unless there is an immediate product need.

## Non-goals
- Do not try to migrate existing deployed `v1.4` collection contracts in place.
- Do not treat default dependencies as default parents.
- Do not duplicate core fee policy maps inside collection mint.
- Do not make collection mint responsible for core migration of legacy `v1` or `v2` inscriptions.

## Recommended rollout posture
- Keep `xtrata-collection-mint-v1.4` available for legacy launches already deployed against `v2`.
- Introduce the next collection-mint line as the only recommended deploy target once `v3` is live.
- Update app, SDK, guides, and deploy defaults together so there is no mixed-message period where `v3` is live but collection deploys still default to `v1.4` plus `v2`.

## Bottom line
- The right architecture remains:
  - core `xtrata` contract = inscription protocol
  - collection mint contract = launch policy module
- The next collection-mint line should be a focused `v3` companion contract, not a merge into the core.
