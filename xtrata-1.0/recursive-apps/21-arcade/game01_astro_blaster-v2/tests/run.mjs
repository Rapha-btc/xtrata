import { run as runModuleRegistry } from './module-registry.test.mjs';
import { run as runCatalogs } from './catalogs.test.mjs';
import { run as runBuildGame } from './build-game.test.mjs';
import { run as runPowerupsRuntime } from './powerups-runtime.test.mjs';
import { run as runRewardsHazardsRuntime } from './rewards-hazards-runtime.test.mjs';
import { run as runWaveProgressionRuntime } from './wave-progression-runtime.test.mjs';
import { run as runEnemyCombatRuntime } from './enemy-combat-runtime.test.mjs';
import { run as runCombatIntelPanel } from './combat-intel-panel.test.mjs';
import { run as runNarrativeRuntime } from './narrative-runtime.test.mjs';
import { run as runThreatBriefingRuntime } from './threat-briefing-runtime.test.mjs';
import { run as runReputationRuntime } from './reputation-runtime.test.mjs';
import { run as runSpecialWeaponRuntime } from './special-weapon-runtime.test.mjs';

const suites = [
  { name: 'module-registry', fn: runModuleRegistry },
  { name: 'catalogs', fn: runCatalogs },
  { name: 'build-game', fn: runBuildGame },
  { name: 'powerups-runtime', fn: runPowerupsRuntime },
  { name: 'rewards-hazards-runtime', fn: runRewardsHazardsRuntime },
  { name: 'wave-progression-runtime', fn: runWaveProgressionRuntime },
  { name: 'enemy-combat-runtime', fn: runEnemyCombatRuntime },
  { name: 'combat-intel-panel', fn: runCombatIntelPanel },
  { name: 'narrative-runtime', fn: runNarrativeRuntime },
  { name: 'threat-briefing-runtime', fn: runThreatBriefingRuntime },
  { name: 'reputation-runtime', fn: runReputationRuntime },
  { name: 'special-weapon-runtime', fn: runSpecialWeaponRuntime }
];

async function main(){
  let failed = 0;

  for(const suite of suites){
    try{
      await suite.fn();
      console.log(`[astro-v2:test] PASS ${suite.name}`);
    } catch (error){
      failed += 1;
      console.error(`[astro-v2:test] FAIL ${suite.name}`);
      console.error(error);
    }
  }

  if(failed > 0){
    console.error(`[astro-v2:test] ${failed} suite(s) failed`);
    process.exitCode = 1;
    return;
  }

  console.log(`[astro-v2:test] ${suites.length} suite(s) passed`);
}

main();
