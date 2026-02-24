import assert from 'node:assert/strict';

import { gameModesCatalog } from '../src/catalogs/game-modes.mjs';
import { upgradeCatalog } from '../src/catalogs/upgrades.mjs';
import { rewardCatalog } from '../src/catalogs/rewards.mjs';
import { hazardCatalog } from '../src/catalogs/hazards.mjs';
import { sectorBriefingsCatalog } from '../src/catalogs/sector-briefings.mjs';
import { reputationProfileCatalog } from '../src/catalogs/reputation-profiles.mjs';

function assertUniqueIds(items, label){
  const seen = new Set();
  for(const item of items){
    assert.ok(item.id, `${label} entry is missing id`);
    assert.ok(!seen.has(item.id), `${label} has duplicate id: ${item.id}`);
    seen.add(item.id);
  }
}

export async function run(){
  assert.ok(gameModesCatalog.length >= 4, 'Expected at least four game modes');
  assertUniqueIds(gameModesCatalog, 'gameModesCatalog');

  assert.ok(upgradeCatalog.length >= 8, 'Expected expanded upgrade catalog');
  assertUniqueIds(upgradeCatalog, 'upgradeCatalog');
  assert.ok(upgradeCatalog.some((entry) => entry.category === 'defense'), 'Missing defense upgrades');
  assert.ok(upgradeCatalog.some((entry) => entry.category === 'autonomous_clone'), 'Missing autonomous clone upgrades');

  assert.ok(rewardCatalog.length >= 4, 'Expected expanded reward catalog');
  assertUniqueIds(rewardCatalog, 'rewardCatalog');
  assert.ok(rewardCatalog.some((entry) => entry.id === 'reward_aegis_shell'), 'Expected Aegis shield reward catalog entry');

  assert.ok(hazardCatalog.length >= 4, 'Expected negative/red-herring hazard catalog');
  assertUniqueIds(hazardCatalog, 'hazardCatalog');
  assert.ok(hazardCatalog.some((entry) => entry.type === 'negative_box'), 'Missing negative-box hazards');

  assert.ok(sectorBriefingsCatalog.length >= 5, 'Expected sector briefing catalog coverage');
  assertUniqueIds(sectorBriefingsCatalog, 'sectorBriefingsCatalog');
  assert.ok(
    sectorBriefingsCatalog.every((entry) => Array.isArray(entry.transmissions) && entry.transmissions.length >= 2),
    'Each sector briefing must define at least two transmissions'
  );

  assert.ok(reputationProfileCatalog.length >= 4, 'Expected reputation profile coverage');
  assertUniqueIds(reputationProfileCatalog, 'reputationProfileCatalog');
  assert.ok(
    reputationProfileCatalog.every((entry) => Array.isArray(entry.transmissions) && entry.transmissions.length >= 2),
    'Each reputation profile must define at least two transmissions'
  );
}
