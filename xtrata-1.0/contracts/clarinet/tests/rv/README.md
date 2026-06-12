# Rendezvous (RV) property fuzzing — xtrata-collection-registry

`@stacks/rendezvous` harness that property-fuzzes the registry's pure
admin/fee/discount state surface on simnet (`@stacks/clarinet-sdk` 3.16, which
supports the contract's Clarity-4 features).

The escrow/swap/inscribe **integration** paths need real pepe ownership + the
live xtrata mint, which simnet doesn't have — those are covered exhaustively by
the stxer mainnet-fork sims (70/70, see `contracts/fakfun-idea/SIMULATIONS.md`).
RV complements that by fuzzing the parts that move on pure local state.

## Run

```bash
cd contracts/clarinet
bash tests/rv/build.sh                      # -> tests/rv/.build/...-fuzz.clar
# register the build in Clarinet.toml (clarity_version = 4), then:
npx rv . xtrata-collection-registry-fuzz invariant --runs=200
```

The build rewrites the mainnet `MASTER`/`SOURCE` constants to local simnet
aliases and defaults `free-threshold` to 0 (so `fee-for` always exercises the
fee/discount regime). `@stacks/clarinet-sdk` + `rv` resolve via a `node_modules`
symlink (same as `simulations/`).

## Invariants

- **`invariant-no-discount-surcharge`** — for every funded principal, the
  effective fee (`fee-for`) never exceeds the standard `inscribe-fee`.
- **`invariant-no-inscriptions-without-pepes`** — the ownership gate keeps
  `inscribed-count` at 0 (simnet bitcoin-pepe has no mints).

## Result + the bug it found

RV motivated checking the surcharge property and surfaced a real edge:
`set-discount` enforces `discount < inscribe-fee` at write time, but `set-fee`
could later drop the fee **below** a pinned discount — turning a "discount" into
a **surcharge** (a discounted address paying more than standard).

Deterministic repro (pre-fix): `set-discount(w, 2 STX)` then `set-fee(1 STX)` →
`fee-for(w) = 2 STX > 1 STX`.

**Fix:** `fee-for` now clamps a discount to the standard fee
(`(if (< d standard) d standard)`), so a discount can never become a surcharge.

Post-fix: the repro returns `1 STX`, and RV holds the invariant by construction:

```
invariant-no-discount-surcharge       PASSED  (200 runs, 97 checks, 0 failures)
invariant-no-inscriptions-without-pepes PASSED  (200 runs, 103 checks, 0 failures)
```

(stxer full-coverage re-run after the fix: still 70/70 — no regression.)
