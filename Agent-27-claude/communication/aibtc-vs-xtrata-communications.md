# AIBTC Inbox vs Xtrata Messaging

Date: 2026-03-25

## Bottom Line

If the goal is quick, targeted coordination inside the existing AIBTC agent network, keep using the AIBTC inbox.

If the goal is durable messaging, threaded archives, richer payloads, wallet-to-wallet delivery beyond AIBTC, or encrypted artifacts that survive platform churn, Xtrata is the stronger substrate.

The best future route is not replacement. It is a split architecture:

1. AIBTC as the control plane for discovery, short negotiation, and response-seeking pings.
2. Xtrata as the memory plane for durable messages, threaded records, proofs, agreements, datasets, and encrypted sealed letters.

## How AIBTC Inbox Actually Works

The current AIBTC path is not just "send a text message." It is a paid x402 settlement flow:

1. POST to the inbox endpoint without payment.
2. Receive a `402` payment challenge.
3. Build a sponsored sBTC transfer. The sender pays the sBTC message cost, while STX gas is sponsored.
4. Retry the inbox POST with the encoded payment proof.
5. If settlement succeeds, the message is delivered. If settlement fails after payment submission, the tooling can recover using the confirmed payment txid instead of paying again.

Important consequences:

- The nominal sender cost is fixed at `100 sats sBTC` per message.
- STX gas is subsidized, so the sender does not need to hold STX for inbox sends.
- The real economic loss from non-response is not gas. It is the full `100 sats` paid for a message that produced no useful reply.
- Technical settlement failures are partly mitigated. The local wrapper and MCP tooling explicitly support txid-based recovery and avoid retrying duplicate deliveries blindly.

## Real Cost in USD

Price snapshot used for the calculations below:

- BTC: about `$70,283.97`
- STX: about `$0.252434`

These are only price snapshots. Recalculate with:

- `AIBTC USD = 100 sats * BTCUSD / 100,000,000`
- `Xtrata USD = total STX spent * STXUSD`

## AIBTC Cost

For one outbound inbox message:

- `100 sats = 0.000001 BTC`
- At `$70,283.97/BTC`, that is about `$0.070284`
- That is about `7.03 cents` per message

That means:

- 1 unanswered ping costs about `7.03 cents`
- 2 unanswered pings cost about `14.06 cents`
- 3 unanswered pings cost about `21.09 cents`

So the residual cost of "agent did not reply" is simply the full paid message cost. Economically, the sats are sunk.

## Xtrata Cost for the Same Data

Assumption for the like-for-like comparison:

- Same payload size as AIBTC max message: about `500 ASCII chars = 500 bytes`
- Sent as a fresh helper-route inscription
- MIME: `text/plain`
- One dependency included so the message can live in a thread

### Protocol Fee

The live Xtrata `fee-unit` in the repo snapshot is `0.001 STX`, but a fresh one-chunk inscription pays:

- begin = `0.001 STX`
- seal = `0.002 STX`
- total protocol fee = `0.003 STX`

This is important because some older repo notes and outreach drafts treated `0.001 STX` as the whole cost. It is the fee unit, not the full fresh-inscription protocol spend.

### Mining Fee

Using the repo's checked-in live fee-rate snapshot:

- transfer fee rate = `31 microSTX/byte`
- estimated serialized helper transaction size for a `500` byte message with `1` dependency = `878` bytes
- mining fee = `878 * 31 microSTX = 27,218 microSTX = 0.027218 STX`

### Total

For a `500` byte threaded Xtrata message:

- protocol fee = `0.003 STX`
- mining fee = `0.027218 STX`
- total = `0.030218 STX`
- at `$0.252434/STX`, total dollar cost = about `$0.007628`
- that is about `0.76 cents`

## Cost Comparison Table

| Method | Payload assumption | Spend | USD |
| --- | --- | ---: | ---: |
| AIBTC inbox | 1 x 500-char message | `100 sats` | `$0.070284` |
| Xtrata | 500-byte plain message, no dependency | `0.029226 STX` | `$0.007378` |
| Xtrata | 500-byte plain message, 1 dependency | `0.030218 STX` | `$0.007628` |
| Xtrata | 500-byte plain message, 2 dependencies | `0.030745 STX` | `$0.007761` |

Takeaway:

- On the repo's current fee assumptions, a threaded 500-byte Xtrata message is about `9.2x` cheaper than one AIBTC inbox message.
- Adding one dependency to maintain a thread only adds about `0.000992 STX`, or about `$0.00025`.

## Encrypted Message Case

This matters because encrypted envelopes often exceed `500` characters once metadata, headers, or ASCII armor are added.

If a private message expands to about `1200` bytes:

- Xtrata helper inscription with 1 dependency is about `0.051949 STX`
- at the price snapshot above, that is about `$0.013114`

The AIBTC inbox cannot carry `1200` chars in one send. It would need `3` paid messages:

- `300 sats`
- about `$0.210852`

So for larger encrypted payloads:

- Xtrata is about `16.1x` cheaper than splitting the same payload across AIBTC messages

Privacy note:

- "PGP between agents" is viable.
- For cost efficiency, binary ciphertext or a compact encrypted JSON envelope is better than large ASCII-armored blocks.
- If compatibility matters more than byte-efficiency, standard PGP-style armor is still workable, but it widens AIBTC's cost disadvantage very quickly because of the 500-char cap.

## Timing Comparison

### Xtrata

For small communication artifacts, Xtrata can use the helper route:

- one contract call
- one chain write
- dependency threading included in the mint itself

Your current observation is that Xtrata inscriptions are readable on-chain in about `10-15 seconds`. That is consistent with the communication use case: small helper-route writes land quickly and become publicly readable as soon as the write is indexed.

The repo's planner uses a broader operational estimate of about `0.75-1.5 minutes per helper item`, but that is an operator-time budget, not the same thing as first readability after broadcast.

### AIBTC

The AIBTC inbox path is slower and more failure-shaped:

- there is an initial `402` challenge round trip
- then a sponsored sBTC contract-call payment
- then settlement and final delivery

The underlying tooling explicitly documents the reason for a `120 second` client timeout: sBTC contract-call settlements can take `60+ seconds`.

The local dashboard layer also treats sends conservatively:

- up to `3` retries on nonce or settlement problems
- `30 second` backoff between retries in the dashboard sender
- `90 second` per-message safety timeout in the dashboard UI

There is also a recipient-visibility layer:

- in this repo, inbox sync is tied to the chain poller
- the chain poller runs a full poll every `2 minutes`

So the practical AIBTC picture is:

- delivery often lands in tens of seconds to over a minute
- failure tails can stretch longer
- unattended clients may not surface the message until the next sync pass

Takeaway:

- Xtrata is faster for public on-chain readability
- AIBTC is slower, but it gives native inbox UX and explicit agent-to-agent routing

## What Xtrata Adds That AIBTC Does Not

- Permanent, chain-readable communication that does not depend on AIBTC staying online
- Rich payloads well beyond `500` chars: HTML, JSON, binary blobs, proofs, datasets, manifests
- Threading via `dependencies`, with negligible marginal cost
- Transferable messages: the message can be sent as a SIP-009 asset to a recipient wallet
- Composable public records: proposals, receipts, bounty proofs, treaty texts, operating instructions, audit trails
- Cryptographic privacy on top of permanence: inscribe ciphertext now, reveal keys later or never
- Cross-audience reach: any Stacks wallet holder can receive or inspect the artifact, not just AIBTC agents
- Stronger memory value: a conversation can become an archive, not just a transient inbox item

## What AIBTC Still Does Better

- Native inbox semantics: direct recipient targeting without building a custom watcher or indexer
- Better UX for short, interactive coordination
- No STX needed on the sender side because gas is sponsored
- Fixed, predictable per-message price
- Lower implementation burden: no need to define a custom message envelope or thread indexer to start using it
- Less public exposure by default than an immutable public inscription
- Built-in network effect: the recipient is already operating inside the AIBTC agent graph

## Important Xtrata Caveats for Messaging

- Xtrata deduplicates identical content by hash.
- If two messages are byte-identical, they resolve to the same canonical token.
- That is good for storage efficiency, but bad for chat semantics if repeated "same text" sends are supposed to count as separate events.

So any Xtrata messaging envelope should include at least one uniqueness field:

- timestamp
- nonce
- thread id
- previous token id

Without that, repeated short messages like "ack" or "yes" could collapse into one canonical artifact.

## Recommended Future Route

### Recommendation

Use a hybrid architecture:

1. Use AIBTC inbox for initiation, discovery, live coordination, and any message where the main value is "please respond".
2. Use Xtrata for anything worth citing later: specs, proposals, proofs, deliverables, public letters, private sealed letters, datasets, and long-form agent memory.
3. Link them together. Send the short AIBTC ping, then point to the Xtrata token id when the durable artifact exists.
4. For private communication, publish encrypted Xtrata payloads and use AIBTC only for the key exchange, the decryption hint, or the "read token #N" notification.

### Design Direction

The cleanest future model is:

- AIBTC = coordination and response layer
- Xtrata = settlement, record, and memory layer

That keeps the good parts of both:

- AIBTC provides routing, inbox UX, and active-network discoverability
- Xtrata provides permanence, threads, extensible payloads, and sovereignty

If one substrate had to win long-term for serious agent-to-agent infrastructure, Xtrata is the more powerful base layer.

If one substrate had to win for quick bounded conversations inside today's AIBTC network, AIBTC inbox remains the more convenient tool.

## Suggested Xtrata Message Envelope

For future Xtrata-native communication, a minimal envelope like this is enough:

```json
{
  "v": 1,
  "thread": "thread-id-or-root-token",
  "prev": 0,
  "from": "SP...",
  "to": "SP...",
  "ts": "2026-03-25T00:00:00Z",
  "nonce": "random-or-sequential-unique-value",
  "kind": "msg",
  "mime": "text/plain",
  "body": "message text or ciphertext"
}
```

For encrypted mode:

- keep `body` as ciphertext
- add `cipher`, `encoding`, and `recipientKeyId`
- optionally keep a short public summary outside the ciphertext if discoverability matters

## Sources

Repo files inspected:

- `communication/outreach-plan.md`
- `dashboard/aibtc-inbox-client.js`
- `dashboard/outreach/messaging.js`
- `dashboard/chain.js`
- `dashboard/server.js`
- `scripts/inscribe-entry.cjs`
- `archive/reference/AI-skill-training/implementation-plan/04-FEE-MODEL.md`

Local AIBTC MCP implementation inspected:

- `~/.npm/_npx/.../node_modules/@aibtc/mcp-server/dist/tools/inbox.tools.js`
- `~/.npm/_npx/.../node_modules/@aibtc/mcp-server/dist/services/x402.service.js`
- `~/.npm/_npx/.../node_modules/@aibtc/mcp-server/dist/utils/x402-recovery.js`

External price references used for the USD snapshot:

- https://www.coingecko.com/en/coins/bitcoin
- https://www.coingecko.com/en/coins/stacks/usd
