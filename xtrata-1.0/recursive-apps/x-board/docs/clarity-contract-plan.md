# X-Board Clarity Contract Plan

## Purpose

The current `../x-board.html` prototype derives each square's visible state
from ordinary Stacks transfer memos. The contract-powered X-Board should make
ownership, pricing, and current programmes explicit on-chain.

A normal STX transfer to a contract principal does not execute custom logic.
The contract version must use wallet contract calls.

## Contract Model

Each square is occupied by the wallet that has locked the highest qualifying
bid for that square.

Recommended v1 economics:

1. A challenger submits a gross bid.
2. The contract takes an entry protocol fee, initially `1%`.
3. The remainder is locked for that square.
4. The previous owner receives their previously locked balance.
5. The challenger becomes the owner.
6. The owner can update the square's programme until displaced.

Use entry-fee-only accounting for v1. Do not add an exit fee initially.

## Slot Identity

X-Board has `93` immutable slots. The contract should store numeric IDs:

```text
u0..u92
```

The UI retains public IDs and wire codes:

| UI slot | Contract ID | Wire code |
|---|---:|---|
| `C01` | `u0` | `00` |
| `M12` | `u12` | `0C` |
| `S80` | `u92` | `1U` |

The contract-call `tile-id` argument is authoritative. The UI must verify that
the embedded `B1` wire code matches that numeric argument before submission.

## Suggested Tile State

```clarity
{
  owner: (optional principal),
  gross-bid: uint,
  locked: uint,
  program: (string-utf8 64),
  updated-at: uint,
  claimed-at: uint
}
```

Open decision: use `(string-utf8 64)` to preserve current X-Board UTF-8 text,
or deliberately restrict the first contract version to `(string-ascii 64)`.

## Required Public Functions

```clarity
(define-public (claim-tile
  (tile-id uint)
  (bid uint)
  (program (string-utf8 64))
)
  ...
)
```

Responsibilities:

- validate `tile-id <= u92`;
- validate the programme;
- calculate the required bid;
- transfer the bid into contract custody;
- refund the previous locked balance;
- account for the protocol fee;
- store the new owner and programme;
- print a claim event.

```clarity
(define-public (program-tile
  (tile-id uint)
  (program (string-utf8 64))
)
  ...
)
```

Responsibilities:

- validate the tile;
- require the current owner;
- update the stored programme and block height;
- print a programme event.

## Required Read-Only Functions

```clarity
(define-read-only (get-tile (tile-id uint)) ...)
(define-read-only (get-required-bid (tile-id uint)) ...)
(define-read-only (get-owner (tile-id uint)) ...)
(define-read-only (can-program (tile-id uint) (who principal)) ...)
```

Avoid loading `93` tiles with aggressive polling. Add a bounded paged read:

```clarity
(define-read-only (get-tile-page (start uint) (limit uint)) ...)
```

The final page size must be tested against read-only execution limits.

## Events

Print structured claim and programme events for history, animation, and
indexing. Render authoritative current state from read-only calls.

Claim events should include:

- tile ID;
- new owner;
- gross bid;
- locked balance;
- protocol fee;
- previous owner;
- previous refund.

Programme events should include:

- tile ID;
- owner;
- programme;
- update block height.

## Front-End Migration

Replace the current copy-memo transfer instructions with wallet-aware actions.

For an empty or externally owned square:

```text
Claim square C01 for 1 STX
```

For a square owned by the connected wallet:

```text
Update square C01
```

Claim calls must use STX post-conditions so the wallet clearly enforces the
maximum amount leaving the user account.

The full-square local preview remains mandatory before wallet submission.

## Security Requirements

- Locked balances must never be withdrawable as protocol fees.
- Failed refunds or fee transfers must revert the complete claim.
- Decide deliberately whether ownership uses `tx-sender` or `contract-caller`.
- Keep admin pause powers narrow and never allow locked-balance seizure.
- Test fee rounding in microSTX.
- Test Clarity contract-context outgoing transfers in Clarinet before testnet.

## Implementation Sequence

1. Confirm economics, fee basis points, and tier pricing.
2. Confirm ASCII versus UTF-8 programme storage.
3. Write the Clarinet contract skeleton for `u0..u92`.
4. Add claim, refund, outbid, programme, and read-only tests.
5. Add paged read-only board loading.
6. Add Stacks wallet connection and session persistence.
7. Replace memo-transfer scanning with contract reads.
8. Keep print-event reads for history and refresh cues.
9. Deploy to testnet.
10. Run multi-wallet takeover tests.
11. Review before mainnet deployment.
