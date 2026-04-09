# Twitter Automation — Current Mode Configuration
**Last Updated:** 2026-03-30
**Instructions:** Edit this file to change what the automation does on its next run. The task reads this file at the start of every run. Save changes and the next scheduled run will pick them up automatically.

---

## 🎛️ CURRENT MODE

```
MODE: promotional-specific
```

---

## Available Modes

### `general-promotional`
**What it does:** Balanced mix of engagement replies + standalone tweet every 12hrs + follows. Promotes Xtrata.xyz broadly. No specific focus — vary angles freely.
**When to use:** Default mode. Good for maintaining presence and growing the account steadily.
**No extra config needed.**

---

### `promotional-specific`
**What it does:** All activity is focused around promoting one specific thing. Standalone tweets every run (not just every 12hrs). Replies are steered toward the specific topic. Likes are targeted at people already discussing the topic.
**When to use:** New collection launch, new feature, new partnership, upcoming event, major announcement.
**Required config — fill in below if using this mode:**

```
PROMO_SUBJECT: DYLE0415 — exclusive generative art inscription collection, 173 pieces, 4 STX (~$0.87) each, live now on xtrata.xyz. Artist: dyle.btc. Sequel to the sold-out DYLE0414. URL: https://xtrata.xyz/collection/dyle0415. Also listed on the Xtrata homepage live drops: https://xtrata.xyz/#live-drops

PROMO_ANGLE: "DYLE0414 sold out — DYLE0415 is your second chance." Exclusive generative art permanently inscribed on Bitcoin via Stacks. Only 173 pieces total. Price: 4 STX (~$0.87). Description: "In the twist of the hair, in the swirl of water and the drift of smoke." Ultra-early — mint is just getting started (2/173 minted at time of config). Lead with scarcity + low price + permanence. Target: NFT/art collectors, Stacks community, generative art fans.

PROMO_HASHTAGS: #Stacks #BitcoinNFT #GenerativeArt #Ordinals #OnChainArt

PROMO_END_DATE: 2026-04-06 — revert to discovery mode after this date, or earlier if collection sells out
```

---

### `engagement-general`
**What it does:** Find and join conversations naturally. Focus on replies and dialogue — less broadcasting, more listening and responding. Post fewer standalone tweets (max 1 per day). Likes are generous and targeted at new-to-Stacks accounts. Follows prioritise people who seem genuinely curious about Bitcoin L2.
**When to use:** When the account needs to feel more human and less like a broadcast channel. Good after a heavy promotional period. Good for building genuine relationships in the community.
**No extra config needed.**

---

### `engagement-specific`
**What it does:** Like `engagement-general` but focused on a specific conversation topic or community.
**When to use:** New technology announcement in the ecosystem (e.g. sBTC launch, Stacks upgrade), a trending topic you want to be part of, or a specific community you want to build presence in.
**Required config — fill in below if using this mode:**

```
ENGAGEMENT_TOPIC: [e.g. "sBTC launch — people talking about sBTC for the first time"]
ENGAGEMENT_GOAL: [e.g. "Introduce Xtrata as the on-chain data layer for sBTC-era builders"]
ENGAGEMENT_COMMUNITY: [e.g. "r/stacks Discord migrants, new Twitter accounts posting about sBTC"]
```

---

### `discovery`
**What it does:** Follows (30/run), follow-backs, likes (50-70/run), retweets (1-3/run), and profile nurturing. No replies. No standalone tweets. Zero posting risk. Runs 4×/day = ~120 follows/day.
**Per run breakdown:**
- **30 follows** — rotate through 8 strategies, target fresh first-time Stacks posters and genuine community members
- **Up to 10 follow-backs** — check notifications for new followers, reciprocate if relevant
- **50-70 likes** — spread widely across many accounts, prioritise people just followed and first-time Stacks posters
- **1-3 retweets** — high-quality ecosystem content only, never same account twice in a row
- **Profile check** — like any @XtrataLayers mentions in notifications, flag anything needing attention
- **Saves good reply targets** — notes threads worth engaging with for when posting resumes
**When to use:**
- After any heavy promotional push or ban scare (cooldown period)
- When you're worried about appearing too automated
- When you want to grow the follower base without adding to the noise
- On days when there's nothing new to say about Xtrata
**No extra config needed.**

---

### `collection-launch`
**What it does:** Specialised mode for when a new collection is live on xtrata.xyz/market. Checks the market for the featured collection, posts a launch tweet, then focuses all replies on art/NFT/collection communities specifically. More aggressive on standalone tweets (posts once per run for the first 48hrs).
**When to use:** When a creator has just launched a new collection on Xtrata and wants maximum visibility in the first 48-72 hours.
**Required config:**

```
COLLECTION_NAME: [e.g. "RussianRampage"]
COLLECTION_PRICE: [e.g. "0.003 STX"]
COLLECTION_SUPPLY: [e.g. "111 pieces"]
COLLECTION_URL: [e.g. "https://xtrata.xyz/market/[collection-id]"]
COLLECTION_ANGLE: [e.g. "Ultra-affordable first inscription — lowest price mint currently live"]
LAUNCH_END_DATE: [e.g. "2026-04-01 — revert to general-promotional after this date"]
```

---

## 📋 Mode History

Track mode changes here so the system can understand the recent pattern.

| Date Changed | New Mode | Reason | Changed By |
|-------------|----------|--------|------------|
| 2026-03-29 | general-promotional | Initial mode setup | Jim |
| 2026-03-29 | discovery | Let things breathe after Reddit ban — quiet growth, zero posting risk | Jim |
| 2026-03-30 | promotional-specific | DYLE0415 collection launched — sold-out sequel, 173 pieces @ 4 STX. Promote via next scheduled run (~06:09 BST) | Jim |

---

## 💡 How to Change Mode

1. Edit the `CURRENT MODE` block at the top of this file
2. If the mode requires config, fill in the config block in the mode's section above
3. Save the file
4. The next scheduled run will automatically pick up the new mode
5. Log the change in the Mode History table above

You can also ask Claude directly: *"Switch the Twitter automation to discovery mode"* and it will update this file for you.
