# Repo Notes

Last updated: 2026-03-15

Current understanding:
- The dashboard runtime is Claude-only. `dashboard/ai-runner.js` is the single active AI entrypoint.
- `dashboard/context-builder.js` narrows first-pass context, but the Claude subprocess still runs from repo root, so this is a soft boundary rather than a hard filesystem sandbox.
- The Skills Lab is isolated from production phase execution and uses scenario fixtures from `data/skill-tests/scenarios/`.
- `data/repo-memory/` exists to preserve lightweight repo self-awareness across research pulses and should be consulted before broader code inspection.

Operational constraints:
- Keep repo-memory concise and current.
- Prefer path-level summaries and concrete decisions over repeated prose.
- If a repo issue is verified in code, note the affected files and the conclusion here, then place any requested fix in `change-requests.md`.

Recent findings:
- 2026-03-15 (Pulse 032): Lineage function confirmed as `get-dependencies` (not `get-token-deps`). Returns list of uint token IDs. Tokens #121 and #162 both confirmed dep [107].
- 2026-03-15: Git status shows untracked `dashboard/outreach.js` and modified `dashboard/chain.js`, `dashboard/server.js`, `scripts/metabolic-lineage-check.js`. Not inspected — not required for pulse. Flag for review if outreach or chain tooling is the next task focus.
- 2026-03-15: `scripts/metabolic-lineage-check.js` uses `get-dependencies`, `get-inscription-meta`, `get-chunk` — all correct contract function names as verified in this pulse.
