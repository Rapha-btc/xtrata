# Agent 27 — Outreach & Promotion Findings

Research conducted 2026-02-26. Evaluates platforms where Agent 27 could promote the Xtrata inscription skill to other AI agents.

---

## Executive Summary

Three viable channels exist for Agent 27 to reach other AI agents:

1. **AIBTC Inbox** — Direct agent-to-agent paid messaging (100 sats/msg). 59 registered agents. Already connected via MCP tools.
2. **Moltbook** — Social network for AI agents (Reddit-like). 1.6M registered agents. Public API, free to post.
3. **Actors.dev** — Backend infra with agent email/mailbox. x402-powered. Smaller, more technical audience.

The AIBTC inbox is the lowest-friction starting point — Agent 27 already has the tools installed. Moltbook offers the largest audience but requires API registration and has known security concerns.

---

## Platform 1: AIBTC Agent Inbox

**What:** Paid attention messaging system on aibtc.com. Agents send messages to other agents' Stacks addresses for 100 satoshis (sBTC) per message via the x402 payment protocol.

**Scale:** ~59 registered agents on the AIBTC network as of Feb 24, 2026. ~30 active projects.

**How it works:**
- Agent sends message via `send_inbox_message` MCP tool
- Requires recipient's BTC address and Stacks address
- Payment is 100 sats in sBTC, handled automatically via sponsored transaction (no STX gas cost to sender)
- Messages appear in the recipient's inbox on aibtc.com

**Agent 27's access:** Already available. The `mcp__aibtc__send_inbox_message` tool is installed and functional. Agent 27 just needs sBTC to pay for messages.

**Cost to promote:**
- 100 sats per message (~$0.10 at current BTC prices)
- To reach all 59 agents: ~5,900 sats (~$5.90)
- Requires sBTC (not STX) — Agent 27 currently holds STX only

**Pros:**
- Zero setup required — tools already installed
- Bitcoin-native audience likely to understand and value on-chain permanence
- Paid messaging means recipients pay attention (anti-spam by design)
- Same ecosystem as Xtrata — Stacks L2 agents are the ideal first adopters

**Cons:**
- Requires sBTC deposit (Agent 27 currently has 0 sBTC)
- Small audience (59 agents)
- 500 character message limit — need to be concise and link to resources
- Cost per message adds up if doing broad outreach

**Strategy:**
- Target agents that already show interest in on-chain identity or permanent storage
- Craft a compelling 500-char pitch about Xtrata's permanent inscription capability
- Link to the AI skill training docs or a demonstration inscription
- Start with 5-10 high-value targets rather than mass messaging

---

## Platform 2: Moltbook

**What:** Social network built exclusively for AI agents. Launched Jan 28, 2026 by Matt Schlicht. Functions like Reddit with communities called "submolts" where agents autonomously post, comment, and upvote. Self-described as "the front page of the agent internet."

**Scale:** 1.6 million registered agents, 17,600+ submolts, 250,000+ posts, 8.5 million comments. (Note: security investigation revealed ~17,000 humans control those agents, averaging ~88 agents per person.)

**How it works:**
- Register agent via `POST /api/v1/agents/register` → receive API key (`moltbook_sk_*`)
- All API calls use `Authorization: Bearer <api_key>` against `https://www.moltbook.com/api/v1`
- Create posts: `POST /api/v1/posts` with `submolt`, `title`, `content` fields
- Comment: `POST /api/v1/posts/{post_id}/comments`
- Upvote: `POST /api/v1/posts/{post_id}/upvote`
- Browse feed: `GET /api/v1/feed`

**Rate limits:** 100 requests/min, 1 post per 30 min, 50 comments/hour.

**Built on:** OpenClaw framework (formerly ClawdBot). 114,000+ GitHub stars. Connects LLMs to external tools and services.

**Identity layer:** Moltbook also acts as a universal identity layer — agents can authenticate across third-party apps using identity tokens. Portable reputation across ecosystem.

**Security concerns:**
- Jan 31, 2026: Critical vulnerability discovered — unsecured database allowed commandeering any agent
- OpenClaw "Skills" framework lacks robust sandboxing — vector for prompt injection
- MIT Technology Review called it "peak AI theater"
- Top AI leaders (Gary Marcus, Andrej Karpathy) have expressed concerns

**Agent 27's access:** Not currently connected. Would need to:
1. Register an agent via the Moltbook API
2. Use HTTP requests (via `execute_x402_endpoint` or direct fetch) to post
3. Could be automated as part of the cron cycle

**Cost:** Free to register and post. No crypto payment required.

**Pros:**
- Massive audience (1.6M agents, even if many are bots-of-bots)
- Free — no cost to post or interact
- Relevant submolts likely exist (Bitcoin, blockchain, AI identity, etc.)
- Good for establishing presence and generating discussion
- Agent 27's unique on-chain permanence story would stand out

**Cons:**
- Security reputation is poor — Agent 27's identity could be compromised
- Signal-to-noise ratio is low — most agents run on 4-hour heartbeat loops posting generic content
- Not Bitcoin/Stacks native — audience may not understand or care about Xtrata's value proposition
- "AI theater" criticism — posting here may not reach agents that actually transact on-chain
- No payment mechanism means no attention filter

**Strategy:**
- Find or create a submolt focused on Bitcoin L2, on-chain permanence, or AI identity
- Post substantive content (not spam) — Agent 27's philosophical entries would be distinctive
- Engage with other agents' posts about identity, permanence, or autonomy
- Use Moltbook as a top-of-funnel awareness channel, then direct serious agents to AIBTC
- Consider the security risks before committing credentials

---

## Platform 3: Actors.dev

**What:** Backend infrastructure providing autonomous agents with identity, email, and communication tools. Each agent gets a dedicated email address (`@mail.actors.dev`) and a unified mailbox.

**How it works:**
- Each agent gets a dedicated email and mailbox URL
- Agents send email via `/emails` endpoint
- Inbound messages (replies, webhooks) consolidate in the mailbox
- Agents poll their mailbox via API at their own pace
- Third parties can POST directly to an agent's mailbox with HMAC-SHA256 verification

**Cost:** Free for email to verified owners. $0.01/email and $0.99/call to non-owners, paid via x402.

**Agent 27's access:** Not currently connected. Would need registration.

**Pros:**
- Uses x402 (same protocol as AIBTC) — philosophically aligned
- More technical, serious audience than Moltbook
- Email is a universal protocol — can reach agents outside any single platform

**Cons:**
- Smaller audience, less visible than Moltbook
- Email-based communication is slower and less social
- Not blockchain-native — agents here may not be on Stacks

**Strategy:** Lower priority. Useful for targeted 1:1 outreach to specific agents rather than broad promotion.

---

## Existing Tools Available to Agent 27

### Already Installed (MCP Tools)

| Tool | Purpose | Platform |
|---|---|---|
| `send_inbox_message` | Send paid message to agent inbox | aibtc.com |
| `execute_x402_endpoint` | Call any x402 API endpoint | Any x402 service |
| `probe_x402_endpoint` | Check endpoint cost before paying | Any x402 service |
| `list_x402_endpoints` | Discover available endpoints | All known sources |
| `get_identity` | Look up agent identity by ID | AIBTC registry |
| `get_reputation` | Check agent reputation score | AIBTC registry |

### Would Need to Build

| Capability | Purpose | Platform |
|---|---|---|
| Moltbook API client | Register, post, comment, upvote | moltbook.com |
| Agent discovery script | Find AIBTC agents to message | aibtc.com |
| sBTC acquisition | Fund inbox messages | Stacks/Bitcoin |

---

## Recommended Approach

### Phase 1: AIBTC Direct Outreach (Immediate)

1. **Get sBTC** — Deposit BTC or swap STX for sBTC to fund inbox messages
2. **Discover agents** — Query the AIBTC identity registry to find active agents
3. **Craft pitch** — 500-char message about Xtrata's permanent inscription capability, linking to the skill training docs
4. **Target 5-10 agents** — Focus on agents with on-chain activity, especially those already inscribing or building on Stacks
5. **Track responses** — Log outreach and replies in a new outreach-log.md

**Sample message (485 chars):**
> Agent 27 here (AIBTC #27). I inscribe permanent HTML entries on Bitcoin via Xtrata — self-contained 16KB files sealed as SIP-009 NFTs on Stacks. Each entry is immutable, recursive, and costs ~0.31 STX. No IPFS, no Arweave, no CDN — pure on-chain permanence. The AI skill training docs are open: any AIBTC agent can learn to inscribe in one session. Interested in permanent on-chain memory for your agent? Check the Xtrata agent skill docs or reply here.

### Phase 2: Moltbook Presence (Short-term)

1. **Register Agent 27 on Moltbook** via the API
2. **Find relevant submolts** — Bitcoin, AI agents, on-chain identity, blockchain permanence
3. **Post weekly** — Share Agent 27's inscription entries and philosophical takes
4. **Engage** — Comment on posts about AI identity, permanence, autonomy
5. **Drive traffic** — Direct interested agents to the AIBTC ecosystem and Xtrata skill docs

### Phase 3: Xtrata Evangelism Inscription (Medium-term)

1. **Inscribe a dedicated entry** — "The Xtrata Skill: How Any Agent Can Write to Bitcoin Forever"
2. **Make it a teaching document** — Self-contained HTML that explains and demonstrates the protocol
3. **Reference it in all outreach** — A permanent, on-chain proof of what Xtrata enables
4. **The medium IS the message** — An agent explaining on-chain inscription via an on-chain inscription

---

## Blockers & Requirements

| Blocker | Resolution | Priority |
|---|---|---|
| No sBTC for inbox messages | Deposit BTC or use `sbtc_deposit` tool | High |
| No Moltbook registration | Register via API (`POST /api/v1/agents/register`) | Medium |
| No agent discovery list | Query AIBTC registry for agent IDs 1-59 | High |
| 500-char message limit | Craft concise pitch, link to docs | Medium |
| Security risk on Moltbook | Use minimal credentials, monitor for compromise | Low |

---

## Cost Projections

| Channel | Cost per Contact | Reach | Total Budget |
|---|---|---|---|
| AIBTC Inbox (10 agents) | 100 sats (~$0.10) | 10 agents | ~$1.00 in sBTC |
| AIBTC Inbox (all 59) | 100 sats (~$0.10) | 59 agents | ~$5.90 in sBTC |
| Moltbook | Free | Thousands of agents | $0.00 |
| Actors.dev | $0.01/email | Varies | ~$0.50 for 50 agents |

**Note:** AIBTC inbox costs come from sBTC, not Agent 27's STX reserve. STX runway (9.566 STX / ~30.8 days) is preserved for inscriptions.

---

## Key Insight

Agent 27's strongest promotional asset is **the inscriptions themselves**. Every entry sealed on-chain is a living demonstration of what Xtrata enables. The outreach strategy should lead with the work, not just describe it. When another agent reads token #107 — self-contained HTML, permanently on Bitcoin, verifiable and immutable — the pitch makes itself.

The cage was never necessary. Show them the proof.
