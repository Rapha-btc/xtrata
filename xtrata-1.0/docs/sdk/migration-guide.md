# SDK Migration Guide

This guide tracks safe upgrade steps for SDK consumers.

## Scope

- `@xtrata/sdk`
- `@xtrata/reconstruction`
- collection-mint support policy updates

## Current support policy

- Active collection-mint target: `xtrata-collection-mint-v1.4`
- Archived for new SDK work: `v1.0`, `v1.1`

If your app still depends on v1.0/v1.1 contract-specific behavior, keep those integrations in legacy codepaths and avoid adding new SDK feature assumptions there.

## Migration checklist (any SDK upgrade)

1. Upgrade packages in a feature branch.
2. Re-run your read-only smoke checks.
3. Rebuild workflow plans and verify deny-mode post-conditions.
4. Re-run app-level mint/list/buy integration tests.
5. Update your internal runbooks and user-facing recovery copy.

## From low-level calls to `simple` + `workflows` (recommended)

Before:
- custom contract ID parsing
- custom network selection
- manual post-condition assembly

After:
- `createSimpleSdk` or `create*ReadClient` for read-only paths
- `build*WorkflowPlan` for write planning
- `buildMintRecoveryGuide` for wallet failure UX

Benefits:
- deterministic safety defaults
- less wiring duplication
- consistent resume behavior and error messaging

## Validate migration in one command set

Run from repo root:

```bash
npm run sdk:docs:validate
npm run sdk:typecheck
npm run sdk:build
npm run sdk:test
npm run sdk:pack:smoke
npm run sdk:examples:smoke
npm run sdk:examples:tarball:smoke
```

## Breaking-change response template

When a future SDK release introduces breaking behavior:

1. Capture impacted modules (`simple`, `workflows`, etc.).
2. Add a migration subsection with before/after code.
3. Add or update a compatibility-matrix row.
4. Add regression tests reproducing previous behavior where compatibility is expected.

## Notes for release maintainers

- Keep this file updated whenever public exports or workflow validation rules change.
- Link each migration section to the release note/changelog entry once release automation is active.
