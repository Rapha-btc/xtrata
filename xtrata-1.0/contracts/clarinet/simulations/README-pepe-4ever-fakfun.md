# pepe-4ever-fakfun — validation + deploy runbook

Bitcoin Pepe "forever" registry. Binds one Bitcoin Pepe
(`SP16SRR…bitcoin-pepe`) to one permanent on-chain Xtrata twin via the master
inscriber (`SP3JNSEX…xtrata-v3-2-3`), and custodies exactly one side of the pair
at a time (pepe XOR twin).

Deploys from account 0 → `SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.pepe-4ever-fakfun`.

## What's different vs `pepe-forever-fakfun`

1. **`as-contract?` escrow mint.** `inscribe` mints the twin **as the contract**
   (`as-contract? ((with-stx master-fee)) (mint-single-tx …))`, so the twin lands
   directly in escrow. The holder never holds or sends the twin NFT → **no NFT
   post-condition** (the racy predicted-twin-id PC is gone).
2. **Live-read master fee.** `master-fee` is read live from the master
   (`(get total-fee (contract-call? MASTER quote-single-tx-fee total-size (len chunks)))`)
   — immune to the master owner changing `single-tx-fee-unit` /
   `upload-chunk-fee-unit`. The holder funds it into the contract; the
   `with-stx master-fee` allowance caps the contract's spend and walls off the
   other escrowed twins.
3. **`free-threshold u0`/`u87`** (first N inscriptions free) + per-address
   `set-discount(addr, u0)` for a fee-free admin backfill.

Otherwise identical to `forever-v2`: canonical-hash gate (`u206`), one-time per
token (`u201`), seed-canonical + one-way `finalize` freeze (`u207`),
permissionless inscribe (owner can't be forced; only owner can swap),
escrow swaps, fee/discount logic, admin setters.

## stxer mainnet-fork validation — 96/96 PASS

**Sim:** https://stxer.xyz/simulations/mainnet/3e13b0d6db154abf51be1bc7566456a8
**Harness:** `verify-pepe-4ever-fakfun.mjs`
Contract: pure ASCII, `clarinet check` clean, validated on the exact deployed
file (`free-threshold u87`, live-read fee).

| Area | Result |
|------|--------|
| Deploy (Clarity 5) | PASS |
| `as-contract?` escrow mint — twin owned by registry, pepe doesn't move, binding written | PASS |
| `with-stx` cap = only STX leaves the contract; escrowed twins untouchable (no `with-nft` needed) | PASS |
| **Live-read fee resolves** (102000 for a 1-chunk pepe, across the full size range) | PASS |
| **Jim raises the fee → live-read adapts** | PASS |
| FE post-condition recipe (deny, 2 STX PCs, 0 NFT PCs) | PASS |
| Swaps round-trip both ways; non-owner `swap-pepe-for-xtrata` blocked (`u1`); wrong-state `u203`; not-inscribed `u202` | PASS |
| Fee funding exact + atomic, contract net 0 (no dust) | PASS |
| `free-threshold u87` free tier; `set-discount u0` path | PASS |
| Regressions: tamper `u206`, double `u201`, nonexistent `u200`, post-finalize seed `u207`, admin-only `u204`, bad-discount `u205` | PASS |
| Cross-principal master dedup (re-inscribe a hash the old contract minted as a different principal) | PASS |

### Swap ownership safety (code-verified; not in the stxer harness)
`swap-xtrata-for-pepe` in the *right* state (twin liquid) by a caller who does
**not** own the twin reverts with **`(err u100)`** — the master's `transfer`
asserts `(is-eq (some sender) (nft-get-owner? xtrata-inscription id))`
(`ERR-NOT-AUTHORIZED = u100`) *before* `nft-transfer?` (so it's u100, not u1).
`try!` propagates it, so **the pepe is never released** — you can't pull the
pepe without depositing a twin you actually own. (The harness covers non-owner
`swap-pepe-for-xtrata` and wrong-state `u203`, but not this exact path.)

### The Jim-fee-change test (the headline)
1. Baseline: `quote-single-tx-fee.total-fee == 102000`; inscribe succeeds.
2. As the master admin (`SP3JNS…`), `set-single-tx-fee-unit(u150000)` →
   `quote-single-tx-fee.total-fee == 152000`.
3. Inscribe a different pepe: the contract's live-read now resolves to **152000**,
   funds 152000, the `with-stx 152000` cap passes, the master charges 152000, and
   inscribe **succeeds**. Exact deltas: inscriber −155000 (152000 fee + 3000 gas),
   master-royalty +152000, **contract net 0**, payouts unchanged (free tier).
4. A **hardcoded** `100000 + n*2000` contract would have under-funded / capped at
   102000 and reverted — the live-read is what makes it survive.

**Honest engine caveat:** stxer's fork executor does **not** enforce a violated
`willSendLte` *upper bound* (it committed a 152000 send under a
`willSendLte(102000)` deny PC without aborting). So "a stale PC aborts" was proven
**analytically** from the captured delta (152000 > 102000 → mainnet abort), not
reproduced on-fork. Real mainnet consensus enforces it.

## FE post-condition recipe for `inscribe`

**Deny mode, exactly TWO STX post-conditions, ZERO NFT post-conditions:**

```js
postConditionMode: PostConditionMode.Deny,
postConditions: [
  Pc.principal(holder).willSendLte(registryFee + masterFee).ustx(),            // holder's outflow
  Pc.principal(`${DEPLOYER}.pepe-4ever-fakfun`).willSendLte(masterFee).ustx(),  // contract's master payment
]
```

- `masterFee` = **read live** from `quote-single-tx-fee(total-size, nChunks).total-fee`
  (the FE must quote it, same as the contract — never hardcode).
- `registryFee` = `fee-for(holder)` (0 in the free tier or with a 0-discount, else `inscribe-fee`).
- Two PCs because the master fee makes two hops by two principals (holder→contract, contract→master); deny mode needs a PC per sender. Both render as plain "Total spend" in the wallet — **no asset-transfer warning**.

## RV property-fuzzing

Full findings: `RV-RESULTS-pepe-4ever-fakfun.md`. Tests: `../tests/rv/pepe-4ever-fakfun.*`.

**Result: 7 invariants + 1 variant-specific no-leak invariant, 0 counterexamples**
across 10,000 invariant iters + 10,000 test iters over 5 seeds {1,7,42,1337,2089}.

| # | Invariant | Verdict |
|---|-----------|---------|
| 1 | Canonical integrity (binding.content-hash == CanonicalHash[id]) | PASS |
| 2 | Count consistency (inscribed-count == #bindings, monotonic) | PASS |
| 3 | Freeze monotonicity (canonical-finalized never true→false; frozen hashes immutable) | PASS |
| 4 | One-time (a bound token never re-binds/mutates) | PASS |
| 5 | Escrow exclusivity (exactly one side custodied per binding) | PASS |
| 6 | Owner-only (fees/threshold/discount/payouts/owner/seed/finalize); fee-for ≤ inscribe-fee; discount < inscribe-fee | PASS |
| 7 | Gate liveness (inscribe only for an existing token w/ canonical hash) | PASS |
| 8 | **No stranded STX** — vault STX balance always u0 (funds-in rolls back if mint reverts) | PASS |

Note (same as forever-v2): the source `bitcoin-pepe` has `sale-enabled = false` on
simnet, so `inscribe`'s positive path can't fire — the gate is proven in its
strongest *negative* form (every illegitimate inscribe rejected, count pinned at
0), and invariant 8 holds because Clarity atomically reverts the funding
`stx-transfer?` whenever the master mint reverts.

## Deploy runbook

1. **Deploy** via the backend bot: `POST /api/bot/deploy-contract` with
   `{ "contractName": "pepe-4ever-fakfun" }` (Clarity 5, account 0, fee 0.2 STX).
2. **⚠️ Allowlist on the master.** `xtrata-v3-2-3` is paused and gates on
   `contract-caller`. Under `as-contract?` the master sees
   `contract-caller = pepe-4ever-fakfun` (the NEW CID). The master owner
   (`SP3JNS…`) MUST `set-allowed-caller('SPV9K21….pepe-4ever-fakfun true)`
   **before any inscribe**, else every mint reverts.
3. **Seed** all 2,089 canonical hashes via `seed-canonical` (≤200/batch, ~11 txs)
   from the verified `pepe_xtrata_inputs` table; verify on-chain `get-canonical-hash`.
4. **Finalize** (`finalize-canonical`) — one-way freeze of the canonical set.
5. **Backfill** the legacy forever pepes by inscribing them here (admin pays
   only the master fee if pinned to a 0-STX discount, or while in the free tier).
6. Point the FE inscribe at `pepe-4ever-fakfun` and use the 2-PC deny recipe above.
