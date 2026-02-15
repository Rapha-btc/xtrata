# Governance And Change Control

## Slot States

- `proposed`: idea exists, not approved
- `locked`: approved spec, payload frozen
- `inscribed`: confirmed on-chain
- `deprecated`: legacy anchor, still resolvable

## Change Rules

1. A slot in `locked` cannot change interface without explicit governance decision.
2. A slot in `inscribed` cannot be reassigned.
3. Breaking interface changes must use a new slot.
4. Symbolic anchors cannot override execution-critical anchors.

## Review Requirements

- Minimum two reviewers for Tier A/B anchors.
- Explicit approval for any dependency on uninscribed primitives.
- Publish decision log for each state change.

## Reserved Slot Policy

- Keep a controlled reserve in high-value ranges.
- Assign reserve slots only when:
  - utility is demonstrated,
  - interface stability is likely,
  - dependency impact is understood.
