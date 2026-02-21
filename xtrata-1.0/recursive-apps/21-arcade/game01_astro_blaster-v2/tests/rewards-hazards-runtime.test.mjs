import assert from 'node:assert/strict';
import vm from 'node:vm';

import { buildGame } from '../src/build/build-game.mjs';

async function loadGame(){
  const buildResult = await buildGame({ write: false });
  const script = new vm.Script(buildResult.outputSource, { filename: 'game01_astro_blaster-v2.js' });
  const sandbox = { console };
  vm.createContext(sandbox);
  script.runInContext(sandbox);
  return sandbox.Game01;
}

export async function run(){
  const game = await loadGame();
  const runtimeHooks = game.__astroV2RuntimeHooks;
  assert.ok(runtimeHooks, 'Expected runtime hooks object');
  assert.ok(runtimeHooks.rewardsHazards, 'Expected rewards/hazards runtime hook');

  const rewardsHazards = runtimeHooks.rewardsHazards;
  const spreadDrop = rewardsHazards.resolveDrop({
    profile: { dropChance: 1 },
    rand: () => 0.5
  });
  assert.ok(spreadDrop, 'Expected reward drop at 100% drop chance');
  assert.equal(spreadDrop.sourceType, 'reward');
  assert.equal(spreadDrop.pickupType, 'spread');

  const lifeDrop = rewardsHazards.resolveDrop({
    profile: { dropChance: 1 },
    rand: (() => {
      let step = 0;
      return () => {
        step += 1;
        if(step === 1) return 0.0; // pass drop chance gate
        if(step === 2) return 0.99; // fail hazard branch
        if(step === 3) return 0.99; // fail multiplier branch
        if(step === 4) return 0.99; // choose life branch
        return 0.5;
      };
    })()
  });
  assert.ok(lifeDrop, 'Expected life reward drop');
  assert.equal(lifeDrop.pickupType, 'life');

  const multiplierDrop = rewardsHazards.resolveDrop({
    state: {
      level: 2,
      wave: 1,
      tick: 2000,
      fireCadenceTier: 0,
      verticalMobilityUnlocked: true,
      __astroDropCadence: {
        killsSeen: 100,
        lastDropKills: 0,
        lastDropTick: -999999,
        lastMajorDropTick: -999999,
        lastMajorDropWave: -999999,
        lastMajorDropLevel: 1,
        dropsSinceMultiplier: 3
      }
    },
    profile: { dropChance: 1 },
    rand: (() => {
      let step = 0;
      return () => {
        step += 1;
        if(step === 1) return 0.0; // pass drop chance gate
        if(step === 2) return 0.99; // fail hazard branch
        if(step === 3) return 0.2; // pass multiplier chance branch
        return 0.5;
      };
    })()
  });
  assert.ok(multiplierDrop, 'Expected multiplier reward drop');
  assert.equal(multiplierDrop.pickupType, 'multiplier');

  const shieldDrop = rewardsHazards.resolveDrop({
    state: {
      level: 6,
      wave: 4,
      tick: 2600,
      verticalMobilityUnlocked: true,
      shieldCharges: 0,
      __astroDropCadence: {
        killsSeen: 10,
        threatSeen: 40,
        lastDropKills: 3,
        lastDropThreat: 30,
        lastDropTick: 2400,
        lastMajorDropTick: -999999,
        lastMajorDropWave: -999999,
        lastMajorDropLevel: 1,
        dropsSinceMultiplier: 0
      }
    },
    profile: { dropChance: 1 },
    rand: (() => {
      let step = 0;
      return () => {
        step += 1;
        if(step === 1) return 0.0; // pass drop gate
        if(step === 2) return 0.99; // skip hazard gate
        if(step === 3) return 0.0; // pass shield gate
        return 0.5;
      };
    })()
  });
  assert.ok(shieldDrop, 'Expected shield reward drop when shield is offline');
  assert.equal(shieldDrop.pickupType, 'shield');

  const hazardDrop = rewardsHazards.resolveDrop({
    profile: { dropChance: 1 },
    rand: (() => {
      let step = 0;
      return () => {
        step += 1;
        if(step === 1) return 0.0; // pass drop chance gate
        if(step === 2) return 0.01; // pass hazard gate (0.08)
        return 0.0; // select first hazard
      };
    })()
  });
  assert.ok(hazardDrop, 'Expected hazard drop');
  assert.equal(hazardDrop.sourceType, 'hazard');
  assert.equal(hazardDrop.pickupType, 'hazard');
  assert.ok(hazardDrop.hazardEffect, 'Expected hazard effect payload');

  const thrusterState = {
    level: 3,
    wave: 5,
    tick: 2000,
    verticalMobilityUnlocked: false,
    __astroDropCadence: {
      killsSeen: 100,
      lastDropKills: 0,
      lastDropTick: -999999,
      lastMajorDropTick: -999999,
      lastMajorDropWave: -999999,
      lastMajorDropLevel: 1
    }
  };
  const thrusterDrop = rewardsHazards.resolveDrop({
    state: thrusterState,
    profile: { dropChance: 1 },
    rand: (() => {
      let step = 0;
      return () => {
        step += 1;
        if(step === 1) return 0.0; // pass drop gate
        if(step === 2) return 0.99; // skip hazard gate
        if(step === 3) return 0.0; // pass thruster gate
        return 0.5;
      };
    })()
  });
  assert.ok(thrusterDrop, 'Expected thruster reward drop while mobility is locked');
  assert.equal(thrusterDrop.pickupType, 'thruster');

  const state = { lives: 2, powerLevel: 1, powerTimer: 0 };
  const lifeOutcome = rewardsHazards.applyPickup({
    state,
    pickup: { pickupType: 'life' },
    shared: null,
    maxLives: 5
  });
  assert.equal(lifeOutcome.consumed, true);
  assert.equal(lifeOutcome.outcome, 'life');
  assert.equal(state.lives, 3);

  const spreadOutcome = rewardsHazards.applyPickup({
    state,
    pickup: { pickupType: 'spread' },
    shared: null,
    maxLives: 5
  });
  assert.equal(spreadOutcome.consumed, true);
  assert.equal(spreadOutcome.outcome, 'spread');
  assert.equal(state.powerLevel, 2);
  assert.equal(state.powerTimer, 720);

  const fireState = {
    lives: 3,
    powerLevel: 1,
    powerTimer: 0,
    fireCadenceTier: 3,
    fireAutoUnlockTier: 4,
    maxFireCadenceTier: 7,
    fireAutoUnlocked: false,
    fireUnlockIntro: 0
  };
  const multiplierOutcome = rewardsHazards.applyPickup({
    state: fireState,
    pickup: { pickupType: 'multiplier' },
    shared: null,
    maxLives: 5
  });
  assert.equal(multiplierOutcome.consumed, true);
  assert.equal(multiplierOutcome.outcome, 'multiplier');
  assert.equal(fireState.fireCadenceTier, 4);
  assert.equal(fireState.fireAutoUnlocked, true);
  assert.ok(fireState.fireUnlockIntro >= 180);

  const mobilityState = { lives: 2, powerLevel: 1, powerTimer: 0, verticalMobilityUnlocked: false, mobilityUnlockIntro: 0 };
  const thrusterOutcome = rewardsHazards.applyPickup({
    state: mobilityState,
    pickup: { pickupType: 'thruster' },
    shared: null,
    maxLives: 5
  });
  assert.equal(thrusterOutcome.consumed, true);
  assert.equal(thrusterOutcome.outcome, 'thruster');
  assert.equal(mobilityState.verticalMobilityUnlocked, true);
  assert.ok(mobilityState.mobilityUnlockIntro >= 180, 'Expected mobility unlock intro frames');

  const archetypeState = {
    level: 5,
    wave: 2,
    tick: 500,
    lives: 3,
    powerLevel: 1,
    powerTimer: 0,
    fireCadenceTier: 0,
    fireAutoUnlockTier: 4,
    maxFireCadenceTier: 7,
    fireAutoUnlocked: false,
    verticalMobilityUnlocked: false,
    shieldCharges: 0,
    shieldTimer: 0,
    shieldMaxCharges: 1
  };
  const archetypeShield = rewardsHazards.applyPickup({
    state: archetypeState,
    pickup: { pickupType: 'shield' },
    shared: null,
    maxLives: 5
  });
  assert.equal(archetypeShield.outcome, 'shield');
  assert.equal(archetypeState.upgradeArchetype, null, 'Archetype should not lock before threshold is reached');
  const archetypeLife = rewardsHazards.applyPickup({
    state: archetypeState,
    pickup: { pickupType: 'life' },
    shared: null,
    maxLives: 5
  });
  assert.equal(archetypeLife.outcome, 'life');
  assert.equal(archetypeState.upgradeArchetype, 'sentinel', 'Shield/life line should lock into sentinel archetype');
  assert.equal(archetypeLife.archetypeLocked, true, 'Archetype lock should be surfaced on locking pickup');
  const archetypeSpread = rewardsHazards.applyPickup({
    state: archetypeState,
    pickup: { pickupType: 'spread' },
    shared: null,
    maxLives: 5
  });
  assert.equal(archetypeSpread.outcome, 'spread');
  assert.equal(archetypeState.upgradeArchetype, 'sentinel', 'Archetype lock should remain stable after subsequent pickups');

  const sentinelBiasedDrop = rewardsHazards.resolveDrop({
    state: {
      level: 6,
      wave: 4,
      tick: 2600,
      upgradeArchetype: 'sentinel',
      verticalMobilityUnlocked: false,
      shieldCharges: 0,
      __astroArchetype: {
        id: 'sentinel',
        locked: true,
        points: { striker: 0, sentinel: 4, skirmisher: 0 }
      },
      __astroDropCadence: {
        killsSeen: 10,
        threatSeen: 40,
        lastDropKills: 3,
        lastDropThreat: 30,
        lastDropTick: 2400,
        lastMajorDropTick: -999999,
        lastMajorDropWave: -999999,
        lastMajorDropLevel: 1,
        dropsSinceMultiplier: 0
      }
    },
    profile: { dropChance: 1 },
    rand: (() => {
      let step = 0;
      return () => {
        step += 1;
        if(step === 1) return 0.0; // pass drop gate
        if(step === 2) return 0.99; // skip hazard gate
        if(step === 3) return 0.99; // fail thruster gate
        if(step === 4) return 0.3; // pass sentinel-biased shield gate
        return 0.5;
      };
    })()
  });
  assert.ok(sentinelBiasedDrop, 'Expected sentinel archetype run to still resolve a drop');
  assert.equal(sentinelBiasedDrop.pickupType, 'shield', 'Sentinel archetype should bias toward defense drops when eligible');

  const shieldState = {
    lives: 2,
    powerLevel: 1,
    powerTimer: 0,
    shieldCharges: 0,
    shieldTimer: 0,
    shieldMaxCharges: 1
  };
  const shieldOutcome = rewardsHazards.applyPickup({
    state: shieldState,
    pickup: { pickupType: 'shield' },
    shared: null,
    maxLives: 5
  });
  assert.equal(shieldOutcome.consumed, true);
  assert.equal(shieldOutcome.outcome, 'shield');
  assert.equal(shieldState.shieldCharges, 1);
  assert.ok(shieldState.shieldTimer >= 720, 'Expected shield duration to be applied');

  const hazardState = { lives: 2, powerLevel: 2, powerTimer: 100, weaponJamTimer: 0 };
  const hazardOutcome = rewardsHazards.applyPickup({
    state: hazardState,
    pickup: { pickupType: 'hazard', hazardEffect: { weaponJamFrames: 180 } },
    shared: null,
    maxLives: 5
  });
  assert.equal(hazardOutcome.consumed, true);
  assert.equal(hazardOutcome.outcome, 'hazard');
  assert.equal(hazardState.weaponJamTimer, 180);
  assert.equal(hazardState.powerLevel, 2);

  const slowHazardState = { lives: 2, powerLevel: 2, powerTimer: 100, hazardSlowTimer: 0, hazardSlowMultiplier: 1 };
  const slowHazardOutcome = rewardsHazards.applyPickup({
    state: slowHazardState,
    pickup: { pickupType: 'hazard', hazardEffect: { moveSpeedMultiplier: 0.78, durationFrames: 300 } },
    shared: null,
    maxLives: 5
  });
  assert.equal(slowHazardOutcome.consumed, true);
  assert.equal(slowHazardOutcome.outcome, 'hazard');
  assert.equal(slowHazardState.hazardSlowTimer, 300);
  assert.equal(slowHazardState.hazardSlowMultiplier, 0.78);

  const ambushHazardState = { lives: 2, powerLevel: 2, hazardReinforcementTimer: 0, hazardReinforcementBudget: 0 };
  const ambushHazardOutcome = rewardsHazards.applyPickup({
    state: ambushHazardState,
    pickup: { pickupType: 'hazard', hazardEffect: { enemyBudgetBonus: 6, reinforcementDelayFrames: 30 } },
    shared: null,
    maxLives: 5
  });
  assert.equal(ambushHazardOutcome.consumed, true);
  assert.equal(ambushHazardOutcome.outcome, 'hazard');
  assert.equal(ambushHazardState.hazardReinforcementBudget, 6);
  assert.equal(ambushHazardState.hazardReinforcementTimer, 30);

  const radialShots = [];
  const radialHazardState = { lives: 2, powerLevel: 2, enemyShots: radialShots };
  const radialHazardOutcome = rewardsHazards.applyPickup({
    state: radialHazardState,
    pickup: {
      pickupType: 'hazard',
      x: 100,
      y: 80,
      w: 16,
      h: 16,
      hazardEffect: { radialProjectiles: 8 }
    },
    spawnEnemyShot: (x, y, vx, vy, w, h, color) => {
      radialShots.push({ x, y, vx, vy, w, h, color });
    },
    shared: null,
    maxLives: 5
  });
  assert.equal(radialHazardOutcome.consumed, true);
  assert.equal(radialHazardOutcome.outcome, 'hazard');
  assert.equal(radialShots.length, 8, 'Expected radial hazard to emit configured number of hostile shards');

  const cadenceState = { level: 1, wave: 1, tick: 0 };
  for(let i = 0; i < 3; i += 1){
    cadenceState.tick += 30;
    const gatedDrop = rewardsHazards.resolveDrop({
      state: cadenceState,
      enemyThreat: 3,
      profile: { dropChance: 1 },
      rand: () => 0.5
    });
    assert.equal(gatedDrop, null, 'Early pacing gate should block frequent drops before threat threshold');
  }

  cadenceState.tick += 30;
  const firstCadenceDrop = rewardsHazards.resolveDrop({
    state: cadenceState,
    enemyThreat: 3,
    profile: { dropChance: 1 },
    rand: () => 0.5
  });
  assert.ok(firstCadenceDrop, 'Cadence gate should allow drop once minimum threat/frame thresholds are met');
  assert.equal(firstCadenceDrop.pickupType, 'spread');

  for(let i = 0; i < 3; i += 1){
    cadenceState.tick += 30;
    const postMajorGated = rewardsHazards.resolveDrop({
      state: cadenceState,
      enemyThreat: 3,
      profile: { dropChance: 1 },
      rand: () => 0.5
    });
    assert.equal(postMajorGated, null, 'Cadence gate should continue spacing subsequent drops');
  }

  cadenceState.tick += 30;
  const secondCadenceDrop = rewardsHazards.resolveDrop({
    state: cadenceState,
    enemyThreat: 3,
    profile: { dropChance: 1 },
    rand: () => 0.5
  });
  assert.ok(secondCadenceDrop, 'Cadence gate should permit the next drop after another threshold window');
  assert.equal(
    secondCadenceDrop.pickupType,
    'life',
    'Major spread drops should be throttled early and downgraded to life until major cooldown clears'
  );

  const starvationState = { level: 1, wave: 1, tick: 0 };
  for(let i = 0; i < 15; i += 1){
    starvationState.tick += 20;
    const starvationBlocked = rewardsHazards.resolveDrop({
      state: starvationState,
      profile: { dropChance: 0 },
      rand: () => 0.99
    });
    assert.equal(starvationBlocked, null, 'Starvation guarantee should not trigger before the configured kill window');
  }

  starvationState.tick += 20;
  const starvationDrop = rewardsHazards.resolveDrop({
    state: starvationState,
    profile: { dropChance: 0 },
    rand: () => 0.99
  });
  assert.ok(starvationDrop, 'Starvation protection should force a drop even when profile drop chance is zero');
}
