# X-Board Developer Notes

## Application Boundary

`../x-board.html` is the only application file. It contains HTML, CSS, and
JavaScript with no build step, framework, or wallet connector.

The application is an inscription-friendly reference implementation. Keep
protocol-facing helpers isolated and testable so they can later move into
reusable modules.

## Canvas Model

X-Board uses a generated `12 x 12` logical grid:

| Tier | Size | Count | Public IDs |
|---|---:|---:|---|
| Center | `4 x 4` | `1` | `C01` |
| Medium | `2 x 2` | `12` | `M01..M12` |
| Small | `1 x 1` | `80` | `S01..S80` |

`buildSlotMap()` creates the `93` immutable slot records in protocol order:

1. center slot;
2. medium slots in row-major order;
3. small slots in row-major order.

Each record includes:

```js
{
  index: 0,
  publicId: "C01",
  wireCode: "00",
  tier: "center",
  col: 4,
  row: 4,
  width: 4,
  height: 4
}
```

Do not reorder slot generation after programmes have been used publicly.

## Runtime Sections

The standalone script is organized around:

| Function or section | Responsibility |
|---|---|
| `CONFIG` | Address, Hiro endpoints, polling, and inscription runtime settings |
| `buildSlotMap()` | Deterministic board topology and slot identity |
| `compileBoardMemo()` | Local design state to compact `B1` programme |
| `decodeBoardMemo()` | Strict `B1` validation |
| `fetchCandidates()` | Confirmed and mempool transfer fetch |
| `candidateFrom()` | Recipient, amount, memo, and timestamp validation |
| `resolveBoard()` | Newest valid candidate per wire code |
| `renderBoard()` | Full square-canvas rendering |
| `updateComposer()` | Full-square local preview and byte counter |
| `resolveDescriptor()` | Cached MIME probe for referenced inscriptions |
| `openLightbox()` | Enlarged MIME-aware inscription view |
| `protocolSelfTest()` | Layout and memo decoder smoke checks |

## State Resolution

Current state is reconstructed from public transfers:

1. Fetch bounded mempool and confirmed transaction lists.
2. Normalize only valid token transfers to the configured address.
3. Decode only valid `B1` programmes.
4. Deduplicate by transaction ID, preferring confirmed records.
5. Sort newest first.
6. Keep the first valid candidate for each slot wire code.

There is no single global winner. Each slot resolves independently.

## Inscription Rendering

An inscription programme carries only a token ID. The contract ID, fallback
contract ID, network, and runtime routes come from `CONFIG`.

- `/runtime/content` provides reconstructed raw bytes and MIME headers.
- `/runtime/` runs interactive HTML inscriptions in sandboxed frames.
- Images render as images.
- Video renders natively where appropriate.
- Audio, PDFs, text, HTML, and unsupported files open in the lightbox.
- Descriptor probes are cached.
- Composer preview probing is debounced to avoid unnecessary requests while a
  token ID is still being typed.

## Preview Rules

The drawer preview must remain a full square:

```css
.preview {
  width: 100%;
  aspect-ratio: 1 / 1;
  flex: 0 0 auto;
}
```

The preview is local only and must stay labelled:

```text
PREVIEW - NOT ON-CHAIN
```

## Clarity Migration

The direct-transfer scanner is the current prototype transport. For the
contract-backed version:

- preserve slot indexes `0..92`;
- use `tile-id uint` as the authoritative key;
- replace transfer scanning with contract read-only state loading;
- add wallet calls for claims and owner updates;
- keep events for activity history and refresh cues;
- preserve the full-square local preview before wallet submission.

See `clarity-contract-plan.md`.
