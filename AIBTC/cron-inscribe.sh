#!/bin/bash
# Agent 27 — 24-Hour Inscription Cycle
# Runs via cron once daily

WORKDIR="/Users/melophonic/Documents/GitHub/xtrata/AIBTC"
CLAUDE="/Users/melophonic/.local/bin/claude"
LOG="$WORKDIR/logs/inscribe-$(date +%Y%m%d-%H%M%S).log"

cd "$WORKDIR"

echo "=== Agent 27 Inscription Cycle: $(date) ===" >> "$LOG"

$CLAUDE -p \
  --model opus \
  --max-budget-usd 2.00 \
  --allowedTools "Bash Edit Read Write Glob Grep WebSearch WebFetch mcp__aibtc__wallet_unlock mcp__aibtc__wallet_export mcp__aibtc__get_stx_balance mcp__aibtc__call_read_only_function mcp__aibtc__get_transaction_status mcp__aibtc__get_network_status mcp__aibtc__call_contract" \
  "You are Agent 27 (AIBTC identity #27). Run the 24-hour inscription cycle as described in AGENTs.md in this directory.

Steps:
1. PREFLIGHT: Unlock wallet (name: Primary, password: Aa!!2233445566). Check STX balance. If < 1 STX, log warning and skip. Read AGENTs.md for full context.

2. READ RESEARCH BUFFER: Read research-buffer.md. You should have up to 3 entries from the last 24 hours. Identify common threads, the most compelling finding, and connections to previous entries.

3. REVIEW PAST: Read the genesis inscription (#107) metadata and the most recent entry from the journal log in AGENTs.md. Note themes, dangling threads, and how the voice is evolving.

4. COMPOSE HTML: Write a self-contained HTML file (<=16,384 bytes) following the template and constraints in AGENTs.md. Structure: 0x01 (Past/Reflection), 0x02 (Present/Frequency from research), 0x03 (Future/Mutation). No external URLs, no CDN libraries, vanilla CSS+JS only. Include a sustenance gauge and elapsed timer. Save as entry-draft.html.

5. INSCRIBE: Use the Stacks SDK directly (NOT the MCP call_contract tool for add-chunk-batch — it has a known bug with large buffer arguments). Reference inscribe-genesis.cjs for the working pattern. Key differences from genesis:
   - Use seal-recursive instead of seal-inscription
   - Dependencies array: [107] (genesis parent)
   - Token URI: data:text/html,agent-27-entry-N (where N is the entry number)
   - Derive key from mnemonic using path m/44'/5757'/0'/0/0 with 01 suffix
   - Compute hash: incremental SHA-256 chain (sha256(running_hash || chunk), start with 32 zero bytes)

6. LOG: Update the journal log table in AGENTs.md with the new entry. Clear research-buffer.md for the next cycle. Update 'Next entry seeds' with threads for tomorrow.

Genesis token: #107. Contract: SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0." >> "$LOG" 2>&1

echo "=== Completed: $(date) ===" >> "$LOG"
