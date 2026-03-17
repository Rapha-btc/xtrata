# DoraHacks Single-Page Demo Plan

## Goal

Ship one public demo page that shows the full Xtrata hackathon story in under 60 seconds:

- Free on-chain inscription preview
- Paid USDCx entitlement purchase
- sBTC vault-gated premium access
- x402-style paid recursive content unlock

This should be a working single-page demo, not a general-purpose admin tool and not a broad product tour.

## Why the Current Draft Needs Tightening

The existing draft is useful as submission copy, but it is too broad for build execution.

It currently assumes:

- new contracts may need to be built
- the demo can be explained abstractly instead of shown directly
- x402 already exists in the stack

The repo already has working Xtrata core, commerce, and vault layers. The shortest path is to build a focused page on top of those existing pieces and treat x402 as a small demo gateway slice.

## Repo Reality Check

Already in place:

- core inscription viewer and preview pipeline
  - `src/lib/viewer/queries.ts`
  - `src/lib/viewer/content.ts`
  - `src/components/TokenContentPreview.tsx`
- public wallet/session patterns
  - `src/main.tsx`
  - `src/PublicApp.tsx`
  - `src/SimplePublicHome.tsx`
- USDCx entitlement contract + client + screen
  - `contracts/live/xtrata-commerce.clar`
  - `src/lib/commerce/client.ts`
  - `src/screens/CommerceScreen.tsx`
- sBTC vault contract + client + screen
  - `contracts/live/xtrata-vault.clar`
  - `src/lib/vault/client.ts`
  - `src/screens/VaultScreen.tsx`
- contract coverage already exists
  - `contracts/clarinet/tests/xtrata-commerce.test.ts`
  - `contracts/clarinet/tests/xtrata-vault.test.ts`

Not in place yet:

- a dedicated hackathon demo route/page
- a curated demo config for known asset/listing/vault ids
- x402 gateway logic

## Core Scope Decision

Do not build new protocol contracts for the hackathon page.

Use the existing deployed stack where possible:

- Xtrata core for asset rendering
- `xtrata-commerce` for paid entitlement
- `xtrata-vault` for premium reserve access

Only build one new thin demo layer:

- a dedicated single-page frontend
- a tiny x402-style function route for the paywall demo

## Demo Page Outcome

### Route

Add a dedicated public route:

- `/workspace/dora-hacks`

This should render a standalone page instead of the full `PublicApp` module stack.

Reason:

- judges need one link
- no scrolling through unrelated sections
- no contract-id setup required
- less risk of confusion during the demo

## Page Structure

The page should be vertically stacked and mobile-safe, with square media frames and no horizontal layout shift.

### 1. Hero

Purpose:

- explain the full story in one glance
- show one wallet connect control
- show current network and live contract bindings

Content:

- title: `Xtrata Commerce Layer`
- subline: `Bitcoin-native on-chain media with programmable access`
- badges:
  - `Xtrata Core`
  - `USDCx Commerce`
  - `sBTC Vault`
  - `x402 Demo`
- wallet connect / connected address

### 2. Free Entry

Purpose:

- prove the base asset works without payment
- establish the before/after contrast for the paid entries

Content:

- square preview of a known inscription
- short metadata line
- button: `Open free asset`
- secondary status: `On-chain, no payment required`

Implementation note:

- load through the same viewer content pipeline used elsewhere
- do not create a separate content fetch path

### 3. USDCx Commerce Entry

Purpose:

- show entitlement commerce without transferring NFT ownership

Content:

- square preview of the paid asset
- price in USDCx
- listing status
- entitlement status for connected wallet
- primary action:
  - if seller wallet: `Manage listing`
  - if buyer wallet: `Buy with USDCx`
  - if not connected: `Connect wallet`

What should happen:

1. page loads listing data via read-only call
2. user clicks purchase
3. wallet opens `buy-with-usdc`
4. page refreshes entitlement state
5. premium preview/action becomes available

### 4. sBTC Vault Entry

Purpose:

- show Bitcoin-backed premium access

Content:

- square preview of the vault-gated asset
- current vault id
- current reserve amount
- current tier
- premium-access check for connected wallet
- primary action:
  - if no vault exists for demo owner path: `Open vault`
  - otherwise: `Deposit sBTC`

What should happen:

1. page loads vault read-only data
2. user opens or tops up the vault
3. wallet opens `open-vault` or `deposit-sbtc`
4. page refreshes tier and premium-access status

Important constraint:

- current `has-premium-access(asset-id, user)` is owner-linked
- this demo should present that honestly as premium creator reserve access, not as a multi-user subscription system

### 5. x402 Entry

Purpose:

- show the off-chain gateway layer that monetizes recursive content

Content:

- teaser card for premium HTML content
- visible payment state
- first fetch returns `402 Payment Required`
- second step unlocks the recursive page

What should happen:

1. page requests demo premium content
2. route returns `402` with a compact payment payload
3. user clicks `Simulate payment`
4. page retries with payment token/cookie/query proof
5. route returns premium HTML
6. page renders unlocked content in an iframe or isolated preview shell

Important framing:

- this is a gateway demo
- not a claim that `xtrata-commerce` already performs x402 settlement on-chain

### 6. Unified Event Rail

Add a compact live log at the bottom or side of the page:

- wallet connected
- listing loaded
- entitlement verified
- vault tier updated
- 402 returned
- premium page unlocked

This gives judges a clear proof trail without opening devtools.

## Implementation Plan

### Phase 1. Demo route and shell

Add:

- `src/DoraHacksDemoPage.tsx`

Update:

- `src/main.tsx`

Behavior:

- if path is `/workspace/dora-hacks`, render the dedicated demo page
- otherwise preserve existing routing exactly

### Phase 2. Curated demo config

Add:

- `src/demo/doraHacksConfig.ts`

This file should hold the fixed demo ids and labels:

- free asset id
- paid asset id
- commerce listing id
- vault asset id
- vault id if already prepared
- x402 premium slug/path
- display copy for each card

This keeps the page deterministic and avoids free-form inputs during the demo.

### Phase 3. Shared asset loading

Use the existing viewer query and cache helpers for all inscription previews:

- `fetchTokenSummary`
- `getTokenContentKey`
- `TokenContentPreview`

Rules:

- one asset, one source of truth
- cache-first behavior
- no duplicated media fetch logic
- preview content should match what the main viewer would show

### Phase 4. Commerce card wiring

Reuse:

- `createCommerceClient`
- `buildBuyWithUsdcCall`

Likely extraction:

- a small presentation component specific to the demo
- not the full `CommerceScreen`, which is too broad for judges

The demo card should only expose:

- listing snapshot
- entitlement snapshot
- one primary action

### Phase 5. Vault card wiring

Reuse:

- `createVaultClient`
- `buildOpenVaultCall`
- `buildDepositSbtcCall`

The demo card should only expose:

- vault snapshot
- tier snapshot
- premium-access snapshot
- one primary action

### Phase 6. x402 function slice

Add a small Cloudflare Pages function route, for example:

- `functions/demo/premium/[slug].ts`

Optional helper:

- `functions/lib/demo-paywall.ts`

Behavior:

- request without proof returns `402 Payment Required`
- response body includes demo payment instructions
- request with demo proof returns HTML

For the hackathon cut, demo proof can be:

- short-lived cookie, or
- signed query token, or
- explicit `x-demo-payment` header from the page

Keep it simple and deterministic. Do not build a real payment processor for the hackathon version.

Runtime note:

- verify this slice in Cloudflare Pages dev or deployed preview, not only `vite` dev
- the frontend page can live in the Vite app, but the `402` response must come from the function route
- detailed endpoint and session design lives in `Dora-Hacks/x402-mvp.md`

### Phase 7. Styling and stability

Update:

- `src/styles/app.css`

Rules:

- each entry uses a square preview frame
- metadata and actions stay outside the square
- no inner scrolling in preview cards
- no horizontal shift when wallet state or logs change
- layout works on desktop and mobile

## Demo Data Preparation

Before wiring the page, curate four known entries:

1. free asset
2. paid commerce asset with active listing
3. vault asset with an existing vault or a scripted owner path to create one
4. premium recursive HTML asset for the x402 route

Required metadata to prepare:

- asset id
- title
- short description
- listing id where applicable
- vault id where applicable
- expected payment amount
- expected wallet/network

If the real on-chain listing or vault state is not ready yet, prepare it first. The page should not depend on judges typing ids into inputs.

Current repo defaults point to mainnet contracts, so the demo should be prepared and rehearsed against mainnet unless the route and registries are intentionally switched.

## What Not to Build

Do not spend hackathon time on:

- new commerce contract versions
- new vault contract versions
- generic contract selectors
- deploy UI
- admin dashboards
- market transfer flows
- a full x402 production settlement backend

## Acceptance Criteria

The page is ready when all of the following are true:

- one URL opens the full demo
- a connected wallet can trigger the USDCx purchase flow
- the page reflects updated entitlement state after purchase
- a connected wallet can trigger the sBTC vault flow
- the page reflects updated vault tier or premium access after the vault transaction
- the x402 section visibly returns `402` before unlock
- the x402 section visibly unlocks premium HTML after the demo payment step
- all asset previews use the same Xtrata content pipeline as the rest of the app
- the page remains visually stable on mobile and desktop

## Test and Verification Plan

Frontend:

- add targeted tests only for any new demo-specific helpers
- avoid broad snapshot tests for the whole page

Functions:

- add a small test for the paywall helper if logic is extracted to `functions/lib/demo-paywall.ts`

Protocol:

- rely on the existing commerce and vault contract tests already in the repo unless contract behavior changes

Manual demo checks:

1. load page as guest
2. confirm free asset renders
3. confirm commerce status loads
4. connect wallet
5. run USDCx purchase
6. confirm entitlement flips
7. run vault action
8. confirm tier or premium status updates
9. trigger x402 fetch
10. confirm `402` state
11. simulate payment
12. confirm premium HTML renders

## Demo Script for Judges

Use this order:

1. Start on the hero and explain that all bounty entries are shown on one page.
2. Open the free asset to establish the baseline on-chain media experience.
3. Show the USDCx card and complete the entitlement purchase.
4. Show that the NFT was not transferred, only access changed.
5. Show the sBTC vault card and explain premium creator reserve access.
6. Trigger the x402 section and let the `402` response appear.
7. Simulate payment and unlock the premium recursive page.

## Submission Positioning

Once the page exists, the DoraHacks writeup should describe the project as:

- Xtrata core stores permanent media on-chain
- USDCx commerce sells access rights
- sBTC vaults add Bitcoin-backed premium gating
- x402 demonstrates paid recursive delivery

That story is already strong. The work now is making it obvious in one link and one scroll.
