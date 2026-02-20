import assert from 'node:assert/strict';
import vm from 'node:vm';

import {
  SOURCE_GAME_PATH,
  OUTPUT_GAME_PATH,
  buildGame,
  extractLegacyIifeBody,
  readLegacySource
} from '../src/build/build-game.mjs';

export async function run(){
  const source = await readLegacySource();
  const body = extractLegacyIifeBody(source);
  assert.ok(body.includes('shared.highScores.maybeSubmit'), 'Legacy guarded score submit call must remain');

  const buildResult = await buildGame({ write: false });
  assert.equal(buildResult.outputPath, OUTPUT_GAME_PATH);
  assert.ok(buildResult.outputSource.includes('var Game01 = (function(){'), 'Bundle must define Game01');
  assert.ok(buildResult.outputSource.includes('game.__astroV2 = cloneSerializable(runtimePatch);'), 'Bundle must inject v2 runtime patch');
  assert.ok(buildResult.outputSource.includes('setV2RuntimeHooks'), 'Bundle must expose runtime hook setter');
  assert.ok(buildResult.outputSource.includes('rewards-hazards-runtime-hooks'), 'Bundle must include rewards/hazards runtime module');
  assert.ok(buildResult.outputSource.includes('wave-progression-runtime-hooks'), 'Bundle must include wave progression runtime module');
  assert.ok(buildResult.outputSource.includes('enemy-combat-runtime-hooks'), 'Bundle must include enemy combat runtime module');
  assert.ok(buildResult.outputSource.includes('powerups-runtime-hooks'), 'Bundle must include powerups runtime module');
  assert.ok(buildResult.outputSource.includes('combat-intel-panel'), 'Bundle must include combat intel panel module');
  assert.ok(buildResult.outputSource.includes('autonomous_clone'), 'Bundle must include clone upgrade data');

  const script = new vm.Script(buildResult.outputSource, { filename: 'game01_astro_blaster-v2.js' });
  const sandbox = { console };
  vm.createContext(sandbox);
  script.runInContext(sandbox);

  assert.ok(sandbox.Game01, 'Expected Game01 on sandbox global after bundle execute');
  assert.equal(sandbox.Game01.id, 'astro_blaster', 'Game id invariant changed');
  assert.equal(sandbox.Game01.scoreMode, 'score', 'Score mode invariant changed');
  assert.equal(typeof sandbox.Game01.getV2Manifest, 'function', 'Expected v2 manifest accessor');

  const manifest = sandbox.Game01.getV2Manifest();
  assert.ok(Array.isArray(manifest.upgrades), 'Expected upgrade catalog on runtime manifest');
  assert.ok(Array.isArray(manifest.gameModes), 'Expected mode catalog on runtime manifest');
  assert.ok(manifest.runtime && manifest.runtime.powerups, 'Expected runtime powerups metadata');
  assert.ok(manifest.runtime && manifest.runtime.rewardsHazards, 'Expected runtime rewards/hazards metadata');
  assert.ok(manifest.runtime && manifest.runtime.waveProgression, 'Expected runtime wave progression metadata');
  assert.ok(manifest.runtime && manifest.runtime.enemyCombat, 'Expected runtime enemy combat metadata');
  assert.ok(manifest.runtime && manifest.runtime.combatIntelPanel, 'Expected runtime combat intel panel metadata');
  assert.equal(manifest.runtime.rewardsHazards.hazardChance, 0.08, 'Expected low non-zero hazard chance');
  assert.ok(Array.isArray(manifest.combatIntelPanel.players), 'Expected combat intel player catalog');
  assert.ok(
    sandbox.Game01.__astroV2RuntimeHooks &&
      sandbox.Game01.__astroV2RuntimeHooks.powerups &&
      sandbox.Game01.__astroV2RuntimeHooks.rewardsHazards &&
      sandbox.Game01.__astroV2RuntimeHooks.waveProgression &&
      sandbox.Game01.__astroV2RuntimeHooks.enemyCombat,
    'Expected runtime hook registration for powerups, rewards/hazards, wave progression, and enemy combat'
  );
  assert.ok(buildResult.outputSource.includes('WEAPON JAM'), 'Expected visible jam HUD indicator');
  assert.ok(buildResult.outputSource.includes('state.weaponJamTimer'), 'Expected weapon jam timer state integration');

  assert.equal(
    SOURCE_GAME_PATH.endsWith('recursive-apps/21-arcade/game01_astro_blaster-v2/src/legacy/game01_astro_blaster.legacy.js'),
    true
  );
}
