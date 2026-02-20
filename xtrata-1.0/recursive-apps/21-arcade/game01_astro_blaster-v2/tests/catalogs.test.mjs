import assert from 'node:assert/strict';

import { gameModesCatalog } from '../src/catalogs/game-modes.mjs';
import { upgradeCatalog } from '../src/catalogs/upgrades.mjs';
import { rewardCatalog } from '../src/catalogs/rewards.mjs';
import { hazardCatalog } from '../src/catalogs/hazards.mjs';

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

  assert.ok(hazardCatalog.length >= 4, 'Expected negative/red-herring hazard catalog');
  assertUniqueIds(hazardCatalog, 'hazardCatalog');
  assert.ok(hazardCatalog.some((entry) => entry.type === 'negative_box'), 'Missing negative-box hazards');
}
