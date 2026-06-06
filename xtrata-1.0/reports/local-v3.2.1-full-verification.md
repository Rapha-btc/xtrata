# Xtrata v3.2.1 Local Full Verification

Generated: 2026-06-06

## Summary

- Recommendation: local checks pass; final testnet broadcast rehearsal reports `ready for mainnet`.
- Scope: final v3.2.1 verification for `xtrata-v3.2.1`, `xtrata-small-mint-v1.1`, rehearsal tooling, migration docs, and reconstruction guidance.
- Broadcast mode: completed. See `reports/testnet-v3.2.1-rehearsal.md` and `.json`.

## Results

| Command | Result | Notes |
|---|---|---|
| `npm run contracts:sync` | pass | All local/testnet/mainnet contract variants synced. |
| `npm run contracts:verify` | pass | All local/testnet/mainnet contract variants verified. |
| `node --check scripts/testnet-v3.2.1-rehearsal.mjs` | pass | Script syntax valid. |
| `npm --prefix contracts/clarinet test -- xtrata-v3.2.1.test.ts` | pass | 20 passed. Includes helper policy cap 30, core list-32 ABI, advisory dedupe, reconstruction, and cross-contract same-ID migration collision coverage. |
| `npm run test:app` | pass | 129 files passed, 639 tests passed. |
| `npm run test:clarinet` | pass | 23 files passed, 2 skipped; 185 tests passed, 35 skipped. |
| `npm test` | pass | Runs `test:contracts`, `test:app`, and `test:clarinet`; all passed. |
| `clarinet check` from `contracts/clarinet` | pass | 33 contracts checked; existing warnings only. |
| `npm run testnet:v3.2.1:fresh-rehearsal -- --broadcast` + `resume-reconstruct` | pass | Final report says `ready for mainnet`; all gating cases have `evidence confirmed-on-chain`. |

## Important Notes

- Final broadcast namespace: `ST30X7KJ5R4ZKTG5FBS5RQTH3CC3DNNDP99XRWFE8`.
- Final broadcast evidence includes direct 32-chunk core mint, helper 30-chunk mint, staged 33 chunks as 32 + 1, staged 64 chunks as 32 + 32, advisory duplicate same-hash mint, parent/dependency split, v2.1.0 migration, v2.1.1 migration, duplicate migration rejection, and reconstruction of the 33-chunk token via safe direct map-entry reads.
- After Claude's final review, `xtrata-small-mint-v1.1` was tightened to helper policy cap 30 while keeping its list-32 ABI shape. The positive helper 30 path is covered by the broadcast rehearsal; the stricter 31+ rejection is covered locally.
- Cross-contract same-ID migration overlap is intentionally safe-failing: the first source token can migrate to the shared v3 ID, and a later source with the same numeric ID must fail with the duplicate guard without transferring the legacy NFT.
- Large reconstruction should use bounded chunk reads or direct node map-entry reads. Public node read-only calls can exceed `read_length` for large whole-token reconstruction.

## Remaining Mainnet Gate

Before broadcasting mainnet transactions, run the handover preflight against live mainnet state:

- confirm `contracts/live/xtrata-v3.2.1.clar` and `contracts/live/xtrata-small-mint-v1.1.clar` are the deploy artifacts;
- compute the one-shot `set-next-id` offset from all migratable legacy lines;
- confirm no native v3 mint occurs before `set-next-id` if legacy continuity is required;
- confirm royalty recipient, pause state, helper core pointer, and app/helper 30-chunk policy;
- archive the final mainnet deploy plan and transaction IDs.
