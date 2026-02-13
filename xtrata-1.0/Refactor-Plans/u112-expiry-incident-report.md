# U112 Mint Expiry Incident Report

Date: February 11, 2026  
Scope: Single mint resume/seal flow (`xtrata-v2-1-0`)

## Summary (Plain Language)

Your mint UI is able to submit the seal transaction, but the contract is rejecting it with `ERR-EXPIRED (u112)` after broadcast.

That means:

- The app is **not** the component refusing to send seal.
- The chain call is being evaluated and rejected by contract expiry rules.
- A transaction hash can exist even when final execution fails.

Your logs already show this pattern:

- `Step 3: seal-inscription`
- `Seal tx sent: ...`
- then on-chain failure `ERR-EXPIRED (u112)`

## Where Expiry Is Enforced (On-Chain)

The rejection comes from the live contract:

- `contracts/live/xtrata-v2.1.0.clar:84`  
  `UPLOAD-EXPIRY-BLOCKS u4320`
- `contracts/live/xtrata-v2.1.0.clar:213`  
  `assert-not-expired`
- `contracts/live/xtrata-v2.1.0.clar:225`  
  returns `ERR-EXPIRED (u112)` when expired
- `contracts/live/xtrata-v2.1.0.clar:884`  
  `seal-inscription` (passes through expiry checks)

Important: this check is also used in begin/resume and upload paths, not just seal.

## How This Hash Became “Expired”

The contract tracks an upload session by `{ owner, hash }` in `UploadState`.

Key mechanics:

- `last-touched` is set when upload is created/resumed in `begin-inscription`.
- `last-touched` is refreshed on every successful `add-chunk-batch`.
- `seal-inscription` checks `assert-not-expired` against the same `last-touched`.

Expiry condition:

- session is expired when:
  `stacks-block-height >= last-touched + 4320`

So a hash can have `245/245 chunks uploaded` and still fail seal if too many blocks passed after the last successful upload write.

Why your log looks contradictory:

- `Seal tx sent ...` means wallet broadcast succeeded.
- `u112` means on-chain execution later failed at contract validation time.
- Both can be true in the same attempt.

## Why It Can Feel “Too Quick”

`4320` is measured in **blocks**, not clock minutes.

The comment in contract assumes a slower cadence (~10 min/block), but real observed block cadence can be much faster at times. If blocks are fast, wall-clock expiry is much shorter.

Examples for `4320` blocks:

- 10 min/block: ~30 days
- 1 min/block: ~3 days
- 30 sec/block: ~1.5 days
- 10 sec/block: ~12 hours

Also, near-boundary race can happen:

- you submit seal before cutoff,
- but it confirms after cutoff,
- and contract returns `u112`.

## What The App Was Doing Before

Two things were confusing behavior:

1. The app showed optimistic messaging after broadcast that read like completion.
2. Start-over previously called only `abandon-upload`, which marks session expired but may leave stale chunk state unless purge is also executed.

Also, resume mode still did unnecessary duplicate-history scanning, which could look like the app was “finding all old txs” first.

## App Changes Implemented

All changes are in `src/screens/MintScreen.tsx`.

1. Clearer `u112` messaging for single mints:
- `src/screens/MintScreen.tsx:133`

2. Do not retry forever on deterministic expiry (`u112`):
- `src/screens/MintScreen.tsx:1684`

3. Fix start-over to fully clear expired session (`abandon-upload` + `purge-expired-chunk-batch`):
- `src/screens/MintScreen.tsx:1722`
- `src/screens/MintScreen.tsx:1809`

4. Change status text to avoid false “complete” wording right after broadcast:
- `src/screens/MintScreen.tsx:2019`
- `src/screens/MintScreen.tsx:2259`

5. Skip full-history duplicate scanning when resumable upload state exists:
- `src/screens/MintScreen.tsx:904`

6. Explicitly state single-mint resume window in UI:
- `src/screens/MintScreen.tsx:3066`

## Validation Run

Build validation:

- `npm run build` passed after these changes.

## Why We Cannot “Disable Expiry” For This Live Contract

Because expiry is inside the already-deployed contract logic (`xtrata-v2-1-0`), it cannot be toggled by frontend code.

Frontend can only:

- submit transactions,
- show clearer status/errors,
- and run cleanup helpers.

To truly disable expiry on-chain would require deploying a different contract version.

## Immediate Recovery Procedure For The Stuck Mint

Use this sequence in the updated app:

1. Load the original file used for this hash.
2. If resume state appears but seal keeps returning `u112`, click `Start over`.
3. Approve all cleanup transactions:
- one `abandon-upload`
- then one or more `purge-expired-chunk-batch`
4. Wait for those cleanup transactions to confirm.
5. Begin mint again for the same file/hash.
6. Upload batches and seal.

If cleanup fails due wallet/network interruption, re-open same file and run start-over again until purge batches finish.

## Direct Answer To “Is The App Preventing Seal?”

For your provided log sequence, no.

The app did submit seal (`Seal tx sent ...`), so the refusal is contract-side execution at `u112`.

## Optional Next Hardening (Recommended)

1. Add tx-result polling so UI marks `submitted` vs `confirmed` vs `failed` explicitly.
2. Add a dedicated “Expired session detected” panel with one-click guided cleanup flow.
3. Add contract-call receipt parsing in UI to surface exact error code and function on failure.

## How To Prevent This Happening Again

1. Seal immediately after the final upload batch confirms; do not leave fully-uploaded sessions idle.
2. If you pause minting, come back with the same original file and resume quickly.
3. If `u112` appears, run full cleanup (`Start over` now does abandon + purge) before retrying.
4. Do not rely on tx broadcast as success; wait for final confirmed result.
5. Add a pre-seal freshness check in UI (recommended next task):
- read upload state + current block height,
- show remaining blocks/time,
- warn strongly when close to expiry (for example <500 blocks).

## Translation Of Your Latest Logs

Your pasted sequence means:

1. `Contract call cancelled ... functionName: abandon-upload`  
   You closed/cancelled the wallet prompt, or wallet failed to broadcast. No cleanup happened in that attempt.

2. `Abandon tx sent: ...`  
   A later attempt did broadcast `abandon-upload`.

3. Immediately after, app resumed and attempted seal again.  
   If cleanup is not fully confirmed/complete yet, resume can still see old upload state and hit the same expiry outcome.

4. `Seal tx sent: ...` again  
   This is broadcast, not guaranteed success.

The updated UI now adds a cleanup lock so resume is disabled while cleanup confirmations are pending.
