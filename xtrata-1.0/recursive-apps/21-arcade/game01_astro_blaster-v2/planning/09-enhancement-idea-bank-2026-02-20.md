# Enhancement Idea Bank (2026-02-20)

Purpose: extend the backlog with more actionable ideas across gameplay, UX, engagement, and narrative while keeping scale and testability in view.

## Gameplay and Build Depth
| IDs | Theme | Concept | Why it helps |
|---|---|---|---|
| AB-009, AB-010, AB-011 | Progression economy | Milestone perks + branch-lock paths + dock shop currency | Slower, more intentional power curve with stronger run identity |
| AB-012, AB-013 | Defense systems | Directional shield and emergency bubble variants | Adds survivability decisions without making runs trivial |
| AB-014, AB-015 | Weapon identity | Rail charge shot and drone wingman archetype | Creates meaningful playstyle differences and timing skill checks |
| AB-016, AB-017, AB-018 | Counter-pressure | Jammer enemies, hunter elites, environmental hazard lanes | Prevents autopilot and keeps late-wave tension high |

## UX and Readability
| IDs | Theme | Concept | Why it helps |
|---|---|---|---|
| AB-019 | Wave briefing | Pre-wave threat card with enemy composition hints | Lets players prepare instead of reacting blindly |
| AB-020 | Combat clarity | Event feed for damage/debuff causes | Improves trust and learning loop |
| AB-021 | Accessibility | Toggleable shake/flash/contrast presets | Reduces fatigue and broadens playable audience |

## Narrative and Worldbuilding
| IDs | Theme | Concept | Why it helps |
|---|---|---|---|
| AB-022 | Reactive narrative | Faction reputation track with conditional transmissions | Narrative responds to player style instead of static sequencing |
| AB-023 | Character arc | Recurring rival ace encounters across sectors | Adds memorable antagonist continuity and stakes |

## Engagement and Replayability
| IDs | Theme | Concept | Why it helps |
|---|---|---|---|
| AB-024 | Live objectives | Optional daily mission modifiers | Fresh short-session goals without replacing core loop |
| AB-025 | Progress feedback | Medal and mastery badge system | Better post-run motivation and improvement targets |
| AB-026, AB-027 | Mode variety | Boss Rush and Story Marathon modes | Supports different player appetites and session lengths |
| AB-028 | Convenience | Local loadout presets | Reduces setup friction between runs |

## Suggested Next Scoring Candidates
1. AB-024 (Daily Modifiers): retention lever with contained scope.
2. AB-026 (Boss Rush): high-skill replay mode with clear leaderboard boundaries.
3. AB-011 (Scrap shop economy): higher agency vs RNG-only upgrades.
4. AB-015 (Drone wingman): companion-style build identity expansion.
5. AB-013 (Emergency Bubble): complementary defensive branch after directional shield.

## Implementation Notes
- Score each candidate in `08-initial-scorecards.md` before promoting.
- Keep mode/score integrity isolated by explicit leaderboard mode mapping.
- Pair every feature with at least one deterministic runtime test and one restart/regression test.
