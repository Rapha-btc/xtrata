# X-Board B1 Programme Format

## Purpose

X-Board sends one visual programme for exactly one square as an argument to its
Clarity registry. A retained read-only fallback can also decode older normal
Stacks transfer memos with the same schema.

## Format

```text
B1<slot><mode><font><size><position><colour><payload>
```

| Field | Characters | Meaning |
|---|---:|---|
| `B1` | `2` | X-Board namespace and version |
| `<slot>` | `2` | Fixed-width base62 square wire code |
| `<mode>` | `1` | `T` text, `I` inscription reference, or `X` clear |
| `<font>` | `1` | Font palette code `0..4` |
| `<size>` | `1` | Size palette code `0..4` |
| `<position>` | `1` | Position palette code `0..8` |
| `<colour>` | `1` | Colour palette code `0..9` |
| `<payload>` | variable | Printable ASCII text or decimal token ID |

The fixed header is `9` characters. Wallet contract calls store
`(string-ascii 96)` programmes. The legacy transfer scanner accepts only the
first `34` bytes supported by a Stacks transfer memo.

## Examples

```text
B100T1324GM
B10CI0004159
B11UX0000
```

- `B100T1324GM`: render styled text `GM` in `C01`, wire code `00`.
- `B10CI0004159`: render inscription `#159` in `M12`, wire code `0C`.
- `B11UX0000`: clear `S80`, wire code `1U`.

The compiler and contract require clear programmes in canonical `X0000` form.

## Slot Codes

Slot codes are deterministic two-character base62 values:

```text
0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz
```

| Slot tier | Public IDs | Numeric indexes | Wire-code examples |
|---|---|---:|---|
| Center | `C01` | `0` | `00` |
| Medium | `M01..M12` | `1..12` | `01..0C` |
| Small | `S01..S80` | `13..92` | `0D..1U` |

The public ID is for people. The numeric index is the Clarity contract key. The
wire code embedded in the programme must match that numeric index.

## Validation

A contract programme is rendered only when:

1. It is no more than `96` printable ASCII characters.
2. Its namespace is exactly `B1`.
3. Its wire code maps to a known square.
4. Its mode and all four style codes are valid.
5. Text mode has non-empty printable ASCII payload.
6. Inscription mode has a decimal token ID of at most `12` digits.
7. Clear mode has no payload.
The retained transfer fallback also requires a maximum of `34` bytes and a
recipient and minimum amount matching `CONFIG`.
