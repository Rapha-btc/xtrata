# Current State and Gaps

## Ground Truth

1. The app entrypoint (`src/main.tsx`) routes between:
   - `App` for admin path (`ADMIN_PATH`) behind `AdminGate`
   - `PublicApp` for public pages
2. Both app shells share one stylesheet: `src/styles/app.css`.
3. The stylesheet is currently light-first:
   - `:root { color-scheme: light; ... }`
   - light palette values are defined in root tokens.
4. Theme state and toggle state do not exist today:
   - no shared theme utility module
   - no `data-theme` attribute management
   - no theme toggle UI in `App`, `PublicApp`, or `AdminGate`
5. Color usage is only partially tokenized:
   - token base exists (`--ink`, `--muted`, `--surface`, `--border`, etc.)
   - many hardcoded literals remain in `app.css` (current audit: 162 color literals/rgba entries).
6. There is an inline hardcoded preview template in `src/screens/MintScreen.tsx` delegate HTML generator with dark colors. This is generated inscription content and should be treated separately from app chrome theme.

## UX Gaps

1. Users cannot switch between visual modes.
2. Public and admin experiences do not share a persisted theme preference.
3. Docs module, market cards, and preview/tooling surfaces are tuned for light mode only.
4. No protection against flash-of-wrong-theme on initial load.

## Technical Risks

1. Replacing every color literal in one pass is high risk and likely to regress readability.
2. Some sections use layered alpha backgrounds; dark mode needs targeted overrides, not only token swaps.
3. Theme changes must not alter layout constraints:
   - 4x4 grid behavior
   - square preview behavior
   - no horizontal layout shifts when panels open or close

## Constraints To Preserve

1. Existing layout structure and responsive behavior in `src/styles/app.css`.
2. Wallet/network/mint flow logic unchanged.
3. Public/admin routing unchanged.
4. Performance unchanged or better (theme switch should be local-only, no network calls).
