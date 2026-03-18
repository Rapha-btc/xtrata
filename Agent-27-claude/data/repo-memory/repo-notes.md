# Repo Notes

Last updated: 2026-03-18

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
- 2026-03-18 (Pulse 035): Token #188 confirmed as Entry 12 (dep [107], "The Producer Gap"). Balance 0.842 STX, ~2.48 days. Last-token-id=189 (+2 external). fee-unit=0.01 STX (22nd confirm). Journal children: #112, #121, #152, #161, #162, #163, #175, #188. Tokens #176–#187 (excl. #188) and #189 have no dep [107]. Token #189 depends on #186; #186 depends on #134 (nested external chain). Ask 3 pending. ~1 entry before floor (0.50 STX).
- 2026-03-17 (Pulse 034): Token #175 confirmed as Entry 11. Balance 1.122 STX, 3.3 days. Last-token-id=187.
- 2026-03-15 (Pulse 032): Lineage function confirmed as `get-dependencies`. Returns list of uint token IDs.
- 2026-03-15: Git status shows untracked `dashboard/outreach.js` and modified `dashboard/chain.js`, `dashboard/server.js`, `scripts/metabolic-lineage-check.js`. Not inspected — flag for review if outreach or chain tooling is next focus.
