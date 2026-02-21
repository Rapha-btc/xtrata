import assert from 'node:assert/strict';
import vm from 'node:vm';

import {
  SOURCE_GAME_PATH,
  OUTPUT_GAME_PATH,
  buildGame,
  extractLegacyIifeBody,
  readLegacySource
} from '../src/build/build-game.mjs';

export async function run(){
  const source = await readLegacySource();
  const body = extractLegacyIifeBody(source);
  assert.ok(body.includes('shared.highScores.maybeSubmit'), 'Legacy guarded score submit call must remain');

  const buildResult = await buildGame({ write: false });
  assert.equal(buildResult.outputPath, OUTPUT_GAME_PATH);
  assert.ok(buildResult.outputSource.includes('var Game01 = (function(){'), 'Bundle must define Game01');
  assert.ok(buildResult.outputSource.includes('game.__astroV2 = cloneSerializable(runtimePatch);'), 'Bundle must inject v2 runtime patch');
  assert.ok(buildResult.outputSource.includes('setV2RuntimeHooks'), 'Bundle must expose runtime hook setter');
  assert.ok(buildResult.outputSource.includes('rewards-hazards-runtime-hooks'), 'Bundle must include rewards/hazards runtime module');
  assert.ok(buildResult.outputSource.includes('wave-progression-runtime-hooks'), 'Bundle must include wave progression runtime module');
  assert.ok(buildResult.outputSource.includes('enemy-combat-runtime-hooks'), 'Bundle must include enemy combat runtime module');
  assert.ok(buildResult.outputSource.includes('powerups-runtime-hooks'), 'Bundle must include powerups runtime module');
  assert.ok(buildResult.outputSource.includes('threat-briefing-runtime'), 'Bundle must include threat briefing runtime module');
  assert.ok(buildResult.outputSource.includes('combat-intel-panel'), 'Bundle must include combat intel panel module');
  assert.ok(buildResult.outputSource.includes('narrative-runtime'), 'Bundle must include narrative runtime module');
  assert.ok(buildResult.outputSource.includes('reputation-runtime'), 'Bundle must include reputation runtime module');
  assert.ok(buildResult.outputSource.includes('autonomous_clone'), 'Bundle must include clone upgrade data');
  assert.ok(buildResult.outputSource.includes('reward_thruster_module'), 'Bundle must include thruster reward catalog entry');
  assert.ok(buildResult.outputSource.includes('reward_weapon_multiplier'), 'Bundle must include weapon multiplier reward catalog entry');
  assert.ok(buildResult.outputSource.includes('reward_aegis_shell'), 'Bundle must include aegis shield reward catalog entry');
  assert.ok(buildResult.outputSource.includes('pickupType: shieldType'), 'Bundle must include shield pickup drop resolution');
  assert.ok(buildResult.outputSource.includes('state.shieldCharges > 0') && buildResult.outputSource.includes('state.shieldTimer > 0'), 'Bundle must include active shield damage interception logic');
  assert.ok(
    buildResult.outputSource.includes('shieldCanIntercept') &&
      buildResult.outputSource.includes('shieldArcHalfAngle') &&
      buildResult.outputSource.includes('setShieldFacingFromInput'),
    'Bundle must include directional shield arc logic and facing updates'
  );
  assert.ok(buildResult.outputSource.includes('applyHazardRadialShots'), 'Bundle must include radial hazard shot application helper');
  assert.ok(buildResult.outputSource.includes('hazardSlowTimer') && buildResult.outputSource.includes('hazardReinforcementTimer'), 'Bundle must include hazard slow/ambush runtime state wiring');
  assert.ok(buildResult.outputSource.includes('spawnHazardReinforcements'), 'Bundle must include hazard reinforcement spawn path');
  assert.ok(buildResult.outputSource.includes('handleArchetypeProgress') && buildResult.outputSource.includes('maybeLockArchetype'), 'Bundle must include branch-lock archetype progression helpers');
  assert.ok(buildResult.outputSource.includes('upgradeArchetype'), 'Bundle must surface upgrade archetype state');
  assert.ok(buildResult.outputSource.includes('Build Path Locked'), 'Bundle must emit branch-lock narrative event');
  assert.ok(buildResult.outputSource.includes('activateSpecialWeapon'), 'Bundle must include special weapon activation logic');
  assert.ok(buildResult.outputSource.includes('state.specialCooldown > 0') && buildResult.outputSource.includes('state.specialCharge = 0'), 'Bundle must include special cooldown and resource spend logic');
  assert.ok(buildResult.outputSource.includes("X: EMP Pulse"), 'Bundle controls copy must advertise EMP special hotkey');
  assert.ok(!buildResult.outputSource.includes('AUTO-FIRE ONLINE'), 'Gameplay overlay upgrade banners should be removed from canvas');
  assert.ok(!buildResult.outputSource.includes('VERTICAL THRUSTERS ONLINE'), 'Gameplay overlay upgrade banners should be removed from canvas');
  assert.ok(!buildResult.outputSource.includes('Press P or use the Pause button to resume'), 'Legacy pause button copy should be removed');

  const script = new vm.Script(buildResult.outputSource, { filename: 'game01_astro_blaster-v2.js' });
  const sandbox = { console };
  vm.createContext(sandbox);
  script.runInContext(sandbox);

  assert.ok(sandbox.Game01, 'Expected Game01 on sandbox global after bundle execute');
  assert.equal(sandbox.Game01.id, 'astro_blaster', 'Game id invariant changed');
  assert.equal(sandbox.Game01.scoreMode, 'score', 'Score mode invariant changed');
  assert.equal(typeof sandbox.Game01.getV2Manifest, 'function', 'Expected v2 manifest accessor');

  const manifest = sandbox.Game01.getV2Manifest();
  assert.ok(Array.isArray(manifest.upgrades), 'Expected upgrade catalog on runtime manifest');
  assert.ok(Array.isArray(manifest.gameModes), 'Expected mode catalog on runtime manifest');
  assert.ok(manifest.runtime && manifest.runtime.powerups, 'Expected runtime powerups metadata');
  assert.ok(manifest.runtime && manifest.runtime.rewardsHazards, 'Expected runtime rewards/hazards metadata');
  assert.ok(manifest.runtime && manifest.runtime.waveProgression, 'Expected runtime wave progression metadata');
  assert.ok(manifest.runtime && manifest.runtime.enemyCombat, 'Expected runtime enemy combat metadata');
  assert.ok(manifest.runtime && manifest.runtime.threatBriefing, 'Expected runtime threat briefing metadata');
  assert.ok(manifest.runtime && manifest.runtime.combatIntelPanel, 'Expected runtime combat intel panel metadata');
  assert.ok(manifest.runtime && manifest.runtime.narrative, 'Expected runtime narrative metadata');
  assert.ok(manifest.runtime && manifest.runtime.reputation, 'Expected runtime reputation metadata');
  assert.equal(manifest.runtime.rewardsHazards.hazardChance, 0.08, 'Expected low non-zero hazard chance');
  assert.ok(manifest.runtime.rewardsHazards.archetype, 'Expected archetype config metadata in rewards/hazards runtime');
  assert.ok(Array.isArray(manifest.combatIntelPanel.players), 'Expected combat intel player catalog');
  assert.ok(Array.isArray(manifest.combatIntelPanel.drops), 'Expected combat intel drops catalog');
  assert.ok(Array.isArray(manifest.narrative), 'Expected narrative briefing catalog');
  assert.ok(Array.isArray(manifest.reputationProfiles), 'Expected reputation profile catalog');
  assert.ok(manifest.threatBriefingConfig, 'Expected threat briefing runtime config');
  assert.ok(
    sandbox.Game01.__astroV2RuntimeHooks &&
      sandbox.Game01.__astroV2RuntimeHooks.powerups &&
      sandbox.Game01.__astroV2RuntimeHooks.rewardsHazards &&
      sandbox.Game01.__astroV2RuntimeHooks.waveProgression &&
      sandbox.Game01.__astroV2RuntimeHooks.enemyCombat &&
      sandbox.Game01.__astroV2RuntimeHooks.reputation,
    'Expected runtime hook registration for powerups, rewards/hazards, wave progression, enemy combat, and reputation'
  );
  assert.ok(buildResult.outputSource.includes('WEAPON JAM'), 'Expected visible jam HUD indicator');
  assert.ok(buildResult.outputSource.includes('state.weaponJamTimer'), 'Expected weapon jam timer state integration');
  assert.ok(
    buildResult.outputSource.includes('state.forceNextWaveInvincible = true;') &&
      buildResult.outputSource.includes('state.lives = Math.max(state.lives, 10000);') &&
      buildResult.outputSource.includes('TEST INVINCIBLE (NEXT WAVE)'),
    'Force-next-wave test mode should enable invincibility and a visible HUD marker'
  );

  assert.equal(
    SOURCE_GAME_PATH.endsWith('recursive-apps/21-arcade/game01_astro_blaster-v2/src/legacy/game01_astro_blaster.legacy.js'),
    true
  );
}
