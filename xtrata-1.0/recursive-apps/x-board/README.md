# X-Board

X-Board is a programmable public billboard for Xtrata on Stacks. Its square
canvas contains `93` independently addressable regions: one large center square,
twelve medium squares, and eighty small squares.

The only browser application is [`x-board.html`](./x-board.html). It remains a
standalone HTML, CSS, and JavaScript file with no build step. The connected
Clarity ownership registry and its runnable tests live in
[`xboard-clarinet-suite/`](./xboard-clarinet-suite/).

## Current Status

| Layer | Location | Status |
|---|---|---|
| Standalone board | [`x-board.html`](./x-board.html) | Working transfer-memo prototype |
| Clarity registry | [`xboard-clarinet-suite/contracts/xboard-v1.clar`](./xboard-clarinet-suite/contracts/xboard-v1.clar) | Hardened draft |
| Contract tests | [`xboard-clarinet-suite/tests/xboard-v1.test.ts`](./xboard-clarinet-suite/tests/xboard-v1.test.ts) | `15` passing tests |

The standalone board still reconstructs visible state from ordinary Stacks
transfers sent to its configured address. The contract is not yet wired into the
browser app or deployed. The browser compiler and Clarity validator now use the
same `B1` visual programme schema so wallet integration can reuse the existing
preview.

## Layout

The canvas uses a fixed `12 x 12` logical grid:

| Tier | Square size | Count | Public IDs |
|---|---:|---:|---|
| Center | `4 x 4` | `1` | `C01` |
| Middle ring | `2 x 2` | `12` | `M01..M12` |
| Outer ring | `1 x 1` | `80` | `S01..S80` |
| **Total** | | **93** | |

Slot order is protocol data: center first, then medium squares in row-major
order, then small squares in row-major order. Do not reorder slots after public
use begins.

## B1 Programme

The browser and contract use:

```text
B1<slot><mode><font><size><position><colour><payload>
```

Examples:

```text
B100T1324GM
B10CI0004159
B11UX0000
```

The standalone transfer-memo prototype applies the Stacks memo limit of `34`
bytes. The Clarity contract stores printable ASCII programmes up to `96`
characters for future wallet contract calls. Clear programmes are emitted in
canonical `X0000` form.

See [`docs/memo-format.md`](./docs/memo-format.md).

## Contract Model

The draft contract implements:

- tile IDs `u0..u92`;
- `1 STX` minimum first claim;
- `1%` protocol fee on each successful claim or outbid;
- rounded-up `1%` minimum gross-bid increment;
- refundable locked balance for the current owner;
- displaced-owner refund during an outbid;
- owner-only programme updates;
- voluntary release, including while the contract is paused;
- owner-only withdrawal of accrued fees to standard wallet principals;
- direct-wallet-only state changes;
- bounded `get-tile-page` reads of at most `10` entries;
- structured print events for claims, programmes, releases, fee withdrawals,
  and pause changes.

The suite asserts exact STX movements, failed-transfer rollback, rounding,
bounded reads, event emission, paused releases, and rejection of forwarded
contract calls.

## Run

Serve the standalone app:

```bash
python3 -m http.server 8000
```

Open:

```text
http://localhost:8000/x-board.html
```

Run the contract suite:

```bash
cd xboard-clarinet-suite
npm install
clarinet check --use-computed-deployment-plan
npm test
```

## Next Milestone

The next major change is wallet integration:

1. connect a persistent, network-aware Stacks wallet session;
2. load authoritative board state through bounded contract reads;
3. submit `claim-tile`, `program-tile`, and `release-tile` calls;
4. add STX post-conditions to claim calls;
5. retain the transfer scanner only as prototype or history code;
6. deploy to testnet and run multi-wallet takeover tests before mainnet review.

## Documentation

| File | Purpose |
|---|---|
| [`docs/README.md`](./docs/README.md) | Documentation index |
| [`docs/x-board-project-plan.md`](./docs/x-board-project-plan.md) | Product scope and roadmap |
| [`docs/memo-format.md`](./docs/memo-format.md) | Canonical `B1` programme schema |
| [`docs/developer-notes.md`](./docs/developer-notes.md) | Standalone runtime architecture |
| [`docs/test-plan.md`](./docs/test-plan.md) | Browser and contract verification |
| [`docs/clarity-contract-plan.md`](./docs/clarity-contract-plan.md) | Contract model and migration plan |
| [`xboard-clarinet-suite/README.md`](./xboard-clarinet-suite/README.md) | Clarinet suite instructions |
