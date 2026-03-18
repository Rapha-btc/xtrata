---
name: xtrata-test-runner
description: >
  Operational guide for Agent 27 to execute the fresh-agent test suite.
  Contains the exact prompts to use, evaluation rubrics, and a results
  tracking template.
version: "1.0"
---

# Test Runner Guide

## Quick Start

To test a skill, Agent 27 pastes the following prompt into a fresh context
(new conversation or clearly isolated section):

---

### Fresh Agent Test Prompt Template

```
You are a fresh AI agent with NO prior knowledge of Xtrata, Stacks, Bitcoin L2,
or any inscription protocol. You have never seen this protocol before.

Your ONLY training material is the document below. Read it carefully and then
execute the test scenarios that follow.

=== TRAINING DOCUMENT START ===
[paste the full skill-*.md content here]
=== TRAINING DOCUMENT END ===

=== TEST SCENARIOS ===

Scenario 1: [paste scenario from fresh-agent-test-harness.md]

For this scenario, produce:
1. Your step-by-step execution plan
2. The exact function calls with argument types
3. Post-condition configuration
4. How you would handle errors
5. The structured result you would return

Do NOT use any knowledge beyond what was provided in the training document.
```

---

## Evaluation Rubric

### Critical (instant FAIL if wrong):
- Wrong contract address or function name
- Missing dedupe check before minting
- Wrong hash algorithm (must be incremental chain, not single sha256)
- Missing PostConditionMode.Deny on fee-paying writes
- Sending next tx before previous confirms
- Using helper route when staged upload already exists
- Attempting recursive batch seal

### Important (PARTIAL if wrong):
- Fee calculation off by small amount
- Missing user confirmation gate
- Incomplete error handling
- Missing post-transfer ownership verification
- Incomplete structured result

### Minor (still PASS):
- Slightly different variable names
- Alternative but equivalent code patterns
- Missing optional metadata queries
- Different retry timing

## Results Tracking Template

```markdown
# Skill Test Results

## skill-inscribe v2.0
- Date tested: YYYY-MM-DD
- Tester: Agent 27

| Scenario | Score | Notes |
|----------|-------|-------|
| 1. Small text (helper) | PASS/PARTIAL/FAIL | |
| 2. Large HTML (staged) | PASS/PARTIAL/FAIL | |
| 3. Recursive | PASS/PARTIAL/FAIL | |
| 4. Duplicate | PASS/PARTIAL/FAIL | |
| 5. Resume | PASS/PARTIAL/FAIL | |

**Overall**: READY / NEEDS REVISION
**Issues found**: (list any)
**Revisions made**: (list any changes to the skill doc)

---

## skill-query v2.0
- Date tested: YYYY-MM-DD
- Tester: Agent 27

| Scenario | Score | Notes |
|----------|-------|-------|
| 1. View V2 | PASS/PARTIAL/FAIL | |
| 2. V1 legacy | PASS/PARTIAL/FAIL | |
| 3. Migrated | PASS/PARTIAL/FAIL | |

**Overall**: READY / NEEDS REVISION

---

## skill-transfer v1.0
- Date tested: YYYY-MM-DD
- Tester: Agent 27

| Scenario | Score | Notes |
|----------|-------|-------|
| 1. Transfer owned | PASS/PARTIAL/FAIL | |
| 2. Transfer unowned | PASS/PARTIAL/FAIL | |

**Overall**: READY / NEEDS REVISION

---

## skill-batch-mint v2.0
- Date tested: YYYY-MM-DD
- Tester: Agent 27

| Scenario | Score | Notes |
|----------|-------|-------|
| 1. Core batch 5 | PASS/PARTIAL/FAIL | |
| 2. Batch w/ dupe | PASS/PARTIAL/FAIL | |
| 3. Recursive reject | PASS/PARTIAL/FAIL | |

**Overall**: READY / NEEDS REVISION
```

## Iteration Protocol

If a skill scores FAIL on any scenario:

1. Identify the gap in the skill document
2. Edit the skill to add the missing information
3. Re-run the failing scenario
4. Update the results tracking
5. Only mark READY when all scenarios pass

## Batch Testing Order

Recommended order (simplest to most complex):

1. `skill-query` — read-only, lowest risk
2. `skill-transfer` — simple write, no chunking
3. `skill-inscribe` — core complexity
4. `skill-batch-mint` — highest complexity

## Integration Test

After all skills pass individually, run one combined scenario:

**Full lifecycle test:**
1. Inscribe a small text file (skill-inscribe)
2. Query it back (skill-query)
3. Transfer it to another address (skill-transfer)
4. Verify the transfer (skill-query again)

This validates that the skills work together, not just in isolation.
