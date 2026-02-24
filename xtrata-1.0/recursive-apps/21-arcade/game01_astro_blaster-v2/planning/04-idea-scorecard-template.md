# Idea Scorecard Template

Use this template to evaluate brainstorm items consistently.

## Scoring Scale
- 1 = weak
- 3 = moderate
- 5 = strong

## Criteria
1. Engagement impact
2. Strategic fit (supports Astro Blaster shooter identity)
3. Development effort (reverse-scored: lower effort = higher score)
4. Technical risk (reverse-scored: lower risk = higher score)
5. Testability (can be verified with deterministic tests)
6. Content scalability (easy to extend in future versions)

## Formula
`weightedScore = (impact*3) + (fit*2) + effort + risk + testability + scalability`

## Decision Bands
- `18+`: strong candidate
- `14-17`: shortlist and prototype
- `<=13`: park or reject

## Score Entry Template
```md
### AB-XXX - <Idea Title>
- Engagement impact: <1-5>
- Strategic fit: <1-5>
- Development effort (reverse): <1-5>
- Technical risk (reverse): <1-5>
- Testability: <1-5>
- Content scalability: <1-5>
- Weighted score: <number>
- Decision: <approved / shortlisted / parked / rejected>
- Rationale: <short explanation>
- Required tests: <list>
```

