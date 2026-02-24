import assert from 'node:assert/strict';
import vm from 'node:vm';

import { buildGame } from '../src/build/build-game.mjs';

const ENEMY_TYPES = Object.freeze({
  scout: { unlock: 1, cost: 1, baseWeight: 8, w: 22, h: 22, baseHp: 1, baseSpeed: 1.0, baseScore: 70, fireRate: 180, bulletSpeed: 3.2, motion: 'sway', fireMode: 'single', color: '#ff5b6e' },
  zigzag: { unlock: 4, cost: 2, baseWeight: 5, w: 24, h: 24, baseHp: 2, baseSpeed: 1.05, baseScore: 120, fireRate: 190, bulletSpeed: 3.5, motion: 'zigzag', fireMode: 'spread', color: '#ff3fa2' },
  tank: { unlock: 8, cost: 4, baseWeight: 3, w: 34, h: 30, baseHp: 4, baseSpeed: 0.78, baseScore: 260, fireRate: 250, bulletSpeed: 2.9, motion: 'march', fireMode: 'burst', color: '#ff9f40' },
  sniper: { unlock: 12, cost: 3, baseWeight: 3, w: 22, h: 22, baseHp: 2, baseSpeed: 0.88, baseScore: 210, fireRate: 145, bulletSpeed: 4.8, motion: 'hover', fireMode: 'aim', color: '#b28cff' },
  dive: { unlock: 18, cost: 2, baseWeight: 2, w: 20, h: 20, baseHp: 1, baseSpeed: 1.35, baseScore: 180, fireRate: 9999, bulletSpeed: 0, motion: 'dive', fireMode: 'none', color: '#ffe066' },
  carrier: { unlock: 30, cost: 6, baseWeight: 1, w: 52, h: 36, baseHp: 9, baseSpeed: 0.6, baseScore: 620, fireRate: 180, bulletSpeed: 2.5, motion: 'march', fireMode: 'fan', color: '#ff4de3' }
});

const SECTOR_THEMES = Object.freeze([
  { id: 'perimeter', name: 'Perimeter Drift', formations: ['line', 'stagger'], enemyWeights: { scout: 1.35, zigzag: 0.85, sniper: 0.7 }, speedMul: 0.95, fireMul: 0.92, hpMul: 0.94, dropBonus: 0.02, forcedType: 'scout', budgetBonus: 0 },
  { id: 'ion', name: 'Ion Storm', formations: ['stagger', 'swarm', 'vee'], enemyWeights: { zigzag: 1.4, sniper: 1.12, scout: 0.82 }, speedMul: 1.07, fireMul: 1.08, hpMul: 0.95, dropBonus: 0, forcedType: 'zigzag', budgetBonus: 1 },
  { id: 'bulwark', name: 'Bulwark Ring', formations: ['columns', 'line', 'ring'], enemyWeights: { tank: 1.45, carrier: 1.1, scout: 0.72, dive: 0.7 }, speedMul: 0.93, fireMul: 0.96, hpMul: 1.2, dropBonus: -0.015, forcedType: 'tank', budgetBonus: 2 },
  { id: 'sniper', name: 'Sniper Alley', formations: ['vee', 'columns'], enemyWeights: { sniper: 1.55, scout: 0.85, tank: 0.92 }, speedMul: 1.02, fireMul: 1.24, hpMul: 0.95, dropBonus: -0.005, forcedType: 'sniper', budgetBonus: 1 },
  { id: 'dive', name: 'Dive Corridor', formations: ['swarm', 'vee'], enemyWeights: { dive: 1.75, zigzag: 1.15, tank: 0.8 }, speedMul: 1.12, fireMul: 1.01, hpMul: 0.96, dropBonus: 0.01, forcedType: 'dive', budgetBonus: 1 },
  { id: 'siege', name: 'Carrier Siege', formations: ['ring', 'columns'], enemyWeights: { carrier: 1.85, tank: 1.28, sniper: 1.12, scout: 0.7 }, speedMul: 0.98, fireMul: 1.16, hpMul: 1.2, dropBonus: -0.01, forcedType: 'carrier', budgetBonus: 3 }
]);

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

function buildWave(runtime, level, seed){
  const rand = createRand(seed);
  const randInt = createRandInt(rand);
  return runtime.buildWaveSpec({
    level,
    width: 480,
    maxCampaignLevel: 120,
    enemyTypes: ENEMY_TYPES,
    sectorThemes: SECTOR_THEMES,
    rand,
    randInt
  });
}

export async function run(){
  const game = await loadGame();
  const hooks = game.__astroV2RuntimeHooks;
  assert.ok(hooks && hooks.waveProgression, 'Expected wave progression runtime hook');

  const runtime = hooks.waveProgression;
  assert.equal(typeof runtime.buildWaveSpec, 'function');
  assert.equal(typeof runtime.getLevelProfile, 'function');

  const levelOneA = buildWave(runtime, 1, 1337);
  const levelOneB = buildWave(runtime, 1, 1337);
  assert.deepEqual(levelOneA, levelOneB, 'Wave build should be deterministic for same seed and level');
  assert.ok(levelOneA.enemies.length > 0, 'Expected at least one enemy in first wave');
  assert.ok(levelOneA.label.includes('Sector 1 -'), 'Expected sector label in wave output');
  assert.equal(levelOneA.profile.level, 1);
  assert.equal(levelOneA.profile.overflow, 0);

  const eliteWave = buildWave(runtime, 15, 42);
  const eliteTypes = new Set(eliteWave.enemies.map((enemy) => enemy.type));
  assert.ok(eliteWave.label.includes('Elite Surge'), 'Expected elite label at level 15');
  assert.equal(eliteTypes.has('carrier'), true, 'Expected forced carrier inclusion at level 15');
  assert.equal(eliteTypes.has('tank'), true, 'Expected forced tank inclusion at level 15');
  assert.equal(eliteTypes.has('sniper'), true, 'Expected forced sniper inclusion at level 15');

  const overdriveWave = buildWave(runtime, 130, 2026);
  assert.ok(overdriveWave.label.startsWith('Overdrive '), 'Expected overdrive label beyond campaign max');
  assert.equal(overdriveWave.profile.overflow, 10);
}
