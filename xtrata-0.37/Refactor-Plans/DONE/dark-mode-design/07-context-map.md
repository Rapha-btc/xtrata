# Context Map (Code Navigation)

## Entrypoints and Shells

1. App bootstrap and route split:
   - `src/main.tsx`
2. Admin shell (full app):
   - `src/App.tsx`
3. Public shell:
   - `src/PublicApp.tsx`
4. Admin gate shell:
   - `src/admin/AdminGate.tsx`

## Style System

1. Shared stylesheet:
   - `src/styles/app.css`
2. Existing root theme values:
   - `src/styles/app.css` (`:root` block at top of file)
3. Docs module style blocks (important for dark readability):
   - `src/styles/app.css` (`.docs-*` selectors)

## Existing Theme-Like Patterns To Reuse

1. Local storage persistence patterns:
   - `src/screens/AdminDiagnosticsScreen.tsx`
   - `src/lib/mint/attempt-cache.ts`
   - `src/lib/wallet/storage.ts`
2. Route context split with shared style:
   - `src/main.tsx`

## New Theme Module Targets

1. Theme preference utility (new):
   - `src/lib/theme/preferences.ts`
2. Theme unit tests (new):
   - `src/lib/theme/__tests__/preferences.test.ts`

## Main Implementation Touchpoints

1. Startup theme apply:
   - `src/main.tsx`
2. Toggle controls:
   - `src/App.tsx`
   - `src/PublicApp.tsx`
   - `src/admin/AdminGate.tsx`
3. Token and dark-mode CSS:
   - `src/styles/app.css`

## Suggested Search Commands

1. Find hardcoded color usage:
   - `rg -n "#([0-9a-fA-F]{3,8})|rgba?\\(" src/styles/app.css`
2. Find header controls insertion points:
   - `rg -n "app__controls|app__controls-group" src/App.tsx src/PublicApp.tsx`
3. Find app shell entry points:
   - `rg -n "AdminGate|PublicApp|App" src/main.tsx`
