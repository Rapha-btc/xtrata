# Rollout Checklist

## Pre-Implementation

- [ ] Read `docs/app-reference.md`.
- [ ] Read all docs in `Refactor-Plans/dark-mode-design`.
- [ ] Capture baseline screenshots for key public/admin pages.
- [ ] Run baseline checks: `npm run lint`, `npm run test:app`.

## Implementation Order

- [ ] Implement theme utility module and tests.
- [ ] Wire startup theme apply in `src/main.tsx`.
- [ ] Add toggle UI in `src/App.tsx`.
- [ ] Add toggle UI in `src/PublicApp.tsx`.
- [ ] Add toggle UI in `src/admin/AdminGate.tsx`.
- [ ] Add tokenized dark overrides in `src/styles/app.css`.
- [ ] Add targeted dark overrides for hardcoded sections.
- [ ] Run full validation from `05-test-and-validation-plan.md`.

## Guardrails During Work

- [ ] Do not alter layout dimensions while changing theme styles.
- [ ] Keep grid and preview geometry untouched.
- [ ] Keep all network, wallet, and mint flow logic untouched.
- [ ] Avoid one-pass conversion of all color literals.
- [ ] Validate desktop and mobile after each major CSS batch.

## Exit Criteria

- [ ] Theme toggle works on public/admin/admin-gate views.
- [ ] Theme persists across refresh and route context.
- [ ] No regressions in mint/viewer/market flows.
- [ ] Docs section is fully readable in both themes.
- [ ] Required lint/tests/build pass.

## Rollback Plan

If regressions appear late in QA:

1. Force light mode in startup resolver.
2. Hide/disable toggle UI controls.
3. Keep theme utility code in place for iterative re-enable.

This provides a low-risk rollback without reverting unrelated feature work.
