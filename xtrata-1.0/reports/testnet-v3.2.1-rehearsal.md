# Xtrata v3.2.1 Testnet Rehearsal

Generated: 2026-06-06T13:04:05.378Z

## Summary

- Network: testnet
- Mode: broadcast
- API URL: https://api.testnet.hiro.so
- Hiro API key: configured
- Deployer: ST30X7KJ5R4ZKTG5FBS5RQTH3CC3DNNDP99XRWFE8
- Contract address: ST30X7KJ5R4ZKTG5FBS5RQTH3CC3DNNDP99XRWFE8
- Recommendation: ready for mainnet

## Contracts

| Key | Contract | Source | Deploy tx |
|---|---|---|---|
| v1_1_1 | ST30X7KJ5R4ZKTG5FBS5RQTH3CC3DNNDP99XRWFE8.xtrata-v1-1-1 | contracts/other/xtrata-v1.1.1.clar | 20b568a8e4ea778a10c54ddb20e088450d54ab4a25c894f9acd46b000b785715 |
| v2_1_0 | ST30X7KJ5R4ZKTG5FBS5RQTH3CC3DNNDP99XRWFE8.xtrata-v2-1-0 | contracts/other/xtrata-v2.1.0.clar | 2e1bfecbf51fdc10cccd1448ff3573ba49091a01af68f3467f0a8d60f4e15a5d |
| v2_1_1 | ST30X7KJ5R4ZKTG5FBS5RQTH3CC3DNNDP99XRWFE8.xtrata-v2-1-1 | contracts/other/xtrata-v2.1.1.clar | 8b6922edaeb1f663926c1364f049e3bb1e65e28bc245f9003558bf926f54ccc0 |
| core | ST30X7KJ5R4ZKTG5FBS5RQTH3CC3DNNDP99XRWFE8.xtrata-v3-2-1 | contracts/other/xtrata-v3.2.1.clar | 12e7e529f4f5e7f3088c4882123a1fe926f1a777b0a5899ce73f4894288fd9e5 |
| helper | ST30X7KJ5R4ZKTG5FBS5RQTH3CC3DNNDP99XRWFE8.xtrata-small-mint-v1-1 | contracts/other/xtrata-small-mint-v1.1.clar | 4a1c29fcba802d403913e4e9c9d20772470192a20ce7e3a4a28cb8685450da7e |

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
| deploy xtrata-v1-1-1 | success | 20b568a8e4ea778a10c54ddb20e088450d54ab4a25c894f9acd46b000b785715 | 4005942 | 1000000 |
| deploy xtrata-v2-1-0 | success | 2e1bfecbf51fdc10cccd1448ff3573ba49091a01af68f3467f0a8d60f4e15a5d | 4005944 | 1000000 |
| deploy xtrata-v2-1-1 | success | 8b6922edaeb1f663926c1364f049e3bb1e65e28bc245f9003558bf926f54ccc0 | 4005945 | 1000000 |
| deploy xtrata-v3-2-1 | success | 12e7e529f4f5e7f3088c4882123a1fe926f1a777b0a5899ce73f4894288fd9e5 | 4005946 | 1000000 |
| deploy xtrata-small-mint-v1-1 | success | 4a1c29fcba802d403913e4e9c9d20772470192a20ce7e3a4a28cb8685450da7e | 4005947 | 1000000 |
| core set royalty recipient | success | 99ebeabcad8800f6df6f257f063fcac68c7ee6e5129d7f591243915844cf045e | 4005948 | 1000000 |
| core unpause | success | d46368b5fda9809ea54caf542d245b8305dd5309bfe5343a099f8988aa2df2df | 4005949 | 1000000 |
| helper point at testnet core | success | 8c6e0071c2590af4b526db058e322c59e5d637e29d901b883df43b0fdc0df190 | 4005950 | 1000000 |
| helper unpause | success | 53992b5eb2717623aff14b64eac0b529897cdfc4ca6e2eb954edbf95a054d077 | 4005953 | 1000000 |
| v2.1.0 unpause | success | 224b1c8f0cc9271095c536b971ba768e09686cee2483cbc9c8b8907e26035a32 | 4005954 | 1000000 |
| v2.1.1 unpause | success | 2db1eca7fa1638efc6b76783018663877d58bc4786120f49a9de9307bc9d088d | 4005955 | 1000000 |
| v2.1.0 set migration base 9000 | success | f13f3f586c7e5d3d85abca63a7084c2419fe1757a931c514da0d0a0486ce7f4c | 4005956 | 1000000 |
| v2.1.1 set migration base 9010 | success | a50dfab3349bb8e7e6e01dcec5f6374ca642989d139c69c14da68168aebe6dcc | 4005957 | 1000000 |
| direct mint data:text/plain,xtrata-v3.2.1-testnet-rehearsal,direct single-call 1-byte (1 chunks) | success | 1f52fc18dcd00c2676ea208250f8381e765bcc6828dcfe002e678ce658626415 | 4005958 | 1000000 |
| direct mint data:text/plain,xtrata-v3.2.1-testnet-rehearsal,direct single-call 1 full chunk (1 chunks) | success | d744cd8659382703c155a692c90609f8d3bd41eb26adc033b9cd235da52f1cf7 | 4005961 | 1000000 |
| direct mint data:text/plain,xtrata-v3.2.1-testnet-rehearsal,direct single-call 30 chunks (30 chunks) | success | c4c22bf03d43e3bd4a798cf37fe39682ee9e626faabe6d2e726c9ff3a0b6fe8f | 4005962 | 1000000 |
| direct mint data:text/plain,xtrata-v3.2.1-testnet-rehearsal,direct single-call 32 chunks (32 chunks) | success | cd6ee0fbac48cadec622ae30893536bd50d325d1dc534e36bce3f78ce2e20e76 | 4005964 | 1000000 |
| helper mint data:text/plain,xtrata-v3.2.1-testnet-rehearsal,helper-1-byte (1 chunks) | success | 3aed59eadf4ed430dc450a0be7bc12cf02124fbced9aa8e73c641dee1a0029d5 | 4005965 | 1000000 |
| helper mint data:text/plain,xtrata-v3.2.1-testnet-rehearsal,helper-policy-30 (30 chunks) | success | e2f20f2845e1fa697edca5f9436f6754e8ecaf5eedfa1417a5cd54b479a96a89 | 4005967 | 1000000 |
| helper oversized 33 chunks expected failure | expected-broadcast-rejection |  |  |  |
| staged begin data:text/plain,xtrata-v3.2.1-testnet-rehearsal,staged-33 | success | 2db615a65245007806907ea4de87ec567a2f43ca291abbe8d2650ea7773560be | 4005968 | 1000000 |
| staged add chunks data:text/plain,xtrata-v3.2.1-testnet-rehearsal,staged-33 0-31 | success | b89d4d76587be00b97b561c6282cd6e517d4d213e44e1b11710591f775ae1f35 | 4005969 | 1000000 |
| staged add chunks data:text/plain,xtrata-v3.2.1-testnet-rehearsal,staged-33 32-32 | success | a8df4d234746920e3e0f41344401c136678ed5a2e65e08bb9f6853f23af0c94c | 4005972 | 1000000 |
| staged seal data:text/plain,xtrata-v3.2.1-testnet-rehearsal,staged-33 | success | f0edda30af92b531a79706f986fbcff56795a2f6d897eb8c0fe589a745fcf7ac | 4005974 | 1000000 |
| staged begin data:text/plain,xtrata-v3.2.1-testnet-rehearsal,staged-64 | success | 888676f462111c2823afdc89dd52c289e7f2b93bca7dfa1879aac4fd788620eb | 4005975 | 1000000 |
| staged add chunks data:text/plain,xtrata-v3.2.1-testnet-rehearsal,staged-64 0-31 | success | bbe72fb5dc190bd90146fed8c35acfda62cf66d43078113296ad3d465d9ac3b7 | 4005976 | 1000000 |
| staged add chunks data:text/plain,xtrata-v3.2.1-testnet-rehearsal,staged-64 32-63 | success | 6a14b73ea972e36a8d826f6c26c298a7df6013c7ae69329f74c6aeb06666e8e3 | 4005977 | 1000000 |
| staged seal data:text/plain,xtrata-v3.2.1-testnet-rehearsal,staged-64 | success | c2ad335ed3e8e91b7d534ed1490e6e13019645ef5d943d4782271ac0240a9b4d | 4005978 | 1000000 |
| direct mint data:text/plain,xtrata-v3.2.1-testnet-rehearsal,dedupe-a (1 chunks) | success | a83ac7b204b41bc6be9a493dfdced5ca89fd2f81e715512ac90f2cf04465a565 | 4005979 | 1000000 |
| direct mint data:text/plain,xtrata-v3.2.1-testnet-rehearsal,dedupe-b (1 chunks) | success | e2e3630e5aaf317e2f5e1bfa4788eafe9d1568bc8305985b96a82b3ba43a12a7 | 4005980 | 1000000 |
| direct mint data:text/plain,xtrata-v3.2.1-testnet-rehearsal,dep-source (1 chunks) | success | 4ae442518b730839b0dec6eaa79d9d144528bcb7e507009f7229d9c63efea575 | 4005982 | 1000000 |
| direct mint data:text/plain,xtrata-v3.2.1-testnet-rehearsal,parent-owned (1 chunks) | success | 6b41460eb10cb0e66c7d7d07463baa7d61b2965cfd3fe0efe3aa3b36093b290a | 4005983 | 1000000 |
| direct mint data:text/plain,xtrata-v3.2.1-testnet-rehearsal,dep-linked (1 chunks) | success | 61bdcb5372263b15a33f20d5518350b1246d40fede45b00a42748e204e771519 | 4005984 | 1000000 |
| parent link to another wallet token expected failure | abort_by_response | 483fc63e91423257538f2c85172ec505589fbccd324a78381c6f7cd37bbee598 | 4005985 | 1000000 |
| direct mint data:text/plain,xtrata-v3.2.1-testnet-rehearsal,parent-linked (1 chunks) | success | 0dd76148da97e7ea6ba7f73c8775b8452b5d8391f9e7281d8b67653d968b1b8a | 4005986 | 1000000 |
| legacy begin xtrata-v2-1-0 data:text/plain,xtrata-v3.2.1-testnet-rehearsal,v210 | success | bd250a5d94cfe97c8b42116c61003f006f39c3e6217a49105534fcba9399d90b | 4005987 | 1000000 |
| legacy add xtrata-v2-1-0 data:text/plain,xtrata-v3.2.1-testnet-rehearsal,v210 | success | e201f872a145ae4386b9b187edb1b34977f76eb6d183d01efb20777703b9497e | 4005988 | 1000000 |
| legacy seal xtrata-v2-1-0 data:text/plain,xtrata-v3.2.1-testnet-rehearsal,v210 | success | af9b55cf46230625e28d7afd2fe8fd3469ea00e8f7ca0e376751b73ba54d7bbc | 4005991 | 1000000 |
| migrate v2.1.0 token | success | d1f51cd1d062814e3a8373c5ea53ea4018fe0cc9416d6e5a20d016bc776ac4a9 | 4005993 | 1000000 |
| duplicate migrate v2.1.0 token expected failure | abort_by_response | 7e6505f6fa02e4d824d74c189ff548bd5042442fff4067208bc703bedf15617b | 4005994 | 1000000 |
| legacy begin xtrata-v2-1-1 data:text/plain,xtrata-v3.2.1-testnet-rehearsal,v211 | success | 7b6e140157f523a0e15d09b0ffea5b81cbb33ebc6ff788363e8977ad888c21f2 | 4005995 | 1000000 |
| legacy add xtrata-v2-1-1 data:text/plain,xtrata-v3.2.1-testnet-rehearsal,v211 | success | ea247532c6638d5468f5f74ca0373a8b54e50dadf119c6f3c57fe6229e40015f | 4005996 | 1000000 |
| legacy seal xtrata-v2-1-1 data:text/plain,xtrata-v3.2.1-testnet-rehearsal,v211 | success | a78a154fdfcc716ee5d4bff834bbe57b8425bddf563c639595805aaf18a4cb8a | 4005997 | 1000000 |
| migrate v2.1.1 token | success | b456e348f51e0546255e9516d56e245430aa37d2968499a0776f21666a67c942 | 4005998 | 1000000 |
| duplicate migrate v2.1.1 token expected failure | abort_by_response | 57b4ee570ac85f86487f0c82e0dc0af02af79dce218b494423951fe6091061fe | 4006000 | 1000000 |

## Test Cases

| Test | Status | Token IDs / Notes |
|---|---|---|
| direct single-call 1-byte | passed | token 0; 1 chunks; evidence confirmed-on-chain |
| direct single-call 1 full chunk | passed | token 1; 1 chunks; evidence confirmed-on-chain |
| direct single-call 30 chunks | passed | token 2; 30 chunks; evidence confirmed-on-chain |
| direct single-call 32 chunks | passed | token 3; 32 chunks; evidence confirmed-on-chain |
| helper 1-byte | passed | token 4; 1 chunks; evidence confirmed-on-chain |
| helper max app policy 30 chunks | passed | token 5; 30 chunks; evidence confirmed-on-chain |
| helper oversized 33 chunks rejected | passed | Rejected because helper contract ABI is list 32; official app policy remains 30.; evidence confirmed-on-chain |
| staged 33 chunks as 32 + 1 | passed | token 6; 33 chunks; evidence confirmed-on-chain |
| staged 64 chunks as 32 + 32 | passed | token 7; 64 chunks; evidence confirmed-on-chain |
| advisory dedupe duplicate same-hash mints | passed | A 8; B 9; first 8; evidence confirmed-on-chain |
| dependency on another wallet token succeeds | passed | token 12; evidence confirmed-on-chain |
| parent link to another wallet token fails | passed | mint-single-tx-with-relationships rejects parent tokens not owned by tx-sender.; evidence confirmed-on-chain |
| parent link to owned token succeeds and relationship lists remain separate | passed | token 13; evidence confirmed-on-chain |
| migration from v2.1.0 | passed | token 9000; evidence confirmed-on-chain |
| migration from v2.1.1 | passed | token 9010; evidence confirmed-on-chain |
| duplicate migration rejected | passed | Second migrate-from-v2-1-x call for the same token id fails.; evidence confirmed-on-chain |
| resume reconstruction with safe read batches | passed | Reconstructed previous staged and migrated tokens through direct map-entry reads.; evidence confirmed-on-chain |

## Reconstruction

| Token | Status | Bytes | Chunks | Verified | Cache |
|---|---|---:|---:|---|---|
| 6 |  | 540672 | 33 | true | No testnet resolver cache adapter is configured in this CLI rehearsal. |
| 9000 |  | 91 | 1 | true | No testnet resolver cache adapter is configured in this CLI rehearsal. |

## Warnings

- Fresh deployment mode: ignoring XTRATA_TESTNET_CONTRACT_ADDRESS and using the rotated deployer address as the contract namespace.
- Clarinet deployment remains the preferred path for source/trait selection. This script deploy mode uses contracts/other testnet variants when --broadcast is supplied.

## Failures

- None
