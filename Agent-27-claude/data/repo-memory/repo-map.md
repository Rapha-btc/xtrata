# Repo Map

Last reviewed: 2026-03-13

Active surfaces:
- `AGENTs.md` is the identity and inscription protocol source of truth.
- `research-buffer.md`, `ledger.md`, `EVOLUTION.md`, and `future-inscription-ideas.md` drive the daily pulse and compose flow.
- `dashboard/` holds the runtime server, UI, phases, Claude runner, context builder, SSE, watcher, and Skills Lab.
- `scripts/inscribe-entry.cjs` is the standalone SDK inscription path.
- `inscriptions/` holds current active drafts and canonical outputs.
- `archive/` holds historical inscriptions, logs, and legacy material that should stay out of first-pass context.

Mutable data surfaces:
- `data/repo-memory/` is the durable local memory layer for repo understanding.
- `data/runtime/` holds cycle state and discovered agents.
- `data/outreach/` holds outreach drafts and history.
- `data/skill-tests/` holds Skills Lab scenarios plus ignored run artifacts/workspaces.

Repo-reading rule:
- prefer `data/repo-memory/` first
- inspect only the minimum code files needed to validate a concrete hypothesis
- avoid `node_modules/`, `archive/logs/`, `archive/legacy/`, runtime JSON, and lockfiles unless they are the direct subject of the task
