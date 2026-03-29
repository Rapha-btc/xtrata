# xtrata-arcade-scores-v1.3 TODO

## Status
- Latest arcade score contract line in `contracts/live/`.
- Represents the arcade-score family for earlier score variants.

## What it does today
- Stores score and leaderboard state.
- Does not depend on the Xtrata core inscription contract for ownership or recursion semantics.

## Shortcomings
- Not directly relevant to the core dependency-versus-parent problem.
- Documentation can drift if arcade products start assuming a newer core contract without updating guides.

## TODO
- Keep this contract family independent from core parent/child work unless an arcade feature explicitly needs core asset ownership checks.
- If arcade experiences reference Xtrata assets, document that relationship in the product layer, not by overloading the score contract.
- Keep version notes clear so older score variants inherit this family guidance unless a variant-specific change is introduced.
