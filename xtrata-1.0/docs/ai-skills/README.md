# AI Skills Training Docs

This folder contains the dedicated AI training package docs for Xtrata.

Use this folder when you are training autonomous agents to mint, transfer, and
query inscriptions on Stacks using Xtrata.

## Package components

- Canonical skill file:
  - [`XTRATA_AGENT_SKILL.md`](https://github.com/stxtrata/xtrata/blob/HEAD/xtrata-1.0/XTRATA_AGENT_SKILL.md)
- Companion runnable scripts:
  - [`scripts/xtrata-mint-example.js`](https://github.com/stxtrata/xtrata/blob/HEAD/xtrata-1.0/scripts/xtrata-mint-example.js)
  - [`scripts/xtrata-transfer-example.js`](https://github.com/stxtrata/xtrata/blob/HEAD/xtrata-1.0/scripts/xtrata-transfer-example.js)
  - [`scripts/xtrata-query-example.js`](https://github.com/stxtrata/xtrata/blob/HEAD/xtrata-1.0/scripts/xtrata-query-example.js)

## Training tracks

- aibtc track:
  - [`docs/ai-skills/aibtc-agent-training.md`](https://github.com/stxtrata/xtrata/blob/HEAD/xtrata-1.0/docs/ai-skills/aibtc-agent-training.md)
  - For agents using MCP wallet tools and Hiro endpoints through aibtc flows.
- Generic agent track:
  - [`docs/ai-skills/generic-agent-training.md`](https://github.com/stxtrata/xtrata/blob/HEAD/xtrata-1.0/docs/ai-skills/generic-agent-training.md)
  - For non-aibtc agents (custom frameworks, direct SDK/library integrations).

## Suggested order

1. Read [`XTRATA_AGENT_SKILL.md`](https://github.com/stxtrata/xtrata/blob/HEAD/xtrata-1.0/XTRATA_AGENT_SKILL.md).
2. Choose track (`aibtc` or `generic`) and read the corresponding guide.
3. Run the companion scripts against testnet with small files first.
4. Promote to mainnet only after successful dry runs and post-condition checks.

## Safety baseline

- Always use `PostConditionMode.Deny` on fee-paying writes.
- Check `get-fee-unit` before building spend caps.
- Keep retry logic bounded and back off on 429/5xx responses.
- Log tx IDs and hash/token mappings for auditability.
