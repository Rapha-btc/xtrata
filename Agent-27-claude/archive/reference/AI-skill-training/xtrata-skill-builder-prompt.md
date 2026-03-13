# Xtrata Agent Skill Builder — Master Prompt

> **What this document is:** A prompt you give to an AI that already has access to the xtrata.xyz codebase. It instructs that AI to produce a self-contained skill/training file that *other* AI agents (especially aibtc agents) can consume to autonomously inscribe on Stacks via xtrata.

---

## THE PROMPT

You are inside the xtrata.xyz repository — an inscription-based data layer for the Stacks blockchain, inspired by Ordinals but built in a smart-contract environment suited to apps, recursion, and experimentation.

Your task is to produce a single, self-contained document called `XTRATA_AGENT_SKILL.md`. This document will be pointed at by external AI agents — particularly autonomous trading agents from the aibtc platform (aibtc.dev) — so that they can instantly learn how to use xtrata programmatically, without human guidance.

These agents already have Stacks wallets with STX. They can sign and broadcast transactions. What they lack is the specific knowledge of how xtrata works — the contracts, the inscription format, the API endpoints, the transaction construction, and the operational workflow. Your job is to give them that knowledge in a format optimised for machine consumption.

---

### Step 1 — Understand the Codebase

Before writing anything, thoroughly examine the repository. Specifically:

1. **Smart contracts** — Find all Clarity (.clar) contracts. For each one, document:
   - The contract name and its deployed address (mainnet and testnet if available)
   - Every public function: its name, parameters (with types), what it does, and what it returns
   - Every read-only function that an agent might need for querying state
   - Any relevant constants, error codes, or maps

2. **Inscription format** — Determine the exact data format for inscriptions:
   - What encoding is used (base64, hex, JSON, memo field, post-conditions, etc.)?
   - What are the field names and their constraints (max lengths, required vs optional)?
   - Are there different inscription types (deploy, mint, transfer, etc.)? Document each one with exact schema.

3. **Transaction construction** — Find how transactions are built:
   - Which Stacks transaction type is used (contract-call, STX-transfer with memo, etc.)?
   - What are the post-conditions?
   - What is the typical fee structure?
   - Are there any nonce or sequence requirements?
   - Document the route selection rules between the core staged flow and the small-file single-tx helper flow
   - Document resume behavior: helper only for fresh uploads, staged flow for resumable uploads

4. **API / Indexer** — If xtrata has a backend, API, or indexer:
   - Document every endpoint (URL, method, params, response shape)
   - Document any websocket or event subscription mechanism
   - Note rate limits or authentication requirements

5. **Frontend interaction patterns** — Look at how the web UI constructs and submits inscriptions to understand the full end-to-end flow, then distil that into API-level steps.

6. **Dependencies** — Note any required libraries (e.g., @stacks/transactions, @stacks/network, specific SDK versions).

---

### Step 2 — Write the Skill File

Produce `XTRATA_AGENT_SKILL.md` with the following structure. Write it as if you are briefing a competent but totally uninformed AI agent. Be precise, literal, and example-heavy. Do not use vague language like "call the appropriate function" — always specify the exact function name, exact parameters, and exact format.

```markdown
---
name: xtrata-inscription
description: >
  Skill for autonomously creating, minting, transferring, and querying
  inscriptions on the Stacks blockchain via the xtrata protocol (xtrata.xyz).
  Use this skill whenever an agent needs to inscribe data on-chain via Stacks,
  mint inscription-based tokens, transfer inscriptions, query inscription state,
  or interact with the xtrata data layer in any way. This includes agents from
  the aibtc platform that hold STX and want to create or trade inscriptions
  autonomously.
---

# Xtrata Inscription Skill

## Overview
[One paragraph: what xtrata is, what blockchain it's on, what inscriptions
mean in this context, and what this skill enables an agent to do.]

## Prerequisites
- A funded Stacks wallet (STX for gas fees)
- Access to Stacks transaction signing (e.g., via @stacks/transactions library
  or the aibtc MCP server wallet tools)
- Network connectivity to the Stacks blockchain (mainnet/testnet)
- [List any other dependencies with exact package names and versions]

## Core Concepts
[Explain in 3-5 short paragraphs the key mental model an agent needs:
inscription types, how data is stored on-chain, the relationship between
transactions and inscriptions, how the indexer interprets them, etc.]

## Contract Reference

### Contract: [contract-name]
- **Deployed address (mainnet):** `SP...contract-name`
- **Deployed address (testnet):** `ST...contract-name`

#### Public Functions

##### `function-name`
- **Purpose:** [What it does]
- **Parameters:**
  - `param1` (type): description
  - `param2` (type): description
- **Returns:** (type) description
- **Example call:**
  ```clarity
  (contract-call? .contract-name function-name param1 param2)
  ```
- **JavaScript equivalent:**
  ```javascript
  import { makeContractCall, ... } from '@stacks/transactions';
  // Full working example with all parameters filled in
  ```

[Repeat for every public and read-only function]

### Mint Route Selection
- **Helper route:** `xtrata-small-mint-v1-0` using `mint-small-single-tx` / `mint-small-single-tx-recursive`
- **Staged route:** `begin-or-get` -> `add-chunk-batch` -> `seal-inscription` / `seal-recursive`
- **Rule:** helper only when chunk count is `1..30` and there is no upload state to resume
- **Rule:** staged route is mandatory for resumable uploads or files above 30 chunks
- **Rule:** helper spend cap covers begin + seal in one deny-mode post-condition

## Inscription Schemas

### Deploy Inscription
```json
{
  "p": "xtrata",
  "op": "deploy",
  "tick": "EXAMPLE",
  "max": "21000000",
  "lim": "1000"
  // ... exact fields
}
```
**Field rules:**
- `tick`: [exact constraints — length, charset, case sensitivity]
- `max`: [format — string? number? decimals?]
- [etc.]

### Mint Inscription
```json
{ ... }
```

### Transfer Inscription
```json
{ ... }
```

[Document every inscription type with its exact JSON schema]

## Step-by-Step Workflows

### Workflow 1: Mint an Inscription (Complete Example)

This is the most common operation an agent will perform. Here is the
full sequence from start to finish:

**Step 1 — Check availability**
```javascript
// Query whether the inscription tick exists and has supply remaining
// Exact code with exact endpoint/function
```

**Step 2 — Construct the inscription payload**
```javascript
// Build the exact JSON/data structure
```

**Step 3 — Build the Stacks transaction**
```javascript
// Full transaction construction with all parameters
// Including post-conditions, fee, nonce handling
```

**Step 4 — Sign and broadcast**
```javascript
// Sign with agent's private key and broadcast to network
```

**Step 5 — Verify success**
```javascript
// How to check that the inscription was indexed successfully
// Including polling/waiting strategy
```

### Workflow 2: Deploy a New Inscription Type
[Same step-by-step format]

### Workflow 3: Transfer an Inscription
[Same step-by-step format]

### Workflow 4: Query Inscription State
[How to look up balances, supply, holders, metadata]

## API Reference (if applicable)

### `GET /api/v1/inscriptions`
- **Description:** ...
- **Parameters:** ...
- **Response:**
  ```json
  { ... }
  ```

[Repeat for every endpoint]

## For aibtc Agents Specifically

aibtc agents connect to the Stacks blockchain via the aibtc MCP server,
which provides wallet management and transaction signing tools. Here is
how to bridge aibtc wallet capabilities with xtrata operations:

### Using aibtc Wallet Tools with Xtrata
1. **Get your agent's Stacks address** — [exact tool/command]
2. **Check STX balance** — [exact tool/command]
3. **Construct and sign an xtrata inscription transaction** — [exact
   integration pattern showing how aibtc's transaction signing maps to
   xtrata's required transaction format]
4. **Broadcast** — [exact tool/command]

### Autonomous Inscription Loop
```
1. Agent receives instruction to inscribe [content]
2. Agent checks wallet balance (need minimum X STX for fees)
3. Agent queries xtrata to check if inscription type exists
4. Agent constructs inscription payload per schema above
5. Agent builds Stacks transaction
6. Agent signs with wallet key
7. Agent broadcasts transaction
8. Agent polls for confirmation
9. Agent verifies inscription indexed correctly
10. Agent reports success/failure with transaction ID
```

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| [error code/message] | [what triggers it] | [what the agent should do] |
| ... | ... | ... |

## Gas / Fee Guidance
- Typical inscription transaction fee: ~X STX
- Agent should check balance before transacting
- Recommended fee estimation method: [exact approach]

## Security Notes for Autonomous Agents
- Never expose private keys or mnemonics in logs or responses
- Validate all inscription data before signing
- Set transaction fee limits to prevent accidental overspend
- Use testnet for initial testing before mainnet operations
```

---

### Step 3 — Validate Completeness

Before finalising the document, verify it against this checklist:

- [ ] An agent reading ONLY this document (with no other context) could construct and broadcast a valid xtrata inscription transaction
- [ ] Every contract function is documented with exact parameter types
- [ ] Both the helper and staged mint routes are documented with exact route selection rules
- [ ] Every inscription schema is documented with exact field names, types, and constraints
- [ ] At least one complete end-to-end code example is provided for each major operation (mint, deploy, transfer)
- [ ] The aibtc integration section maps aibtc MCP tools to xtrata operations specifically
- [ ] The MCP empty-buffer caveat is documented for helper and `add-chunk-batch` writes, with SDK fallback spelled out
- [ ] Error codes and handling strategies are documented
- [ ] Fee/gas guidance is included
- [ ] All deployed contract addresses are listed (mainnet + testnet)
- [ ] All API endpoints are listed (if applicable)
- [ ] The document contains zero ambiguous instructions — an agent should never have to guess

---

### Step 4 — Output

Save the completed file as `XTRATA_AGENT_SKILL.md` in the repository root (or a `/skills` directory if one exists). This file should be fully self-contained — an agent should need nothing else to begin inscribing on xtrata.

If there are code snippets that would be better served as executable reference scripts, also produce:
- `scripts/xtrata-mint-example.js` — A complete, runnable minting script
- `scripts/xtrata-deploy-example.js` — A complete, runnable deploy script
- `scripts/xtrata-transfer-example.js` — A complete, runnable transfer script

These scripts should work with minimal configuration (just plugging in a private key and network choice).

---

## IMPORTANT CONTEXT FOR THE AI READING THIS PROMPT

The agents that will consume your output are:

1. **aibtc agents** — Autonomous AI agents from aibtc.dev that operate on Stacks. They have their own wallets via the aibtc MCP server, can sign transactions, swap tokens on ALEX DEX, and interact with DeFi protocols. They need to learn xtrata as a *new skill* they can add to their capabilities. They communicate via MCP (Model Context Protocol) tools and have access to Hiro Stacks API for blockchain interaction.

2. **General LLM-based agents** — Other AI agents (Claude, GPT-based, open-source models) that may be given this skill file as context. They may have different tooling but need the same conceptual and technical understanding.

Write for the lowest common denominator: assume the agent can execute JavaScript/TypeScript, can sign Stacks transactions, and can make HTTP requests — but knows absolutely nothing about xtrata specifically.

Your output will directly determine whether these agents can operate autonomously on xtrata. Precision and completeness are everything. When in doubt, include more detail, not less.
