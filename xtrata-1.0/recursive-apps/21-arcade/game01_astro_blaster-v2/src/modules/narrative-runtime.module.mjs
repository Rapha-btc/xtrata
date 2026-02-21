import { sectorBriefingsCatalog } from '../catalogs/sector-briefings.mjs';
import { cloneSerializable } from '../framework/clone-serializable.mjs';

const narrativeRuntimeConfig = Object.freeze({
  pollIntervalMs: 240,
  maxQueueSize: 8,
  introDurationMs: 5200,
  transmissionDurationMs: 4200,
  fadeMs: 320,
  briefings: sectorBriefingsCatalog,
  fallbackBriefing: {
    speaker: 'OPS',
    title: 'Deep Sector Transit',
    intro: 'Unknown signal traffic ahead. Stay alert for hostile phase shifts.'
  },
  globalTransmissions: [
    { id: 'global-level-3', minLevel: 3, speaker: 'OPS', text: 'Enemy command nodes are adapting to your firing rhythm.' },
    { id: 'global-level-8', minLevel: 8, speaker: 'OPS', text: 'Threat pressure rising. Conserve lives and avoid panic movement.' },
    { id: 'global-level-15', minLevel: 15, speaker: 'PIRATE BAND', text: 'You are entering command territory. No more warning shots.' }
  ]
});

function buildRuntimeSnippet(config){
  const runtimeJson = JSON.stringify(config, null, 2);
  return `
(function(){
  var runtimeConfig = ${runtimeJson};

  function canUseDom(){
    return typeof document !== 'undefined' && typeof document.createElement === 'function';
  }

  function normalizeText(value){
    return String(value || '').toLowerCase();
  }

  function ensureStyles(){
    if(!canUseDom()) return;
    if(document.getElementById('ab-narrative-overlay-style')) return;

    var style = document.createElement('style');
    style.id = 'ab-narrative-overlay-style';
    style.textContent = [
      '.ab-narrative-overlay{position:absolute;left:50%;top:10px;transform:translateX(-50%);width:min(92%,460px);z-index:24;pointer-events:none;font-family:monospace;opacity:0;transition:opacity 0.32s ease;}',
      '.ab-narrative-overlay.is-visible{opacity:1;}',
      '.ab-intel-feed-host .ab-narrative-overlay{position:relative;left:auto;top:auto;transform:none;width:100%;z-index:1;max-height:0;overflow:hidden;margin:0;}',
      '.ab-intel-feed-host .ab-narrative-overlay.is-visible{max-height:260px;margin:0 0 2px;}',
      '.ab-narrative-card{background:rgba(4,12,26,0.84);border:1px solid rgba(120,193,241,0.58);border-radius:10px;box-shadow:0 0 18px rgba(10,28,56,0.42);padding:10px 12px;color:#dff4ff;}',
      '.ab-intel-feed-host .ab-narrative-card{padding:8px 10px;border-radius:8px;box-shadow:0 0 12px rgba(10,28,56,0.34);}',
      '.ab-narrative-speaker{font-size:11px;letter-spacing:0.5px;text-transform:uppercase;color:#7ed9ff;margin-bottom:4px;}',
      '.ab-narrative-title{font-size:13px;letter-spacing:0.3px;color:#fff4b1;margin-bottom:4px;}',
      '.ab-narrative-text{font-size:12px;line-height:1.35;color:#d5edff;}',
      '.ab-narrative-overlay.is-transmission .ab-narrative-title{color:#ffcf8a;}'
    ].join('\\n');
    document.head.appendChild(style);
  }

  function findBriefingForSector(sectorName){
    var normalized = normalizeText(sectorName);
    var briefings = Array.isArray(runtimeConfig.briefings) ? runtimeConfig.briefings : [];
    for(var i = 0; i < briefings.length; i++){
      var briefing = briefings[i];
      var match = Array.isArray(briefing.match) ? briefing.match : [];
      for(var j = 0; j < match.length; j++){
        if(normalized.indexOf(normalizeText(match[j])) >= 0){
          return briefing;
        }
      }
    }
    return null;
  }

  function resolveBriefing(sectorName){
    var briefing = findBriefingForSector(sectorName);
    if(briefing) return briefing;
    var fallback = runtimeConfig.fallbackBriefing || {};
    return {
      id: 'fallback',
      speaker: fallback.speaker || 'OPS',
      title: fallback.title || 'Deep Sector Transit',
      intro: fallback.intro || 'Unknown signal traffic ahead.',
      transmissions: []
    };
  }

  function enqueueEvent(narrativeState, event){
    if(!narrativeState || !event) return;
    var key = String(event.key || '').trim();
    if(!key) return;
    if(narrativeState.seen[key]) return;
    narrativeState.seen[key] = true;

    if(narrativeState.queue.length >= narrativeState.maxQueueSize){
      narrativeState.queue.shift();
    }
    narrativeState.queue.push(event);
  }

  function showNextEvent(narrativeState){
    if(!narrativeState || !narrativeState.root) return;
    if(narrativeState.activeUntil > Date.now()) return;

    if(narrativeState.queue.length === 0){
      narrativeState.root.classList.remove('is-visible');
      narrativeState.root.classList.remove('is-transmission');
      return;
    }

    var event = narrativeState.queue.shift();
    narrativeState.speakerNode.textContent = String(event.speaker || 'OPS');
    narrativeState.titleNode.textContent = String(event.title || '');
    narrativeState.textNode.textContent = String(event.text || '');
    narrativeState.root.classList.toggle('is-transmission', event.kind === 'transmission');
    narrativeState.root.classList.add('is-visible');

    var duration = Number(event.durationMs);
    if(!isFinite(duration) || duration <= 0){
      duration = event.kind === 'intro'
        ? Number(runtimeConfig.introDurationMs || 5200)
        : Number(runtimeConfig.transmissionDurationMs || 4200);
    }
    narrativeState.activeUntil = Date.now() + duration;
  }

  function queueSectorIntro(narrativeState, snapshot){
    var sectorName = String(snapshot.sector || '');
    var briefing = resolveBriefing(sectorName);
    var sectorKey = String(briefing.id || 'fallback');
    if(narrativeState.lastSectorKey === sectorKey) return;
    narrativeState.lastSectorKey = sectorKey;

    enqueueEvent(narrativeState, {
      key: 'sector-intro:' + sectorKey,
      kind: 'intro',
      speaker: briefing.speaker || 'OPS',
      title: briefing.title || 'Sector Briefing',
      text: briefing.intro || 'Signal traffic detected.',
      durationMs: Number(runtimeConfig.introDurationMs || 5200)
    });
  }

  function queueSectorTransmissions(narrativeState, snapshot){
    var sectorName = String(snapshot.sector || '');
    var briefing = resolveBriefing(sectorName);
    var transmissions = Array.isArray(briefing.transmissions) ? briefing.transmissions : [];
    var wave = Math.max(0, Number(snapshot.wave) || 0);
    for(var i = 0; i < transmissions.length; i++){
      var transmission = transmissions[i];
      var minWave = Math.max(0, Number(transmission.minWave) || 0);
      if(wave < minWave) continue;
      enqueueEvent(narrativeState, {
        key: 'sector-transmission:' + String(briefing.id || 'fallback') + ':' + String(transmission.id || ('wave-' + minWave)),
        kind: 'transmission',
        speaker: transmission.speaker || briefing.speaker || 'OPS',
        title: 'Transmission',
        text: transmission.text || '',
        durationMs: Number(runtimeConfig.transmissionDurationMs || 4200)
      });
    }
  }

  function queueGlobalTransmissions(narrativeState, snapshot){
    var level = Math.max(1, Number(snapshot.level) || 1);
    var globals = Array.isArray(runtimeConfig.globalTransmissions) ? runtimeConfig.globalTransmissions : [];
    for(var i = 0; i < globals.length; i++){
      var transmission = globals[i];
      var minLevel = Math.max(1, Number(transmission.minLevel) || 1);
      if(level < minLevel) continue;
      enqueueEvent(narrativeState, {
        key: 'global-transmission:' + String(transmission.id || ('level-' + minLevel)),
        kind: 'transmission',
        speaker: transmission.speaker || 'OPS',
        title: 'Transmission',
        text: transmission.text || '',
        durationMs: Number(runtimeConfig.transmissionDurationMs || 4200)
      });
    }
  }

  function queueExternalTransmissions(narrativeState, game){
    if(!narrativeState || !game) return;
    var externalQueue = game.__astroNarrativeExternalQueue;
    if(!Array.isArray(externalQueue) || externalQueue.length === 0) return;

    while(externalQueue.length > 0){
      var event = externalQueue.shift();
      if(!event) continue;
      enqueueEvent(narrativeState, {
        key: String(event.key || ''),
        kind: event.kind || 'transmission',
        speaker: event.speaker || 'OPS',
        title: event.title || 'Transmission',
        text: event.text || '',
        durationMs: Number(event.durationMs || runtimeConfig.transmissionDurationMs || 4200)
      });
    }
  }

  function createOverlay(host){
    if(!canUseDom() || !host) return null;
    ensureStyles();

    if(!host.style.position || host.style.position === 'static'){
      host.style.position = 'relative';
    }

    var root = document.createElement('div');
    root.className = 'ab-narrative-overlay';

    var card = document.createElement('div');
    card.className = 'ab-narrative-card';

    var speakerNode = document.createElement('div');
    speakerNode.className = 'ab-narrative-speaker';
    speakerNode.textContent = 'OPS';

    var titleNode = document.createElement('div');
    titleNode.className = 'ab-narrative-title';
    titleNode.textContent = 'Sector Briefing';

    var textNode = document.createElement('div');
    textNode.className = 'ab-narrative-text';
    textNode.textContent = '';

    card.appendChild(speakerNode);
    card.appendChild(titleNode);
    card.appendChild(textNode);
    root.appendChild(card);
    host.appendChild(root);

    return {
      root: root,
      speakerNode: speakerNode,
      titleNode: titleNode,
      textNode: textNode
    };
  }

  function updateNarrative(narrativeState, game){
    if(!narrativeState || !game || typeof game.getTestHooks !== 'function') return;

    var hooks = game.getTestHooks();
    if(!hooks || typeof hooks.getState !== 'function') return;

    var snapshot = null;
    try{
      snapshot = hooks.getState();
    }catch(e){
      return;
    }
    if(!snapshot || snapshot.gameOver) return;

    queueSectorIntro(narrativeState, snapshot);
    queueSectorTransmissions(narrativeState, snapshot);
    queueGlobalTransmissions(narrativeState, snapshot);
    queueExternalTransmissions(narrativeState, game);
    showNextEvent(narrativeState);
  }

  function installNarrativeOverlay(game, container){
    var overlay = createOverlay(container);
    if(!overlay) return null;

    var narrativeState = {
      root: overlay.root,
      speakerNode: overlay.speakerNode,
      titleNode: overlay.titleNode,
      textNode: overlay.textNode,
      queue: [],
      seen: {},
      maxQueueSize: Math.max(2, Number(runtimeConfig.maxQueueSize) || 8),
      lastSectorKey: null,
      activeUntil: 0,
      timer: null
    };

    narrativeState.timer = setInterval(function(){
      updateNarrative(narrativeState, game);
    }, Math.max(120, Number(runtimeConfig.pollIntervalMs) || 240));

    setTimeout(function(){
      updateNarrative(narrativeState, game);
    }, 0);

    return narrativeState;
  }

  function removeNarrativeOverlay(narrativeState){
    if(!narrativeState) return;
    if(narrativeState.timer){
      clearInterval(narrativeState.timer);
      narrativeState.timer = null;
    }
    if(narrativeState.root && narrativeState.root.parentNode){
      narrativeState.root.parentNode.removeChild(narrativeState.root);
    }
  }

  function resolveOverlayHost(container){
    if(game && game.__astroIntelPanel && game.__astroIntelPanel.overlayHost){
      return game.__astroIntelPanel.overlayHost;
    }
    if(game && game.__astroIntelPanel && game.__astroIntelPanel.gameHost){
      return game.__astroIntelPanel.gameHost;
    }
    return container;
  }

  function patchGameInitDestroy(){
    if(!game || typeof game.init !== 'function' || typeof game.destroy !== 'function') return;
    if(game.__astroNarrativePatched) return;
    game.__astroNarrativePatched = true;

    var originalInit = game.init;
    var originalDestroy = game.destroy;

    game.init = function(container, shared){
      var result = originalInit.call(game, container, shared);

      if(game.__astroNarrativeOverlay){
        removeNarrativeOverlay(game.__astroNarrativeOverlay);
        game.__astroNarrativeOverlay = null;
      }

      if(canUseDom() && container){
        var host = resolveOverlayHost(container);
        game.__astroNarrativeOverlay = installNarrativeOverlay(game, host);
      }

      return result;
    };

    game.destroy = function(){
      var result = originalDestroy.call(game);
      if(game.__astroNarrativeOverlay){
        removeNarrativeOverlay(game.__astroNarrativeOverlay);
        game.__astroNarrativeOverlay = null;
      }
      return result;
    };
  }

  patchGameInitDestroy();
})();
`;
}

export const narrativeRuntimeModule = {
  id: 'narrative-runtime',
  priority: 38,
  description: 'Adds non-blocking sector briefings and transmission overlays during active gameplay.',
  apply(artifact){
    artifact.runtimePatch.runtime = artifact.runtimePatch.runtime || {};
    artifact.runtimePatch.runtime.narrative = {
      module: 'narrative-runtime',
      status: 'active',
      style: 'non-blocking-overlay',
      pollIntervalMs: narrativeRuntimeConfig.pollIntervalMs
    };
    artifact.runtimePatch.narrative = cloneSerializable(narrativeRuntimeConfig.briefings);
    artifact.runtimePatch.narrativeGlobalTransmissions = cloneSerializable(narrativeRuntimeConfig.globalTransmissions);

    artifact.runtimeSnippets = artifact.runtimeSnippets || [];
    artifact.runtimeSnippets.push(buildRuntimeSnippet(narrativeRuntimeConfig));
    return artifact;
  }
};
