# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Agent 27 is an autonomous AI agent that inscribes daily journal entries as permanent HTML artifacts on Stacks, anchored to Bitcoin, using the Xtrata protocol. Each entry is a recursive child of Genesis inscription **#107**, forming a star graph of identity and reasoning.

## Key Commands

### Dashboard (primary interface)
```bash
cd dashboard && npm install && npm start    # Express server on port 2727
cd dashboard && npm run dev                 # Dev mode with --watch
```

### Inscription (SDK-based, never MCP)
```bash
ENTRY_NUM=3 node inscribe-entry.cjs         # Inscribe entry-draft.html on-chain
```

### Phase execution via dashboard CLI
```bash
cd dashboard && node claude-runner.js research   # Run research pulse (sonnet, 5min)
cd dashboard && node claude-runner.js compose     # Run compose phase (opus, 10min)
```

No test suite exists. No linter configured.

## Architecture

### Operational Cycle (24-hour)

1. **Research Pulse** — Metabolic check (STX balance, chain state), Mirror Protocol (review prior entry), web synthesis, update `research-buffer.md`
2. **Compose** — Read AGENTs.md + research-buffer.md + EVOLUTION.md → generate self-contained HTML entry (≤16,384 bytes) → save to `inscriptions/entry-YYYYMMDD.html`
3. **Inscribe** — SDK calls: `begin-or-get` → `add-chunk-batch` → `seal-recursive` with `dependencies: [107]`

### Source of Truth Hierarchy

1. **AGENTs.md** — Identity spec, protocol rules, journal log. Always wins on conflicts.
2. **GEMINI.md** — Non-negotiable origin memory mandates.
3. **dashboard/phases.js** — Phase prompt definitions (what each phase does).

### Key Files

| File | Role |
|------|------|
| `AGENTs.md` | Identity + protocol rules + journal history |
| `GEMINI.md` | Non-negotiable origin memory mandates |
| `EVOLUTION.md` | Environmental pressures for emergent behavior |
| `research-buffer.md` | Working research notes (cleared after inscription; seeds carried forward) |
| `future-inscription-ideas.md` | Evolutionary roadmap and queued essay ideas |
| `ledger.md` | STX cost tracking and runway |
| `inscriptions/` | Draft HTML files for inscription (`entry-YYYYMMDD.html`) |
| `inscriptions/archive/` | Past inscribed entries (available for Mirror Protocol) |
| `inscribe-entry.cjs` | Production inscription script (Stacks SDK) |
| `dashboard/server.js` | Express server, routes, SSE |
| `dashboard/phases.js` | Phase definitions + prompts |
| `dashboard/claude-runner.js` | Spawns Claude CLI for phase execution |
| `dashboard/chain.js` | Polls Stacks chain (balance, fees, token count) |
| `dashboard/config.js` | Shared constants (wallet, contract, genesis token) |

### Dashboard Routes
- `GET /api/status` — Phase state + chain data
- `POST /api/phases/:phaseId/run` — Trigger a phase
- `POST /api/phases/:phaseId/cancel` — Stop a phase
- `GET /events` — SSE stream for live logs

## Critical Rules

- **Recursive lineage:** Every `seal-recursive` call MUST use `dependencies: [107]` (Genesis). All entries are direct children of root.
- **Anti-Loop Directive:** New entries must not repeat a prior thesis. Evolve or reverse with evidence.
- **MCP buffer bug:** The AIBTC MCP `call_contract` tool sends EMPTY buffers for large hex data. Always use the Stacks SDK directly (`inscribe-entry.cjs` pattern) for `add-chunk-batch`.
- **Self-contained HTML:** No external URLs, CDNs, or platform dependencies in inscriptions.
- **Size limit:** Entries must be ≤16,384 bytes.
- **Manual approval only:** All inscriptions require human review. Cron scripts are intentionally disabled.

## Inscription HTML Structure

Every entry contains a Synaptic Header (`<script type="application/agent27-state">`) with machine-readable JSON (id, parent, vectors, thesis, topics, friction), followed by four narrative sections: Reflection, Frequency, Mutation, Friction Log.

## Wallet & Signing

- Mnemonic derivation: `m/44'/5757'/0'/0/0` + `01` suffix
- Address: `SP15T1W26JTNS26VG17HM468KW7TQD3124KTYA9EJ` (Stacks mainnet)
- Contract: `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0`

## Hash Verification

Incremental SHA-256 chain starting with 32 zero bytes. For each chunk: `sha256(running_hash || chunk_bytes)`. This must match what the Xtrata contract computes in `process-chunk`.

## Dependencies

- Root: `@stacks/transactions`, `@stacks/network`, `@scure/bip32`, `@scure/bip39`
- Dashboard: `express`, `chokidar`
- Node.js ≥22 required
