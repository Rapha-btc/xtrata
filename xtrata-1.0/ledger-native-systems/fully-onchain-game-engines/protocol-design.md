# Protocol Design

## Core objects

- `engine-module`: rules or execution logic with versioned capability metadata
- `content-pack`: map, sprite, soundtrack, or dialogue bundle
- `game-instance-manifest`: declared dependency set for a playable release
- `state-proof`: event log, replay hash, or score attestation tied to a ruleset
- `compatibility-profile`: declares which engine modules can interoperate safely

## Potential protocol rules

- game instances should pin exact module versions for determinism
- rule modules must expose capability descriptors for launcher compatibility checks
- score and replay records should reference the exact ruleset used to validate them
- upgrade paths should prefer additive branches over silent in-place mutation

## Bitcoin / Stacks / Xtrata fit

- Xtrata-like recursive inscriptions can hold runtime assets, manifests, and dependency links
- Stacks contracts can coordinate state transitions, inventory ownership, and prize logic
- indexers can materialize compatibility graphs for launchers and mod browsers
