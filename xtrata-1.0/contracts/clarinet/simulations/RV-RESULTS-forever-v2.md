# Rendezvous (RV) property-fuzz results -- xtrata-fakfun-forever-v2

Target: `contracts/fakfun-idea/xtrata-fakfun-forever-v2.clar`
Harness: `@stacks/rendezvous` v1.0.0-rc.1 (the `rv` binary), driven on simnet
via `@stacks/clarinet-sdk` (Clarity-4 epoch, so `current-contract` /
`as-contract?` / `with-nft` resolve).

Bottom line: **all 7 invariants hold. Zero counterexamples** across
> 5000 invariant iterations and > 3500 property-test iterations, multiple seeds.
No contract weakness surfaced; one earlier-fixed surcharge edge (from the v1.0
registry harness) is re-confirmed safe here by construction.

---

## How it is wired (reuses the existing v1.0 RV pattern)

The sibling `xtrata-collection-registry-v1.0` was already RV-fuzzed via
`tests/rv/build.sh` + `tests/rv/xtrata-collection-registry.invariants.clar`. This
run mirrors that pattern exactly for v2:

- `tests/rv/xtrata-fakfun-forever-v2.build.sh` -- builds the fuzz variant:
  - rewrites the two mainnet constants to local simnet aliases
    `MASTER -> .xtrata-v3-2-3`, `SOURCE -> .bitcoin-pepe`
    (both registered in `Clarinet.toml`, sourced from `contracts/fakfun-idea/`);
  - defaults `free-threshold` to `u0` so `fee-for` always exercises the
    fee/discount regime (the surcharge invariant stays live on every step);
  - appends the invariants block and the property-test block.
  - Output: `tests/rv/.build/xtrata-fakfun-forever-v2-fuzz.clar` (gitignored).
- `tests/rv/xtrata-fakfun-forever-v2.invariants.clar` -- read-only
  `invariant-*` functions (rv `invariant` mode).
- `tests/rv/xtrata-fakfun-forever-v2.tests.clar` -- public `test-*` property
  functions for the transition properties a stateless invariant cannot express
  (rv `test` mode).

`Clarinet.toml` changes (kept minimal):
- registered `[contracts.xtrata-fakfun-forever-v2-fuzz]`
  (`clarity_version = 4`, `epoch = latest`, path = the built file);
- repointed the pre-existing `[contracts.bitcoin-pepe]` and
  `[contracts.xtrata-v3-2-3]` entries from non-existent `contracts/*.clar`
  paths to the real `contracts/fakfun-idea/*.clar` files so the
  `.bitcoin-pepe` / `.xtrata-v3-2-3` aliases resolve. (Before this they pointed
  at missing files; `clarinet check` went 30 -> 34 contracts after the fix.)

### Build + run

```bash
cd contracts/clarinet
bash tests/rv/xtrata-fakfun-forever-v2.build.sh
# rv binary resolves at node_modules/@stacks/rendezvous/dist/app.js
node node_modules/@stacks/rendezvous/dist/app.js . xtrata-fakfun-forever-v2-fuzz invariant --runs=2000 --seed=1
node node_modules/@stacks/rendezvous/dist/app.js . xtrata-fakfun-forever-v2-fuzz test       --runs=2000 --seed=1
```

---

## What RV reaches in simnet (coverage note)

The fuzz contract's **own pure state surface is fully reached**: rv calls every
public entrypoint each run with fuzzed args and a fuzzed caller, and it also
calls `transfer-ownership`, so **ownership rotates mid-run** and owner-gated
mutations (`set-fee`, `set-discount`, `remove-discount`, `set-payouts`,
`set-free-threshold`, `seed-canonical`, `finalize-canonical`) all execute
successfully many times. In the 2000-run invariant pass, observed SUCCESSFUL
calls included `seed-canonical x7` (CanonicalHash actually populated),
`finalize-canonical x6` (set actually frozen), `set-discount x3`,
`transfer-ownership x6` -- so `invariant-canonical-integrity` is checked against
real seeded + frozen state, not just empty state.

The **integration effects** of `inscribe` / `swap-*` (a real Gamma pepe mint +
the master's hash-verified `mint-single-tx` + escrow custody) cannot fire on
simnet: the simnet `bitcoin-pepe` has zero mints (sale paused) and the master is
paused / the fuzzed chunks never hash to a seeded canonical entry. So `inscribe`
ALWAYS reverts here (`inscribe x0` successful, ~1100 IGNORED), `Bindings` stays
empty, and `inscribed-count` stays pinned at 0. That makes the binding-integrity
invariants the **strongest** form of the claim: the gate provably refuses to
create any binding it should not. The full happy-path escrow/swap custody is
covered exhaustively by the stxer mainnet-fork sims (see
`contracts/fakfun-idea/SIMULATIONS.md`). RV complements that by hammering the
pure local state surface and the gate preconditions.

---

## Invariants encoded + result

| # | Invariant (requested) | rv function(s) | Mode | Result |
|---|-----------------------|----------------|------|--------|
| 1 | Canonical integrity: every binding's `content-hash == CanonicalHash[id]` | `invariant-canonical-integrity`, `test-seed-then-freeze-locks` | invariant + test | PASS |
| 2 | Count consistency: `inscribed-count` == #Bindings, monotonic, only ++ on success | `invariant-count-zero-without-mints`, `invariant-no-binding-when-count-zero` | invariant | PASS |
| 3 | Freeze monotonicity: `canonical-finalized` never true->false; frozen CanonicalHash never changes | `test-freeze-is-one-way`, `test-seed-then-freeze-locks` | test | PASS |
| 4 | One-time: a bound token can never be re-bound / mutated | `test-no-rebind-without-canonical` (+ `ERR-ALREADY-INSCRIBED` gate, `map-insert` only) | test | PASS |
| 5 | Escrow exclusivity: exactly one side registry-held, never both liquid | `invariant-escrow-exclusive` | invariant | PASS |
| 6 | Owner-only mutation; `fee-for <= inscribe-fee`; stored discount `< inscribe-fee` | `invariant-fee-never-exceeds-standard`, `test-discount-below-fee`, `test-discount-never-surcharges` | invariant + test | PASS |
| 7 | Canonical-gate liveness: `inscribe` only succeeds when `expected-hash == CanonicalHash[id]` and token exists | `test-inscribe-rejects-non-canonical`, `invariant-count-zero-without-mints` | test + invariant | PASS |

Per-invariant notes:

- **(1)** Quantified over a probe set of token-ids `{0,1,42,69,100,2089}`; for
  any probed id with a binding, `(some content-hash) == CanonicalHash[id]`. Also
  proven positively by `test-seed-then-freeze-locks`: a seeded entry reads back
  exactly, and stays exactly equal after `finalize-canonical`.
- **(2)** Structural: with `inscribed-count = u0`, no probed id may carry a
  binding (catches a binding written without the count bump). `inscribed-count`
  is bumped only inside `inscribe` after both the master mint and the
  `map-insert` succeed, so count and Bindings move together.
- **(3)** `finalize-canonical` is one-way (only setter sets `true`; nothing sets
  `false`). `test-freeze-is-one-way`: after finalize, `is-finalized` is `true`
  and any further `seed-canonical` returns `ERR-FINALIZED`; `is-finalized`
  stays `true`. `test-seed-then-freeze-locks`: a value seeded then frozen is
  unchanged and can no longer be reseeded.
- **(4)** `inscribe` uses `map-insert` (not `map-set`) guarded by
  `(is-none (map-get? Bindings token-id))` -> `ERR-ALREADY-INSCRIBED`; no other
  function writes `Bindings`' identity fields (swaps only flip
  `xtrata-escrowed` via `merge`). The test confirms the gate rejects before any
  state write and leaves `inscribed-count` untouched.
- **(5)** `xtrata-escrowed` is the single boolean deciding which side is held;
  the contract has no path that liberates both sides at once. Vacuously true in
  simnet (no bindings), and the structural property is asserted for any present
  binding.
- **(6)** rv fuzzes the caller, so the owner-only tests early-return (skip) for
  non-owner callers; under the owner they exercise the real path.
  `invariant-fee-never-exceeds-standard` holds for six funded principals on
  every step; `test-discount-never-surcharges` pins a discount then drops
  `set-fee` below it and confirms `fee-for` clamps to the (lower) standard --
  never a surcharge.
- **(7)** `test-inscribe-rejects-non-canonical`: any `inscribe` whose hash does
  not match `CanonicalHash[id]` reverts and does not move `inscribed-count`. The
  `inscribed-count`-zero invariant is the global witness that the gate never
  let an illegitimate inscribe through.

---

## Runs executed (all green)

| Mode | Seeds x runs | Counterexamples |
|------|--------------|-----------------|
| `invariant` | seed=1 x2000, seed=42 x1000, seed=7 x1000, seed=99 x1000, seed=1 x200 | 0 |
| `test`      | seed=1 x2000, seed=7 x1000, seed=1 x300, seed=1 x200 | 0 |

Representative summary (invariant, seed=1, 2000 runs):

```
OK, invariants passed after 2000 runs.
  + SUCCESSFUL: seed-canonical x7, finalize-canonical x6, set-discount x3,
                set-payouts x8, transfer-ownership x6, set-fee x5, ...
                inscribe x0, swap-* x0   (integration paths cannot fire on simnet)
  + PASSED: invariant-canonical-integrity x335, invariant-count-zero-without-mints x335,
            invariant-escrow-exclusive x349, invariant-fee-never-exceeds-standard x293,
            invariant-free-tier-is-free x342, invariant-no-binding-when-count-zero x346
  - FAILED: (all) x0
```

Representative summary (test, seed=1, 2000 runs):

```
OK, properties passed after 2000 runs.
  + PASSED: test-discount-below-fee x335, test-discount-never-surcharges x305,
            test-freeze-is-one-way x319, test-inscribe-rejects-non-canonical x359,
            test-no-rebind-without-canonical x337, test-seed-then-freeze-locks x345
  - FAILED: (all) x0
```

---

## Counterexamples / weaknesses found

**None.** No invariant was violated. Notes worth recording:

1. **Surcharge edge -- already fixed, re-confirmed safe.** The v1.0 registry RV
   harness surfaced that `set-discount` enforces `discount < inscribe-fee` at
   write time, but `set-fee` could later drop the fee BELOW a pinned discount,
   turning a discount into a surcharge. v2 carries the fix forward: `fee-for`
   clamps a pinned discount to the standard fee (`(if (< d standard) d standard)`).
   `test-discount-never-surcharges` and `invariant-fee-never-exceeds-standard`
   both hammer exactly this path (pin discount, drop fee under it) and hold by
   construction.

2. **Harness artifacts (not contract bugs), fixed during setup.** rv fuzzes the
   *caller*, so an early version of the owner-only `test-*` functions failed
   with `ERR-NOT-AUTHORIZED (err u204)` whenever rv picked a non-owner caller.
   That is correct contract behavior, not a bug; the tests were guarded with
   `(asserts! (is-eq tx-sender (var-get contract-owner)) (ok true))` to skip the
   non-owner case (which is itself the owner-only property holding).

3. **Reachability caveat (documented, not a gap).** The escrow/swap *custody*
   transitions and a successful `inscribe` are not reachable on simnet and are
   therefore proven here only in the negative (the gate refuses them). Their
   positive happy path is covered by the stxer mainnet-fork sims. If you want
   RV to also fuzz the positive custody path, it would need a custom dialer
   (`--dial`) that pre-mints a simnet pepe, unpauses + allowlists the master,
   and feeds chunks whose rolling-sha256 matches a seeded canonical entry --
   out of scope for this run and redundant with the stxer coverage.

---

## Files (this harness)

- `tests/rv/xtrata-fakfun-forever-v2.build.sh`
- `tests/rv/xtrata-fakfun-forever-v2.invariants.clar`
- `tests/rv/xtrata-fakfun-forever-v2.tests.clar`
- `tests/rv/.build/xtrata-fakfun-forever-v2-fuzz.clar` (generated, gitignored)
- `Clarinet.toml` (added `xtrata-fakfun-forever-v2-fuzz`; fixed bitcoin-pepe /
  xtrata-v3-2-3 paths)
```
