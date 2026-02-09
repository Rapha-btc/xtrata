# Test and Validation Plan

## Unit Tests (Vitest)

File: `src/lib/theme/__tests__/preferences.test.ts`

Required cases:

1. `resolveInitialTheme` defaults to `light` when no valid stored value exists.
2. `readThemePreference` returns `null` for malformed/unknown values.
3. `writeThemePreference` stores valid mode values.
4. `applyThemeToDocument` sets:
   - `document.documentElement.dataset.theme`
   - effective `color-scheme` value.
5. Storage unavailable paths do not throw.

## Integration Verification (Manual)

### A. Public shell

1. Toggle in `PublicApp` header updates theme instantly.
2. Refresh preserves selected theme.
3. Docs module remains readable in dark mode:
   - menu cards
   - active card states
   - reader prose/code blocks.

### B. Admin shell

1. Toggle in `App` header updates theme instantly.
2. Viewer, market, mint panels remain readable and stable in dark mode.
3. Panel collapse/expand behavior unchanged.

### C. Admin gate shell

1. Toggle appears and works on `AdminGate` page.
2. Theme choice persists after successful admin unlock.

### D. Layout and media safety

1. 4x4 grid remains unchanged.
2. Square preview behavior remains unchanged.
3. No horizontal layout shift on panel open/close in either theme.
4. Preview media rendering remains unchanged (no new broken media states).

### E. Accessibility quick checks

1. Focus outlines remain visible in both themes.
2. Text contrast in alerts/buttons/docs is acceptable.
3. Toggle control is keyboard reachable and labeled clearly.

## Commands

1. `npm run lint`
2. `npm run test:app`
3. `npm run build`

Optional:

1. `npx tsc --noEmit`
