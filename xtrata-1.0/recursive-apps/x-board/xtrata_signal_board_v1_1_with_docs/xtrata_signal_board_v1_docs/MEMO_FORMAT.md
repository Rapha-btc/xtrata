# Xtrata Signal Board v1 Memo Format

## Purpose

The memo format is the compact program that updates one tile on the Signal Board.

Every valid memo must say:

1. This memo belongs to Signal Board v1.
2. Which tile it targets.
3. What text, style, and/or inscription should be shown.

The decoder rejects invalid, malformed, or overlong memos.

## Current draft format

```text
G1<tileId>[W<len><payload>]S<palette><fit>[I<tokenId>]
```

Example:

```text
G1A0WBHELLO_WORLDS21
```

Example with an inscription reference:

```text
G1B4S31I159
```

Example with text and inscription:

```text
G1C12W7BUILDERS21I987
```

## Sections

### Namespace

```text
G1
```

`G1` means Signal Grid / Signal Board v1.

The app should ignore other namespaces. This prevents old Signal King `K1` memos from being interpreted as board updates.

### Tile ID

Tile ID follows the namespace immediately.

Valid tile IDs in v1:

```text
A0
B1 B2 B3 B4 B5 B6 B7 B8
C1 C2 C3 C4 C5 C6 C7 C8 C9 C10 C11 C12 C13 C14 C15 C16
```

The tile ID is mandatory.

This is the most important difference from Signal King. Signal King has one programmable object. Signal Board has many, so every memo must identify the square it affects.

### Text payload

Optional.

```text
W<len><payload>
```

- `W` marks the start of a text payload.
- `<len>` is one base32 character from `0-9A-V`.
- `<payload>` is the encoded safe text.

Spaces are encoded as underscores.

For example:

```text
HELLO WORLD
```

becomes:

```text
HELLO_WORLD
```

The prototype accepts these safe payload characters:

```text
A-Z 0-9 _ @ . - ! ? : # + & /
```

Unsupported characters are stripped by the compiler.

### Style section

Mandatory in the current compiler.

```text
S<palette><fit>
```

`S` marks the style section. It is followed by exactly two characters.

#### Palette codes

```text
1 Mono
2 Neon
3 Gold
4 Alert
5 Ocean
6 Paper
```

#### Fit mode codes

```text
1 Contain
2 Cover
3 Text only
4 Poster
```

### Inscription reference

Optional.

```text
I<tokenId>
```

The token ID must be numeric.

The memo carries only the token ID. Contract ID, fallback contract ID, network, and runtime route come from app config.

This keeps the memo short.

## Byte limit

The app warns when the generated memo exceeds 34 bytes.

This mirrors the design constraint from Signal King, where the public memo has to remain compact.

In production, overlong memos should be rejected by the decoder.

## Decoder behaviour

The decoder should reject:

- wrong namespace
- missing tile ID
- unknown tile ID
- memo over byte limit
- malformed text payload length
- unsupported payload characters
- invalid palette code
- invalid fit code
- non-numeric inscription ID
- trailing malformed data

Rejected memos should be ignored, not allowed to break the board.

## State model

A decoded memo produces a state object like:

```js
{
  tileId: 'B4',
  message: 'DIAL 0800 DYLE',
  palette: '6',
  fit: '4',
  inscription: null,
  memo: 'G1B4WEDIAL_0800_DYLES64'
}
```

For live chain mode, the app should decode all candidate memos, group them by tile ID, and keep the newest valid state per tile.

## Future compression options

The current v1 payload is deliberately simple. Later versions could add:

- dictionary word compression like Signal King
- tile ID compaction
- shorter style encoding
- text-only and inscription-only shortcuts
- versioned namespace such as `G2` for incompatible changes

Do not break `G1` once live memos exist on-chain.
