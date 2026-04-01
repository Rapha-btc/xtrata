# Twitter Engagement Diversity Rules
**Project:** @XtrataLayers — Xtrata.xyz promotion on X/Twitter
**Last Updated:** 2026-03-29
**Purpose:** This file is read at the START of every automation run. It governs who we engage with, how often, which search strategies we use, and how we self-improve over time. DO NOT skip reading this file.

---

## ⚠️ Hard Rules — Non-Negotiable

1. **Author cooldown: 14 days.** Never reply to the same author more than once per 14-day window. Check the Engagement History table before every reply.
2. **Thread deduplication.** Never reply to a thread already in `posted-threads-log.json`. Always check it.
3. **Search strategy rotation.** Never use the same search strategy more than 2 consecutive runs without rotating to a different one.
4. **Diversity gate.** If >30% of candidate threads in a search result are from authors already in cooldown → STOP. Change search terms. Do not post to repeat authors.
5. **Standalone tweet angles.** Check the last 3 standalone tweets in the daily activity logs. Never repeat the same angle (builder / collection / data / composability / cheap storage) on consecutive tweets.
6. **Follow deduplication.** Always check `followed_accounts_log.txt` before following anyone. Never follow someone already in the log.

---

## 📋 Search Strategy Rotation Log

Track which strategy was used each run. Rotate when a strategy has been used twice in a row.

| Run Date & Time     | Strategy Used                                     | Notes                        |
|---------------------|---------------------------------------------------|------------------------------|
| 2026-03-27 10:34    | Strategy 1: $STX OR #sBTC -filter:retweets        | Initial setup                |
| 2026-03-27 12:10    | Stacks inscription / sBTC / Bitcoin L2 terms      |                              |
| 2026-03-27 22:31    | Stacks ecosystem / builder search                 |                              |
| 2026-03-28 02:10    | Stacks NFT / generative art / NeuralMint          |                              |
| 2026-03-28 04:09    | On-chain agents / composable data / Stacks TCM    |                              |
| 2026-03-28 06:09    | Bitcoin L1 use cases / Stacks L2 comparison       |                              |
| 2026-03-28 08:10    | Stacks DeFi / ecosystem news                      |                              |
| 2026-03-28 12:08    | Strategy 3: @hirosystems follower graph           |                              |
| 2026-03-28 16:10    | Strategy 3: @hirosystems follower graph           | 2nd consecutive — rotate next|
| 2026-03-28 20:33    | Strategy 3: @hirosystems follower graph           | ⚠️ 3rd consecutive           |
| 2026-03-29 00:09    | Strategy 3: @hirosystems / @Xverse_App followers  | ⚠️ 4th consecutive — ROTATE  |
| 2026-03-29 04:09    | Strategy 3: @hirosystems followers                | ⚠️ 5th consecutive — MUST ROTATE |
| 2026-03-29 08:09    | Strategy 3: @hirosystems followers                | ⚠️ 6th consecutive — MUST ROTATE |
| 2026-03-29 12:09    | Strategy 6: sBTC / Bitcoin DeFi — @ZestProtocol followers | Discovery mode — no replies/tweets |
| 2026-03-29 16:09    | Strategy 8/6/7 hybrid: NFT/DeFi/AI — @MegapontNFT, @ArkadikoFinance, @aibtcdev | Strategy 4 invalid (@Xverse_App = wrong account) — multi-source pivot |
| 2026-03-30 00:09    | Strategy 2: @StacksOrg follower graph — first use | 22/30 follows (bot noise high in @StacksOrg list) |
| 2026-03-30 06:09    | Strategy 4: @NOXtoshi follower graph — NFT artist community | Promotional-specific mode (DYLE0415). 15/15 follows from @NOXtoshi followers. Source: fresh Ordinals/generative art community. |

**➡️ NEXT RUN: Strategy 5 (IPFS/data permanence) or Strategy 4 continued (NFT artist — @NOXtoshi was quality, can reuse or try @prrfbeauty/@RabbitCartel followers). Strategy 3 rested. Strategy 2 rested 1 run. Promotional-specific mode continues (DYLE0415 until 2026-04-06).**

---

## 🔄 Available Search Strategies

Rotate through these. Aim to cycle all 8 before repeating any.

| # | Strategy | Search Approach | Last Used |
|---|----------|-----------------|-----------|
| 1 | Bitcoin L2 builders | `"Bitcoin L2" OR "Stacks" builder inscribe OR inscription -filter:retweets` | 2026-03-28 |
| 2 | Ordinals / BRC-20 crossover | `Ordinals OR BRC-20 OR "Bitcoin NFT" on-chain storage permanent -filter:retweets` | Never |
| 3 | @hirosystems follower graph | Browse @hirosystems recent followers / interactions | 2026-03-29 (overused — rest) |
| 4 | NFT artist community | `#NFTartist OR #NFTcommunity OR "generative art" "on-chain" -filter:retweets` + browse followers of @NOXtoshi, @prrfbeauty, @RabbitCartel (validated HIGH quality sources — @Xverse_App handle is invalid, do not use) | 2026-03-30 |
| 5 | Data permanence / IPFS critique | `IPFS "link rot" OR "IPFS down" OR "decentralized storage" -filter:retweets` | Never |
| 6 | sBTC / Bitcoin DeFi angle | `sBTC OR "Bitcoin DeFi" OR "Stacks DeFi" -filter:retweets lang:en` | 2026-03-29 |
| 7 | AI agents + on-chain data | `"AI agents" OR "on-chain AI" "Bitcoin" OR "Stacks" -filter:retweets` | 2026-03-28 |
| 8 | GameFi / on-chain gaming | `GameFi OR "on-chain game" OR "blockchain gaming" Stacks OR Bitcoin L2 -filter:retweets` | Never |

---

## 👤 Author Engagement History (Cooldown: 14 days)

Authors engaged with a reply. Do not reply to these again until 14 days after the last engagement date.

| Author | Last Engaged | Cooldown Expires | Thread Topic |
|--------|-------------|-----------------|--------------|
| @Frei_reitarded | 2026-03-27 | 2026-04-10 | BLOC PARTY collection launch |
| @ddtrvlr | 2026-03-27 | 2026-04-10 | Stacks wallet / StacksFolio |
| @love_is_thy_way | 2026-03-27 | 2026-04-10 | Recursive Ordinals (love_message) |
| @jimdotbtc | 2026-03-27 | 2026-04-10 | Xtrata technical explanation |
| @DeOrganizedBTC | 2026-03-27 | 2026-04-10 | Stacks ecosystem snapshot |
| @Rick_Sebastiaan | 2026-03-27 | 2026-04-10 | Stacks ecosystem / builder adoption |
| @GPSC_STX | 2026-03-27 | 2026-04-10 | Diamond hands / builder community |
| @xcryptodigi | 2026-03-27 | 2026-04-10 | Turkish researcher — Stacks/STX TVL |
| @StacksMarketApp | 2026-03-27 | 2026-04-10 | Memecoins on Stacks Market |
| @vikingblood_ | 2026-03-27 | 2026-04-10 | BTC Agents / @aibtcdev on Stacks |
| @herogamer21btc | 2026-03-28 | 2026-04-11 | Weekly Stacks digest — SIP-039 |
| @willycodexwar | 2026-03-28 | 2026-04-11 | Generative NFT badges on Stacks |
| @serayd61 | 2026-03-28 | 2026-04-11 | NeuralMint — AI-generated NFTs |
| @jackbinswitch | 2026-03-28 | 2026-04-11 | Stacks TCM / on-chain agents |
| @Stackslaborg | 2026-03-28 | 2026-04-11 | LabSTX / Clarinet v3.15 |
| @mrwagmibtc | 2026-03-28 | 2026-04-11 | Agent registration platform |
| @CryptoPulse | 2026-03-28 | 2026-04-11 | Bitcoin L1 use cases / limitations |
| @STXOSHI_20 | 2026-03-29 | 2026-04-12 | Stacks ecosystem / DeFi (×2 — ⚠️ repeat!) |
| @trends24by7 | 2026-03-29 | 2026-04-12 | AI agents on Stacks — 62+ agents |
| @mannymoebtc | 2026-03-29 | 2026-04-12 | GM post — Stacks community |
| @cryptosmith_btc | 2026-03-29 | 2026-04-12 | On-chain rewards / player legacy |
| @NakaDrawSTX | 2026-03-29 | 2026-04-12 | NakaDraw lottery on Stacks |
| @PuppaCoin | 2026-03-29 | 2026-04-12 | STX price prediction / $10 target |
| @WhisprNews | 2026-03-29 | 2026-04-12 | Top 10 GameFi by MarketCap |
| @DiegoMey | 2026-03-29 | 2026-04-12 | (details not captured) |
| @k9dreamer_btc | 2026-03-29 | 2026-04-12 | (details not captured) |
| @Ole14638543 | 2026-03-30 | 2026-04-13 | On-chain art sentiment — DYLE0415 promo |
| @NOXtoshi | 2026-03-30 | 2026-04-13 | Ordinals artists defense thread — DYLE0415 promo |
| @ACEband2021 | 2026-03-30 | 2026-04-13 | Stacks NFT activity / GMFL Season Pass — DYLE0415 promo |

**⚠️ NOTE:** @STXOSHI_20 was engaged twice (2026-03-28 and 2026-03-29). This is a repeat engagement — exactly what we're trying to prevent. Do not let this happen again. If a name appears in search results and they're already in this table, SKIP them.

---

## 🔍 Search Noise — Authors to Exclude from Results

These accounts keep appearing in search results but are either already in cooldown or not a good fit. Exclude them from target selection.

| Account | Reason to Exclude | Added |
|---------|-------------------|-------|
| @TheSBTC | Small Business in Transportation Coalition — not crypto-related despite matching "SBTC" | 2026-03-29 |
| @econJaredB | Economist — matches "sBTC" search noise | 2026-03-29 |
| @Stiockiqoo_org | Spam/bot account pattern (random alphanumeric, AO.org/net/app pattern) | 2026-03-29 |
| @Stckrimqao_net | Same spam pattern as above | 2026-03-29 |
| @SockirnqBo_app | Same spam pattern | 2026-03-29 |
| @Stockinaro_org | Same spam pattern | 2026-03-29 |

**Bot pattern to auto-skip:** Accounts matching `[A-Z][a-z]+[A-Z][a-z]+\.(org|net|app|io)` format are consistently spam — skip without checking.

---

## 📖 Follower Source Quality Guide

Rated by signal-to-noise ratio observed in practice. Use HIGH-rated sources first.

| Source Account | Strategy # | Quality | Notes | Last Browsed |
|----------------|------------|---------|-------|--------------|
| @ZestProtocol | 6 | HIGH | Stacks DeFi lending — followers genuinely interested in on-chain finance. Good mix of builders and users. | 2026-03-29 |
| @ArkadikoFinance | 6 | HIGH | Stacks stablecoin/DeFi — similar quality to ZestProtocol. Good signal, genuine builders/users. | 2026-03-29 |
| @BitflowFinance | 6 | LOW | Stacks DEX — "Something went wrong" error on 2 consecutive runs (Run 5 & Run 6). Do not use until source is confirmed accessible. | 2 failures |
| @LiquidiumWTF | 8 | HIGH (est.) | Ordinals-based DeFi — great Bitcoin DeFi crossover audience | Untested |
| @MegapontNFT | 8 | MEDIUM | Stacks NFT project — genuine NFT collectors, some noise but mostly real accounts. Avoid motivational/airdrop hunters. | 2026-03-29 |
| @Xverse_App | 4 | MEDIUM (est.) | Stacks wallet — broad audience, may include casual users | Untested |
| @hirosystems | 3 | MEDIUM | Developer-focused — good signal for builders, but OVERUSED. Rest until other strategies cycled. | 2026-03-29 (⚠️ rested) |
| @HermeticaFi | — | LOW | sBTC yield protocol — followers skew toward bots/spam | 2026-03-29 |
| @VelarBTC | — | LOW | Stacks DEX — follower list heavily polluted with spam/bots | 2026-03-29 |
| @Stacks (main) | 2 | LOW | Too broad — followers include OGs, bots, institutions. Hard to find fresh people. | 2026-03-29 |

| @aibtcdev | 7 | HIGH (est.) | AI Bitcoin agents on Stacks — followers are builders and AI-curious crypto people. Good crossover with on-chain data use case. | 2026-03-29 |
| @ALEXLabBTC | 6 | HIGH (est.) | Stacks DeFi/DEX — sidebar suggestions from their profile were quality accounts | 2026-03-29 |
| @StacksOrg | 2 | MEDIUM | Main Stacks account — very broad followers. High bot noise (~40%+ alphanumeric/no-bio accounts). Usable but needs heavy filtering. | 2026-03-30 |

**Rule:** If a follower list shows >40% accounts with no bio or alphanumeric handles — abandon it and switch to the next source. Don't waste time filtering spam-heavy lists.

---

## 🔁 Retweet Log

Track retweets to avoid retweeting the same account twice in a row, and to build a record of quality content sources.

| Date | Account Retweeted | Content Description | Run |
|------|-------------------|---------------------|-----|
| 2026-03-29 16:09 | @Stackslaborg | LabSTX QuickTip — LeatherBTC wallet for Stacks contract deployment (builder-focused) | Run 5 |
| 2026-03-29 16:09 | @LiquidiumFi | Native Bitcoin Loans 1-month live — $632k TVL, 190 loans (Bitcoin DeFi milestone) | Run 5 |
| 2026-03-30 00:09 | @ZestProtocol | $36.5m stablecoins on Stacks chart — 45% deposited on Zest, stablecoin market cap growth visualization | Run 6 |

---

## 📊 Standalone Tweet Angle Log

Track which angle was used for standalone tweets to ensure variety.

| Date | Angle Used | Tweet Summary |
|------|------------|---------------|
| 2026-03-27 | Builder / technical | Xtrata technical — SIP-009 NFTs, deterministic reconstruction |
| 2026-03-28 06:09 | Collection promo | AHV1 collection — historical/novelty angle |
| 2026-03-28 12:08 | Technical / recursive | Token #82 recursive on-chain data / interactive app |
| 2026-03-29 00:09 | Collection promo | RussianRampage live mint — 111 pieces, 0.003 STX |
| 2026-03-30 06:09 | Collection promo — scarcity/sequel | DYLE0415: "DYLE0414 sold out. DYLE0415 is your second chance." 173 pieces, 4 STX, 171 remaining |

**➡️ NEXT standalone tweet:** Use one of these UNUSED angles:
- Data permanence (no IPFS / no link rot — the philosophical angle)
- Composability (inscriptions referencing inscriptions / building on-chain apps)
- Cheap data storage (cost comparison vs Arweave/IPFS)
- Music / audio content on-chain
- Developer tools angle (what a dev can build with Xtrata)

---

## 💡 Self-Improvement Log

Observations and recommendations from past runs, to guide future behaviour.

| Date | Observation | Action Taken / Recommended |
|------|-------------|---------------------------|
| 2026-03-29 | @STXOSHI_20 appeared in results on both 2026-03-28 and 2026-03-29 and was engaged both times | Add cooldown check BEFORE composing replies, not after |
| 2026-03-29 | Strategy 3 (@hirosystems followers) used 6 runs in a row — becoming a crutch | Mandatory rotation: do not use Strategy 3 again until strategies 4, 5, 6, 7, 8 have each been used at least once |
| 2026-03-29 | Thread URLs often captured as [id-not-captured] | Try harder to capture full URLs before logging — wait for page load, check address bar |
| 2026-03-29 | Strategy 6 (sBTC/DeFi search) produced few fresh organic results — most "sBTC" search hits were known ecosystem accounts or spam | For sBTC/DeFi strategy, supplement keyword search with browsing followers of specific DeFi protocols (@ZestProtocol, @ArkadikoFinance) — more targeted than broad search |
| 2026-03-29 | Discovery mode liking pattern: clicking [data-testid="like"] works but requires a second call after the navigate (first call hits 0 due to JS not yet rendered) | Always call querySelectorAll('like') twice — first to check count, second to confirm and click after page renders |
| 2026-03-29 | Follower lists of popular accounts (@VelarBTC, @HermeticaFi, @Stacks) skew toward spam/bots. @ZestProtocol followers had better signal-to-noise | Prefer niche/specific protocol follower lists over broad ecosystem account lists for discovery |
| 2026-03-29 | @Xverse_App Twitter handle points to Chinese tech company "元象科技" — not the Stacks wallet. Strategy 4 was built around this invalid source. | Remove @Xverse_App from Strategy 4. Find correct Xverse wallet Twitter handle before using Strategy 4 again. |
| 2026-03-29 | Multi-source approach for follows works well: using 4-5 different follower lists in one run achieved 25 new follows (vs 11 from single-source previous run) | Always plan 3+ follower sources per discovery run in case primary source is low quality or rate limited |
| 2026-03-29 | Follow-back buttons may not reflect actual follow state after a context break — appeared as "Follow back" for accounts already followed in same session | After any session interruption, re-verify follow status via followers page rather than assuming previous actions succeeded |
| 2026-03-30 | @StacksOrg follower list (Strategy 2) produced ~40% bot/spam accounts. High filtering overhead vs. niche protocol accounts. | Prefer specific DeFi/NFT protocol accounts over broad ecosystem accounts for discovery sources. Keep @StacksOrg as backup, not primary. |
| 2026-03-30 | Context window continuations require transcript grep to recover follow list | Consider logging follows to a temp file immediately as they happen to survive context breaks |
| 2026-03-30 | Strategy 4 was previously blocked by invalid @Xverse_App handle. Fixed by using @NOXtoshi followers instead — Ordinals/generative art community, HIGH quality source (15/15 quality follows, 0% bot noise) | Strategy 4 is now valid using @NOXtoshi, @prrfbeauty, @RabbitCartel as source accounts |
| 2026-03-30 | Promotional-specific mode requires standalone tweet EVERY run (not every 12hrs). This is correct per twitter-mode.md spec but differs from general-promotional mode. | In promotional-specific mode, always post a standalone tweet regardless of time of day. Check mode at top of each run. |

---

## 📈 Run Efficiency History

Summary stats from each run for trend analysis.

| Run | Replies | % New Authors | Strategy | Standalone | Est. Tokens | Notes |
|-----|---------|---------------|----------|------------|-------------|-------|
| 2026-03-27 10:34 | 0 | — | Strategy 1 | No | ~2k | Setup run |
| 2026-03-27 12:10 | 3 | 100% | Mixed | Yes | ~8k | First full run |
| 2026-03-27 22:31 | 3 | 100% | Mixed | No | ~7k | |
| 2026-03-28 02:10 | 3 | 100% | Mixed | No | ~7k | |
| 2026-03-28 04:09 | 3 | 100% | Mixed | No | ~7k | |
| 2026-03-28 06:09 | 3 | 100% | Mixed | Yes | ~8k | |
| 2026-03-28 08:10 | 4 | ~100% | Mixed | No | ~8k | |
| 2026-03-28 12:08 | 3 | 100% | Strategy 3 | Yes | ~8k | |
| 2026-03-28 16:10 | 3 | 100% | Strategy 3 | No | ~7k | |
| 2026-03-28 20:33 | 3 | 100% | Strategy 3 | No | ~7k | |
| 2026-03-29 00:09 | 3 | 100% | Strategy 3 | Yes | ~8k | |
| 2026-03-29 04:09 | 3 | ~67% | Strategy 3 | No | ~7k | @STXOSHI_20 repeat |
| 2026-03-29 08:09 | 3 | ~100% | Strategy 3 | No | ~7k | Strategy 3 overused |
| 2026-03-29 12:09 | 0 | N/A (discovery) | Strategy 6 | No | ~12k | Discovery mode — likes x56, follows x11, Strategy 3 finally rested |
| 2026-03-29 16:09 | 0 | N/A (discovery) | Strategy 8/6/7 hybrid | No | ~20k | Discovery mode — 32 follows (25+7 follow-backs), 60 likes, 2 retweets, profile check ✅ |
| 2026-03-30 00:09 | 0 | N/A (discovery) | Strategy 2: @StacksOrg | No | ~25k | Discovery mode — 22 follows, 52 likes, 1 retweet (@ZestProtocol). @BitflowFinance → LOW. Mode switch auto-default applied (stay discovery). |
| 2026-03-30 06:09 | 3 | 100% | Strategy 4: @NOXtoshi followers | Yes | ~30k | Promotional-specific (DYLE0415). 15 follows, 30 likes, standalone tweet (scarcity/sequel angle). All 3 new authors. |
