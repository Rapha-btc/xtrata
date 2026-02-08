# Integration plan

## Phase 0 - Spec alignment
- Confirm emission start condition (inscription #1000).
- Confirm owner pool weight bands.
- Decide whether participant pool ships in v1 or v1.1.

## Phase 1 - Contract implementation
- Implement XST SIP-010 token contract.
- Add emission activation gate (read-only call to Xtrata).
- Add update_emissions + claim functions.
- Add read-only functions for oracle viewer.

## Phase 2 - Tests
- Emission activation before/after ID 1000.
- Emission rate by year.
- Claim math for early IDs and later IDs.
- Supply cap enforcement.
- Participant pool math (if enabled).

## Phase 3 - Oracle inscription
- Build a minimal HTML/JS viewer.
- Hardcode network + contract IDs.
- Test against mainnet read-only endpoints.
- Inscribe as a single Xtrata inscription.

## Phase 4 - App integration
- Add a Docs section explaining XST and oracle.
- Add a link/button to open the oracle inscription in the viewer.
- Provide a simple XST status panel (optional).

## Phase 5 - Deployment
- Deploy XST contract.
- Verify emissions remain locked until ID 1000.
- Mint oracle inscription.
- Monitor claims and emissions.
