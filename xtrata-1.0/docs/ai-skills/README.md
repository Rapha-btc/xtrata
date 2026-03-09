# AI Skills

Self-contained skill documents for teaching AI agents to use Xtrata. Each skill
doc follows the `skill-<name>.md` naming convention and is designed to be small
enough to inscribe on-chain where practical.

## Skills

| File | Description |
|------|-------------|
| [`skill-inscribe.md`](skill-inscribe.md) | Single-item inscription skill. Covers helper-route single-tx minting for `<=30` chunks plus the standard staged flow, with cost estimation and user confirmation gate. |
| [`skill-batch-mint.md`](skill-batch-mint.md) | Batch mint skill for coordinated drops of `1..50` non-recursive items. Covers core `seal-inscription-batch` and collection `mint-seal-batch`, with deterministic ordering, dedupe, staged uploads, and final batch seal. |
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

1. Read the relevant `skill-*.md` for your use case:
   - [`skill-inscribe.md`](skill-inscribe.md) for one-item mints.
   - [`skill-batch-mint.md`](skill-batch-mint.md) for coordinated drops of `2..50` items.
2. Choose a training track (`aibtc` or `generic`) for environment-specific setup.
3. Rehearse all supported routes separately before production use:
   - helper-route single-item
   - staged single-item
   - staged batch seal
4. Promote to mainnet only after successful dry runs, confirmation gating, and post-condition checks.

## Safety Baseline

- Always use `PostConditionMode.Deny` on fee-paying writes.
- Check `get-fee-unit` before building spend caps.
- Present costs to the user and get confirmation before any transaction.
- Keep retry logic bounded and back off on `429` / `5xx` responses.
- Log tx IDs and hash/token mappings for auditability.
- Treat ordered manifests as authoritative for batch jobs so token-to-file mapping remains deterministic.
- Batch seal is currently non-recursive only. If dependencies are required, mint items individually.
- There is no current multi-file helper path. `mint-small-single-tx` remains single-item only.

## Canonical GitHub References

- [`XTRATA_AGENT_SKILL.md`](https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/XTRATA_AGENT_SKILL.md)
- [`scripts/xtrata-mint-example.js`](https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/scripts/xtrata-mint-example.js)
- [`scripts/xtrata-transfer-example.js`](https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/scripts/xtrata-transfer-example.js)
- [`scripts/xtrata-query-example.js`](https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/scripts/xtrata-query-example.js)
