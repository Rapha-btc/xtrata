# X-Board B1 Memo Format

## Purpose

The current X-Board application reads normal Stacks transfers sent to its
configured address. A valid transfer memo carries one compact programme that
updates exactly one square.

The memo limit is `34` UTF-8 bytes.

## Format

```text
B1<slot><mode><payload>
```

| Field | Bytes | Meaning |
|---|---:|---|
| `B1` | `2` | X-Board protocol namespace and version |
| `<slot>` | `2` | Fixed-width base62 slot wire code |
| `<mode>` | `1` | `T` text, `I` inscription reference, or `X` clear |
| `<payload>` | variable | UTF-8 text or decimal Xtrata token ID |

The fixed protocol header uses five bytes, leaving up to `29` bytes for text.

## Examples

```text
B100TGM
B10CI159
B11UX
```

Interpretation:

- `B100TGM`: write `GM` to center slot `C01`, wire code `00`.
- `B10CI159`: show Xtrata inscription `#159` in slot `M12`, wire code `0C`.
- `B11UX`: clear slot `S80`, wire code `1U`.

## Slot Codes

Slot codes are generated deterministically from numeric indexes using:

```text
0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz
```

Each wire code is two characters. Current indexes range from `0` to `92`.

| Slot tier | Public IDs | Numeric indexes | Wire-code examples |
|---|---|---:|---|
| Center | `C01` | `0` | `00` |
| Medium | `M01..M12` | `1..12` | `01..0C` |
| Small | `S01..S80` | `13..92` | `0D..1U` |

The public ID is for people. The numeric index is the natural future Clarity
contract key. The wire code is the compact transport form.

## Validation Rules

A memo is accepted only when:

1. Its UTF-8 encoded size is at most `34` bytes.
2. Its namespace is exactly `B1`.
3. Its two-character wire code maps to one known X-Board slot.
4. Its mode is `T`, `I`, or `X`.
5. `T` has non-empty normalized text.
6. `I` has a numeric token ID no longer than the configured limit.
7. `X` has no trailing payload.
8. The transfer recipient matches the configured X-Board address.
9. The transfer amount meets the configured minimum.

Malformed programmes are ignored completely.

## Contract Transition

For the future Clarity-backed application, the authoritative target must be a
`tile-id uint` contract argument rather than a parsed string alone.

The existing `B1` programme can remain the stored visual programme for
compatibility and debugging. The front end must verify that the `B1` slot code
matches the `tile-id` argument before submitting a wallet contract call.
