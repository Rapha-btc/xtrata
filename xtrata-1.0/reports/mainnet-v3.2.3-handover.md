# Xtrata v3.2.3 Mainnet Handover

Generated: 2026-06-08T09:50:10.690Z

- Core: `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-3`
- Source: `contracts/live/xtrata-v3.2.3.clar`
- Source SHA-256: `4d5ed9db022bb345d712ceadbd75d8d9540bd0a5b4d9122017c770b8d00a8ac7`
- Required Clarity version: **3**
- Deployment status: **deployed**
- Royalty recipient: `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X`
- Exact continuity next ID: **359**
- Recommendation: **review the report before continuing**

## Legacy State

| Contract | Role | Last | Next | Paused | Candidate |
|---|---|---:|---:|---|---:|
| `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1` | legacy | 38 | 39 | true | 39 |
| `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0` | current-live | 358 | 359 | true | 359 |

## Mainnet Sequence

1. Deploy only `xtrata-v3-2-3` from `contracts/live/xtrata-v3.2.3.clar` through Xverse as Clarity 3.
2. Verify the mined transaction with `npm run mainnet:v3.2.3:verify -- 0x<txid>`.
3. Pause `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0` and wait for confirmation.
4. Rerun `npm run mainnet:v3.2.3:preflight`. Use the exact post-pause next ID from that report.
5. Call `set-next-id(u359)` once.
6. Call `set-royalty-recipient('SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X)`.
7. Rerun preflight. Only when `launchReady=true`, call `set-paused(false)`.
8. Mint the announcement inscription via `mint-single-tx`.

The old 64-ID margin is removed. Pausing the live core and taking a fresh read closes the race deterministically.

## Announcement

- Bytes: 6948
- Chunks: 1
- MIME: text/markdown
- Final hash: `0x13dad7060bd0c23e7407708917663c9a42c11e5fb9691a63bb54d62ea9a1300d`

## Failures

- None

## Warnings

- None
