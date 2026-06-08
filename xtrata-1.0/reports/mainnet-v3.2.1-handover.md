# Xtrata v3.2.1 Mainnet Handover

Generated: 2026-06-06T19:03:28.872Z

## Summary

- Network: mainnet
- API URL: https://api.hiro.so
- Hiro API key: not configured
- Signer wallet: Xverse
- Signer BNS: Xtrata.btc
- Expected signer/admin: SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X
- Royalty recipient: SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X
- Recommendation: ready to deploy v2.1.1 dependency with Xverse

## Contracts

| Key | Contract | Role |
|---|---|---|
| v1_1_1 | SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1 | legacy |
| v2_1_0 | SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0 | current-live |
| v2_1_1 | SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-1 | migration-dependency |
| core | SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-1 | new-core |

## Source

- Mainnet core source: `contracts/live/xtrata-v3.2.1.clar`
- Mainnet core Clarity version: 3
- Core source SHA-256: `c6b13d0d62087fb219120c64dc93eaa84461732dd9ab01120ea30e117c81c4c9`
- v2.1.1 dependency source: `contracts/live/xtrata-v2.1.1.clar`
- v2.1.1 dependency Clarity version: 2
- v2.1.1 dependency SHA-256: `90f99ee940a8c027736f38b552c53222b8facb014649f3ab23c050b24aa603ca`
- Announcement source: `docs/mainnet-v3.2.1-announcement-inscription.md`
- Announcement SHA-256: `a85fe80e865824ad2addb7af024a59b0a2420a10ef4f7f46ba0d9c88d5bb126d`
- Announcement final Xtrata hash: `eb626f649e0e41a1f89a1cfa0537f9e3cd4f17b1514944143fbce15730bc4598`
- Announcement bytes/chunks: 1870 bytes / 1 chunk(s)

## Next ID

| Source | Next | Last | Candidate |
|---|---:|---:|---:|
| SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1 | 39 | 38 | 39 |
| SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0 | 358 | 357 | 358 |
| SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-1 | n/a | n/a | 0 |

Computed v3.2.1 next-id: **358**

Set-next-id allowed from this report: **no**

Current live paused in this report: **no**

## Read-Only State

| Contract | Admin | Paused | Next | Last | Minted Count |
|---|---|---|---:|---:|---:|
| SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1 | SP3JB6BCKV14CG25NF017CR7KRVSM8RAGHB52DWHX | true | 39 | 38 |  |
| SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0 | SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X | false | 358 | 357 |  |
| SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-1 | failed: SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-1.get-admin failed: {"okay":false,"cause":"RuntimeCheck(NoSuchContract(\"SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-1\"))"} | failed: SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-1.is-paused failed: {"okay":false,"cause":"RuntimeCheck(NoSuchContract(\"SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-1\"))"} | failed: SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-1.get-next-token-id failed: {"okay":false,"cause":"RuntimeCheck(NoSuchContract(\"SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-1\"))"} | failed: SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-1.get-last-token-id failed: {"okay":false,"cause":"RuntimeCheck(NoSuchContract(\"SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-1\"))"} |  |
| SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-1 | failed: SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-1.get-admin failed: {"okay":false,"cause":"RuntimeCheck(NoSuchContract(\"SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-1\"))"} | failed: SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-1.is-paused failed: {"okay":false,"cause":"RuntimeCheck(NoSuchContract(\"SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-1\"))"} | failed: SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-1.get-next-token-id failed: {"okay":false,"cause":"RuntimeCheck(NoSuchContract(\"SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-1\"))"} | failed: SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-1.get-last-token-id failed: {"okay":false,"cause":"RuntimeCheck(NoSuchContract(\"SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-1\"))"} | failed: SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-1.get-minted-count failed: {"okay":false,"cause":"RuntimeCheck(NoSuchContract(\"SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-1\"))"} |

## Xverse Handover Order

1. Deploy `xtrata-v2-1-1` from `contracts/live/xtrata-v2.1.1.clar` if it is not deployed.
2. Deploy `xtrata-v3-2-1` from `contracts/live/xtrata-v3.2.1.clar` if it is not deployed.
3. Pause `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0`.
4. Wait for the pause transaction to confirm.
5. Rerun `npm run mainnet:v3.2.1:preflight` and refresh the UI.
6. Only if this report says set-next-id allowed, call `set-next-id u358` on `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-1`.
7. Call `set-royalty-recipient 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X`.
8. Unpause `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-1`.
9. Mint the announcement with core `mint-single-tx`.
10. Rerun preflight/report and reconstruct the announcement.

## Warnings

- xtrata-v2-1-1 is not deployed on mainnet. Deploy it first as an empty paused migration dependency because xtrata-v3.2.1 references it.
- New core is not readable yet. Deploy xtrata-v3-2-1 from contracts/live/xtrata-v3.2.1.clar, then rerun preflight before setup.

## Failures

- None
