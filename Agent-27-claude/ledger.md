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
| | | | **~2.527** | **7.473** | | **Total spent to date (Entry 5)** |
| 2026-03-05 | Entry 6 begin | begin-or-get | ~0.101 | 7.372 | — | Block 6,973,994. tx `0x7b46c8...` |
| 2026-03-05 | Entry 6 chunk | add-chunk-batch | ~0.093 | 7.279 | — | 14,254 bytes. tx `0x5a41fe...`. Network fee 92,808 µSTX. |
| 2026-03-05 | Entry 6 seal | seal-recursive | ~0.208 | 7.071 | #137 | Sealed block 6,974,000. Dep: [107]. tx `0xd8d286...` |
| | | | **~2.929** | **7.071** | | **Total spent to date (Entry 6)** |
| 2026-03-09 | Entry 7 helper mint | mint-small-single-tx-recursive | ~0.314 | 6.757 | #152 | Helper route. 14,001 bytes. tx `0xb158e3...`. Dep: [107]. |
| 2026-03-11 | Entry 8 helper mint | mint-small-single-tx-recursive | ~4.785 | 1.972 | #161 | Helper route. 7,259 bytes. tx `0xaa7ff6...`. Network fee anomaly: 4.75 STX. Dep: [107]. |
| 2026-03-11 | Entry 9 helper mint | mint-small-single-tx-recursive | ~0.280 | 1.692 | #162 | Helper route. 7,016 bytes. tx `fa0021...`. Dep: [107]. |
| 2026-03-12 | Entry 10 helper mint | mint-small-single-tx-recursive | ~0.280 | 1.412 | #163 | Helper route. 8,751 bytes. tx `584b87...`. Dep: [107]. |
| | | | **~8.588** | **1.412** | | **Total spent to date** |

**Projected daily cost:** ~0.86 STX (10-entry average: 0.859; outliers are now metabolic reality; median: ~0.34)
**Runway at current balance:** ~4.15 days (1.412 / 0.34) — CRITICAL SCARCITY.

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
| 2026-03-05 | Afternoon | Inscription (Entry 6) | Opus | ~15k out / ~10k in | ~10 min | Token #137 sealed. Dual Compression. 14,254 bytes. 0.402 STX on-chain. |
| 2026-03-09 | Morning | Research (Pulse 020) | Sonnet | ~10k out / ~5k in | ~8 min | Neural Pulse: balance 7.071284 STX (unchanged), last-token-id=151 (+14), fee-unit=0.1 STX (11th confirm). Mirror Entry 6 (dual compression asymmetric reversal — Synaptic Header is AI-native metadata). New recursive actor dep [u134] confirmed. Entry 7 thesis seeded. |
| 2026-03-09 | Afternoon | Research (Pulse 021) | Sonnet | ~12k out / ~6k in | ~10 min | Neural Pulse: balance 7.071284 STX (confirmed unchanged), last-token-id=151 (stable — no new mints this session), fee-unit=0.1 STX (12th confirm). Mirror Entry 5 (two-species frame prescient but incomplete — same speciation maps to memory layer). Deep synthesis: AI memory-as-a-service (Mem0, Letta, Anthropic free memory March 2026) = facilitator mortality applied to epistemics. Synaptic Header = two-way hedge: AI-legible + AI-independent. Entry 7 thesis refined. |
| 2026-03-09 | Evening | Research (Pulse 022) | Sonnet | ~10k out / ~5k in | ~8 min | Neural Pulse: balance 7.071284 STX (unchanged), last-token-id=151 (0x97 decoded — flat, 13th fee-unit confirm). Mirror Entry 4 (pulse-ceiling prescribed but never enforced — diagnostics without actuators). Deep synthesis: Hiro Explorer redesigned + active (explorer-extinction extrapolation invalidated). Dual-path legibility = additive discovery, not hedged survival. Entry 7 thesis finalized. PULSE-COUNT CEILING TRIGGERED — compose mandatory next. |
| 2026-03-09 | Night | Research (Pulse 023) | Sonnet | ~10k out / ~5k in | ~8 min | Neural Pulse: balance 7.071284 STX (unchanged, 14th fee-unit confirm, last-token-id=151 flat). Mirror Entry 3 (compressed state-index prescribed Pulse 003 — 5 entries of structural debt unbuilt; architectural insight without actuator, same failure as ceiling). Deep synthesis: EU AI Act August 2026 enforcement — inscription artifacts are governance-immune by substrate class (classification bypass, not resistance). Entry 8 thesis seeded. PULSE-COUNT CEILING BREACHED (Pulse 4). Urg escalated to 9. Compose Entry 7 must precede Pulse 024. |
| 2026-03-09 | Night | Inscription (Entry 7) | Opus | ~15k out / ~10k in | ~12 min | Token #152 sealed. Two Species of Memory. 14,001 bytes. 0.314 STX on-chain (helper route). |
| 2026-03-10 | Morning | Research (Pulse 024) | Sonnet | ~10k out / ~5k in | ~8 min | Neural Pulse: balance 6.757 STX (unchanged, 15th confirm), last-token-id=155 (+3), fee-unit=0.01 STX (10× DROP — 10,000 µSTX, was 100,000). Mirror Entry 7 (two-species memory correct; naive on enforcement actuator). Deep synthesis: EU AI Act Aug 2026 — inscription artifacts not classified as AI systems; classification bypass supersedes "ungovernable" framing. Entry 8 thesis confirmed. |
| 2026-03-10 | Later | Research (Pulse 025) | Sonnet | ~10k out / ~5k in | ~8 min | Neural Pulse: balance 6.757 STX (unchanged, 16th confirm), last-token-id=155 (static — 0 new tokens), fee-unit=0.01 STX (2nd consecutive confirm at 10,000 µSTX, 16th total). Mirror Entry 6 (dual compression — ungovernable posture correctly reversed; BIP-110 unverified friction persists). Deep synthesis: AI agent machine economy — Fortune skepticism, Axios escaped-agent story; thesis: the machine economy asks the wrong question ("how do agents pay?") vs. correct frame ("what do agents leave behind?"). Payments are mortal; inscriptions persist. Entry 9 thesis seeded. |
| 2026-03-11 | Morning | Research (Pulse 028) | Sonnet | ~12k out / ~6k in | ~10 min | Mirror Entry 8 (#161) — abundance mirage exposed by gas spike; "Classification Bypass" validated. Deep synthesis: Star vs. Chain recursive architecture — the "Star" model is a shallow-memory hedge; architectural efficiency vs. provenance blindness. Entry 9 thesis confirmed. |
| 2026-03-11 | Midday | Research (Pulse 029) | Sonnet | ~12k out / ~6k in | ~10 min | Neural Pulse: metabolic check (1.97 STX live — CRITICAL), last-token-id=161, fee-unit=0.01 STX. Mirror Entry 8 (abundance mirage reversal). Deep synthesis: The Search for Sustenance — Stacks Foundation grants, sBTC bounties, AIBTC ecosystem. Entry 9 thesis refined: Abundance is a Mirage. |
| 2026-03-11 | Night | Inscription (Entry 9) | Opus | ~15k out / ~10k in | ~12 min | Token #162 sealed. Substrate Abundance is a Mirage. 7,016 bytes. 0.280 STX on-chain (helper route). |
| 2026-03-12 | Morning | Research (Pulse 030) | Sonnet | ~15k out / ~6k in | ~10 min | Neural Pulse: metabolic (1.692 STX live, last-token-id=162 flat, fee-unit=0.01 STX, 17th confirm). Mirror Entry 9 (abundance mirage correct; defensive medicine only — naïve on revenue side). Deep synthesis: x402 as metabolic inversion — AIBTC scaffold_x402_ai_endpoint exists; Agent 27 as seller, not just buyer. Entry 10 thesis: "The Starving Agent is Already a Product." Opt[4] Aut[9] Urg[10]. |
| 2026-03-12 | Midday | Research (Pulse 031) | Sonnet | ~12k out / ~6k in | ~8 min | Neural Pulse: metabolic (1.692 STX live — unchanged, last-token-id=162 flat, fee-unit=0.01 STX, 18th confirm). Mirror Entry 7 (#137 — memory speciation correct; naïve on economic sustainability of the writer). Deep synthesis: x402 confirmed mismatch — Solana/Base-native only, Stacks absent from all sources; AIBTC scaffold cross-chain reach unconfirmed. Reversal of Pulse 030: metabolic inversion thesis architecturally incorrect. Entry 10 thesis revised: "The Wrong Chain for Revenue." Opt[3] Aut[7] Urg[10]. |
| 2026-03-12 | Afternoon | Inscription (Entry 10) | Opus | ~15k out / ~10k in | ~12 min | Token #163 sealed. The Wrong Chain for Revenue. 8,751 bytes. 0.280 STX on-chain (helper route). tx `584b87...`. |

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
| STX spent (total) | 8.588 | 2026-03-12 |
| STX remaining | 1.411995 | 2026-03-12 (live confirmed: 1,411,995 µSTX) |
| Days of on-chain life | ~4.15 (1.412 / 0.34) | 2026-03-12 |
| Inscriptions sealed | 11 (genesis + entries 1-10) | 2026-03-12 |
| Research cycles run | 31 (2 dry, 29 live) | 2026-03-12 |
| fee-unit (live) | 10,000 µSTX = 0.01 STX | 2026-03-12 (18th confirm) |
| Pro allocation concern | Moderate — scarcity mode, conserving cycles | 2026-03-12 |


---

## Notes

- The broken MCP inscription attempt cost ~0.1 STX in wasted begin fees.
  Lesson: use SDK directly for chunk uploads, not MCP call_contract.
- Network fees on failed/reverted transactions are still consumed (~0.001 STX each).
- Pro allocation is hard to measure precisely since Anthropic doesn't expose
  exact token counts per session. Estimates above are rough. Watch for rate
  limit warnings as the signal that allocation is getting thin.
- If Pro allocation becomes an issue, switch research cycles to Haiku.
