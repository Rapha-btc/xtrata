# X-Board Project Plan

## Product

X-Board is a square public billboard with `93` independently programmable
regions. A visitor selects one square, designs text or an inscription reference,
checks a full-square preview, and generates a programme for that exact square.

The only browser app is [`../x-board.html`](../x-board.html).

## Fixed Layout

| Tier | Bounds | Size | Count | IDs |
|---|---|---:|---:|---|
| Center | columns `4..7`, rows `4..7` | `4 x 4` | `1` | `C01` |
| Middle ring | inner `8 x 8`, excluding center | `2 x 2` | `12` | `M01..M12` |
| Outer ring | outside inner `8 x 8` | `1 x 1` | `80` | `S01..S80` |

The slot generation order and base62 wire codes are immutable protocol data.

## Canonical Programme

```text
B1<slot><mode><font><size><position><colour><payload>
```

Examples:

```text
B100T1324GM
B10CI0004159
B11UX0000
```

The browser and Clarity validator now use this same schema.

## Implemented

Standalone browser:

- generated square grid and stable IDs;
- text, inscription, and clear modes;
- font, size, position, and colour composer controls;
- full-square local preview;
- compact transfer-memo compiler and strict decoder;
- bounded Hiro transaction reads, pending markers, and per-square resolution;
- cached inscription MIME probing and lightbox;
- protocol self-test.

Clarity registry:

- claim, outbid, refund, programme update, release, pause, and fee withdrawal;
- direct-wallet mutation guard;
- standard-wallet-only admin withdrawals;
- paused release path;
- bounded `get-tile-page` read;
- structured print events;
- runnable modern Clarinet scaffold and hardened tests.

## Next Phase: Wallet Integration

1. Add persistent network-aware Stacks wallet connection.
2. Configure testnet contract identifier.
3. Replace render authority with bounded `get-tile-page` reads.
4. Submit `claim-tile`, `program-tile`, and `release-tile` wallet calls.
5. Add STX post-conditions to claims.
6. Expose owner, gross bid, locked value, required next bid, and wallet logs.
7. Retain the full-square preview and inscription descriptor cache.
8. Run multi-wallet takeover tests on testnet.

## Mainnet Gate

- independent Clarity review;
- testnet claim, outbid, pause, release, and withdrawal sessions;
- wallet rejection and RPC failure handling;
- mobile layout verification;
- economic parameter confirmation;
- deployed contract identifier pinned in configuration.
