# X-Board Project Plan

## 1. Project Summary

X-Board is a programmable public billboard built from square regions. It takes
the core idea from Signal King: an immutable inscription reads public Stacks
transfers sent to a configured address, validates their memos, and renders the
newest valid state.

The main difference is scope. Signal King has one programmable state. X-Board
has a fixed map of independently programmable square slots. A visitor selects a
square, composes text or references an Xtrata inscription, and receives a memo
that includes the exact code for that square. A valid transfer changes only the
selected square.

The first version should remain a standalone inscription-friendly HTML file:
no build tools, no backend requirement, and no wallet connection. It may use
same-origin Xtrata runtime routes to resolve referenced inscriptions, following
the existing Signal King integration.

## 2. What To Reuse From Signal King

The current `index.html` is a strong reference implementation for:

- scanning confirmed and mempool Stacks transfers sent to one address;
- rejecting invalid, overlong, or unrelated memos;
- rendering pending changes before confirmation;
- producing a local preview that is clearly labelled as not on-chain;
- resolving Xtrata inscription references through `/runtime/content`;
- rendering images, video, HTML, text, audio, PDFs, and fallback placeholders;
- using sandboxed frames for interactive HTML inscriptions;
- bounding polling frequency and reducing polling when the tab is hidden;
- keeping a human-readable compiler in the page so users do not manually write
  protocol messages.

X-Board should not inherit Signal King's crown, vibe, action, dictionary, or
single-winner visual hierarchy. The billboard should be quieter: the board is
the main object, selection is obvious, and programming controls are contextual.

## 3. Product Principles

1. The square canvas is the product. Keep the outer layout minimal.
2. Every visual square has one stable ID and one compact wire code.
3. The page generates memos. Users should not need to understand encoding.
4. A transfer may affect exactly one square in version 1.
5. Text and inscription references are the only content modes in version 1.
6. The newest valid transfer for a square wins for that square only.
7. The selected square stays visible while the programming panel is open.
8. The canvas remains square at every responsive size.
9. Loaded inscription content should be reused between the board, preview, and
   enlarged view where practical.
10. Keep polling bounded. Fetch the board transaction feed once per refresh,
    then resolve all square states from that result.

## 4. Canvas Layout

### 4.1 Logical Grid

Use a fixed `12 x 12` logical grid. Each atomic grid unit is square.

- One large center slot occupies `4 x 4` units.
- Twelve medium slots occupy `2 x 2` units each.
- Eighty small slots occupy `1 x 1` unit each.

This creates the requested progression:

- each medium square has one quarter of the center square's area;
- each small square has one quarter of a medium square's area;
- the complete billboard is one square canvas with no gaps.

The layout is generated from three square zones:

| Zone | Bounds | Slot size | Slot count |
|---|---:|---:|---:|
| Center | columns `4..7`, rows `4..7` | `4 x 4` | `1` |
| Middle ring | inside columns `2..9`, rows `2..9`, excluding center | `2 x 2` | `12` |
| Outer ring | full `12 x 12`, excluding the middle `8 x 8` zone | `1 x 1` | `80` |
| **Total** | | | **93** |

### 4.2 Deterministic Slot Order

Slot order must be generated once and treated as protocol data:

1. center slot;
2. medium slots in row-major order;
3. small slots in row-major order.

Each generated slot record should contain:

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

Use visible IDs that are easy to check:

- `C01` for the center;
- `M01` through `M12` for medium slots;
- `S01` through `S80` for small slots.

Use a separate compact two-character base-62 `wireCode` for memos:

- alphabet: `0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz`;
- encode slot indexes `0..92` as fixed-width two-character values;
- examples: index `0` is `00`, index `12` is `0C`, index `92` is `1U`.

The visible ID is for people. The wire code is for memo efficiency. Both map to
exactly one immutable slot record.

### 4.3 CSS Rendering

Render the billboard as one CSS Grid:

```css
.board {
  aspect-ratio: 1;
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  grid-template-rows: repeat(12, minmax(0, 1fr));
}
```

Each slot uses explicit `grid-column` and `grid-row` values from the slot map.
The programming drawer overlays the page instead of changing board width. This
keeps the canvas stable when controls open and close.

## 5. Memo Protocol

### 5.1 Version 1 Format

Use a new namespace. Do not overload Signal King's `K1` memos.

```text
B1 <slot> <mode> <payload>
```

The serialized memo has no spaces:

```text
B1<slot><mode><payload>
```

Fields:

| Field | Bytes | Meaning |
|---|---:|---|
| `B1` | `2` | X-Board protocol namespace and version |
| `<slot>` | `2` | Fixed-width base-62 slot wire code |
| `<mode>` | `1` | `T` text, `I` inscription reference, or `X` clear |
| `<payload>` | variable | Text bytes or decimal Xtrata token ID |

The Stacks transfer memo limit is `34` bytes, leaving up to `29` bytes for a
text payload after the five-byte protocol header.

Examples:

```text
B100TGM
B10CI159
B11UX
```

Interpretation:

- `B100TGM`: set slot `00` (`C01`) to text `GM`;
- `B10CI159`: set slot `0C` to Xtrata inscription `#159`;
- `B11UX`: clear slot `1U` (`S80`).

### 5.2 Validation Rules

A memo is accepted only when all rules pass:

1. The encoded memo is at most `34` bytes.
2. The namespace is exactly `B1`.
3. The slot code is exactly two base-62 characters.
4. The slot code resolves to one known slot in the fixed map.
5. `T` contains non-empty display text after normalization.
6. `I` contains only digits, strips leading zeros, and respects a configured
   maximum token ID length.
7. `X` contains no payload.
8. Any trailing or malformed content rejects the complete memo.
9. The transfer recipient matches the configured board address.
10. The transfer amount meets the configured minimum.

Text should be escaped through DOM `textContent`, never inserted as HTML.
Version 1 can accept printable UTF-8 text subject to the byte limit. The UI
must display the actual byte count because non-ASCII characters may use more
than one byte.

### 5.3 Why One Square Per Memo

One-square writes are intentional:

- the selected slot is unambiguous;
- a malformed memo cannot partially update a board;
- transaction history is easy to explain and audit;
- the full memo budget remains available for one message or token ID;
- the resolver can group valid candidates by slot and choose the latest one.

Batch writes can be considered later under a new protocol namespace.

## 6. State Resolution

On refresh:

1. Fetch recent mempool transfers for the board recipient.
2. Fetch recent confirmed transfers for the board recipient.
3. Normalize each transfer into a candidate only if it passes memo validation.
4. Deduplicate by transaction ID, preferring a confirmed record over its
   mempool copy.
5. Group candidates by `slot.wireCode`.
6. Sort each group newest first and select one winner per slot.
7. Render the complete board from those independent winners.

The important difference from Signal King is that there is no single global
winner. X-Board resolves up to `93` independent latest states from one shared
transaction feed.

### 6.1 History Depth

The current Signal King fetch limit of `25` confirmed and `25` pending
transactions is too small for a `93`-slot board. An initial X-Board version
should request a larger bounded page and expose a clear configuration value.

Recommended starting point:

```js
confirmedLimit: 200,
pendingLimit: 50
```

This is enough for a prototype but not a permanent archive strategy. If board
activity becomes high, add pagination or an optional cached index. The
inscribed application must continue to work without that optional index.

## 7. User Experience

### 7.1 Viewer

The default screen is intentionally simple:

- compact Xtrata / X-Board header;
- square billboard centered in the available viewport;
- small status line for refresh state and pending writes;
- optional information button;
- optional refresh button.

Each slot displays one of:

- text;
- referenced inscription media;
- empty-state treatment;
- pending-state marker;
- loading or unsupported-content placeholder.

Text sizing should depend on tier. The center supports the largest display
type, medium slots use compact text, and small slots use a deliberately terse
presentation. Small cells may truncate visually, but their full text remains
available in the detail panel.

### 7.2 Selecting A Square

Clicking or tapping a square:

1. highlights the exact square without changing canvas geometry;
2. opens a contextual detail/programming drawer;
3. shows both its visible ID and wire code, for example `M07 / code 07`;
4. shows the current live state, holder, transaction status, and transaction
   link when available;
5. offers `Write text`, `Show inscription`, and `Clear square`.

The drawer heading must include the selected visible ID:

```text
Program square M07
```

The generated memo card repeats the selected visible ID and code:

```text
Target: M07
Memo: B107THELLO
```

This repetition is a deliberate guard against programming the wrong region.

### 7.3 Composing A Write

Text mode:

- text input;
- live square preview;
- UTF-8 byte meter;
- generated memo;
- copy memo and copy recipient address buttons.

Inscription mode:

- numeric Xtrata token ID input;
- MIME-aware preview using the existing runtime routes;
- generated memo;
- copy memo and copy recipient address buttons.

Clear mode:

- explicit explanation that the square becomes empty;
- generated `X` memo;
- confirmation before copying.

The local preview must be visibly labelled `PREVIEW - NOT ON-CHAIN`.

### 7.4 Enlarged View

Clicking an inscription-backed square from view mode opens a square lightbox.
Reuse Signal King's MIME-aware handling:

- native image and video display;
- audio controls;
- sandboxed runtime frame for HTML;
- frame or raw link for documents;
- text source display;
- fallback placeholder and raw inscription link.

## 8. Suggested Standalone Structure

Keep the first prototype in `index.html`, but separate concerns within the
script so later extraction is straightforward:

```text
CONFIG
SLOT_MAP + base62 helpers
MEMO CODEC
CHAIN LAYER
INSCRIPTION RUNTIME
BOARD STATE RESOLVER
DOM RENDERING
PROGRAMMING DRAWER
LIGHTBOX
INIT + POLLING
```

The codec and slot-map helpers should be written as pure functions even inside
the standalone file. That makes browser-console testing simple and allows later
extraction into reusable SDK-ready modules.

## 9. Development Phases

### Phase 1: Freeze The Protocol

- Generate and inspect the `93` slot records.
- Implement base-62 fixed-width slot encoding and decoding.
- Implement `compileBoardMemo()` and `decodeBoardMemo()`.
- Add valid and invalid memo samples near the top of the file.
- Add a hidden developer panel that exercises sample decodes.

Acceptance criteria:

- every visible slot maps to one unique wire code;
- every valid wire code maps back to one visible slot;
- malformed slot codes never fall through to another square;
- `T`, `I`, and `X` round-trip correctly;
- overlong UTF-8 memos are rejected.

### Phase 2: Render The Static Billboard

- Replace the Signal King totem stage with the square board.
- Generate all cells from `SLOT_MAP`.
- Add hover, keyboard focus, selected, loading, and pending states.
- Keep the board square and stable while the drawer is open.

Acceptance criteria:

- no overlaps or gaps at desktop and mobile widths;
- center, medium, and small squares retain their intended ratios;
- every cell can be reached with keyboard navigation;
- opening a drawer does not cause horizontal layout shift.

### Phase 3: Resolve Independent On-Chain State

- Reuse Signal King's Hiro fetch pattern.
- Decode `B1` candidates only.
- Group winners per slot.
- Render text, empty state, sender, pending status, and transaction links.
- Increase bounded feed limits and retain hidden-tab polling reduction.

Acceptance criteria:

- a write to `M07` changes only `M07`;
- a newer write to `S12` does not replace an older `C01` state;
- confirmed transfers supersede duplicate mempool records;
- unrelated transfers and `K1` Signal King memos are ignored.

### Phase 4: Add The Programming Drawer

- Open the drawer from the selected cell.
- Add text, inscription, and clear modes.
- Generate memos automatically with the selected slot code.
- Repeat target ID and wire code beside the memo.
- Add local preview and copy controls.

Acceptance criteria:

- changing selection updates the target code immediately;
- copy memo is disabled when validation fails;
- the visible target always matches the encoded target;
- preview is never presented as live on-chain state.

### Phase 5: Add Recursive Inscription Rendering

- Adapt Signal King's `/runtime/content` and `/runtime/` integration.
- Reuse descriptor caching and HEAD probes where useful.
- Render compact board media without loading interactive HTML frames for every
  off-screen or tiny slot unnecessarily.
- Load heavier media on selection or lightbox open.

Acceptance criteria:

- referenced images render inside their square without affecting geometry;
- interactive HTML opens sandboxed in an enlarged view;
- failed media loads fall back cleanly;
- already-resolved descriptors are reused.

### Phase 6: Harden And Tune

- Add paging or incremental history loading if feed depth is insufficient.
- Test high-density boards with many inscription-backed slots.
- Review mobile tap targets and small-square readability.
- Add reduced-motion handling.
- Document configuration and retargeting steps.

## 10. Test Plan

### Codec Tests

- all `93` slot IDs encode and decode uniquely;
- first and last slot boundaries;
- text, inscription, and clear round trips;
- unknown namespace;
- unknown slot;
- invalid mode;
- empty text;
- non-digit inscription;
- clear command with trailing data;
- ASCII and multibyte UTF-8 byte-limit boundaries;
- malformed and overlong memos.

### Resolver Tests

- independent newest-wins resolution per square;
- confirmed record preferred over mempool duplicate;
- newest pending write shown for only its target square;
- invalid transactions ignored;
- recipient and minimum-amount guards;
- bounded transaction collection behavior.

### Layout Tests

- `12 x 12` coverage with no overlap and no uncovered grid unit;
- correct tier counts: `1`, `12`, and `80`;
- square canvas at phone, tablet, and desktop widths;
- stable width while drawers open and close;
- selected cell remains visible and identifiable.

### Runtime Tests

- image, video, audio, HTML, text, PDF, and unsupported binary descriptors;
- sandbox attributes for HTML frames;
- descriptor cache reuse;
- failed HEAD probe and failed media fallback;
- lightbox open and close behavior.

## 11. Decisions To Confirm Before Implementation

The plan above makes conservative defaults, but these product decisions should
be confirmed before the protocol is frozen:

1. **Board name:** use `X-Board` as the working name or choose a public title.
2. **Write ownership:** keep the Signal King rule where anyone can overwrite any
   square, or add a separate lease/ownership concept in a later version.
3. **Text policy:** allow printable UTF-8 text or restrict the first version to
   a smaller safe character set.
4. **Empty-state style:** quiet grid, visible slot IDs, or a hybrid where IDs
   appear on hover and selection.
5. **Inscription loading:** load media for all populated squares immediately or
   lazy-load medium and small squares until they approach the viewport.
6. **History strategy:** use direct Hiro reads only for the prototype, then
   decide whether a cache/index is needed after observing board activity.

## 12. Recommended First Implementation Slice

Build Phases 1 through 4 first with text and clear commands fully working.
Keep inscription mode in the codec and drawer, but render inscription-backed
cells as labelled placeholders until Phase 5 adapts the existing MIME-aware
runtime code.

This produces a usable board quickly while proving the critical property:
selecting a square always generates a memo that changes that square and no
other one.
