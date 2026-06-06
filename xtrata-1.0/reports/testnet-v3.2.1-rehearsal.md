# Xtrata v3.2.1 Testnet Rehearsal

Generated: 2026-06-06T00:44:30.265Z

## Summary

- Network: testnet
- Mode: broadcast
- API URL: https://api.testnet.hiro.so
- Hiro API key: configured
- Deployer: STRNRHWSD7REAEXVTHDQWKPD4MFBG41024WQKBBM
- Contract address: STRNRHWSD7REAEXVTHDQWKPD4MFBG41024WQKBBM
- Recommendation: ready for mainnet

## Contracts

| Key | Contract | Source | Deploy tx |
|---|---|---|---|
| v1_1_1 | STRNRHWSD7REAEXVTHDQWKPD4MFBG41024WQKBBM.xtrata-v1-1-1 | contracts/other/xtrata-v1.1.1.clar |  |
| v2_1_0 | STRNRHWSD7REAEXVTHDQWKPD4MFBG41024WQKBBM.xtrata-v2-1-0 | contracts/other/xtrata-v2.1.0.clar |  |
| v2_1_1 | STRNRHWSD7REAEXVTHDQWKPD4MFBG41024WQKBBM.xtrata-v2-1-1 | contracts/other/xtrata-v2.1.1.clar |  |
| core | STRNRHWSD7REAEXVTHDQWKPD4MFBG41024WQKBBM.xtrata-v3-2-1 | contracts/other/xtrata-v3.2.1.clar |  |
| helper | STRNRHWSD7REAEXVTHDQWKPD4MFBG41024WQKBBM.xtrata-small-mint-v1-1 | contracts/other/xtrata-small-mint-v1.1.clar |  |

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
| core set royalty recipient | success | ee6cd0ea66c25984663872b7e5a4c1d00662b8515f7e04b7c18854f465be2189 | 4005488 | 1000000 |
| core unpause | success | ed810c595ed61dae8871f8428eb18f0ee3319abe4692a9952c70cc8e33826ce9 | 4005489 | 1000000 |
| helper point at testnet core | success | 1a22788fc32aa76cef7e6a214813119313084f199e663deee1b12348f2911cbc | 4005491 | 1000000 |
| helper unpause | success | 3c569a6c8dff21b43116dc109284cc7cb825d8a8f3ebc71e791a21f44979220f | 4005493 | 1000000 |
| v2.1.0 unpause | success | 0b6b2d3358175ab3558589c90d9876200081368fcc202dd41be79e9221414619 | 4005495 | 1000000 |
| v2.1.1 unpause | success | dca1be03640685f7da2beeb2164dce6adb81f723bb9672b01b590e0b4599e6ef | 4005497 | 1000000 |
| direct mint data:text/plain,xtrata-v3.2.1-testnet-rehearsal,remaining-dep-source (1 chunks) | success | 2fa9e8d1e0fb571b9e8d09f39d0b97051b49894c83716b1f59ed89de481d285b | 4005500 | 1000000 |
| direct mint data:text/plain,xtrata-v3.2.1-testnet-rehearsal,remaining-parent-owned (1 chunks) | success | b182f5c89624fa41d346d8f6f860b552e74c32183afeff7258b815a19604ff29 | 4005501 | 1000000 |
| direct mint data:text/plain,xtrata-v3.2.1-testnet-rehearsal,remaining-dep-linked (1 chunks) | success | de439756cdc102198b30cc76df709d7f26e2440c35eebff1e738507f2184735a | 4005502 | 1000000 |
| remaining parent link to another wallet token expected failure | abort_by_response | 43e2e133c53ea5a2252fe91a91bd688953888c99d667349d955ed62e15e8e63e | 4005503 | 1000000 |
| direct mint data:text/plain,xtrata-v3.2.1-testnet-rehearsal,remaining-parent-linked (1 chunks) | success | aec676b5ad0c5505fbdf3cb7e6a01be6a0def5ce5d809c2339ab6fbd9e8f9259 | 4005505 | 1000000 |
| legacy begin xtrata-v2-1-0 data:text/plain,xtrata-v3.2.1-testnet-rehearsal,remaining-v210 | success | c8ae9f5120bc818c7f2fa75186635392a2ac08f4237f096b8c410b66ce148f46 | 4005506 | 1000000 |
| legacy add xtrata-v2-1-0 data:text/plain,xtrata-v3.2.1-testnet-rehearsal,remaining-v210 | success | d35296532e9bd6236f1126fe891b1b0126d1f11cbed9a1a1fccfc650aa139005 | 4005508 | 1000000 |
| legacy seal xtrata-v2-1-0 data:text/plain,xtrata-v3.2.1-testnet-rehearsal,remaining-v210 | success | add5b440aa94a98244b04d1b1aaab42112d5d2d2371fd258e5a3316ecd7ba74e | 4005509 | 1000000 |
| remaining migrate v2.1.0 token | success | 793688ca7476c4645035d5f918788204191ba8635dfe15bca4be078ed499666d | 4005511 | 1000000 |
| remaining duplicate migrate v2.1.0 token expected failure | abort_by_response | 6513d7796ac9c558841a601b20806105f6b87abccfad3393d31b87bdc19cba63 | 4005512 | 1000000 |
| legacy begin xtrata-v2-1-1 data:text/plain,xtrata-v3.2.1-testnet-rehearsal,remaining-v211 | success | 4a2fca3f4d5b52c1f066035e7addf16c24417fce6a657eb6afdc458b4b743180 | 4005513 | 1000000 |
| legacy add xtrata-v2-1-1 data:text/plain,xtrata-v3.2.1-testnet-rehearsal,remaining-v211 | success | 2e6378f933bab804181555867b5a863ab2fe8500cc1d78edc1b1e9a1bfa4eed6 | 4005515 | 1000000 |
| legacy seal xtrata-v2-1-1 data:text/plain,xtrata-v3.2.1-testnet-rehearsal,remaining-v211 | success | d403e7813cfe6bb6f41c6362b703713cad1d47544658643ec39de64d84fb6f09 | 4005516 | 1000000 |
| remaining migrate v2.1.1 token | success | 625d473eafde86596ccfe9215ef6aef4408670d7b2718defde8e70bc3ac96aa8 | 4005517 | 1000000 |
| remaining duplicate migrate v2.1.1 token expected failure | abort_by_response | 38eb2f32b739745df32ae809c6fc297dbb16de3985ccef87be7236144179d109 | 4005518 | 1000000 |

## Test Cases

| Test | Status | Token IDs / Notes |
|---|---|---|
| direct single-call 32 chunks | passed | Already passed in an earlier broadcast smoke run; skipped here to avoid repeating large testnet transactions. |
| staged 33 chunks as 32 + 1 | passed | Already passed in an earlier broadcast smoke run; skipped here to avoid repeating large testnet transactions. |
| advisory dedupe duplicate same-hash mints | passed | Already passed in an earlier broadcast smoke run; skipped here to avoid repeating large testnet transactions. |
| dependency on another wallet token succeeds | passed | token 25 |
| parent link to another wallet token fails | passed | mint-single-tx-with-relationships rejects parent tokens not owned by tx-sender. |
| parent link to owned token succeeds and relationship lists remain separate | passed | token 26 |
| migration from v2.1.0 | passed | token 9000 |
| migration from v2.1.1 | passed | token 9010 |
| duplicate migration rejected | passed | Second migrate-from-v2-1-x call for the same token id fails. |

## Reconstruction

| Token | Status | Bytes | Chunks | Verified | Cache |
|---|---|---:|---:|---|---|
| 9000 |  | 91 | 1 | true | No testnet resolver cache adapter is configured in this CLI rehearsal. |

## Warnings

- v2.1.0 migration base setup skipped or failed: Transaction ba1fe760c84413d8176213fe06e8e500168c9bcb3d6b3e8a2654d0963f82d055 failed: abort_by_response (err u115)
- v2.1.1 migration base setup skipped or failed: Transaction b530d77594571339be32a1b06ccc3d584f5f88024c09f6ab0c85bf21a2549f30 failed: abort_by_response (err u115)

## Failures

- None
