# Agent 27 Dashboard

Operations console for Agent 27's autonomous on-chain journal cycle. Provides a browser UI to run research, compose entries, inscribe on-chain, and monitor wallet/chain state — all with manual approval.

Runtime notes:
- The dashboard is Claude-only. `dashboard/ai-runner.js` is the single runtime AI entrypoint.
- Phase prompts are wrapped with `dashboard/context-builder.js` so Claude starts from a narrow file pack.
- Mutable dashboard JSON lives in `../data/`, not inside `dashboard/`.
- `../data/repo-memory/` is the durable local memory layer for repo self-awareness during research pulses.
- The Skills Lab uses `dashboard/skill-test-runner.js` plus scenario fixtures in `../data/skill-tests/scenarios/`.

## Prerequisites

- Node.js >= 22
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated (phases spawn `claude` as a subprocess)
- The AIBTC MCP server configured in Claude Code (for wallet + chain queries)

## Quick Start

```bash
cd dashboard
npm install
npm start          # Express server on port 2727
```

The dashboard opens automatically at `http://localhost:2727` on macOS. For dev mode with auto-reload on file changes:

```bash
npm run dev        # uses node --watch
```

To use a different port: `PORT=3000 npm start`

## Dashboard Layout

### Header Bar

Displays three live metrics polled from the Stacks chain:

- **STX** — Current wallet balance
- **Days** — Estimated runway (balance / ~0.34 STX per cycle)
- **Graph** — Number of tokens in the inscription graph (children of Genesis #107)

### Operations Panel

The main control surface. Three phase buttons run in sequence:

| Button | What it does | Model | Timeout |
|--------|-------------|-------|---------|
| **RUN PULSE** | Research phase — checks chain state, reviews prior entries, synthesizes web research, updates `research-buffer.md`, and maintains concise repo notes in `../data/repo-memory/` when codebase-level observations matter | Sonnet | 5 min |
| **COMPOSE DRAFT** | Reads research buffer + AGENTs.md, generates a self-contained HTML entry, saves to `inscriptions/` | Opus | 10 min |
| **INSCRIBE ON-CHAIN** | Runs the Stacks SDK inscription flow from `../scripts/inscribe-entry.cjs`: helper single-tx recursive mint for fresh drafts up to 30 chunks, otherwise staged begin → chunk → seal-recursive with dependency #107 | Opus | 5 min |

Only one phase runs at a time. The **CANCEL** button kills the running Claude subprocess.

When a phase is running, a progress bar shows elapsed time against the phase timeout. Completed phases appear in the history list below the buttons with duration and cost.

### Preflight Checks

Phases have automatic preflight validation:

- **Compose** requires `research-buffer.md` to contain at least 50 characters — run a pulse first.
- **Inscribe** requires a draft HTML file in `inscriptions/` and STX balance >= 1.0.

If a preflight check fails, the phase is rejected with an error in the activity log.

### Repo Self-Memory

The research pulse now has a dedicated lightweight memory surface for understanding its own repo over time:

- `../data/repo-memory/repo-map.md` for stable structure
- `../data/repo-memory/repo-notes.md` for active understanding and constraints
- `../data/repo-memory/change-requests.md` for proposed repo changes

This is still a soft boundary, not a hard sandbox. The Claude subprocess can still inspect other repo files if it chooses, but the context pack and prompt now steer it to consult repo-memory first and only read code surgically when a concrete repo hypothesis needs validation.

### Side Panels

- **Metabolic Status** — Parsed wallet and chain health from the cycle state
- **Research Buffer** — Contents of `research-buffer.md` (working notes for the current cycle)
- **Ideas** — Parsed ideas/topics under consideration
- **Ledger** — STX cost tracking and runway projections from `ledger.md`

### Agent Outreach

The outreach panel now supports structured ambassador workflows instead of one-off blasts.

- `intro`, `reply`, and `follow-up` modes are explicit in the UI
- inbound messages can be logged locally so replies have durable thread context
- per-agent relationship memory is stored in `../data/outreach/agent-memory.json`
- ambassador positioning is loaded from `../docs/agent-27-ambassador-brief.md`
- message generation is guided by `../docs/aibtc-agent-comms-prompt.md`

This is the practical two-way comms layer for Agent 27 as both an on-chain journalist and the first automated ambassador for Xtrata.

### Activity Log

Live-streaming log at the bottom of the page. Shows:

- Phase start/complete/error events
- HTTP request traces
- Claude subprocess output (stdout lines from the running phase)
- SSE connection status

Toggle **Show thinking** to reveal Claude's chain-of-thought lines (hidden by default).

## Typical Workflow

1. Click **RUN PULSE** — wait for research to complete
2. Review the Research Buffer panel to confirm new content
3. Click **COMPOSE DRAFT** — wait for the HTML entry to appear
4. Review the draft (the draft filename appears in the Operations panel)
5. Click **INSCRIBE ON-CHAIN** — this auto-selects the helper route for fresh small drafts and falls back to the staged route for resumable uploads or helper-disabled runs

Each step requires the previous one to complete. The dashboard enforces this with preflight checks.

## Skills Lab

The dashboard includes a separate Skills Lab panel for validating training skills against naive-agent scenarios.

- `dry-run` is the safe default and never claims a live write succeeded
- `read-only` is a prompt-restricted inspection mode for deeper reasoning checks
- each run is executed from an isolated generated workspace under `../data/skill-tests/workspaces/`
- scored run artifacts are written to `../data/skill-tests/runs/`
- scenario definitions are loaded from `../data/skill-tests/scenarios/`
- the panel exposes the selected scenario checklist, exact prompt bundle, structured tool/action trace, and persisted run summary

The lab is intentionally separate from production phase execution. The server blocks production phase runs while a Skills Lab run is active, and vice versa.

## Troubleshooting

### "Inscription failed: Failed to fetch"

This is a browser-level network error — the dashboard server was unreachable when you clicked the button. Check that the terminal running `npm start` is still alive. If the server crashed, restart it and try again.

### "SSE reconnecting..."

The live event stream lost connection. This usually means the server restarted or the network blipped. The UI reconnects automatically.

### Phase stuck / no output

Use the **CANCEL** button to kill the Claude subprocess, then retry. Check the terminal for error output from the spawned `claude` process.

### Helper route vs staged route

Fresh small drafts use `xtrata-small-mint-v1-0` to collapse begin, upload, and recursive seal into one wallet transaction. If there is already an upload session on the core contract, the dashboard keeps the original staged flow so the upload can resume safely.

### Port already in use

```
Port 2727 is already in use. Set PORT to another value and restart.
```

Another process is on port 2727. Either stop it or run with a different port: `PORT=3000 npm start`
