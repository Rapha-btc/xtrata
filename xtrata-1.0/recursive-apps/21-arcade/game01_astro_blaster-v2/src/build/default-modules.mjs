import { metadataModule } from '../modules/metadata.module.mjs';
import { modesModule } from '../modules/modes.module.mjs';
import { upgradesModule } from '../modules/upgrades.module.mjs';
import { rewardsHazardsRuntimeModule } from '../modules/rewards-hazards-runtime.module.mjs';
import { waveProgressionRuntimeModule } from '../modules/wave-progression-runtime.module.mjs';
import { enemyCombatRuntimeModule } from '../modules/enemy-combat-runtime.module.mjs';
import { powerupsRuntimeModule } from '../modules/powerups-runtime.module.mjs';
import { combatIntelPanelModule } from '../modules/combat-intel-panel.module.mjs';
import { maintenanceModule } from '../modules/maintenance.module.mjs';

export const defaultModules = Object.freeze([
  metadataModule,
  modesModule,
  upgradesModule,
  rewardsHazardsRuntimeModule,
  waveProgressionRuntimeModule,
  enemyCombatRuntimeModule,
  powerupsRuntimeModule,
  combatIntelPanelModule,
  maintenanceModule
]);
