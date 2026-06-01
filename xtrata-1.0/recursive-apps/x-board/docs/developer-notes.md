# X-Board Developer Notes

## Boundary

[`../x-board.html`](../x-board.html) is the only browser application file. It
contains HTML, CSS, and JavaScript with no build step, framework, or wallet
connector.

## Canvas

`buildSlotMap()` generates a stable `12 x 12` logical canvas:

| Tier | Size | Count | Public IDs |
|---|---:|---:|---|
| Center | `4 x 4` | `1` | `C01` |
| Medium | `2 x 2` | `12` | `M01..M12` |
| Small | `1 x 1` | `80` | `S01..S80` |

Slot order is center, medium row-major, then small row-major. Do not reorder it.

## Runtime Map

| Function | Responsibility |
|---|---|
| `buildSlotMap()` | Deterministic topology and identities |
| `compileBoardMemo()` | Draft to canonical styled `B1` programme |
| `decodeBoardMemo()` | Strict transfer-memo decoder |
| `applyTextStyle()` | Shared board and preview text rendering |
| `fetchCandidates()` | Bounded Hiro transaction fetch |
| `resolveBoard()` | Newest valid transfer programme per wire code |
| `updateComposer()` | Full-square local preview and byte counter |
| `resolveDescriptor()` | Cached MIME probe for inscriptions |
| `protocolSelfTest()` | Layout and decoder smoke checks |

## Programme Rules

The browser compiler and Clarity validator share:

```text
B1<slot><mode><font><size><position><colour><payload>
```

The standalone transfer scanner caps programmes at `34` bytes. The Clarity
contract accepts up to `96` ASCII characters for future wallet calls. Text
entered through the composer must be printable ASCII.

Clear mode emits canonical `X0000`. Keep compiler, decoder, contract, tests, and
documentation synchronized when changing this schema.

## Preview

The programming drawer preview must stay square:

```css
.preview {
  width: 100%;
  aspect-ratio: 1 / 1;
  flex: 0 0 auto;
}
```

The preview uses the same `renderSlotContent()` path as the board and remains
labelled `PREVIEW - NOT ON-CHAIN`.

## Inscription Rendering

Inscription programmes carry only token IDs. Runtime routes and contracts come
from `CONFIG`.

- Cache MIME descriptor probes.
- Debounce inscription preview probes while typing.
- Render images and appropriate videos inline.
- Use the lightbox for audio, HTML, PDF, text, and unsupported files.
- Keep interactive HTML sandboxed.

## Contract Migration

The standalone transfer scanner is prototype transport. The next implementation
should load authoritative state via bounded `get-tile-page` calls and submit
wallet transactions to the Clarity registry. Preserve the slot map and preview
path during that migration.
