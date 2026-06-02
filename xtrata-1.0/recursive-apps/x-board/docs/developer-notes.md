# X-Board Developer Notes

## Boundary

[`../x-board.html`](../x-board.html) is the only browser application file. It
contains HTML, CSS, and JavaScript with no build step or framework. Its small
wallet adapter talks directly to injected Stacks wallet providers.

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
| `decodeBoardProgram()` | Strict contract-programme decoder |
| `decodeBoardMemo()` | Strict transfer-memo decoder |
| `applyTextStyle()` | Shared board and preview text rendering |
| `fetchContractStates()` | Authoritative bounded Clarity page reads |
| `fetchCandidates()` | Bounded Hiro transaction fetch |
| `resolveBoard()` | Read-only legacy transfer fallback |
| `submitProgramme()` | Package claim or owner update wallet call |
| `releaseSelectedTile()` | Package owner release wallet call |
| `updateComposer()` | Full-square local preview and byte counter |
| `resolveDescriptor()` | Cached MIME probe for inscriptions |
| `protocolSelfTest()` | Layout and decoder smoke checks |

## Programme Rules

The browser compiler and Clarity validator share:

```text
B1<slot><mode><font><size><position><colour><payload>
```

Wallet calls carry up to `96` ASCII characters. The retained legacy scanner
caps transfer memos at `34` bytes. Text entered through the composer must be
printable ASCII.

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

## Wallet And Contract Boundary

- Configure the deployed registry through `CONFIG.boardContractAddress` and
  `CONFIG.boardContractName`.
- Accept transaction authority only after all bounded `get-tile-page` responses
  have exact lengths, ordered IDs, and parseable valid-tile records.
- Infer network from wallet address prefixes and reject non-mainnet sessions.
- Persist only address, network, and provider label in `localStorage`.
- Serialize only the Clarity uint, ASCII, and STX post-condition forms X-Board
  needs.
- Use deny-mode wallet requests. Claims cap wallet spend and bounded registry
  refunds; releases cap the registry refund; updates allow no STX transfer.
- When contract reads fail, display the legacy transfer view but block wallet
  submission until ownership can be verified.
