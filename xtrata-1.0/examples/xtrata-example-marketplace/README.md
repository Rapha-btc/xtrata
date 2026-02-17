# xtrata-example-marketplace

Built using Xtrata Protocol.

This starter shows a minimal marketplace data shell using only public SDK exports.

## What it demonstrates

- one-line suite setup with `createSimpleSdk`
- core protocol reads (`getNextTokenId`, `getFeeUnit`)
- market reads (`getLastListingId`, `getListing`)
- workflow-based buy transaction plan with deny-mode post-conditions

## Usage

Set environment variables (optional):

- `XTRATA_SENDER`
- `XTRATA_CORE_CONTRACT`
- `XTRATA_MARKET_CONTRACT`
- `XTRATA_OFFLINE=1` (optional smoke mode that skips network reads and still outputs a valid workflow plan)

Starter template is included at `.env.example`.

Run:

```bash
npm install
npm start
```

Offline smoke:

```bash
npm install
npm run smoke
```

Tarball smoke (from repo root):

```bash
npm run sdk:examples:tarball:smoke
```

## Next implementation steps

1. Add wallet connect and pass active wallet as `senderAddress`.
2. Add list/buy/cancel actions using `@xtrata/sdk/workflows`.
3. Submit generated call payloads through wallet connect (`openContractCall`).
