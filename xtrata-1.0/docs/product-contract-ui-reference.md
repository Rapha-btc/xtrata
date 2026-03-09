# Product and UI Contract Role Reference

Purpose:
- define the exact product role for each first-party Xtrata contract
- define which UI surface should own each flow
- prevent overlap between minting, trading, entitlement commerce, premium access, and collection sale modules

This guide complements:
- `docs/contract-inventory.md` for function-level contract details
- `docs/app-reference.md` for code ownership and file locations

## Scope and assumptions

This document reflects the repo state on March 8, 2026.

- Current first-party core production assumption: `xtrata-v2.1.0`
- Core inscription flow remains STX-native for mint, upload, and seal
- Secondary trading may settle in STX, USDCx, or sBTC through dedicated market contracts
- Entitlement commerce is separate from NFT ownership transfer
- sBTC vault logic is separate from both trading and entitlement sales

## Core product model

- `xtrata-v2.1.0` is the canonical inscription and ownership ledger.
- Market contracts are the only correct place for secondary trading and escrowed ownership transfer.
- `xtrata-commerce` is for access or entitlement sales, not inscription transfer.
- `xtrata-vault` is for reserve and premium state, not buying or selling inscriptions.
- `xtrata-preinscribed-collection-sale-v1.0` is for pre-loaded primary inventory sales, not open secondary market trading.

## Fast decision table

| User goal | Contract | Settlement asset | Ownership result | First-party UI owner |
| --- | --- | --- | --- | --- |
| Mint a new inscription | `xtrata-v2.1.0` | STX fees | New inscription minted in core | `MintScreen`, `CollectionMintScreen` |
| Mint a small inscription in one call | `xtrata-small-mint-v1.0` | STX fees | New inscription minted in core | helper pattern, not a dedicated first-party screen |
| Trade an inscription for STX | `xtrata-market-stx-v1.0` | STX | Escrow sale and ownership transfer | `MarketScreen`, `PublicMarketScreen`, contextual tools in `ViewerScreen` and `MyWalletScreen` |
| Trade an inscription for USDCx | `xtrata-market-usdc-v1.0` | USDCx | Escrow sale and ownership transfer | `MarketScreen`, `PublicMarketScreen`, contextual tools in `ViewerScreen` and `MyWalletScreen` |
| Trade an inscription for sBTC | `xtrata-market-sbtc-v1.0` | sBTC | Escrow sale and ownership transfer | `MarketScreen`, `PublicMarketScreen`, contextual tools in `ViewerScreen` and `MyWalletScreen` |
| Buy access, entitlement, or non-transfer rights | `xtrata-commerce` | USDCx | No NFT transfer, entitlement recorded only | `CommerceScreen`, `PublicCommerceScreen` |
| Open reserve-backed premium state | `xtrata-vault` | sBTC deposit | No sale, no NFT transfer, vault state updated | `VaultScreen` |
| Sell pre-inscribed collection inventory | `xtrata-preinscribed-collection-sale-v1.0` | STX in current template | Escrowed inventory token transferred to buyer | `PreinscribedCollectionAdminScreen`, `PreinscribedCollectionSaleScreen` |

## Contract-by-contract role map

### `xtrata-v2.1.0`

Product role:
- canonical inscription protocol and ownership source of truth

Owns:
- upload sessions
- chunk writes
- sealing
- recursion dependencies
- token ownership
- token transfer

UI owner:
- `src/screens/MintScreen.tsx`
- `src/screens/CollectionMintScreen.tsx`
- `src/screens/ViewerScreen.tsx`
- `src/screens/MyWalletScreen.tsx`

Use it for:
- minting
- ownership lookup
- metadata and content reads
- direct wallet transfers

Do not use it for:
- payment settlement in USDCx or sBTC
- entitlement commerce
- premium vault accounting
- secondary sale escrow logic

Oversight note:
- all other commerce, vault, and market layers should treat this contract as the canonical owner ledger

### `xtrata-v2.1.1`

Product role:
- fee-controls upgrade candidate on top of `xtrata-v2.1.0`

Owns:
- the same core inscription responsibilities as `v2.1.0`
- split fee knobs for begin, upload, and seal operations

UI owner:
- none by default in the current first-party production posture

Use it for:
- future core upgrade planning
- fee-model evolution

Do not use it for:
- current default first-party trading or mint assumptions unless the app and registries are explicitly moved

Oversight note:
- this contract exists as an upgrade path, not the current default first-party production reference

### `xtrata-small-mint-v1.0`

Product role:
- convenience helper for small-file one-transaction mint flows

Owns:
- helper-side orchestration only
- one-call wrapper over `begin-or-get -> add-chunk-batch -> seal`

UI owner:
- no dedicated first-party product surface at present

Use it for:
- SDK or advanced helper flows
- low-friction mint integrations for small files

Do not use it for:
- large-file minting
- ownership transfer
- any marketplace role

Oversight note:
- this is a helper contract, not a separate product category

### `xtrata-market-stx-v1.0`

Product role:
- default STX escrow market for the `xtrata-v2.1.0` core line

Owns:
- listing escrow
- STX settlement
- seller cancel path
- NFT ownership transfer from escrow to buyer

UI owner:
- `src/screens/MarketScreen.tsx`
- `src/screens/PublicMarketScreen.tsx`
- contextual trade tools in `src/screens/ViewerScreen.tsx`
- contextual trade tools in `src/screens/MyWalletScreen.tsx`

Use it for:
- STX-settled secondary trading on the current `v2.1.0` core line

Do not use it for:
- entitlement sales
- reserve deposits
- USDCx settlement
- sBTC settlement

Oversight note:
- this is the correct first-party STX market to pair with `xtrata-v2.1.0`
- it should be the default STX market selection once deployed on mainnet

### `xtrata-market-v1.1`

Product role:
- legacy STX escrow market

Owns:
- listing escrow
- STX settlement
- seller cancel path
- NFT ownership transfer from escrow to buyer

UI owner:
- `src/screens/MarketScreen.tsx`
- `src/screens/PublicMarketScreen.tsx`
- contextual trade tools in `src/screens/ViewerScreen.tsx`
- contextual trade tools in `src/screens/MyWalletScreen.tsx`

Use it for:
- STX-settled secondary trading against the contract version it is pinned to

Do not use it for:
- entitlement sales
- reserve deposits
- USDCx settlement
- sBTC settlement

Critical oversight note:
- the live source in `contracts/live/xtrata-market-v1.1.clar` is pinned to `xtrata-v1.1.1`, not `xtrata-v2.1.0`
- keep this available only for legacy listings and migration continuity

### `xtrata-market-v1.0`

Product role:
- earlier legacy STX escrow market variant

UI owner:
- available through the market registry as a legacy option

Use it for:
- older STX market compatibility only

Do not use it for:
- new feature expansion when `v1.1` already covers the same role more cleanly

Oversight note:
- if the first-party product only needs one legacy STX market, this should remain a compatibility option rather than the main default

### `xtrata-market-usdc-v1.0`

Product role:
- dedicated USDCx escrow market for inscriptions

Owns:
- listing escrow
- USDCx settlement
- seller cancel path
- NFT ownership transfer from escrow to buyer

UI owner:
- `src/screens/MarketScreen.tsx`
- `src/screens/PublicMarketScreen.tsx`
- contextual trade tools in `src/screens/ViewerScreen.tsx`
- contextual trade tools in `src/screens/MyWalletScreen.tsx`

Use it for:
- actual inscription trading in USDCx

Do not use it for:
- non-transfer entitlement sales
- premium vault deposits

Oversight note:
- this is the correct contract for full USDCx trading
- it replaces any need to abuse `xtrata-commerce` for ownership transfer

### `xtrata-market-sbtc-v1.0`

Product role:
- dedicated sBTC escrow market for inscriptions

Owns:
- listing escrow
- sBTC settlement
- seller cancel path
- NFT ownership transfer from escrow to buyer

UI owner:
- `src/screens/MarketScreen.tsx`
- `src/screens/PublicMarketScreen.tsx`
- contextual trade tools in `src/screens/ViewerScreen.tsx`
- contextual trade tools in `src/screens/MyWalletScreen.tsx`

Use it for:
- actual inscription trading in sBTC

Do not use it for:
- premium reserve deposits
- entitlement sales

Oversight note:
- this is the correct contract for full sBTC trading
- it should not be conflated with `xtrata-vault`, which also uses sBTC but serves a different product role

### `xtrata-commerce`

Product role:
- dedicated entitlement and access commerce layer

Owns:
- fixed-price USDCx listings for access
- purchase records
- entitlement checks keyed by buyer and asset

UI owner:
- `src/screens/CommerceScreen.tsx`
- `src/screens/PublicCommerceScreen.tsx`

Use it for:
- access passes
- premium unlocks
- license or entitlement purchases
- other cases where a user should pay for rights without receiving ownership of the inscription

Do not use it for:
- escrowed inscription trading
- NFT ownership transfer
- vault reserve logic

Oversight note:
- if the product focus is only secondary trading in STX, USDCx, and sBTC, this contract becomes optional
- keep it only if the product still wants a distinct entitlement commerce layer

### `xtrata-vault`

Product role:
- sBTC reserve and premium access layer

Owns:
- per-asset vault records
- sBTC deposits
- deterministic premium tier calculation
- reserve marker state

UI owner:
- `src/screens/VaultScreen.tsx`

Use it for:
- reserve mechanics
- premium tier derivation
- premium access state tied to asset ownership and sBTC backing

Do not use it for:
- trading
- entitlement purchases
- minting

Oversight note:
- `xtrata-vault` is a balance-and-state module, not a payment market
- it uses sBTC, but its role is operational and premium-oriented rather than transactional trading

### `xtrata-preinscribed-collection-sale-v1.0`

Product role:
- collection launch sale contract for pre-inscribed inventory

Owns:
- admin deposit of already-inscribed tokens
- fixed-price sale windows
- allowlist and per-wallet caps
- payout splits
- direct primary sale of escrowed inventory

UI owner:
- `src/screens/PreinscribedCollectionAdminScreen.tsx`
- `src/screens/PreinscribedCollectionSaleScreen.tsx`

Use it for:
- curated collection drops
- controlled primary sales
- inventory management for already-inscribed items

Do not use it for:
- open secondary market trading
- entitlement sales
- premium vault logic

Oversight note:
- this is a collection-sale module, not a general marketplace module

## First-party UI ownership map

### Trading UI

Primary screens:
- `src/screens/MarketScreen.tsx`
- `src/screens/PublicMarketScreen.tsx`

Contextual entry points:
- `src/screens/ViewerScreen.tsx`
- `src/screens/MyWalletScreen.tsx`

Rules:
- `MarketScreen` owns the main trading workflow
- `ViewerScreen` and `MyWalletScreen` may expose contextual list, cancel, and buy actions, but they should reuse shared market helpers rather than create separate protocol logic
- settlement labels, price formatting, and buy safety rules should stay centralized in `src/lib/market/settlement.ts`

### Entitlement commerce UI

Primary screens:
- `src/screens/CommerceScreen.tsx`
- `src/screens/PublicCommerceScreen.tsx`

Rules:
- commerce flows should stay isolated from NFT trading flows
- buying in commerce should never imply NFT ownership transfer

### Premium and reserve UI

Primary screen:
- `src/screens/VaultScreen.tsx`

Rules:
- reserve and premium operations should stay isolated from trading and entitlement screens
- any future premium UI in viewer or wallet should consume vault read-only state, not re-implement vault logic

### Mint and core protocol UI

Primary screens:
- `src/screens/MintScreen.tsx`
- `src/screens/CollectionMintScreen.tsx`

Supporting read surfaces:
- `src/screens/ViewerScreen.tsx`
- `src/screens/MyWalletScreen.tsx`

Rules:
- mint and publish remain core-protocol flows
- adding payment-currency support for trading should not alter the STX-native mint pipeline

### Collection sale UI

Primary screens:
- `src/screens/PreinscribedCollectionAdminScreen.tsx`
- `src/screens/PreinscribedCollectionSaleScreen.tsx`

Rules:
- collection sale logic should remain distinct from general market logic
- inventory-sale rules such as allowlists and sale windows should not leak into secondary market contracts unless intentionally designed there

## Overlap guardrails

- Secondary trading always belongs to a market contract.
- Entitlement sales always belong to `xtrata-commerce` or a future entitlement-specific commerce contract.
- sBTC reserve state always belongs to `xtrata-vault` or a future vault-specific module.
- Minting never moves into market, commerce, or vault contracts.
- `ViewerScreen` and `MyWalletScreen` can surface actions, but they should not become separate product silos with their own contract rules.

## Recommended product posture

If the product goal is simple user-facing trading:
- position Market as the single trading category
- expose settlement variants inside Market as `STX`, `USDCx`, and `sBTC`
- keep Commerce separate or hide it until entitlement-style products are live
- keep Vault separate as an advanced premium or reserve module

If the product goal includes creator launches:
- use the pre-inscribed sale module for controlled primary sales
- use the market modules for secondary trading after launch

## Deployment rollout note

Current state in the repo:
- `xtrata-market-stx-v1.0`
- `xtrata-market-usdc-v1.0`
- `xtrata-market-sbtc-v1.0`

All three are now aligned around `xtrata-v2.1.0` as the intended first-party trading stack.

Operational requirement:
- deploy `xtrata-market-stx-v1.0` on mainnet before shipping a frontend build that points the default STX market registry entry at that contract name

Migration note:
- keep `xtrata-market-v1.1` and `xtrata-market-v1.0` available as legacy entries until any old STX listings have been cancelled or completed

## Mainnet dependency reference used by the new currency-specific modules

- Core target: `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0`
- USDCx target: `SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx`
- sBTC target: `SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token`

## Short answers for common oversight questions

Do we need `xtrata-commerce` for trading?
- No. Use the market contracts for real inscription trading.

Should `xtrata-commerce` remain in the product?
- Only if you want access, licensing, entitlement, or other non-transfer commerce flows.

Can full trading in USDCx and sBTC happen without changing the core Xtrata contract?
- Yes. That is exactly what the dedicated market contracts are for.

Should Vault appear as part of Market?
- No. It shares sBTC as an asset, but it is a different product category with different user intent.
