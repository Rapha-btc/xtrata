# X-Board Test Plan

## Browser Checks

Open [`../x-board.html`](../x-board.html) and confirm:

- the canvas is square at desktop and mobile widths;
- all `93` squares render;
- selecting `C01`, `M12`, and `S80` shows wire codes `00`, `0C`, and `1U`;
- the drawer preview is a complete square;
- metadata and controls stay outside the preview square;
- opening and closing drawers does not shift the board horizontally.

Run the information-drawer self-test and confirm:

```text
slots=93
covered=144
codes=93
```

## Composer Checks

Text:

```text
B100T1324GM
```

Inscription:

```text
B10CI0004159
```

Clear:

```text
B11UX0000
```

For each mode, verify the full-square preview and copied programme. For text,
change font, size, position, and colour and confirm both the programme header
and preview change. Verify non-ASCII text is rejected.

Confirm malformed programmes are ignored:

```text
K1S111
B1zzT1324NO
B100X0000BAD
B100I0004abc
```

## Wallet Client Checks

- A mainnet Leather or Xverse wallet can connect and restore its persisted
  address after reload.
- A testnet wallet is rejected.
- Contract state loads in bounded `get-tile-page` batches.
- Short, out-of-order, or malformed contract pages never enable transactions.
- An empty or externally owned tile prepares `claim-tile` with the current
  minimum bid.
- An owned tile prepares `program-tile` and exposes `release-tile`.
- Claims cap wallet spend and bounded registry refund under deny mode.
- Releases cap the registry refund under deny mode.
- A failed contract read shows the legacy transfer fallback and blocks sends.
- Hidden-tab polling is slower than visible-tab polling.
- Inscription MIME probing is cached and interactive HTML remains sandboxed.

## Clarity Suite

Run:

```bash
cd ../xboard-clarinet-suite
npm install
clarinet check --use-computed-deployment-plan
npm test
```

The automated suite covers:

- programme validation and slot mismatch;
- bounded paged reads and final-page optional entries;
- exact claim, outbid, release, and withdrawal STX balances;
- failed incoming-transfer rollback;
- rounded-up minimum outbid;
- structured print events;
- pause semantics with release still allowed;
- standard-wallet-only fee withdrawals;
- direct-wallet-only mutation through proxy rejection.
- canonical clear style enforcement.
- standalone Clarity argument and STX-cap serialization;
- contract-page parsing and malformed snapshot rejection.

Run real provider and RPC tests on testnet before mainnet deployment.
