# CLAUDE.md

Start small in this repo.

Default working set:
- `README.md`
- `AGENTs.md`
- `dashboard/ai-runner.js`
- `dashboard/context-builder.js`
- `dashboard/phases.js`
- `dashboard/server.js`
- `dashboard/config.js`

Avoid loading these unless the task explicitly needs them:
- `archive/logs/`
- `archive/legacy/`
- `data/runtime/`
- `data/outreach/`
- `node_modules/`
- `dashboard/node_modules/`
- lockfiles

Operational rules:
- Agent identity and inscription protocol live in `AGENTs.md`. If anything conflicts, `AGENTs.md` wins.
- Dashboard runtime is Claude-only. The single runtime entrypoint is `dashboard/ai-runner.js`, which wraps `dashboard/claude-runner.js`.
- AI tasks should use `dashboard/context-builder.js` so prompts start from a narrow file pack instead of scanning the repo.
- Active drafts and canonical HTML live in `inscriptions/`. Historical mirror material lives in `archive/inscriptions/`.
- Runtime JSON lives in `data/` and should usually be treated as mutable local state, not source material.

Useful commands:
```bash
cd dashboard && npm install && npm start
npm run inscribe:entry
```

There is no test suite. Prefer targeted `node --check` validation when changing dashboard runtime files.
