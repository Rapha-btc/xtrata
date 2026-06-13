# xtrata-fakfun-forever-v2 — design, runbook, and full path coverage

Per-collection escrow vault that binds **one Gamma NFT** (a Bitcoin Pepe) to **one
permanent on-chain Xtrata inscription**, keeping exactly one of the two liquid at a
time. This is the FINAL, canonical-gated design. Clone the contract per collection
by swapping the two source constants (`SOURCE`, `MASTER`).

- Contract: [`../contracts/fakfun-idea/xtrata-fakfun-forever-v2.clar`](../contracts/fakfun-idea/xtrata-fakfun-forever-v2.clar)
- Harness: [`verify-forever-v2.mjs`](./verify-forever-v2.mjs) — stxer mainnet-fork, self-asserting
- SOURCE collection: `SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ.bitcoin-pepe` (Gamma NFT, off-chain art)
- MASTER inscriber: `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-3` (on-chain bytes + hash verify)

---

## 1. Purpose and design

### The pair invariant
For every bound token the registry custodies **exactly one** side of the pair. The
pepe and its on-chain twin can never both be liquid at once, so the canonical
identity lives in exactly one place at a time. A `Bindings` entry tracks which side
is escrowed via `xtrata-escrowed`:

- `xtrata-escrowed = true`  → registry holds the Xtrata twin, holder holds the pepe.
- `xtrata-escrowed = false` → registry holds the pepe, holder holds the Xtrata twin.

### Canonical-hash gate (theft-proof inscribe)
`inscribe` will only mint if `expected-hash` equals the token's seeded
`CanonicalHash`. The hashes are the verified rolling-sha256 of each pepe's real art
(all 2089 rows from the verified `pepe_xtrata_inputs` table). They are seeded by the
owner, then **frozen** by `finalize-canonical`. Once frozen the map can never change,
so `inscribe` can only ever accept the real art — non-canonical bytes become
impossible, raw call or not.

### Permissionless inscribe — why it is theft-proof
`inscribe` is intentionally permissionless: **anyone** may inscribe **any existing**
token's canonical twin (only a token-EXISTS check gates it; a missing token reverts
`u200`). This is safe because:

1. The canonical-hash gate guarantees the minted bytes are always the correct art,
   no matter who calls.
2. The freshly minted twin is **escrowed into the registry on mint** — the inscriber
   does not keep it.
3. Only the pepe's real owner can ever take the twin out, because **every swap
   requires depositing the pepe** (`swap-pepe-for-xtrata` transfers the pepe from
   `tx-sender` first; a non-owner has no pepe to deposit and the transfer reverts).

So a non-owner who inscribes simply **gifts** a canonical twin into escrow for the
real owner — they can never steal it. The harness proves this directly: sponsor `B`
inscribes `#500` (owned by `A`), `B` then fails to swap, and `A` is the only one who
can swap it out.

### One twin per token, v1-agnostic
A token can be inscribed once in this registry (`u201` on a second attempt). The
contract knows nothing about v1; it deliberately does NOT check any v1 binding, so a
malicious v1 inscription can never block the canonical v2 twin. The off-chain layer
unions legacy v1 tokens with v2 for "is it forever?" display.

### Escrow swaps
`release-xtrata-to` / `release-pepe-to` move the escrowed asset out of the vault as
the contract, each wrapped in an `as-contract?` with a `with-nft` in-contract post
condition that permits moving ONLY that one token id of that one collection — so a
bug can never drain other escrowed NFTs. `swap-pepe-for-xtrata` and
`swap-xtrata-for-pepe` flip custody; calling the wrong direction reverts `u203`, and
a token with no binding reverts `u202`.

### Fees
The holder always pays the master's ~0.1 STX inscription fee directly (mint runs as
the holder). On top of that the registry charges its own fee, **split 50/50** to two
payouts:

- the first `free-threshold` inscriptions are **free** (default `u87`, launch promo),
- then `inscribe-fee` (default 3 STX),
- unless the payer has a pinned per-address discount (`Discounts`), which is **clamped
  to the standard fee** so it can never become a surcharge if the owner later lowers
  `inscribe-fee` below it.

`inscribed-count` only counts successful inscriptions, so the free tier is exact. All
knobs (`set-fee`, `set-free-threshold`, `set-discount` / `remove-discount`,
`set-payouts`) are owner-settable. A discount must be a real discount
(`< inscribe-fee`) or `set-discount` reverts `u205`.

### Error codes
| Code | Constant | Meaning |
|------|----------|---------|
| `u200` | `ERR-NO-SUCH-TOKEN` | token-id is not a real collection token (`get-owner = none`). (Renamed from `ERR-NOT-OWNER`; value unchanged.) |
| `u201` | `ERR-ALREADY-INSCRIBED` | this token already has a binding |
| `u202` | `ERR-NOT-INSCRIBED` | no binding for this token |
| `u203` | `ERR-WRONG-STATE` | the side you want is not the side escrowed |
| `u204` | `ERR-NOT-AUTHORIZED` | caller is not the contract owner |
| `u205` | `ERR-BAD-DISCOUNT` | discount fee must be `< inscribe-fee` |
| `u206` | `ERR-NOT-CANONICAL` | `expected-hash` != this token's seeded canonical hash |
| `u207` | `ERR-FINALIZED` | canonical set is frozen; seeding closed |

### Pause note
`inscribe` calls the master's `mint-single-tx` with the holder as `tx-sender`, so from
the master's view `contract-caller` is THIS registry. If the master is paused, this
registry must be on its AllowedCallers list.

---

## 2. Deploy / seed / finalize runbook

1. **Deploy** the contract (Clarity 5). Deploy just publishes — no boot call, no v1
   seed. At genesis: `get-owner = deployer`, `free-threshold = u87`,
   `inscribe-fee = u3000000`, payouts = `{a: deployer, b: SP10W2EEM...J69TM7}`,
   `is-finalized = false`, `inscribed-count = u0`.
2. **Seed canonical hashes** with `seed-canonical` in batches of <=200
   `{ id, hash }` entries (owner only; reverts `u207` once finalized). 2089 rows fit
   in 11 batches (10 x 200 + 1 x 89). Seeding is overwrite-safe until frozen, so a
   batch can be re-run to correct it. Per-batch cost (200 entries):
   `runtime ~1.35M, read_count 205, write_count 200, write_len 11200` — comfortably
   within a single tx.
3. **Verify** a few hashes with `get-canonical-hash` (e.g. `#1`, `#500`, `#2089`).
4. **`finalize-canonical`** (owner only) — one-way freeze. After this `CanonicalHash`
   is immutable forever; not even the owner can change the canonical art, so the gate
   is fully trustless. Seeding reverts `u207` from here on, **but inscribe keeps
   working** (finalize freezes SEEDING, not inscribe).
5. **Optional fee setup** before/after finalize: `set-free-threshold`,
   `set-fee`, `set-discount` (pin big holders), `set-payouts`.
6. Holders / sponsors / the project then call `inscribe`; owners `swap-*` at will.

### Running the harness
```
cd contracts/clarinet/simulations
node verify-forever-v2.mjs
```
Requires `/tmp/pepe-hashes.json` (id -> `{hash, size}` for all 2089) and node_modules
symlinked from a repo that has `stxer` + `@stacks/transactions` (see the dir's
`node_modules` symlink). The harness deploys to a pinned mainnet tip via the signer
box Stacks API (`http://77.42.3.101/stacks-api`, dodges Hiro 429), runs the full plan,
zips results against a parallel `plan[]`, decodes SIP-005 hex, asserts every
expected value, asserts fee-split balance deltas, prints a coverage table, and exits
non-zero on any failure.

---

## 3. Full path-coverage table

**Latest run: 115 passed, 0 failed, 0 soft.**
Sim URL: <https://stxer.xyz/simulations/mainnet/f1f9a31eaeea4dc87560faa3cba0ce11>

Scenario tokens (real mainnet owners, verified via box `get-owner`):

| Token | Owner | Role |
|-------|-------|------|
| `#500` | `SP3MYTHK18PMGCDN6EG9Y4XN13FA87NMZRDZST0XN` (A) | free-tier permissionless inscribe (sponsor `B` inscribes, `A` swaps) |
| `#161` | `SP1DPNP3RRD6JG1557SP6JMX68W5BV6R2Z74BQEXV` (B) | paid-tier inscribe + both-way swaps, fee split asserted |
| `#300` | `SP3AFSKPE2BQ84WXEZ03PQ2E18B02A8ZZWK6190KW` (O3) | discount pin/clamp + paid inscribe to NEW payouts |
| `#1000` | A | inscribe AFTER finalize (proves finalize != inscribe-freeze) |
| `#7` | exists | deliberately **unseeded** → `u206` even after finalize |
| `#9999` | none | nonexistent → `u200` |

### Functions x branches

| Function | Branch / error | How it's exercised | Result |
|----------|----------------|--------------------|--------|
| **`inscribe`** (public) | nonexistent token → `u200` | inscribe `#9999` (get-owner none) | PASS |
| | exists but unseeded → `u206` | inscribe `#7` (never seeded) | PASS |
| | tampered hash → `u206` | inscribe `#500` with one byte flipped | PASS |
| | free-tier success | sponsor `B` inscribes `#500` (count 0 < 87) | PASS |
| | already inscribed → `u201` | second inscribe of `#500` | PASS |
| | paid-tier success | `B` inscribes `#161` after threshold dropped to 1 | PASS |
| | paid-tier success (new payouts) | `O3` inscribes `#300` after `set-payouts` | PASS |
| | works AFTER finalize | inscribe `#1000` post-`finalize-canonical` | PASS |
| | unseeded still `u206` post-finalize | inscribe `#7` after finalize | PASS |
| **`fee-for`** (read-only) | count < threshold → `u0` | `fee-for B/O3` at count 0/1 | PASS |
| | no discount → standard | `fee-for B` in paid tier | PASS |
| | discount < standard → discount | `fee-for O3` pinned 1 STX | PASS |
| | discount >= standard → clamp | set-fee 0.5 STX, `fee-for O3` (1 STX) → 0.5 STX | PASS |
| **`charge-fee`** (private) | fee > 0 → 50/50 split | balance deltas on paid `#161` (+1.5/+1.5) and `#300` (new payouts +1.5/+1.5; old payout 0) | PASS |
| | fee == 0 → no-op | every free-tier inscribe (no payout movement) | PASS (implicit) |
| **`release-xtrata-to`** (private) | release twin out | every `swap-pepe-for-xtrata:ok` (#500, #161) | PASS |
| **`release-pepe-to`** (private) | release pepe out | every `swap-xtrata-for-pepe:ok` (#500, #161) | PASS |
| **`swap-pepe-for-xtrata`** (public) | no binding → `u202` | swap `#500` before inscribe | PASS |
| | wrong state (not escrowed) → `u203` | swap `#500` while twin not escrowed | PASS |
| | non-owner cannot (pepe transfer reverts) | `B` swaps `#500` it doesn't own → `(err u1)` | PASS |
| | happy path + custody flip | `A` swaps `#500`; `B` swaps `#161` | PASS |
| **`swap-xtrata-for-pepe`** (public) | no binding → `u202` | swap `#500` before inscribe | PASS |
| | wrong state (twin escrowed) → `u203` | swap `#500` while twin escrowed | PASS |
| | happy path + custody flip | `A` flips `#500` back; `B` flips `#161` back | PASS |
| **`assert-owner`** (private) | non-owner → `u204` | every admin fn below from `STRANGER` | PASS |
| **`seed-canonical`** (public) | happy (batches) | 11 batches seed 2088 of 2089 | PASS |
| | non-owner → `u204` | `STRANGER` seeds | PASS |
| | finalized → `u207` | seed after `finalize-canonical` | PASS |
| **`finalize-canonical`** (public) | non-owner → `u204` | `STRANGER` finalizes | PASS |
| | happy | owner finalizes; `is-finalized` true | PASS |
| **`set-fee`** (public) | non-owner → `u204` | `STRANGER` set-fee | PASS |
| | happy | set 0.5 / restore 3 / new-owner sets 2 STX | PASS |
| **`set-free-threshold`** (public) | non-owner → `u204` | `STRANGER` | PASS |
| | happy | lower to 1 to enter paid tier | PASS |
| **`set-discount`** (public) | non-owner → `u204` | `STRANGER` | PASS |
| | fee == inscribe-fee → `u205` | discount 3 STX vs fee 3 STX | PASS |
| | fee > inscribe-fee → `u205` | discount 3 STX + 1 | PASS |
| | happy | pin O3 to 1 STX | PASS |
| **`remove-discount`** (public) | non-owner → `u204` | `STRANGER` | PASS |
| | happy | remove O3; `fee-for` back to standard | PASS |
| **`set-payouts`** (public) | non-owner → `u204` | `STRANGER` | PASS |
| | happy + redirect proven | set ALT_A/ALT_B; paid `#300` deltas land on them | PASS |
| **`transfer-ownership`** (public) | non-owner → `u204` | `STRANGER` | PASS |
| | happy | move owner to A, then back to deployer | PASS |
| | OLD owner locked out → `u204` | old owner `set-fee` after transfer | PASS |
| **`get-binding`** (read-only) | none / present | pre-inscribe none; post-inscribe tuple | PASS |
| **`is-inscribed`** (read-only) | false / true | before/after inscribe (#500, #1000) | PASS |
| **`get-fee`** (read-only) | reflects setter | 3 → 0.5 → 3 → 2 STX | PASS |
| **`get-free-threshold`** (read-only) | reflects setter | 87 → 1 | PASS |
| **`get-discount`** (read-only) | none / some | before pin, after pin, after remove | PASS |
| **`get-payouts`** (read-only) | default / after set | `{deployer, PAYOUT_B}` then `{ALT_A, ALT_B}` | PASS |
| **`get-inscribed-count`** (read-only) | monotonic on success only | 0 → 1 → 2 → 3 → 4 (reverts don't bump) | PASS |
| **`get-owner`** (read-only) | reflects transfer | deployer → A → deployer | PASS |
| **`get-canonical-hash`** (read-only) | none / seeded | pre-seed none; #500/#2089 seeded; #7 none | PASS |
| **`is-finalized`** (read-only) | false / true | before/after finalize | PASS |
| **deploy** | publishes clean | contract deploy | PASS |

Every public function, every private function, and every documented error branch is
asserted. Fee correctness is proven by on-chain STX balance deltas (not just return
values): paid `#161` moves +1.5 STX to each of the two default payouts, and after
`set-payouts` the paid `#300` fee lands on the new payouts while the old payout-a
receives nothing.

---

## 4. RV fuzzing

Property-based fuzzing (Rendezvous) of the contract invariants. Full findings:
`RV-RESULTS-forever-v2.md`. Test sources in `../tests/rv/xtrata-fakfun-forever-v2.*`.

**Result: all 7 invariants PASS, 0 counterexamples** across >5000 invariant
iterations and >3500 property iterations over seeds 1, 7, 42, 99.

| # | Invariant | Verdict |
|---|-----------|---------|
| 1 | Canonical integrity — every binding's `content-hash` == `CanonicalHash[id]` | PASS |
| 2 | Count consistency — `inscribed-count` == number of bindings, monotonic | PASS |
| 3 | Freeze monotonicity — `canonical-finalized` never true→false; frozen hashes never change | PASS |
| 4 | One-time — a bound token can never be re-bound/mutated | PASS |
| 5 | Escrow exclusivity — exactly one side custodied per binding, never both liquid | PASS |
| 6 | Owner-only — only `contract-owner` mutates fees/threshold/discount/payouts/owner/seed/finalize; `fee-for` <= `inscribe-fee`; stored discount < `inscribe-fee` | PASS |
| 7 | Gate liveness — `inscribe` only succeeds for an existing token whose `expected-hash` == canonical | PASS |

Run commands:
```
node node_modules/@stacks/rendezvous/dist/app.js . xtrata-fakfun-forever-v2-fuzz invariant --runs=2000 --seed=1
node node_modules/@stacks/rendezvous/dist/app.js . xtrata-fakfun-forever-v2-fuzz test       --runs=2000 --seed=1
```

Notes:
- The v1.0 "discount-becomes-a-surcharge" edge is **fixed** in v2 by the `fee-for` clamp; RV's `test-discount-never-surcharges` + `invariant-fee-never-exceeds-standard` hammer that path and hold by construction.
- Positive custody paths (`inscribe`/`swap-*` with a real master mint) can't run on simnet (master paused, no pepe mints, chunks never hash to canonical), so RV proves them **negatively** — the gate refuses every illegitimate inscribe (~1100 ignored attempts/run, `inscribed-count` stays 0). Their positive happy-path is covered by the stxer mainnet-fork sims above.
