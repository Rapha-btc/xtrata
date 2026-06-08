# Mainnet v3.2.1 Automated Deployment Steps

This is the concise step-by-step procedure for automating the mainnet handover
to the core `xtrata-v3.2.1` contract.

Use the longer runbook for rationale:

- `docs/mainnet-v3.2.1-handover.md`
- `docs/mainnet-v3.2.1-automation-spec.md`

## 0. Non-Negotiable Rules

- Deploy from `contracts/live/*` only.
- Mainnet deployer/admin wallet is `Xtrata.btc`:
  `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X`.
- Mainnet write transactions must be signed physically in Xverse by the
  `Xtrata.btc` wallet. Do not use terminal-held seed phrases or private keys
  for the mainnet handover.
- Do not write mnemonics, private keys, encrypted mnemonics, or API keys into
  git, reports, committed env files, or chat.
- Mainnet writes require both `--broadcast` and
  `--confirm-mainnet-handover`.
- `set-next-id` is one-shot. It must run before the first native v3.2.1 mint if
  legacy ID continuity is required.
- Stop on any unexpected abort, rejected transaction, missing confirmation, or
  source-hash mismatch.

## 1. Prepare Local Sources

Run from the repo root:

```sh
npm run contracts:sync
npm run contracts:verify
```

Confirm:

- `contracts/live/xtrata-v3.2.1.clar` uses the mainnet SIP-009 trait.
- Core v3.2.1 upload ABI remains `(list 32 (buff 16384))`.
- First public inscription uses the core `mint-single-tx` route directly.

## 2. Run Local Verification

```sh
npm --prefix contracts/clarinet exec -- clarinet check
npm --prefix contracts/clarinet test -- xtrata-v3.2.1.test.ts
npm run test:clarinet
npm run test:app
npm test
```

Do not proceed if any required local check fails.

## 3. Confirm Testnet Gate

Confirm the final testnet rehearsal report exists and says
`Recommendation: ready for mainnet`:

```sh
cat reports/testnet-v3.2.1-rehearsal.md
```

Required evidence in the report:

- direct single-call 32 chunks passed on-chain;
- core `mint-single-tx` 30 chunks passed on-chain;
- staged 33 chunks as 32 + 1 passed on-chain;
- staged 64 chunks as 32 + 32 passed on-chain;
- advisory duplicate same-hash mint passed on-chain;
- v2.1.0 and v2.1.1 migrations passed on-chain;
- duplicate migration rejected on-chain;
- reconstruction verified for a multi-chunk token.

## 4. Set Mainnet Environment

Use terminal-only exports or a local untracked secret manager. These values are
non-secret except for the optional Hiro API key. Do not export a mnemonic or
private key.

```sh
export XTRATA_MAINNET_API_URL=https://api.hiro.so
export XTRATA_MAINNET_HIRO_API_KEY=<hiro-api-key>
export XTRATA_MAINNET_DEPLOYER_ADDRESS=SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X
export XTRATA_MAINNET_SIGNER_WALLET=Xverse
export XTRATA_MAINNET_SIGNER_BNS=Xtrata.btc
export XTRATA_MAINNET_ROYALTY_RECIPIENT=<mainnet-royalty-address>
export XTRATA_MAINNET_OLD_CORE=SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-1
export XTRATA_MAINNET_LEGACY_V1_1_1=SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1
export XTRATA_MAINNET_LEGACY_V2_1_0=SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0
export XTRATA_MAINNET_LEGACY_V2_1_1=SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-1
export XTRATA_MAINNET_CORE=SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-1
export XTRATA_MAINNET_ANNOUNCEMENT_FILE=docs/mainnet-v3.2.1-announcement-inscription.md
```

## 5. Deploy Mainnet Contracts

Generate and inspect a mainnet deployment plan using Clarinet repo conventions,
but do not apply the plan with Clarinet unless a hardware/offline signing path
has been explicitly approved. The preferred mainnet path is Xverse wallet
signing from `Xtrata.btc`.

```sh
npm --prefix contracts/clarinet exec -- clarinet deployments generate --mainnet --manual-cost
```

Before applying the plan, confirm it publishes:

- `xtrata-v3-2-1` from the live mainnet variant;
- no additional contracts unless a separate, explicit launch has been approved;
- no unwanted test, mock, or old contracts.

Do not run this for the Xverse handover path:

```sh
# Do not use for Xverse wallet handover:
# npm --prefix contracts/clarinet exec -- clarinet deployments apply --mainnet --no-dashboard --use-on-disk-deployment-plan
```

Instead, start the local wallet-signing handover console:

```sh
npm run mainnet:v3.2.1:handover-ui
```

The local console must:

1. connect to Xverse;
2. require the connected address to equal
   `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X`;
3. display the contract name and source hash before each deploy;
4. ask Xverse to sign and broadcast one deployment transaction at a time;
5. wait for confirmation before enabling the next step;
6. record every deploy transaction ID and block height.

## 6. Verify Deployed Sources

After deployment confirmation, the automation must:

1. Fetch deployed source for `xtrata-v3-2-1`.
2. Compare source hash against `contracts/live/xtrata-v3.2.1.clar`.
3. Refuse to continue if the source hash differs.

## 7. Preflight Mainnet State

Run read-only preflight:

```sh
npm run mainnet:v3.2.1:preflight
```

The script must read:

- old live core admin, pause state, next ID, last ID;
- v1.1.1, v2.1.0, and v2.1.1 next ID and last ID;
- new v3.2.1 admin, pause state, next ID, last ID, minted count;
- v3.2.1 royalty recipient and fee units.

The script computes:

```text
computed_next_id = max(
  v1_1_1_next_id,
  v1_1_1_last_id + 1,
  v2_1_0_next_id,
  v2_1_0_last_id + 1,
  v2_1_1_next_id,
  v2_1_1_last_id + 1
)
```

Stop if:

- network is not mainnet;
- expected contract IDs do not match;
- admin does not match `XTRATA_MAINNET_DEPLOYER_ADDRESS`;
- v3.2.1 has already minted and `set-next-id` is still required;
- computed next ID is missing or lower than any legacy minted ID;
- royalty recipient is missing;
- announcement file is missing or empty.

## 8. Stage Write Plan

```sh
npm run mainnet:v3.2.1:handover -- --stage
```

Confirm staged wallet-signed writes, in order:

1. Deploy `xtrata-v3-2-1`, if not already deployed.
2. Pause old live core.
3. Set v3.2.1 next ID to `computed_next_id`.
4. Set v3.2.1 royalty recipient.
5. Unpause v3.2.1.
6. Mint announcement inscription with core `mint-single-tx`.
7. Reconstruct and verify announcement inscription.

Do not broadcast if the staged plan contains extra writes.

## 9. Broadcast Handover

Broadcast only with the explicit confirmation flag and the Xverse wallet
connected to `Xtrata.btc`:

```sh
npm run mainnet:v3.2.1:handover -- --broadcast --confirm-mainnet-handover
```

Each write must open an Xverse signing prompt. Review the contract/function,
principal, arguments, and fee in the wallet before approving. After each write,
wait for confirmation and verify the expected state before continuing.

Expected state transitions:

- new core contract is deployed under
  `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X`;
- old live core becomes paused;
- v3.2.1 next ID equals `computed_next_id`;
- v3.2.1 royalty recipient equals configured recipient;
- v3.2.1 is unpaused;
- announcement token ID equals the first native v3.2.1 ID;
- announcement reconstruction bytes and rolling hash match the local file;
- `get-id-by-hash` returns the announcement token ID.

## 10. Produce Final Report

```sh
npm run mainnet:v3.2.1:report
```

The final report must be written to:

- `reports/mainnet-v3.2.1-handover.md`
- `reports/mainnet-v3.2.1-handover.json`

Required report fields:

- network;
- admin/deployer address;
- deployed contract IDs;
- deployed source hashes;
- computed and final next ID;
- all transaction IDs;
- block heights;
- fees;
- first native v3.2.1 token ID;
- announcement bytes, chunks, and hash;
- reconstruction result;
- warnings;
- failures;
- final recommendation.

## Recovery Rules

- If old core pause succeeds but v3.2.1 setup fails before launch, keep v3.2.1
  paused and decide whether to unpause the old core.
- If `set-next-id` succeeds but announcement mint fails, do not reset or retry
  blindly. Keep v3.2.1 paused if possible and diagnose from the confirmed state.
- If a transaction has ambiguous confirmation, stop and reconcile from chain
  state before sending the next transaction.
- If the announcement mint succeeds but reconstruction fails, keep reports in
  `needs review` state until byte reconstruction is fixed and verified.
