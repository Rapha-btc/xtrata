import { reputationProfileCatalog } from '../catalogs/reputation-profiles.mjs';
import { cloneSerializable } from '../framework/clone-serializable.mjs';

const reputationRuntimeConfig = Object.freeze({
  pollIntervalMs: 260,
  defaultProfileId: 'steady',
  profiles: reputationProfileCatalog,
  profileRules: {
    ace: { minWave: 3, minScorePerWave: 900 },
    brink: { minWave: 2, maxLives: 1 },
    vanguard: { minWave: 2, minLives: 4 }
  },
  transmissionDurationMs: 3600
});

function buildRuntimeSnippet(config){
  const runtimeJson = JSON.stringify(config, null, 2);
  return `
(function(){
  var runtimeConfig = ${runtimeJson};

  function clampInt(value, fallback){
    var parsed = Number(value);
    if(!isFinite(parsed)) return fallback;
    return Math.floor(parsed);
  }

  function normalizeSnapshot(snapshot){
    snapshot = snapshot || {};
    var level = Math.max(1, clampInt(snapshot.level, 1));
    var wave = Math.max(1, clampInt(snapshot.wave, 1));
    var lives = Math.max(0, clampInt(snapshot.lives, 0));
    var score = Math.max(0, clampInt(snapshot.score, 0));
    return {
      level: level,
      wave: wave,
      lives: lives,
      score: score,
      scorePerWave: score / Math.max(1, wave),
      scorePerLevel: score / Math.max(1, level)
    };
  }

  function getProfileById(profileId){
    var profiles = Array.isArray(runtimeConfig.profiles) ? runtimeConfig.profiles : [];
    for(var i = 0; i < profiles.length; i++){
      var profile = profiles[i];
      if(profile && String(profile.id) === String(profileId)){
        return profile;
      }
    }
    for(var j = 0; j < profiles.length; j++){
      var candidate = profiles[j];
      if(candidate && String(candidate.id) === String(runtimeConfig.defaultProfileId || 'steady')){
        return candidate;
      }
    }
    return profiles[0] || { id: String(runtimeConfig.defaultProfileId || 'steady'), speaker: 'OPS', transmissions: [] };
  }

  function evaluateProfile(snapshot){
    var metrics = normalizeSnapshot(snapshot);
    var rules = runtimeConfig.profileRules || {};
    var aceRule = rules.ace || {};
    var brinkRule = rules.brink || {};
    var vanguardRule = rules.vanguard || {};

    if(
      metrics.wave >= Math.max(1, clampInt(aceRule.minWave, 3)) &&
      metrics.scorePerWave >= Math.max(100, Number(aceRule.minScorePerWave) || 900)
    ){
      return 'ace';
    }

    if(
      metrics.wave >= Math.max(1, clampInt(brinkRule.minWave, 2)) &&
      metrics.lives <= Math.max(0, clampInt(brinkRule.maxLives, 1))
    ){
      return 'brink';
    }

    if(
      metrics.wave >= Math.max(1, clampInt(vanguardRule.minWave, 2)) &&
      metrics.lives >= Math.max(1, clampInt(vanguardRule.minLives, 4))
    ){
      return 'vanguard';
    }

    return String(runtimeConfig.defaultProfileId || 'steady');
  }

  function createTransmissionEvent(options){
    return {
      key: String(options.key || ''),
      kind: 'transmission',
      speaker: String(options.speaker || 'OPS'),
      title: String(options.title || 'Transmission'),
      text: String(options.text || ''),
      durationMs: Math.max(1200, Number(options.durationMs) || Number(runtimeConfig.transmissionDurationMs) || 3600)
    };
  }

  function collectNarrativeSignals(payload){
    payload = payload || {};
    var snapshot = payload.snapshot || null;
    if(!snapshot) return [];

    var state = payload.state || {};
    if(!state.seen || typeof state.seen !== 'object'){
      state.seen = {};
    }
    if(typeof state.lastProfileId !== 'string'){
      state.lastProfileId = '';
    }

    var metrics = normalizeSnapshot(snapshot);
    var profileId = evaluateProfile(metrics);
    var profile = getProfileById(profileId);
    var events = [];

    if(state.lastProfileId !== profileId){
      var switchKey = 'reputation-profile-switch:' + profileId;
      if(!state.seen[switchKey]){
        state.seen[switchKey] = true;
        events.push(createTransmissionEvent({
          key: switchKey,
          speaker: profile.speaker || 'OPS',
          title: 'Reputation: ' + String(profile.label || profileId),
          text: String(profile.summary || 'Reputation profile updated.')
        }));
      }
      state.lastProfileId = profileId;
    }

    var transmissions = Array.isArray(profile.transmissions) ? profile.transmissions : [];
    for(var i = 0; i < transmissions.length; i++){
      var transmission = transmissions[i] || {};
      var minLevel = Math.max(1, clampInt(transmission.minLevel, 1));
      if(metrics.level < minLevel) continue;
      var transmissionKey = 'reputation-threshold:' + profileId + ':' + String(transmission.id || ('level-' + minLevel));
      if(state.seen[transmissionKey]) continue;
      state.seen[transmissionKey] = true;
      events.push(createTransmissionEvent({
        key: transmissionKey,
        speaker: transmission.speaker || profile.speaker || 'OPS',
        title: 'Reputation: ' + String(profile.label || profileId),
        text: transmission.text || ''
      }));
    }

    state.currentProfileId = profileId;
    state.lastMetrics = metrics;
    return events;
  }

  function queueNarrativeEvents(game, events){
    if(!game || !Array.isArray(events) || events.length === 0) return;
    if(!Array.isArray(game.__astroNarrativeExternalQueue)){
      game.__astroNarrativeExternalQueue = [];
    }
    for(var i = 0; i < events.length; i++){
      game.__astroNarrativeExternalQueue.push(events[i]);
    }
  }

  function pollReputation(game, state){
    if(!game || !state || typeof game.getTestHooks !== 'function') return;

    var hooks = game.getTestHooks();
    if(!hooks || typeof hooks.getState !== 'function') return;

    var snapshot = null;
    try{
      snapshot = hooks.getState();
    }catch(e){
      return;
    }
    if(!snapshot || snapshot.gameOver) return;

    var events = collectNarrativeSignals({
      state: state,
      snapshot: snapshot
    });
    queueNarrativeEvents(game, events);
  }

  function removeReputationRuntimeState(state){
    if(!state) return;
    if(state.timer){
      clearInterval(state.timer);
      state.timer = null;
    }
  }

  function patchGameInitDestroy(){
    if(!game || typeof game.init !== 'function' || typeof game.destroy !== 'function') return;
    if(game.__astroReputationPatched) return;
    game.__astroReputationPatched = true;

    var originalInit = game.init;
    var originalDestroy = game.destroy;

    game.init = function(container, shared){
      var result = originalInit.call(game, container, shared);

      if(game.__astroReputationState){
        removeReputationRuntimeState(game.__astroReputationState);
      }
      game.__astroReputationState = {
        seen: {},
        lastProfileId: '',
        currentProfileId: String(runtimeConfig.defaultProfileId || 'steady'),
        timer: null
      };

      game.__astroReputationState.timer = setInterval(function(){
        pollReputation(game, game.__astroReputationState);
      }, Math.max(120, clampInt(runtimeConfig.pollIntervalMs, 260)));

      setTimeout(function(){
        pollReputation(game, game.__astroReputationState);
      }, 0);

      return result;
    };

    game.destroy = function(){
      var result = originalDestroy.call(game);
      if(game.__astroReputationState){
        removeReputationRuntimeState(game.__astroReputationState);
        game.__astroReputationState = null;
      }
      return result;
    };
  }

  var runtimeHooks = game.__astroV2RuntimeHooks || {};
  runtimeHooks.reputation = {
    evaluateProfile: evaluateProfile,
    collectNarrativeSignals: collectNarrativeSignals
  };
  game.__astroV2RuntimeHooks = runtimeHooks;
  if(typeof game.setV2RuntimeHooks === 'function'){
    game.setV2RuntimeHooks(runtimeHooks);
  }

  patchGameInitDestroy();
})();
`;
}

export const reputationRuntimeModule = {
  id: 'reputation-runtime',
  priority: 38,
  description: 'Adds faction reputation profiling and branching narrative transmission triggers.',
  apply(artifact){
    artifact.runtimePatch.runtime = artifact.runtimePatch.runtime || {};
    artifact.runtimePatch.runtime.reputation = {
      module: 'reputation-runtime',
      status: 'active',
      style: 'branching-transmissions',
      defaultProfileId: reputationRuntimeConfig.defaultProfileId
    };
    artifact.runtimePatch.reputationProfiles = cloneSerializable(reputationRuntimeConfig.profiles);
    artifact.runtimePatch.reputationRules = cloneSerializable(reputationRuntimeConfig.profileRules);

    artifact.runtimeSnippets = artifact.runtimeSnippets || [];
    artifact.runtimeSnippets.push(buildRuntimeSnippet(reputationRuntimeConfig));
    return artifact;
  }
};
