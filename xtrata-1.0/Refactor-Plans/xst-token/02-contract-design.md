# XST contract design

This document translates the XST-Token whitepaper + checklist into a concrete contract plan.

## Constants
- TOTAL_SUPPLY = 1_000_000_000
- EMISSION_YEARS = 4
- BLOCKS_PER_YEAR = 52_560 (approx 10-minute blocks)
- DURATION_BLOCKS = EMISSION_YEARS * BLOCKS_PER_YEAR
- OWNER_POOL_BPS = 7_000
- PARTICIPANT_POOL_BPS = 3_000
- BPS_DENOM = 10_000

## Global state
- emissions_start_block: optional uint
- last_emission_block: uint
- total_emitted: uint
- acc_owner_per_weight: uint (scaled)
- total_owner_weight: uint
- acc_participant_per_weight: uint (scaled)
- total_participant_weight: uint

## Maps
- inscription_weight: token-id -> weight
- inscription_reward_debt: token-id -> accumulator snapshot
- participant_weight: principal -> weight
- participant_reward_debt: principal -> accumulator snapshot

## Emission activation (ID 1000 gate)
- Emissions activate only when the Xtrata contract reports last token id >= 1000.
- Activation sets emissions_start_block and last_emission_block to the current block.
- This logic is idempotent and only triggers once.

Suggested pattern:
- update_emissions() checks if emissions_start_block is none.
- If none, read Xtrata get-last-token-id.
- If >= 1000, set emissions_start_block and last_emission_block.

## Emission update logic
- Compute elapsed blocks since last_emission_block.
- Determine current year based on (block_height - emissions_start_block).
- Determine per_block_rate by year allocation / BLOCKS_PER_YEAR.
- Emit = min(remaining_supply, elapsed * per_block_rate).
- Split by pool bps.
- Update accumulators and total_emitted.

## Weighting (owner pool)
- Deterministic weight by token-id (Option A from XST-Token docs):
  - 0 => 1400
  - 1-10 => 1200
  - 11-100 => 1000
  - 101-1,000 => 800
  - 1,001-10,000 => 640
  - 10,001-100,000 => 512
  - 100,001-1,000,000 => 410
  - Further decades: floor(prev * 4 / 5)

## Claims
- Owner claim:
  - update_emissions()
  - pending = weight * (acc_owner_per_weight - reward_debt)
  - transfer XST to current NFT owner
  - update reward_debt

- Participant claim (optional v1):
  - update_emissions()
  - pending = participant_weight * (acc_participant_per_weight - reward_debt)
  - transfer XST to caller
  - update reward_debt

## Read-only surface for the oracle inscription
Expose read-only functions used by the inscription viewer:
- get-emissions-start-block
- get-last-emission-block
- get-total-emitted
- get-remaining-supply
- get-current-year-index
- get-per-block-rate
- get-acc-owner-per-weight
- get-total-owner-weight
- get-inscription-weight(token-id)
- get-claimable-owner(token-id)
- get-claimable-participant(principal)

These read-onlys should be lightweight and require no iteration.
