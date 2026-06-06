# Claude Review Prompt: Xtrata v3.2.1 Mainnet Candidate

You are reviewing the Xtrata v3.2.1 mainnet candidate before final handover.

Please act as a senior Clarity smart-contract reviewer. Prioritize concrete
mainnet-blocking issues, security risks, broken invariants, migration hazards,
ABI mismatches, and test gaps. Avoid broad stylistic feedback unless it affects
safety, correctness, deployment, or long-term operability.

## Files In This Review Packet

- `contracts/other/xtrata-v3.2.1.clar` - main core contract candidate.
- `contracts/other/xtrata-small-mint-v1.1.clar` - small-mint helper candidate.
- `contracts/clarinet/tests/xtrata-v3.2.1.test.ts` - local Clarinet coverage.
- `scripts/testnet-v3.2.1-rehearsal.mjs` - testnet rehearsal automation.
- `reports/testnet-v3.2.1-rehearsal.md` - broadcast testnet rehearsal report.
- `reports/testnet-v3.2.1-rehearsal.json` - machine-readable rehearsal report.
- `docs/testnet-v3.2.1-rehearsal.md` - testnet deployment/rehearsal runbook.
- `docs/mainnet-v3.2.1-handover.md` - planned mainnet handover runbook.
- `docs/mainnet-v3.2.1-automation-spec.md` - planned handover automation spec.
- `docs/mainnet-v3.2.1-announcement-inscription.md` - planned first inscription.
- `docs/xtrata-v3-migration-reference.md` - migration design context.
- `docs/contract-inventory.md` - broader contract/version context.

## Current Decisions To Validate

- `xtrata-v3.2.1` is fixed at 16 KiB chunks.
- Core upload payload ABI uses `(list 32 (buff 16384))`.
- App/helper policy may continue to cap normal practical upload batches at 30.
- `HashToId` is advisory first-seen lookup only.
- Duplicate same-hash content must be allowed to mint new token IDs.
- Parents and dependencies are intentionally separate relationship types.
- Reverse parent-child indexes are not core state; they belong in manifests,
  indexers, or resolvers.
- `set-next-id` is one-shot and must be called before any native v3.2.1 mint if
  legacy ID continuity is required.

## Testnet Evidence

The testnet rehearsal report currently says `ready for mainnet`. Please verify
whether that conclusion is supported by the report and script.

Known rehearsal coverage includes:

- direct single-call mints: 1 byte, 1 full chunk, 30 chunks, 32 chunks;
- helper mints: 1 byte, 30 chunks, oversized helper rejection;
- staged uploads: 33 chunks as 32 + 1, 64 chunks as 32 + 32;
- advisory dedupe: duplicate same-hash mints produce different token IDs and
  `get-id-by-hash` remains first-seen;
- relationship split: dependency on another wallet succeeds, parent link to
  another wallet fails, parent link to owned token succeeds;
- migration rehearsal from v2.1.0 and v2.1.1;
- duplicate migration rejection;
- reconstruction checks.

## Please Review Specifically For

1. Mainnet-blocking contract bugs.
2. Broken SIP-009 behavior or ownership assumptions.
3. Advisory hash dedupe mistakes.
4. Any route that still blocks mint/seal/migration only because a hash exists.
5. ABI/list-size inconsistencies around upload payloads.
6. 30-vs-32 policy mismatch risks between core, helper, app, and SDK.
7. Parent/dependency separation bugs or privilege mistakes.
8. Migration bugs, especially ownership, token URI preservation, source records,
   old NFT transfer/escrow, duplicate migration, and `next-id` advancement.
9. Pause/allowlist/admin safety.
10. Fee handling and royalty recipient hazards.
11. Read/reconstruction correctness, including migrated tokens.
12. Whether the testnet report proves enough for mainnet or another testnet pass
    is needed.
13. Whether the mainnet handover plan has unsafe ordering or missing checks.
14. Whether the first announcement inscription is safe to mint as the first
    native v3.2.1 inscription after `set-next-id`.

## Desired Response Format

Please respond with:

1. **Critical Findings** - mainnet blockers only, with file/function references.
2. **High/Medium Findings** - risks or likely bugs, ordered by severity.
3. **Test Gaps** - missing tests that should be added before mainnet.
4. **Handover Risks** - issues in the mainnet runbook or automation plan.
5. **Recommendation** - one of:
   - ready for mainnet;
   - ready after small fixes;
   - needs another testnet pass;
   - not ready.

For every finding, include:

- affected file/function;
- why it matters;
- a concrete fix or verification step.
