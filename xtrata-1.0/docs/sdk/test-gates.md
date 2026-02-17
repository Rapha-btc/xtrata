# SDK Test Gates

Purpose: define non-optional validation gates for SDK and reconstruction changes before merge and release.

## Gate categories

1. **Unit gates**
- Scope: package helper logic, parsers, workflows, safety builders, error mapping.
- Location:
  - `packages/xtrata-sdk/src/__tests__/*.test.ts`
  - `packages/xtrata-reconstruction/src/__tests__/*.test.ts`

2. **Type and API gates**
- Scope: TypeScript compatibility of public exports and usage contracts.
- Includes checks that public entrypoints compile and consumer signatures remain valid.

3. **Integration/workflow gates**
- Scope: end-to-end workflow plan generation for:
  - Core mint (begin/chunk/seal)
  - Collection mint
  - Market list/buy/cancel
- Validates deny-mode defaults, deterministic spend caps, and expected call sequencing.

4. **Example smoke gates**
- Scope: example applications run in a clean environment and can exercise read + workflow planning paths.
- Location:
  - `examples/xtrata-example-marketplace`
  - `examples/xtrata-example-campaign-engine`

5. **Packaging gates**
- Scope: package build artifacts, exports, and installability from tarball/published package.
- Includes `npm pack` and clean project install tests.

## Required test policy by change type

- Public API change:
  - Add/update unit tests.
  - Add/update API surface/type tests.
  - Update quickstart or example usage.
- Workflow/safety change:
  - Add/update workflow plan tests.
  - Add/update safety/post-condition tests.
  - Add/update one integration smoke scenario.
- Packaging/release change:
  - Add/update pack/install smoke tests.
  - Validate example startup against packaged SDK.

## Merge gate checklist

Before merge:

1. Relevant package unit tests pass.
2. Type checks pass for changed package/public APIs.
3. SDK docs validation passes (`npm run sdk:docs:validate`).
4. Affected examples and docs are updated and validated.
5. Any new behavior has at least one negative-path test.
6. `docs/sdk/changelog.md` is regenerated when release-impacting work lands.

## Command reference (current Phase 6 baseline)

Run from repo root:

1. `npm run sdk:typecheck`
2. `npm run sdk:build`
3. `npm run sdk:test`
4. `npm run sdk:docs:validate`
5. `npm run sdk:version:check`
6. `npm run sdk:pack:smoke`
7. `npm run sdk:examples:smoke`
8. `npm run sdk:examples:tarball:smoke`

These commands are the minimum required gate set for the current Phase 6 hardening slice.

## Release gate checklist

Before publish:

1. Unit + integration + example smoke gates pass.
2. SDK docs validation passes (`npm run sdk:docs:validate`).
3. Package version validation passes (`npm run sdk:version:check`).
4. Package tarballs install and execute in clean projects.
5. Example tarball smoke passes (`npm run sdk:examples:tarball:smoke`).
6. Changelog/migration notes are updated for breaking/non-breaking changes.
7. Compatibility notes are aligned with current contract versions.
8. Release rehearsal (dry-run) completes without manual interventions (`npm run sdk:release:dry-run`).
9. CI matrix workflow passes for Node 20 and Node 22 (`.github/workflows/ci.yml`).

## Notes

- Do not ship SDK behavior that only works inside first-party app screens.
- Prefer deterministic outputs and typed failures over implicit fallbacks.
- Every SDK regression found in production should first be codified as an automated test.
- Collection-mint support policy for SDK work: target `v1.2` only; `v1.0` and `v1.1` are archived and should not receive new SDK feature/test work unless policy changes.
