# Xtrata Signal Board v1 Next Steps

## Immediate development tasks

### 1. Port the Signal King chain scanner

Bring across the parts of Signal King that already work:

- Hiro API configuration.
- Pending transfer fetch.
- Confirmed transfer fetch.
- Hex memo decoding.
- Candidate filtering.
- Transaction timestamp handling.
- Refresh/poll loop.

Then change the winner logic.

Signal King:

```text
newest valid memo wins globally
```

Signal Board:

```text
newest valid memo wins per tile
```

### 2. Add live / local mode

The current app is local-only. Add a small mode switch:

```text
Live on-chain | Local preview
```

Local preview remains useful for testing generated memos before sending a transaction.

### 3. Add pending and confirmed visual states

A tile should be able to show:

- pending update
- confirmed update
- stale local preview

This can be done with a small badge or outline colour.

### 4. Add tile history

Clicking or long-pressing a tile could open a history drawer showing:

- latest holder/sender
- txid
- memo
- decoded state
- timestamp
- previous claims for the same tile

This will make the board feel public and auditable.

### 5. Add transaction helper copy block

The side panel should eventually show:

```text
Send to: <target address>
Amount: <minimum STX>
Memo: <generated memo>
```

Potential future addition: wallet integration.

## Product decisions still needed

### Should all tiles cost the same?

Simplest v1:

```text
Any valid tiny STX transfer can update any tile.
```

Possible v2:

```text
A0 costs more than B tiles.
B tiles cost more than C tiles.
```

### Should updates expire?

Possible models:

1. Newest valid memo wins forever until replaced.
2. Tiles expire after a fixed period.
3. Higher payment holds longer.
4. Central tile uses a bidding mechanic.

For now, newest-valid-per-tile is simplest.

### Should text and inscription be allowed together?

The current prototype allows both.

Possible production rules:

- text-only
- inscription-only
- text overlay on inscription
- caption below inscription

Keep v1 flexible but visually controlled.

## Suggested production roadmap

### v1.1

- Chain scanner integrated.
- Live board works.
- Pending/confirmed status.
- Explorer links.

### v1.2

- Tile history drawer.
- Improved inscription MIME-aware rendering.
- Fullscreen tile view.
- Better mobile programming flow.

### v1.3

- Optional tile pricing.
- Minimum amount by tile tier.
- Visual leaderboards / most contested tiles.

### v2

- More compact memo format.
- Dictionary compression.
- Bidding/hold-time mechanics.
- Multiple board templates.
- Marketplace-compatible board slots.
