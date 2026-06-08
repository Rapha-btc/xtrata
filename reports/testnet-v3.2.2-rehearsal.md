# Xtrata v3.2.2 Testnet Rehearsal

Generated: 2026-06-07T20:53:08.403Z

## Summary

- Network: testnet
- Mode: dry-run
- API URL: https://api.testnet.hiro.so
- Hiro API key: not configured
- Deployer: not configured
- Contract address: ST000000000000000000002AMW42H
- Recommendation: not ready

## Contracts

| Key | Contract | Source | Deploy tx |
|---|---|---|---|
| v1_1_1 | ST000000000000000000002AMW42H.xtrata-v1-1-1 | contracts/other/xtrata-v1.1.1.clar |  |
| v2_1_0 | ST000000000000000000002AMW42H.xtrata-v2-1-0 | contracts/other/xtrata-v2.1.0.clar |  |
| core | ST000000000000000000002AMW42H.xtrata-v3-2-2 | contracts/other/xtrata-v3.2.2.clar |  |
| helper | ST000000000000000000002AMW42H.xtrata-small-mint-v1-1 | contracts/other/xtrata-small-mint-v1.1.clar |  |

## Commands

```sh
npm run contracts:sync
npm run contracts:verify
npm --prefix contracts/clarinet exec -- clarinet deployments generate --testnet --manual-cost
npm --prefix contracts/clarinet exec -- clarinet deployments apply --testnet --no-dashboard --use-on-disk-deployment-plan
npm run testnet:v3.2.2:rehearsal -- --broadcast
```

## Transactions

| Label | Status | Tx ID | Block | Fee |
|---|---|---|---:|---:|


## Test Cases

| Test | Status | Token IDs / Notes |
|---|---|---|


## Reconstruction

| Token | Status | Bytes | Chunks | Verified | Cache |
|---|---|---:|---:|---|---|


## Warnings

- Dry-run mode only. Add --broadcast plus testnet keys to submit transactions.
- Clarinet deployment remains the preferred path for source/trait selection. This script deploy mode uses contracts/other testnet variants when --broadcast is supplied.

## Failures

- ENOENT: no such file or directory, open '/Users/melophonic/Documents/GitHub/xtrata/contracts/other/xtrata-v1.1.1.clar'
