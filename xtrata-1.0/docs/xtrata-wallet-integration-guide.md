# Xtrata Wallet Integration Guide

Purpose: describe the canonical wallet layer used by Xtrata-hosted apps so another application can reuse the same connection, session, network, transaction, and legal-gating patterns instead of re-implementing them.

This guide is written for:
- apps built inside the Xtrata codebase
- apps embedded in the Xtrata runtime
- partner apps that need the same wallet behavior as the first-party Xtrata UI

If you only need one rule from this guide, use this one:
use Xtrata's shared wallet adapter and session model, and keep wallet state separate from UI state.

## What Xtrata's wallet layer provides

Xtrata's shared wallet layer covers:
- provider discovery and wallet selection
- connect and disconnect flows
- session normalization and persistence
- mainnet-only enforcement
- contract call and contract deploy prompts
- STX transfer prompts in the runtime bridge
- wallet lookup by connected address, raw address, or BNS name
- network mismatch detection before signing
- transaction result normalization into a consistent tx id payload

It does not manage:
- private keys
- wallet secrets
- custom signer storage
- testnet sessions

## Canonical source files

These are the files to reuse or mirror when building wallet-aware app logic:

| File | Role |
| --- | --- |
| `src/lib/wallet/adapter.ts` | Canonical connect, disconnect, and session access wrapper. |
| `src/lib/wallet/connect.ts` | Provider selection, Leather/Xverse handling, transaction prompts, and result normalization. |
| `src/lib/wallet/session.ts` | Session persistence, normalization, and mainnet-only enforcement. |
| `src/lib/wallet/storage.ts` | Storage abstraction used by the session store. |
| `src/lib/wallet/lookup.ts` | Address and BNS lookup state helper for wallet-view UIs. |
| `src/lib/network/guard.ts` | Network-from-address and mismatch helpers. |
| `src/lib/contract/fungible-assets.ts` | Asset metadata for post-condition construction in commerce and vault flows. |
| `src/lib/market/settlement.ts` | Market settlement and buy post-condition helpers. |
| `src/App.tsx` | Reference implementation for the runtime wallet bridge and page-level guards. |
| `index.html` | Public homepage implementation that uses the same wallet adapter pattern. |

## The wallet model

Xtrata treats wallet state as a small, normalized session object:

```ts
type WalletSession = {
  isConnected: boolean;
  address?: string;
  network?: 'mainnet' | 'testnet';
};
```

Important properties of the model:
- the session is restored from browser storage
- the session is normalized before being accepted
- the session is considered valid only when it is connected, has an address, and resolves to mainnet
- if the session resolves to testnet, Xtrata treats it as disconnected
- if network information is missing, the network is inferred from the address prefix before the mainnet-only rule is applied

The prefix rule is:
- `SP` and `SM` indicate mainnet
- `ST` and `SN` indicate testnet

## Provider support

Xtrata supports the provider families that commonly appear in Stacks wallets, including:
- Leather
- Xverse
- legacy Stacks provider surfaces
- Blockstack-compatible legacy surfaces

The shared adapter does not hardcode a single wallet brand. It discovers the provider in the browser and then chooses the best available request path.

### Provider resolution order

When the app needs a provider, Xtrata first checks the selected provider in `@stacks/connect-ui`. If nothing is selected, it falls back to window-injected providers in this order:
1. `LeatherProvider`
2. `XverseProviders.StacksProvider`
3. `StacksProvider`
4. `BlockstackProvider`

### Leather behavior

When Leather is selected, Xtrata prefers direct provider requests for:
- wallet connect
- contract call
- contract deploy
- disconnect

If a Leather request method is unsupported, Xtrata falls back to the legacy `@stacks/connect` flow.

### Xverse behavior

Xverse is supported through the same provider selection path, but the adapter generally falls back to the legacy `@stacks/connect` auth flow for connection and prompt handling.

The important integration rule is not which brand is selected. The rule is:
use the shared adapter and let Xtrata decide whether a request-style or legacy flow is appropriate.

## Connect and disconnect flow

Use `createStacksWalletAdapter` as the only public entry point for wallet connection in an app that wants Xtrata behavior.

```ts
import { createStacksWalletAdapter } from './lib/wallet/adapter';

const walletAdapter = createStacksWalletAdapter({
  appName: 'My Hosted App',
  appIcon: `${window.location.origin}/favicon.svg`
});

const session = await walletAdapter.connect();
```

Behavior to expect:
- if a connected session already exists, `connect()` returns it
- if the user cancels the provider prompt, the adapter returns a disconnected session
- `disconnect()` clears both the wallet provider session and Xtrata's stored wallet session
- `getSession()` returns the normalized stored session

Recommended UI behavior:
- show a connect button when disconnected
- show a disconnect button when connected
- show the address and network in a stable status area
- keep the wallet session state separate from page layout, filters, and selection state

## Session persistence

Xtrata persists wallet sessions in browser storage so reconnect friction stays low.

Rules:
- persist only the normalized session
- never store provider objects, secret keys, or raw auth artifacts
- use the adapter's session access methods instead of writing your own storage schema
- treat invalid or stale storage as disconnected

The canonical store lives in `src/lib/wallet/session.ts` and uses `localStorage` when available.

## Network rules

Xtrata is mainnet-only for wallet sessions.

What that means in practice:
- a session that resolves to testnet is treated as disconnected
- a session that does not resolve to a mainnet address is treated as disconnected
- if an action targets a specific contract network, the UI must block the action before the wallet prompt if the wallet network does not match

Use `getNetworkMismatch()` to surface the mismatch before signing.

Example:

```ts
import { getNetworkMismatch } from './lib/network/guard';

const mismatch = getNetworkMismatch(contract.network, walletSession.network);
if (mismatch) {
  // Disable the action and show the mismatch to the user.
}
```

Recommended behavior when a mismatch appears:
- do not open the wallet prompt until the mismatch is fixed
- offer a switch-to-compatible-contract option when one exists
- otherwise offer disconnect as the safe fallback

## Transaction flows

Xtrata supports three transaction families through the shared wallet layer:
- contract calls
- contract deploys
- STX transfers in the runtime bridge

### Contract calls

Use `showContractCall()` from `src/lib/wallet/connect.ts` for prompt-driven contract calls.

The adapter normalizes the payload and ensures:
- the contract identifier is valid
- the function name is present
- function arguments are serialized correctly
- post conditions are serialized correctly
- the network is normalized
- the returned tx payload is normalized to a consistent `txId`

Example:

```ts
import { PostConditionMode } from '@stacks/transactions';
import { showContractCall } from './lib/wallet/connect';

showContractCall({
  contractAddress: contract.address,
  contractName: contract.contractName,
  functionName: 'mint',
  functionArgs: [],
  network: contract.network,
  stxAddress: walletSession.address,
  postConditionMode: PostConditionMode.Deny,
  postConditions: [],
  onFinish: (payload) => {
    console.log('submitted', payload.txId);
  },
  onCancel: () => {
    console.log('user cancelled');
  }
});
```

### Contract deploys

Use `showContractDeploy()` for deploy flows that should go through the same wallet abstraction.

Keep deploy UX user-driven:
- the user enters the contract name
- the user pastes or generates the source
- the app logs each deploy step
- the app logs wallet responses and cancellations

### Post conditions and spend safety

For wallet-written transactions, prefer deny-mode post conditions and deterministic spend caps.

Recommended rule:
- use `postConditionMode: Deny` unless a flow has a strong reason not to
- build post conditions from the exact expected spend or asset transfer
- refresh the plan immediately before submission if pricing or contract state can change

Xtrata's SDK docs already model this pattern for mint and market workflows:
- `docs/sdk/quickstart-safe-transactions.md`
- `docs/sdk/quickstart-workflows.md`
- `docs/sdk/troubleshooting.md`

### Success and cancellation handling

Xtrata normalizes wallet responses into a tx result object that always exposes a tx id when the wallet returned one.

Recommended app handling:
- treat `onFinish` as the only success path
- treat `onCancel` as a user action, not an application error
- show the submitted tx id in logs or confirmation UI
- normalize tx ids before storing or displaying them

## Wallet lookup and wallet-view mode

If your app needs to view holdings by connected wallet, raw address, or BNS name, reuse the lookup helper instead of rolling your own name/address state machine.

```ts
import { getWalletLookupState } from './lib/wallet/lookup';

const lookupState = getWalletLookupState(
  lookupInput,
  walletSession.address ?? null,
  {
    resolvedNameAddress,
    bnsStatus,
    bnsError
  }
);
```

What this gives you:
- validation for raw addresses and BNS-style names
- a resolved address to use for viewing
- a single source of truth for whether the current lookup is valid
- a clear way to distinguish the connected wallet from the viewed wallet

Important UI rule:
- connected wallet identity and viewed wallet identity are allowed to differ
- the UI should clearly label which address is being viewed

## Runtime wallet bridge

If the app is running inside the Xtrata host runtime and communicates with the host by message passing, use the runtime wallet bridge instead of talking directly to the provider from inside the embedded app.

Bridge protocol:
- request type: `xtrata:wallet:request`
- response type: `xtrata:wallet:response`

Supported request families:
- connect methods
- read/session methods
- network methods
- disconnect methods
- contract call methods
- STX transfer methods

Method families accepted by the bridge include:
- connect: `stx_requestAccounts`, `requestAccounts`, `stx_connect`, `connect`, `wallet_connect`
- read: `stx_getAddresses`, `getAddresses`, `stx_getAccounts`, `getAccounts`, `wallet_getAccount`
- network: `stx_getNetwork`, `getNetwork`
- disconnect: `stx_disconnect`, `wallet_disconnect`, `disconnect`, `deactivate`
- contract call: `stx_callContract`, `stx_callContractV2`
- STX transfer: `stx_transferStx`, `stx_transferSTX`, `stx_transfer`, `stx_sendTransfer`, `sendTransfer`, `transferStx`, `openSTXTransfer`

Bridge rules:
- the host validates every payload
- the host normalizes the returned wallet session
- the host rejects mismatched networks before opening a contract prompt
- the host may auto-connect before a contract call if the session is not yet connected
- the host returns standard bridge error codes for validation failures and user cancellations

Use the bridge only when the app is embedded and expected to operate through the Xtrata shell. For direct React app integration, use `createStacksWalletAdapter()` instead.

## Legal signature gate

Wallet connection is not the same as wallet consent.

For protected actions, Xtrata uses a separate one-time legal signature flow:
- public mint
- collection deploy

The canonical docs are:
- `docs/LEGAL/README.md`
- `docs/LEGAL/signature-message-spec.md`
- `docs/LEGAL/implementation-plan.md`

Integration rules:
- gate only the action button, not the whole page
- ask once per wallet per policy version
- require a server-generated challenge and exact message signing
- keep cancellation non-destructive
- do not block ordinary wallet connect/disconnect on the legal gate

If your hosted app can mint or deploy, it should plan for this gate before first use.

## Market, commerce, and vault integrations

If the app needs wallet-driven market or entitlement flows, use the contract-specific helpers rather than building transaction payloads from scratch.

Recommended modules:
- `src/lib/market/settlement.ts`
- `src/lib/contract/fungible-assets.ts`
- `src/lib/commerce/*`
- `src/lib/vault/*`

Use them for:
- STX market buy/cancel/list flows
- USDCx commerce flows
- sBTC vault flows
- asset-aware post-condition construction

Rule of thumb:
- if the wallet action depends on an asset, price, or settlement rule, let the shared helper build the wallet payload
- if the wallet action is only a UI navigation or lookup, keep it outside the transaction layer

## Recommended integration pattern

1. Create the shared wallet adapter once for the app shell.
2. Load the stored session on startup.
3. Render connected/disconnected state from the session.
4. Block actions when the wallet network and contract network do not match.
5. Use shared helpers for contract call, deploy, transfer, market, and vault transactions.
6. Gate mint or deploy actions with the legal signature flow if the app is doing protected actions.
7. Keep lookup/view state separate from wallet session state.
8. Normalize every tx response to a tx id before storing it or showing it in logs.

## Minimal integration example

```ts
import { createStacksWalletAdapter } from './lib/wallet/adapter';
import { getNetworkMismatch } from './lib/network/guard';

const walletAdapter = createStacksWalletAdapter({
  appName: 'Hosted Xtrata App',
  appIcon: `${window.location.origin}/favicon.svg`
});

const session = walletAdapter.getSession();
const mismatch = session.network
  ? getNetworkMismatch(selectedContract.network, session.network)
  : null;

if (!session.isConnected) {
  await walletAdapter.connect();
}

if (mismatch) {
  // show mismatch warning and block the action
}
```

## What not to do

- do not hardcode only one wallet brand
- do not assume testnet sessions are valid
- do not call wallet providers directly from feature code when the shared adapter fits
- do not store provider objects in app state
- do not rebuild the wallet session schema
- do not bypass post conditions for spend-sensitive actions
- do not prompt for contract actions before checking network compatibility
- do not mix wallet connect with legal consent

## Reference implementation entry points

If you want the clearest examples of how Xtrata already uses this layer, start with:
- `src/App.tsx`
- `index.html`
- `src/PublicApp.tsx`
- `src/SimplePublicHome.tsx`
- `src/manage/ManageWalletContext.tsx`
- `src/manage/ArtistManagerGate.tsx`

These show the same shared wallet logic applied in different surfaces:
- public homepage
- React app shell
- manage portal
- embedded runtime bridge

## Related docs

- `docs/app-reference.md`
- `docs/assumptions.md`
- `docs/xtrata-quickstart.md`
- `docs/LEGAL/README.md`
- `docs/sdk/quickstart-safe-transactions.md`
- `docs/sdk/quickstart-workflows.md`
- `docs/sdk/troubleshooting.md`
