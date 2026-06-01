# Xtrata Signal Board v1 Test Plan

## Purpose

This checklist tests the current local prototype and prepares for live chain integration.

## 1. Basic loading

- Open `xtrata_signal_board_v1.html` in a browser.
- Confirm the page loads without console errors.
- Confirm the board appears as a square.
- Confirm 25 tiles are visible.
- Confirm the side panel shows selected tile `A0` by default.

## 2. Tile selection

For each of these tiles:

```text
A0, B1, B4, B8, C1, C8, C12, C16
```

Check:

- clicking the tile selects it
- selected outline appears on the tile
- side panel selected tile label updates
- generated memo starts with the correct tile ID

Examples:

```text
A0 -> G1A0...
B4 -> G1B4...
C12 -> G1C12...
```

## 3. Memo generation

Test message input:

```text
GM XTRATA BUILDERS
```

Expected:

- message is uppercased
- spaces become underscores in memo
- display preview shows spaces again
- generated memo includes `W` payload section
- byte counter updates

## 4. Unsafe character handling

Enter:

```text
hello £$% weird characters
```

Expected:

- unsupported characters are removed from memo payload
- app does not crash
- preview still renders safe text

## 5. Byte limit warning

Enter a long message and/or long inscription token ID.

Expected:

- counter shows byte length
- warning appears if over 34 bytes
- local apply refuses overlong memo

## 6. Palette selection

Click each palette:

```text
1 Mono
2 Neon
3 Gold
4 Alert
5 Ocean
6 Paper
```

Expected:

- chip selection updates
- memo style section updates
- preview tile visual style changes
- local applied tile keeps chosen palette

## 7. Fit mode selection

Click each fit mode:

```text
1 Contain
2 Cover
3 Text only
4 Poster
```

Expected:

- chip selection updates
- memo style section updates
- preview responds visually
- local applied tile keeps chosen fit mode

## 8. Local apply

For tile `B4`, enter:

```text
DIAL 0800 DYLE
```

Choose:

```text
Palette: 6 Paper
Fit: 4 Poster
```

Click **Apply local preview**.

Expected:

- only tile `B4` updates
- other tiles are unchanged
- board status count increases
- selected tile remains `B4`

## 9. Decoder test

Paste:

```text
G1B4S31I159
```

Click **Decode**.

Expected:

- tile = `B4`
- palette = `3 Gold`
- fit = `1 Contain`
- inscription = `159`

Click **Apply decoded**.

Expected:

- tile `B4` updates locally
- iframe attempts to load inscription `159`

## 10. Invalid decoder tests

Try each bad memo:

```text
K1B4S31
G1Z9S31
G1C99S31
G1B4S91
G1B4S19
G1B4S31Iabc
G1B4WZHELLOS21
```

Expected:

- decoder rejects the memo
- error message appears
- board state is not changed

## 11. Sample board

Click **Load sample board**.

Expected:

- multiple tiles populate
- centre tile shows `BORING INFRASTRUCTURE`
- `B4` shows `DIAL 0800 DYLE`
- status count updates

## 12. Clear/reset

- Click **Reset tile** on a programmed tile.
- Confirm only that tile clears.
- Click **Clear local**.
- Confirm all local tile state clears.

## 13. Copy buttons

Check:

- **Copy memo** copies the current memo.
- **Copy address** copies target address.
- **Copy board JSON** copies current local state.

## 14. Mobile layout

Open in mobile viewport or on phone.

Expected:

- app becomes single column
- board remains square
- side panel appears below board
- tiles are still clickable
- memo controls remain usable

## 15. Future live-chain tests

Once chain scanning is added, test:

- pending memo appears before confirmation
- confirmed memo replaces pending duplicate
- wrong namespace is ignored
- old Signal King `K1` memos are ignored
- newest valid memo for `A0` updates only `A0`
- newest valid memo for `B4` updates only `B4`
- two different tiles can update from two different transactions
- invalid/overlong memos are ignored
- explorer links open correct transaction
