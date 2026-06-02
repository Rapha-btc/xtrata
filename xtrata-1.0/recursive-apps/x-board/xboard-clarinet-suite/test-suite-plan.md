# Xboard V1 Clarinet Test Suite Plan

## Run

```bash
npm install
clarinet check --use-computed-deployment-plan
npm test
```

## Schema

```text
B1<slot><mode><font><size><position><colour><payload>
```

Examples:

```text
B100T1324HELLO
B100I0004159
B100X0000
B11UX0000
```

## Automated Coverage

The suite contains `15` passing Vitest cases covering:

1. Empty-tile defaults, invalid tile IDs, and contract stats.
2. Bounded `get-tile-page` reads, including optional tail entries and invalid
   limits.
3. Valid text, inscription, clear, and final-tile programmes.
4. Invalid prefixes, slot mismatches, style values, modes, and payloads.
5. Initial claim ownership, required next bid, exact wallet debit, exact
   contract credit, fee accounting, and locked accounting.
6. Invalid claim rejection without balance or state changes.
7. Failed bidder STX transfer rollback.
8. Outbid refund, exact balances, and accounting invariant.
9. Rounded-up microSTX outbid increment.
10. Owner-only programme update and print event.
11. Pause authorization and print event.
12. Claims and programme updates blocked while paused.
13. Owner release allowed while paused with exact refund balance and event.
14. Fee withdrawal limited to accrued value, contract owner, and standard
    wallet recipients.
15. Proxy forwarding rejection for every mutating public entry point.

## Remaining Integration Tests

Wallet integration must add:

- transaction post-condition checks;
- persistent network-session behavior;
- bounded read pagination against deployed testnet RPC;
- multi-wallet takeover sessions;
- pending wallet response and error handling;
- mobile preview verification.
