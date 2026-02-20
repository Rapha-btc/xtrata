export const rewardCatalog = Object.freeze([
  {
    id: 'reward_supply_cache',
    label: 'Supply Cache',
    type: 'crate',
    rarity: 'common',
    outcome: 'Small score boost plus minor repair.',
    weight: 42
  },
  {
    id: 'reward_proto_upgrade',
    label: 'Prototype Upgrade',
    type: 'crate',
    rarity: 'rare',
    outcome: 'Select one upgrade from a curated trio.',
    weight: 18
  },
  {
    id: 'reward_elite_bounty',
    label: 'Elite Bounty',
    type: 'challenge',
    rarity: 'epic',
    outcome: 'High score bonus if objective is completed in time.',
    weight: 8
  },
  {
    id: 'reward_resonance_core',
    label: 'Resonance Core',
    type: 'crate',
    rarity: 'legendary',
    outcome: 'Grants mode-specific modifier and temporary invulnerability.',
    weight: 3
  }
]);
