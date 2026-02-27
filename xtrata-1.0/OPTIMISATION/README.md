# Optimisation Program

Purpose: track and execute codebase optimisation work to improve performance, reduce code size, and increase shared logic reuse across app, manage portal, functions, and SDK.

This folder is the working hub for optimisation planning and delivery.

## Contents

- `OPTIMISATION/baseline-2026-02-17.md`
  - Current baseline snapshot (bundle output, large files, known pain points).
- `OPTIMISATION/api-efficiency-baseline-2026-02-27.md`
  - API traffic and cache baseline derived from Cloudflare dashboard and runtime observations.
- `OPTIMISATION/identified-areas.md`
  - Consolidated optimisation opportunities grouped by workstream.
- `OPTIMISATION/triage-plan.md`
  - Prioritised execution plan with phases, task IDs, and acceptance criteria.
- `OPTIMISATION/api-efficiency-plan-2026-02-27.md`
  - Focused API-efficiency roadmap with concrete code targets and rollout gates.
- `OPTIMISATION/cloudflare-api-controls-runbook-2026-02-27.md`
  - Cloudflare bot/rate-limit controls and rollout/rollback checklist for API protection.

## Working model

1. Capture baseline before major optimisation changes.
2. Prioritise items in `triage-plan.md` by impact, effort, and risk.
3. Execute a small batch of tasks (2-4) per cycle.
4. Re-run baseline commands and update results.
5. Mark completed items and open follow-up tasks only where needed.

## Baseline commands

Run from repo root:

```bash
npm run build
rg --files src | xargs wc -l | sort -nr | head -n 40
rg --files src/manage src/screens src/lib | xargs wc -l | sort -nr | head -n 60
rg --files packages/xtrata-sdk/src packages/xtrata-reconstruction/src | xargs wc -l | sort -nr | head -n 40
```

Use these outputs to compare progress over time.

## Scope guardrails

- Maintain current mint/deploy safety behavior while refactoring.
- Prefer extraction to shared helpers/hooks over behavior changes.
- Keep docs in this folder current as each optimisation phase lands.
- Pair structural changes with tests where logic moves.
