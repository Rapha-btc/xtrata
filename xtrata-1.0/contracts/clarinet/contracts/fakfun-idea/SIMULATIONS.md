# xtrata-collection-registry-v1.0 — stxer simulation coverage

The registry uses **Clarity-4 features** (`current-contract` built-in, `as-contract?` +
`with-nft` in-contract post-conditions) that **clarinet 3.19 cannot compile or analyze**.
So validation is done with **stxer mainnet-fork simulations** — the contract is deployed
onto a fork pinned at the live chain tip and driven against the **real** mainnet
`SP3JNSEX….xtrata-v3-2-3` and `SP16SRR….bitcoin-pepe` contracts. This is a stronger test
than a local unit suite: it exercises the actual on-chain inscribe + escrow + transfer
logic, real fee flows, and the in-contract post-conditions on the real VM.

## Result

**`verify-collection-registry-full.mjs` → 70 / 70 passed.**
Latest run: https://stxer.xyz/simulations/mainnet/c863075a32034646eaed69c4c31d7c50

(An earlier focused happy-path+guards run, `verify-collection-registry.mjs`, passed 32/32:
https://stxer.xyz/simulations/mainnet/180107ea68435006814d4ef4eb8b9e41)

## How to run

```bash
cd contracts/clarinet/simulations
node verify-collection-registry-full.mjs
```

- `stxer` + `@stacks/transactions` are resolved via a symlink to jing-contracts-v3's
  `node_modules` (`simulations/node_modules` → that repo). No install needed.
- The tip-fetch is pointed at the signer box's full Stacks API
  (`SimulationBuilder.new({ stacksNodeAPI: "http://77.42.3.101/stacks-api" })`) to avoid
  Hiro's public rate limit. Swap it for any Stacks API if the box is down.
- Self-verifying: a parallel `plan[]` of expected results is zipped against
  `getSimulationResult().steps`; the script exits non-zero on any mismatch.

## Test roles (real mainnet principals on the fork)

| Role | Address | Notes |
|------|---------|-------|
| Deployer / owner / payout-a | `SPV9K21…RCJDC22` | gas-free deploy; receives the split |
| Inscriber (pepe holder) | `SP3WAAYX…G0QSY` (chadstx) | owns 416 pepes incl. #1110–1112; ~534 STX free |
| payout-b | `SP10W2EEM…J69TM7` (Jim) | hardcoded default in the contract |
| Stranger (guards) | `SP000…2Q6VF78` | zero-balance burn address |
| New payout-a / -b | `SP2C7B…R7QN2` / `SP9BP4…HVVV51` | for the set-payouts routing test |

Inscriptions use a synthetic 64-byte file (1 chunk) with the correct xtrata hash chain
(`h0 = 32 zero bytes; h = sha256(h ‖ chunk)`) — image content is irrelevant to the
registry logic, only a valid `mint-single-tx` shape is.

## Coverage matrix

Every public function, both auth paths, every reachable error code, every `charge-fee`
branch, the mint-failure revert, and all read-only getters are exercised.

### `inscribe`
| Path | Step(s) | Result |
|------|---------|--------|
| caller doesn't own the pepe | 9 | `ERR-NOT-OWNER (u200)` |
| pepe id never minted (`get-owner` → none) | 10 | `ERR-NOT-OWNER (u200)` |
| `mint-single-tx` fails (wrong hash) → whole tx reverts | 11, 12 | `(err u103)`, no binding created |
| free tier (count < threshold) → mints + escrows | 13–18 | `(ok u370)`, twin escrowed, pepe kept |
| already inscribed | 19 | `ERR-ALREADY-INSCRIBED (u201)` |
| paid: mint-fail does **not** charge the fee (atomic) | 54–56 | balances unchanged after `(err u103)` |
| paid: success + 50/50 split, odd remainder → payout-b | 57–60 | `(ok u371)`, +1500000 / +1500001 |
| paid: split routes to **new** payouts after `set-payouts` | 65–68 | `(ok u372)`, newA +1500000 / newB +1500001 |

### `swap-pepe-for-xtrata`
| Path | Step(s) | Result |
|------|---------|--------|
| no binding | 26 | `ERR-NOT-INSCRIBED (u202)` |
| wrong state (xtrata not escrowed) | 28 | `ERR-WRONG-STATE (u203)` |
| caller doesn't hold the pepe (deposit transfer fails) | 21 | bitcoin-pepe `(err u1)` |
| success: deposit pepe, release twin | 22–25 | `(ok true)`, ownership flips |

### `swap-xtrata-for-pepe`
| Path | Step(s) | Result |
|------|---------|--------|
| no binding | 27 | `ERR-NOT-INSCRIBED (u202)` |
| wrong state (xtrata escrowed) | 20 | `ERR-WRONG-STATE (u203)` |
| caller doesn't hold the twin (deposit transfer fails) | 29 | xtrata `(err u100)` |
| success: deposit twin, release pepe | 30–33 | `(ok true)`, ownership flips back |

### Admin (each owner-only fn: stranger rejected + owner succeeds)
| Function | Stranger | Owner |
|----------|----------|-------|
| `set-fee` | 34 → `u204` | 40 → ok |
| `set-free-threshold` | 35 → `u204` | 42 → ok |
| `set-discount` | 36 → `u204` | 45 → ok (44: `=fee` → `ERR-BAD-DISCOUNT u205`) |
| `remove-discount` | 37 → `u204` | 49 → ok |
| `set-payouts` | 38 → `u204` | 61 → ok (routing proven 65–68) |
| `transfer-ownership` | 39 → `u204` | 69 → ok |

`transfer-ownership` authority flip (steps 70–73): after handing ownership to chadstx, the
old owner's `set-fee` is rejected (`u204`) and the new owner's succeeds.

### Read-only getters & internals
- `get-owner` (1, 70), `get-fee` (2, 41, 73), `get-free-threshold` (3, 43),
  `get-payouts` (4, 62), `get-inscribed-count` (5, 14, 60, 68), `is-inscribed` (6, 12, 15),
  `get-discount` (7, 46, 50), `get-binding` (16, 25, 33).
- `fee-for` all three branches: free-tier `u0` (8), discount (47), standard (48, 51).
- `charge-fee`: `fee==0` no-op (13), `fee>0` split with odd remainder to payout-b (57–60),
  routing to reconfigured payouts (65–68).
- Release helpers (`as-contract? ((with-nft …)) …`) executed by every successful swap
  (22, 30) — the in-contract post-conditions allow the legitimate single-NFT release.

### Escrow invariant
At every state transition the ownership of **both** sides is asserted (steps 17/18, 23/24,
31/32): exactly one of {pepe, twin} is custodied by the registry and the holder owns the
other — the pepe and its on-chain twin are never both liquid simultaneously.

### Error codes exercised
`u1` (bitcoin-pepe `nft-transfer?` not-owner), `u100` (xtrata not-authorized),
`u103` (xtrata hash-mismatch) — all three propagated from upstream contracts — plus every
registry code: `u200` NOT-OWNER, `u201` ALREADY-INSCRIBED, `u202` NOT-INSCRIBED,
`u203` WRONG-STATE, `u204` NOT-AUTHORIZED, `u205` BAD-DISCOUNT.

## Rendezvous (RV) property fuzzing

Complementing the stxer integration sims, `tests/rv/` property-fuzzes the pure
admin/fee/discount surface on simnet (`@stacks/clarinet-sdk` 3.16 supports the
Clarity-4 features). RV surfaced a real edge the stxer sims didn't, because it
fuzzes admin-call *orderings*:

- **Finding** — `set-discount` enforces `discount < inscribe-fee` at write time,
  but `set-fee` could later drop the fee below a pinned discount, turning a
  "discount" into a **surcharge**. Repro: `set-discount(w, 2 STX)` → `set-fee(1 STX)`
  → `fee-for(w) = 2 STX`.
- **Fix** — `fee-for` clamps a discount to the standard fee
  (`(if (< d standard) d standard)`); a discount can never exceed standard.
- **After the fix** — `invariant-no-discount-surcharge` holds by construction:
  200 runs, 97 + 103 invariant checks, 0 failures. stxer re-run: still 70/70.

See `tests/rv/README.md` to reproduce.

## Deploy requirement

Deploy at **`clarity_version` 4 or higher** (the contract uses the `current-contract`
built-in and `as-contract?`/`with-nft`). The sims deploy as Clarity 5. While the master
contract is unpaused (verified live), no allowlisting is needed for the registry to mint
through it.
