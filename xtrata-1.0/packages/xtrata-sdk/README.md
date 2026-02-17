# @xtrata/sdk (workspace)

SDK package for protocol-first integrations:
- Core contract helpers (config/network/client)
- Simple Mode wrappers (`simple`) for easiest onboarding
- Safe transaction helpers (`safe`) for deterministic caps + guided flow states
- Wallet failure recovery helper (`buildMintRecoveryGuide`) for resume-safe UX
- Workflow planners (`workflows`) for mint and market write transactions
- Mint helpers (fees, caps, post-conditions, dependencies)
- Collection mint lifecycle helpers
- Market helpers
- Deploy helper primitives

Current packaging mode:
- Source of truth: `src/`
- Build output: `dist/`
- Package entrypoints resolve from `dist/*`
- Tarball smoke validation is available via `npm run sdk:pack:smoke` from repo root.
- Example tarball smoke validation is available via `npm run sdk:examples:tarball:smoke` from repo root.

Quick start:

```ts
import { createXtrataReadClient } from '@xtrata/sdk/simple';
```
