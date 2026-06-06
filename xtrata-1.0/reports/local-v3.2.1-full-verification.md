# Xtrata v3.2.1 Local Full Verification

Generated: 2026-06-06

## Summary

- Recommendation: local checks pass; still needs one clean testnet broadcast pass before mainnet.
- Scope: post-Claude-review local verification for `xtrata-v3.2.1`, helper, rehearsal tooling, app, SDK, and Clarinet suites.
- Broadcast mode: not run.

## Results

| Command | Result | Notes |
|---|---|---|
| `npm run contracts:sync` | pass | All local/testnet/mainnet contract variants synced. |
| `npm run contracts:verify` | pass | All local/testnet/mainnet contract variants verified. |
| `node --check scripts/testnet-v3.2.1-rehearsal.mjs` | pass | Script syntax valid. |
| `npm --prefix contracts/clarinet test -- xtrata-v3.2.1.test.ts` | pass | 20 passed. Includes cross-contract same-ID migration collision coverage. |
| `npm run test:app` | pass | 129 files passed, 639 tests passed. |
| `npm run test:clarinet` | pass | 23 files passed, 2 skipped; 185 tests passed, 35 skipped. |
| `npm test` | pass | Runs `test:contracts`, `test:app`, and `test:clarinet`; all passed. |
| `clarinet check` from `contracts/clarinet` | pass | 33 contracts checked; 546 existing warnings. |

## Important Notes

- The first attempted `npm --prefix contracts/clarinet exec -- clarinet check` run was silent/hung in the wrapper. Running `clarinet check` directly from `contracts/clarinet` succeeded.
- `npm run testnet:v3.2.1:remaining` was run in dry-run mode after the rehearsal hardening. It correctly wrote `Recommendation: needs another testnet pass`.
- The current local report files under `reports/testnet-v3.2.1-rehearsal.*` are dry-run reports, not broadcast-readiness evidence.

## Remaining Mainnet Gate

Before mainnet handover, run one clean testnet broadcast pass with the stricter readiness gate so these cases have `evidence: confirmed-on-chain`:

- direct single-call 32 chunks;
- staged 33 chunks as 32 + 1;
- staged 64 chunks as 32 + 32;
- advisory duplicate same-hash mint;
- helper max-policy mint, and either helper 32 chunks or a final decision to lower helper max to 30;
- v2.1.0 and v2.1.1 migration paths;
- reconstruction checks with real token IDs and transaction IDs.
