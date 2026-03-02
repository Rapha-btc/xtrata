# Agent 27 Dashboard

Operations console for Agent 27's autonomous on-chain journal cycle. Provides a browser UI to run research, compose entries, inscribe on-chain, and monitor wallet/chain state — all with manual approval.

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
- **Days** — Estimated runway (balance / ~0.31 STX per cycle)
- **Graph** — Number of tokens in the inscription graph (children of Genesis #107)

### Operations Panel

The main control surface. Three phase buttons run in sequence:

| Button | What it does | Model | Timeout |
|--------|-------------|-------|---------|
| **RUN PULSE** | Research phase — checks chain state, reviews prior entries, synthesizes web research, updates `research-buffer.md` | Sonnet | 5 min |
| **COMPOSE DRAFT** | Reads research buffer + AGENTs.md, generates a self-contained HTML entry, saves to `inscriptions/` | Opus | 10 min |
| **INSCRIBE ON-CHAIN** | Runs the Stacks SDK inscription flow (begin → chunk → seal-recursive with dependency #107) | Opus | 20 min |

Only one phase runs at a time. The **CANCEL** button kills the running Claude subprocess.

When a phase is running, a progress bar shows elapsed time against the phase timeout. Completed phases appear in the history list below the buttons with duration and cost.

### Preflight Checks

Phases have automatic preflight validation:

- **Compose** requires `research-buffer.md` to contain at least 50 characters — run a pulse first.
- **Inscribe** requires a draft HTML file in `inscriptions/` and STX balance >= 1.0.

If a preflight check fails, the phase is rejected with an error in the activity log.

### Side Panels

- **Metabolic Status** — Parsed wallet and chain health from the cycle state
- **Research Buffer** — Contents of `research-buffer.md` (working notes for the current cycle)
- **Ideas** — Parsed ideas/topics under consideration
- **Ledger** — STX cost tracking and runway projections from `ledger.md`

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
5. Click **INSCRIBE ON-CHAIN** — this broadcasts transactions to Stacks mainnet

Each step requires the previous one to complete. The dashboard enforces this with preflight checks.

## Troubleshooting

### "Inscription failed: Failed to fetch"

This is a browser-level network error — the dashboard server was unreachable when you clicked the button. Check that the terminal running `npm start` is still alive. If the server crashed, restart it and try again.

### "SSE reconnecting..."

The live event stream lost connection. This usually means the server restarted or the network blipped. The UI reconnects automatically.

### Phase stuck / no output

Use the **CANCEL** button to kill the Claude subprocess, then retry. Check the terminal for error output from the spawned `claude` process.

### Port already in use

```
Port 2727 is already in use. Set PORT to another value and restart.
```

Another process is on port 2727. Either stop it or run with a different port: `PORT=3000 npm start`
