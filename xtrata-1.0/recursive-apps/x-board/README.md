# X-Board

X-Board is a standalone programmable public billboard for Xtrata on Stacks.
The square board contains `93` independently addressable regions: one large
centre square, twelve medium squares, and eighty small squares. Each region has
a stable public ID, numeric contract ID, and two-character wire code.

The only active browser application is [`x-board.html`](./x-board.html). It is a
single-file HTML, CSS, and JavaScript prototype with no build step.

## Current Status

The repository currently contains two connected but distinct stages of the
application:

| Stage | Location | Status |
|---|---|---|
| Standalone board prototype | [`x-board.html`](./x-board.html) | Working browser prototype |
| Clarity ownership registry | [`xboard-clarinet-suite/`](./xboard-clarinet-suite/) | First contract draft and test suite |

The browser prototype is still authoritative for the visible demo. It reads
ordinary Stacks transfers sent to its configured address and resolves the newest
valid programme independently for each square.

The Clarity contract is the planned production authority for ownership,
outbidding, locked balances, and programme updates. It is not wired into the
browser app, deployed, or ready for testnet yet.

## Board Layout

The canvas uses a fixed `12 x 12` logical grid:

| Tier | Square size | Count | Public IDs |
|---|---:|---:|---|
| Centre | `4 x 4` | `1` | `C01` |
| Middle ring | `2 x 2` | `12` | `M01..M12` |
| Outer ring | `1 x 1` | `80` | `S01..S80` |
| **Total** | | **93** | |

Slot order is protocol data: centre first, then medium squares in row-major
order, then small squares in row-major order. Do not reorder slots after public
use begins.

## Run The Prototype

Serve this directory with any static server:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/x-board.html
```

The prototype supports:

- text, referenced Xtrata inscription, and clear operations;
- a full-square local preview before a transaction is sent;
- stable square targeting through two-character base62 codes;
- bounded Hiro confirmed-transaction and mempool reads;
- per-square newest-valid-programme resolution and pending markers;
- MIME-aware inscription rendering and a lightbox;
- a built-in protocol self-test.

## Programme Formats

The active browser prototype and the contract draft currently use different
`B1` programme formats.

The browser prototype emits compact transfer memos:

```text
B1<slot><mode><payload>
```

Examples:

```text
B100TGM
B10CI159
B11UX
```

The contract draft validates a styled programme:

```text
B1<slot><mode><font><size><position><colour><payload>
```

Example:

```text
B100T1324HELLO
```

These formats are not interchangeable. Before wallet integration, choose the
production schema and update the compiler, decoder, preview controls, contract,
and documentation together.

## Contract Draft

The draft contract is in
[`xboard-clarinet-suite/contracts/xboard-v1.clar`](./xboard-clarinet-suite/contracts/xboard-v1.clar).
Its intended model is:

- tile IDs `u0..u92`;
- `1 STX` minimum first claim;
- `1%` protocol fee on each successful claim or outbid;
- `1%` minimum gross-bid increment when outbidding;
- remaining claim value locked for the current owner;
- displaced owner refunded their previous locked balance;
- owner-only programme updates;
- voluntary release with locked-balance refund;
- owner-only protocol-fee withdrawal and narrow pause control.

The Clarinet project has its own instructions in
[`xboard-clarinet-suite/README.md`](./xboard-clarinet-suite/README.md).

## Contract Readiness

The contract suite is a draft, not an audit. The initial critical contract
repairs are applied:

- `wire-code-for-tile` now derives its two base62 characters without a deeply
  nested lookup;
- `release-tile` captures the releasing owner before `as-contract` and refunds
  that wallet.

Resolve these remaining blockers before testnet:

1. Add the missing Clarinet `settings/Devnet.toml` project settings file.
2. Update the Vitest setup: the current `clarinet` environment is not supplied
   by the installed SDK, so the test runner starts no tests.
3. Add explicit STX balance assertions for claim, outbid, release, and fee
   withdrawal paths.
4. Add bounded board-loading reads and wire the browser app to wallet contract
   calls and contract read-only state.

## Development Direction

Keep extending [`x-board.html`](./x-board.html) until the browser prototype is
intentionally migrated into a structured application. Do not add a parallel
board HTML implementation.

The next development sequence is:

1. keep the Clarity draft compiling and complete its balance-level tests;
2. settle the production programme schema;
3. add Stacks wallet connection with persistent network-aware sessions;
4. replace copy-memo transfers with `claim-tile` and `program-tile` calls;
5. replace memo scanning as render authority with bounded contract reads;
6. deploy to testnet and run multi-wallet takeover tests before mainnet review.

## Documentation

| File | Purpose |
|---|---|
| [`docs/README.md`](./docs/README.md) | Documentation index |
| [`docs/x-board-project-plan.md`](./docs/x-board-project-plan.md) | Product scope and roadmap |
| [`docs/memo-format.md`](./docs/memo-format.md) | Active prototype memo format |
| [`docs/developer-notes.md`](./docs/developer-notes.md) | Standalone runtime architecture |
| [`docs/test-plan.md`](./docs/test-plan.md) | Prototype verification checklist |
| [`docs/clarity-contract-plan.md`](./docs/clarity-contract-plan.md) | Contract migration design |
| [`xboard-clarinet-suite/README.md`](./xboard-clarinet-suite/README.md) | Clarinet suite instructions |
| [`xboard-clarinet-suite/test-suite-plan.md`](./xboard-clarinet-suite/test-suite-plan.md) | Contract test coverage and known follow-up |
