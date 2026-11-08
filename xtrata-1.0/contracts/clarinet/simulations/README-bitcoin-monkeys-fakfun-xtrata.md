# bitcoin-monkeys-fakfun-xtrata - stxer simulations

Registry: `contracts/fakfun-idea/bitcoin-monkeys-fakfun-xtrata.clar`.
Harness: `simulations/verify-bitcoin-monkeys-fakfun-xtrata.mjs`.

It runs on a stxer mainnet fork, against the real `xtrata-v3-2-3` master, the real
`bitcoin-monkeys` NFT contract and `fakfun-xtrata-core`. It deploys the exact file
bytes as Clarity 5.

## Result

**353 of 353 passed** on contract commit `6569230`:
https://stxer.xyz/simulations/mainnet/7fe6af536aaa44cfdf3a940be6cc2736

| Checks | What changed | Simulation |
|---|---|---|
| 206/206 | `bind-staged` + `BoundTwins` | [44b0cc6e](https://stxer.xyz/simulations/mainnet/44b0cc6e5d40ce2919fa1716a29e8f77) |
| 270/270 | Owner pays 0, `pay-lump-sum` | [a6c9111e](https://stxer.xyz/simulations/mainnet/a6c9111e067fe109a62070365d9fe999) |
| 304/304 | Held half, claim, sweep, final terms | [d56213af](https://stxer.xyz/simulations/mainnet/d56213afe337ba342d6269bb895fb7c4) |
| 304/304 | `clarinet format` bytes | [62e58283](https://stxer.xyz/simulations/mainnet/62e582830298813bdf1c2ffe8e22a447) |
| 341/341 | Boundary, late claim, `set-payouts`, prints | [a6af28b9](https://stxer.xyz/simulations/mainnet/a6af28b9be1b3ed4a508c9d4a9d9c99d) |
| 353/353 | `rescue-stx` | [7fe6af53](https://stxer.xyz/simulations/mainnet/7fe6af536aaa44cfdf3a940be6cc2736) |

## Coverage

| Area | Checks |
|---|---|
| Seed and finalize | Owner only (`u204`), locked after finalize (`u207`) |
| Staged upload | Real Monkey #1, 1,411,407 bytes, 87 chunks: begin, 3 batches, seal, directly on the master |
| `bind-staged` success | Deny-mode post-condition on the twin, `get-binding`, count, `inscribed` print |
| `bind-staged` failures | `u206` unseeded, missing twin, wrong art, another token's twin; `u200` missing token; `u201` already bound; `u100` caller does not hold the twin; no state change |
| Twin reuse (`u208`) | Inscribe, swap out, bind to identical art; bind, swap out, bind to identical art. The first token can still swap back |
| Swaps | Both directions on the staged-bound token, via core and direct, with the real owner |
| `inscribe` regression | Real 26-chunk art, direct and through core |
| Registry fees | Free tier; 4 STX split 2 + 2; 0 discount; registry keeps no STX |
| Owner pays 0 | `inscribe` and `bind-staged`; `fee-for` still reads the standard fee |
| `set-lump-price` | Success, `u204`, `u210` after payment |
| `pay-lump-sum` | `u209` no price, `u210` already paid, `u1` no funds, half to `payout-a`, half held, odd price gives `payout-a` the extra micro-STX, print |
| `accept-terms-and-claim` | Success, `u204` stranger and owner, `u211` wrong terms, `u212` nothing left, late claim with no sweep, claim follows `set-payouts`, print |
| `sweep-lump` | `u213` one block before `sweep-at`, success at exactly `sweep-at`, `u204`, `u212`, print |
| `rescue-stx` | `u204`, `u212` nothing extra, takes only STX above the pot |
| Allowlist | Neither the registry nor core is allowlisted, and all flows run while unpaused |
| Pause probe | While paused, uploads and `inscribe` fail with `u109`; binding an already-minted twin still works |

## Costs

Percent of tenure limits. The limits are in the harness. Write length is the bottleneck.

| Step | Runtime | Read count | Write length | Tx bytes |
|---|---|---|---|---|
| Deploy registry | 0.01 | 0.07 | 0.10 | 12,614 |
| Staged begin | 0.00 | 0.08 | 0.00 | 253 |
| `add-chunk-batch`, 32 chunks | 0.15 | 0.27 | 3.52 | 524,661 |
| `add-chunk-batch`, 23 chunks | 0.11 | 0.21 | 2.44 | 363,159 |
| Staged seal | 0.00 | 0.16 | 0.00 | 290 |
| `bind-staged` | 0.00 | 0.19 | 0.00 | 312 |
| **87-chunk total** | **0.42** | **1.17** | **9.49** | **1,413,336** |
| `inscribe` via core, 26 chunks | 0.25 | 0.54 | 2.83 | 421,250 |

A simulation does not prove live miner fee acceptance.

## Rendezvous

12,500 runs with 0 failures on commit `4dd924a`: 5,000 invariant runs and 7,500
property runs. The master and NFT were mocks and the sweep delay was shortened.
This run predates `rescue-stx`, which has stxer coverage but has not been fuzzed.

## Known behavior

- The owner can redirect an unclaimed pot with `set-payouts`.
- `accept-terms-and-claim` records consent only. The contract cannot enforce the terms.
- `bind-staged` does not go through core, so indexers must read the registry's own print.

## How to run

The harness imports `_chunked-submit.js` from
`~/projects/jing-contracts-v3/simulations/`, so that repo must be present.

```bash
export SIM_WORKDIR=/tmp/monkeys-sim
mkdir -p "$SIM_WORKDIR/monkeys"
for i in 1 2 3; do
  curl -s -o "$SIM_WORKDIR/monkeys/$i.png" \
    "https://stxnft.mypinata.cloud/ipfs/QmYCnfeseno5cLpC75rmy6LQhsNYQCJabiuwqNUXMaA3Fo/$i.png"
done
cd xtrata-1.0/contracts/clarinet/simulations
node verify-bitcoin-monkeys-fakfun-xtrata.mjs
```
