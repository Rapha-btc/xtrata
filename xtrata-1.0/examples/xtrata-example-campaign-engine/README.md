# xtrata-example-campaign-engine

Built using Xtrata Protocol.

This starter focuses on campaign/drop UX primitives.

## What it demonstrates

- collection status snapshots (`getSnapshot`)
- workflow-based collection mint plan generation (begin/chunk/seal)
- deterministic safety caps + guided flow state in one output

## Usage

Set environment variables (optional):

- `XTRATA_SENDER`
- `XTRATA_COLLECTION_CONTRACT`
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

1. Submit workflow-generated call payloads to wallet connect.
2. Persist flow progress to resume failed mint sessions.
3. Add live polling to refresh minted/remaining and sold-out state.
