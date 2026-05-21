# Xtrata SDK Examples

Built using Xtrata Protocol.

Available starters:

- `examples/xtrata-example-marketplace`
- `examples/xtrata-example-campaign-engine`

These are intentionally small and focused on SDK usage patterns.

## Real on-chain references

Use these mainnet inscriptions as concrete references when documenting recursive
resolution, SDK reads, and executable app patterns.

Contract:
`SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0`

### Dependency-sealed recursive examples

| Example | Parent token | Type | Dependencies | Useful reference |
|---|---:|---|---|---|
| Russian Rampage - melophonic | `136` | `text/html` song/player | `134` | Recursive media player that loads on-chain artwork/audio references from the parent HTML. |
| Cicada Generator | `287` | `text/html` generator | `283`, `284` | Minimal HTML shell that composes on-chain CSS and JS modules through `/runtime/content`. |

Runtime links:

- [Russian Rampage runtime](https://xtrata.xyz/runtime/?contractId=SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0&tokenId=136&network=mainnet)
- [Cicada Generator runtime](https://xtrata.xyz/runtime/?contractId=SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0&tokenId=287&network=mainnet)

### Executable app and high-score reference

Astro Blaster is useful as an app example because it is a modular on-chain game
that wires into the dedicated high-score contract:
`SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-arcade-scores-v1-3`.

- Parent token: `90`
- Parent type: `text/html`
- Runtime modules referenced by the parent:
  - styles: `69`
  - utils: `70`
  - highscores: `80`
  - game runtime: `71`
  - main launcher: `87`
- Score write function: `submit-score`
- Runtime link:
  [Astro Blaster runtime](https://xtrata.xyz/runtime/?contractId=SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0&tokenId=90&network=mainnet)

Note: `get-dependencies(90)` currently returns an empty list, so use Astro
Blaster as the high-score and executable-app reference, not as one of the
dependency-sealed recursive examples.
