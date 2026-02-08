# Emissions and distribution

This document translates the emission schedule and distribution rules into implementation-ready math.

## Emission schedule
Total supply is 1,000,000,000 XST across 4 years.

- Year 1: 40% (400,000,000)
- Year 2: 30% (300,000,000)
- Year 3: 20% (200,000,000)
- Year 4: 10% (100,000,000)

Blocks per year = 52,560.

Per-block rates:
- Year 1: 400,000,000 / 52,560
- Year 2: 300,000,000 / 52,560
- Year 3: 200,000,000 / 52,560
- Year 4: 100,000,000 / 52,560

## Owner pool (70%)
- Distribution uses a global accumulator.
- Each inscription has a fixed weight by token ID.
- Claim = weight * (acc_owner_per_weight - reward_debt).

## Participant pool (30%, optional v1)
- Weight = floor(sqrt(total inscriptions owned))
- Optional cap (e.g., max 100) to avoid dominance.
- Claim = weight * (acc_participant_per_weight - reward_debt).

## Determinism
- All values depend only on block height and on-chain state.
- No admin toggles after deployment.
- No loops over holders or inscriptions.
