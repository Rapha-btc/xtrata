export const upgradeCatalog = Object.freeze([
  {
    id: 'shield_aegis_shell',
    label: 'Aegis Shell',
    category: 'defense',
    tier: 1,
    rarity: 'common',
    summary: 'Adds a temporary shield bubble that absorbs one hit.',
    effects: { shieldCharges: 1, durationFrames: 720 }
  },
  {
    id: 'shield_recharge_matrix',
    label: 'Recharge Matrix',
    category: 'defense',
    tier: 2,
    rarity: 'rare',
    summary: 'Periodically rebuilds one shield charge in prolonged fights.',
    effects: { shieldRegenFrames: 900 }
  },
  {
    id: 'clone_mirror_gunner',
    label: 'Mirror Gunner',
    category: 'autonomous_clone',
    tier: 2,
    rarity: 'rare',
    summary: 'Spawns a mirrored clone that tracks and fires reduced-damage shots.',
    effects: { cloneCount: 1, cloneDamageMultiplier: 0.45 }
  },
  {
    id: 'clone_turret_core',
    label: 'Turret Core',
    category: 'autonomous_clone',
    tier: 3,
    rarity: 'epic',
    summary: 'Adds a stationary support clone with interception fire.',
    effects: { supportTurrets: 1, interceptionRadius: 130 }
  },
  {
    id: 'arsenal_plasma_spindle',
    label: 'Plasma Spindle',
    category: 'offense',
    tier: 2,
    rarity: 'rare',
    summary: 'Converts center shot to piercing plasma with longer uptime.',
    effects: { piercingShots: 1, bonusDamage: 1 }
  },
  {
    id: 'arsenal_arc_burst',
    label: 'Arc Burst',
    category: 'offense',
    tier: 3,
    rarity: 'epic',
    summary: 'Adds chained arc damage between nearby enemies.',
    effects: { chainTargets: 2, chainDamageMultiplier: 0.35 }
  },
  {
    id: 'mobility_vector_thrusters',
    label: 'Vector Thrusters',
    category: 'mobility',
    tier: 1,
    rarity: 'common',
    summary: 'Boosts strafe speed to improve dodge windows.',
    effects: { moveSpeedMultiplier: 1.12 }
  },
  {
    id: 'utility_salvage_radar',
    label: 'Salvage Radar',
    category: 'utility',
    tier: 2,
    rarity: 'rare',
    summary: 'Improves quality of reward crates while lowering drop frequency.',
    effects: { rewardQualityBonus: 0.18, dropRateMultiplier: 0.9 }
  },
  {
    id: 'utility_overclock_capacitor',
    label: 'Overclock Capacitor',
    category: 'utility',
    tier: 3,
    rarity: 'epic',
    summary: 'Temporarily reduces weapon cooldown after elite kills.',
    effects: { cooldownMultiplier: 0.82, triggerWindowFrames: 420 }
  }
]);
