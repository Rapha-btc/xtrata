# Repo Notes

Last updated: 2026-03-13

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
- None recorded yet beyond the initial repo-memory setup.
