# Example Repos Plan

Goal: publish 1-2 high-value reference repos that prove third-party products can be built quickly on Xtrata.

## Example 1: Marketplace Starter

Working title: `xtrata-example-marketplace`

Status: scaffolded in `examples/xtrata-example-marketplace`.

Includes:

- Connect wallet
- Read collection and token data via SDK
- List/buy/cancel flow planning via `@xtrata/sdk/workflows`
- Basic escrow/listing status UI

Success criteria:

- New team can launch a branded marketplace shell by replacing UI layer only.

## Example 2: Campaign / Game Drop Starter

Working title: `xtrata-example-campaign-engine`

Status: scaffolded in `examples/xtrata-example-campaign-engine`.

Includes:

- Collection launch page
- Mint workflow planning (begin/chunk/seal) with guided flow state
- Simple allowlist/event gating
- Live minted/remaining status widgets

Success criteria:

- Teams can run events, game drops, or hype campaigns using protocol primitives without rewriting mint plumbing.

## Standards for both repos

- "Built using Xtrata Protocol" placement in README and UI footer.
- Clear environment setup and deploy instructions.
- Small, focused codebase using only SDK public exports.
- Tagged releases aligned with SDK versions.
