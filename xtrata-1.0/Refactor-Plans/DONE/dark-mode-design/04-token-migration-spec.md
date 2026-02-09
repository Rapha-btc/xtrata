# Token Migration Spec

## Objective

Migrate from mixed direct-color usage to semantic theme tokens with minimal regression risk.

## Token Strategy

1. Keep existing token names where useful.
2. Add semantic aliases for new work.
3. Replace literals incrementally by priority, not in one large rewrite.

## Recommended Core Tokens

| Role | Light Example | Dark Example |
| --- | --- | --- |
| `--color-canvas-bg` | warm neutral gradient | deep slate gradient |
| `--color-canvas-glow` | warm orange glow | electric cyan/orange blend glow |
| `--color-text-primary` | near-black | near-white |
| `--color-text-muted` | slate-600 | slate-300 |
| `--color-surface-1` | white alpha panel | dark alpha panel |
| `--color-surface-2` | slightly denser panel | slightly denser dark panel |
| `--color-border-subtle` | dark alpha border | light alpha border |
| `--color-border-strong` | higher-contrast border | brighter slate border |
| `--color-accent` | orange-600 | orange-500 |
| `--color-accent-strong` | orange-700 | orange-400 |
| `--color-alert-bg` | amber tint | amber-on-slate tint |
| `--color-alert-border` | amber alpha border | amber alpha border tuned for dark |
| `--color-code-bg` | slate alpha | deeper slate alpha |
| `--color-button-ghost-bg-hover` | orange alpha | orange alpha tuned for dark |
| `--shadow-panel` | soft dark shadow | deeper ambient shadow |

## Migration Priority

Phase A: Global foundation

1. `:root` tokens and `[data-theme='dark']` overrides.
2. `body`, `.app`, `.panel`, text defaults.

Phase B: Controls and states

1. `.button`, `.button--ghost`, `.alert`, `.badge`.
2. Input/select/textarea border/background/focus states.

Phase C: High-readability modules

1. `.docs-*` blocks.
2. Viewer detail/transfer/market cards that rely on literal alpha backgrounds.

Phase D: Deep polish

1. Remaining literal selectors with low user impact.
2. Hover/focus state consistency.

## Notes On Existing Literal Density

1. Current stylesheet has substantial hardcoded color usage.
2. Do not attempt a complete replacement in one pass.
3. Use targeted dark overrides for hard sections first, then migrate literals to tokens iteratively.

## Safety Rules

1. Do not change sizing, spacing, or layout declarations during token migration.
2. Keep only visual values in scope (color, border-color, background, shadow).
3. Validate each migration batch in both themes before continuing.
