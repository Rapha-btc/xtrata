# Xtrata v3.2.1 Testnet Deployment and Rehearsal

This runbook is for the v3.2.1 testnet candidate:

- `xtrata-v3.2.1`
- `xtrata-small-mint-v1.1`
- test-only `xtrata-v2.1.0` and `xtrata-v2.1.1` when migration rehearsal is required

The core contract remains fixed at 16 KiB chunks and `(list 32 (buff 16384))` upload payloads. The app/helper policy can still cap normal uploads at 30 chunks for wallet/RPC safety. `HashToId` is advisory first-seen lookup only; duplicate same-hash mints are expected to create new token IDs.

## Local Source Sync

Run this before generating a deployment plan:

```sh
npm run contracts:sync
npm run contracts:verify
```

`contracts/clarinet/Clarinet.toml` already registers the candidate and rehearsal contracts:

- `xtrata-v3-2-1`
- `xtrata-small-mint-v1-1`
- `xtrata-v2-1-0`
- `xtrata-v2-1-1`

The testnet variant for `xtrata-v3.2.1` uses the testnet SIP-009 trait principal. The local Clarinet variant uses the local trait.

## Deployment

Configure the deployer in `contracts/clarinet/settings/Testnet.toml`. Prefer an encrypted deployment mnemonic:

```sh
npm --prefix contracts/clarinet exec -- clarinet deployments encrypt
```

Generate and apply the testnet deployment plan:

```sh
npm --prefix contracts/clarinet exec -- clarinet deployments generate --testnet --manual-cost
npm --prefix contracts/clarinet exec -- clarinet deployments apply --testnet --no-dashboard --use-on-disk-deployment-plan
```

The npm deployment wrapper is available for repeatable dry-run/broadcast rehearsals, but Clarinet deployment plans remain the preferred source-of-truth path:

```sh
npm run testnet:v3.2.1:deploy
npm run testnet:v3.2.1:deploy -- --broadcast
```

Broadcast mode can use one disposable Leather testnet secret key/mnemonic and derive the three rehearsal accounts locally:

```sh
export XTRATA_TESTNET_MNEMONIC='<12-or-24-word-testnet-only-secret-key>'
export XTRATA_TESTNET_DEPLOYER_INDEX=0
export XTRATA_TESTNET_WALLET_A_INDEX=1
export XTRATA_TESTNET_WALLET_B_INDEX=2
```

Keep this in your terminal session only. Do not commit it to `.env`, TOML, shell profiles, docs, or chat. Use a testnet-only wallet with no mainnet funds.

If you have account-level hex private keys, those still work and override mnemonic-derived keys:

```sh
export XTRATA_TESTNET_DEPLOYER_KEY=<hex-private-key>
export XTRATA_TESTNET_WALLET_A_KEY=<hex-private-key>
export XTRATA_TESTNET_WALLET_B_KEY=<hex-private-key>
```

Optional:

```sh
export XTRATA_TESTNET_API_URL=https://api.testnet.hiro.so
export XTRATA_TESTNET_CONTRACT_ADDRESS=<deployed-testnet-address>
export XTRATA_TESTNET_ROYALTY_RECIPIENT=<testnet-address>
export XTRATA_TESTNET_NEXT_ID_OFFSET=<uint>
export XTRATA_TESTNET_MIGRATION_BASE_ID=9000
```

The script writes the derived testnet addresses and account indexes into the rehearsal report, but never writes private keys or mnemonics.

## Post-Deploy Admin Setup

Run these before the smoke/rehearsal transactions. The rehearsal script performs these setup calls automatically in `smoke` and `rehearsal` modes.

1. Set the royalty recipient on `xtrata-v3-2-1`:

   ```clarity
   (contract-call? .xtrata-v3-2-1 set-royalty-recipient '<recipient>)
   ```

2. Set the v3.2.1 next-id offset only if legacy ID continuity is required:

   ```clarity
   (contract-call? .xtrata-v3-2-1 set-next-id u<next-id>)
   ```

   `set-next-id` is one-shot. It must be called before any native v3.2.1 mint. It fails after the offset has been set, after `next-id` is no longer `u0`, or after any mint has incremented `minted-count`.

3. Unpause `xtrata-v3-2-1`:

   ```clarity
   (contract-call? .xtrata-v3-2-1 set-paused false)
   ```

4. Point `xtrata-small-mint-v1-1` at the deployed testnet core:

   ```clarity
   (contract-call? .xtrata-small-mint-v1-1 set-core-contract '<deployer>.xtrata-v3-2-1)
   ```

   The helper source default is the mainnet core principal. This testnet setup call is required before helper mints.

5. Unpause `xtrata-small-mint-v1-1`:

   ```clarity
   (contract-call? .xtrata-small-mint-v1-1 set-paused false)
   ```

6. If migration rehearsal uses freshly deployed test-only v2 contracts, unpause them:

   ```clarity
   (contract-call? .xtrata-v2-1-0 set-paused false)
   (contract-call? .xtrata-v2-1-1 set-paused false)
   ```

7. Allowed callers are not required while unpaused. If the core is intentionally paused and a helper/indexer must continue writing, allow that contract principal explicitly:

   ```clarity
   (contract-call? .xtrata-v3-2-1 set-allowed-caller '<caller-contract> true)
   ```

## Rehearsal Commands

Dry-run:

```sh
npm run testnet:v3.2.1:rehearsal
```

Broadcast smoke/rehearsal after deployment and funding:

```sh
npm run testnet:v3.2.1:smoke -- --broadcast
npm run testnet:v3.2.1:reconstruct -- --broadcast
npm run testnet:v3.2.1:report
```

Combined deploy plus smoke broadcast:

```sh
npm run testnet:v3.2.1:rehearsal -- --broadcast
```

Use the combined command only when the deployment keys, target address, and contract names are intentionally fresh. For an existing Clarinet deployment, set `XTRATA_TESTNET_CONTRACT_ADDRESS` and run `smoke` instead of redeploying.

## Rehearsal Coverage

The script records Markdown and JSON reports under:

- `reports/testnet-v3.2.1-rehearsal.md`
- `reports/testnet-v3.2.1-rehearsal.json`

Covered paths:

- direct single-call mint: 1 byte, 1 full chunk, 30 chunks, 32 chunks
- small-mint helper: 1 byte, 30 chunks, expected rejection for 33 chunks
- staged upload: 33 chunks as 32 + 1, 64 chunks as 32 + 32
- advisory dedupe: wallet A and wallet B mint identical bytes; `get-id-by-hash` should remain first-seen
- relationship split: dependency on another wallet succeeds, parent link to another wallet fails, parent link to owned token succeeds
- migration rehearsal: v2.1.0 and v2.1.1 mint/migrate paths, migration source reads, duplicate migration rejection
- reconstruction: `get-inscription-summary`, `get-chunk-batch`, exact byte reconstruction, rolling hash verification

The report includes network, deployer, contract IDs, tx IDs, block heights, observed fees when broadcast, token IDs, sizes, chunk counts, hashes, reconstruction result, cache status, warnings, failures, and an explicit recommendation.

## Mainnet Readiness Gate

Treat dry-run output as a planning artifact only. A mainnet recommendation requires a broadcast testnet pass with:

- no unexpected transaction failures
- expected negative cases recorded as failed/aborted transactions
- 32-chunk direct core mint confirmed
- 33- and 64-chunk staged reconstructions verified byte-for-byte
- duplicate same-hash mint confirmed with two token IDs and first-seen `HashToId`
- v2.1.0 and v2.1.1 migration rehearsal confirmed
