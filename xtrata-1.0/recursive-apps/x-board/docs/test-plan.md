# X-Board Test Plan

## 1. Static Application

- Open `../x-board.html`.
- Confirm the canvas is square.
- Confirm `93` slots are visible.
- Confirm the status bar reports `0 / 93 programmed` before live writes load.
- Confirm the canvas remains square on phone, tablet, and desktop widths.

## 2. Slot Map

- Run the built-in protocol self-test from the information drawer.
- Confirm `slots=93`.
- Confirm `covered=144`.
- Confirm `codes=93`.
- Confirm the canvas has no overlapping or uncovered logical cells.

Boundary mappings:

```text
C01 -> index 0  -> 00
M12 -> index 12 -> 0C
S80 -> index 92 -> 1U
```

## 3. Selection And Preview

For `C01`, `M01`, `M12`, `S01`, and `S80`:

- Click the square.
- Confirm the drawer heading shows the selected public ID.
- Confirm the drawer repeats the wire code.
- Confirm the generated programme uses that wire code.
- Confirm the preview is a complete square, not a cropped strip.
- Confirm the preview remains square when the drawer scrolls.

## 4. Programme Modes

Text:

```text
B100TGM
```

- Select `C01`.
- Enter `GM`.
- Confirm the memo is `B100TGM`.
- Confirm the full-square preview shows `GM`.

Inscription:

```text
B10CI159
```

- Select `M12`.
- Choose inscription mode.
- Enter `159`.
- Confirm the memo is `B10CI159`.
- Confirm the preview resolves or shows a useful placeholder.

Clear:

```text
B11UX
```

- Select `S80`.
- Choose clear mode.
- Confirm the memo is `B11UX`.
- Confirm no payload follows `X`.

## 5. Invalid Programmes

Confirm the decoder rejects:

```text
K1S111
B1zzTNO
B100XBAD
B100Iabc
```

Also test:

- empty text;
- empty inscription token ID;
- token IDs longer than the configured limit;
- UTF-8 payloads at and over the `34`-byte boundary;
- unknown wire codes;
- unknown modes.

## 6. Chain Resolution

With test transactions:

- Confirm a pending `B1` transfer appears before confirmation.
- Confirm a confirmed transaction replaces its mempool duplicate.
- Confirm a write to one slot does not affect any other slot.
- Confirm the newest valid programme wins independently per slot.
- Confirm wrong recipients and amounts below the minimum are ignored.
- Confirm malformed and unrelated memos are ignored.
- Confirm hidden-tab polling is slower than visible-tab polling.

## 7. Inscription Runtime

Test token IDs covering:

- image;
- video;
- audio;
- interactive HTML;
- PDF;
- text;
- unsupported binary;
- failed runtime lookup.

Confirm descriptor caching, sandboxing, placeholders, and the enlarged lightbox.

## 8. Contract-Backed Version

Before testnet deployment, add Clarinet tests for:

- valid tile indexes `u0..u92`;
- invalid tile IDs;
- initial claim price;
- protocol fee calculation;
- locked balance accounting;
- owner-only updates;
- underbid rejection;
- successful outbid and refund;
- failed outgoing-transfer rollback;
- read-only tile state;
- paged board reads;
- event payloads;
- wallet post-conditions.
