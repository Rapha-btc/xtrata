import { cloneSerializable } from '../framework/clone-serializable.mjs';

const threatBriefingRuntimeConfig = Object.freeze({
  pollIntervalMs: 180,
  displayDurationMs: 3200,
  fadeMs: 220,
  maxTypesShown: 3
});

function buildRuntimeSnippet(config){
  const runtimeJson = JSON.stringify(config, null, 2);
  return `
(function(){
  var runtimeConfig = ${runtimeJson};

  function canUseDom(){
    return typeof document !== 'undefined' && typeof document.createElement === 'function';
  }

  function normalizeEnemyType(type){
    var raw = String(type || 'unknown').replace(/[_-]+/g, ' ');
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  function summarizeWaveThreat(wave){
    if(!wave || !Array.isArray(wave.enemies) || wave.enemies.length === 0){
      return null;
    }

    var counts = {};
    for(var i = 0; i < wave.enemies.length; i++){
      var enemy = wave.enemies[i] || {};
      var type = String(enemy.type || 'unknown');
      counts[type] = (counts[type] || 0) + 1;
    }

    var rows = [];
    var total = wave.enemies.length;
    for(var key in counts){
      if(!counts.hasOwnProperty(key)) continue;
      rows.push({ type: key, count: counts[key] });
    }
    rows.sort(function(a, b){
      if(b.count !== a.count) return b.count - a.count;
      return String(a.type).localeCompare(String(b.type));
    });

    var maxTypes = Math.max(1, Number(runtimeConfig.maxTypesShown) || 3);
    var topRows = rows.slice(0, maxTypes);
    var parts = [];
    for(var j = 0; j < topRows.length; j++){
      parts.push(normalizeEnemyType(topRows[j].type) + ' x' + topRows[j].count);
    }

    return {
      total: total,
      mixLine: parts.join(' | ')
    };
  }

  function wrapWaveBuilder(game){
    var hooks = game.__astroV2RuntimeHooks || {};
    var runtime = hooks.waveProgression || null;
    if(!runtime || typeof runtime.buildWaveSpec !== 'function') return;
    if(runtime.__astroThreatBriefingWrapped) return;

    var originalBuildWaveSpec = runtime.buildWaveSpec;
    runtime.buildWaveSpec = function(payload){
      var wave = originalBuildWaveSpec(payload);
      var summary = summarizeWaveThreat(wave);
      game.__astroThreatPreview = {
        waveLabel: wave && wave.label ? String(wave.label) : '',
        sectorName: wave && wave.profile && wave.profile.sectorName ? String(wave.profile.sectorName) : '',
        summary: summary,
        createdAtMs: Date.now()
      };
      return wave;
    };

    runtime.__astroThreatBriefingWrapped = true;
    hooks.waveProgression = runtime;
    game.__astroV2RuntimeHooks = hooks;
    if(typeof game.setV2RuntimeHooks === 'function'){
      game.setV2RuntimeHooks(hooks);
    }
  }

  function ensureStyles(){
    if(!canUseDom()) return;
    if(document.getElementById('ab-threat-briefing-style')) return;

    var style = document.createElement('style');
    style.id = 'ab-threat-briefing-style';
    style.textContent = [
      '.ab-threat-briefing{position:absolute;left:50%;top:78px;transform:translateX(-50%);width:min(90%,380px);z-index:23;pointer-events:none;opacity:0;transition:opacity 0.22s ease;}',
      '.ab-threat-briefing.is-visible{opacity:1;}',
      '.ab-intel-feed-host .ab-threat-briefing{position:relative;left:auto;top:auto;transform:none;width:100%;z-index:1;max-height:0;overflow:hidden;margin:0;}',
      '.ab-intel-feed-host .ab-threat-briefing.is-visible{max-height:190px;margin:0 0 2px;}',
      '.ab-threat-briefing-card{background:rgba(6,16,34,0.84);border:1px solid rgba(132,206,255,0.52);border-radius:9px;box-shadow:0 0 14px rgba(19,51,92,0.35);padding:8px 10px;color:#d8f0ff;font-family:monospace;}',
      '.ab-intel-feed-host .ab-threat-briefing-card{padding:7px 9px;box-shadow:0 0 10px rgba(19,51,92,0.3);}',
      '.ab-threat-briefing-head{font-size:10px;letter-spacing:0.45px;color:#87d8ff;text-transform:uppercase;margin-bottom:3px;}',
      '.ab-threat-briefing-title{font-size:12px;color:#ffe59d;margin-bottom:4px;}',
      '.ab-threat-briefing-mix{font-size:11px;color:#d8f0ff;line-height:1.32;}',
      '.ab-threat-briefing-foot{font-size:10px;color:#99bfdc;margin-top:4px;}'
    ].join('\\n');
    document.head.appendChild(style);
  }

  function createOverlay(host){
    if(!canUseDom() || !host) return null;
    ensureStyles();

    if(!host.style.position || host.style.position === 'static'){
      host.style.position = 'relative';
    }

    var root = document.createElement('div');
    root.className = 'ab-threat-briefing';

    var card = document.createElement('div');
    card.className = 'ab-threat-briefing-card';

    var headNode = document.createElement('div');
    headNode.className = 'ab-threat-briefing-head';
    headNode.textContent = 'Threat Scan';

    var titleNode = document.createElement('div');
    titleNode.className = 'ab-threat-briefing-title';
    titleNode.textContent = '';

    var mixNode = document.createElement('div');
    mixNode.className = 'ab-threat-briefing-mix';
    mixNode.textContent = '';

    var footNode = document.createElement('div');
    footNode.className = 'ab-threat-briefing-foot';
    footNode.textContent = '';

    card.appendChild(headNode);
    card.appendChild(titleNode);
    card.appendChild(mixNode);
    card.appendChild(footNode);
    root.appendChild(card);
    host.appendChild(root);

    return {
      root: root,
      titleNode: titleNode,
      mixNode: mixNode,
      footNode: footNode
    };
  }

  function showBriefing(state, preview, snapshot){
    if(!state || !state.root) return;
    var summary = preview && preview.summary ? preview.summary : null;

    state.titleNode.textContent = (preview && preview.waveLabel) || ('Wave ' + String(snapshot && snapshot.wave ? snapshot.wave : '?'));
    state.mixNode.textContent = summary && summary.mixLine ? summary.mixLine : 'Enemy signatures unresolved';
    var total = summary && summary.total ? summary.total : 0;
    var sectorName = preview && preview.sectorName ? preview.sectorName : (snapshot && snapshot.sector ? snapshot.sector : 'Unknown Sector');
    state.footNode.textContent = 'Sector: ' + String(sectorName) + '  |  Contacts: ' + String(total);

    state.visibleUntil = Date.now() + Math.max(1200, Number(runtimeConfig.displayDurationMs) || 3200);
    state.root.classList.add('is-visible');
  }

  function updateOverlay(state, game){
    if(!state || !game) return;
    var hooks = typeof game.getTestHooks === 'function' ? game.getTestHooks() : null;
    if(!hooks || typeof hooks.getState !== 'function') return;

    var snapshot = null;
    try{
      snapshot = hooks.getState();
    }catch(e){
      return;
    }
    if(!snapshot) return;

    var wave = Math.max(0, Number(snapshot.wave) || 0);
    if(!snapshot.gameOver && wave !== state.lastWave){
      state.lastWave = wave;
      showBriefing(state, game.__astroThreatPreview || null, snapshot);
    }

    if(state.visibleUntil > 0 && Date.now() > state.visibleUntil){
      state.visibleUntil = 0;
      state.root.classList.remove('is-visible');
    }
  }

  function installThreatBriefingOverlay(game, container){
    var overlay = createOverlay(container);
    if(!overlay) return null;

    var state = {
      root: overlay.root,
      titleNode: overlay.titleNode,
      mixNode: overlay.mixNode,
      footNode: overlay.footNode,
      lastWave: -1,
      visibleUntil: 0,
      timer: null
    };

    state.timer = setInterval(function(){
      updateOverlay(state, game);
    }, Math.max(120, Number(runtimeConfig.pollIntervalMs) || 180));

    setTimeout(function(){
      updateOverlay(state, game);
    }, 0);

    return state;
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

  function removeThreatBriefingOverlay(state){
    if(!state) return;
    if(state.timer){
      clearInterval(state.timer);
      state.timer = null;
    }
    if(state.root && state.root.parentNode){
      state.root.parentNode.removeChild(state.root);
    }
  }

  function patchGameInitDestroy(){
    if(!game || typeof game.init !== 'function' || typeof game.destroy !== 'function') return;
    if(game.__astroThreatBriefingPatched) return;
    game.__astroThreatBriefingPatched = true;

    wrapWaveBuilder(game);

    var originalInit = game.init;
    var originalDestroy = game.destroy;

    game.init = function(container, shared){
      var result = originalInit.call(game, container, shared);

      if(game.__astroThreatBriefingOverlay){
        removeThreatBriefingOverlay(game.__astroThreatBriefingOverlay);
        game.__astroThreatBriefingOverlay = null;
      }
      if(canUseDom() && container){
        var host = resolveOverlayHost(container);
        game.__astroThreatBriefingOverlay = installThreatBriefingOverlay(game, host);
      }

      return result;
    };

    game.destroy = function(){
      var result = originalDestroy.call(game);
      if(game.__astroThreatBriefingOverlay){
        removeThreatBriefingOverlay(game.__astroThreatBriefingOverlay);
        game.__astroThreatBriefingOverlay = null;
      }
      return result;
    };
  }

  patchGameInitDestroy();
})();
`;
}

export const threatBriefingRuntimeModule = {
  id: 'threat-briefing-runtime',
  priority: 37,
  description: 'Adds non-blocking pre-wave threat briefing cards with enemy composition previews.',
  apply(artifact){
    artifact.runtimePatch.runtime = artifact.runtimePatch.runtime || {};
    artifact.runtimePatch.runtime.threatBriefing = {
      module: 'threat-briefing-runtime',
      status: 'active',
      style: 'non-blocking-overlay',
      maxTypesShown: threatBriefingRuntimeConfig.maxTypesShown
    };
    artifact.runtimePatch.threatBriefingConfig = cloneSerializable(threatBriefingRuntimeConfig);

    artifact.runtimeSnippets = artifact.runtimeSnippets || [];
    artifact.runtimeSnippets.push(buildRuntimeSnippet(threatBriefingRuntimeConfig));
    return artifact;
  }
};
