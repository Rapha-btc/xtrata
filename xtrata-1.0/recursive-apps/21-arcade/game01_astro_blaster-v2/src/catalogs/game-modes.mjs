export const gameModesCatalog = Object.freeze([
  {
    id: 'campaign',
    label: 'Campaign',
    description: 'Narrative sector climb with escalating mixed formations.',
    scoreMode: 'score',
    leaderboardIdSuffix: 'campaign',
    riskLevel: 'medium'
  },
  {
    id: 'overdrive',
    label: 'Overdrive',
    description: 'Infinite pressure mode with aggressive pacing and score multipliers.',
    scoreMode: 'score',
    leaderboardIdSuffix: 'overdrive',
    riskLevel: 'high'
  },
  {
    id: 'hardcore',
    label: 'Hardcore',
    description: 'Single-life mode tuned for elite score competition.',
    scoreMode: 'score',
    leaderboardIdSuffix: 'hardcore',
    riskLevel: 'extreme'
  },
  {
    id: 'mutator',
    label: 'Mutator Ops',
    description: 'Rotating modifiers blending positive and negative combat twists.',
    scoreMode: 'score',
    leaderboardIdSuffix: 'mutator',
    riskLevel: 'high'
  }
]);
