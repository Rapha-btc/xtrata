# Xboard v1 Clarinet Test Suite Plan

This suite is designed to test the Xboard v1 contract as a small permanent ownership and display-programme registry.

## How to run

```bash
npm install
clarinet check
npm test
```

Run `clarinet check` before `npm test`. If `clarinet check` fails, fix the contract before trusting any test output.

## Contract under test

`contracts/xboard-v1.clar`

The tests assume the agreed v1 behaviour:

- 93 fixed tiles: `u0` to `u92`
- 1 STX minimum first claim
- 1% protocol fee
- 1% minimum outbid increment
- 99% of each claim/outbid is locked as the current owner's refundable balance
- previous owner receives their locked balance back when outbid
- current owner can programme their tile
- current owner can release/unlink their tile
- release refunds locked balance, keeps protocol fees, clears owner, resets bid to minimum
- contract owner can withdraw protocol fees only
- pause blocks write actions but not read-only calls

## Programme format under test

```text
B1 + slot + mode + font + size + position + colour + payload
```

Examples:

```text
B100T1324HELLO
B100I0004159
B100X0000
B11UX0000
```

## Test groups

### 1. Read-only defaults

Covers:

- unused tile has no owner
- unused tile required bid is 1 STX
- unused tile cannot be programmed by anyone
- invalid tile ids are rejected
- initial stats are zeroed

### 2. Programme validation

Covers:

- valid text programme
- valid inscription programme
- valid clear programme
- valid final tile programme for `u92`
- bad protocol prefix
- mismatched slot code
- invalid tile id
- invalid mode
- invalid font, size, position and colour codes
- empty text payload
- clear programme with payload
- inscription payload with empty, non-digit, mixed, or overlong data

### 3. Claiming

Covers:

- first claim at minimum bid
- owner is stored
- `can-program` becomes true for owner
- required next bid becomes 1.01 STX
- protocol fees become 0.01 STX
- total locked becomes 0.99 STX
- below-minimum claims are rejected
- invalid programmes and invalid tile ids are rejected

### 4. Outbidding

Covers:

- equal bid rejected
- bid below 1% increment rejected
- minimum 1% outbid accepted
- new owner replaces old owner
- old owner can no longer programme
- protocol fees and total locked update correctly

### 5. Programming

Covers:

- current owner can update programme
- non-owner cannot update programme
- programme must still match tile slot
- old owner cannot update after being outbid

### 6. Release / unlink

Covers:

- non-owner cannot release
- owner can release
- tile owner becomes none
- required bid resets to 1 STX
- `can-program` returns false after release
- total locked decreases to zero
- protocol fees remain accrued
- released tile can be claimed again at minimum bid

### 7. Fees and pause

Covers:

- non-owner cannot withdraw fees
- owner cannot withdraw more than accrued fees
- owner can withdraw exactly accrued fees
- withdrawing fees does not reduce `total-locked`
- non-owner cannot pause
- owner can pause/unpause
- paused contract rejects claim, programme and release
- read-only calls still work while paused

## Known follow-up needed

The test file includes state-facing accounting checks. Add explicit contract STX balance checks once the exact Clarinet SDK asset-map API for the chosen Clarinet version is confirmed.

Those balance assertions should verify:

```text
contract STX balance >= total-locked + protocol-fees
```

after every successful claim, outbid, release and fee withdrawal.

## Release refund regression

The contract now captures the releasing owner before entering `as-contract`.
Keep an explicit wallet-balance assertion for this path when the asset-map
checks are added.

In Clarity, inside `as-contract`, `tx-sender` becomes the contract principal. If a release refund uses `tx-sender` as both sender and recipient inside `as-contract`, it may send from the contract back to itself rather than to the original caller.

Required implementation pattern:

```clarity
(let ((caller tx-sender))
  (try! (as-contract (stx-transfer? locked tx-sender caller)))
  ...
)
```

The same idea matters anywhere the original caller is needed inside `as-contract`.
