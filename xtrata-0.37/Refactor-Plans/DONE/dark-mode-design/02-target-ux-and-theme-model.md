# Target UX and Theme Model

## Product Goal

Add a simple two-mode theme system:

1. `Light` (current default look, refined but familiar).
2. `Dark` (higher-contrast, tech-forward visual style).

No layout behavior changes should be introduced.

## UX Requirements

1. Theme toggle appears in:
   - `src/App.tsx` header controls
   - `src/PublicApp.tsx` header controls
   - `src/admin/AdminGate.tsx` restricted page header/actions
2. Selected theme persists across page reloads and both public/admin routes.
3. Switching theme updates UI immediately with no network calls.
4. Theme toggle label is explicit and predictable, for example:
   - `Theme: Light`
   - `Theme: Dark`
5. Dark mode prioritizes readability and content visibility:
   - text contrast and form control clarity
   - docs reader legibility
   - preview/tooling sections remain visually grouped without glare

## Simplest Safe Architecture

1. Use `data-theme` attribute on `document.documentElement`:
   - `data-theme="light"` or `data-theme="dark"`.
2. Keep single shared stylesheet (`src/styles/app.css`):
   - root token defaults for light
   - `[data-theme='dark']` token overrides
   - targeted dark overrides only where hardcoded literals remain.
3. Add tiny shared theme utility module:
   - storage key read/write
   - initial mode resolve
   - document apply function
4. Keep mode domain intentionally small (`light | dark`) for first release.

## Initial Load Behavior

1. Resolve stored preference before first paint where feasible.
2. Apply theme to `document.documentElement` during app startup.
3. Keep default fallback `light` if storage is unavailable or invalid.

## Dark Mode Visual Direction (Pragmatic)

1. Canvas: deep slate gradient background for app chrome.
2. Surfaces: translucent dark panels with clear border separation.
3. Text:
   - primary near-white
   - secondary muted slate
4. Accent: retain orange brand accent with tuned hover/active shades.
5. Status surfaces:
   - alerts, badges, success/error callouts tuned for dark contrast.
6. Docs module:
   - high legibility code blocks
   - readable nav cards and active states

## Non-Goals For Initial Release

1. No third mode (`system`) in first pass.
2. No component-level theme prop drilling.
3. No redesign of interaction flows or content hierarchy.
