import { cloneSerializable } from '../framework/clone-serializable.mjs';

const combatIntelPanelConfig = Object.freeze({
  layout: {
    desktopMinWidth: 980,
    mobileModeOnIOS: true,
    toggleHotkey: 'i'
  },
  sectionOrder: {
    left: ['players', 'enemies'],
    right: ['weapons', 'bullets', 'explosions']
  },
  sectionTitles: {
    players: 'Player Types',
    enemies: 'Enemy Types',
    weapons: 'Weapon Types',
    bullets: 'Bullet Types',
    explosions: 'Explosion Types'
  },
  sections: {
    players: [
      { id: 'pilot-mk1', label: 'Pilot MK-I', color: '#67ff88', shape: 'Tri-Delta', glyph: '▲', animation: 'pulse', trait: 'Baseline hull and speed profile.' },
      { id: 'pilot-overdrive', label: 'Pilot MK-II', color: '#73f8ff', shape: 'Twin-Wing', glyph: '△', animation: 'glow', trait: 'Power level 2 with side emitters.' },
      { id: 'pilot-apex', label: 'Pilot MK-III', color: '#fff08f', shape: 'Tri-Wing', glyph: '✦', animation: 'pulse', trait: 'Power level 3 with dense spread.' },
      { id: 'pilot-invuln', label: 'Invuln State', color: '#ffffff', shape: 'Blink Shield', glyph: '◉', animation: 'blink', trait: 'Post-hit invulnerability frames.' }
    ],
    enemies: [
      { id: 'scout', label: 'Scout', color: '#ff5b6e', shape: 'Block Scout', glyph: '▣', animation: 'float', trait: 'Fast opener with single shots.' },
      { id: 'zigzag', label: 'Zigzag', color: '#ff3fa2', shape: 'Zig Strider', glyph: '◇', animation: 'shake', trait: 'Wide lateral movement and split shots.' },
      { id: 'tank', label: 'Tank', color: '#ff9f40', shape: 'Heavy Block', glyph: '▤', animation: 'pulse', trait: 'High HP, burst volley pressure.' },
      { id: 'sniper', label: 'Sniper', color: '#b28cff', shape: 'Hover Node', glyph: '◆', animation: 'glow', trait: 'Aimed lance fire at player vector.' },
      { id: 'dive', label: 'Dive', color: '#ffe066', shape: 'Dive Wedge', glyph: '▼', animation: 'float', trait: 'Dive-bomb motion spikes.' },
      { id: 'carrier', label: 'Carrier', color: '#ff4de3', shape: 'Carrier Barge', glyph: '▦', animation: 'pulse', trait: 'Fan-fire boss-lite encounter.' }
    ],
    weapons: [
      { id: 'pulse-core', label: 'Pulse Core', color: '#fff08f', shape: 'Forward Beam', glyph: '┃', animation: 'glow', trait: 'Primary centerline stream.' },
      { id: 'side-lances', label: 'Side Lances', color: '#7efcff', shape: 'Dual Offsets', glyph: '∥', animation: 'pulse', trait: 'Unlocked at power level 2.' },
      { id: 'wing-spears', label: 'Wing Spears', color: '#ffde59', shape: 'Angled Pair', glyph: '⟋', animation: 'float', trait: 'Unlocked at power level 3.' },
      { id: 'weapon-jam', label: 'Jam State', color: '#ff5b6e', shape: 'Suppression', glyph: '✖', animation: 'blink', trait: 'Hazard locks firing briefly.' }
    ],
    bullets: [
      { id: 'enemy-single', label: 'Single Ember', color: '#ff8f00', shape: 'Linear', glyph: '•', animation: 'pulse', trait: 'Basic enemy shot line.' },
      { id: 'enemy-spread', label: 'Split Arc', color: '#ff7f50', shape: 'Twin Diverge', glyph: '⋰', animation: 'shake', trait: 'Spread pattern from zigzag foes.' },
      { id: 'enemy-burst', label: 'Burst Trio', color: '#ffbf40', shape: '3-Round Burst', glyph: '⋮', animation: 'glow', trait: 'Tank burst pattern.' },
      { id: 'enemy-aim', label: 'Aim Lance', color: '#ff5252', shape: 'Tracking Vector', glyph: '↘', animation: 'blink', trait: 'Sniper aimed shot.' },
      { id: 'enemy-fan', label: 'Fan Volley', color: '#ff79f2', shape: 'Arc Spread', glyph: '⌒', animation: 'float', trait: 'Carrier radial fan.' }
    ],
    explosions: [
      { id: 'hit-spark', label: 'Hit Spark', color: '#ff9f40', shape: 'Micro Ring', glyph: '◌', animation: 'pulse', trait: 'Minor impact confirmation.' },
      { id: 'kill-burst', label: 'Kill Burst', color: '#ffb347', shape: 'Shard Cloud', glyph: '✹', animation: 'spin', trait: 'Default enemy elimination burst.' },
      { id: 'carrier-breach', label: 'Carrier Breach', color: '#ff4de3', shape: 'Heavy Burst', glyph: '✸', animation: 'spin', trait: 'Large force explosion profile.' },
      { id: 'hull-rupture', label: 'Hull Rupture', color: '#ff5f56', shape: 'Player Crash', glyph: '✶', animation: 'blink', trait: 'Player damage blast signature.' },
      { id: 'shock-ring', label: 'Shock Ring', color: '#7df2ff', shape: 'Expanding Ring', glyph: '◎', animation: 'pulse', trait: 'Ring overlay from explosion core.' }
    ]
  }
});

function buildRuntimeSnippet(config){
  const runtimeJson = JSON.stringify(config, null, 2);
  return `
(function(){
  var runtimeConfig = ${runtimeJson};

  function canUseDom(){
    return typeof document !== 'undefined' && typeof document.createElement === 'function';
  }

  function isIosDevice(){
    if(typeof navigator === 'undefined') return false;
    var ua = String(navigator.userAgent || '');
    var platform = String(navigator.platform || '');
    var touchPoints = Number(navigator.maxTouchPoints || 0);
    return /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && touchPoints > 1);
  }

  function shouldUseMobileLayout(){
    if(!canUseDom()) return false;
    var minWidth = Number(runtimeConfig.layout && runtimeConfig.layout.desktopMinWidth);
    if(!isFinite(minWidth) || minWidth <= 0) minWidth = 980;
    var isNarrow = typeof window !== 'undefined' ? window.innerWidth < minWidth : false;
    var forceIos = !!(runtimeConfig.layout && runtimeConfig.layout.mobileModeOnIOS && isIosDevice());
    return forceIos || isNarrow;
  }

  function ensureStyles(){
    if(!canUseDom()) return;
    if(document.getElementById('ab-intel-panel-style')) return;

    var style = document.createElement('style');
    style.id = 'ab-intel-panel-style';
    style.textContent = [
      '.ab-intel-layout{width:100%;height:100%;display:flex;align-items:stretch;justify-content:center;gap:12px;padding:8px;box-sizing:border-box;}',
      '.ab-intel-layout.is-mobile-layout{flex-direction:column;gap:8px;padding:6px;}',
      '.ab-intel-column{width:220px;max-height:100%;overflow:auto;background:rgba(7,10,20,0.92);border:1px solid #274465;border-radius:10px;padding:8px;box-shadow:0 0 14px rgba(0,0,0,0.35);}',
      '.ab-intel-layout.is-mobile-layout .ab-intel-column{width:100%;max-height:176px;}',
      '.ab-intel-center{position:relative;display:flex;justify-content:center;align-items:center;min-width:0;}',
      '.ab-intel-game-host{position:relative;}',
      '.ab-intel-toggle{position:absolute;top:6px;right:6px;z-index:40;border:1px solid #4b799f;background:rgba(7,20,38,0.92);color:#9fe8ff;font:11px monospace;padding:4px 8px;border-radius:6px;cursor:pointer;}',
      '.ab-intel-toggle:hover{border-color:#79deff;color:#d9f7ff;}',
      '.ab-intel-layout.is-intel-hidden .ab-intel-column{display:none;}',
      '.ab-intel-layout.is-intel-hidden{padding:0;gap:0;}',
      '.ab-intel-layout.is-intel-hidden .ab-intel-toggle{top:8px;right:8px;}',
      '.ab-intel-head{font:12px monospace;color:#9fe8ff;margin-bottom:6px;letter-spacing:0.4px;text-transform:uppercase;}',
      '.ab-intel-section{margin-bottom:10px;border-top:1px solid rgba(114,171,222,0.24);padding-top:8px;}',
      '.ab-intel-section:first-child{border-top:none;padding-top:0;}',
      '.ab-intel-section-title{font:11px monospace;color:#8dd9ff;margin-bottom:4px;}',
      '.ab-intel-table{width:100%;border-collapse:collapse;font:10px/1.25 monospace;color:#d7ecff;}',
      '.ab-intel-table td,.ab-intel-table th{padding:3px 2px;border-bottom:1px solid rgba(113,154,196,0.14);vertical-align:middle;}',
      '.ab-intel-table th{font-size:9px;color:#79b8dc;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;}',
      '.ab-intel-swatch{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:4px;border:1px solid rgba(255,255,255,0.28);font-size:12px;font-weight:700;color:#031018;box-shadow:0 0 7px rgba(0,0,0,0.3);}',
      '.ab-intel-swatch.is-pulse{animation:abIntelPulse 1.2s ease-in-out infinite;}',
      '.ab-intel-swatch.is-spin{animation:abIntelSpin 1.6s linear infinite;}',
      '.ab-intel-swatch.is-float{animation:abIntelFloat 1.5s ease-in-out infinite;}',
      '.ab-intel-swatch.is-blink{animation:abIntelBlink 0.9s step-start infinite;}',
      '.ab-intel-swatch.is-shake{animation:abIntelShake 0.8s linear infinite;}',
      '.ab-intel-swatch.is-glow{animation:abIntelGlow 1.4s ease-in-out infinite;}',
      '.ab-intel-live{display:grid;grid-template-columns:auto 1fr;gap:4px 8px;font:11px monospace;color:#bee9ff;margin-bottom:6px;}',
      '.ab-intel-live-key{color:#74b2d6;}',
      '.ab-intel-live-val{color:#d9f6ff;}',
      '@keyframes abIntelPulse{0%,100%{transform:scale(1);}50%{transform:scale(1.12);}}',
      '@keyframes abIntelSpin{0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}',
      '@keyframes abIntelFloat{0%,100%{transform:translateY(0);}50%{transform:translateY(-2px);}}',
      '@keyframes abIntelBlink{0%,45%{opacity:1;}46%,100%{opacity:0.3;}}',
      '@keyframes abIntelShake{0%,100%{transform:translateX(0);}25%{transform:translateX(-1px);}75%{transform:translateX(1px);}}',
      '@keyframes abIntelGlow{0%,100%{filter:brightness(1);}50%{filter:brightness(1.25);}}'
    ].join('\\n');
    document.head.appendChild(style);
  }

  function createLiveBoard(){
    var wrap = document.createElement('div');
    wrap.className = 'ab-intel-live';

    function row(label){
      var key = document.createElement('div');
      key.className = 'ab-intel-live-key';
      key.textContent = label;
      var value = document.createElement('div');
      value.className = 'ab-intel-live-val';
      value.textContent = '--';
      wrap.appendChild(key);
      wrap.appendChild(value);
      return value;
    }

    return {
      node: wrap,
      values: {
        score: row('Score'),
        level: row('Level'),
        lives: row('Lives'),
        wave: row('Wave'),
        sector: row('Sector')
      }
    };
  }

  function createSwatch(entry){
    var swatch = document.createElement('span');
    var animation = entry.animation ? ' is-' + entry.animation : '';
    swatch.className = 'ab-intel-swatch' + animation;
    swatch.style.backgroundColor = entry.color || '#416181';
    swatch.textContent = entry.glyph || '•';
    swatch.title = entry.label || '';
    return swatch;
  }

  function createSection(title, entries){
    var section = document.createElement('section');
    section.className = 'ab-intel-section';

    var heading = document.createElement('div');
    heading.className = 'ab-intel-section-title';
    heading.textContent = title;
    section.appendChild(heading);

    var table = document.createElement('table');
    table.className = 'ab-intel-table';

    var thead = document.createElement('thead');
    var trh = document.createElement('tr');
    var headers = ['Tile', 'Type', 'Color', 'Shape'];
    var i;
    for(i = 0; i < headers.length; i++){
      var th = document.createElement('th');
      th.textContent = headers[i];
      trh.appendChild(th);
    }
    thead.appendChild(trh);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    for(i = 0; i < entries.length; i++){
      var row = entries[i];
      var tr = document.createElement('tr');

      var tileCell = document.createElement('td');
      tileCell.appendChild(createSwatch(row));

      var typeCell = document.createElement('td');
      typeCell.textContent = row.label || row.id || 'Unknown';
      typeCell.title = row.trait || '';

      var colorCell = document.createElement('td');
      colorCell.textContent = row.color || '-';

      var shapeCell = document.createElement('td');
      shapeCell.textContent = row.shape || '-';

      tr.appendChild(tileCell);
      tr.appendChild(typeCell);
      tr.appendChild(colorCell);
      tr.appendChild(shapeCell);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    section.appendChild(table);
    return section;
  }

  function fillColumn(column, order){
    var sectionTitles = runtimeConfig.sectionTitles || {};
    var sectionData = runtimeConfig.sections || {};
    var i;
    for(i = 0; i < order.length; i++){
      var key = order[i];
      var rows = Array.isArray(sectionData[key]) ? sectionData[key] : [];
      if(rows.length === 0) continue;
      column.appendChild(createSection(sectionTitles[key] || key, rows));
    }
  }

  function installCombatIntelPanel(gameRef, hostContainer){
    if(!canUseDom() || !hostContainer) return null;

    ensureStyles();

    var root = document.createElement('div');
    root.className = 'ab-intel-layout';

    var leftCol = document.createElement('aside');
    leftCol.className = 'ab-intel-column';
    var leftHead = document.createElement('div');
    leftHead.className = 'ab-intel-head';
    leftHead.textContent = 'Combat Intel A';
    leftCol.appendChild(leftHead);

    var rightCol = document.createElement('aside');
    rightCol.className = 'ab-intel-column';
    var rightHead = document.createElement('div');
    rightHead.className = 'ab-intel-head';
    rightHead.textContent = 'Combat Intel B';
    rightCol.appendChild(rightHead);

    var center = document.createElement('section');
    center.className = 'ab-intel-center';
    var gameHost = document.createElement('div');
    gameHost.className = 'ab-intel-game-host';
    center.appendChild(gameHost);

    var toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'ab-intel-toggle';
    toggleBtn.textContent = 'Hide Intel';
    toggleBtn.title = 'Toggle combat intel panel';
    center.appendChild(toggleBtn);

    var liveBoard = createLiveBoard();
    leftCol.appendChild(liveBoard.node);

    fillColumn(leftCol, (runtimeConfig.sectionOrder && runtimeConfig.sectionOrder.left) || []);
    fillColumn(rightCol, (runtimeConfig.sectionOrder && runtimeConfig.sectionOrder.right) || []);

    root.appendChild(leftCol);
    root.appendChild(center);
    root.appendChild(rightCol);
    hostContainer.appendChild(root);

    var intelState = {
      root: root,
      hostContainer: hostContainer,
      gameHost: gameHost,
      toggleBtn: toggleBtn,
      hidden: false,
      liveBoard: liveBoard,
      updateTimer: null,
      onResize: null,
      onOrientation: null,
      onKeyToggle: null
    };

    function applyLayoutMode(){
      root.classList.toggle('is-mobile-layout', shouldUseMobileLayout());
    }

    function applyHiddenMode(){
      root.classList.toggle('is-intel-hidden', !!intelState.hidden);
      toggleBtn.textContent = intelState.hidden ? 'Show Intel' : 'Hide Intel';
    }

    function updateLiveBoard(){
      var hooks = gameRef && typeof gameRef.getTestHooks === 'function' ? gameRef.getTestHooks() : null;
      if(!hooks || typeof hooks.getState !== 'function') return;

      var snapshot = null;
      try{
        snapshot = hooks.getState();
      }catch(e){
        return;
      }
      if(!snapshot || typeof snapshot !== 'object') return;

      function setField(field, value){
        if(!intelState.liveBoard || !intelState.liveBoard.values || !intelState.liveBoard.values[field]) return;
        intelState.liveBoard.values[field].textContent = String(value);
      }

      setField('score', Number(snapshot.score || 0));
      setField('level', Number(snapshot.level || 0));
      setField('lives', Number(snapshot.lives || 0));
      setField('wave', Number(snapshot.wave || 0));
      setField('sector', snapshot.sector || 'Unknown');
    }

    toggleBtn.onclick = function(){
      intelState.hidden = !intelState.hidden;
      applyHiddenMode();
    };

    intelState.onKeyToggle = function(e){
      if(!e) return;
      var key = String(e.key || '').toLowerCase();
      var hotkey = String((runtimeConfig.layout && runtimeConfig.layout.toggleHotkey) || 'i').toLowerCase();
      if(key !== hotkey) return;
      intelState.hidden = !intelState.hidden;
      applyHiddenMode();
    };

    if(typeof document !== 'undefined' && document.addEventListener){
      document.addEventListener('keydown', intelState.onKeyToggle);
    }

    intelState.onResize = function(){ applyLayoutMode(); };
    intelState.onOrientation = function(){ applyLayoutMode(); };
    if(typeof window !== 'undefined' && window.addEventListener){
      window.addEventListener('resize', intelState.onResize);
      window.addEventListener('orientationchange', intelState.onOrientation);
    }

    applyLayoutMode();
    applyHiddenMode();
    setTimeout(updateLiveBoard, 0);
    intelState.updateTimer = setInterval(updateLiveBoard, 240);

    return intelState;
  }

  function removeCombatIntelPanel(intelState){
    if(!intelState) return;
    if(intelState.updateTimer){
      clearInterval(intelState.updateTimer);
      intelState.updateTimer = null;
    }

    if(typeof window !== 'undefined' && window.removeEventListener){
      if(intelState.onResize){
        window.removeEventListener('resize', intelState.onResize);
      }
      if(intelState.onOrientation){
        window.removeEventListener('orientationchange', intelState.onOrientation);
      }
    }

    if(typeof document !== 'undefined' && document.removeEventListener && intelState.onKeyToggle){
      document.removeEventListener('keydown', intelState.onKeyToggle);
    }

    if(intelState.root && intelState.root.parentNode){
      intelState.root.parentNode.removeChild(intelState.root);
    }
  }

  function patchGameInitDestroy(){
    if(!game || typeof game.init !== 'function' || typeof game.destroy !== 'function') return;
    if(game.__astroIntelPanelPatched) return;
    game.__astroIntelPanelPatched = true;

    var originalInit = game.init;
    var originalDestroy = game.destroy;

    game.init = function(container, shared){
      if(!canUseDom() || !container){
        return originalInit.call(game, container, shared);
      }

      if(game.__astroIntelPanel){
        removeCombatIntelPanel(game.__astroIntelPanel);
        game.__astroIntelPanel = null;
      }

      var intelState = installCombatIntelPanel(game, container);
      var initTarget = intelState && intelState.gameHost ? intelState.gameHost : container;
      game.__astroIntelPanel = intelState;

      return originalInit.call(game, initTarget, shared);
    };

    game.destroy = function(){
      var result = originalDestroy.call(game);
      if(game.__astroIntelPanel){
        removeCombatIntelPanel(game.__astroIntelPanel);
        game.__astroIntelPanel = null;
      }
      return result;
    };
  }

  patchGameInitDestroy();
})();
`;
}

export const combatIntelPanelModule = {
  id: 'combat-intel-panel',
  priority: 39,
  description: 'Adds a toggleable combat intel panel with entity/trait tables around gameplay.',
  apply(artifact){
    artifact.runtimePatch.runtime = artifact.runtimePatch.runtime || {};
    artifact.runtimePatch.runtime.combatIntelPanel = {
      module: 'combat-intel-panel',
      status: 'active',
      displayModes: ['desktop-side-columns', 'ios-top-bottom'],
      toggleHotkey: combatIntelPanelConfig.layout.toggleHotkey
    };
    artifact.runtimePatch.combatIntelPanel = cloneSerializable(combatIntelPanelConfig.sections);
    artifact.runtimePatch.combatIntelPanelLayout = cloneSerializable(combatIntelPanelConfig.layout);

    artifact.runtimeSnippets = artifact.runtimeSnippets || [];
    artifact.runtimeSnippets.push(buildRuntimeSnippet(combatIntelPanelConfig));
    return artifact;
  }
};
