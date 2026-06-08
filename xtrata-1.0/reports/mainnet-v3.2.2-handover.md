# Xtrata v3.2.2 Mainnet Handover

Generated: 2026-06-07T22:13:02.572Z

- Core: `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-2`
- Source: `contracts/live/xtrata-v3.2.2.clar`
- Source SHA-256: `11c42363e5e72d957e6dd1a8d5d968adccb1019ebc57e5493ee9ac767979414d`
- Required Clarity version: **3**
- Deployment status: **absent**
- Royalty recipient: `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X`
- Exact continuity next ID: **359**
- Recommendation: **connect Xverse and deploy the Clarity 3 core**

## Legacy State

| Contract | Role | Last | Next | Paused | Candidate |
|---|---|---:|---:|---|---:|
| `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1` | legacy | 38 | 39 | true | 39 |
| `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0` | current-live | 358 | 359 | false | 359 |

## Mainnet Sequence

1. Deploy only `xtrata-v3-2-2` from `contracts/live/xtrata-v3.2.2.clar` through Xverse as Clarity 3.
2. Verify the mined transaction with `npm run mainnet:v3.2.2:verify -- 0x<txid>`.
3. Pause `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0` and wait for confirmation.
4. Rerun `npm run mainnet:v3.2.2:preflight`. Use the exact post-pause next ID from that report.
5. Call `set-next-id(u359)` once.
6. Call `set-royalty-recipient('SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X)`.
7. Rerun preflight. Only when `launchReady=true`, call `set-paused(false)`.
8. Mint the announcement inscription via `mint-single-tx`.

The old 64-ID margin is removed. Pausing the live core and taking a fresh read closes the race deterministically.

## Announcement

- Bytes: 2361
- Chunks: 1
- MIME: text/markdown
- Final hash: `0x54d43f32650e7486d964e74c4ffc51579221000440666681627133885aebdfbc`

## Failures

- None

## Warnings

- Current live v2.1.0 is not paused. Pause it after the new core deploy confirms, then rerun preflight.
