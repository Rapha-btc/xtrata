import { rewardCatalog } from '../catalogs/rewards.mjs';
import { hazardCatalog } from '../catalogs/hazards.mjs';
import { cloneSerializable } from '../framework/clone-serializable.mjs';

const rewardsHazardsRuntimeConfig = Object.freeze({
  defaultDropChance: 0.13,
  hazardChance: 0.08,
  spreadRewardChance: 0.78,
  multiplierRewardChance: 0.42,
  shieldRewardChance: 0.24,
  thrusterRewardChance: 0.35,
  shieldRewardMinLevel: 4,
  thrusterRewardMinLevel: 3,
  spreadPowerDurationFrames: 720,
  maxPowerLevel: 3,
  shieldMaxCharges: 1,
  shieldDurationFrames: 720,
  autoFireUnlockTier: 4,
  maxFireCadenceTier: 7,
  fireUnlockIntroFrames: 180,
  lifePickupType: 'life',
  spreadPickupType: 'spread',
  thrusterPickupType: 'thruster',
  multiplierPickupType: 'multiplier',
  shieldPickupType: 'shield',
  lifeRewardId: 'reward_supply_cache',
  spreadRewardId: 'reward_proto_upgrade',
  thrusterRewardId: 'reward_thruster_module',
  multiplierRewardId: 'reward_weapon_multiplier',
  shieldRewardId: 'reward_aegis_shell',
  archetype: {
    lockMinLevel: 4,
    lockPointsThreshold: 4,
    priority: ['sentinel', 'skirmisher', 'striker'],
    labels: {
      striker: 'Striker',
      sentinel: 'Sentinel',
      skirmisher: 'Skirmisher'
    },
    dropBias: {
      striker: { spread: 0.14, multiplier: 0.16, shield: -0.08, thruster: -0.05 },
      sentinel: { spread: -0.12, multiplier: -0.07, shield: 0.22, thruster: -0.04 },
      skirmisher: { spread: -0.06, multiplier: 0.14, shield: -0.05, thruster: 0.28 }
    },
    pointsByOutcome: {
      life: { sentinel: 1 },
      spread: { striker: 2 },
      multiplier: { striker: 1, skirmisher: 1 },
      thruster: { skirmisher: 3 },
      shield: { sentinel: 3 }
    }
  },
  cadence: {
    baseMinKillsBetweenDrops: 3,
    earlyLevelExtraKills: 2,
    baseMinThreatBetweenDrops: 6,
    earlyLevelExtraThreat: 4,
    minThreatBetweenDropsFloor: 3,
    threatScalingStart: 24,
    threatScalingStep: 10,
    earlyLevelThreshold: 18,
    minKillsBetweenDropsFloor: 1,
    levelScalingStart: 24,
    levelScalingStep: 10,
    minFramesBetweenDrops: 90,
    starvationKillWindow: 16,
    starvationThreatWindow: 32,
    starvationFrameWindow: 1800,
    minMajorDropFramesEarly: 720,
    minMajorDropFramesLate: 420,
    minMajorDropWavesEarly: 1,
    minMajorDropWavesLate: 0,
    multiplierForceEveryDrops: 2
  },
  rewards: rewardCatalog,
  hazards: hazardCatalog
});

function buildRuntimeSnippet(config){
  const runtimeJson = JSON.stringify(config, null, 2);
  return `
(function(){
  function createRewardsHazardsRuntime(config){
    var rewardById = {};
    var hazardById = {};
    var rewards = Array.isArray(config.rewards) ? config.rewards : [];
    var hazards = Array.isArray(config.hazards) ? config.hazards : [];
    var i;

    for(i = 0; i < rewards.length; i++){
      if(rewards[i] && rewards[i].id){
        rewardById[rewards[i].id] = rewards[i];
      }
    }

    for(i = 0; i < hazards.length; i++){
      if(hazards[i] && hazards[i].id){
        hazardById[hazards[i].id] = hazards[i];
      }
    }

    var spreadRewardChance = Number(config.spreadRewardChance);
    if(!isFinite(spreadRewardChance)) spreadRewardChance = 0.78;
    spreadRewardChance = Math.max(0.05, Math.min(0.95, spreadRewardChance));
    var multiplierRewardChance = Number(config.multiplierRewardChance);
    if(!isFinite(multiplierRewardChance)) multiplierRewardChance = 0.42;
    multiplierRewardChance = Math.max(0.05, Math.min(0.95, multiplierRewardChance));
    var shieldRewardChance = Number(config.shieldRewardChance);
    if(!isFinite(shieldRewardChance)) shieldRewardChance = 0.24;
    shieldRewardChance = Math.max(0, Math.min(0.95, shieldRewardChance));
    var thrusterRewardChance = Number(config.thrusterRewardChance);
    if(!isFinite(thrusterRewardChance)) thrusterRewardChance = 0.35;
    thrusterRewardChance = Math.max(0, Math.min(0.95, thrusterRewardChance));
    var shieldRewardMinLevel = Math.max(1, Math.floor(Number(config.shieldRewardMinLevel) || 4));
    var thrusterRewardMinLevel = Math.max(1, Math.floor(Number(config.thrusterRewardMinLevel) || 3));
    var shieldMaxCharges = Math.max(1, Math.floor(Number(config.shieldMaxCharges) || 1));
    var shieldDurationFrames = Math.max(120, Math.floor(Number(config.shieldDurationFrames) || 720));
    var autoFireUnlockTier = Math.max(1, Math.floor(Number(config.autoFireUnlockTier) || 4));
    var maxFireCadenceTier = Math.max(autoFireUnlockTier, Math.floor(Number(config.maxFireCadenceTier) || 7));
    var fireUnlockIntroFrames = Math.max(1, Math.floor(Number(config.fireUnlockIntroFrames) || 180));
    var archetypeConfig = config.archetype || {};
    var archetypeLockMinLevel = Math.max(1, Math.floor(Number(archetypeConfig.lockMinLevel) || 4));
    var archetypeLockPointsThreshold = Math.max(1, Math.floor(Number(archetypeConfig.lockPointsThreshold) || 4));
    var archetypePriority = Array.isArray(archetypeConfig.priority) && archetypeConfig.priority.length
      ? archetypeConfig.priority
      : ['sentinel', 'skirmisher', 'striker'];
    var archetypeLabels = archetypeConfig.labels || {};
    var archetypeDropBias = archetypeConfig.dropBias || {};
    var archetypePointsByOutcome = archetypeConfig.pointsByOutcome || {};

    var cadence = config.cadence || {};
    var baseMinKillsBetweenDrops = Math.max(0, Math.floor(Number(cadence.baseMinKillsBetweenDrops) || 0));
    var earlyLevelExtraKills = Math.max(0, Math.floor(Number(cadence.earlyLevelExtraKills) || 0));
    var baseMinThreatBetweenDrops = Math.max(0, Math.floor(Number(cadence.baseMinThreatBetweenDrops) || 0));
    var earlyLevelExtraThreat = Math.max(0, Math.floor(Number(cadence.earlyLevelExtraThreat) || 0));
    var minThreatBetweenDropsFloor = Math.max(0, Math.floor(Number(cadence.minThreatBetweenDropsFloor) || 0));
    var threatScalingStart = Math.max(1, Math.floor(Number(cadence.threatScalingStart) || 24));
    var threatScalingStep = Math.max(1, Math.floor(Number(cadence.threatScalingStep) || 10));
    var earlyLevelThreshold = Math.max(1, Math.floor(Number(cadence.earlyLevelThreshold) || 18));
    var minKillsBetweenDropsFloor = Math.max(0, Math.floor(Number(cadence.minKillsBetweenDropsFloor) || 0));
    var levelScalingStart = Math.max(1, Math.floor(Number(cadence.levelScalingStart) || 24));
    var levelScalingStep = Math.max(1, Math.floor(Number(cadence.levelScalingStep) || 10));
    var minFramesBetweenDrops = Math.max(0, Math.floor(Number(cadence.minFramesBetweenDrops) || 0));
    var starvationKillWindow = Math.max(1, Math.floor(Number(cadence.starvationKillWindow) || 16));
    var starvationThreatWindow = Math.max(1, Math.floor(Number(cadence.starvationThreatWindow) || 32));
    var starvationFrameWindow = Math.max(1, Math.floor(Number(cadence.starvationFrameWindow) || 1800));
    var minMajorDropFramesEarly = Math.max(0, Math.floor(Number(cadence.minMajorDropFramesEarly) || 720));
    var minMajorDropFramesLate = Math.max(0, Math.floor(Number(cadence.minMajorDropFramesLate) || 420));
    var minMajorDropWavesEarly = Math.max(0, Math.floor(Number(cadence.minMajorDropWavesEarly) || 1));
    var minMajorDropWavesLate = Math.max(0, Math.floor(Number(cadence.minMajorDropWavesLate) || 0));
    var multiplierForceEveryDrops = Math.max(1, Math.floor(Number(cadence.multiplierForceEveryDrops) || 2));

    function getNumericOrFallback(primary, fallback, defaultValue){
      var v = Number(primary);
      if(isFinite(v)) return v;
      v = Number(fallback);
      if(isFinite(v)) return v;
      return Number(defaultValue) || 0;
    }

    function ensureCadenceState(state, initialTick){
      if(!state || typeof state !== 'object') return null;
      if(!state.__astroDropCadence || typeof state.__astroDropCadence !== 'object'){
        var seededTick = Math.max(0, Math.floor(Number(initialTick) || 0));
        state.__astroDropCadence = {
          killsSeen: 0,
          threatSeen: 0,
          lastDropKills: 0,
          lastDropThreat: 0,
          lastDropTick: seededTick,
          lastMajorDropTick: -999999,
          lastMajorDropWave: -999999,
          lastMajorDropLevel: 1,
          dropsSinceMultiplier: 0
        };
      }
      if(!isFinite(Number(state.__astroDropCadence.killsSeen))){
        state.__astroDropCadence.killsSeen = 0;
      }
      if(!isFinite(Number(state.__astroDropCadence.threatSeen))){
        state.__astroDropCadence.threatSeen = Math.max(0, Number(state.__astroDropCadence.killsSeen) || 0);
      }
      if(!isFinite(Number(state.__astroDropCadence.lastDropKills))){
        state.__astroDropCadence.lastDropKills = 0;
      }
      if(!isFinite(Number(state.__astroDropCadence.lastDropThreat))){
        state.__astroDropCadence.lastDropThreat = Math.max(0, Number(state.__astroDropCadence.lastDropKills) || 0);
      }
      if(!isFinite(Number(state.__astroDropCadence.lastDropTick))){
        state.__astroDropCadence.lastDropTick = Math.max(0, Math.floor(Number(initialTick) || 0));
      }
      if(!isFinite(Number(state.__astroDropCadence.lastMajorDropTick))){
        state.__astroDropCadence.lastMajorDropTick = -999999;
      }
      if(!isFinite(Number(state.__astroDropCadence.lastMajorDropWave))){
        state.__astroDropCadence.lastMajorDropWave = -999999;
      }
      if(!isFinite(Number(state.__astroDropCadence.lastMajorDropLevel))){
        state.__astroDropCadence.lastMajorDropLevel = 1;
      }
      if(!isFinite(Number(state.__astroDropCadence.dropsSinceMultiplier))){
        state.__astroDropCadence.dropsSinceMultiplier = 0;
      }
      return state.__astroDropCadence;
    }

    function getMinKillsBetweenDrops(level){
      var minKills = baseMinKillsBetweenDrops;
      if(level <= earlyLevelThreshold){
        minKills += earlyLevelExtraKills;
      }
      if(level > levelScalingStart){
        var scalingSteps = Math.floor((level - levelScalingStart) / levelScalingStep);
        minKills -= scalingSteps;
      }
      return Math.max(minKillsBetweenDropsFloor, minKills);
    }

    function getMinThreatBetweenDrops(level){
      var minThreat = baseMinThreatBetweenDrops;
      if(level <= earlyLevelThreshold){
        minThreat += earlyLevelExtraThreat;
      }
      if(level > threatScalingStart){
        var scalingSteps = Math.floor((level - threatScalingStart) / threatScalingStep);
        minThreat -= scalingSteps;
      }
      return Math.max(minThreatBetweenDropsFloor, minThreat);
    }

    function getMinMajorDropFrames(level){
      return level <= earlyLevelThreshold ? minMajorDropFramesEarly : minMajorDropFramesLate;
    }

    function getMinMajorDropWaves(level){
      return level <= earlyLevelThreshold ? minMajorDropWavesEarly : minMajorDropWavesLate;
    }

    function canGrantMajorDrop(context, cadenceState){
      if(!cadenceState) return true;
      var framesSinceMajor = context.tick - cadenceState.lastMajorDropTick;
      var wavesSinceMajor = context.wave - cadenceState.lastMajorDropWave;
      if(framesSinceMajor < getMinMajorDropFrames(context.level)) return false;
      if(wavesSinceMajor < getMinMajorDropWaves(context.level)) return false;
      return true;
    }

    function markDrop(cadenceState, context, pickupType, spreadType, thrusterType, shieldType, multiplierType){
      if(!cadenceState) return;
      cadenceState.lastDropKills = cadenceState.killsSeen;
      cadenceState.lastDropThreat = cadenceState.threatSeen;
      cadenceState.lastDropTick = context.tick;
      if(pickupType === multiplierType){
        cadenceState.dropsSinceMultiplier = 0;
      } else {
        cadenceState.dropsSinceMultiplier = Math.max(0, Math.floor(Number(cadenceState.dropsSinceMultiplier) || 0) + 1);
      }
      if(pickupType === spreadType || pickupType === thrusterType || pickupType === shieldType){
        cadenceState.lastMajorDropTick = context.tick;
        cadenceState.lastMajorDropWave = context.wave;
        cadenceState.lastMajorDropLevel = context.level;
      }
    }

    function ensureArchetypeState(state){
      if(!state || typeof state !== 'object') return null;
      if(!state.__astroArchetype || typeof state.__astroArchetype !== 'object'){
        state.__astroArchetype = {
          id: null,
          locked: false,
          points: {
            striker: 0,
            sentinel: 0,
            skirmisher: 0
          }
        };
      }
      var points = state.__astroArchetype.points || {};
      state.__astroArchetype.points = {
        striker: Math.max(0, Math.floor(Number(points.striker) || 0)),
        sentinel: Math.max(0, Math.floor(Number(points.sentinel) || 0)),
        skirmisher: Math.max(0, Math.floor(Number(points.skirmisher) || 0))
      };
      if(typeof state.__astroArchetype.locked !== 'boolean'){
        state.__astroArchetype.locked = !!state.__astroArchetype.id;
      }
      if(state.__astroArchetype.locked && !state.__astroArchetype.id){
        state.__astroArchetype.locked = false;
      }
      if(state.__astroArchetype.id){
        state.upgradeArchetype = String(state.__astroArchetype.id);
      } else if(typeof state.upgradeArchetype !== 'string'){
        state.upgradeArchetype = null;
      }
      return state.__astroArchetype;
    }

    function getArchetypeLabel(archetypeId){
      var id = String(archetypeId || '');
      if(!id) return 'Unassigned';
      return String(archetypeLabels[id] || id).trim() || id;
    }

    function getArchetypeId(state){
      var archetypeState = ensureArchetypeState(state);
      if(!archetypeState || !archetypeState.locked) return null;
      return String(archetypeState.id || '') || null;
    }

    function applyArchetypePoints(state, outcome){
      var archetypeState = ensureArchetypeState(state);
      if(!archetypeState || archetypeState.locked) return false;
      var key = String(outcome || '').toLowerCase();
      var pointsMap = archetypePointsByOutcome[key] || null;
      if(!pointsMap || typeof pointsMap !== 'object') return false;
      var mutated = false;
      var k;
      for(k in pointsMap){
        if(!pointsMap.hasOwnProperty(k)) continue;
        if(!archetypeState.points.hasOwnProperty(k)) continue;
        var add = Math.max(0, Math.floor(Number(pointsMap[k]) || 0));
        if(add <= 0) continue;
        archetypeState.points[k] += add;
        mutated = true;
      }
      return mutated;
    }

    function maybeLockArchetype(state, context){
      var archetypeState = ensureArchetypeState(state);
      if(!archetypeState || archetypeState.locked) return null;
      var level = Math.max(
        1,
        Math.floor(
          getNumericOrFallback(
            context && context.level,
            state ? state.level : null,
            1
          )
        )
      );
      if(level < archetypeLockMinLevel) return null;
      var bestId = null;
      var bestScore = 0;
      var i;
      for(i = 0; i < archetypePriority.length; i++){
        var candidateId = String(archetypePriority[i] || '').toLowerCase();
        if(!candidateId || !archetypeState.points.hasOwnProperty(candidateId)) continue;
        var score = Math.max(0, Math.floor(Number(archetypeState.points[candidateId]) || 0));
        if(score > bestScore){
          bestScore = score;
          bestId = candidateId;
        }
      }
      if(!bestId || bestScore < archetypeLockPointsThreshold) return null;
      archetypeState.id = bestId;
      archetypeState.locked = true;
      state.upgradeArchetype = bestId;
      return {
        id: bestId,
        label: getArchetypeLabel(bestId),
        score: bestScore
      };
    }

    function resolveArchetypeDropTuning(state){
      var archetypeId = getArchetypeId(state);
      var bias = archetypeId ? (archetypeDropBias[archetypeId] || {}) : {};
      var tuned = {
        archetypeId: archetypeId,
        spreadChance: Math.max(0.05, Math.min(0.95, spreadRewardChance + Number(bias.spread || 0))),
        multiplierChance: Math.max(0.05, Math.min(0.95, multiplierRewardChance + Number(bias.multiplier || 0))),
        shieldChance: Math.max(0, Math.min(0.95, shieldRewardChance + Number(bias.shield || 0))),
        thrusterChance: Math.max(0, Math.min(0.95, thrusterRewardChance + Number(bias.thruster || 0)))
      };
      return tuned;
    }

    function resolveDrop(payload){
      if(!payload || !payload.profile) return null;

      var rand = typeof payload.rand === 'function' ? payload.rand : Math.random;
      var state = payload.state || null;
      var context = {
        tick: Math.max(0, Math.floor(getNumericOrFallback(payload.tick, state ? state.tick : null, 0))),
        level: Math.max(1, Math.floor(getNumericOrFallback(payload.level, state ? state.level : null, 1))),
        wave: Math.max(0, Math.floor(getNumericOrFallback(payload.wave, state ? state.wave : null, 0)))
      };
      var enemyThreat = Math.max(
        1,
        Math.floor(
          getNumericOrFallback(
            payload.enemyThreat,
            payload.enemy ? payload.enemy.maxHp || payload.enemy.hp : null,
            1
          )
        )
      );
      var cadenceState = ensureCadenceState(state, context.tick);
      if(cadenceState){
        cadenceState.killsSeen += 1;
        cadenceState.threatSeen += enemyThreat;
      }

      var killsSinceDrop = cadenceState ? (cadenceState.killsSeen - cadenceState.lastDropKills) : 999999;
      var threatSinceDrop = cadenceState ? (cadenceState.threatSeen - cadenceState.lastDropThreat) : 999999;
      var framesSinceDrop = cadenceState ? (context.tick - cadenceState.lastDropTick) : 999999;
      var starvationActive = !!(cadenceState && (
        killsSinceDrop >= starvationKillWindow ||
        threatSinceDrop >= starvationThreatWindow ||
        framesSinceDrop >= starvationFrameWindow
      ));

      if(cadenceState && !starvationActive){
        if(threatSinceDrop < getMinThreatBetweenDrops(context.level)) return null;
        if(framesSinceDrop < minFramesBetweenDrops) return null;
      }

      var profileDrop = Number(payload.profile.dropChance);
      var dropChance = isFinite(profileDrop) ? profileDrop : Number(config.defaultDropChance || 0.13);
      if(!starvationActive && rand() > dropChance) return null;

      var spreadType = config.spreadPickupType || 'spread';
      var lifeType = config.lifePickupType || 'life';
      var thrusterType = config.thrusterPickupType || 'thruster';
      var shieldType = config.shieldPickupType || 'shield';
      var multiplierType = config.multiplierPickupType || 'multiplier';
      var archetypeTuning = resolveArchetypeDropTuning(state);

      var hazardChance = Number(config.hazardChance || 0);
      if(!starvationActive && hazardChance > 0 && rand() < hazardChance && hazards.length > 0){
        var hazard = hazards[Math.floor(rand() * hazards.length) % hazards.length];
        var hazardDrop = {
          sourceType: 'hazard',
          sourceId: hazard.id,
          pickupType: 'hazard',
          pickupLabel: hazard.label || 'Hazard',
          hazardEffect: hazard.effects || null
        };
        markDrop(cadenceState, context, hazardDrop.pickupType, spreadType, thrusterType, shieldType, multiplierType);
        return hazardDrop;
      }

      var spreadReward = rewardById[config.spreadRewardId] || null;
      var lifeReward = rewardById[config.lifeRewardId] || null;
      var thrusterReward = rewardById[config.thrusterRewardId] || null;
      var shieldReward = rewardById[config.shieldRewardId] || null;
      var multiplierReward = rewardById[config.multiplierRewardId] || null;
      var thrusterLocked = !!(state && !state.verticalMobilityUnlocked);
      var currentShieldCharges = Math.max(0, Math.floor(Number(state && state.shieldCharges) || 0));
      var shieldEligible = currentShieldCharges < shieldMaxCharges;
      var fireCadenceTier = Math.max(0, Math.floor(Number(state && state.fireCadenceTier) || 0));
      var multiplierEligible = fireCadenceTier < maxFireCadenceTier;
      var dropsSinceMultiplier = cadenceState
        ? Math.max(0, Math.floor(Number(cadenceState.dropsSinceMultiplier) || 0))
        : 0;
      var forceMultiplierDrop = !!(
        cadenceState &&
        multiplierEligible &&
        dropsSinceMultiplier >= multiplierForceEveryDrops
      );

      if(
        thrusterLocked &&
        context.level >= thrusterRewardMinLevel &&
        canGrantMajorDrop(context, cadenceState) &&
        rand() < archetypeTuning.thrusterChance
      ){
        var thrusterDrop = {
          sourceType: 'reward',
          sourceId: thrusterReward ? thrusterReward.id : null,
          pickupType: thrusterType,
          pickupLabel: thrusterReward ? thrusterReward.label : 'Thruster Module',
          reward: thrusterReward
        };
        markDrop(cadenceState, context, thrusterDrop.pickupType, spreadType, thrusterType, shieldType, multiplierType);
        return thrusterDrop;
      }

      if(
        shieldEligible &&
        context.level >= shieldRewardMinLevel &&
        canGrantMajorDrop(context, cadenceState) &&
        rand() < archetypeTuning.shieldChance
      ){
        var shieldDrop = {
          sourceType: 'reward',
          sourceId: shieldReward ? shieldReward.id : null,
          pickupType: shieldType,
          pickupLabel: shieldReward ? shieldReward.label : 'Aegis Shell',
          reward: shieldReward
        };
        markDrop(cadenceState, context, shieldDrop.pickupType, spreadType, thrusterType, shieldType, multiplierType);
        return shieldDrop;
      }

      if(multiplierEligible && (forceMultiplierDrop || rand() < archetypeTuning.multiplierChance)){
        var multiplierDrop = {
          sourceType: 'reward',
          sourceId: multiplierReward ? multiplierReward.id : null,
          pickupType: multiplierType,
          pickupLabel: multiplierReward ? multiplierReward.label : 'Weapon Multiplier',
          reward: multiplierReward
        };
        markDrop(cadenceState, context, multiplierDrop.pickupType, spreadType, thrusterType, shieldType, multiplierType);
        return multiplierDrop;
      }

      var chooseSpread = rand() < archetypeTuning.spreadChance;
      if(chooseSpread && !canGrantMajorDrop(context, cadenceState)){
        chooseSpread = false;
      }
      if(starvationActive && canGrantMajorDrop(context, cadenceState)){
        chooseSpread = true;
      }
      if(!chooseSpread && !lifeReward && spreadReward){
        chooseSpread = true;
      }

      if(chooseSpread){
        var spreadDrop = {
          sourceType: 'reward',
          sourceId: spreadReward ? spreadReward.id : null,
          pickupType: spreadType,
          pickupLabel: spreadReward ? spreadReward.label : 'Power',
          reward: spreadReward
        };
        markDrop(cadenceState, context, spreadDrop.pickupType, spreadType, thrusterType, shieldType, multiplierType);
        return spreadDrop;
      }

      var lifeDrop = {
        sourceType: 'reward',
        sourceId: lifeReward ? lifeReward.id : null,
        pickupType: lifeType,
        pickupLabel: lifeReward ? lifeReward.label : 'Life',
        reward: lifeReward
      };
      markDrop(cadenceState, context, lifeDrop.pickupType, spreadType, thrusterType, shieldType, multiplierType);
      return lifeDrop;
    }

    function queueNarrativeEvent(event){
      if(!event || !event.key) return;
      if(!Array.isArray(game.__astroNarrativeExternalQueue)){
        game.__astroNarrativeExternalQueue = [];
      }
      game.__astroNarrativeExternalQueue.push(event);
    }

    function formatHazardFeedText(hazardLabel, flags){
      var parts = [];
      if(flags && flags.weaponJam) parts.push('weapon jam');
      if(flags && flags.moveSlow) parts.push('thruster drag');
      if(flags && flags.radialShots > 0) parts.push('shard burst');
      if(flags && flags.reinforcement) parts.push('ambush pulse');
      if(parts.length === 0) parts.push('system disturbance');
      return String(hazardLabel || 'Hazard') + ': ' + parts.join(', ') + '.';
    }

    function applyHazardRadialShots(payload, effect){
      if(!payload || !payload.state || !effect) return 0;
      var shotCount = Math.max(0, Math.min(24, Math.floor(Number(effect.radialProjectiles) || 0)));
      if(shotCount <= 0) return 0;
      var spawnEnemyShot = typeof payload.spawnEnemyShot === 'function' ? payload.spawnEnemyShot : null;
      var state = payload.state;
      var pickup = payload.pickup || null;
      var player = payload.player || null;
      var originX = Number(pickup && pickup.x);
      var originY = Number(pickup && pickup.y);
      if(!isFinite(originX) || !isFinite(originY)){
        originX = Number(player && player.x);
        originY = Number(player && player.y);
      }
      if(!isFinite(originX) || !isFinite(originY)){
        originX = 240;
        originY = 300;
      }
      originX += Number((pickup && pickup.w) || (player && player.w) || 0) * 0.5;
      originY += Number((pickup && pickup.h) || (player && player.h) || 0) * 0.5;

      var shotSpeed = Number(effect.projectileSpeed);
      if(!isFinite(shotSpeed) || shotSpeed <= 0) shotSpeed = 2.9;
      var shotWidth = 4;
      var shotHeight = 10;
      var shotColor = '#ff6a7f';
      var i;

      for(i = 0; i < shotCount; i++){
        var angle = ((Math.PI * 2 * i) / shotCount) - (Math.PI * 0.5);
        var vx = Math.cos(angle) * shotSpeed;
        var vy = Math.sin(angle) * shotSpeed;
        var sx = originX - shotWidth * 0.5;
        var sy = originY - shotHeight * 0.5;
        if(spawnEnemyShot){
          spawnEnemyShot(sx, sy, vx, vy, shotWidth, shotHeight, shotColor);
        } else if(Array.isArray(state.enemyShots)){
          state.enemyShots.push({
            x: sx,
            y: sy,
            w: shotWidth,
            h: shotHeight,
            vx: vx,
            vy: vy,
            life: 160,
            color: shotColor
          });
        }
      }
      return shotCount;
    }

    function handleArchetypeProgress(state, outcome){
      applyArchetypePoints(state, outcome);
      var locked = maybeLockArchetype(state, {
        level: state ? state.level : null,
        wave: state ? state.wave : null,
        tick: state ? state.tick : null
      });
      if(locked){
        queueNarrativeEvent({
          key: 'ops-archetype-lock-' + String(locked.id),
          kind: 'transmission',
          speaker: 'OPS',
          title: 'Build Path Locked',
          text: locked.label + ' profile now active. Future drops will favor this combat doctrine.',
          durationMs: 3400
        });
      }
      return {
        id: getArchetypeId(state),
        locked: !!locked
      };
    }

    function applyPickup(payload){
      if(!payload || !payload.state || !payload.pickup) return { consumed: false };

      var state = payload.state;
      var pickup = payload.pickup;
      var shared = payload.shared || null;
      var maxLives = Math.max(1, Number(payload.maxLives) || 5);
      var maxPowerLevel = Math.max(1, Number(config.maxPowerLevel) || 3);
      var spreadPowerDurationFrames = Math.max(1, Number(config.spreadPowerDurationFrames) || 720);
      var lifeType = config.lifePickupType || 'life';
      var spreadType = config.spreadPickupType || 'spread';
      var thrusterType = config.thrusterPickupType || 'thruster';
      var shieldType = config.shieldPickupType || 'shield';
      var multiplierType = config.multiplierPickupType || 'multiplier';

      if(pickup.pickupType === lifeType || pickup.type === lifeType){
        state.lives = Math.min(maxLives, state.lives + 1);
        var lifeArchetype = handleArchetypeProgress(state, 'life');
        if(shared && shared.beep) shared.beep(760, 0.12, 'sine', 0.05);
        return { consumed: true, outcome: 'life', archetype: lifeArchetype.id, archetypeLocked: lifeArchetype.locked };
      }

      if(pickup.pickupType === spreadType || pickup.type === spreadType){
        state.powerLevel = Math.min(maxPowerLevel, Math.max(1, Math.floor(Number(state.powerLevel) || 1)) + 1);
        state.powerTimer = spreadPowerDurationFrames;
        var spreadArchetype = handleArchetypeProgress(state, 'spread');
        if(shared && shared.beep) shared.beep(660, 0.14, 'sine', 0.05);
        return { consumed: true, outcome: 'spread', archetype: spreadArchetype.id, archetypeLocked: spreadArchetype.locked };
      }

      if(pickup.pickupType === multiplierType || pickup.type === multiplierType){
        var hadAutoFire = !!state.fireAutoUnlocked;
        var currentFireTier = Math.max(0, Math.floor(Number(state.fireCadenceTier) || 0));
        state.fireCadenceTier = Math.min(maxFireCadenceTier, currentFireTier + 1);
        state.fireAutoUnlockTier = autoFireUnlockTier;
        state.maxFireCadenceTier = maxFireCadenceTier;
        state.fireAutoUnlocked = state.fireCadenceTier >= autoFireUnlockTier;
        if(state.fireAutoUnlocked){
          state.fireUnlockIntro = Math.max(Number(state.fireUnlockIntro) || 0, fireUnlockIntroFrames);
          if(!hadAutoFire){
            queueNarrativeEvent({
              key: 'ops-autofire-online',
              kind: 'transmission',
              speaker: 'OPS',
              title: 'Systems Update',
              text: 'Auto-fire is now online. Hold fire to sustain volleys.',
              durationMs: 3400
            });
          }
        }
        if(shared && shared.beep){
          if(state.fireAutoUnlocked){
            shared.beep(540, 0.05, 'triangle', 0.04);
            shared.beep(760, 0.07, 'triangle', 0.04);
          } else {
            shared.beep(620, 0.05, 'square', 0.03);
          }
        }
        var multiplierArchetype = handleArchetypeProgress(state, 'multiplier');
        return {
          consumed: true,
          outcome: 'multiplier',
          archetype: multiplierArchetype.id,
          archetypeLocked: multiplierArchetype.locked
        };
      }

      if(pickup.pickupType === thrusterType || pickup.type === thrusterType){
        var hadThrusters = !!state.verticalMobilityUnlocked;
        state.verticalMobilityUnlocked = true;
        state.mobilityUnlockIntro = Math.max(Number(state.mobilityUnlockIntro) || 0, 180);
        if(!hadThrusters){
          queueNarrativeEvent({
            key: 'ops-thrusters-online',
            kind: 'transmission',
            speaker: 'OPS',
            title: 'Systems Update',
            text: 'Vertical thrusters unlocked. Up/down maneuvering now available.',
            durationMs: 3400
          });
        }
        if(shared && shared.beep){
          shared.beep(520, 0.05, 'sine', 0.04);
          shared.beep(720, 0.07, 'triangle', 0.04);
        }
        var thrusterArchetype = handleArchetypeProgress(state, 'thruster');
        return { consumed: true, outcome: 'thruster', archetype: thrusterArchetype.id, archetypeLocked: thrusterArchetype.locked };
      }

      if(pickup.pickupType === shieldType || pickup.type === shieldType){
        var hadShield = Math.max(0, Math.floor(Number(state.shieldCharges) || 0)) > 0 && Number(state.shieldTimer) > 0;
        state.shieldMaxCharges = shieldMaxCharges;
        state.shieldCharges = Math.min(shieldMaxCharges, Math.max(0, Math.floor(Number(state.shieldCharges) || 0)) + 1);
        state.shieldTimer = Math.max(0, shieldDurationFrames);
        state.shieldHitFlash = Math.max(0, Math.floor(Number(state.shieldHitFlash) || 0));
        if(!hadShield){
          queueNarrativeEvent({
            key: 'ops-aegis-shell-online',
            kind: 'transmission',
            speaker: 'OPS',
            title: 'Defense Upgrade',
            text: 'Aegis Shell active. One incoming hit will be absorbed.',
            durationMs: 3400
          });
        }
        if(shared && shared.beep){
          shared.beep(640, 0.06, 'triangle', 0.05);
          shared.beep(820, 0.08, 'sine', 0.04);
        }
        var shieldArchetype = handleArchetypeProgress(state, 'shield');
        return { consumed: true, outcome: 'shield', archetype: shieldArchetype.id, archetypeLocked: shieldArchetype.locked };
      }

      if(pickup.pickupType === 'hazard' || pickup.type === 'hazard'){
        var hazardEffect = pickup.hazardEffect || {};
        var hazardFlags = {
          weaponJam: false,
          moveSlow: false,
          radialShots: 0,
          reinforcement: false
        };

        var jamFrames = Math.floor(Number(hazardEffect.weaponJamFrames) || 0);
        if(jamFrames > 0){
          state.weaponJamTimer = Math.max(Math.floor(Number(state.weaponJamTimer) || 0), jamFrames);
          hazardFlags.weaponJam = true;
        }

        var moveSlowMul = Number(hazardEffect.moveSpeedMultiplier);
        if(isFinite(moveSlowMul) && moveSlowMul > 0 && moveSlowMul < 1){
          var moveSlowFrames = Math.max(30, Math.floor(Number(hazardEffect.durationFrames) || 240));
          state.hazardSlowMultiplier = Math.min(
            1,
            Math.max(0.35, Math.min(Number(state.hazardSlowMultiplier) || 1, moveSlowMul))
          );
          state.hazardSlowTimer = Math.max(Math.floor(Number(state.hazardSlowTimer) || 0), moveSlowFrames);
          hazardFlags.moveSlow = true;
        }

        var reinforcementBudget = Math.max(0, Math.floor(Number(hazardEffect.enemyBudgetBonus) || 0));
        if(reinforcementBudget > 0){
          var reinforceDelay = Math.max(1, Math.floor(Number(hazardEffect.reinforcementDelayFrames) || 30));
          state.hazardReinforcementBudget = Math.max(
            0,
            Math.min(24, Math.floor(Number(state.hazardReinforcementBudget) || 0) + reinforcementBudget)
          );
          state.hazardReinforcementTimer = Math.max(Math.floor(Number(state.hazardReinforcementTimer) || 0), reinforceDelay);
          hazardFlags.reinforcement = true;
        }

        hazardFlags.radialShots = applyHazardRadialShots(payload, hazardEffect);

        var hazardLabel = pickup.pickupLabel || pickup.label || 'Hazard';
        var hazardKeyBase = String(pickup.sourceId || hazardLabel).toLowerCase().replace(/[^a-z0-9]+/g, '-');
        queueNarrativeEvent({
          key: 'ops-hazard-' + hazardKeyBase + '-' + String(Math.floor(Number(state.tick) || 0)),
          kind: 'transmission',
          speaker: 'OPS',
          title: 'Hazard Triggered',
          text: formatHazardFeedText(hazardLabel, hazardFlags),
          durationMs: 3000
        });

        if(shared && shared.beep){
          shared.beep(220, 0.14, 'sawtooth', 0.05);
          if(hazardFlags.radialShots > 0){
            shared.beep(180, 0.06, 'square', 0.04);
          }
        }
        return { consumed: true, outcome: 'hazard', flags: hazardFlags };
      }

      return { consumed: false };
    }

    return {
      resolveDrop: resolveDrop,
      applyPickup: applyPickup
    };
  }

  var runtimeConfig = ${runtimeJson};
  var runtimeHooks = game.__astroV2RuntimeHooks || {};
  runtimeHooks.rewardsHazards = createRewardsHazardsRuntime(runtimeConfig);
  game.__astroV2RuntimeHooks = runtimeHooks;
  if(typeof game.setV2RuntimeHooks === 'function'){
    game.setV2RuntimeHooks(runtimeHooks);
  }

  runtimePatch.runtime = runtimePatch.runtime || {};
  runtimePatch.runtime.rewardsHazards = {
    module: 'rewards-hazards-runtime-hooks',
    status: 'active',
    hazardChance: runtimeConfig.hazardChance,
    archetype: runtimeConfig.archetype || null,
    pacingCadence: runtimeConfig.cadence || null,
    behaviorParity: 'legacy-v1-safe+cadence+hazard-depth'
  };
})();
`;
}

export const rewardsHazardsRuntimeModule = {
  id: 'rewards-hazards-runtime-hooks',
  priority: 32,
  description: 'Injects reward/hazard drop and pickup effect resolution hooks.',
  apply(artifact){
    artifact.runtimePatch.runtime = artifact.runtimePatch.runtime || {};
    artifact.runtimePatch.runtime.rewardsHazardsConfig = cloneSerializable(rewardsHazardsRuntimeConfig);

    artifact.runtimeSnippets = artifact.runtimeSnippets || [];
    artifact.runtimeSnippets.push(buildRuntimeSnippet(rewardsHazardsRuntimeConfig));
    return artifact;
  }
};
