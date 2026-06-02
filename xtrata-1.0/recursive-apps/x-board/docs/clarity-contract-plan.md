# X-Board Clarity Contract Plan

## Purpose

The standalone [`../x-board.html`](../x-board.html) client loads contract state
and packages wallet calls so ownership, pricing, locked balances, and current
programmes are explicit on-chain state. Legacy transfer memos remain a
read-only fallback while a configured registry is unavailable.

## Locked V1 Decisions

| Decision | V1 choice |
|---|---|
| Tiles | `u0..u92` |
| Programme type | `(string-ascii 96)` |
| Programme schema | `B1<slot><mode><font><size><position><colour><payload>` |
| Initial claim | `1 STX` |
| Protocol fee | `1%` of each successful claim or outbid |
| Outbid increment | At least `1%` of current gross bid, rounded up |
| Ownership identity | Direct wallet caller only: `tx-sender == contract-caller` |
| Release | Owner can release and recover locked value, including while paused |
| Pause | Blocks claims and programme edits, never owner withdrawal of locked value |
| Admin withdrawals | Accrued protocol fees only, to standard wallet principals |
| Board reads | `get-tile-page` with `1..10` entries |

## Slot Identity

The `tile-id uint` contract argument is authoritative. The embedded wire code
must match it:

| UI slot | Contract ID | Wire code |
|---|---:|---|
| `C01` | `u0` | `00` |
| `M12` | `u12` | `0C` |
| `S80` | `u92` | `1U` |

## Public API

State changes:

```clarity
(claim-tile (tile-id uint) (bid uint) (program (string-ascii 96)))
(program-tile (tile-id uint) (program (string-ascii 96)))
(release-tile (tile-id uint))
(withdraw-fees (amount uint) (recipient principal))
(set-paused (value bool))
```

Reads:

```clarity
(get-tile (tile-id uint))
(get-owner (tile-id uint))
(get-required-bid (tile-id uint))
(can-program (tile-id uint) (who principal))
(is-valid-program (tile-id uint) (program (string-ascii 96)))
(get-contract-stats)
(get-tile-page (start uint) (limit uint))
```

The paged reader deliberately returns optional entries after `u92` on the final
page so clients can request a stable batch size without unbounded reads.

## Security Properties

- Protocol-fee accounting is separate from locked owner balances.
- Every public mutation requires a direct wallet call.
- Failed incoming or outgoing transfers revert the enclosing transaction.
- Admin fee withdrawals cannot target contract principals.
- Pause cannot prevent an owner from releasing locked funds.
- Claim, programme, release, withdrawal, and pause changes print structured
  events.
- Clear programmes use canonical `X0000` style fields.

The runnable suite verifies these properties, including a test-only forwarding
contract that proves nested calls are rejected.

## Frontend Client

The browser compiler emits the contract schema and:

1. persists a mainnet-only wallet session inferred from the wallet address;
2. fetches board state through bounded `get-tile-page` reads;
3. packages `claim-tile`, `program-tile`, and `release-tile` wallet calls;
4. uses deny-mode STX caps for claims, takeover refunds, and releases;
5. logs wallet responses clearly;
6. retains the full-square preview before submission;
7. treats legacy transfers as a blocked, read-only fallback.

## Release Gate

Before mainnet:

1. deploy to testnet;
2. run multi-wallet claim, outbid, release, and pause sessions;
3. test pagination and mobile rendering under real RPC latency;
4. review contract source and economic assumptions independently;
5. pin the deployed contract identifier in the browser configuration.
