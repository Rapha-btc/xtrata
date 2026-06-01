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
| Standalone board | [`x-board.html`](./x-board.html) | Wallet-driven contract client with read-only legacy fallback |
| Clarity registry | [`xboard-clarinet-suite/contracts/xboard-v1.clar`](./xboard-clarinet-suite/contracts/xboard-v1.clar) | Hardened draft |
| Contract and HTML-helper tests | [`xboard-clarinet-suite/tests/`](./xboard-clarinet-suite/tests/) | `17` passing tests |

The standalone board packages `claim-tile`, `program-tile`, and `release-tile`
transactions for a detected Leather or Xverse-compatible wallet. It loads
authoritative state through bounded `get-tile-page` reads. Until the configured
registry is deployed, it displays legacy transfer-memo state as a read-only
fallback and blocks contract submission.

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

Wallet contract calls carry printable ASCII programmes up to `96` characters.
The retained legacy scanner decodes only transfer memos of at most `34` bytes.
Clear programmes use canonical `X0000` form in the browser and contract.

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

Before using wallet transactions, deploy the registry and set
`CONFIG.boardContractAddress` and `CONFIG.boardContractName` in
[`x-board.html`](./x-board.html). The defaults describe the expected mainnet
contract identifier but do not prove that the contract is deployed.

For novice users:

1. open a square and check the full-square preview;
2. connect a mainnet Stacks wallet;
3. review the action and claim bid;
4. press **Send contract transaction** and approve the wallet request;
5. use **Release square** to recover the locked balance when finished.

Claim calls use deny-mode STX post-conditions. They cap the wallet bid and any
bounded refund sent by the registry during an outbid. Release calls cap the
registry refund. Programme-only updates cannot send STX under deny mode.

Run the contract suite:

```bash
cd xboard-clarinet-suite
npm install
clarinet check --use-computed-deployment-plan
npm test
```

## Next Milestone

1. Deploy the registry to testnet and pin its identifier in `CONFIG`.
2. Run real Leather and Xverse claim, outbid, update, release, rejection, and
   RPC-failure sessions.
3. Confirm post-condition compatibility against both wallet providers.
4. Complete an independent contract review before mainnet deployment.

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
