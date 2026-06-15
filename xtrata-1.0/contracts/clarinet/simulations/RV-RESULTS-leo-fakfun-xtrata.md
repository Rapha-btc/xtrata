# leo-fakfun-xtrata — stxer mainnet-fork validation (inscribe THROUGH the core)

leo-cats "forever" registry. Binds one leo-cats NFT
(`SP2N959SER36FZ5QT1CX9BR63W3E8X35WQCMBYYWC.leo-cats`) to one permanent on-chain
Xtrata twin via the master inscriber (`SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-3`),
custodying exactly one side of the pair at a time (leo XOR twin).

The headline of this run: **inscribe AND both swaps are ROUTED THROUGH the
`fakfun-xtrata-core` wrapper** (`core.inscribe(leoCID, …)`,
`core.swap-nft-for-xtrata(leoCID, id)`, `core.swap-xtrata-for-nft(leoCID, id)`).
The core's single merged `registry-trait` carries inscribe + both swaps +
`get-inscribed-count`, and emits one unified, registry-tagged print per action.
We prove the core is transparent to fees, ownership, escrow, the master
allowlist, and the post-condition recipe.

## Result: 102 / 102 PASS

- **Harness:** `simulations/verify-leo-fakfun-xtrata.mjs`
- **stxer simulation (latest clean run):** https://stxer.xyz/simulations/mainnet/2a543657804575a30cde1fd83fc29fc5
- Earlier identical-result runs: `.../5c1d272da4a34cd0132a31dba446583c`, `.../fc56ef91e2248475bff718a43af06d9e`
- Pinned mainnet tip ≈ height 8,293,4xx (re-pins each run).
- Deploys both contracts byte-identical from
  `contracts/fakfun-idea/fakfun-xtrata-core.clar` and
  `contracts/fakfun-idea/leo-fakfun-xtrata.clar` (Clarity 5), as `DEPLOYER`
  (`SPV9K21…`): core first, then the registry.

## Mainnet scenario data (verified at the pinned tip)

leo-cats `transfer` asserts the token is **NOT listed** on its internal
marketplace (`ERR-LISTING u106`). Every swap/scenario token below was verified
**unlisted** (`get-listing-in-ustx == none`) AND owner-confirmed at tip:

| role | token-id | owner | balance | use |
|------|----------|-------|---------|-----|
| A_OWNER | #200 | `SPYHP3JCPMSPXXRAXW3GKHPZ215YX6N87HXGTD0V` | ~287 STX | primary swap owner; paid-tier (#500) + post-finalize (#1000) + Jim (#777) inscriber |
| B_OWNER | #100 | `SP1710ZN87BPVKPJ54VX9ZPV0D8RDG7VC3KFV078N` | ~11.7 STX | second swap owner; free-tier inscriber + PC-probe inscriber on #200 |
| O3_OWNER | #10 | `SP2D8RP8J0EYMZPFTT0SS0YE4HR0JV6CBBAB9508F` | ~5.4 STX | discount admin path + free-tier inscribe |

`A_OWNER` also owns the unlisted **#500** (paid-tier) and **#1000** (post-finalize),
**#777** (Jim) — these are inscribe-only scenarios where ownership is irrelevant
(inscribe needs only that the leo token *exists*, not that the inscriber owns it).

### Synthetic content (no leo image backend)
The registry/master are content-agnostic: the registry only checks the
**canonical hash it was seeded with**, and the master only checks the chunks
hash to `expected-hash`. The master's single-chunk rule is
`final-hash = sha256(0x00*32 || chunk)`. So per token-id we build a tiny
deterministic 1-chunk payload (`"leo-fakfun-xtrata twin #<id> forever"`),
compute `sha256(0x00*32 || data)`, and seed exactly that as the canonical hash.
`valid-total-shape?` for 1 chunk requires `0 < total-size <= 16384` and
`len(data) == total-size` — satisfied.

## Scenario pass/fail summary

| Scenario | Result |
|----------|--------|
| Deploy core + leo registry (Clarity 5) | PASS |
| Readers: owner / fee=4 STX / free-threshold=87 / payouts / finalized=false / count=0 | PASS |
| **Master allowlist target = the LEO CID** (`is-allowed-caller(leoCID)==(ok true)`); **core NOT allowlisted** (`is-allowed-caller(core)==(ok false)`) | PASS |
| seed-canonical (synthetic hashes), STRANGER→u204, get-canonical-hash, #7 unseeded | PASS |
| **inscribe THROUGH the core succeeds**, twin escrowed in the registry, leo doesn't move, binding written w/ correct inscriber (tx-sender preserved through the core) | PASS |
| inscribe reverts THROUGH core: nonexistent→u200, unseeded→u206, tampered→u206, double→u201, post-finalize-unseeded→u206 | PASS |
| **Minimal deny-mode PC set holds THROUGH the core** (2 STX caps: inscriber + LEO-contract; **0 NFT PCs, 0 core PC**) | PASS |
| Swaps THROUGH the core (`core.swap-nft-for-xtrata` / `core.swap-xtrata-for-nft`) round-trip both ways on #200 and #100; non-owner `swap-nft-for-xtrata`→`u1`; wrong-state→u203; not-inscribed→u202; revert codes surface unchanged through the wrapper | PASS |
| FREE-tier (free-threshold 87): registry fee 0, only the master fee flows; payouts unchanged; contract net 0 (no dust) | PASS |
| **PAID-tier: lower free-threshold→0, 4 STX registry fee splits 2 STX→payout-a + 2 STX→payout-b**, master fee funded exactly, contract net 0 | PASS |
| Admin-only: set-fee STRANGER→u204, finalize STRANGER→u204, finalize owner ok, seed post-finalize→u207; set-discount ok / u205 / remove | PASS |
| Post-finalize inscribe of a seeded id (#1000) still succeeds through the core | PASS |
| **Jim raises the master fee 102000→152000; the registry LIVE-READ adapts** (funds+caps 152000, succeeds; royalty +152000; contract net 0) — even through the core | PASS |

## The load-bearing facts (verified on-fork)

### 1. Inscribe through the core is transparent
`tx-sender` is preserved across the core's `(contract-call? registry inscribe …)`,
so:
- the binding's `inscriber` is the **real user** (B for #200), not the core;
- the **master fee STX still originates from the inscriber** (B/O3/A), funds the
  *registry* contract, and the registry pays the master royalty under `as-contract?`;
- the twin is minted **directly into the registry** (escrow), the inscriber never
  holds/sends an NFT.

### 2. Master allowlist = the LEO CID, never the core
Inside `leo.inscribe` the master mint runs under `as-contract?`, so the (paused)
master sees `contract-caller = SPV9K21….leo-fakfun-xtrata`. We allowlist exactly
that, and assert `is-allowed-caller(leoCID) == (ok true)`. The core is never the
master's caller — confirmed `is-allowed-caller(core) == (ok false)`, and every
inscribe still succeeds. **Do not allowlist the core.**

### 3. Minimal deny-mode PC set for inscribe — UNCHANGED by the core
Deny mode, **exactly TWO STX post-conditions, ZERO NFT post-conditions, ZERO PC
on the core**:

```js
postConditionMode: PostConditionMode.Deny,
postConditions: [
  Pc.principal(inscriber).willSendLte(registryFee + masterFee).ustx(),                  // inscriber outflow
  Pc.principal(`${DEPLOYER}.leo-fakfun-xtrata`).willSendLte(masterFee).ustx(),           // registry's master payment
]
// target contract of the tx = ...fakfun-xtrata-core ; first arg = the leo CID trait
```

- `masterFee` = **read live** from `quote-single-tx-fee(total-size, nChunks).total-fee`
  (102000 for a 1-chunk file at the current master fee unit).
- `registryFee` = `fee-for(inscriber)` (0 in the free tier; 4 STX once
  free-threshold is exhausted/lowered).
- The CORE moves no funds → it needs no post-condition. Both PCs render as plain
  "Total spend" — no asset-transfer warning.

PROBE results (same caveat as the pepe harness): under the stxer fork executor a
single inscriber-only deny PC does not *abort* the under-covered `as-contract`
spend, so 8.1 returns an `(ok uXID)` but the binding only lands once the
LEO-contract cap is also present (8.2 — `is-inscribed == (ok true)`). On real
mainnet consensus the LEO-contract cap is required; the 2-PC recipe is the FE
recipe.

### 4. 4 STX registry fee split (paid tier)
With `free-threshold` lowered to `u0`, `fee-for == u4000000`. Inscribing #500 via
the core (PC: inscriber `willSendLte(4 STX + masterFee)`, registry
`willSendLte(masterFee)`):

```
payout-a (SPV9K21…) delta = +2_000_000   (half of 4 STX)
payout-b (SP10W2…)  delta = +2_000_000   (4 STX − half)
master-royalty      delta = +102_000     (master fee)
registry contract   delta = 0            (no dust; fee passes through, master fee funded exactly)
paid inscriber out  = 4_105_000          (4 STX + 102000 master + 3000 gas)
```

### 5. Live-read survives a master fee change (Jim)
`set-single-tx-fee-unit(u150000)` → `quote-single-tx-fee.total-fee == 152000`.
Inscribing #777 through the core: the registry's live-read resolves 152000, funds
the contract with exactly that, the `with-stx 152000` cap passes, the master
charges 152000, inscribe **succeeds**. Deltas: inscriber −155000 (152000 + 3000
gas), royalty +152000, contract net 0, payouts unchanged (free tier). A hardcoded
`100000 + n*2000` registry would have under-funded/capped at 102000 and reverted.
(stxer caveat: it doesn't enforce a *violated* `willSendLte` upper bound, so the
"a stale 102000 FE PC aborts on mainnet" fact is proven analytically from the
152000 delta, not reproduced on-fork — identical to the pepe harness.)

## Bugs / surprises found

1. **leo-cats marketplace listing gate (`ERR-LISTING u106`).** leo-cats `transfer`
   reverts if the token is currently listed on its internal market. The first
   "obvious" candidate owners (#1/#2/#3) were all **listed**, which would have made
   every swap revert. The harness was built only on tokens verified
   `get-listing-in-ustx == none`. **Operational note for the real FE:** before
   offering a leo-cats holder the `swap-nft-for-xtrata` path, check the token is
   not listed on the leo-cats market, or the swap aborts.
2. **Non-owner `swap-nft-for-xtrata` reverts `(err u1)`, not a registry error.**
   When a non-owner tries to escrow a leo they don't own, the leo-cats
   `transfer`'s `(is-eq tx-sender sender)` assertion (`ERR-NOT-AUTHORIZED`) fires
   first via `try!`, surfacing `u1`-style upstream — the registry's own guards are
   never reached, and nothing moves. Safe, but the error code is the source NFT's,
   not the registry's.
3. **No real registry bug.** The core forwards cleanly; the 2-PC recipe, the
   master-allowlist-the-registry rule, the 4 STX split, and the live-read all
   behave exactly as the pepe sibling — confirming the wrapper added a unified
   event without changing any economic or security property.

## FE / deploy checklist (leo)

1. Deploy `fakfun-xtrata-core` (once, shared across collections) and
   `leo-fakfun-xtrata` (Clarity 5, account 0).
2. **Master allowlist the LEO registry CID** (`set-allowed-caller('SPV9K21….leo-fakfun-xtrata true)`
   as the master owner) — NOT the core, NOT before deploy.
3. Seed canonical hashes via `seed-canonical` (≤200/batch), verify
   `get-canonical-hash`, then `finalize-canonical`.
4. Point the FE at the core for everything: `fakfun-xtrata-core.inscribe(leoCID, …)`,
   `…swap-nft-for-xtrata(leoCID, id)`, `…swap-xtrata-for-nft(leoCID, id)` — so the
   single chainhook on the core indexes inscribe + both swaps for every registry.
5. Use the 2-PC deny recipe above (live-read the master fee; `registryFee` = 0 in
   the free tier, 4 STX after). Gate swap UI on the leo-cats token being unlisted.

## Rendezvous (RV) property fuzz (local simnet)

Complements the mainnet-fork sim by fuzzing the registry's own state surface on
simnet. Build rewrites the mainnet MASTER/SOURCE to local aliases
(`.xtrata-v3-2-3` / `.leo-cats`) and defaults `free-threshold` to 0 so the
fee/discount regime (incl. the **4 STX** surcharge clamp) is always under test.

```bash
cd contracts/clarinet
bash tests/rv/leo-fakfun-xtrata.build.sh           # -> tests/rv/.build/leo-fakfun-xtrata-fuzz.clar
./node_modules/.bin/rv . leo-fakfun-xtrata-fuzz invariant --runs=200
./node_modules/.bin/rv . leo-fakfun-xtrata-fuzz test --runs=200
```

- **invariant (200 runs): GREEN.** All 7 invariants held, 0 failures —
  canonical-integrity, count-zero-without-mints, escrow-exclusive,
  fee-never-exceeds-standard (the 4-STX "discount never becomes a surcharge"
  clamp), free-tier-is-free, no-binding-when-count-zero, no-stranded-STX. The
  fuzzer drove every entrypoint, incl. the renamed `swap-nft-for-xtrata` (×112)
  and `swap-xtrata-for-nft` (×125).
- **test (200 runs): GREEN.** All 8 transition properties passed, 0 failures —
  discount-below-fee, discount-never-surcharges, freeze-is-one-way,
  seed-then-freeze-locks, inscribe-rejects-non-canonical, no-rebind-without-canonical,
  inscribe-no-stranded-stx, inscribe-positive-path-no-leak.

Files: `tests/rv/leo-fakfun-xtrata.build.sh`, `…​.invariants.clar`, `…​.tests.clar`.
The integration paths (real ownership + live master mint) can't run on simnet —
those are the stxer sim's job above; RV covers the pure local state the sim can't
cheaply fuzz.
