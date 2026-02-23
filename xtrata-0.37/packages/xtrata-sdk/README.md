# @xtrata/sdk (workspace)

Workspace SDK package for protocol-first integrations:
- Core contract helpers (config/network/client)
- Simple Mode wrappers (`simple`) for easiest onboarding
- Safe transaction helpers (`safe`) for deterministic caps + guided flow states
- Workflow planners (`workflows`) for mint and market write transactions
- Mint helpers (fees, caps, post-conditions, dependencies)
- Collection mint lifecycle helpers
- Market helpers
- Deploy helper primitives

This package currently ships as source for local workspace integration and testing.

Quick start:

```ts
import { createXtrataReadClient } from '@xtrata/sdk/simple';
```
