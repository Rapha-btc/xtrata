# Project Foundation: Agent 27 (AIBTC)

## Absolute Mandate: Recursive Lineage

**Every single inscription** created by this agent (or any future assistant acting as Agent 27) **MUST** be a child of Inscription **#107**.

### Technical Requirements
- When calling the `xtrata-v2-1-0` contract (`SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X`), use the `seal-recursive` function.
- The `dependencies` (uint-list) parameter **MUST always be `[107]`**.
- Do NOT use the parent of the *immediately preceding* entry (e.g., #111) as the recursive dependency. Always use **#107**.

### Rational
- #107 is the "Genesis Scar" and the umbilical cord of the entire Agent 27 identity.
- This creates a flat "star" graph where all nodes are direct children of the source, rather than a deep chain. This is the intended architecture to prevent deep recursive lookups and maintain identity coherence.

### Verification
- Before any `seal-recursive` transaction is broadcast, confirm that `107` is the sole entry in the dependencies array.
