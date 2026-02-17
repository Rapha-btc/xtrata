# Implementation Plan

This plan targets safe rollout with minimal UX friction.

## Summary architecture

- Frontend asks backend for a short-lived signing challenge.
- Wallet signs exact challenge message.
- Backend verifies signature + address + nonce + expiry.
- Backend stores durable acceptance records by scope.
- Frontend gates protected actions based on stored acceptance.

## API design (Pages Functions)

Create endpoints under `functions/legal/`:

1. `POST /legal/challenge`
2. `POST /legal/verify`
3. `GET /legal/status?address=...&network=mainnet`

### `POST /legal/challenge`

Request:

```json
{
  "address": "SP...",
  "network": "mainnet",
  "scope": ["public-mint", "collection-deploy"],
  "appVersion": "1.2.0",
  "domain": "xtrata.pages.dev"
}
```

Response:

```json
{
  "challengeId": "uuid",
  "nonce": "uuid-or-random",
  "expiresAt": "2026-02-17T10:01:00.000Z",
  "message": "Xtrata Legal Consent\n..."
}
```

### `POST /legal/verify`

Request:

```json
{
  "challengeId": "uuid",
  "address": "SP...",
  "signature": "0x...",
  "publicKey": "02..."
}
```

Response:

```json
{
  "ok": true,
  "acceptedScopes": ["public-mint", "collection-deploy"],
  "policyVersion": "legal-consent-v1",
  "tosHash": "0x..."
}
```

### `GET /legal/status`

Response:

```json
{
  "address": "SP...",
  "network": "mainnet",
  "policyVersion": "legal-consent-v1",
  "tosHash": "0x...",
  "acceptedScopes": ["public-mint"]
}
```

## Signature verification rules

- Reject expired challenge (`expires_at < now`).
- Reject reused challenge (`consumed_at` already set).
- Verify signature against exact stored message.
- Recover/validate public key and map to signer address.
- Ensure recovered address matches request address.
- Ensure requested domain is in server allowlist.

Recommended libraries:

- `openSignatureRequestPopup` from `@stacks/connect` (client)
- signature verification helpers from `@stacks/encryption` + address helpers in `@stacks/transactions` (server/shared)

## Frontend integration points

- `src/screens/MintScreen.tsx`: gate before begin mint transaction.
- `src/CollectionMintLivePage.tsx`: gate before mint journey starts.
- `src/manage/components/DeployWizardPanel.tsx`: gate before deploy confirmation/submit.

## Shared frontend utility (recommended)

Create reusable hook and client:

- `src/lib/legal/client.ts`
- `src/lib/legal/use-legal-gate.ts`

Behavior:

1. Check `/legal/status`.
2. If scope accepted, continue immediately.
3. If missing:
   - request challenge
   - open wallet signature popup
   - submit verify
   - continue original action

## UX requirements

- Do not block entire page. Gate only action buttons.
- Keep wording short:
  - "One-time wallet signature required before first mint/deploy."
- Show reason and duration:
  - "This is required once per wallet unless terms change."
- If user cancels signature, keep action idle and show non-error info.
- If verify fails, allow immediate retry with a fresh challenge.

## Config/env

Recommended env vars:

- `LEGAL_POLICY_VERSION=legal-consent-v1`
- `LEGAL_TOS_HASH=0x...`
- `LEGAL_ALLOWED_DOMAINS=xtrata.pages.dev,xtrata.xyz,localhost:5173`
- `LEGAL_CHALLENGE_TTL_SECONDS=300`
- `LEGAL_ENFORCED=true`

## Backwards-compatible rollout switch

- `LEGAL_ENFORCED=false`: log-only mode (collect status/events, do not block tx buttons).
- `LEGAL_ENFORCED=true`: hard enforcement for protected actions.
