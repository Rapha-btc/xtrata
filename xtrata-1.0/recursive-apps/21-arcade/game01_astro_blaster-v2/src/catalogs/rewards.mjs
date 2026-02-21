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
    id: 'reward_thruster_module',
    label: 'Thruster Module',
    type: 'crate',
    rarity: 'rare',
    outcome: 'Unlocks vertical thrusters for full arena movement.',
    weight: 12
  },
  {
    id: 'reward_weapon_multiplier',
    label: 'Weapon Multiplier',
    type: 'core',
    rarity: 'rare',
    outcome: 'Improves firing cadence and eventually unlocks auto-fire.',
    weight: 20
  },
  {
    id: 'reward_aegis_shell',
    label: 'Aegis Shell',
    type: 'defense',
    rarity: 'rare',
    outcome: 'Grants one temporary shield charge that absorbs a hit.',
    weight: 14
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
