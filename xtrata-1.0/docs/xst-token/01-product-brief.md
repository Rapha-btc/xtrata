# XST token product brief

## Purpose
XST is the deterministic participation token for Xtrata. It exists to reward early and ongoing participation without any discretionary control after deployment.

## Core principles (from XST-Token docs)
- Fixed supply: 1,000,000,000 XST.
- No sale, no pre-mine, no governance after deploy.
- Emissions start only after inscription ID 1000 exists.
- Emissions run for a fixed 4-year window and then stop forever.
- Claims are pull-based (no loops over wallets or inscriptions).

## Trigger condition
- Emissions begin once the Xtrata contract reports that inscription #1000 is minted.
- The XST contract records the block height at activation and uses it as the start of the emission schedule.

## Distribution model
- Owner pool: 70% of emissions, weighted by inscription ID.
- Participant pool (v1 optional): 30% of emissions, weighted by a simple participant rule (sqrt of holdings).

## User experience
- Before ID 1000: XST exists but emits 0.
- After ID 1000: claims unlock and emissions accrue per block.
- A single oracle inscription acts as a public, permanent viewer for live token stats.

## Success criteria
- Emission cannot start early.
- Emission ends exactly when the schedule completes.
- Distribution is deterministic and verifiable on-chain.
- The oracle inscription remains usable for the full emission period.
