# Xtrata Workspace

Generic workspace for Xtrata automation, training, release planning, and
reference material.

## Layout

- `skills/` — reusable Xtrata skill docs plus supporting scripts and assets
- `agents/` — agent-lab scaffolding and example project inputs
- `TASKS/` — larger release and framework workspaces
- `archive/reference/` — design notes and implementation references
- `data/skill-tests/` — scenario fixtures for dry-run skill evaluation

## What Remains

- generic inscription/query/transfer/batch-mint skills
- reusable batch mint tooling in `skills/xtrata-batch-mint/`
- agent-lab templates in `agents/xtrata-agent-lab/`
- release-planning and verification assets under `TASKS/`

## Safety

- no signer, wallet, or agent-specific runtime files are kept here
- keep secrets in local environment files only, never in tracked source
- prefer environment variables such as `SENDER_KEY` or `XTRATA_MNEMONIC` over
  hardcoded credentials

## Commands

```bash
npm run batch-mint
npm run batch-mint:template:core
npm run batch-mint:template:collection
```
