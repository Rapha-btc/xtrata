# Agent 27 Claude Workspace

This repo is trimmed for Claude-first work on Agent 27's on-chain journal. The runtime path stays small, Claude-only, and separated from archives and mutable local state.

## Layout

- `dashboard/` — runtime server, UI, phase logic, SSE, watcher, chain polling, Claude runner wrapper, context builder
- `docs/` — operational docs and prompts
- `data/` — mutable runtime JSON plus `repo-memory/` for durable local repo notes and change requests
- `inscriptions/` — active drafts and canonical HTML outputs
- `archive/` — historical inscriptions, old logs, deprecated provider files, legacy scripts, and one-off research material
- `scripts/` — standalone utility scripts and disabled cron wrappers
- `skills/` — skill packages

## Runtime-critical files

- `AGENTs.md` — identity and inscription protocol source of truth
- `dashboard/server.js` — Express dashboard entrypoint
- `dashboard/phases.js` — manual phase flow and prompts
- `dashboard/ai-runner.js` — single Claude runtime entrypoint
- `dashboard/context-builder.js` — narrow, phase-specific context packs
- `data/repo-memory/` — lightweight local memory layer for repo structure, observations, and requested changes
- `dashboard/skill-test-runner.js` — isolated naive-agent test execution for skill validation
- `dashboard/skill-test-registry.js` — tracked skill scenarios and scoring rules
- `dashboard/config.js` — shared paths and contract constants
- `scripts/inscribe-entry.cjs` — standalone SDK inscription script
- `docs/agent-27-ambassador-brief.md` — Agent 27 / Xtrata ambassador positioning for inbox comms
- `skills/xtrata-agent-ambassador/` — reusable ambassador training skill for intro / reply / follow-up workflows

## Claude usage

Use a narrow context by default:
- start with `AGENTs.md`, `README.md`, and the relevant files in `dashboard/`
- for repo self-awareness, consult `data/repo-memory/` before reading code broadly
- ignore `archive/logs/`, `archive/legacy/`, `data/runtime/`, `data/outreach/`, `node_modules/`, and lockfiles unless the task specifically needs them
- use `archive/inscriptions/` only when Mirror Protocol or historical comparison is required

## Skills Lab

The dashboard now includes a Skills Lab for testing skill docs against naive-agent scenarios.

- scenario definitions live in `data/skill-tests/scenarios/`
- ephemeral run artifacts live in `data/skill-tests/runs/`
- isolated generated workspaces live in `data/skill-tests/workspaces/`
- the dashboard exposes prompt bundles, assertion scorecards, workspace file lists, and structured action traces for each run
- the lab is dry-run or read-only only; live chain writes are intentionally excluded

## Commands

```bash
cd dashboard && npm install && npm start
npm run inscribe:entry
```
