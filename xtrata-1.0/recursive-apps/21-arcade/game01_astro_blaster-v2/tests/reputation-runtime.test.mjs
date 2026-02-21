import assert from 'node:assert/strict';
import vm from 'node:vm';

import { buildGame } from '../src/build/build-game.mjs';

export async function run(){
  const buildResult = await buildGame({ write: false });
  const source = buildResult.outputSource;

  assert.ok(source.includes('reputation-runtime'), 'Bundle must include reputation runtime module id');
  assert.ok(source.includes('collectNarrativeSignals'), 'Bundle must include reputation signal collector');
  assert.ok(source.includes('__astroNarrativeExternalQueue'), 'Bundle must include narrative external queue bridge');
  assert.ok(source.includes('evaluateProfile'), 'Bundle must include reputation profile evaluator');

  const script = new vm.Script(source, { filename: 'game01_astro_blaster-v2.js' });
  const sandbox = { console };
  vm.createContext(sandbox);
  script.runInContext(sandbox);

  assert.ok(sandbox.Game01, 'Expected Game01 to exist after generated bundle execution');
  const hooks = sandbox.Game01.__astroV2RuntimeHooks;
  assert.ok(hooks && hooks.reputation, 'Expected reputation runtime hook registration');

  const runtime = hooks.reputation;
  assert.equal(runtime.evaluateProfile({ level: 4, wave: 4, lives: 3, score: 4200 }), 'ace');
  assert.equal(runtime.evaluateProfile({ level: 4, wave: 4, lives: 1, score: 1200 }), 'brink');
  assert.equal(runtime.evaluateProfile({ level: 3, wave: 3, lives: 5, score: 1200 }), 'vanguard');
  assert.equal(runtime.evaluateProfile({ level: 1, wave: 1, lives: 3, score: 100 }), 'steady');

  const state = { seen: {}, lastProfileId: '' };
  const firstSignals = runtime.collectNarrativeSignals({
    state,
    snapshot: { level: 4, wave: 4, lives: 3, score: 4200 }
  });
  assert.ok(firstSignals.length >= 2, 'Expected profile switch and threshold signals on first ace evaluation');
  assert.ok(firstSignals.some((entry) => String(entry.key).indexOf('reputation-profile-switch:ace') >= 0));
  assert.ok(firstSignals.some((entry) => String(entry.key).indexOf('reputation-threshold:ace') >= 0));

  const repeatedSignals = runtime.collectNarrativeSignals({
    state,
    snapshot: { level: 4, wave: 4, lives: 3, score: 4200 }
  });
  assert.equal(repeatedSignals.length, 0, 'Expected deterministic one-time trigger behavior on repeated snapshot');

  const brinkSignals = runtime.collectNarrativeSignals({
    state,
    snapshot: { level: 6, wave: 6, lives: 1, score: 1800 }
  });
  assert.ok(brinkSignals.some((entry) => String(entry.key).indexOf('reputation-profile-switch:brink') >= 0));
  assert.ok(brinkSignals.some((entry) => String(entry.key).indexOf('reputation-threshold:brink') >= 0));

  const manifest = sandbox.Game01.getV2Manifest();
  assert.ok(manifest.runtime && manifest.runtime.reputation, 'Manifest must include reputation runtime metadata');
  assert.ok(Array.isArray(manifest.reputationProfiles), 'Manifest must include reputation profiles');
  assert.ok(manifest.reputationProfiles.some((entry) => entry.id === 'ace'), 'Manifest should include ace reputation profile');
}
