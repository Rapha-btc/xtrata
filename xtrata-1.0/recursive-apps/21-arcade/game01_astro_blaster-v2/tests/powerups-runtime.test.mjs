import assert from 'node:assert/strict';
import vm from 'node:vm';

import { buildGame } from '../src/build/build-game.mjs';

function createSandboxedGame(){
  return buildGame({ write: false }).then((buildResult) => {
    const script = new vm.Script(buildResult.outputSource, { filename: 'game01_astro_blaster-v2.js' });
    const sandbox = { console };
    vm.createContext(sandbox);
    script.runInContext(sandbox);
    return sandbox.Game01;
  });
}

export async function run(){
  const game = await createSandboxedGame();
  assert.ok(game, 'Expected built game object');

  const hooks = game.__astroV2RuntimeHooks;
  assert.ok(hooks && hooks.powerups, 'Expected runtime powerups hook');

  const runtime = hooks.powerups;
  const player = { x: 220, y: 520, w: 32, h: 32 };

  const pattern1 = runtime.getPlayerShotPattern({ powerLevel: 1 }, player);
  assert.equal(pattern1.cooldown, 8);
  assert.equal(pattern1.shots.length, 1);

  const pattern2 = runtime.getPlayerShotPattern({ powerLevel: 2 }, player);
  assert.equal(pattern2.cooldown, 8);
  assert.equal(pattern2.shots.length, 3);

  const pattern3 = runtime.getPlayerShotPattern({ powerLevel: 3 }, player);
  assert.equal(pattern3.cooldown, 6);
  assert.equal(pattern3.shots.length, 5);
  assert.equal(pattern3.shots[0].damage, 2);

  const dropState = { powerups: [] };
  runtime.maybeDrop({
    state: dropState,
    enemy: { x: 100, y: 100, w: 20, h: 20 },
    profile: { dropChance: 1 },
    rand: () => 0.5
  });
  assert.equal(dropState.powerups.length, 1);
  assert.equal(dropState.powerups[0].type, 'spread');

  const resolvedDropState = { powerups: [] };
  runtime.maybeDrop({
    state: resolvedDropState,
    enemy: { x: 20, y: 40, w: 20, h: 20 },
    profile: { dropChance: 1 },
    rand: () => 0.25,
    rewardsHazards: {
      resolveDrop(){
        return {
          sourceType: 'hazard',
          sourceId: 'hazard_false_salvage',
          pickupType: 'hazard',
          pickupLabel: 'False Salvage Beacon',
          hazardEffect: { weaponJamFrames: 180 }
        };
      }
    }
  });
  assert.equal(resolvedDropState.powerups.length, 1);
  assert.equal(resolvedDropState.powerups[0].type, 'hazard');
  assert.equal(resolvedDropState.powerups[0].sourceId, 'hazard_false_salvage');

  const lifeState = { powerups: [{ x: 0, y: 0, w: 16, h: 16, dy: 0, type: 'life', phase: 0 }], lives: 4, powerLevel: 1, powerTimer: 0 };
  runtime.updatePowerups({
    state: lifeState,
    player: { x: 0, y: 0, w: 20, h: 20 },
    tick: 0,
    shared: null,
    maxLives: 5,
    worldHeight: 600,
    rectsOverlap: () => true
  });
  assert.equal(lifeState.lives, 5);
  assert.equal(lifeState.powerups.length, 0);

  const spreadState = { powerups: [{ x: 0, y: 0, w: 16, h: 16, dy: 0, type: 'spread', phase: 0 }], lives: 3, powerLevel: 2, powerTimer: 0 };
  runtime.updatePowerups({
    state: spreadState,
    player: { x: 0, y: 0, w: 20, h: 20 },
    tick: 0,
    shared: null,
    maxLives: 5,
    worldHeight: 600,
    rectsOverlap: () => true
  });
  assert.equal(spreadState.powerLevel, 3);
  assert.equal(spreadState.powerTimer, 720);

  const rewardsHazardsDrivenState = {
    powerups: [{ x: 0, y: 0, w: 16, h: 16, dy: 0, type: 'life', phase: 0 }],
    lives: 2,
    powerLevel: 1,
    powerTimer: 0
  };
  runtime.updatePowerups({
    state: rewardsHazardsDrivenState,
    player: { x: 0, y: 0, w: 20, h: 20 },
    tick: 0,
    shared: null,
    maxLives: 5,
    worldHeight: 600,
    rectsOverlap: () => true,
    rewardsHazards: {
      applyPickup(payload){
        payload.state.lives += 2;
        return { consumed: true, outcome: 'custom' };
      }
    }
  });
  assert.equal(rewardsHazardsDrivenState.lives, 4);
  assert.equal(rewardsHazardsDrivenState.powerups.length, 0);

  runtime.tickPowerTimer({ state: spreadState });
  assert.equal(spreadState.powerTimer, 719);

  spreadState.powerTimer = 1;
  spreadState.powerLevel = 3;
  runtime.tickPowerTimer({ state: spreadState });
  assert.equal(spreadState.powerTimer, 0);
  assert.equal(spreadState.powerLevel, 1);
}
