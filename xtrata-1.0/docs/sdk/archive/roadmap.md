# Xtrata SDK Roadmap

This roadmap defines the path from in-repo SDK foundations to full third-party build-ready delivery.

Authoritative execution details live in:
- `docs/sdk/implementation-plan.md`
- `docs/sdk/test-gates.md`

## Phase 0: Foundations established (complete)

Delivered:
- SDK-first direction documented in `docs/app-reference.md`.
- Workspace SDK and reconstruction packages created.
- Baseline docs and quickstarts added under `docs/sdk/`.

## Phase 1: Package hardening and publishability (complete)

Goals:
- Publish-ready package metadata and exports.
- Built package artifacts (`dist`) with stable entrypoints.
- Explicit dependency metadata for standalone consumers.

Current implementation progress:
- `@xtrata/sdk` and `@xtrata/reconstruction` now use dist-based package entrypoints and exports.
- Package build/typecheck scripts were added with `tsconfig.build.json` per package.
- SDK source import paths were normalized for Node ESM output compatibility.
- Root-level SDK gate scripts were added: `sdk:build`, `sdk:typecheck`, `sdk:test`, `sdk:pack:smoke`.
- Tarball install/import smoke validation now runs through `scripts/sdk/pack-smoke.sh`.
- Example starter apps now install SDK via local file dependency and support deterministic offline smoke mode via `sdk:examples:smoke`.
- Pack smoke now enforces isolated npm cache usage for reproducible local/CI execution.

Gate:
- Package build and pack/install smoke checks pass in clean environments.

## Phase 2: Public API stabilization (complete)

Goals:
- Stabilize and document public APIs for `simple`, `safe`, `workflows`, and core helpers.
- Add formal error model and compatibility notes by contract version.
- Narrow active collection-mint SDK target to `xtrata-collection-mint-v1.2`; archive v1.0/v1.1 support tracks.

Current implementation progress:
- API surface test coverage is now in place for:
  - `packages/xtrata-sdk/src/__tests__/exports.test.ts`
  - `packages/xtrata-reconstruction/src/__tests__/exports.test.ts`
- API contract coverage now includes:
  - `packages/xtrata-sdk/src/__tests__/capabilities.test.ts`
  - `packages/xtrata-sdk/src/__tests__/errors.test.ts`
- Packaging smoke now verifies SDK subpath imports (`@xtrata/sdk/simple`, `@xtrata/sdk/workflows`) in addition to root package imports.
- Compatibility reference is now tracked in `docs/sdk/compatibility-matrix.md`.
- Compatibility policy now marks collection-mint v1.0 and v1.1 as archived, with v1.2 as the only active SDK support target.

Gate:
- API/type tests and compatibility checks pass; docs reflect final exported surface.

## Phase 3: Workflow safety hardening (complete)

Goals:
- Enforce deterministic, deny-mode-safe defaults for workflow planners.
- Validate spend caps and call sequencing for mint, collection mint, and market flows.

Current implementation progress:
- Workflow planners now reject malformed inputs early with `SdkValidationError`.
- Core mint and collection mint planners enforce deterministic spend-cap prerequisites (known mint price + protocol fee).
- Market workflow planners enforce deterministic constraints (non-empty sender/buyer, positive price, matched networks).
- Guided recovery helper now classifies wallet failures and returns step-specific resume guidance:
  - `buildMintRecoveryGuide` in `@xtrata/sdk/safe`.
- Workflow and safety suites now include negative-path coverage for invalid inputs and mismatched network contracts.

Gate:
- Workflow and safety test suites pass for positive and negative paths.

## Phase 4: Example ecosystem readiness (complete)

Goals:
- Make example repos runnable with published (or packed) SDK packages.
- Add setup parity (`.env.example`, install/run instructions, expected outputs).

Current implementation progress:
- Both examples include `.env.example` starter templates.
- Example READMEs now document tarball smoke validation from repo root.
- New tarball gate validates both examples against packed SDK artifacts:
  - `npm run sdk:examples:tarball:smoke`
  - implemented via `scripts/sdk/examples-tarball-smoke.sh`.

Gate:
- Both examples run in clean clones with no local path hacks.

## Phase 5: Documentation completion (complete)

Goals:
- Consolidate docs to published-package-first guidance.
- Add beginner onboarding, troubleshooting, and migration notes.

Current implementation progress:
- Beginner onboarding guide added:
  - `docs/sdk/quickstart-first-30-minutes.md`
- Troubleshooting and migration docs added:
  - `docs/sdk/troubleshooting.md`
  - `docs/sdk/migration-guide.md`
- SDK README execution order now leads with onboarding + operational guides.
- Quickstart docs now emphasize published package entrypoints first.
- Docs validation gate added:
  - `npm run sdk:docs:validate`
  - validates local markdown links + referenced `npm run` scripts in SDK docs.

Gate:
- First-time integrator can complete install, read-only, and workflow planning from docs alone.

## Phase 6: Release automation and maintenance (complete)

Goals:
- Add versioning + changelog process and release CI gates.
- Enforce ongoing regression checks for packages, examples, and docs parity.

Current implementation progress:
- CI matrix gates added in `.github/workflows/ci.yml`:
  - Node 20 and Node 22 validation
  - extended smoke gates on Node 22
- Release rehearsal workflow added in `.github/workflows/sdk-release.yml`:
  - runs `npm run sdk:release:dry-run`
  - uploads `.artifacts/sdk` outputs
- Version and release scripts added:
  - `npm run sdk:version:check`
  - `npm run sdk:changelog:generate`
  - `npm run sdk:release:dry-run`
- Changelog and release-note assets added:
  - `docs/sdk/changelog.md` (generated)
  - `docs/sdk/release-notes-template.md`

Gate:
- Repeatable release process completes via CI with no manual interventions.

## Working method

- Every roadmap phase progresses through the iteration loop in `docs/sdk/implementation-plan.md`.
- Every merge/release must satisfy the validation policy in `docs/sdk/test-gates.md`.
- No SDK phase is considered complete without corresponding automated tests and updated docs.
