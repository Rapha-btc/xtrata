import assert from 'node:assert/strict';
import vm from 'node:vm';

import { buildGame } from '../src/build/build-game.mjs';

function createRand(seed){
  let state = seed >>> 0;
  return function rand(){
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function createRandInt(rand){
  return function randInt(min, max){
    return min + Math.floor(rand() * (max - min + 1));
  };
}

async function loadGame(){
  const buildResult = await buildGame({ write: false });
  const script = new vm.Script(buildResult.outputSource, { filename: 'game01_astro_blaster-v2.js' });
  const sandbox = { console };
  vm.createContext(sandbox);
  script.runInContext(sandbox);
  return sandbox.Game01;
}

function captureShots(){
  const shots = [];
  return {
    shots,
    spawnEnemyShot(x, y, vx, vy, w, h, color){
      shots.push({ x, y, vx, vy, w, h, color });
    }
  };
}

export async function run(){
  const game = await loadGame();
  const hooks = game.__astroV2RuntimeHooks;
  assert.ok(hooks && hooks.enemyCombat, 'Expected enemy combat runtime hook');

  const runtime = hooks.enemyCombat;
  assert.equal(typeof runtime.fireEnemy, 'function');
  assert.equal(typeof runtime.updateEnemy, 'function');

  const baseState = {
    tick: 100,
    player: { x: 200, y: 520, w: 32, h: 32 }
  };

  {
    const { shots, spawnEnemyShot } = captureShots();
    const handled = runtime.fireEnemy({
      enemy: { x: 100, y: 100, w: 20, h: 20, fireMode: 'single', bulletSpeed: 3.5 },
      state: baseState,
      spawnEnemyShot
    });
    assert.equal(handled, true);
    assert.equal(shots.length, 1);
    assert.equal(shots[0].vy, 3.5);
  }

  {
    const { shots, spawnEnemyShot } = captureShots();
    runtime.fireEnemy({
      enemy: { x: 100, y: 100, w: 20, h: 20, fireMode: 'spread', bulletSpeed: 4 },
      state: baseState,
      spawnEnemyShot
    });
    assert.equal(shots.length, 2);
  }

  {
    const { shots, spawnEnemyShot } = captureShots();
    runtime.fireEnemy({
      enemy: { x: 100, y: 100, w: 20, h: 20, fireMode: 'burst', bulletSpeed: 3.2 },
      state: baseState,
      spawnEnemyShot
    });
    assert.equal(shots.length, 3);
    assert.equal(shots[1].vy, 3.7);
  }

  {
    const { shots, spawnEnemyShot } = captureShots();
    runtime.fireEnemy({
      enemy: { x: 100, y: 100, w: 20, h: 20, fireMode: 'fan', bulletSpeed: 2.5 },
      state: baseState,
      spawnEnemyShot
    });
    assert.equal(shots.length, 5);
  }

  {
    const { shots, spawnEnemyShot } = captureShots();
    runtime.fireEnemy({
      enemy: { x: 100, y: 100, w: 20, h: 20, fireMode: 'aim', bulletSpeed: 4 },
      state: baseState,
      spawnEnemyShot
    });
    assert.equal(shots.length, 1);
    const aimSpeed = Math.hypot(shots[0].vx, shots[0].vy);
    assert.ok(Math.abs(aimSpeed - 4) < 1e-9, 'Aim shot should preserve bullet speed magnitude');
  }

  {
    const enemy = {
      motion: 'march',
      age: 0,
      diving: false,
      diveDelay: 40,
      x: 1,
      y: 10,
      w: 22,
      h: 22,
      speed: 1.2,
      dir: -1,
      phase: 0,
      fireCooldown: 30,
      fireRate: 120,
      bulletSpeed: 3
    };
    const rand = createRand(111);
    const randInt = createRandInt(rand);

    const alive = runtime.updateEnemy({
      enemy,
      state: baseState,
      width: 480,
      height: 600,
      rand,
      randInt,
      clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
      fireEnemy: () => {}
    });
    assert.equal(alive, true);
    assert.equal(enemy.age, 1);
    assert.equal(enemy.y > 10, true);
    assert.equal(enemy.dir, 1);
  }

  {
    const enemy = {
      motion: 'dive',
      age: 0,
      diving: true,
      diveDelay: 0,
      x: 100,
      y: 800,
      w: 20,
      h: 20,
      speed: 1.1,
      dir: 1,
      phase: 1,
      fireCooldown: 10,
      fireRate: 100,
      bulletSpeed: 3.4,
      vx: 2,
      vy: 4
    };
    const rand = createRand(222);
    const randInt = createRandInt(rand);

    runtime.updateEnemy({
      enemy,
      state: baseState,
      width: 480,
      height: 600,
      rand,
      randInt,
      clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
      fireEnemy: () => {}
    });

    assert.equal(enemy.diving, false);
    assert.equal(enemy.vx, 0);
    assert.equal(enemy.vy, 0);
    assert.equal(enemy.y < 0, true);
    assert.equal(enemy.fireCooldown, 49);
    assert.equal(enemy.x >= 16 && enemy.x <= (480 - enemy.w - 16), true);
  }

  {
    let fireCalls = 0;
    const enemy = {
      motion: 'sway',
      age: 5,
      diving: false,
      diveDelay: 0,
      x: 200,
      y: 200,
      w: 22,
      h: 22,
      speed: 1,
      dir: 1,
      phase: 0,
      fireCooldown: 0,
      fireRate: 90,
      bulletSpeed: 2.8
    };
    const rand = createRand(333);
    const randInt = () => 12;

    runtime.updateEnemy({
      enemy,
      state: baseState,
      width: 480,
      height: 600,
      rand,
      randInt,
      clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
      fireEnemy: () => { fireCalls += 1; }
    });

    assert.equal(fireCalls, 1);
    assert.equal(enemy.fireCooldown, 102);
  }
}
