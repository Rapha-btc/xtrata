# Xtrata Release Planning Service Contract

## Purpose

Use this reference when turning the skill into a customer-facing service.

The service should accept a planning brief plus artifact links, then return a
preflight quote and a dependency-safe execution plan before any inscription
write occurs.

## Intake Contract

Require these fields:

- `request_name`: human-readable release name
- `network`: usually `mainnet`
- `planning_docs`: one or more docs that define sequencing, render rules, or
  release invariants
- `artifacts`: list of release items with accessible links or local paths
- `wallet_context`: address, fee policy, and whether execution is authorized

Each artifact should include:

- `name`
- `source`
- `mime_type`
- optional `route`
- optional `depends_on`
- optional `render`

Each `source` must be something the agent can actually read:

- local path
- signed URL
- repo URL with raw file access
- uploaded file in the workspace

Do not accept a quote request that references inaccessible files.

## Quote Semantics

A good quote has three layers:

1. Exact protocol fee
   - Derived from live `get-fee-unit` and exact chunk count.
2. Estimated network fee
   - Derived from actual file sizes and current fee-rate inputs.
3. Confidence notes
   - Explain what is exact, what is estimated, and what could still move.

Use this wording standard:

- `exact`: the service read the bytes and queried live fee-unit / fee-rate data
- `estimated`: the service read the bytes but only has fee-rate ranges
- `indicative`: some files or fee inputs were missing

## Planning Output

Return a machine-readable and human-readable plan.

Human-readable sections:

- `Summary`
- `Blockers`
- `Per-Artifact Quote`
- `Execution Order`
- `Runtime State Updates`
- `Verification Gates`

Machine-readable object:

```json
{
  "requestName": "bvst-release-v1",
  "status": "ready",
  "quote": {
    "protocolFeeMicroStx": 0,
    "networkEstimateMicroStx": {
      "low": 0,
      "base": 0,
      "high": 0
    }
  },
  "artifacts": [],
  "steps": []
}
```

## Per-Artifact Record

Include these fields in the machine-readable result:

- `name`
- `source`
- `sha256`
- `sizeBytes`
- `totalChunks`
- `route`
- `dependsOn`
- `dependencyTokenIds`
- `duplicateTokenId`
- `needsRenderedCopy`
- `protocolFeeMicroStx`
- `networkEstimateMicroStx`
- `executionStatus`

## Runtime State Contract

The planner should either receive or propose:

- `token-map.runtime.json`
- `inscription-log.json`
- `rendered/`

Expected behavior:

- write token IDs into runtime map immediately after each successful mint
- append a structured log row after each successful mint
- write rendered dependent files to `rendered/`
- refuse to continue when a named artifact exists with a different hash

## Verification Gates

Require these checks in the execution plan:

1. Dedupe before any write via `get-id-by-hash`.
2. Resume instead of restart when `get-upload-state` is active.
3. Confirm each write tx before dependent work begins.
4. Rebuild bytes from chain or indexer output and compare to local bytes.
5. Stop on unresolved placeholders in rendered files.

## Suggested Product Tiers

### Planning Only

- no wallet access required
- return quote, order, blockers, and runtime-state plan
- suitable for agencies or creators preparing a release

### Managed Execution

- requires wallet authorization
- executes the plan and updates runtime state live
- suitable for teams that want "plan then inscribe" as one workflow

## Recommended Positioning

Describe the service as:

"Dependency-aware Xtrata release preflight. We read the actual files, quote the
live protocol cost, estimate network fees, map dependency order, and tell you
exactly what gets inscribed when."
