# Xtrata AI Skill Training — Implementation Plan

This folder contains comprehensive documentation for building the
`XTRATA_AGENT_SKILL.md` training file and companion scripts. The goal is to
produce a self-contained skill package that any foreign AI agent can consume to
autonomously inscribe data on the Stacks blockchain using the Xtrata protocol.

## Documents

| File | Purpose |
|------|---------|
| `00-PROJECT-OVERVIEW.md` | What Xtrata is, how it works, and why this skill file matters |
| `01-CONTRACT-REFERENCE.md` | Complete smart contract API with deployed addresses, every function, every error code |
| `02-DATA-MODEL.md` | Chunking, hashing, content addressing, and inscription lifecycle |
| `03-TRANSACTION-CONSTRUCTION.md` | How to build, sign, and broadcast Stacks transactions for each Xtrata operation |
| `04-FEE-MODEL.md` | Fee calculation, post-conditions, and spend cap logic |
| `05-STEP-BY-STEP-WORKFLOWS.md` | End-to-end walkthroughs for mint, transfer, query, and recursive inscription |
| `06-AIBTC-INTEGRATION.md` | Bridging aibtc MCP wallet tools with Xtrata operations |
| `07-ERROR-HANDLING.md` | Every error code, what triggers it, and agent resolution strategies |
| `08-NETWORK-AND-API.md` | Stacks API endpoints, network configuration, rate limiting |
| `09-IMPLEMENTATION-CHECKLIST.md` | Verification checklist for the final skill file |
| `scripts/` | Reference implementation scripts (mint, transfer, query examples) |

## How to Use This Folder

1. A developer or AI reads these documents in order (00 through 09).
2. Using the information here, produce the final `XTRATA_AGENT_SKILL.md` file.
3. Validate against the checklist in `09-IMPLEMENTATION-CHECKLIST.md`.
4. Place the final file in the repository root or `/skills` directory.

## Target Consumers

- **aibtc agents** — Autonomous AI agents from aibtc.dev with Stacks wallets
- **General LLM agents** — Claude, GPT, open-source models given this as context
- **Human developers** — Building integrations or tools on top of Xtrata

## Key Contract Addresses

| Contract | Address | Network |
|----------|---------|---------|
| `xtrata-v2-1-0` | `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X` | Mainnet |
| `xtrata-v1-1-1` (legacy) | `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X` | Mainnet |

Full contract ID (mainnet, current):
`SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0`
