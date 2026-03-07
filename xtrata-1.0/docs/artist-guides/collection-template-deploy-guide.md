# Locked Deploy Guide (Artist Flow)

This is the simplest way to launch a collection contract in Xtrata.

You do not edit Clarity code.
You do not copy/paste contract source.
You fill in a short form, review, and deploy.

## Inputs You Control

1. Collection name
2. Symbol (auto-filled from name, editable)
3. Description
4. Supply
5. Mint type (`standard` or `pre-inscribed`)
6. Mint price (STX)
7. Artist payout address
8. Marketplace payout address

## Locked Defaults

These are fixed in the deploy template UI:

1. Contract template is internal and non-editable.
2. Default split is:
   - Artist: `9500` bps
   - Marketplace: `250` bps
   - Operator: `250` bps
3. That means a 5% platform share (2.5% marketplace + 2.5% operator).
4. Operator recipient address is locked to the Xtrata operator default.
5. Artist and marketplace recipients are set in the deploy form and baked into contract source at deploy time.
6. URI/advanced template wiring is hidden from this flow.

## Step-by-Step

1. Open the artist portal (`/manage`).
2. Go to `Deploy wizard`.
3. Fill in the guided fields.
4. Click `Review and deploy`.
5. Confirm the summary modal.
6. Approve the wallet deployment request.
7. Save the tx id and verify on explorer.

## Mint Type Notes

1. `Standard mint` deploys the collection mint template (`xtrata-collection-mint-v1.4`).
2. `Pre-inscribed` deploys the escrow sale template (`xtrata-preinscribed-collection-sale-v1.0`).
3. In pre-inscribed mode, supply is treated as your launch target and inventory plan.

## After Deployment

1. Update recipients if needed in admin controls.
2. Confirm paused/unpaused state before launch.
3. Verify price/supply/splits on-chain.
4. Record tx ids for all admin changes.

## Why This Flow Exists

This flow is intentionally railroaded so launches feel like creating a product,
not writing smart contracts.

It reduces launch mistakes by removing editable source, advanced switches,
and split misconfiguration during first deploy.
