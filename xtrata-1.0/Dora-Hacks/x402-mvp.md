# x402 MVP Design

## Recommendation

For this repo, implement x402 as a gateway layer on top of the existing contracts.

Do not merge x402 logic into `xtrata-commerce`.

Reason:

- `xtrata-commerce` already has a clear role: fixed-price USDCx entitlement sales for asset access
- `xtrata-vault` already has a clear role: sBTC reserve and premium tier state
- x402 is an HTTP delivery pattern, not just a payment ledger
- the gateway needs to challenge requests, verify access, issue short-lived sessions, and serve premium content

That is a server responsibility, not a good fit for the current commerce contract.

## Product Boundary

Keep the boundaries like this:

- `xtrata-commerce`
  - on-chain payment and entitlement records
- `xtrata-vault`
  - on-chain reserve and premium-access state
- x402 gateway
  - protected HTTP routes
  - `402 Payment Required` responses
  - session issuance after on-chain verification
  - premium content delivery

## MVP Goal

Support one protected premium route that only unlocks after the wallet has already earned access through:

- `xtrata-commerce` entitlement, or
- `xtrata-vault` premium-access state

For the hackathon cut, the gateway does not need to process payment itself. It only needs to:

1. deny access with a `402`
2. tell the client how to unlock
3. verify on-chain access after the wallet transaction
4. issue a short-lived access token
5. serve the premium page

## Suggested Files

Add:

- `functions/demo/premium/[slug].ts`
- `functions/demo/x402/session.ts`
- `functions/demo/x402/status.ts`
- `functions/lib/x402-config.ts`
- `functions/lib/x402-auth.ts`
- `functions/lib/x402-access.ts`

Optional if HTML is templated:

- `functions/lib/x402-html.ts`

Frontend wiring:

- `src/demo/doraHacksConfig.ts`
- `src/DoraHacksDemoPage.tsx`

## Access Model

Each premium route should be backed by a config entry.

Example shape:

```ts
type AccessMode = 'commerce' | 'vault' | 'either';

type PremiumRouteConfig = {
  slug: string;
  title: string;
  contractId: string;
  assetId: bigint;
  delivery: 'html' | 'json';
  accessMode: AccessMode;
  commerce?: {
    contractId: string;
    listingId: bigint;
    price: bigint;
    symbol: 'USDCx';
    decimals: 6;
  };
  vault?: {
    contractId: string;
    assetId: bigint;
    minimumTier: bigint;
  };
};
```

For the hackathon demo, one slug is enough:

```ts
{
  slug: 'premium-recursive-demo',
  title: 'Premium Recursive Demo',
  contractId: 'SP...xtrata-v2-1-0',
  assetId: 123n,
  delivery: 'html',
  accessMode: 'commerce',
  commerce: {
    contractId: 'SP...xtrata-commerce',
    listingId: 7n,
    price: 2_000_000n,
    symbol: 'USDCx',
    decimals: 6
  }
}
```

## HTTP API

### 1. Protected content route

Route:

- `GET /demo/premium/:slug`

Behavior:

- if request has a valid access token for the slug, return premium content
- otherwise return `402 Payment Required`

Response when locked:

```json
{
  "error": "payment_required",
  "slug": "premium-recursive-demo",
  "title": "Premium Recursive Demo",
  "accessMode": "commerce",
  "commerce": {
    "contractId": "SP...xtrata-commerce",
    "listingId": "7",
    "assetId": "123",
    "price": {
      "amount": "2000000",
      "symbol": "USDCx",
      "decimals": 6
    }
  },
  "sessionUrl": "/demo/x402/session",
  "statusUrl": "/demo/x402/status?slug=premium-recursive-demo&address=SP...",
  "message": "Buy access and then request a session token."
}
```

Headers:

- `Content-Type: application/json`
- `Cache-Control: no-store`

Response when unlocked:

- `200 OK`
- premium HTML or JSON payload

### 2. Access-status route

Route:

- `GET /demo/x402/status?slug=...&address=...`

Purpose:

- lets the frontend poll access state after a wallet action
- avoids issuing a session until on-chain state is confirmed

Response:

```json
{
  "slug": "premium-recursive-demo",
  "address": "SP...",
  "unlocked": true,
  "mode": "commerce",
  "verifiedAt": 1760000000000
}
```

Or while pending:

```json
{
  "slug": "premium-recursive-demo",
  "address": "SP...",
  "unlocked": false,
  "mode": "commerce"
}
```

### 3. Session-issuance route

Route:

- `POST /demo/x402/session`

Purpose:

- verify current on-chain access
- issue a short-lived token
- set an access cookie

Request body:

```json
{
  "slug": "premium-recursive-demo",
  "address": "SP...",
  "txId": "0xabc123"
}
```

`txId` should be optional for the MVP.

Use cases:

- if the client already knows access is confirmed, it can omit `txId`
- if a transaction just happened, the server can inspect `txId` for better error messages

Success response:

```json
{
  "ok": true,
  "slug": "premium-recursive-demo",
  "expiresAt": 1760000300000,
  "unlockUrl": "/demo/premium/premium-recursive-demo"
}
```

Headers:

- `Set-Cookie: xtrata_demo_access=...; HttpOnly; Secure; SameSite=Lax; Path=/demo/premium/; Max-Age=300`
- `Cache-Control: no-store`

Failure response if access is still missing:

- `402 Payment Required`

Failure response if `txId` is still pending:

- `409 Conflict`

## Token Format

Use a signed short-lived token, not a database-backed session, for the MVP.

Suggested cookie payload:

```ts
type AccessTokenPayload = {
  sub: string;
  slug: string;
  assetId: string;
  mode: 'commerce' | 'vault';
  iat: number;
  exp: number;
};
```

Signing approach:

- HMAC SHA-256 with `crypto.subtle`
- secret stored in env, for example `X402_ACCESS_SECRET`

Why this is enough for the MVP:

- simple
- no D1 dependency
- no cleanup job
- easy to revoke globally by rotating the secret

## On-Chain Verification Rules

### Commerce-backed unlock

Verify:

- `has-entitlement(asset-id, address) == true`

Use the configured asset and contract from the slug.

Do not trust any client-provided `assetId` or `listingId`.

### Vault-backed unlock

Verify:

- `has-premium-access(asset-id, address) == true`

Important:

- current vault logic is owner-linked
- this is not a general subscriber entitlement model
- in the UI and payloads, call it premium reserve access, not generic paid subscription

### Optional transaction-status lookup

If `txId` is supplied:

- query Hiro API or the existing RPC proxy route
- if pending, return `409`
- if failed, return `400` or `409`
- if success, continue with read-only contract verification

Do not issue a session from wallet intent alone. Issue it only from verified on-chain state.

## Server-Side Implementation Notes

### Read-only helpers

Do not build the Functions layer around React or query-client abstractions.

Preferred approach:

- model server-side read-only calls after `functions/runtime/content.ts`
- add a small helper that can call:
  - `has-entitlement`
  - `has-premium-access`

Reason:

- it keeps worker logic self-contained
- it avoids dragging UI concerns into the Functions runtime

### Content delivery

For the hackathon version, the premium route should return one of:

- an HTML wrapper page, or
- a premium JSON/API payload

If you want to show recursive Xtrata content, the premium route can:

- server-render a wrapper page that references a known inscription id, or
- proxy a resolved payload assembled by shared runtime helpers

Important honesty note:

- if the underlying inscription bytes are already public on-chain, x402 is gating the served experience or route, not making public chain data secret

That is acceptable for the demo as long as it is presented accurately.

## Frontend Flow

The single-page demo should use this sequence.

### Commerce unlock path

1. User clicks `Load premium page`.
2. Frontend requests `GET /demo/premium/premium-recursive-demo`.
3. Server returns `402` with commerce unlock instructions.
4. Frontend shows `Buy with USDCx`.
5. User signs `buy-with-usdc(listingId)`.
6. Frontend polls `GET /demo/x402/status?...`.
7. Once `unlocked: true`, frontend calls `POST /demo/x402/session`.
8. Server sets cookie.
9. Frontend retries `GET /demo/premium/premium-recursive-demo`.
10. Premium page loads.

### Vault unlock path

1. User clicks `Load premium page`.
2. Frontend receives `402` with vault unlock instructions.
3. Frontend shows `Deposit sBTC` or `Open vault`.
4. User signs vault transaction.
5. Frontend polls `status`.
6. Frontend calls `session`.
7. Server sets cookie.
8. Frontend retries the premium route.

## Error Cases

Handle these explicitly.

### Wallet not connected

Return `402` from the server anyway.

The frontend should translate that into:

- `Connect wallet to unlock`

The gateway should not depend on browser wallet state.

### Wrong address

If the wallet used to buy is different from the wallet requesting the session:

- `status` returns `unlocked: false`
- `session` returns `402`

### Transaction pending

If a transaction was just submitted:

- `status` remains locked until contract state reflects the change
- `session` can return `409` if `txId` is still pending

### Token expired

If the access cookie expires:

- protected route returns `402`
- frontend can call `session` again if on-chain access still exists

That is a good property. The cookie is only a cache of verified access.

## Minimal Security Rules

For the MVP, enforce at least these:

- sign session tokens with a server secret
- short TTL, for example 5 minutes
- never trust client-provided resource ids
- verify access against server-side config by slug
- `Cache-Control: no-store` on protected responses
- `HttpOnly` cookies for browser unlocks
- `Secure` and `SameSite=Lax` cookies in deployed environments

## Why Not Extend `xtrata-commerce`

Putting x402 into `xtrata-commerce` would create a confused contract boundary.

You would end up mixing:

- entitlement sale state
- HTTP resource identity
- access-session semantics
- potentially expiring or per-request delivery rules

That is not what the current commerce contract is shaped for.

The existing contract answers:

- who paid for access to asset `N`?

x402 needs to answer:

- should this HTTP request for resource `R` be served right now?

Those are related, but not the same problem.

## When a Dedicated x402 Contract Becomes Worth It

Add a separate contract later if you need one of these:

- per-request or metered charging
- expiry windows on access rights
- resource ids that are not the same as asset ids
- multiple pricing policies per route
- third-party gateways that need a canonical on-chain receipt format

If that happens, do not overload `xtrata-commerce`.

Create a separate contract, for example:

- `xtrata-access`
- `xtrata-x402`

Then the gateway would verify that contract instead.

## Recommended MVP Sequence

Build in this order:

1. Add `x402-config.ts` with one premium slug.
2. Add `status` route with commerce verification only.
3. Add `session` route with HMAC cookie issuance.
4. Add protected premium route returning a simple HTML page.
5. Wire the single-page demo to the three endpoints.
6. Extend the route to support vault-based unlocks.
7. Only after that consider richer proxying of recursive content.

That keeps the first working version small and honest.
