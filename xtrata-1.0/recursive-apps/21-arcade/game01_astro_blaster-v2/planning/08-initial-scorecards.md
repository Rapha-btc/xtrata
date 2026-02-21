# Initial Idea Scorecards (2026-02-20)

### AB-001 - Sector briefings + antagonist chatter
- Engagement impact: 5
- Strategic fit: 5
- Development effort (reverse): 3
- Technical risk (reverse): 4
- Testability: 4
- Content scalability: 5
- Weighted score: 33
- Decision: approved
- Implementation status: implemented (Stage 1 WP2 baseline runtime)
- Rationale: High narrative lift with manageable runtime risk; can be delivered as non-blocking overlays.
- Required tests:
  - Trigger once per milestone.
  - No control lock during active wave.

### AB-002 - Upgrade offers based on threat pacing
- Engagement impact: 5
- Strategic fit: 5
- Development effort (reverse): 3
- Technical risk (reverse): 3
- Testability: 4
- Content scalability: 5
- Weighted score: 32
- Decision: approved
- Implementation status: implemented (Stage 1 WP1 runtime cadence)
- Rationale: Strongest lever for longer, more meaningful runs; directly addresses early power-spike compression.
- Required tests:
  - Min-gap between major upgrades.
  - Guaranteed reward window to avoid starvation.

### AB-003 - Rotating drone shield
- Engagement impact: 4
- Strategic fit: 4
- Development effort (reverse): 2
- Technical risk (reverse): 2
- Testability: 3
- Content scalability: 4
- Weighted score: 25
- Decision: approved (Stage 1 WP3 baseline)
- Implementation status: implemented (Aegis Shell baseline)
- Rationale: Implemented as baseline Aegis Shell one-hit shield with finite duration and deterministic pickup/drop hooks.
- Required tests:
  - Damage interception order.
  - Shield lifecycle/reset behavior.

### AB-004 - EMP pulse special
- Engagement impact: 4
- Strategic fit: 4
- Development effort (reverse): 3
- Technical risk (reverse): 3
- Testability: 4
- Content scalability: 4
- Weighted score: 28
- Decision: approved (Stage 1 WP4 baseline)
- Implementation status: implemented (EMP Pulse baseline)
- Rationale: Implemented as EMP Pulse with full-charge activation requirement, explicit cooldown, and deterministic cleanup behavior.
- Required tests:
  - Cooldown/resource enforcement.
  - Bullet clear boundaries and cleanup.

### AB-012 - Directional shield
- Engagement impact: 4
- Strategic fit: 5
- Development effort (reverse): 3
- Technical risk (reverse): 3
- Testability: 4
- Content scalability: 4
- Weighted score: 30
- Decision: approved (Stage 2 defense depth)
- Implementation status: implemented (v2.36)
- Rationale: Converted Aegis interception from full bubble to front arc with input-driven facing so shield use rewards positioning and timing.
- Required tests:
  - Directional interception logic exists in build output/runtime.
  - Facing state updates are stable across movement states.

### AB-019 - Pre-wave threat card
- Engagement impact: 4
- Strategic fit: 5
- Development effort (reverse): 5
- Technical risk (reverse): 5
- Testability: 5
- Content scalability: 4
- Weighted score: 35
- Decision: approved
- Implementation status: implemented (v2.17)
- Rationale: Very low-risk UX win that improves planning clarity and perceived fairness immediately.
- Required tests:
  - Card render timing does not block controls.
  - Threat composition data matches actual spawned wave mix.

### AB-022 - Faction reputation narrative track
- Engagement impact: 5
- Strategic fit: 5
- Development effort (reverse): 3
- Technical risk (reverse): 3
- Testability: 4
- Content scalability: 5
- Weighted score: 32
- Decision: approved
- Implementation status: implemented (v2.18)
- Rationale: Implemented with deterministic profile rules and one-time branching transmission thresholds.
- Required tests:
  - Reputation state transitions are deterministic from run events.
  - Transmission branching triggers once per threshold.

### AB-024 - Daily mission modifiers
- Engagement impact: 5
- Strategic fit: 4
- Development effort (reverse): 3
- Technical risk (reverse): 3
- Testability: 4
- Content scalability: 5
- Weighted score: 31
- Decision: shortlisted
- Rationale: High retention potential with manageable scope if modifier set is constrained initially.
- Required tests:
  - Modifier rotation seed reproducibility.
  - Score multiplier guardrails prevent exploit inflation.
