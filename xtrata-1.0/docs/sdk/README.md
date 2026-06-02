# Xtrata SDK

Status: production-ready and actively maintained.

The SDK is now implemented through release automation. The primary focus is stable usage, release discipline, and incremental improvements for third-party builders.

Current production upload policy: app and SDK mint planners use a hard
30-chunk ceiling for each upload transaction. The deployed Clarity ABI still
accepts 50-item chunk lists, and protocol fee math remains based on the
contract's 50-chunk fee bucket.

## Start here

1. `docs/sdk/quickstart-first-30-minutes.md`
2. `docs/sdk/quickstart-simple-mode.md`
3. `docs/sdk/quickstart-reconstruction.md`
4. `docs/sdk/quickstart-workflows.md`
5. `docs/xtrata-backup-migration-service.md`
6. `docs/sdk/troubleshooting.md`
7. `docs/sdk/migration-guide.md`

## Core reference docs

- `docs/sdk/api-overview.md`
- `docs/reconstruction-spec.md`
- `docs/sdk/compatibility-matrix.md`
- `docs/sdk/test-gates.md`
- `docs/sdk/changelog.md`
- `docs/sdk/release-notes-template.md`

## Release and validation commands

Run from repo root:

1. `npm run sdk:docs:validate`
2. `npm run sdk:typecheck`
3. `npm run sdk:build`
4. `npm run sdk:test`
5. `npm run sdk:version:check`
6. `npm run sdk:pack:smoke`
7. `npm run sdk:examples:smoke`
8. `npm run sdk:examples:tarball:smoke`
9. `npm run sdk:changelog:generate`
10. `npm run sdk:release:dry-run`

## Packages

- `@xtrata/sdk` in `packages/xtrata-sdk`
- `@xtrata/reconstruction` in `packages/xtrata-reconstruction`

## Archived planning docs

Historical planning and phase tracking docs are now archived under `docs/sdk/archive/`.

- `docs/sdk/archive/implementation-plan.md`
- `docs/sdk/archive/roadmap.md`
- `docs/sdk/archive/js-package-plan.md`
- `docs/sdk/archive/reconstruction-library-plan.md`
- `docs/sdk/archive/example-repos-plan.md`
