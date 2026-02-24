# Brainstorm Backlog

Use this file to capture ideas quickly. Promote only scored/approved ideas into the roadmap.

## Status Legend
- `raw`: unscored idea
- `shortlisted`: scored and promising
- `approved`: moved to roadmap/spec
- `implemented`: shipped in runtime + tests
- `rejected`: not worth pursuing now
- `parked`: useful later, not now

## Idea Table
| ID | Category | Idea | Player Value | Complexity | Status | Notes |
|---|---|---|---|---|---|---|
| AB-001 | Narrative | Sector briefings + antagonist chatter | Strong story context between waves | Medium | implemented | Stage 1 narrative runtime baseline shipped |
| AB-002 | Progression | Upgrade offers every N threat points (not constant timing) | Better pacing and less RNG spam | Medium | implemented | Stage 1 pacing runtime shipped (v2.22+) |
| AB-003 | Shields | Rotating drone shield that can be shot off | Skill expression and survivability | High | implemented | Stage 1 WP3 baseline shipped as Aegis Shell |
| AB-004 | Specials | EMP pulse to clear bullets and stagger elites | Clutch tool without permanent power creep | Medium | implemented | Stage 1 WP4 baseline shipped as EMP Pulse |
| AB-005 | Risk/Reward | Red-herring crates with temporary debuffs | Adds tension and strategic choice | Low | implemented | v2.33: weapon jam + drag slow + shard burst + ambush scheduling with mission feed messaging |
| AB-006 | Upgrades | Upgrade rarity tiers + reroll token system | Build planning and replay variety | Medium | raw | Tune reroll scarcity |
| AB-007 | Enemy Design | Counter-enemies that punish one-dimensional builds | Prevent stale metas | High | raw | Requires better telegraphs |
| AB-008 | Modes | Weekly seeded challenge mode | High replayability and fair comparison | Medium | raw | Integrate with score mode rules |
| AB-009 | Progression | Milestone unlock map (sector perks every 3 levels) | Long-run goals and better pacing | Medium | raw | Pace rewards without flooding pickups |
| AB-010 | Upgrades | Branch-lock choices (choose 1 of 3 archetypes per run) | Strong build identity | Medium | implemented | v2.34: runtime archetype lock (Sentinel/Skirmisher/Striker) with drop-bias carry through run |
| AB-011 | Upgrades | Scrap currency + shop dock every few waves | Better agency than pure RNG drops | High | raw | Needs economy and sink balancing |
| AB-012 | Shields | Directional shield (front arc with angle management) | Skill-based defense depth | High | implemented | v2.36: Aegis Shell now intercepts only in a facing arc with movement-driven orientation |
| AB-013 | Shields | Reactive emergency bubble (1-hit panic save) | Reduces frustration spikes | Medium | raw | Must have long recharge and clear telegraph |
| AB-014 | Weapons | Charge rail shot with pierce line | High-risk high-reward moments | Medium | raw | Charging should reduce movement speed |
| AB-015 | Weapons | Drone wingman that mirrors fire pattern | Companion fantasy + DPS variety | High | raw | Cap target lock and uptime |
| AB-016 | Enemy Design | Jammer enemies that disable upgrades temporarily | Forces adaptation each run | Medium | raw | Keep duration short and readable |
| AB-017 | Enemy Design | Hunter elite that tracks weak positioning | Better mid-run challenge spikes | Medium | raw | Add warning laser before lunge |
| AB-018 | Hazards | Environmental hazard lanes (solar flare sweeps) | Spatial mastery and tension | High | raw | Respect fairness windows for dodge |
| AB-019 | UX | Pre-wave threat card with enemy mix preview | Better planning and lower confusion | Low | implemented | Implemented in v2.17 as non-blocking threat overlay |
| AB-020 | UX | Combat event feed (why damage/debuff happened) | Higher clarity and trust | Low | raw | Keep feed compact and throttled |
| AB-021 | UX | Adjustable accessibility settings (shake, flash, contrast) | Better comfort and retention | Medium | raw | Include presets + per-option toggles |
| AB-022 | Narrative | Faction reputation track with branching comms | Story reacts to player style | Medium | implemented | Implemented in v2.18 with profile-based branching transmissions |
| AB-023 | Narrative | Rival ace mini-boss recurring across sectors | Strong narrative anchor | High | raw | Ensure encounter cadence feels earned |
| AB-024 | Engagement | Daily mission modifiers (optional side objectives) | Session variety and return loop | Medium | raw | Avoid score inflation exploits |
| AB-025 | Engagement | Run medals and mastery badges | More post-run motivation | Low | raw | Tie medals to explicit achievements |
| AB-026 | Modes | Boss Rush mode with curated build loadouts | High-skill replayability | Medium | raw | Separate leaderboard bucket required |
| AB-027 | Modes | Story Marathon mode with checkpoint sectors | Longer narrative sessions | High | raw | Save/load and pacing checks required |
| AB-028 | Meta | Pilot loadout presets saved locally | Faster re-entry and experimentation | Low | raw | Keep deterministic + mode-safe |

## Promotion Rule
An idea should not move to `approved` until it has:
1. Scorecard entry completed.
2. Clear test plan impact noted.
3. Owner + target stage assigned in roadmap.
