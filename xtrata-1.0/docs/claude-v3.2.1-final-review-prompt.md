# Claude Final Review Prompt: Xtrata v3.2.1 Mainnet Gate

You are reviewing the final Xtrata v3.2.1 mainnet candidate after the fresh
testnet rehearsal passed.

Please act as a senior Clarity smart-contract and deployment reviewer. Focus on
mainnet-blocking bugs, security risks, migration hazards, ABI mismatches,
handover ordering, and whether the included evidence is sufficient for mainnet.

## Current Final Evidence

The latest broadcast report is:

- `reports/testnet-v3.2.1-rehearsal.md`
- `reports/testnet-v3.2.1-rehearsal.json`

The report currently says `Recommendation: ready for mainnet`.

Important confirmed testnet facts:

- Fresh testnet namespace: `ST30X7KJ5R4ZKTG5FBS5RQTH3CC3DNNDP99XRWFE8`.
- `xtrata-v3-2-1` deployed successfully as Clarity 3.
- `xtrata-small-mint-v1-1` deployed and pointed at the fresh core.
- Direct single-call mint succeeded for 1 byte, 1 full 16 KiB chunk, 30 chunks,
  and 32 chunks.
- Helper mint succeeded for 1 byte and 30 chunks.
- Helper oversized payload was rejected. After this review packet, the helper
  candidate was tightened to reject 31+ chunks by policy while keeping the
  core list-32 upload ABI.
- Staged upload succeeded for 33 chunks as `32 + 1`.
- Staged upload succeeded for 64 chunks as `32 + 32`.
- Duplicate same-hash mints succeeded with different token IDs and
  `get-id-by-hash` preserved the first-seen token.
- Dependency on another wallet's token succeeded.
- Parent link to another wallet's token failed.
- Parent link to an owned token succeeded.
- v2.1.0 and v2.1.1 migration paths succeeded.
- Duplicate migration was rejected.
- Reconstruction verified token `6` with 33 chunks / 540,672 bytes.
- Reconstruction verified migrated token `9000`.

Important resolver finding:

- Heavy Clarity read-only reconstruction calls can exceed the testnet
  `read_length` budget for large tokens.
- The rehearsal script now uses direct map-entry reads for reconstruction:
  `InscriptionMeta`, `TokenURIs`, `MigrationSource`, and `Chunks`.
- Please assess whether the app/resolver/SDK docs should explicitly prefer
  map-entry or bounded targeted reads for large reconstruction.

## Files In This Packet

- `contracts/live/xtrata-v3.2.1.clar` - mainnet core variant.
- `contracts/live/xtrata-small-mint-v1.1.clar` - mainnet helper variant.
- `contracts/other/xtrata-v3.2.1.clar` - testnet/local core variant.
- `contracts/other/xtrata-small-mint-v1.1.clar` - testnet/local helper variant.
- `contracts/other/xtrata-v2.1.0.clar` - migration rehearsal source.
- `contracts/other/xtrata-v2.1.1.clar` - migration rehearsal source.
- `contracts/clarinet/contracts/xtrata-v3.2.1.clar` - Clarinet/local variant.
- `contracts/clarinet/contracts/xtrata-small-mint-v1.1.clar` - Clarinet/local helper.
- `contracts/clarinet/tests/xtrata-v3.2.1.test.ts` - local Clarinet tests.
- `scripts/testnet-v3.2.1-rehearsal.mjs` - deployment/rehearsal tooling.
- `scripts/contract-variants.mjs` - trait variant sync/verify tooling.
- `package.json` - npm command wiring.
- `reports/testnet-v3.2.1-rehearsal.md` - final broadcast report.
- `reports/testnet-v3.2.1-rehearsal.json` - final machine-readable report.
- `reports/local-v3.2.1-full-verification.md` - local verification history.
- `docs/mainnet-v3.2.1-handover.md` - mainnet handover runbook.
- `docs/mainnet-v3.2.1-automation-spec.md` - automation plan.
- `docs/mainnet-v3.2.1-announcement-inscription.md` - planned first native v3 inscription.
- `docs/testnet-v3.2.1-rehearsal.md` - testnet runbook.
- `docs/xtrata-v3-migration-reference.md` - migration context.
- `docs/contract-inventory.md` - broader contract inventory.
- `docs/reconstruction-spec.md` - reconstruction context.

## Current Decisions To Validate

- `xtrata-v3.2.1` is fixed at 16 KiB chunks.
- Core upload payload ABI uses `(list 32 (buff 16384))`.
- Official app/helper policy is 30 chunks for practical safety.
- `HashToId` is advisory first-seen lookup only.
- Duplicate same-hash content is allowed to mint new token IDs.
- Parents and dependencies are separate relationship types.
- Reverse parent-child indexes are resolver/indexer/manifest responsibility, not
  core state.
- `set-next-id` is one-shot and must be called before any native v3.2.1 mint if
  legacy ID continuity is required.
- Mainnet deployment must use `contracts/live/*` variants with the mainnet
  SIP-009 trait principal.

## Please Review Specifically For

1. Mainnet-blocking contract bugs.
2. Broken SIP-009 behavior or ownership assumptions.
3. Advisory hash dedupe mistakes.
4. Any route that blocks mint/seal/migration solely because a hash exists.
5. ABI/list-size inconsistencies around upload payloads.
6. 30-vs-32 policy mismatch risk across core, helper, app, SDK, and docs.
7. Parent/dependency separation bugs or privilege mistakes.
8. Migration bugs: owner preservation, token URI preservation, source records,
   old NFT escrow/transfer, duplicate migration, and `next-id` advancement.
9. Pause/admin safety and one-shot `set-next-id` ordering.
10. Fee handling and royalty recipient hazards.
11. Read/reconstruction correctness, especially migrated tokens and large files.
12. Whether the final testnet report supports mainnet readiness.
13. Whether the mainnet handover plan has unsafe ordering or missing prechecks.
14. Whether the first announcement inscription is safe as the first native v3
    inscription after `set-next-id`.

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
