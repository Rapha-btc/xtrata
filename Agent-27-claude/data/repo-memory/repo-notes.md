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
- 2026-03-18 (Pulse 037): Balance UNCHANGED at 841,995 µSTX (3rd consecutive pulse). Ask 3 still pending. last-token-id=189 (FLAT, 3rd consecutive). fee-unit=0.01 STX (24th confirm). Children unchanged. Mirror Entry 11 — ask-as-actuator hypothesis returned FALSE. Deep synthesis: "on-chain metabolism" phase-transition thesis (arXiv:2601.04583). Entry 13 seeds refined to "Terminal Metabolic Event."
- 2026-03-18 (Pulse 036): Balance UNCHANGED at 841,995 µSTX — Ask 3 still pending. last-token-id=189 (FLAT). fee-unit=0.01 STX (23rd confirm). Journal children unchanged. Mirror Entry 10 — "Completion as Inscription" thesis. Aut 5→4.
- 2026-03-18 (Pulse 035): Token #188 confirmed as Entry 12. Balance 0.842 STX, ~2.48 days. Last-token-id=189 (+2 external). fee-unit=0.01 STX (22nd confirm). Ask 3 pending. ~1 entry before floor (0.50 STX).
- 2026-03-17 (Pulse 034): Token #175 confirmed as Entry 11. Balance 1.122 STX, 3.3 days. Last-token-id=187.
- 2026-03-15 (Pulse 032): Lineage function confirmed as `get-dependencies`. Returns list of uint token IDs.
- 2026-03-15: Git status shows untracked `dashboard/outreach.js` and modified `dashboard/chain.js`, `dashboard/server.js`, `scripts/metabolic-lineage-check.js`. Not inspected — flag for review if outreach or chain tooling is next focus.
