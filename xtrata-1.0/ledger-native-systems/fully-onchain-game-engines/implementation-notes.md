# Implementation Notes

## Minimal prototype slice

- define a manifest schema for engine module references and content packs
- package one simple game and one derivative mod as separate manifests
- verify that a launcher can reconstruct both using shared modules

## Notes for future development

- keep deterministic simulation rules isolated from UI and transport code
- separate collectible ownership from gameplay permissioning
- treat replay hashes and score attestations as reusable protocol primitives

## Possible first integrations

- Xtrata arcade-style launchers for latest-version resolution
- Stacks score or reward contracts attached to a game instance manifest
