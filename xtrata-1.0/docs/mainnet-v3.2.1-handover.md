# Xtrata v3.2.1 Mainnet Handover Runbook

> Superseded by `docs/mainnet-v3.4.0-handover.md`. Do not deploy v3.2.1 or its
> v2.1.1 helper dependency for the current handover.

This runbook defines the controlled mainnet handover from the current live
Xtrata core line to the core `xtrata-v3.2.1` contract.

The goal is to keep the process automated and repeatable while requiring
explicit operator approval before any mainnet write transaction is broadcast.

## Scope

Target contracts:

- Current live core: `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0`
- Migration dependency: `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-1`
- New core: `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-1`

Deployment/admin signer:

- Wallet: `Xtrata.btc` in Xverse
- Address: `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X`

Mainnet signing must be performed through Xverse wallet prompts. The mainnet
handover must not require pasting the `Xtrata.btc` seed phrase, mnemonic,
private key, or encrypted mnemonic into terminal or repo files.

If the live source of truth changes before launch, update these contract IDs in
the runbook and the automation config before running any broadcast step.

## Protocol Decisions Preserved

- `xtrata-v3.2.1` uses fixed 16 KiB chunks.
- Core upload payload ABI supports `(list 32 (buff 16384))`.
- App tooling may keep a 30 chunk practical policy for wallet and RPC safety;
  the core upload ABI remains `(list 32 (buff 16384))`.
- `HashToId` is advisory first-seen lookup only.
- Duplicate same-hash mints are allowed and should mint distinct token IDs.
- Parents and dependencies remain separate relationship concepts.
- Reverse parent-child discovery remains an indexer/resolver/manifest concern.
- `set-next-id` is one-shot and must run before any native v3.2.1 mint if ID
  continuity is required.

## Safety Model

Mainnet automation must support three modes:

1. `plan`: read-only preflight and report generation.
2. `stage`: build and display wallet transaction intents, but do not request
   Xverse signatures.
3. `broadcast`: request one Xverse signature at a time only when the operator
   supplies an explicit confirmation flag.

The broadcast command must refuse to run unless all of these are true:

- `--broadcast` is present.
- `--confirm-mainnet-handover` is present.
- Network is mainnet.
- Contract principals match the approved mainnet targets.
- Admin/deployer address matches the expected contract owner.
- Connected Xverse address is
  `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X`.
- v3.2.1 has no native mints before `set-next-id` when continuity is enabled.
- A fresh preflight report was generated in the same run.

## Required Preflight Reads

Before any mainnet write, the automation must read:

Current live core:

- `get-admin`
- `is-paused`
- `get-next-token-id`
- `get-last-token-id`
- `get-royalty-recipient`
- `get-fee-unit` or split fee values where available

All migratable legacy cores:

- `xtrata-v1-1-1` `get-next-token-id` and `get-last-token-id`
- `xtrata-v2-1-0` `get-next-token-id` and `get-last-token-id`
- `xtrata-v2-1-1` `get-next-token-id` and `get-last-token-id`

If `xtrata-v2-1-1` is not already deployed on mainnet, deploy
`contracts/live/xtrata-v2.1.1.clar` first using **Clarity 2**. The v2.1.1
source uses `as-contract`, so deploying it as Clarity 3 fails with
`use of unresolved function 'as-contract'`. It is an empty, paused migration
dependency needed because `xtrata-v3.2.1` has explicit migration/read fallback
references to `.xtrata-v2-1-1`. It is not the live app target.

New v3.2.1 core:

- `get-admin`
- `is-paused`
- `get-next-token-id`
- `get-last-token-id`
- `get-minted-count`
- `get-royalty-recipient`
- `get-begin-fee-unit`
- `get-upload-chunk-fee-unit`
- `get-upload-batch-fee-unit`
- `get-seal-fee-unit`
- `get-single-tx-fee-unit`

The report must include raw read results and normalized interpretations.

## Next-ID Rule

The handover script must compute a proposed v3.2.1 starting ID across every
migratable legacy line using this rule:

```text
proposed_next_id = max(
  v1_1_1_get_next_token_id,
  v1_1_1_get_last_token_id + 1,
  v2_1_0_get_next_token_id,
  v2_1_0_get_last_token_id + 1,
  v2_1_1_get_next_token_id,
  v2_1_1_get_last_token_id + 1
)
```

The script must print each source value and the computed value. This prevents
native v3.2.1 mints from occupying IDs that a not-yet-migrated legacy token may
need later.

The script must refuse to call `set-next-id` if:

- the current live core has not been confirmed paused in the latest preflight
  report generated after the pause transaction;
- v3.2.1 `get-next-token-id` is not `u0`;
- v3.2.1 `get-minted-count` is not `u0`;
- v3.2.1 `get-last-token-id` indicates a native mint already occurred;
- the computed next ID is lower than or equal to any known migratable legacy
  minted ID.

If the operator deliberately wants to override the computed ID, the script must
require an explicit environment variable or CLI argument and record the override
reason in the report.

## Handover Sequence

The intended write sequence is:

1. Deploy `xtrata-v3-2-1` from `contracts/live/xtrata-v3.2.1.clar` through
   Xverse, unless already deployed and source-hash verified. If mainnet
   `xtrata-v2-1-1` is missing, deploy `contracts/live/xtrata-v2.1.1.clar`
   first as **Clarity 2** so the v3.2.1 migration reference resolves.

2. Pause the current live core:

   ```clarity
   (contract-call? .xtrata-v2-1-0 set-paused true)
   ```

3. Wait for the pause transaction to confirm.

4. Rerun the mainnet preflight and refresh the handover UI:

   ```sh
   npm run mainnet:v3.2.1:preflight
   ```

   The `set-next-id` value must come from this post-pause report, not from a
   pre-pause report. This closes the race where someone could inscribe between
   the initial plan and the live-core pause confirmation.

5. Confirm the current live core is paused:

   ```clarity
   (contract-call? .xtrata-v2-1-0 is-paused)
   ```

6. Set the one-shot v3.2.1 next ID, if required:

   ```clarity
   (contract-call? .xtrata-v3-2-1 set-next-id u<computed-next-id>)
   ```

7. Set the v3.2.1 royalty recipient:

   ```clarity
   (contract-call? .xtrata-v3-2-1 set-royalty-recipient '<recipient>)
   ```

8. Unpause v3.2.1:

   ```clarity
   (contract-call? .xtrata-v3-2-1 set-paused false)
   ```

9. Mint the first v3.2.1 inscription using the approved announcement text:

   - Source: `docs/mainnet-v3.2.1-announcement-inscription.md`
   - MIME: `text/markdown`
   - Route: direct `mint-single-tx` unless final byte size exceeds the single
     transaction policy.

10. Reconstruct the minted announcement inscription and verify:

   - token ID equals the expected first v3.2.1 native ID;
   - byte reconstruction matches the local announcement file;
   - final Xtrata rolling hash matches;
   - `get-id-by-hash` returns the announcement token ID.

11. Produce the final handover report.

## Suggested Commands

These commands are the intended operator interface for the next automation
iteration:

```sh
npm run mainnet:v3.2.1:handover
npm run mainnet:v3.2.1:handover -- --stage
npm run mainnet:v3.2.1:handover-ui
npm run mainnet:v3.2.1:handover -- --broadcast --confirm-mainnet-handover
npm run mainnet:v3.2.1:report
```

The first command must be dry-run/read-only by default.

## Required Environment

Mainnet secrets must stay out of git, docs, committed `.env` files, shell
profiles, and chat.

Recommended configuration:

```sh
export XTRATA_MAINNET_API_URL=https://api.hiro.so
export XTRATA_MAINNET_HIRO_API_KEY=<hiro-api-key>
export XTRATA_MAINNET_DEPLOYER_ADDRESS=SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X
export XTRATA_MAINNET_SIGNER_WALLET=Xverse
export XTRATA_MAINNET_SIGNER_BNS=Xtrata.btc
export XTRATA_MAINNET_ROYALTY_RECIPIENT=<mainnet-royalty-address>
```

For write transactions, use Xverse wallet prompts from the local handover UI.
Do not use raw keys or mnemonics for mainnet deployment.

## Report Output

The automation should write:

- `reports/mainnet-v3.2.1-handover.md`
- `reports/mainnet-v3.2.1-handover.json`

The report must include:

- network;
- operator/deployer/admin address and connected wallet label;
- old live core contract ID;
- new v3.2.1 core contract ID;
- preflight read results;
- proposed and final `next-id`;
- all transaction IDs;
- block heights;
- fees;
- first v3.2.1 token ID;
- announcement file hash;
- reconstruction result;
- warnings;
- failures;
- final recommendation.

## Rollback And Recovery Notes

Contracts cannot be undeployed and sealed inscriptions cannot be edited.

The practical recovery options are:

- If old core pause succeeds but v3.2.1 setup fails before launch, unpause the
  old core after diagnosing the failure.
- If `set-next-id` succeeds but announcement mint fails, keep v3.2.1 paused
  until the cause is understood, then resume the handover.
- If the announcement mint succeeds, treat v3.2.1 as live and continue with app,
  SDK, resolver, and documentation updates.

## Manual Sign-Off Checklist

Before broadcast:

- [ ] Testnet report says `ready for mainnet`.
- [ ] Mainnet contract source has been synced and verified.
- [ ] Live core contract ID is confirmed.
- [ ] New core contract ID is confirmed.
- [ ] Admin address is confirmed.
- [ ] Royalty recipient is confirmed.
- [ ] Computed next ID is reviewed.
- [ ] Announcement inscription text is approved.
- [ ] Mainnet dry-run report has no failures.
- [ ] Operator has enough STX for deployment/admin/mint transactions.

After broadcast:

- [ ] Old live core is paused.
- [ ] v3.2.1 has the expected next ID or first token ID.
- [ ] v3.2.1 is unpaused.
- [ ] Announcement inscription reconstructs exactly.
- [ ] App/SDK defaults are ready to move to v3.2.1.
- [ ] Final mainnet handover report is committed or archived.
