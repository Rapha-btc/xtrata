# CLAUDE.md

Start with:
- `README.md`
- `skills/README.md`
- the specific skill, task, or agent-lab file relevant to the job

Avoid broad scans unless needed:
- `node_modules/`
- `data/runtime/`
- `data/outreach/`
- lockfiles

Operational rules:
- keep the repo generic; do not reintroduce agent-specific runtime or identity files
- do not store secrets in tracked files
- prefer targeted validation such as `node --check` for changed scripts

Useful commands:
```bash
npm run batch-mint
npm run batch-mint:template:core
npm run batch-mint:template:collection
```
