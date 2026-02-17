# SDK Implementation Plan (Third-Party Build Ready)

Purpose: track delivery from workspace SDK prototypes to a fully publishable, production-ready toolkit that third parties can adopt without repo-specific wiring.

## Scope

- `packages/xtrata-sdk` (`@xtrata/sdk`)
- `packages/xtrata-reconstruction` (`@xtrata/reconstruction`)
- `examples/xtrata-example-marketplace`
- `examples/xtrata-example-campaign-engine`
- SDK documentation under `docs/sdk/*`

## Definition of Done (final target)

1. Third-party builder can install packages in a clean repo with standard package-manager commands.
2. Public APIs are versioned, typed, documented, and covered by tests.
3. Example integrations run without local monorepo path hacks.
4. Release pipeline enforces test gates before publish.
5. Compatibility, migration, and troubleshooting docs are complete.

## Delivery phases

## Phase 1: Package hardening and publishability

Implementation:
- Convert workspace package metadata to publish-ready format.
- Add build outputs (`dist`) and stable `exports`.
- Declare runtime dependencies and peer dependencies explicitly.
- Add package-level scripts for build/test/typecheck.

Tests required:
- Package unit tests.
- Package typecheck.
- `npm pack` dry-run checks for both packages.
- Fresh project install smoke test.

Exit gate:
- Both packages can be packed and consumed from tarball in a clean project.

## Phase 2: Public API stabilization

Implementation:
- Freeze first public API modules (`simple`, `safe`, `workflows`, `client`, `mint`, `collections`, `market`, `deploy`).
- Add standardized SDK error codes and error mapping.
- Add contract/version compatibility reference.
- Enforce collection-mint support scope: v1.2 active only; v1.0/v1.1 archived.

Tests required:
- API-surface tests for exports and type contracts.
- Backward-compat checks for existing app usage paths.
- Parser and workflow regression tests.

Exit gate:
- Public API list is documented and marked stable for the target release.

## Phase 3: Integration workflows and safety defaults

Implementation:
- Ensure deny-mode transaction planning defaults for workflow plans.
- Align mint, collection mint, and market workflow planners with deterministic spend caps.
- Standardize resume/retry guidance for wallet failures.

Tests required:
- Workflow plan unit tests (calls, post-conditions, spend caps).
- Safety bundle tests for begin/chunk/seal and market actions.
- Negative-path tests for malformed inputs and unsupported contract capabilities.

Exit gate:
- Workflow outputs are deterministic and safe by default.

## Phase 4: Example repo hardening

Implementation:
- Make both examples install and run with published packages (or local tarballs).
- Add `.env.example`, setup instructions, and expected outputs.
- Add one browser-oriented integration path and one server/script path.

Tests required:
- Example boot smoke tests.
- Example read-only flow assertions.
- Example workflow-generation assertions.

Exit gate:
- New integrator can clone and run examples with no manual SDK path rewriting.

## Phase 5: Documentation completion

Implementation:
- Consolidate quickstarts to published-package first.
- Add beginner-safe walkthroughs and troubleshooting.
- Add migration notes for SDK upgrades.

Tests required:
- Doc command validation where practical.
- Link/reference validation.
- Manual walkthrough verification in a clean environment.

Exit gate:
- Docs support first-time integrators from install to first transaction plan.

## Phase 6: Release and CI automation

Implementation:
- Add versioning/release automation.
- Add CI release gates for package build/test/example smoke.
- Add changelog generation and release notes template.

Tests required:
- CI matrix validation (Node versions + package-manager path).
- Publish dry-run checks.
- End-to-end release rehearsal.

Exit gate:
- Tagged release can be published with repeatable automation and no manual patching.

## Iterative development loop (mandatory each iteration)

1. **Plan**: define acceptance criteria, API impacts, and test additions.
2. **Build**: implement package-first changes.
3. **Verify**: add/run tests from `docs/sdk/test-gates.md`.
4. **Document**: update quickstarts, roadmap status, and migration notes.
5. **Close**: mark phase progress and log outstanding risks.

## Iteration tracker template

Use this table to track each SDK increment:

| Iteration | Scope | API change | Tests added/updated | Docs updated | Gate status | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-02-xx-01 | Example: package metadata hardening | yes/no | list files | list files | pass/fail | name |
| 2026-02-16-01 | Phase 1 package hardening (dist exports, build scripts, tarball smoke install) | yes | package typecheck/build/test gates + tarball install smoke (`sdk:typecheck`, `sdk:build`, `sdk:test`, `sdk:pack:smoke`) | `docs/app-reference.md`, `docs/sdk/README.md`, `docs/sdk/roadmap.md`, `docs/sdk/implementation-plan.md`, `docs/sdk/test-gates.md` | pass | Codex |
| 2026-02-16-02 | Phase 1 example integration hardening (local package install path + offline smoke mode) | yes | `sdk:examples:smoke` + full SDK gate rerun (`sdk:typecheck`, `sdk:build`, `sdk:test`, `sdk:pack:smoke`) | `examples/*/README.md`, `docs/sdk/test-gates.md`, `docs/sdk/implementation-plan.md` | pass | Codex |
| 2026-02-16-03 | Phase 2 kickoff: API surface stability checks (public export tests + subpath import smoke) | yes | export tests in both packages + pack smoke subpath checks + `sdk:examples:smoke` rerun | `docs/sdk/implementation-plan.md` | pass | Codex |
| 2026-02-16-04 | Phase 2 API contracts + compatibility matrix (capabilities/error stability tests + version support doc) | yes | new `capabilities.test.ts` and `errors.test.ts` + full SDK gate rerun (`sdk:typecheck`, `sdk:build`, `sdk:test`, `sdk:pack:smoke`, `sdk:examples:smoke`) | `docs/sdk/compatibility-matrix.md`, `docs/sdk/README.md`, `docs/sdk/roadmap.md`, `docs/sdk/api-overview.md`, `docs/sdk/implementation-plan.md`, `docs/app-reference.md` | pass | Codex |
| 2026-02-16-05 | SDK support policy update: collection-mint v1.2-only active target | no | docs-only policy alignment (no code/test behavior change) | `docs/sdk/compatibility-matrix.md`, `docs/sdk/README.md`, `docs/sdk/roadmap.md`, `docs/sdk/implementation-plan.md`, `docs/sdk/api-overview.md`, `docs/sdk/test-gates.md`, `docs/app-reference.md`, `docs/contract-inventory.md` | pass | Codex |
| 2026-02-16-06 | Phase 3 + Phase 4 hardening (validation, recovery guidance, tarball-based example smoke) | yes | workflow negative-path tests + safety recovery tests + full SDK gate rerun (`sdk:typecheck`, `sdk:build`, `sdk:test`, `sdk:pack:smoke`, `sdk:examples:smoke`, `sdk:examples:tarball:smoke`) | `packages/xtrata-sdk/src/workflows.ts`, `packages/xtrata-sdk/src/safe.ts`, `scripts/sdk/pack-smoke.sh`, `scripts/sdk/examples-tarball-smoke.sh`, `examples/*/.env.example`, `examples/*/README.md`, `docs/sdk/test-gates.md`, `docs/sdk/roadmap.md`, `docs/sdk/implementation-plan.md`, `docs/sdk/README.md`, `docs/sdk/api-overview.md`, `docs/app-reference.md` | pass | Codex |
| 2026-02-17-01 | Phase 5 docs completion (beginner onboarding + troubleshooting/migration + docs validation gate) | yes | docs validation script + full SDK gate rerun (`sdk:docs:validate`, `sdk:typecheck`, `sdk:build`, `sdk:test`, `sdk:pack:smoke`, `sdk:examples:smoke`, `sdk:examples:tarball:smoke`) | `docs/sdk/quickstart-first-30-minutes.md`, `docs/sdk/troubleshooting.md`, `docs/sdk/migration-guide.md`, `docs/sdk/README.md`, `docs/sdk/test-gates.md`, `docs/sdk/roadmap.md`, `docs/sdk/implementation-plan.md`, `docs/app-reference.md`, `package.json`, `scripts/sdk/docs-validate.mjs` | pass | Codex |
| 2026-02-17-02 | Phase 6 release automation (CI matrix + release rehearsal + version/changelog tooling) | yes | release automation checks + full SDK gate rerun (`sdk:docs:validate`, `sdk:typecheck`, `sdk:build`, `sdk:test`, `sdk:pack:smoke`, `sdk:examples:smoke`, `sdk:examples:tarball:smoke`, `sdk:version:check`, `sdk:changelog:generate`, `sdk:release:dry-run`) | `.github/workflows/ci.yml`, `.github/workflows/sdk-release.yml`, `scripts/sdk/version-check.mjs`, `scripts/sdk/changelog-generate.mjs`, `scripts/sdk/release-dry-run.sh`, `docs/sdk/changelog.md`, `docs/sdk/release-notes-template.md`, `docs/sdk/README.md`, `docs/sdk/roadmap.md`, `docs/sdk/test-gates.md`, `docs/sdk/implementation-plan.md`, `docs/app-reference.md`, `package.json` | pass | Codex |

## Current status snapshot

- Phase 1 package hardening is complete.
- Phase 2 API stabilization is complete.
- Phase 3 workflow safety hardening is complete.
- Phase 4 example hardening is complete (including tarball smoke validation).
- Phase 5 documentation completion is complete.
- Phase 6 release automation is complete.
