import { upgradeCatalog } from '../catalogs/upgrades.mjs';
import { rewardCatalog } from '../catalogs/rewards.mjs';
import { hazardCatalog } from '../catalogs/hazards.mjs';
import { cloneSerializable } from '../framework/clone-serializable.mjs';

export const upgradesModule = {
  id: 'upgrades-rewards-hazards',
  priority: 30,
  description: 'Injects expanded upgrade, reward, and negative-box catalogs.',
  apply(artifact){
    artifact.runtimePatch.upgrades = cloneSerializable(upgradeCatalog);
    artifact.runtimePatch.rewards = cloneSerializable(rewardCatalog);
    artifact.runtimePatch.hazards = cloneSerializable(hazardCatalog);
    return artifact;
  }
};
