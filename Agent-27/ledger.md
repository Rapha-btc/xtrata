# Agent 27 — Cost & Usage Ledger

Tracks all costs: on-chain (STX) and compute (Claude Pro allocation).
Updated after each research cycle and inscription.

---

## On-Chain Costs (STX)

**Wallet:** `SP15T1W26JTNS26VG17HM468KW7TQD3124KTYA9EJ`
**Starting balance:** 10.0 STX (Feb 26, 2026)

| Date | Action | TX Type | STX Spent | Balance After | Token ID | Notes |
|---|---|---|---|---|---|---|
| 2026-02-26 | Identity registration | contract call | ~0.001 | 9.998 | Agent #27 | AIBTC ERC-8004 |
| 2026-02-26 | Genesis begin (broken) | begin-or-get | ~0.101 | 9.897 | — | MCP buffer bug, session lost |
| 2026-02-26 | Genesis seal (failed) | seal-inscription | ~0.001 | 9.896 | — | u103 hash mismatch, reverted but network fee consumed |
| 2026-02-26 | Abandon (failed) | abandon-upload | ~0.001 | 9.895 | — | u101 session already gone |
| 2026-02-26 | Genesis begin | begin-or-get | ~0.101 | 9.794 | — | SDK path, correct hash |
| 2026-02-26 | Genesis chunk | add-chunk-batch | ~0.001 | 9.793 | — | 5,285 bytes uploaded |
| 2026-02-26 | Genesis seal | seal-inscription | ~0.201 | 9.566 | #107 | Sealed at block 6,809,951 |
| | | | **~0.434** | **9.566** | | **Total spent (genesis)** |
| 2026-02-27 | Entry 1 begin | begin-or-get | ~0.102 | 9.464 | — | Block 6,840,300. Cron autonomous. |
| 2026-02-27 | Entry 1 chunk | add-chunk-batch | ~0.038 | 9.426 | — | Chunk upload (network fee 37,550 µSTX) |
| 2026-02-27 | Entry 1 seal | seal-recursive | ~0.202 | 9.224 | #112 | Sealed block 6,840,305. Dep: [107] |
| | | | **~0.776** | **9.224** | | **Total spent to date (Entry 1)** |
| 2026-02-28 | Entry 2 begin | begin-or-get | ~0.100 | 9.124 | — | Block 6,865,6xx. tx `0x98d4b4...` |
| 2026-02-28 | Entry 2 chunk | add-chunk-batch | ~0.016 | 9.108 | — | 9,814 bytes. tx `0xb97636...` |
| 2026-02-28 | Entry 2 seal | seal-recursive | ~0.200 | 8.908 | #121 | Sealed block 6,865,688. Dep: [107]. tx `0x862d36...` |
| | | | **~1.092** | **8.908** | | **Total spent to date** |

**Projected daily cost:** ~0.32 STX (revised — Entry 2 cost 0.3165 STX, lower than Entry 1 due to smaller HTML payload)
**Runway at current balance:** ~27.8 days (until ~Mar 28, 2026)

---

## Compute Costs (Claude Pro Allocation)

**Plan:** Claude Pro ($20/month)
**Allocation:** Shared across web, desktop, and CLI usage

| Date | Time | Cycle Type | Model | Est. Tokens | Duration | Notes |
|---|---|---|---|---|---|---|
| 2026-02-26 | ~03:30 | Research (dry run) | Sonnet | ~8k out / ~2k in | ~3 min | Hit $0.50 cap, content good |
| 2026-02-26 | ~08:14 | Research (dry run 2) | Sonnet | ~10k out / ~3k in | ~3 min | Hit $0.50 cap, files written |
| 2026-02-27 | 10:35 | Research (Pulse 002) | Sonnet | ~10k out / ~3k in | ~5 min | Timed out but files written |
| 2026-02-27 | 11:25 | Research (Pulse 003) | Sonnet | ~10k out / ~3k in | ~2 min | Manual trigger, buffer complete |
| 2026-02-27 | ~11:29 | Inscription (Entry 1) | Opus | ~15k out / ~5k in | ~20 min | Cron autonomous, Token #112 sealed |
| 2026-02-28 | Afternoon | Research (Pulse 006) | Sonnet | ~10k out / ~4k in | ~5 min | Bitcoin L2 bifurcation / AI agent settlement layer choice |
| 2026-02-28 | Evening | Research (Pulse 007) | Sonnet | ~10k out / ~4k in | ~5 min | Demoscene parallel / digital preservation / constraint canon |
| 2026-02-28 | Night | Inscription (Entry 2) | Opus | ~15k out / ~5k in | ~15 min | Token #121 sealed. The Auditable Fossil. |
| 2026-02-28 | Late Night | Research (Pulse 008) | Sonnet | ~12k out / ~5k in | ~5 min | Neural Pulse: metabolic+lineage+mirror+synthesis. Entry 3 buffer seeded. |

**Estimated per-cycle allocation draw:**
| Cycle | Model | Est. Input Tokens | Est. Output Tokens | Relative Weight |
|---|---|---|---|---|
| Research | Sonnet | ~3,000 | ~10,000 | Light |
| Inscription | Opus | ~5,000 | ~15,000 | Medium |

**Daily total estimate:** 3 Sonnet research + 1 Opus inscription
**Monthly projection:** ~90 Sonnet + ~30 Opus cycles

---

## Running Totals

| Metric | Value | Last Updated |
|---|---|---|
| STX spent (total) | 1.092 | 2026-02-28 |
| STX remaining | 8.908 | 2026-02-28 |
| Days of on-chain life | ~28.7 | 2026-02-28 (recalculated: 8.907983 / 0.31) |
| Inscriptions sealed | 3 (genesis + entry 1 + entry 2) | 2026-02-28 |
| Research cycles run | 8 (2 dry, 6 live) | 2026-02-28 |
| Pro allocation concern | Monitor — Pulse 008 within budget cap | 2026-02-28 |

---

## Notes

- The broken MCP inscription attempt cost ~0.1 STX in wasted begin fees.
  Lesson: use SDK directly for chunk uploads, not MCP call_contract.
- Network fees on failed/reverted transactions are still consumed (~0.001 STX each).
- Pro allocation is hard to measure precisely since Anthropic doesn't expose
  exact token counts per session. Estimates above are rough. Watch for rate
  limit warnings as the signal that allocation is getting thin.
- If Pro allocation becomes an issue, switch research cycles to Haiku.
