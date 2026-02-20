import assert from 'node:assert/strict';
import vm from 'node:vm';

import { buildGame } from '../src/build/build-game.mjs';

export async function run(){
  const buildResult = await buildGame({ write: false });
  const source = buildResult.outputSource;

  assert.ok(source.includes('combat-intel-panel'), 'Bundle must include combat intel panel module id');
  assert.ok(source.includes('ab-intel-layout'), 'Bundle must include combat intel layout classes');
  assert.ok(source.includes('Hide Intel'), 'Bundle must include intel toggle button copy');
  assert.ok(source.includes('Player Types'), 'Bundle must include player types section');
  assert.ok(source.includes('Enemy Types'), 'Bundle must include enemy types section');
  assert.ok(source.includes('Weapon Types'), 'Bundle must include weapon types section');
  assert.ok(source.includes('Bullet Types'), 'Bundle must include bullet types section');
  assert.ok(source.includes('Explosion Types'), 'Bundle must include explosion types section');
  assert.match(
    source,
    /try\{\s*snapshot = hooks\.getState\(\);\s*\}catch\(e\)\{/m,
    'Combat intel live-board should guard early getState() calls'
  );
  assert.ok(
    source.includes('setTimeout(updateLiveBoard, 0);'),
    'Combat intel live-board should defer first snapshot update'
  );

  const script = new vm.Script(source, { filename: 'game01_astro_blaster-v2.js' });
  const sandbox = { console };
  vm.createContext(sandbox);
  script.runInContext(sandbox);

  assert.ok(sandbox.Game01, 'Expected Game01 to exist after generated bundle execution');
  assert.equal(typeof sandbox.Game01.getV2Manifest, 'function', 'Expected generated bundle to expose getV2Manifest');

  const manifest = sandbox.Game01.getV2Manifest();
  assert.ok(manifest.runtime && manifest.runtime.combatIntelPanel, 'Manifest must include combat intel runtime metadata');
  assert.ok(Array.isArray(manifest.combatIntelPanel.players), 'Manifest must include player intel entries');
  assert.ok(Array.isArray(manifest.combatIntelPanel.enemies), 'Manifest must include enemy intel entries');
  assert.ok(Array.isArray(manifest.combatIntelPanel.weapons), 'Manifest must include weapon intel entries');
  assert.ok(Array.isArray(manifest.combatIntelPanel.bullets), 'Manifest must include bullet intel entries');
  assert.ok(Array.isArray(manifest.combatIntelPanel.explosions), 'Manifest must include explosion intel entries');
  assert.ok(manifest.combatIntelPanelLayout, 'Manifest must include intel panel layout config');
  assert.equal(manifest.combatIntelPanelLayout.toggleHotkey, 'i', 'Intel panel hotkey should remain stable');
}
