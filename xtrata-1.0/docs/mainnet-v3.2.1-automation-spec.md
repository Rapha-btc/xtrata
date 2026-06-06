# Mainnet v3.2.1 Handover Automation Spec

This document specifies the script to implement after the planning phase. It is
not itself a broadcast procedure.

## Proposed Script

Add:

```text
scripts/mainnet-v3.2.1-handover.mjs
```

Add package scripts:

```json
{
  "mainnet:v3.2.1:handover": "node scripts/mainnet-v3.2.1-handover.mjs handover",
  "mainnet:v3.2.1:preflight": "node scripts/mainnet-v3.2.1-handover.mjs preflight",
  "mainnet:v3.2.1:report": "node scripts/mainnet-v3.2.1-handover.mjs report"
}
```

Default mode must be read-only.

## Inputs

Environment:

```sh
XTRATA_MAINNET_API_URL=https://api.hiro.so
XTRATA_MAINNET_HIRO_API_KEY=<optional-api-key>
XTRATA_MAINNET_DEPLOYER_ADDRESS=<expected-admin-address>
XTRATA_MAINNET_OLD_CORE=SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-1
XTRATA_MAINNET_CORE=SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-1
XTRATA_MAINNET_HELPER=SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-small-mint-v1-1
XTRATA_MAINNET_ROYALTY_RECIPIENT=<mainnet-address>
XTRATA_MAINNET_ANNOUNCEMENT_FILE=docs/mainnet-v3.2.1-announcement-inscription.md
XTRATA_MAINNET_FIXED_FEE_USTX=<optional-fixed-fee>
XTRATA_MAINNET_NEXT_ID_OVERRIDE=<optional-uint>
XTRATA_MAINNET_NEXT_ID_OVERRIDE_REASON=<required-if-overriding>
```

Signing inputs should be added only during implementation and must follow the
safest available repo convention. Do not write secrets into reports.

## CLI Modes

`preflight`

- read-only;
- validates contract IDs and admin ownership;
- computes proposed next ID;
- writes a draft report;
- exits non-zero on any unsafe condition.

`handover`

- read-only by default;
- with `--stage`, builds transaction payload descriptions but does not
  broadcast;
- with `--broadcast --confirm-mainnet-handover`, broadcasts the approved
  sequence.

`report`

- reads the latest JSON report and regenerates Markdown.

## Broadcast Confirmation

The script must reject mainnet broadcast unless the command includes:

```sh
--broadcast --confirm-mainnet-handover
```

The script should also print a final summary before broadcasting:

```text
Network: mainnet
Old core: ...
New core: ...
Helper: ...
Admin: ...
Royalty recipient: ...
Computed next ID: ...
Announcement file: ...
Announcement bytes: ...
```

## Transaction Plan

The generated transaction plan should contain these steps:

| Step | Contract | Function | Required |
| --- | --- | --- | --- |
| 1 | old core | `set-paused true` | yes, unless already paused |
| 2 | v3.2.1 core | `set-next-id uN` | yes, if continuity is enabled and next-id is `u0` |
| 3 | v3.2.1 core | `set-royalty-recipient` | yes |
| 4 | helper | `set-core-contract` | yes, unless already correct |
| 5 | v3.2.1 core | `set-paused false` | yes |
| 6 | helper | `set-paused false` | yes |
| 7 | v3.2.1 core | `mint-single-tx` announcement | yes |
| 8 | read-only | reconstruct and verify announcement | yes |

Each write step should be idempotent where the contract allows it. One-shot
steps such as `set-next-id` must be guarded by preflight reads and never retried
blindly after an ambiguous failure.

## Preflight Failure Conditions

Fail before broadcast if:

- the network is not mainnet;
- any target contract principal does not match the approved expected value;
- expected admin does not match old core or v3.2.1 core `get-admin`;
- helper owner-only setup calls are not being sent by the approved operator;
- old core is not reachable;
- v3.2.1 is not reachable;
- helper is not reachable;
- v3.2.1 has already minted and `set-next-id` is still requested;
- computed next ID is missing or lower than the old live line;
- royalty recipient is missing;
- announcement file is missing or empty;
- announcement file cannot fit the chosen mint route;
- testnet readiness report is absent or does not say `ready for mainnet`, unless
  the operator passes an explicit documented override.

## Announcement Mint Route

The announcement file should normally be minted with:

```clarity
(contract-call?
  .xtrata-v3-2-1
  mint-single-tx
  <expected-hash>
  "text/markdown"
  u<total-size>
  <chunks>
  <token-uri>)
```

Expected policy:

- use 16 KiB chunks;
- reject if chunk count exceeds the core single-tx ABI cap;
- use a deterministic token URI, for example:
  `data:text/markdown,xtrata-v3.2.1-mainnet-handover`;
- verify `get-inscription-summary`, chunk reads, reconstructed bytes, and rolling
  hash after confirmation.

## Report Schema

The JSON report should include:

```json
{
  "network": "mainnet",
  "mode": "preflight|stage|broadcast",
  "generatedAt": "ISO-8601",
  "contracts": {
    "oldCore": "",
    "core": "",
    "helper": ""
  },
  "admin": {
    "expected": "",
    "oldCore": "",
    "core": "",
    "helperOperator": ""
  },
  "preflight": {
    "oldCorePaused": false,
    "corePaused": true,
    "helperPaused": true,
    "oldNextTokenId": 0,
    "oldLastTokenId": 0,
    "coreNextTokenId": 0,
    "coreLastTokenId": 0,
    "coreMintedCount": 0,
    "computedNextId": 0
  },
  "transactions": [],
  "announcement": {
    "source": "docs/mainnet-v3.2.1-announcement-inscription.md",
    "mime": "text/markdown",
    "bytes": 0,
    "chunks": 0,
    "hash": "",
    "tokenId": null,
    "reconstructed": false,
    "verified": false
  },
  "warnings": [],
  "failures": [],
  "recommendation": "not ready|ready to broadcast|handover complete|needs review"
}
```

## Verification Commands

Before implementing or broadcasting the mainnet script, run:

```sh
npm run contracts:sync
npm run contracts:verify
npm --prefix contracts/clarinet exec -- clarinet check
npm --prefix contracts/clarinet test -- xtrata-v3.2.1.test.ts
npm run test:clarinet
npm run test:app
npm test
```

If the app/SDK defaults are changed to point at v3.2.1 in the same release, add
targeted tests for contract registry, mint helper policy, reconstruction, and
network guards.

## Implementation Notes

- Reuse the testnet rehearsal script patterns for API key middleware,
  confirmation polling, report writing, and reconstruction.
- Keep mainnet and testnet environment variables separate.
- Never write private keys or mnemonics to reports.
- Do not combine deployment and handover in one irreversible command.
- Treat transaction rejection, API rate limiting, and ambiguous confirmation as
  recoverable states requiring operator review.
