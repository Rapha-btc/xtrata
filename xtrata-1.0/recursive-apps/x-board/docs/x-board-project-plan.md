# X-Board Project Plan

## 1. Product Summary

X-Board is a standalone programmable public billboard built using Xtrata
Protocol. The active application is:

```text
../x-board.html
```

The canvas is a square divided into `93` independently programmable regions.
A visitor selects one square, previews a text or inscription design in a
full-square frame, and generates a compact `B1` programme targeting that exact
square.

The current prototype reads ordinary Stacks transfers sent to a configured
address. The planned production version replaces transfer-memo authority with
a dedicated Clarity contract.

## 2. Fixed Canvas Layout

Use the existing `12 x 12` logical grid:

| Tier | Bounds | Slot size | Slot count | Public IDs |
|---|---|---:|---:|---|
| Center | columns `4..7`, rows `4..7` | `4 x 4` | `1` | `C01` |
| Middle ring | inner `8 x 8`, excluding center | `2 x 2` | `12` | `M01..M12` |
| Outer ring | full canvas, excluding inner `8 x 8` | `1 x 1` | `80` | `S01..S80` |
| **Total** | | | **93** | |

Every slot record includes:

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

Slot generation order is protocol data:

1. center slot;
2. medium slots in row-major order;
3. small slots in row-major order.

Do not reorder slots after public use begins.

## 3. Current B1 Prototype

The current programme format is:

```text
B1<slot><mode><payload>
```

Examples:

```text
B100TGM
B10CI159
B11UX
```

Current modes:

- `T`: text;
- `I`: referenced Xtrata inscription token ID;
- `X`: clear square.

See `memo-format.md` for the complete validation rules.

## 4. Current Runtime Status

Implemented in `../x-board.html`:

- generated `93`-slot map;
- square CSS Grid canvas;
- compact base62 wire codes;
- strict `B1` compiler and decoder;
- text, inscription, and clear composer modes;
- full-square local preview labelled `PREVIEW - NOT ON-CHAIN`;
- memo byte counter and copy controls;
- bounded confirmed and mempool Hiro reads;
- newest-valid-programme resolution per square;
- pending markers;
- MIME-aware Xtrata inscription rendering;
- enlarged lightbox;
- cached descriptor probes;
- hidden-tab polling reduction;
- built-in protocol self-test.

## 5. Product Principles

1. The square canvas is the product.
2. Every visible square has one immutable public ID, wire code, and numeric
   contract index.
3. A programme affects exactly one square.
4. The interface generates programmes; users should not hand-edit them.
5. The full-square preview is mandatory before transaction submission.
6. Preview state must never be presented as confirmed on-chain state.
7. Opening drawers must not shift canvas width.
8. Inscription resolution should reuse cached descriptors and avoid aggressive
   requests.
9. Contract-backed state reads must be bounded.

## 6. Next Major Milestone: Clarity Contract

The production contract should make each square an on-chain market for visual
space.

Recommended model:

- tile IDs are `uint` indexes `u0..u92`;
- a user claims a square with a qualifying STX bid;
- an entry protocol fee is charged;
- the remaining balance is locked for the current owner;
- a challenger must outbid the current gross bid;
- the displaced owner receives their locked balance;
- only the current owner can update the programme;
- contract read-only functions become the authoritative render source;
- print events provide activity history and refresh cues.

The direct-transfer memo scanner is a prototype transport. A Clarity contract
does not execute custom logic when it receives a plain STX transfer.

See `clarity-contract-plan.md`.

## 7. Development Phases

### Phase 1: Freeze Contract Decisions

- confirm entry fee basis points;
- confirm uniform or tier-specific starting prices;
- confirm minimum outbid rules;
- choose `(string-ascii 64)` or `(string-utf8 64)` programme storage;
- decide whether ownership uses `tx-sender` or `contract-caller`;
- decide whether voluntary release is excluded from v1.

### Phase 2: Implement And Test Clarity

- add a Clarinet contract for `u0..u92`;
- implement claim, outbid, refund, owner update, and read-only functions;
- add paged board reads;
- add structured print events;
- test fee accounting and contract-context outgoing transfers;
- ensure locked balances cannot be withdrawn as protocol fees.

### Phase 3: Add Wallet Integration

- add Stacks wallet connection with persistent mainnet session handling;
- show current owner, gross bid, locked balance, and required bid;
- replace copy-memo instructions with `claim-tile` and `program-tile` calls;
- add STX post-conditions to claims;
- preserve the existing full-square local preview.

### Phase 4: Replace Render Authority

- load current state from bounded contract read-only calls;
- keep transaction or event reads for activity history only;
- show pending wallet calls while awaiting confirmation;
- retain inscription descriptor caching.

### Phase 5: Testnet And Mainnet Readiness

- deploy to testnet;
- run multi-wallet takeover sessions;
- test mobile programming flow;
- test all inscription MIME classes;
- review contract economics and security;
- deploy to mainnet only after Clarinet and testnet gates pass.

## 8. Documentation Map

| File | Purpose |
|---|---|
| `README.md` | Documentation index and current capability summary |
| `memo-format.md` | Current `B1` programme specification |
| `developer-notes.md` | Standalone runtime architecture |
| `test-plan.md` | Prototype and contract verification checklist |
| `clarity-contract-plan.md` | Contract-powered evolution design |
