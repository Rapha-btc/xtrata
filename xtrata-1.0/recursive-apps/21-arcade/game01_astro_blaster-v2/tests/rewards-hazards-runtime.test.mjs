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
        if(step === 3) return 0.99; // choose life branch
        return 0.5;
      };
    })()
  });
  assert.ok(lifeDrop, 'Expected life reward drop');
  assert.equal(lifeDrop.pickupType, 'life');

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
}
