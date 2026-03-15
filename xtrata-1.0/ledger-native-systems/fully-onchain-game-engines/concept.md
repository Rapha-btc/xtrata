# Concept

## Concise explanation

Fully On-Chain Game Engines treat a game as a composition of engine logic and content modules whose identities live on-chain. Maps, sprite packs, rule engines, inventories, and score validators can be reused across many game instances while keeping their provenance and economics intact.

## Problem being solved

Game logic and assets are usually bundled into a closed application, which makes reuse, auditing, and creator compensation across mods or forks difficult. Shared mechanics are copied, not referenced.

## Why ledger-native architecture helps

- engine components can be reused across many games without losing lineage
- deterministic rule references make game behavior easier to audit
- mods and forks can become explicit descendants rather than informal clones
- reward flows can compensate engine, asset, and map creators separately

## Future expansion ideas

- on-chain mod marketplaces
- portable identity and inventory across compatible games
- public score attestation layers reusable by many titles
