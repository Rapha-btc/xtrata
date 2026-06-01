# Xtrata Signal Board v1

A first-draft standalone HTML prototype for a square programmable billboard inspired by the earlier **Xtrata Signal King** app.

Signal King proves the compact-program idea: a fixed inscription/application can read public transaction memos, decode valid state updates, and render the newest valid state. Signal Board keeps that idea but replaces the single crown/totem interface with a tiled billboard where each square has its own code and can be programmed independently.

## Current status

This is a **local prototype**.

Built:

- Square billboard UI.
- 25 stable programmable tiles.
- Click-to-select tile flow.
- Tile-coded memo compiler.
- Memo decoder test panel.
- Local preview/apply state.
- Sample board loader.
- Xtrata inscription token preview via iframe route.
- 34-byte memo warning.

Not yet built:

- Live Stacks transaction scanning.
- Pending/confirmed chain state grouping.
- Wallet transaction helper.
- Real per-tile holder display from chain data.
- Pricing/minimum STX by tile size.
- Tile history drawer.

## Files

```text
xtrata_signal_board_v1.html   Standalone app prototype
README.md                     Product/use overview
MEMO_FORMAT.md                Memo compiler and decoder specification
DEVELOPER_NOTES.md            Architecture and next integration steps
TEST_PLAN.md                  Manual test checklist
```

## Running the app

Open `xtrata_signal_board_v1.html` directly in a browser.

No build step is required.

No packages, framework, backend, wallet connection, or local server are required for the first draft.

Some embedded inscription previews may behave better from an HTTPS-hosted page than from a `file://` URL, because browsers can restrict iframe/network behaviour on local files.

## What the app does

The page shows a square board divided into fixed tiles:

- `A0` — one large hero centre tile.
- `B1` to `B8` — eight medium tiles around the centre.
- `C1` to `C16` — sixteen small corner tiles.

Clicking a tile selects it. The right-hand panel then generates a memo that targets that exact tile.

For example, if tile `B4` is selected, the generated memo starts with:

```text
G1B4...
```

If tile `C12` is selected, the memo starts with:

```text
G1C12...
```

This is the key safety feature of the prototype: the memo always carries the intended tile ID.

## Basic user flow

1. Open the app.
2. Click a tile on the board.
3. Type a message, optionally add an inscription token ID.
4. Choose a palette and fit mode.
5. Review the generated memo.
6. Click **Apply local preview** to test the tile locally.
7. Use **Copy memo** when ready to use the memo in a transaction.

In the future live version, the user would send a tiny STX transfer to the board address with this memo. The board would read pending and confirmed transfers and update the relevant tile.

## Important design principle

Signal Board should not become a complex editor. The memo size is limited, so the memo should only contain the minimum state required to update a tile:

- namespace/version
- tile ID
- short text payload
- style code
- optional inscription token ID

Everything else should come from the app config or fixed code.

## Recommended next step

The next development step is to adapt the existing Signal King transaction scanner into this app.

The key change is that Signal King keeps one latest valid state globally, while Signal Board must group valid memos by tile ID and keep the newest valid claim for each tile.
