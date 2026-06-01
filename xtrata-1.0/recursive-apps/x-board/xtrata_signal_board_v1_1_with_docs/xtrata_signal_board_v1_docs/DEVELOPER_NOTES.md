# Xtrata Signal Board v1 Developer Notes

## Summary

`xtrata_signal_board_v1.html` is a standalone prototype. It contains HTML, CSS, and JavaScript in one file.

It is deliberately built without a framework, bundler, backend, wallet connector, or dependency chain. This keeps it close to the inscription-app model used by Signal King.

## Main concepts

### Board

The board is a square canvas built on an invisible `16 x 16` unit grid.

Each tile is positioned with logical grid coordinates and converted to percentages.

```js
const BOARD_UNITS = 16;
function pct(v){ return (v / BOARD_UNITS * 100) + '%'; }
```

### Tiles

Tiles are defined in the `TILES` array.

Each tile has:

```js
{
  id: 'A0',
  tier: 'A',
  x: 4,
  y: 4,
  w: 8,
  h: 8,
  label: 'Hero centre'
}
```

Current v1 layout:

- `A0` — 8x8 centre tile.
- `B1` to `B8` — 4x4 medium tiles.
- `C1` to `C16` — 2x2 small tiles.

To change the board layout, update the `TILES` array. The renderer will position each tile automatically.

### Board state

The app stores local board state in:

```js
let boardState = {};
```

Each programmed tile gets a state object keyed by tile ID:

```js
boardState['B4'] = {
  tileId: 'B4',
  message: 'DIAL 0800 DYLE',
  palette: '6',
  fit: '4',
  inscription: null,
  memo: '...',
  holder: 'local',
  updated: '12:34'
};
```

The live version should use the same structure, but populate it from decoded chain transactions rather than local button presses.

## Key functions

### `compileMemo()`

Turns the current UI selections into a compact memo.

Responsibilities:

- includes namespace
- includes selected tile ID
- sanitises the text payload
- adds style section
- adds optional inscription ID
- counts bytes
- returns warnings
- returns a state object ready for local preview

### `decodeMemo()`

Parses a memo back into a tile state object.

Responsibilities:

- validates namespace
- validates tile ID
- validates byte length
- decodes payload
- validates style codes
- validates inscription ID
- rejects malformed data

### `renderBoard()`

Clears and rebuilds the board from the `TILES` array and `boardState`.

### `renderTile()` / `renderTileInner()`

Creates the visual tile, including:

- tile code badge
- text display
- optional inscription iframe
- selected state
- palette and fit mode attributes

### `selectTile()`

Updates the selected tile and refreshes the programming panel.

When a user clicks a tile, this function ensures the generated memo changes to match the selected tile.

### `applyLocalState()`

Applies a compiled or decoded state to `boardState` without using the blockchain.

This is prototype-only behaviour.

## Current config

The main config object is:

```js
const CONFIG = {
  namespace: 'G1',
  memoMaxBytes: 34,
  targetAddress: 'SPNRA47CQGS61HQNCBZMVF2HHT7AKZCP2CXH3NP3',
  network: 'mainnet',
  inscriptionContractId: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0',
  inscriptionFallbackContractId: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1',
  inscriptionRuntimeRoute: 'https://xtrata.xyz/runtime/'
};
```

Before going live, confirm:

- target address
- network
- inscription contract ID
- fallback contract ID
- runtime route
- memo byte limit
- minimum STX amount if enforced

## Inscription rendering

If a tile has an `inscription` token ID, the tile renders an iframe using:

```js
inscriptionRuntimeUrl(tokenId)
```

The memo carries only the token ID. The rest comes from config.

This keeps the memo small and matches the approach used by Signal King.

## Chain integration plan

The first draft is local. The next major development task is to adapt the Signal King transaction scanner.

### Required live behaviour

1. Fetch pending transfers to the board target address.
2. Fetch confirmed transfers to the board target address.
3. Only inspect token transfer transactions.
4. Check recipient address matches the board target address.
5. Check amount is at least the minimum accepted amount.
6. Read transfer memo.
7. Decode only `G1` memos.
8. Reject invalid/overlong memos.
9. Group valid candidates by `tileId`.
10. For each tile, keep the newest valid candidate.
11. Render the board from the resulting state map.

### Pseudocode

```js
async function fetchBoardState(){
  const txs = await fetchPendingAndConfirmedTransfers(CONFIG.targetAddress);
  const byTile = {};

  for(const tx of txs){
    const memo = memoString(tx.token_transfer.memo);
    let decoded;
    try {
      decoded = decodeMemo(memo);
    } catch {
      continue;
    }

    const candidate = {
      ...decoded,
      holder: tx.sender_address,
      txid: tx.tx_id,
      updated: txTime(tx)
    };

    const existing = byTile[candidate.tileId];
    if(!existing || candidate.updated > existing.updated){
      byTile[candidate.tileId] = candidate;
    }
  }

  boardState = byTile;
  renderBoard();
}
```

## Important difference from Signal King

Signal King logic:

```text
newest valid memo wins globally
```

Signal Board logic:

```text
newest valid memo wins for its tile only
```

This means the live scanner must not simply sort all valid memos and take the first one. It must group by `tileId`.

## Suggested next implementation order

1. Add Hiro API config from Signal King.
2. Port `hexToAscii()` and `memoString()` from Signal King.
3. Port transaction candidate filtering.
4. Replace global winner logic with per-tile grouping.
5. Add refresh button behaviour.
6. Add polling interval.
7. Add pending-vs-confirmed visual marker.
8. Add transaction explorer links.
9. Add tile history drawer.

## Risks and things to watch

### Memo size

Tile ID costs bytes, so keep v1 minimal.

Avoid adding long URLs, contract IDs, CSS, or arbitrary metadata to the memo.

### Tile ID parsing

Some tile IDs have different lengths, for example `C1` and `C16`. The code sorts tile IDs by length before parsing so longer IDs are matched first.

Do not remove this behaviour unless all tile IDs become fixed width.

### iframe safety

Interactive inscription rendering uses iframes. Keep sandboxing conservative.

### Future compatibility

Once `G1` is live, do not change its meaning. Use `G2` for breaking changes.
