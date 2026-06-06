# Xtrata v3.2.1 Mainnet Handover Runbook

This runbook defines the controlled mainnet handover from the current live
Xtrata core line to `xtrata-v3.2.1` and `xtrata-small-mint-v1.1`.

The goal is to keep the process automated and repeatable while requiring
explicit operator approval before any mainnet write transaction is broadcast.

## Scope

Target contracts:

- Current live core: `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-1`
- New core: `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-1`
- New small-mint helper: `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-small-mint-v1-1`

If the live source of truth changes before launch, update these contract IDs in
the runbook and the automation config before running any broadcast step.

## Protocol Decisions Preserved

- `xtrata-v3.2.1` uses fixed 16 KiB chunks.
- Core upload payload ABI supports `(list 32 (buff 16384))`.
- App/helper policy may continue to cap normal upload batches at 30 chunks.
- `HashToId` is advisory first-seen lookup only.
- Duplicate same-hash mints are allowed and should mint distinct token IDs.
- Parents and dependencies remain separate relationship concepts.
- Reverse parent-child discovery remains an indexer/resolver/manifest concern.
- `set-next-id` is one-shot and must run before any native v3.2.1 mint if ID
  continuity is required.

## Safety Model

Mainnet automation must support three modes:

1. `plan`: read-only preflight and report generation.
2. `stage`: build and display unsigned/signed transaction intents, but do not
   broadcast.
3. `broadcast`: send transactions only when the operator supplies an explicit
   confirmation flag.

The broadcast command must refuse to run unless all of these are true:

- `--broadcast` is present.
- `--confirm-mainnet-handover` is present.
- Network is mainnet.
- Contract principals match the approved mainnet targets.
- Admin/deployer address matches the expected contract owner.
- Helper owner-only setup calls are expected to be sent by the approved admin.
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

Small-mint helper:

- `is-paused`
- `get-core-contract`

The helper does not expose `get-admin`. The automation must not invent that
read. Instead, it should report the expected helper operator and verify helper
control by staging owner-only setup calls. `ERR-NOT-AUTHORIZED` on helper setup
is a hard failure.

The report must include raw read results and normalized interpretations.

## Next-ID Rule

The handover script must compute a proposed v3.2.1 starting ID from the live
core using this rule:

```text
proposed_next_id = max(live_get_next_token_id, live_get_last_token_id + 1)
```

The script must print both source values and the computed value.

The script must refuse to call `set-next-id` if:

- v3.2.1 `get-next-token-id` is not `u0`;
- v3.2.1 `get-minted-count` is not `u0`;
- v3.2.1 `get-last-token-id` indicates a native mint already occurred;
- the computed next ID is lower than or equal to a known live minted ID.

If the operator deliberately wants to override the computed ID, the script must
require an explicit environment variable or CLI argument and record the override
reason in the report.

## Handover Sequence

The intended write sequence is:

1. Pause the current live core:

   ```clarity
   (contract-call? .xtrata-v2-1-1 set-paused true)
   ```

2. Confirm the current live core is paused:

   ```clarity
   (contract-call? .xtrata-v2-1-1 is-paused)
   ```

3. Set the one-shot v3.2.1 next ID, if required:

   ```clarity
   (contract-call? .xtrata-v3-2-1 set-next-id u<computed-next-id>)
   ```

4. Set the v3.2.1 royalty recipient:

   ```clarity
   (contract-call? .xtrata-v3-2-1 set-royalty-recipient '<recipient>)
   ```

5. Confirm or set the helper core target:

   ```clarity
   (contract-call? .xtrata-small-mint-v1-1 set-core-contract 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-1)
   ```

6. Unpause v3.2.1:

   ```clarity
   (contract-call? .xtrata-v3-2-1 set-paused false)
   ```

7. Unpause the small-mint helper:

   ```clarity
   (contract-call? .xtrata-small-mint-v1-1 set-paused false)
   ```

8. Mint the first v3.2.1 inscription using the approved announcement text:

   - Source: `docs/mainnet-v3.2.1-announcement-inscription.md`
   - MIME: `text/markdown`
   - Route: direct `mint-single-tx` unless final byte size exceeds the single
     transaction policy.

9. Reconstruct the minted announcement inscription and verify:

   - token ID equals the expected first v3.2.1 native ID;
   - byte reconstruction matches the local announcement file;
   - final Xtrata rolling hash matches;
   - `get-id-by-hash` returns the announcement token ID.

10. Produce the final handover report.

## Suggested Commands

These commands are the intended operator interface for the next automation
iteration:

```sh
npm run mainnet:v3.2.1:handover
npm run mainnet:v3.2.1:handover -- --stage
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
export XTRATA_MAINNET_DEPLOYER_ADDRESS=<mainnet-admin-address>
export XTRATA_MAINNET_ROYALTY_RECIPIENT=<mainnet-royalty-address>
```

For write transactions, prefer the safest signing route available in the repo at
implementation time. If a raw key or mnemonic is required, keep it terminal-only
and use a dedicated admin wallet. Do not persist it.

## Report Output

The automation should write:

- `reports/mainnet-v3.2.1-handover.md`
- `reports/mainnet-v3.2.1-handover.json`

The report must include:

- network;
- operator/deployer/admin address;
- old live core contract ID;
- new v3.2.1 core contract ID;
- helper contract ID;
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
- If v3.2.1 unpauses but helper setup fails, leave core available and keep helper
  paused until fixed.
- If the announcement mint succeeds, treat v3.2.1 as live and continue with app,
  SDK, resolver, and documentation updates.

## Manual Sign-Off Checklist

Before broadcast:

- [ ] Testnet report says `ready for mainnet`.
- [ ] Mainnet contract source has been synced and verified.
- [ ] Live core contract ID is confirmed.
- [ ] New core and helper contract IDs are confirmed.
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
- [ ] Helper points to v3.2.1 and is unpaused.
- [ ] Announcement inscription reconstructs exactly.
- [ ] App/SDK defaults are ready to move to v3.2.1.
- [ ] Final mainnet handover report is committed or archived.
