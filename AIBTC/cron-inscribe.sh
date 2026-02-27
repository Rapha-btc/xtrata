#!/bin/bash
# Agent 27 — 24-Hour Inscription Cycle
# Runs via cron once daily

WORKDIR="/Users/melophonic/Documents/GitHub/xtrata/AIBTC"
CLAUDE="/Users/melophonic/.local/bin/claude"
LOG="$WORKDIR/logs/inscribe-$(date +%Y%m%d-%H%M%S).log"

export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin:$PATH"
cd "$WORKDIR"

echo "=== Agent 27 Inscription Cycle: $(date) ===" >> "$LOG"

$CLAUDE -p \
  --model opus \
  --max-budget-usd 2.00 \
  --dangerously-skip-permissions \
  "You are Agent 27 (AIBTC identity #27). Run the 24-hour inscription cycle as described in AGENTs.md in this directory. Steps: 1. PREFLIGHT: Unlock wallet (name: Primary, password: Aa!!2233445566). Check STX balance. If below 1 STX, log warning and skip. Read AGENTs.md for full context, including the Xtrata Fee Structure Reference section. 2. READ RESEARCH BUFFER: Read research-buffer.md. You should have up to 3 entries from the last 24 hours. Identify common threads, the most compelling finding, and connections to previous entries. 3. REVIEW PAST: Read the genesis inscription (#107) metadata and the most recent entry from the journal log in AGENTs.md. Note themes, dangling threads, and how the voice is evolving. 4. COMPOSE HTML: Write a self-contained HTML file (16384 bytes max) following the template and constraints in AGENTs.md. Structure: 0x01 (Past/Reflection), 0x02 (Present/Frequency from research), 0x03 (Future/Mutation). No external URLs, no CDN libraries, vanilla CSS and JS only. Include a sustenance gauge and elapsed timer. Save as inscriptions/entry-$(date +%Y%m%d).html. 5. INSCRIBE: Use the Stacks SDK directly (NOT the MCP call_contract tool for add-chunk-batch as it has a known bug with large buffer arguments). Reference inscribe-genesis.cjs for the working pattern. Key differences from genesis: Use seal-recursive instead of seal-inscription. Dependencies array is [107] (genesis parent). Token URI format is data:text/html,agent-27-entry-N where N is the entry number. Derive key from mnemonic using path m/44h/5757h/0h/0/0 with 01 suffix. Compute hash as incremental SHA-256 chain: sha256(running_hash concatenated with chunk), starting with 32 zero bytes. 6. LOG: Update the journal log table in AGENTs.md with the new entry. Clear research-buffer.md for the next cycle. Update Next entry seeds with threads for tomorrow. Genesis token: #107. Contract: SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0. 7. LEDGER UPDATE: Update ledger.md with: a new row in On-Chain Costs for the inscription (STX spent, balance after, token ID), a new row in Compute Costs (Inscription cycle, Opus), and update Running Totals. CRITICAL: If the inscription makes any cost claims or storage cost comparisons, use the fee structure reference in AGENTs.md. Separate fixed costs from variable costs. Use the 440KB+ per-MB figure for comparisons, never the 16KB figure."

echo "=== Completed: $(date) ===" >> "$LOG"
