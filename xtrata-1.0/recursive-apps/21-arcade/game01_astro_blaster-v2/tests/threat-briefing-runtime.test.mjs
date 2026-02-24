import assert from 'node:assert/strict';
import vm from 'node:vm';

import { buildGame } from '../src/build/build-game.mjs';

export async function run(){
  const buildResult = await buildGame({ write: false });
  const source = buildResult.outputSource;

  assert.ok(source.includes('threat-briefing-runtime'), 'Bundle must include threat briefing runtime module id');
  assert.ok(source.includes('ab-threat-briefing'), 'Bundle must include threat briefing overlay class');
  assert.ok(source.includes('pointer-events:none'), 'Threat briefing overlay must be non-blocking');
  assert.ok(source.includes('summarizeWaveThreat'), 'Bundle must include wave threat summarizer');
  assert.ok(source.includes('wrapWaveBuilder'), 'Bundle must wrap wave builder to capture previews');
  assert.ok(source.includes('__astroIntelPanel.overlayHost'), 'Threat runtime should prefer intel panel feed host when present');
  assert.ok(source.includes('ab-intel-feed-host .ab-threat-briefing'), 'Threat runtime should include left-column feed styling');
  assert.ok(source.includes('Threat Scan'), 'Bundle must include threat scan header copy');
  assert.ok(source.includes('Enemy signatures unresolved'), 'Bundle must include fallback copy');

  const script = new vm.Script(source, { filename: 'game01_astro_blaster-v2.js' });
  const sandbox = { console };
  vm.createContext(sandbox);
  script.runInContext(sandbox);

  assert.ok(sandbox.Game01, 'Expected Game01 to exist after generated bundle execution');
  assert.equal(typeof sandbox.Game01.getV2Manifest, 'function', 'Expected generated bundle to expose getV2Manifest');

  const manifest = sandbox.Game01.getV2Manifest();
  assert.ok(manifest.runtime && manifest.runtime.threatBriefing, 'Manifest must include threat briefing runtime metadata');
  assert.equal(manifest.runtime.threatBriefing.style, 'non-blocking-overlay');
  assert.ok(manifest.threatBriefingConfig, 'Manifest must include threat briefing config');
  assert.equal(manifest.threatBriefingConfig.maxTypesShown, 3);
}
