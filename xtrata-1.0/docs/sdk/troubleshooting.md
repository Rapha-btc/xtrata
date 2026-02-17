# SDK Troubleshooting

Use this page for the most common integration failures and fastest fixes.

## 1) `SdkValidationError: ... is required`

What it means:
- Required workflow input is missing or malformed.

Common causes:
- empty `senderAddress`
- `expectedHash` not exactly 32 bytes
- empty or too-long `tokenUri`
- non-positive price/fee input

Fix:
- validate inputs before calling `build*WorkflowPlan`.
- keep token URI <= 256 chars and mime <= 64 chars.

## 2) `SdkValidationError: Contract networks do not match`

What it means:
- You mixed `mainnet` and `testnet` contracts in one workflow.

Fix:
- ensure `contract.network`, `xtrataContract.network`, and market/NFT networks are identical.

## 3) Wallet warns about unsafe post-condition mode

What it means:
- You are likely bypassing SDK workflow output and building custom wallet calls.

Fix:
- use `@xtrata/sdk/workflows` outputs directly.
- confirm each call includes `postConditionMode: Deny`.

## 4) Post-condition check failure (`SentLe`, `Equal`, etc.)

What it means:
- actual transfer exceeded your deterministic cap or mismatched expected values.

Fix:
- refresh live pricing/fee inputs and rebuild workflow plan immediately before submission.
- verify collection active phase price vs base price.

## 5) Bad nonce / conflicting nonce

What it means:
- another pending transaction consumed the nonce.

Fix:
1. wait for pending transactions to confirm or expire.
2. refresh wallet state.
3. regenerate and retry only the failed step.
4. use `buildMintRecoveryGuide` for step-aware UI messaging.

## 6) Read-only call failures or rate limiting

What it means:
- endpoint issue, temporary infra failure, or rate-limit backoff.

Fix:
- configure `apiBaseUrl`/`apiBaseUrls`.
- keep retries bounded and avoid aggressive polling.
- use cached results where possible.

## 7) `npm run sdk:pack:smoke` fails in restricted environments

What it means:
- local npm cache or network restrictions can break naive pack/install flows.

Fix:
- use the included scripts:
  - `npm run sdk:pack:smoke`
  - `npm run sdk:examples:tarball:smoke`
- these scripts already isolate npm cache and validate tarballs via local extraction.

## 8) How to gather useful debug output

Collect:
- full thrown error message and stack trace
- workflow input payload (without secrets)
- contract IDs and network values
- exact failed step (`begin`, `chunks`, or `seal`)
- whether wallet call used deny mode + post-conditions

Then reproduce with:

```bash
npm run sdk:typecheck
npm run sdk:test
npm run sdk:docs:validate
```
