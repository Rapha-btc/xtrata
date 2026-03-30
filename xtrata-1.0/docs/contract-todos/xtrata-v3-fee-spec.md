# xtrata v3 Fee Spec

## Scope
- Working spec for the `xtrata-v3.0.0` fee model.
- Assumes the v3 core drops on-chain dedupe and adds a core-native single-tx mint path.
- Focus here is protocol fee calculation and fee policy resolution, not mining fees.

## Goals
- Make protocol fees proportional to file size, not just 16KB chunk count.
- Allow fee-free or discounted minting for specific wallets.
- Allow fee-free or discounted minting for specific collection contracts and trusted callers.
- Keep staged uploads and single-tx uploads on one fee model with explicit quote support.
- Replace implicit fee exemptions with explicit, queryable policy state.

## Non-goals
- Do not try to make mining fees disappear. Wallet mining fees still apply.
- Do not couple fee policy to pause allowlists.
- Do not reintroduce content-hash dedupe as a fee-side control.
- Do not make chunk size variable. Keep canonical 16KB chunking for hashing and reconstruction.

## Current v2.1.1 problems
- Upload fees are still quantized by chunk count, so `1KB` and `16KB` both pay the same upload chunk fee.
- There is no fee whitelist for wallets or collection contracts.
- The only implicit fee exemption is `tx-sender == royalty-recipient`.
- The app and SDK still mostly think in terms of `get-fee-unit()`, which is no longer enough once policy depends on bytes, wallet, caller, and path.

## Proposed fee schedule
- Keep `CHUNK-SIZE` as `u16384`.
- Replace the current upload chunk fee with a byte-proportional upload component.
- Split fixed fees by flow so single-tx mints can be cheaper for tiny files.

### Data vars
- `fee-recipient: principal`
- `staged-begin-fee-unit: uint`
- `staged-seal-fee-unit: uint`
- `single-tx-fee-unit: uint`
- `upload-byte-fee-unit: uint`
- `extra-batch-fee-unit: uint`

### Current contract bounds
- `FEE-MIN = u1` (`0.000001 STX`)
- `FEE-MAX = u1000000` (`1.0 STX`)
- Fee updates remain bounded per transaction:
  - increase: at most `2x`
  - decrease: at most `10x`

### Fee interpretation
- `upload-byte-fee-unit` means "protocol fee charged per full 16,384 bytes of payload".
- Actual upload size fee is:
  - `ceil(total-size * upload-byte-fee-unit / CHUNK-SIZE)`
- This keeps the existing 16KB reference point but lets tiny files scale down proportionally.

### Recommended formulas
- `size-fee = ceil(total-size * upload-byte-fee-unit / CHUNK-SIZE)`
- `extra-batches = ceil(max(total-chunks - 50, 0) / 50)`
- `extra-batch-fee = extra-batches * extra-batch-fee-unit`
- `staged-base-fee = staged-begin-fee-unit + staged-seal-fee-unit`
- `single-tx-base-fee = single-tx-fee-unit`
- `default-total(staged) = staged-base-fee + size-fee + extra-batch-fee`
- `default-total(single-tx) = single-tx-base-fee + size-fee + extra-batch-fee`

Implementation note:
- In the live v3 contract, the single-tx path is capped at `<= 50` chunks, so
  `extra-batch-fee` is normally `0` for valid direct single-tx mints.

## Fee policy overrides
- Use basis points so the same mechanism covers full price, fractional discounts, and free minting.
- `u10000` = full fee.
- `u5000` = 50% fee.
- `u0` = free protocol fee.

### Maps
- `WalletFeeBps { wallet: principal } -> { bps: uint }`
- `CallerFeeBps { caller: principal } -> { bps: uint }`

### Resolution rules
1. If `WalletFeeBps` exists for `tx-sender`, use it.
2. Else if `contract-caller != tx-sender` and `CallerFeeBps` exists for `contract-caller`, use it.
3. Else use `u10000`.

### Why this precedence
- Wallet overrides are the most explicit and should win.
- Collection contracts and relayers need caller-level discounts without giving the same wallet discount everywhere.
- No stacking keeps outcomes predictable and easy to quote off-chain.

### Important separation
- `AllowedCallers` should remain a pause/write-access control only.
- Fee policy maps should not imply write access while paused.
- Fee-free callers should still need normal inscription permission.

## Final fee calculation
- Compute the default fee for the selected path.
- Resolve one `bps` value using the precedence rules above.
- Apply the resolved `bps` once to the full default fee:
  - `final-total = ceil(default-total * resolved-bps / 10000)`

This avoids per-component rounding drift and makes policy behavior easy to explain.

## Recommended public setters
- `set-fee-recipient(recipient)`
- `set-staged-begin-fee-unit(new-fee)`
- `set-staged-seal-fee-unit(new-fee)`
- `set-single-tx-fee-unit(new-fee)`
- `set-upload-byte-fee-unit(new-fee)`
- `set-extra-batch-fee-unit(new-fee)`
- `set-wallet-fee-bps(wallet, bps)`
- `clear-wallet-fee-bps(wallet)`
- `set-wallet-fee-bps-batch(entries)`
- `set-caller-fee-bps(caller, bps)`
- `clear-caller-fee-bps(caller)`
- `set-caller-fee-bps-batch(entries)`

## Recommended read-only getters
- `get-fee-recipient()`
- `get-staged-begin-fee-unit()`
- `get-staged-seal-fee-unit()`
- `get-single-tx-fee-unit()`
- `get-upload-byte-fee-unit()`
- `get-extra-batch-fee-unit()`
- `get-wallet-fee-bps(wallet)`
- `get-caller-fee-bps(caller)`

## Quote API
- Use an explicit quote read-only. Do not keep the app on `get-fee-unit()` heuristics.

### Recommended signature
- `quote-inscription-fee(payer, caller, total-size, total-chunks, mode)`

### Recommended params
- `payer: principal`
- `caller: (optional principal)`
- `total-size: uint`
- `total-chunks: uint`
- `mode: uint`
  - `u1 = staged`
  - `u2 = single-tx`

### Implemented return shape
- `resolved-bps: uint`
- `policy-source: uint`
  - `u0 = default`
  - `u1 = caller`
  - `u2 = wallet`
- `begin-fee: uint`
- `seal-fee: uint`
- `single-tx-fee: uint`
- `size-fee: uint`
- `extra-batches: uint`
- `extra-batch-fee: uint`
- `total-fee: uint`

### Validation rules
- Reject `total-chunks == u0`.
- Reject `total-size > total-chunks * CHUNK-SIZE`.
- Reject unsupported `mode`.
- Single-tx quotes should still validate against the single-tx eligibility cap used by the new core path.

## Why single-tx needs its own fixed fee
- If tiny files still pay the full staged `begin + seal` base, byte-proportional upload pricing will not matter much for `1KB` and sub-`1KB` inscriptions.
- A dedicated `single-tx-fee-unit` lets the protocol make tiny inscriptions materially cheaper without weakening the staged resume-safe model for larger files.

## Recommended operational examples
- Public direct mint:
  - no wallet override
  - no caller override
  - resolved `bps = u10000`
- Free artist wallet:
  - `WalletFeeBps[artist-wallet] = u0`
- Free collection mint contract:
  - `CallerFeeBps[collection-contract] = u0`
- Discounted partner collection:
  - `CallerFeeBps[partner-contract] = u2500`

## Recommended migration posture
- Do not preserve the current implicit `royalty-recipient` fee exemption.
- Represent every fee exemption explicitly in wallet or caller fee policy maps.
- Provide an admin migration checklist so any current special wallets or collection contracts are re-entered as explicit policy rows after deploy.

## App and SDK follow-on work
- Replace spend-cap estimates that depend on `get-fee-unit()` with the quote API.
- Update the first-party mint screen to quote by path:
  - staged
  - single-tx
- Update collection mint flows so quote calls pass the collection contract principal as `caller`.
- Update backend fee guidance routes to use byte-based quoting instead of the current 30-chunk heuristic.
- Update docs and AI training material to stop describing fees as chunk-bucket pricing only.

## Recommendation
- Base the v3 core fee model on:
  - fixed 16KB chunking
  - byte-proportional upload fees
  - separate staged and single-tx fixed fees
  - explicit wallet and caller basis-point overrides
  - a required quote API for every client
