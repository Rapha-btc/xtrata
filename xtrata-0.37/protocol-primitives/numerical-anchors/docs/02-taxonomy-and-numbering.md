# Taxonomy And Numbering

## Proposed Slot Taxonomy (1..256)

| Slot Range | Domain | Intent |
| --- | --- | --- |
| 1-31 | Constitution | immutable constants, registry headers, compatibility markers |
| 32-63 | Binary Core | chunking, byte rules, canonical encoding/decoding helpers |
| 64-95 | Media And Time | rhythm, audio base maps, timed recursion references |
| 96-127 | Builder Bootstrap | manifests, starter kits, module loading conventions |
| 128-159 | Identity And Ownership | wallet binding, signature normalization, rights linkage |
| 160-191 | Naming And Resolution | deterministic naming and reference resolution |
| 192-223 | Token And Rights Logic | supply schema, split schema, payout logic templates |
| 224-255 | Experiments And Reserved | controlled experiments plus intentionally open slots |
| 256 | Cryptographic Anchor | canonical hash and verification primitive |

## Number Semantics Policy

- Pick numbers with technical or symbolic meaning where practical.
- Do not force symbolism if it weakens utility.
- Keep execution-critical anchors in low-volatility ranges.
- Keep mythic or playful anchors outside execution-critical paths.

## Locking Priority

Tier A (lock first):

- 64, 88, 100, 101, 128, 256

Tier B (lock next):

- 72, 89, 97, 108, 111, 144

Tier C (symbolic/optional in first 256):

- 137 and selected experimental anchors
