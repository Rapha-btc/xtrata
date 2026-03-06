# AI Skills

Self-contained skill documents for teaching AI agents to use Xtrata. Each skill
doc follows the `skill-<name>.md` naming convention and is designed to be small
enough to inscribe on-chain — a skill that teaches itself.

## Skills

| File | Description |
|------|-------------|
| [`skill-inscribe.md`](skill-inscribe.md) | Inscribe data on Stacks via Xtrata. Covers the full 3-step flow (begin, upload, seal) with cost estimation and user confirmation gate. On-chain ready (<16KB). |
| `skill-transfer.md` | Transfer inscriptions between wallets. *(planned)* |
| `skill-query.md` | Query inscription state, metadata, and content. *(planned)* |

## Canonical Skill File

The comprehensive reference covering all Xtrata operations (inscribe, transfer,
query, batch seal, full API tables) remains at:

- [`XTRATA_AGENT_SKILL.md`](../../XTRATA_AGENT_SKILL.md)

Individual `skill-*.md` files are lean subsets optimised for single-purpose
agent training and on-chain inscription.

## Training Tracks

- **aibtc track**: [`aibtc-agent-training.md`](aibtc-agent-training.md) — For
  agents using MCP wallet tools and Hiro endpoints through aibtc flows.
- **Generic agent track**: [`generic-agent-training.md`](generic-agent-training.md) —
  For non-aibtc agents (custom frameworks, direct SDK/library integrations).

## Suggested Order

1. Read the relevant `skill-*.md` for your use case.
2. Choose a training track (`aibtc` or `generic`) for environment-specific setup.
3. Run companion scripts against testnet with small files first.
4. Promote to mainnet only after successful dry runs and post-condition checks.

## Safety Baseline

- Always use `PostConditionMode.Deny` on fee-paying writes.
- Check `get-fee-unit` before building spend caps.
- Present costs to the user and get confirmation before any transaction.
- Keep retry logic bounded and back off on 429/5xx responses.
- Log tx IDs and hash/token mappings for auditability.
