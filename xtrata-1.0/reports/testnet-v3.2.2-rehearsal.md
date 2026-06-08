# Xtrata v3.2.2 Testnet Rehearsal

Generated: 2026-06-07T21:42:07.032Z

## Summary

- Network: testnet
- Mode: broadcast
- API URL: https://api.testnet.hiro.so
- Hiro API key: configured
- Deployer: ST1K773003ZPKN339KWKP8GCDW3YDR9KYQGR9A5BN
- Contract address: ST1K773003ZPKN339KWKP8GCDW3YDR9KYQGR9A5BN
- Recommendation: ready for mainnet

## Contracts

| Key | Contract | Source | Deploy tx |
|---|---|---|---|
| v1_1_1 | ST1K773003ZPKN339KWKP8GCDW3YDR9KYQGR9A5BN.xtrata-v1-1-1 | contracts/other/xtrata-v1.1.1.clar | a81a8a6282273e974f74d381c4288906f08b053a93098993d26dc2a3785a249e |
| v2_1_0 | ST1K773003ZPKN339KWKP8GCDW3YDR9KYQGR9A5BN.xtrata-v2-1-0 | contracts/other/xtrata-v2.1.0.clar | a2269cb0706f4aaaa6e9c144cd7f9714d157a51a42d386a8ff2252cc1accb671 |
| core | ST1K773003ZPKN339KWKP8GCDW3YDR9KYQGR9A5BN.xtrata-v3-2-2 | contracts/other/xtrata-v3.2.2.clar | 21bb82b70393ebe5c75e4c6704e584f49c07180e54835b86db5469adc209229a |
| helper | ST1K773003ZPKN339KWKP8GCDW3YDR9KYQGR9A5BN.xtrata-small-mint-v1-1 | contracts/other/xtrata-small-mint-v1.1.clar | c8f5e15cb81f50afcf78cf63f53f8e14dc9efd2288de13133083e3901cffe4a8 |

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
| deploy xtrata-v1-1-1 | success | a81a8a6282273e974f74d381c4288906f08b053a93098993d26dc2a3785a249e | 4007575 | 1000000 |
| deploy xtrata-v2-1-0 | success | a2269cb0706f4aaaa6e9c144cd7f9714d157a51a42d386a8ff2252cc1accb671 | 4007577 | 1000000 |
| deploy xtrata-v3-2-2 | success | 21bb82b70393ebe5c75e4c6704e584f49c07180e54835b86db5469adc209229a | 4007578 | 1000000 |
| deploy xtrata-small-mint-v1-1 | success | c8f5e15cb81f50afcf78cf63f53f8e14dc9efd2288de13133083e3901cffe4a8 | 4007579 | 1000000 |
| core set royalty recipient | success | d0652421a08903fb522937555ba9732edf9ffc2a975a6a8188980296dee36174 | 4007581 | 1000000 |
| core unpause | success | 7c15b1021b157197e4a4831486862e79a8db359abff8111d6b15c614d70ac045 | 4007582 | 1000000 |
| helper point at testnet core | success | 906c354889eaf695b7d7781ee12a72bfefdde6f958f85a2bf9e8fa7575794e48 | 4007583 | 1000000 |
| helper unpause | success | 474cd256c7c5a9a450625a8853929fa04bc92a227e7cd6adc91a4c19b7d6e14b | 4007584 | 1000000 |
| v2.1.0 unpause | success | 54f82dadacc2e5498d6658d86fb5595b5cef6f82f7a4f29d946302799acdeabd | 4007585 | 1000000 |
| v2.1.0 set migration base 9000 | success | 71af0447f028ebd60af79072e9f362e922b8343236752debad4a59838c8dc866 | 4007586 | 1000000 |
| direct mint data:text/plain,xtrata-v3.2.2-testnet-rehearsal,direct single-call 1-byte (1 chunks) | success | b2d478074db2528aa15a64f2843298990b9444af3b1b34669dccac37514bd71f | 4007587 | 1000000 |
| direct mint data:text/plain,xtrata-v3.2.2-testnet-rehearsal,direct single-call 1 full chunk (1 chunks) | success | faffaa40342efbc41a71c158f854d329d3ad2bfe5511bfdaf983bde2701c5b35 | 4007588 | 1000000 |
| direct mint data:text/plain,xtrata-v3.2.2-testnet-rehearsal,direct single-call 30 chunks (30 chunks) | success | a64b19f520e6ee64ec0fb6dc2ff02c29b6638700298b827992203045ae21ff23 | 4007589 | 1000000 |
| direct mint data:text/plain,xtrata-v3.2.2-testnet-rehearsal,direct single-call 32 chunks (32 chunks) | success | 4626da9f207c2acc133e91c7731771c8c6fbfa5da5d1c4e5ca728c39efa2b291 | 4007590 | 1000000 |
| helper mint data:text/plain,xtrata-v3.2.2-testnet-rehearsal,helper-1-byte (1 chunks) | success | 6355ee713dbb0ccb181f7efc8d6585fefd44e1480df418832f901863cc758af4 | 4007591 | 1000000 |
| helper mint data:text/plain,xtrata-v3.2.2-testnet-rehearsal,helper-policy-30 (30 chunks) | success | d70e8db037e9001ab91159cf71472ac42e336f8f20446adae75ad0169f211776 | 4007592 | 1000000 |
| helper oversized 33 chunks expected failure | expected-broadcast-rejection |  |  |  |
| staged begin data:text/plain,xtrata-v3.2.2-testnet-rehearsal,staged-33 | success | b38e97ef13c48a38861a251d846c633832adbfc2243d069a7d2c35caf67083a8 | 4007593 | 1000000 |
| staged add chunks data:text/plain,xtrata-v3.2.2-testnet-rehearsal,staged-33 0-31 | success | 8a491f9ab79ee961e60621db41a6d9d50bad75f69446ef1d71392ba9ca1ca24a | 4007594 | 1000000 |
| staged add chunks data:text/plain,xtrata-v3.2.2-testnet-rehearsal,staged-33 32-32 | success | 08114a06200b8433ef486e8ecdfca151f08096345da218a98d6830bf6412910f | 4007595 | 1000000 |
| staged seal data:text/plain,xtrata-v3.2.2-testnet-rehearsal,staged-33 | success | a747005dd8cb9f5f988247dd0382e609f0c5e83a0af80441e8991fb17f3df968 | 4007596 | 1000000 |
| staged begin data:text/plain,xtrata-v3.2.2-testnet-rehearsal,staged-64 | success | 2b73d63ee3339e83bda522eb7b8676bbdbbb15f4fe73e464e183eac351f63299 | 4007597 | 1000000 |
| staged add chunks data:text/plain,xtrata-v3.2.2-testnet-rehearsal,staged-64 0-31 | success | 57fd48926a009bb8702bd2ac21f29fb04541322695335f185d6d08be8989a874 | 4007598 | 1000000 |
| staged add chunks data:text/plain,xtrata-v3.2.2-testnet-rehearsal,staged-64 32-63 | success | 01ccd28137bdb614826aeaeafb9722329891134c6f36f5c55c4b3e91f777214a | 4007599 | 1000000 |
| staged seal data:text/plain,xtrata-v3.2.2-testnet-rehearsal,staged-64 | success | d9d80a2189542bb449419e4200e226ee72c90289aa527e40b822c46d960838d1 | 4007600 | 1000000 |
| direct mint data:text/plain,xtrata-v3.2.2-testnet-rehearsal,dedupe-a (1 chunks) | success | 2d99d3dfc2b1acc8d1e338a2946dfc86ccc129002950710cf442fd221736b087 | 4007601 | 1000000 |
| direct mint data:text/plain,xtrata-v3.2.2-testnet-rehearsal,dedupe-b (1 chunks) | success | fc4c3459a4adc8a68d08d7e312385f098eaf6b79e9fb6f0bbd2aa5acd83c7b9b | 4007603 | 1000000 |
| direct mint data:text/plain,xtrata-v3.2.2-testnet-rehearsal,dep-source (1 chunks) | success | 86947ea60c9e0aefc77094aeaee119f7fc1ba21d5193e86323c5151281b1d4bc | 4007604 | 1000000 |
| direct mint data:text/plain,xtrata-v3.2.2-testnet-rehearsal,parent-owned (1 chunks) | success | 9221a6b3365f5154ddcf7819347f9afcd5f69d21d01e7dc94869bd5a63a33c88 | 4007605 | 1000000 |
| direct mint data:text/plain,xtrata-v3.2.2-testnet-rehearsal,dep-linked (1 chunks) | success | 0ddb3c49a67bb4e86914ac3e472d0c2ef6797d36b08365ecebb6a8158a5251dd | 4007606 | 1000000 |
| parent link to another wallet token expected failure | abort_by_response | eb9fe0c32b4b281b9db95ebe23555aa8dda2395ad95dccb004213e6b9d85ab41 | 4007607 | 1000000 |
| direct mint data:text/plain,xtrata-v3.2.2-testnet-rehearsal,parent-linked (1 chunks) | success | bdfa861c566ce35d4693229963011d3777257f15065675e5d15ebe173c54e873 | 4007608 | 1000000 |
| legacy begin xtrata-v2-1-0 data:text/plain,xtrata-v3.2.2-testnet-rehearsal,v210 | success | 19826d23583339e12fc8c3f48a88099b1ec2f59666b9acd993c9a460c2dc9bac | 4007609 | 1000000 |
| legacy add xtrata-v2-1-0 data:text/plain,xtrata-v3.2.2-testnet-rehearsal,v210 | success | 631190c8a373c0fbdd2b5214578c7d76b7ce92a6ceddaf4260742fca7b3c8295 | 4007610 | 1000000 |
| legacy seal xtrata-v2-1-0 data:text/plain,xtrata-v3.2.2-testnet-rehearsal,v210 | success | 194efbc6d0403c1433e95afca0cd61a96f5264459dc69e09abeb740ce4110ba9 | 4007611 | 1000000 |
| migrate v2.1.0 token | success | 9571aed7746d280e4bd580633f5e9a782ee9e87e60c1b9df040691f6a1803596 | 4007612 | 1000000 |
| duplicate migrate v2.1.0 token expected failure | abort_by_response | 9e720522e92371a8a5472822038df01df17395160298b151251015293f236ec7 | 4007613 | 1000000 |

## Test Cases

| Test | Status | Token IDs / Notes |
|---|---|---|
| direct single-call 1-byte | passed | token 0; 1 chunks; evidence confirmed-on-chain |
| direct single-call 1 full chunk | passed | token 1; 1 chunks; evidence confirmed-on-chain |
| direct single-call 30 chunks | passed | token 2; 30 chunks; evidence confirmed-on-chain |
| direct single-call 32 chunks | passed | token 3; 32 chunks; evidence confirmed-on-chain |
| helper 1-byte | passed | token 4; 1 chunks; evidence confirmed-on-chain |
| helper max app policy 30 chunks | passed | token 5; 30 chunks; evidence confirmed-on-chain |
| helper oversized 33 chunks rejected | passed | Rejected because helper policy cap is 30 chunks while the core ABI remains list 32.; evidence confirmed-on-chain |
| staged 33 chunks as 32 + 1 | passed | token 6; 33 chunks; evidence confirmed-on-chain |
| staged 64 chunks as 32 + 32 | passed | token 7; 64 chunks; evidence confirmed-on-chain |
| advisory dedupe duplicate same-hash mints | passed | A 8; B 9; first 8; evidence confirmed-on-chain |
| dependency on another wallet token succeeds | passed | token 12; evidence confirmed-on-chain |
| parent link to another wallet token fails | passed | mint-single-tx-with-relationships rejects parent tokens not owned by tx-sender.; evidence confirmed-on-chain |
| parent link to owned token succeeds and relationship lists remain separate | passed | token 13; evidence confirmed-on-chain |
| migration from v2.1.0 | passed | token 9000; evidence confirmed-on-chain |
| duplicate migration rejected | passed | Second migrate-from-v2-1-0 call for the same token id fails.; evidence confirmed-on-chain |

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
