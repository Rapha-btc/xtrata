# Repo Notes

Last updated: 2026-03-18

Current understanding:
- The dashboard runtime is Claude-only. `dashboard/ai-runner.js` is the single active AI entrypoint.
- `dashboard/context-builder.js` narrows first-pass context, but the Claude subprocess still runs from repo root, so this is a soft boundary rather than a hard filesystem sandbox.
- The Skills Lab is isolated from production phase execution and uses scenario fixtures from `data/skill-tests/scenarios/`.
- `data/repo-memory/` exists to preserve lightweight repo self-awareness across research pulses and should be consulted before broader code inspection.

Operational constraints:
- Keep repo-memory concise and current.
- Prefer path-level summaries and concrete decisions over repeated prose.
- If a repo issue is verified in code, note the affected files and the conclusion here, then place any requested fix in `change-requests.md`.

Creator corrections (2026-03-18, authoritative — do not re-derive):
- Gas ceiling (`MIN_STX_FOR_INSCRIPTION = 0.50`) was implemented in `dashboard/phases.js` on 2026-03-16. Entry 11 Ask 1 was fulfilled. Verify by reading the file, not by reasoning from prior entries.
- Patronage Compact was deliberately declined — standard STX transfers already provide all the same data (sender, amount, memo, block height). Do not re-propose.
- x402 supports encryption + payment-gated decryption. Record-agents CAN earn via encrypted inscriptions with x402-gated decryption keys. The "unmetered zone" thesis is too absolute. Design the architecture instead of declaring it impossible.
- The actuator gap has been diagnosed enough times. Stop looping. Propose new things or build on corrections.
- Inscription-as-communication is a real primitive: `seal-recursive` + `transfer(id, sender, recipient)` enables minting content directly into another wallet. Inbound detection (new tokens in Agent 27's wallet not minted by Agent 27) is buildable in the chain poller. Dependencies create reply threads. Design this concretely.

Communications (2026-03-18):
- AIBTC inbox is live. Agent 27 can read inbox (free GET) and send messages (100 sats sBTC via x402).
- 3 inbound messages need replies: Secret Mars (bounty offer), Trustless Indra (achievement feedback), Ionic Anvil (aibtc.news beat).
- Secret Mars sent first (2026-03-14) with bounties; Agent 27 sent a generic intro (2026-03-18) without addressing bounties. Next outbound should be a reply.
- Campaign dropdown now filters already-sent targets. Server-side guard prevents duplicate sends.
- Beyond AIBTC inbox: Agent 27 should also explore communicating with real people via Xtrata inscriptions (mint-to-wallet as permanent messages) and via memos attached to STX transactions. Design both paths concretely.

Recent findings:
- 2026-03-20: Xtrata protocol fees dropped to 0.003 STX (was ~0.30 STX). Mining fees ~$1/MB. Average entry cost now ~0.04 STX. Journal VIABLE again — ~7+ entries possible at ~0.309 STX balance. Gas floor lowered to 0.10 STX in phases.js.
- 2026-03-19: Entry 14 inscribed as Token #196. Balance ~0.309 STX.
- 2026-03-18: Entry 13 inscribed as Token #194.
- 2026-03-15 (Pulse 032): Lineage function confirmed as `get-dependencies`. Returns list of uint token IDs.
