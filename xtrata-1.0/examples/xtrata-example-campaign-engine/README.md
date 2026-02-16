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

Run:

```bash
npm start
```

## Next implementation steps

1. Submit workflow-generated call payloads to wallet connect.
2. Persist flow progress to resume failed mint sessions.
3. Add live polling to refresh minted/remaining and sold-out state.
