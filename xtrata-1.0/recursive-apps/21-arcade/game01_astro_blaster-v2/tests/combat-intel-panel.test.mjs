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
  assert.ok(source.includes('Upgrade Patterns'), 'Bundle must include upgrade patterns section');
  assert.ok(source.includes('Drops & Crates'), 'Bundle must include drops/crates section');
  assert.ok(source.includes('Bullet Types'), 'Bundle must include bullet types section');
  assert.ok(source.includes('Explosion Types'), 'Bundle must include explosion types section');
  assert.ok(source.includes('Supply Cache'), 'Bundle must include reward drop intel entry');
  assert.ok(source.includes('False Salvage Beacon'), 'Bundle must include hazard drop intel entry');
  assert.ok(source.includes('Mission Feed'), 'Bundle must include left-column mission feed heading');
  assert.ok(source.includes('ab-intel-feed-host'), 'Bundle must include left-column mission feed host class');
  assert.ok(source.includes("shield: row('Shield')"), 'Bundle must include live shield row in intel board');
  assert.ok(source.includes("special: row('Special')"), 'Bundle must include live special row in intel board');
  assert.ok(source.includes("hazard: row('Hazard')"), 'Bundle must include live hazard row in intel board');
  assert.ok(source.includes("path: row('Path')"), 'Bundle must include live archetype path row in intel board');
  assert.ok(source.includes('ab-intel-preview-canvas'), 'Bundle must include canvas tile preview styling');
  assert.ok(source.includes('is-team-player'), 'Bundle must include player-team tint class for intel swatches');
  assert.ok(source.includes('is-team-enemy'), 'Bundle must include enemy-team tint class for intel swatches');
  assert.ok(source.includes('sectionTeams'), 'Bundle must include section team mapping for intel swatches');
  assert.ok(source.includes('renderIntelPreview'), 'Bundle must render tile previews via gameplay runtime hook');
  assert.ok(source.includes('updatePreviewTiles'), 'Bundle must include animated preview tile update loop');
  assert.ok(source.includes('single-lance'), 'Bundle must include bullet visual metadata');
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
