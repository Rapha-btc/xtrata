import assert from 'node:assert/strict';
import vm from 'node:vm';

import { buildGame } from '../src/build/build-game.mjs';

export async function run(){
  const buildResult = await buildGame({ write: false });
  const source = buildResult.outputSource;

  assert.ok(source.includes('narrative-runtime'), 'Bundle must include narrative runtime module id');
  assert.ok(source.includes('ab-narrative-overlay'), 'Bundle must include narrative overlay class');
  assert.ok(source.includes('pointer-events:none'), 'Narrative overlay must be non-blocking');
  assert.ok(source.includes('queueSectorIntro'), 'Bundle must include sector intro trigger logic');
  assert.ok(source.includes('queueSectorTransmissions'), 'Bundle must include sector transmission logic');
  assert.ok(source.includes('queueGlobalTransmissions'), 'Bundle must include global transmission logic');
  assert.ok(source.includes('queueExternalTransmissions'), 'Bundle must include external transmission queue integration');
  assert.ok(source.includes('__astroIntelPanel.overlayHost'), 'Narrative runtime should prefer intel panel feed host when present');
  assert.ok(source.includes('ab-intel-feed-host .ab-narrative-overlay'), 'Narrative runtime should include left-column feed styling');
  assert.match(
    source,
    /try\{\s*snapshot = hooks\.getState\(\);\s*\}catch\(e\)\{/m,
    'Narrative runtime should guard getState() polling'
  );

  const script = new vm.Script(source, { filename: 'game01_astro_blaster-v2.js' });
  const sandbox = { console };
  vm.createContext(sandbox);
  script.runInContext(sandbox);

  assert.ok(sandbox.Game01, 'Expected Game01 to exist after generated bundle execution');
  assert.equal(typeof sandbox.Game01.getV2Manifest, 'function', 'Expected generated bundle to expose getV2Manifest');

  const manifest = sandbox.Game01.getV2Manifest();
  assert.ok(manifest.runtime && manifest.runtime.narrative, 'Manifest must include narrative runtime metadata');
  assert.equal(manifest.runtime.narrative.style, 'non-blocking-overlay');
  assert.ok(Array.isArray(manifest.narrative), 'Manifest must include narrative sector briefings');
  assert.ok(manifest.narrative.some((entry) => entry.id === 'perimeter'), 'Manifest should include perimeter briefing');
  assert.ok(Array.isArray(manifest.narrativeGlobalTransmissions), 'Manifest must include global transmissions');
}
