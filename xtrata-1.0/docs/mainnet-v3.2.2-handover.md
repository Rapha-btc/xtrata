# Xtrata v3.2.2 Mainnet Handover Runbook

This runbook defines the controlled mainnet handover from the current live
Xtrata core (`xtrata-v2-1-0`) to the new `xtrata-v3.2.2` contract.

The goal is to keep the process automated and repeatable while requiring
explicit operator approval before any mainnet write transaction is broadcast.

## Scope

Target contracts:

- Current live core: `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0`
- New core: `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-2`

Deployment/admin signer:

- Wallet: `Xtrata.btc` in Xverse
- Address: `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X`

Mainnet signing must be performed through Xverse wallet prompts. The mainnet
handover must not require pasting the `Xtrata.btc` seed phrase, mnemonic,
private key, or encrypted mnemonic into terminal or repo files.

## Differences From v3.2.1

`xtrata-v3.2.2` differs from `xtrata-v3.2.1` only in migration scope:

- `migrate-from-v2-1-1` has been removed. `xtrata-v2-1-1` was never deployed
  to mainnet; the function was dead code.
- All inscription, upload, and sealing logic is identical to the v3.2.1 release
  that was tested on-chain.

There is no v2-1-1 deployment dependency for this handover.

## Protocol Decisions Preserved

- `xtrata-v3.2.2` uses fixed 16 KiB chunks.
- Core upload payload ABI supports `(list 32 (buff 16384))`.
- App tooling may keep a 30 chunk practical policy for wallet and RPC safety.
- `HashToId` is advisory first-seen lookup only.
- Duplicate same-hash mints are allowed and should mint distinct token IDs.
- Parents and dependencies remain separate relationship concepts.
- `set-next-id` is one-shot and must run before any native v3.2.2 mint if ID
  continuity is required.

## Safety Model

Mainnet automation supports three modes:

1. `preflight`: read-only state check and report generation.
2. `verify`: post-deploy source hash verification against a transaction ID.
3. `ui`: runs preflight then serves the Xverse-connected handover UI.

The handover UI disables all action buttons when:

- the wallet is not connected or the wrong address is connected;
- the preflight report has failures;
- `setNextIdReady` is false (live core not yet paused).

## Required Preflight Reads

Before any mainnet write, the automation reads:

Legacy cores:

- `xtrata-v1-1-1` `get-next-token-id` and `get-last-token-id`
- `xtrata-v2-1-0` `get-next-token-id`, `get-last-token-id`, `is-paused`, `get-admin`

New v3.2.2 core (once deployed):

- `get-contract-info` (used to detect whether the contract exists)
- `get-admin`
- `is-paused`
- `get-next-token-id`
- `get-minted-count`
- `get-royalty-recipient`

The report includes raw read results, proposed next ID, source hash, and a
`launchReady` flag that must be `true` before unpausing.

## Next-ID Rule

The handover script computes a proposed v3.2.2 starting ID across every
migratable legacy line:

```text
proposed_next_id = max(
  v1_1_1_get_next_token_id,
  v1_1_1_get_last_token_id + 1,
  v2_1_0_get_next_token_id,
  v2_1_0_get_last_token_id + 1
)
```

The script prints each source value and the computed value. This prevents
native v3.2.2 mints from occupying IDs that a not-yet-migrated legacy token
may need later.

`set-next-id` is blocked (`setNextIdReady=false`) unless:

- the current live core is confirmed paused in the latest preflight report;
- v3.2.2 `get-next-token-id` is `u0`;
- v3.2.2 `get-minted-count` is `u0`.

## Handover Sequence

The intended write sequence is:

1. Deploy `xtrata-v3-2-2` from `contracts/live/xtrata-v3.2.2.clar` through
   Xverse as **Clarity 3**. No dependency contracts are required.

2. Verify the deployed transaction:

   ```sh
   npm run mainnet:v3.2.2:verify -- 0x<txid>
   ```

3. Pause the current live core:

   ```clarity
   (contract-call? .xtrata-v2-1-0 set-paused true)
   ```

4. Wait for the pause transaction to confirm.

5. Rerun the mainnet preflight to get the post-pause next ID:

   ```sh
   npm run mainnet:v3.2.2:preflight
   ```

   The `set-next-id` value must come from this post-pause report, not from a
   pre-pause report.

6. Set the one-shot v3.2.2 next ID:

   ```clarity
   (contract-call? .xtrata-v3-2-2 set-next-id u<computed-next-id>)
   ```

7. Set the v3.2.2 royalty recipient:

   ```clarity
   (contract-call? .xtrata-v3-2-2 set-royalty-recipient '<recipient>)
   ```

8. Rerun preflight. Confirm `launchReady=true`. Unpause v3.2.2:

   ```clarity
   (contract-call? .xtrata-v3-2-2 set-paused false)
   ```

9. Mint the announcement inscription:

   - Source: `docs/mainnet-v3.2.2-announcement-inscription.md`
   - MIME: `text/markdown`
   - Route: `mint-single-tx` (file is well within the single-transaction limit)

10. Verify the announcement token:

    - token ID equals the expected first v3.2.2 native ID;
    - byte reconstruction matches the local announcement file;
    - final Xtrata rolling hash matches;
    - `get-id-by-hash` returns the announcement token ID.

## Suggested Commands

```sh
npm run mainnet:v3.2.2:preflight
npm run mainnet:v3.2.2:verify -- 0x<txid>
npm run mainnet:v3.2.2:handover-ui
npm run mainnet:v3.2.2:report
```

The preflight command is read-only. The UI requires Xverse and will not
broadcast without an explicit wallet signature per step.

## Required Environment

Mainnet secrets must stay out of git, docs, committed `.env` files, shell
profiles, and chat.

Recommended configuration:

```sh
export XTRATA_MAINNET_API_URL=https://api.hiro.so
export XTRATA_MAINNET_HIRO_API_KEY=<hiro-api-key>
export XTRATA_DEPLOYER=SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X
export XTRATA_ROYALTY_RECIPIENT=<mainnet-royalty-address>
```

For write transactions, use Xverse wallet prompts from the local handover UI.
Do not use raw keys or mnemonics for mainnet deployment.

## Report Output

The automation writes:

- `reports/mainnet-v3.2.2-handover.md`
- `reports/mainnet-v3.2.2-handover.json`

The report includes:

- network;
- core contract ID and Clarity version;
- source path, SHA-256, and byte count;
- legacy next/last token IDs and continuity candidates;
- recommended next ID;
- deployment status;
- preflight read results;
- announcement inscription pre-computation (bytes, chunks, hash, chunk hex);
- `deployReady`, `setNextIdReady`, `launchReady` flags;
- warnings and failures.

## Source Hash Verification

After deploying through Xverse, run:

```sh
npm run mainnet:v3.2.2:verify -- 0x<txid>
```

This fetches the transaction from the Hiro API and compares:

- `tx_status === 'success'`
- `tx_type === 'smart_contract'`
- `clarity_version === 3`
- `contract_id === SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-2`
- SHA-256 of deployed source matches local `contracts/live/xtrata-v3.2.2.clar`

## Rollback And Recovery Notes

Contracts cannot be undeployed and sealed inscriptions cannot be edited.

The practical recovery options are:

- If old core pause succeeds but v3.2.2 setup fails before launch, unpause the
  old core after diagnosing the failure.
- If `set-next-id` succeeds but announcement mint fails, keep v3.2.2 paused
  until the cause is understood, then resume the handover.
- If the announcement mint succeeds, treat v3.2.2 as live and continue with app,
  SDK, resolver, and documentation updates.

## Manual Sign-Off Checklist

Before broadcast:

- [ ] Preflight report has no failures.
- [ ] Source hash verified against `contracts/live/xtrata-v3.2.2.clar`.
- [ ] Live core contract ID confirmed as `xtrata-v2-1-0`.
- [ ] New core contract ID confirmed as `xtrata-v3-2-2`.
- [ ] Admin address confirmed.
- [ ] Royalty recipient confirmed.
- [ ] Computed next ID reviewed.
- [ ] Announcement inscription text approved.
- [ ] Operator has enough STX for deployment and admin transactions.

After broadcast:

- [ ] Old live core is paused.
- [ ] v3.2.2 has the expected next ID.
- [ ] v3.2.2 is unpaused.
- [ ] Announcement inscription reconstructs exactly.
- [ ] App/SDK defaults updated to use v3.2.2.
- [ ] Final mainnet handover report committed or archived.
