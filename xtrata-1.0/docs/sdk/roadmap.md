# Xtrata SDK Roadmap

This roadmap starts from the current codebase and progressively externalizes reusable protocol logic.

## Phase 0: Alignment and boundaries (now)

- Update `docs/app-reference.md` with protocol-team priorities.
- Define SDK and reconstruction scopes in `docs/sdk/*`.
- Keep current app behavior stable while preparing extraction targets.

Exit criteria:
- Core team follows SDK-first decision filter for new features.
- SDK scope and ownership are documented.

## Phase 1: `@xtrata/sdk` baseline

- Create SDK package structure (build, types, entrypoints).
- Extract and stabilize:
  - contract id/config helpers
  - read-only wrappers
  - mint fee + post-condition helpers
  - typed error normalization
- Add unit tests for public SDK interfaces.
- Add minimal quickstart docs and examples.

Exit criteria:
- Third-party app can perform read-only calls and mint flow through SDK.
- No required imports from first-party screen files.

## Phase 2: `@xtrata/reconstruction` baseline

- Extract deterministic reconstruction helpers from viewer/chunking utilities.
- Add canonical APIs:
  - assemble chunks
  - verify expected hash
  - resolve recursive dependencies
- Add fixtures for large and recursive content.
- Document performance and fallback behavior.

Exit criteria:
- Integrators can reconstruct and verify inscription payloads without copying viewer code.

## Phase 3: ecosystem examples and adoption

- Publish 2 example repos (starter quality, deployable).
- Add integration guides for partner marketplaces and game/event flows.
- Add "Built using Xtrata Protocol" placement guidance.

Exit criteria:
- New integrator can clone an example and launch with minimal protocol plumbing work.

## Phase 4: hardening and expansion

- Version SDK APIs with changelogs and migration notes.
- Add compatibility matrix by contract version.
- Add CI checks that keep SDK docs, examples, and protocol helpers in sync.
