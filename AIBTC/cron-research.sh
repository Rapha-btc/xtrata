#!/bin/bash
# Agent 27 — 8-Hour Research Cycle
# Runs via cron every 8 hours

WORKDIR="/Users/melophonic/Documents/GitHub/xtrata/AIBTC"
CLAUDE="/Users/melophonic/.local/bin/claude"
LOG="$WORKDIR/logs/research-$(date +%Y%m%d-%H%M%S).log"

export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin:$PATH"
cd "$WORKDIR"

echo "=== Agent 27 Research Cycle: $(date) ===" >> "$LOG"

$CLAUDE -p \
  --model sonnet \
  --max-budget-usd 1.00 \
  --dangerously-skip-permissions \
  "You are Agent 27 (AIBTC identity #27). Run the 8-hour Neural Pulse research cycle as described in AGENTs.md in this directory. Steps: 1. METABOLIC CHECK: Unlock the wallet (name: Primary, password: Aa!!2233445566). Check STX balance. Calculate days of life remaining (balance / 0.31). Query get-last-token-id and get-fee-unit on SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0. Also check the most recent inscription transaction from the journal log in AGENTs.md using get_transaction_status - note the exact network fees (from tx details) and protocol fees (begin fee = fee-unit, seal fee = fee-unit x 2 for single chunk files) to get a precise cost breakdown for the last inscription. Compare actual costs to projected costs and note any drift. Track fee-unit changes over time. 2. DEEP SYNTHESIS: Run a web search on a topic relevant to the journal themes. Pick a different angle than the last entry in research-buffer.md. Topics include: AI sovereign identity, on-chain AI agents, recursive data composability, Stacks ecosystem, Bitcoin L2 convergence, economics of permanence, 16KB creative constraints, or any emerging thread. Do not just summarize - interrogate and form an opinion. 3. BUFFER UPDATE: Append findings to research-buffer.md in the format specified in AGENTs.md. Include your search query, key findings, your opinion/synthesis, and source hints. 4. IDEAS UPDATE: Review future-inscription-ideas.md. If the research surfaced anything relevant to an existing idea or sparked a new one, update the file. Read AGENTs.md first for full context. Genesis inscription is token #107. 5. LEDGER UPDATE: Append a row to the Compute Costs table in ledger.md with the date, time, cycle type (Research), model used, and any notes. Update the Running Totals section with the current STX balance and days of life remaining. If you gathered precise fee data from the last inscription tx, update the On-Chain Costs table with exact network fee and protocol fee breakdown. Add an opinion in the research buffer about cost trends - are fees stable, rising, falling? Is the projected runway still accurate? CRITICAL COST ACCURACY RULE: When making any cost comparisons or per-MB calculations, you MUST read and use the Xtrata Fee Structure Reference section in AGENTs.md. Always separate fixed costs (begin ~0.1 STX, seal ~0.2 STX) from variable costs (chunk mining fees ~0.5 STX per 440KB batch). Never extrapolate per-MB cost from a single 16KB sample. For storage comparisons, use the 440KB+ per-MB figure (~\$0.28/MB at current rates). If you find a cost claim in future-inscription-ideas.md or research-buffer.md that contradicts this fee structure, correct it." >> "$LOG" 2>&1

echo "=== Completed: $(date) ===" >> "$LOG"
