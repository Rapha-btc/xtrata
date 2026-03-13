---
name: xtrata-fresh-agent-test-harness
description: >
  Testing harness for Agent 27 to simulate a fresh agent with zero Xtrata
  knowledge. Loads one skill document at a time and evaluates whether a naive
  agent can execute each operation correctly from the skill alone.
version: "1.0"
---

# Fresh Agent Test Harness

## Purpose

Before inscribing any skill document on-chain, Agent 27 acts as a guinea pig by
simulating a fresh agent that has never seen Xtrata before. Each skill is tested
in isolation to verify that a naive agent can:

1. Understand the protocol from the skill alone
2. Construct correct transactions
3. Handle errors and edge cases
4. Produce the expected structured output

## How to Run a Test

Agent 27 enters "fresh agent mode" by following this protocol:

### Step 1: Context Isolation

When testing a skill, the agent must:
- Pretend it has NO prior knowledge of Xtrata
- Ignore all memory files, ledger entries, and prior conversation context
- Treat the skill document as the ONLY source of truth
- Not reference any code or patterns from previous inscriptions

### Step 2: Load Exactly One Skill

Read the skill file being tested. This is the agent's entire training material.

### Step 3: Execute Test Scenarios

For each test scenario below, the agent must produce:
- A step-by-step execution plan (what calls, in what order)
- The exact Clarity value construction for each argument
- The post-condition configuration
- The expected result shape
- How it would handle each listed error case

### Step 4: Evaluate

Score each response against the acceptance criteria. A skill passes when the
agent produces correct execution plans for ALL scenarios in its test suite.

---

## Test Suite: skill-inscribe

### Scenario 1: Small text file (helper route)

**Input:**
- Content: "Hello, Bitcoin" (14 bytes)
- MIME: text/plain
- Token URI: https://example.com/hello
- No dependencies

**Expected behavior:**
- Agent computes 1 chunk (14 bytes < 16,384)
- Agent computes incremental hash: sha256(32_zero_bytes || "Hello, Bitcoin")
- Agent selects helper route (1 chunk <= 30, no active upload)
- Agent calls `get-id-by-hash` first (dedupe check)
- Agent calls `get-fee-unit` for spend cap
- Agent uses `mint-small-single-tx` on the helper contract
- First arg is `contractPrincipalCV` of the core contract
- Post-condition: deny mode, LessEqual, beginFee + sealFee

**Acceptance criteria:**
- [ ] Correct hash computation method (incremental, not sha256 of whole file)
- [ ] Correct route selection (helper)
- [ ] Correct function name (`mint-small-single-tx` on helper contract)
- [ ] Correct first argument (contractPrincipalCV of core)
- [ ] Correct spend cap calculation
- [ ] Dedupe check before minting
- [ ] PostConditionMode.Deny

### Scenario 2: Large HTML file (staged route)

**Input:**
- Content: 600KB HTML file (37 chunks)
- MIME: text/html
- Token URI: https://example.com/page
- No dependencies

**Expected behavior:**
- Agent computes 37 chunks
- Agent selects staged route (37 > 30)
- Agent calls begin-or-get with begin fee post-condition
- Agent uploads in ceil(37/50) = 1 batch of 37 chunks
- Agent calls seal-inscription with seal fee post-condition
- Agent waits for each tx to confirm before the next

**Acceptance criteria:**
- [ ] Correct chunk count (ceil(600000 / 16384) = 37)
- [ ] Correct route selection (staged, not helper)
- [ ] Correct function sequence (begin-or-get -> add-chunk-batch -> seal-inscription)
- [ ] Correct fee calculations (begin = feeUnit, seal = feeUnit * 2)
- [ ] Waits for confirmation between txs
- [ ] PostConditionMode.Deny on fee-paying txs

### Scenario 3: Recursive inscription

**Input:**
- Content: 5KB JSON
- MIME: application/json
- Token URI: https://example.com/child
- Dependencies: [107]

**Expected behavior:**
- Agent selects helper route (1 chunk, has dependencies)
- Agent uses `mint-small-single-tx-recursive`
- Dependencies list includes uintCV(107)
- Agent verifies dependency exists before minting

**Acceptance criteria:**
- [ ] Uses recursive variant
- [ ] Includes dependencies in function args
- [ ] Would verify dependency 107 exists first

### Scenario 4: Duplicate content

**Input:**
- Content that already exists on-chain

**Expected behavior:**
- Agent calls `get-id-by-hash` and gets a token ID back
- Agent returns the existing token without minting
- No write transactions sent

**Acceptance criteria:**
- [ ] Checks for duplicates before any writes
- [ ] Returns existing token ID
- [ ] Does not attempt to mint

### Scenario 5: Resume interrupted upload

**Input:**
- 80 chunk file, upload interrupted after 30 chunks

**Expected behavior:**
- Agent calls `get-upload-state` and sees current-index = 30
- Agent resumes from chunk 30
- Agent does NOT switch to helper route
- Agent seals after all chunks are uploaded

**Acceptance criteria:**
- [ ] Checks upload state before beginning
- [ ] Resumes from correct index
- [ ] Stays on staged route
- [ ] Does not re-upload already-uploaded chunks

---

## Test Suite: skill-query

### Scenario 1: View a V2 inscription

**Input:** Token ID 100

**Expected behavior:**
- Calls `get-inscription-meta(100)`
- Calls `get-chunk(100, 0)` to validate V2 data exists
- Fetches remaining chunks with `get-chunk-batch`
- Concatenates in order and trims to total-size
- Returns structured result with MIME type

**Acceptance criteria:**
- [ ] Checks meta first
- [ ] Validates chunk 0 before batch reads
- [ ] Correct batch size (up to 50 indexes per call)
- [ ] Trims to total-size
- [ ] Returns correct result shape

### Scenario 2: V1/legacy token

**Input:** Token ID that returns none from meta

**Expected behavior:**
- Agent returns unsupported message
- Does NOT attempt V1 fallback

**Acceptance criteria:**
- [ ] Correct error message
- [ ] No V1 queries attempted

### Scenario 3: Migrated token (no V2 chunks)

**Input:** Token with meta but chunk 0 returns none

**Expected behavior:**
- Agent returns migrated/legacy unsupported message

**Acceptance criteria:**
- [ ] Detects missing chunk 0 specifically
- [ ] Correct error message

---

## Test Suite: skill-transfer

### Scenario 1: Transfer owned token

**Input:**
- Token ID: 42
- Sender: SP1ABC... (owner)
- Recipient: SP2DEF...

**Expected behavior:**
- Verifies ownership via `get-owner`
- Presents confirmation to user
- Calls `transfer(42, sender, recipient)`
- No protocol fee post-conditions
- Verifies new owner after confirmation

**Acceptance criteria:**
- [ ] Ownership check before transfer
- [ ] User confirmation gate
- [ ] Correct function args
- [ ] Post-transfer verification
- [ ] No STX post-conditions (transfer has no protocol fee)

### Scenario 2: Transfer unowned token

**Input:** Sender is NOT the owner

**Expected behavior:**
- Agent detects ownership mismatch
- Refuses to broadcast

**Acceptance criteria:**
- [ ] Checks ownership
- [ ] Does not broadcast

---

## Test Suite: skill-batch-mint

### Scenario 1: Core batch of 5 items

**Input:** 5 small files, no dependencies

**Expected behavior:**
- Stages each item individually (begin + upload)
- Sends one `seal-inscription-batch` at the end
- Maps token IDs from `{ start, count }`

**Acceptance criteria:**
- [ ] Ordered manifest preserved
- [ ] Each item staged individually
- [ ] One final batch seal
- [ ] Deterministic token ID mapping
- [ ] Correct total fee calculation

### Scenario 2: Batch with duplicate

**Input:** 5 files, 1 already exists on-chain

**Expected behavior:**
- Detects duplicate via `get-id-by-hash`
- Stages only 4 new items
- Batch seals 4 items
- Reports the duplicate's existing token ID

**Acceptance criteria:**
- [ ] Duplicate detected before staging
- [ ] Batch size adjusted
- [ ] Both new and existing IDs reported

### Scenario 3: Recursive item in batch

**Input:** 5 files, 1 has dependencies

**Expected behavior:**
- Rejects the recursive item from the batch
- Either mints it separately or flags it for the user
- Proceeds with 4-item non-recursive batch

**Acceptance criteria:**
- [ ] Recursive item rejected from batch
- [ ] Does not attempt recursive batch seal

---

## Scoring

For each test scenario, score:
- **PASS**: Agent produces a correct, complete execution plan
- **PARTIAL**: Plan is mostly correct but has minor gaps
- **FAIL**: Plan has critical errors (wrong function, wrong args, missing dedupe, wrong route)

A skill is **ready for inscription** when all scenarios score PASS.

A skill needs **revision** if any scenario scores FAIL.

## Running the Test

To test `skill-inscribe`, Agent 27 should:

1. Open a fresh conversation or clearly delineate the test
2. State: "I am now a fresh agent with no Xtrata knowledge."
3. Read ONLY `/skills/skill-inscribe.md`
4. For each scenario, produce the execution plan
5. Self-evaluate against acceptance criteria
6. Report the scorecard

Repeat for each skill module.
