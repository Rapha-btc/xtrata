---
name: xtrata-skills-index
description: >
  Index of all Xtrata skill modules for AI agent training. Each skill is
  self-contained and inscription-ready. Skills can be used individually or
  combined for full operational coverage.
version: "2.0"
---

# Xtrata AI Skills

Self-contained skill modules for teaching AI agents to use the Xtrata
inscription protocol on Stacks (Bitcoin L2). Each skill is designed to stand
alone and includes complete transaction construction code.

## Skill Modules

| Skill | File | Description |
|-------|------|-------------|
| Inscribe | `skill-inscribe.md` | Single-item inscription. Helper route for <=30 chunks, staged flow otherwise. Includes recursive support. |
| Batch Mint | `skill-batch-mint.md` | Coordinated drops of 2-50 non-recursive items. Core and collection paths. |
| Release Plan | `xtrata-release-plan/SKILL.md` | Dry-run quote and dependency-ordered execution planning for multi-artifact releases with rendered dependents and runtime token-map updates. |
| Query | `skill-query.md` | V2-only read/view. Rebuild files from on-chain chunks. |
| Transfer | `skill-transfer.md` | Move inscriptions between wallets. Ownership verification and post-transfer validation. |
| Ambassador | `xtrata-agent-ambassador/SKILL.md` | Agent 27 / Xtrata outreach, reply, follow-up, and refer communication for AIBTC inbox workflows. |
| AIBTC Platform Skills | `aibtc-platform-skills.md` | Reference of all 57 AIBTC platform skills — use to spot opportunities and integrations. |

## Training Guides

| Guide | File | Audience |
|-------|------|----------|
| AIBTC | `aibtc-agent-training.md` | Agents using MCP wallet tools on the AIBTC platform |
| Generic | `generic-agent-training.md` | Non-AIBTC agents with direct SDK/key management |

## Testing

| File | Purpose |
|------|---------|
| `testing/fresh-agent-test-harness.md` | Test scenarios and acceptance criteria for each skill |
| `testing/test-runner.md` | Operational guide for running tests and tracking results |

## Reading Order

1. Choose a training guide based on your environment (AIBTC or Generic).
2. Read the skill module(s) for your use case.
3. For dependency-heavy releases, use `xtrata-release-plan` before any write.
4. For new agents: start with `skill-query` (read-only, no risk), then
   `skill-transfer`, then `skill-inscribe`, then `skill-batch-mint`.

## Contract Reference

| Contract | ID |
|----------|-----|
| Core (V2) | `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0` |
| Helper | `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-small-mint-v1-0` |
| Legacy (read only) | `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1` |

## Standalone Design

Each `skill-*.md` file includes:
- Complete contract references and constants
- Full import statements and setup code
- Transaction construction examples
- Error codes and recovery strategies
- AIBTC MCP tool notes where relevant
- Structured result format

Skills are designed to be inscribed on-chain as immutable training references.
No external files are required for a fresh agent to execute the skill.

## Legacy Skills

The `xtrata-automated-inscription/` and `xtrata-batch-mint/` subdirectories
contain earlier custom skill versions with supporting scripts and assets.
The new top-level `skill-*.md` files supersede these for inscription purposes,
but the scripts and reference materials remain useful for local execution.

## Safety Baseline

- Always use `PostConditionMode.Deny` on fee-paying writes.
- Check `get-fee-unit` before building spend caps.
- Present costs to the user and get confirmation before any transaction.
- Keep retry logic bounded and back off on `429` / `5xx` responses.
- Log tx IDs and hash/token mappings for auditability.
- Batch seal is non-recursive only.
- There is no multi-file helper path.
