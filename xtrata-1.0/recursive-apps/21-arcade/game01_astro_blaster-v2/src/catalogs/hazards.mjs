export const hazardCatalog = Object.freeze([
  {
    id: 'hazard_false_salvage',
    label: 'False Salvage Beacon',
    type: 'negative_box',
    summary: 'Looks like a reward but jams weapons briefly.',
    severity: 'medium',
    effects: { weaponJamFrames: 180 }
  },
  {
    id: 'hazard_spike_mine_case',
    label: 'Spike Mine Case',
    type: 'negative_box',
    summary: 'Detonates radial shards on pickup.',
    severity: 'high',
    effects: { radialProjectiles: 8, projectileDamage: 1 }
  },
  {
    id: 'hazard_gravity_dud',
    label: 'Gravity Dud',
    type: 'negative_box',
    summary: 'Reduces movement speed and widens incoming aim assist.',
    severity: 'medium',
    effects: { moveSpeedMultiplier: 0.78, durationFrames: 300 }
  },
  {
    id: 'hazard_ambush_signal',
    label: 'Ambush Signal',
    type: 'red_herring',
    summary: 'Triggers an immediate elite reinforcement wave.',
    severity: 'high',
    effects: { enemyBudgetBonus: 6, reinforcementDelayFrames: 30 }
  }
]);
