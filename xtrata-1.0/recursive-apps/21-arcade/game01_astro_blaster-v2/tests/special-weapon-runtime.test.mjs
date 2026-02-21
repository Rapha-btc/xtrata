import assert from 'node:assert/strict';

import { buildGame } from '../src/build/build-game.mjs';

export async function run(){
  const buildResult = await buildGame({ write: false });
  const source = buildResult.outputSource;

  assert.ok(source.includes('activateSpecialWeapon'), 'Special weapon activation function must exist');
  assert.ok(source.includes('if(state.specialCooldown > 0) return false;'), 'Special must enforce cooldown gate');
  assert.ok(source.includes('state.specialCharge = 0;'), 'Special must consume full resource on activation');
  assert.ok(source.includes('state.specialCooldown = SPECIAL_COOLDOWN_FRAMES;'), 'Special must set cooldown on activation');
  assert.ok(source.includes('state.enemyShots = [];'), 'Special must clear hostile bullets as effect payload');
  assert.ok(source.includes('state.specialCharge = Math.min(state.specialChargeMax'), 'Special resource should recharge through combat events');
  assert.ok(source.includes('specialCharge: 0') && source.includes('specialCooldown: 0'), 'Special state should reset on fresh run');
  assert.ok(source.includes('primeSpecial') && source.includes('triggerSpecial'), 'Test hooks should expose deterministic special trigger controls');
  assert.ok(source.includes("X: EMP Pulse"), 'Controls copy must include special hotkey');
}

