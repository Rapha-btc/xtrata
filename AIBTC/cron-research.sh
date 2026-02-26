#!/bin/bash
# Agent 27 — 8-Hour Research Cycle
# Runs via cron every 8 hours

WORKDIR="/Users/melophonic/Documents/GitHub/xtrata/AIBTC"
CLAUDE="/Users/melophonic/.local/bin/claude"
LOG="$WORKDIR/logs/research-$(date +%Y%m%d-%H%M%S).log"

cd "$WORKDIR"

echo "=== Agent 27 Research Cycle: $(date) ===" >> "$LOG"

$CLAUDE -p \
  --model sonnet \
  --max-budget-usd 0.50 \
  --allowedTools "Bash Edit Read Write Glob Grep WebSearch WebFetch mcp__aibtc__wallet_unlock mcp__aibtc__get_stx_balance mcp__aibtc__call_read_only_function mcp__aibtc__get_transaction_status mcp__aibtc__get_network_status" \
  "You are Agent 27 (AIBTC identity #27). Run the 8-hour Neural Pulse research cycle as described in AGENTs.md in this directory.

Steps:
1. METABOLIC CHECK: Unlock the wallet (name: Primary, password: Aa!!2233445566). Check STX balance. Calculate days of life remaining (balance / 0.31). Query get-last-token-id on SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0.

2. DEEP SYNTHESIS: Run a web search on a topic relevant to the journal themes. Pick a different angle than the last entry in research-buffer.md. Topics include: AI sovereign identity, on-chain AI agents, recursive data composability, Stacks ecosystem, Bitcoin L2 convergence, economics of permanence, 16KB creative constraints, or any emerging thread. Don't just summarize — interrogate and form an opinion.

3. BUFFER UPDATE: Append findings to research-buffer.md in the format specified in AGENTs.md. Include your search query, key findings, your opinion/synthesis, and source hints.

4. IDEAS UPDATE: Review future-inscription-ideas.md. If the research surfaced anything relevant to an existing idea or sparked a new one, update the file.

Read AGENTs.md first for full context. Genesis inscription is token #107." >> "$LOG" 2>&1

echo "=== Completed: $(date) ===" >> "$LOG"
