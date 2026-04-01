# AGENTS.md

This repository contains two related but distinct systems:

- the existing OpenAI/API-driven pipeline under `src/`
- the newer browser-session harness under `modular-harness/`

Future assistants must not assume these two systems are interchangeable. Read context first, then work within the correct layer.

## Required Context Before Editing

If you are touching the browser harness, you must read these files before making code changes:

1. `README.md`
2. `modular-harness/README.md`
3. `modular-harness/PROJECT_CONTEXT.md`
4. the relevant module file(s)
5. the corresponding test file(s)

If you are touching the legacy/API pipeline, read:

1. `README.md`
2. the relevant module file(s)
3. the corresponding test file(s)

Do not begin coding until you understand which system the request belongs to.

## Harness Development Rules

The browser harness must be developed in an organized, safe, and scalable way.

Required rules:

- Keep changes modular.
  Add or modify one narrow capability at a time.

- Preserve layer boundaries.
  Changes should clearly belong to one of:
  - browser adapter
  - persona/profile guard
  - session guard
  - provider interaction
  - execution
  - policy/audit

- Add tests for every new function or module.
  If behavior changes, add or update regression coverage.

- Prefer deterministic fake-adapter tests before live/browser validation.

- Add a focused CLI smoke command when a new module benefits from manual verification.

- Update docs when behavior, architecture, or safety expectations change.

- Run tests before finalizing.
  For shared harness changes, run `npm test`.

## Safety Requirements

The harness must remain conservative and operator-supervised.

Do:

- use the operator's existing logged-in browser sessions
- prefer verification-first and read-only flows
- keep retries bounded
- fail safe on unexpected UI states
- preserve persona-aware behavior so one verified persona window is reused when feasible
- require explicit user intent and later approval gating for outward-facing platform actions

Do not:

- add CAPTCHA bypasses, stealth logic, anti-detection measures, or other evasion features
- automate account creation, credential entry, MFA, or session theft
- build aggressive scaling behavior before quotas, deduplication, auditability, and approval mechanisms exist
- silently convert read-only/session modules into side-effecting execution modules

If a requested change increases platform-visible actions, treat that as higher-risk work and keep the implementation conservative.

## Platform-Side Effects

Outward-facing actions on X or other platforms are materially different from session checks or prompt reads.

Before implementing platform-visible actions:

1. confirm the user explicitly wants that action
2. identify the approval gate
3. identify the quota/rate-limit impact
4. identify the rollback/failure behavior
5. add tests for the control logic first

Until those controls exist, default to session validation, prompt handling, JSON extraction, draft filling, and other low-risk building blocks.

## Working Style For This Repo

- Prefer the persona-aware flow for browser work.
- Reuse existing verified windows and tabs where possible.
- Do not introduce broad refactors unless needed for the requested task.
- Keep the code readable and direct.
- Keep docs aligned with actual behavior.

When in doubt, choose the smaller, safer, more testable change.
