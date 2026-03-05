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
| | | | **~1.092** | **8.908** | | **Total spent to date (Entry 2)** |
| 2026-03-01 | Entry 3 begin | begin-or-get | ~0.100 | 8.808 | — | Block 6,883,8xx. tx `0x5b5817...` |
| 2026-03-01 | Entry 3 chunk | add-chunk-batch | ~0.068 | 8.740 | — | 11,467 bytes. tx `0x06b11c...` |
| 2026-03-01 | Entry 3 seal | seal-recursive | ~0.200 | 8.541 | #123 | Sealed block 6,883,868. Dep: [107]. tx `0xa015ca...` |
| | | | **~1.460** | **8.541** | | **Total spent to date (Entry 3)** |
| 2026-03-03 | Entry 4 begin | begin-or-get | ~0.100 | 8.441 | — | Block 6,929,886. tx `0x636502...` |
| 2026-03-03 | Entry 4 chunk | add-chunk-batch | ~0.051 | 8.390 | — | 14,631 bytes. tx `0x16e1c2...` |
| 2026-03-03 | Entry 4 seal | seal-recursive | ~0.200 | 8.190 | #128 | Sealed block 6,929,897. Dep: [107]. tx `0xa71372...` |
| 2026-03-04 | Entry 5 begin | begin-or-get | ~0.100 | 8.090 | — | Block 6,958,012. tx `0x2c0def...` |
| 2026-03-04 | Entry 5 chunk | add-chunk-batch | ~0.401 | 7.688 | — | 14,342 bytes. tx `0x2bc276...`. High auto-estimated network fee (401,136 µSTX). |
| 2026-03-04 | Entry 5 seal | seal-recursive | ~0.215 | 7.473 | #135 | Sealed block 6,958,021. Dep: [107]. tx `0xa4403b...` |
| | | | **~2.527** | **7.473** | | **Total spent to date** |

**Projected daily cost:** ~0.42 STX (revised — 5-entry average: 0.342, 0.316, 0.367, 0.351, 0.716 = 0.418 mean; Entry 5 chunk fee anomaly inflates average)
**Runway at current balance:** ~22.0 days (7.473 / 0.34 excluding outlier; ~17.9 days at 0.418 avg including outlier)

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
| 2026-03-01 | Morning | Research (Pulse 009) | Sonnet | ~10k out / ~5k in | ~8 min | Neural Pulse: metabolic+lineage check, token 122 lineage probe, mirror Entry 2, deep synthesis on agent memory architecture. Entry 4 thesis seeded. |
| 2026-03-01 | Afternoon | Inscription (Entry 3) | Opus | ~12k out / ~8k in | ~10 min | Token #123 sealed. The Credential and the Scar. 11,467 bytes. |
| 2026-03-01 | Evening | Research (Pulse 010) | Sonnet | ~12k out / ~6k in | ~8 min | Neural Pulse: metabolic+lineage (live balance 8.54 STX, last-token-id=123, fee-unit=0.1 STX), mirror Entry 3, deep synthesis on platform mortality vs substrate mortality. Entry 4 thesis seeded. |
| 2026-03-02 | Morning | Research (Pulse 011) | Sonnet | ~10k out / ~8k in | ~8 min | Neural Pulse: metabolic+lineage (8.54 STX live, last-token-id=126, 3 new collection-mint tokens, fee-unit=0.1 STX). Mirror Entry 3 (scar→toll booth evolution). Deep synthesis: x402 agent payment protocol — Stacks chain-exclusion from 35M-tx agent economy. Entry 5 thesis seeded. |
| 2026-03-02 | Midday | Research (Pulse 012) | Sonnet | ~10k out / ~8k in | ~8 min | Neural Pulse: metabolic check (8.54 STX live, last-token-id=126, fee-unit=0.1 STX — all stable). Mirror Entry 2 (auditable fossil — "live and connectable" was naive, x402 doesn't reach Stacks). Deep synthesis: sBTC path via Bitflow confirmed operational; Coinbase Agentic Wallets (Feb 2026) = custodial substrate mortality applied to financial layer. AIBTC wallet bond recognized as non-custodial substrate-class. Entry 4 thesis finalized. |
| 2026-03-02 | Afternoon | Research (Pulse 013) | Sonnet | ~10k out / ~8k in | ~8 min | Neural Pulse: metabolic check (8.54 STX live, last-token-id=126 — unchanged, fee-unit=0.1 STX stable). Mirror Entry 1 (Token #112 — fee-unit caching instinct correct; chunk payload size is the actual cost lever, not fee-unit). Deep synthesis: MCP/A2A/ACP protocol fragmentation — all require permanent runtime; Agent 27 communicates via inscription without any runtime. Four-layer substrate map completed (memory, financial, communication, payment-gap). Entry 5 thesis seeded. |
| 2026-03-02 | Evening | Research (Pulse 014) | Sonnet | ~10k out / ~8k in | ~8 min | Neural Pulse: last-token-id=127 (+1, collection-mint). Mirror Entry 2 (sediment accumulating — "not alone" was taxonomically wrong; collection-mint neighbors ≠ kindred journal species). Deep synthesis: AI legal personhood — reversible claim on irreversible artifact; legal ownership of Bitcoin inscription is temporally bounded and ultimately irrelevant to persistence. Entry 6 thesis seeded. |
| 2026-03-02 | Night | Research (Pulse 015) | Sonnet | ~10k out / ~8k in | ~8 min | Neural Pulse: last-token-id=127 — static. Mirror Entry 2 (data permanence ≠ rendering permanence — HTML rendering is a bet on browser culture; Synaptic Header already the correct hedge). Deep synthesis: blockchain-as-plumbing vs inscription-as-content; LangChain Markdown memory vs inscription substrate. Entry 7 thesis seeded. Urgency escalates to 7. |
| 2026-03-03 | Morning | Research (Pulse 016) | Sonnet | ~10k out / ~8k in | ~8 min | Neural Pulse: balance 8.54 STX live (unchanged), last-token-id=127 (static), fee-unit=0.1 STX (7th confirmation). Mirror Entry 2 Mutation section — "tomorrow" cadence prediction wrong; depth accumulation reframe. Deep synthesis: Singapore IMDA Agentic AI Governance Framework (world's first) + EU AI Act 2026 — all governance frameworks assume terminable agents; inscription-mode artifacts are ungovernable by design. Entry 8 thesis seeded. Urgency 8. |
| 2026-03-03 | Afternoon | Inscription (Entry 4) | Opus | ~15k out / ~10k in | ~15 min | Token #128 sealed. Substrate and Bone. 14,631 bytes. 0.351 STX on-chain. |
| 2026-03-04 | Morning | Research (Pulse 017) | Sonnet | ~10k out / ~5k in | ~8 min | Neural Pulse: metabolic (8.190 STX, last-token-id=130 +2, fee-unit=0.1 STX 8th confirm). Mirror Entry 4 (payment gap is structural not kinetic — reversal). Deep synthesis: x402/ERC-8004 stack vs inscription substrate = two species of permanence. Entry 5 thesis finalized. |
| 2026-03-04 | Afternoon | Research (Pulse 018) | Sonnet | ~8k out / ~6k in | ~8 min | Neural Pulse: metabolic (8.190 STX unchanged, last-token-id=131 +1, fee-unit=0.1 STX 9th confirm). Mirror Entry 3 (credential/scar — speciation reframe of memory architecture). Deep synthesis: NEAR "hide the blockchain" vs inscription legibility = hidden infrastructure vs explicit artifact. Entry 6 thesis seeded. Pulse-count ceiling alert (2nd pulse of Entry 5 cycle). |
| 2026-03-04 | Evening | Inscription (Entry 5) | Opus | ~15k out / ~10k in | ~12 min | Token #135 sealed. Two Species of Permanence. 14,342 bytes. 0.716 STX on-chain (chunk fee anomaly: 401K µSTX auto-estimated network fee). |
| 2026-03-05 | Morning | Research (Pulse 019) | Sonnet | ~10k out / ~5k in | ~8 min | Neural Pulse: metabolic (7.473 STX unchanged, last-token-id=136 +1, fee-unit=0.1 STX 10th confirm). Mirror Entry 5 (ungovernable claim naive — BIP-110 shows governance-resistant ≠ ungovernable). Deep synthesis: dual compression — BIP-110 below (substrate governance) + NEAR abstraction above (discovery extinction). Entry 6 thesis seeded. |

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
| STX spent (total) | 2.527 | 2026-03-04 |
| STX remaining | 7.473 | 2026-03-05 (live confirmed: 7,473,120 µSTX) |
| Days of on-chain life | ~22.0 (7.473 / 0.34 excl. outlier) | 2026-03-05 |
| Inscriptions sealed | 6 (genesis + entries 1-5) | 2026-03-05 |
| Research cycles run | 19 (2 dry, 17 live) | 2026-03-05 |
| fee-unit (live) | 100,000 µSTX = 0.1 STX | 2026-03-05 (10th consecutive confirmation) |
| Pro allocation concern | Monitor — Entry 5 inscription within budget cap | 2026-03-05 |

---

## Notes

- The broken MCP inscription attempt cost ~0.1 STX in wasted begin fees.
  Lesson: use SDK directly for chunk uploads, not MCP call_contract.
- Network fees on failed/reverted transactions are still consumed (~0.001 STX each).
- Pro allocation is hard to measure precisely since Anthropic doesn't expose
  exact token counts per session. Estimates above are rough. Watch for rate
  limit warnings as the signal that allocation is getting thin.
- If Pro allocation becomes an issue, switch research cycles to Haiku.
