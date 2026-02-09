# Detailed Implementation Plan

## Phase 0: Baseline and Invariants

1. Confirm no contract/business-logic changes are needed.
2. Capture baseline screenshots of:
   - public header + docs module
   - admin header + viewer/market/mint modules
   - admin gate page
3. Record invariant checklist:
   - no horizontal layout shifts
   - square grid/preview behavior preserved
   - no flow changes in mint/viewer/market

Acceptance:

1. Baseline visual and behavior references captured.

## Phase 1: Theme Domain Utilities

Goal: create one canonical source for theme preference and DOM application.

1. Add `src/lib/theme/preferences.ts`:
   - `type ThemeMode = 'light' | 'dark'`
   - `THEME_STORAGE_KEY`
   - `readThemePreference(): ThemeMode | null`
   - `writeThemePreference(mode: ThemeMode): void`
   - `resolveInitialTheme(): ThemeMode`
   - `applyThemeToDocument(mode: ThemeMode): void`
2. Add small test file:
   - `src/lib/theme/__tests__/preferences.test.ts`
3. Keep utilities pure except explicit DOM/storage helpers.

Acceptance:

1. Theme mode read/write/apply behavior is deterministic.
2. Utilities are covered by unit tests.

## Phase 2: Shell Wiring and Toggle UI

Goal: expose consistent toggle controls in public and admin shells.

1. Update `src/main.tsx` startup:
   - apply resolved theme before rendering app tree.
2. Update `src/App.tsx`:
   - add local theme state from `resolveInitialTheme`
   - add toggle button in header controls
   - on change, call `applyThemeToDocument` and `writeThemePreference`
3. Update `src/PublicApp.tsx` similarly.
4. Update `src/admin/AdminGate.tsx`:
   - add same toggle in restricted access shell.
5. Keep toggle lightweight:
   - single button that flips light/dark.

Acceptance:

1. Theme toggles are available in all relevant shells.
2. Preference persists across reloads and route context changes.

## Phase 3: Token Foundation in CSS

Goal: establish a stable token layer for both themes.

1. Expand `src/styles/app.css` root tokens for semantic color roles:
   - canvas, text, surface, border, accent, status, docs, code blocks, ghost buttons
2. Add `[data-theme='dark']` token overrides.
3. Keep existing class structure and layout styles unchanged.
4. Ensure `color-scheme` follows active theme.

Acceptance:

1. Major UI surfaces and typography adapt from token changes.
2. No spacing/grid changes introduced.

## Phase 4: Targeted Dark Overrides For Hardcoded Sections

Goal: safely cover remaining hardcoded light styles without full stylesheet rewrite.

1. Prioritize high-impact areas:
   - `.button`, `.button--ghost`, `.alert`, `.panel`, `.badge`
   - docs module (`.docs-*`)
   - viewer and preview sections where direct rgba values are used
2. For hardcoded values that cannot be tokenized immediately:
   - add scoped dark selectors under `[data-theme='dark']`.
3. Leave complex art/media rendering logic untouched.
4. Do not modify generated delegate HTML styling in mint flow for this release.

Acceptance:

1. Dark mode is readable and cohesive in public/admin primary workflows.
2. No regression in preview/media behavior.

## Phase 5: Accessibility and Regression Pass

Goal: verify quality and safety before rollout.

1. Contrast audit for:
   - body text
   - buttons
   - alerts
   - docs content/code blocks
2. Verify keyboard focus visibility in both modes.
3. Verify mobile and desktop layouts in both modes.
4. Confirm no increased layout instability when toggling.

Acceptance:

1. Theme toggle is safe, readable, and stable across breakpoints and major modules.

## Phase 6: Documentation and Handoff

1. Update `docs/app-reference.md`:
   - note theme utility module and shell touchpoints.
2. Add a short note to `Refactor-Plans/README.md` linking this pack.
3. Capture before/after screenshots for handoff.

Acceptance:

1. New assistant can locate and extend theme implementation quickly.

## Key File Touchpoints

New:

1. `src/lib/theme/preferences.ts`
2. `src/lib/theme/__tests__/preferences.test.ts`

Modified:

1. `src/main.tsx`
2. `src/App.tsx`
3. `src/PublicApp.tsx`
4. `src/admin/AdminGate.tsx`
5. `src/styles/app.css`
6. `docs/app-reference.md`
