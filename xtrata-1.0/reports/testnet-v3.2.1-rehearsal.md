# Xtrata v3.2.1 Testnet Rehearsal

Generated: 2026-06-06T11:45:00.633Z

## Summary

- Network: testnet
- Mode: broadcast
- API URL: https://api.testnet.hiro.so
- Hiro API key: configured
- Deployer: ST1QJJVMB6NQBGMZQVDR22PADW2E3BEP61RQTFE7F
- Contract address: ST1QJJVMB6NQBGMZQVDR22PADW2E3BEP61RQTFE7F
- Recommendation: not ready

## Contracts

| Key | Contract | Source | Deploy tx |
|---|---|---|---|
| v1_1_1 | ST1QJJVMB6NQBGMZQVDR22PADW2E3BEP61RQTFE7F.xtrata-v1-1-1 | contracts/other/xtrata-v1.1.1.clar |  |
| v2_1_0 | ST1QJJVMB6NQBGMZQVDR22PADW2E3BEP61RQTFE7F.xtrata-v2-1-0 | contracts/other/xtrata-v2.1.0.clar |  |
| v2_1_1 | ST1QJJVMB6NQBGMZQVDR22PADW2E3BEP61RQTFE7F.xtrata-v2-1-1 | contracts/other/xtrata-v2.1.1.clar |  |
| core | ST1QJJVMB6NQBGMZQVDR22PADW2E3BEP61RQTFE7F.xtrata-v3-2-1 | contracts/other/xtrata-v3.2.1.clar |  |
| helper | ST1QJJVMB6NQBGMZQVDR22PADW2E3BEP61RQTFE7F.xtrata-small-mint-v1-1 | contracts/other/xtrata-small-mint-v1.1.clar |  |

## Commands

```sh
npm run contracts:sync
npm run contracts:verify
npm --prefix contracts/clarinet exec -- clarinet deployments generate --testnet --manual-cost
npm --prefix contracts/clarinet exec -- clarinet deployments apply --testnet --no-dashboard --use-on-disk-deployment-plan
npm run testnet:v3.2.1:rehearsal -- --broadcast
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

- Fresh deployment mode: ignoring XTRATA_TESTNET_CONTRACT_ADDRESS and using the rotated deployer address as the contract namespace.
- Clarinet deployment remains the preferred path for source/trait selection. This script deploy mode uses contracts/other testnet variants when --broadcast is supplied.

## Failures

- Transaction 4bcc1cf4b7bf1de1ab2d8b0af3eb077b70affd63fe6e36446c935ea973f75fb6 failed: abort_by_response (err none)
