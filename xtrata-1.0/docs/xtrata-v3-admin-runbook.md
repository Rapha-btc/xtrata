# Xtrata v3.0.0 Admin Runbook

This runbook turns the v3 launch checks into an ordered deployment sequence.
It is written for the core contract at `contracts/live/xtrata-v3.0.0.clar`.

## Before you deploy

1. Confirm the deployer principal is in the same principal family as the live
   legacy contracts.
   Reason: v3 migration calls `.xtrata-v1-1-1`, `.xtrata-v2-1-0`, and
   `.xtrata-v2-1-1` directly, so the deployed contract must sit beside the
   legacy contracts you expect to migrate from.
2. Decide the migration scope you will publicly support on day one.
   Minimum expected live routes are `v1.1.1`, `v2.1.0`, and `v2.1.1`.
   Record an explicit yes/no decision on `v1.1.0` before launch.
3. Decide whether you need an explicit initial `next-id`.
   If you want fresh v3 mints to continue after an existing legacy id line, set
   that cursor before any mint or migration transaction.
   Skip `set-next-id` only if `v3` is intentionally starting from `u0`.
4. Decide the fee policy before launch:
   - `fee-recipient`
   - `staged-begin-fee-unit`
   - `staged-seal-fee-unit`
   - `single-tx-fee-unit`
   - `upload-byte-fee-unit`
   - `extra-batch-fee-unit`
   - any wallet or caller basis-point overrides
5. Decide whether any helper contracts need writes while paused.
   Typical example: `xtrata-collection-mint-v1.5` once it is deployed.
6. Prepare three smoke-test assets:
   - one staged mint file
   - one single-tx mint file
   - one legacy token for migration testing

## Important v3 gotchas

- `set-next-id` is one-time only and also requires `minted-count == u0`.
  That means any mint or migration will permanently close the window for a
  manual offset transaction.
- The fee floor is `u1`, which is `0.000001 STX`.
- Fee updates are still rate-limited:
  - maximum increase per update: `2x`
  - maximum decrease per update: `10x`
- The contract starts paused.
- While paused, direct user migration calls are blocked unless the caller is
  also the contract owner.
- `AllowedCallers` only helps for contract-routed writes, not normal direct
  wallet calls.

## Ordered deployment checklist

1. Deploy `xtrata-v3.0.0`.
2. Verify the initial read-only state:
   - `get-admin()` returns the deployer
   - `is-paused()` returns `true`
   - `get-next-token-id()` returns `u0`
   - `get-minted-count()` returns `u0`
3. Set the fee recipient:
   - `set-fee-recipient(recipient)`
4. If you need an explicit starting cursor, set it now before any mint or
   migration:
   - `set-next-id(value)`
5. Set the core fee units.
   Use the explicit setters unless you intentionally want the compatibility
   profile:
   - `set-staged-begin-fee-unit(new-fee)`
   - `set-staged-seal-fee-unit(new-fee)`
   - `set-single-tx-fee-unit(new-fee)`
   - `set-upload-byte-fee-unit(new-fee)`
   - `set-extra-batch-fee-unit(new-fee)`
6. If you want special pricing, set wallet and caller policy rows:
   - `set-wallet-fee-bps(wallet, bps)`
   - `set-caller-fee-bps(caller, bps)`
7. If any helper contracts need to write while the core is paused, allowlist
   them now:
   - `set-allowed-caller(caller, true)`
8. Verify the configured fee and policy state with read-only calls:
   - `get-fee-recipient()`
   - `get-begin-fee-unit()`
   - `get-seal-fee-unit()`
   - `get-single-tx-fee-unit()`
   - `get-upload-byte-fee-unit()`
   - `get-extra-batch-fee-unit()`
   - `get-wallet-fee-bps(wallet)`
   - `get-caller-fee-bps(caller)`
   - `is-allowed-caller(caller)`
9. Quote fees before any public launch:
   - staged quote:
     `quote-inscription-fee(payer, none, total-size, total-chunks, u1)`
   - single-tx quote:
     `quote-inscription-fee(payer, none, total-size, total-chunks, u2)`
   - collection/helper quote:
     `quote-inscription-fee(payer, (some caller), total-size, total-chunks, mode)`
10. Smoke-test one staged mint while still paused.
    The simplest path is a direct mint from the admin wallet.
11. Smoke-test one single-tx mint while still paused.
    Again, the direct admin wallet path is the simplest controlled test.
12. Smoke-test one migration from the legacy line you care about most.
    If the admin wallet owns the legacy test token, you can do this while
    paused.
    If a normal holder wallet owns the test token, temporarily unpause after
    the fee and policy setup, run the migration test, then pause again if you
    still need a controlled launch window.
13. Verify migration state after the smoke test:
    - `get-migration-source(id)`
    - `get-next-token-id()`
    - `get-owner(id)`
14. If you used a temporary unpause window for testing, re-pause:
    - `set-paused(true)`
15. When launch checks are complete, open public minting:
    - `set-paused(false)`
16. Do a final post-unpause verification:
    - `is-paused()` returns `false`
    - `quote-inscription-fee(...)` still matches the intended public fee policy
    - any allowlisted helper contracts still resolve as expected

## Suggested fee step-down sequences

If you want to move from the defaults all the way to the minimum floor, you
must step down across multiple admin transactions because of the `10x` per-step
limit.

- Default `100000`-based fee units:
  `100000 -> 10000 -> 1000 -> 100 -> 10 -> 1`
- Default `upload-byte-fee-unit`:
  `2000 -> 200 -> 20 -> 2 -> 1`

## Launch hold points

Do not unpause yet if any of these are unresolved:

- the deployed contract is not under the same principal family as the live
  legacy cores
- `set-next-id` has not been decided and you still need legacy continuity
- your public fee quotes are not the fees you intend to charge
- `v1.1.0` support is still ambiguous in your launch messaging
- migration has not been smoke-tested on at least one real source line
