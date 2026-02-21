import { cloneSerializable } from '../framework/clone-serializable.mjs';
import { rewardCatalog } from '../catalogs/rewards.mjs';
import { hazardCatalog } from '../catalogs/hazards.mjs';

const rewardDropIntelMap = Object.freeze({
  reward_supply_cache: {
    label: 'Supply Cache',
    shape: 'Repair Crate',
    effectLabel: '+1 life',
    glyph: '+',
    color: '#7efcff',
    team: 'player',
    animation: 'pulse'
  },
  reward_proto_upgrade: {
    label: 'Prototype Upgrade',
    shape: 'Power Crate',
    effectLabel: 'Spread power +1',
    glyph: 'P',
    color: '#fff08f',
    team: 'player',
    animation: 'glow'
  },
  reward_thruster_module: {
    label: 'Thruster Module',
    shape: 'Mobility Crate',
    effectLabel: 'Unlocks up/down',
    glyph: 'T',
    color: '#73f8ff',
    team: 'player',
    animation: 'float'
  },
  reward_weapon_multiplier: {
    label: 'Weapon Multiplier',
    shape: 'Core Pickup',
    effectLabel: 'Faster fire tier',
    glyph: 'M',
    color: '#ffd66e',
    team: 'player',
    animation: 'pulse'
  },
  reward_aegis_shell: {
    label: 'Aegis Shell',
    shape: 'Defense Crate',
    effectLabel: 'Shield charge',
    glyph: 'S',
    color: '#7df2ff',
    team: 'player',
    animation: 'glow'
  }
});

function formatHazardEffects(effects){
  var e = effects || {};
  var parts = [];
  if(Number(e.weaponJamFrames) > 0){
    parts.push('jam ' + (Number(e.weaponJamFrames) / 60).toFixed(1) + 's');
  }
  if(Number(e.radialProjectiles) > 0){
    parts.push('shard burst x' + Math.floor(Number(e.radialProjectiles)));
  }
  if(Number(e.moveSpeedMultiplier) > 0 && Number(e.moveSpeedMultiplier) < 1){
    parts.push('slow ' + Math.round((1 - Number(e.moveSpeedMultiplier)) * 100) + '%');
  }
  if(Number(e.enemyBudgetBonus) > 0){
    parts.push('ambush +' + Math.floor(Number(e.enemyBudgetBonus)) + ' threat');
  }
  return parts.join(', ') || 'Hostile status effect';
}

function buildDropsSectionEntries(){
  var entries = [];
  var i;

  for(i = 0; i < rewardCatalog.length; i++){
    var reward = rewardCatalog[i];
    if(!reward || !reward.id) continue;
    var mapped = rewardDropIntelMap[reward.id];
    if(!mapped) continue;
    entries.push({
      id: 'drop-' + reward.id,
      label: mapped.label,
      color: mapped.color,
      shape: mapped.shape,
      effectLabel: mapped.effectLabel,
      glyph: mapped.glyph,
      animation: mapped.animation,
      team: mapped.team,
      trait: reward.outcome || mapped.effectLabel
    });
  }

  for(i = 0; i < hazardCatalog.length; i++){
    var hazard = hazardCatalog[i];
    if(!hazard || !hazard.id) continue;
    entries.push({
      id: 'drop-' + hazard.id,
      label: hazard.label || 'Hazard',
      color: '#ff6f86',
      shape: 'Hazard Crate',
      effectLabel: formatHazardEffects(hazard.effects),
      glyph: '!',
      animation: 'blink',
      team: 'enemy',
      trait: (hazard.summary || 'Negative effect') + ' ' + formatHazardEffects(hazard.effects)
    });
  }

  return entries;
}

const combatIntelPanelConfig = Object.freeze({
  layout: {
    desktopMinWidth: 980,
    mobileModeOnIOS: true,
    toggleHotkey: 'i'
  },
  sectionOrder: {
    left: ['players', 'enemies'],
    right: ['weapons', 'upgrades', 'drops', 'bullets', 'explosions']
  },
  sectionTitles: {
    players: 'Player Types',
    enemies: 'Enemy Types',
    weapons: 'Weapon Types',
    upgrades: 'Upgrade Patterns',
    drops: 'Drops & Crates',
    bullets: 'Bullet Types',
    explosions: 'Explosion Types'
  },
  sectionTeams: {
    players: 'player',
    enemies: 'enemy',
    upgrades: 'player',
    bullets: 'enemy'
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
      { id: 'pulse-core', label: 'Pulse Core', color: '#fff08f', shape: 'Forward Beam', glyph: '┃', animation: 'glow', team: 'player', trait: 'Primary centerline stream.' },
      { id: 'side-lances', label: 'Side Lances', color: '#7efcff', shape: 'Dual Offsets', glyph: '∥', animation: 'pulse', team: 'player', trait: 'Unlocked at power level 2.' },
      { id: 'wing-spears', label: 'Wing Spears', color: '#ffde59', shape: 'Angled Pair', glyph: '⟋', animation: 'float', team: 'player', trait: 'Unlocked at power level 3.' },
      { id: 'weapon-jam', label: 'Jam State', color: '#ff5b6e', shape: 'Suppression', glyph: '✖', animation: 'blink', team: 'enemy', trait: 'Hazard locks firing briefly.' }
    ],
    upgrades: [
      { id: 'upgrade-triple-volley', label: 'Triple Volley', color: '#fff08f', shape: '3x Forward', visual: 'triple-volley', trait: 'Adds central triple-shot burst pattern.' },
      { id: 'upgrade-overhead-spread', label: 'Overhead Spread', color: '#7efcff', shape: 'Top Split', visual: 'overhead-spread', trait: 'Projectiles split downward from overhead lane.' },
      { id: 'upgrade-diagonal-lances', label: 'Diagonal Lances', color: '#ffde59', shape: 'Cross Angles', visual: 'diagonal-lances', trait: 'Adds diagonal wing lances to widen hitbox coverage.' },
      { id: 'upgrade-tracking-pulse', label: 'Tracking Pulse', color: '#ff5252', shape: 'Seek Target', visual: 'tracking-pulse', trait: 'Target-seeking pulse aligns to nearest hostile.' },
      { id: 'upgrade-arc-fan', label: 'Arc Fan', color: '#ff79f2', shape: 'Fan Arc', visual: 'arc-fan', trait: 'Wide fan burst for crowd pressure.' }
    ],
    drops: buildDropsSectionEntries(),
    bullets: [
      { id: 'enemy-single', label: 'Single Lance', color: '#ff8f00', shape: 'Linear Drop', glyph: '•', visual: 'single-lance', animation: 'pulse', trait: 'Basic enemy shot line.' },
      { id: 'enemy-spread', label: 'Split Arc', color: '#ff7f50', shape: 'Twin Diverge', glyph: '⋰', visual: 'split-lance', animation: 'shake', trait: 'Spread pattern from zigzag foes.' },
      { id: 'enemy-burst', label: 'Burst Trio', color: '#ffbf40', shape: '3-Round Burst', glyph: '⋮', visual: 'burst-stack', animation: 'glow', trait: 'Tank burst pattern.' },
      { id: 'enemy-aim', label: 'Aim Lance', color: '#ff5252', shape: 'Tracking Vector', glyph: '↘', visual: 'aim-lance', animation: 'blink', trait: 'Sniper aimed shot.' },
      { id: 'enemy-fan', label: 'Fan Volley', color: '#ff79f2', shape: 'Arc Spread', glyph: '⌒', visual: 'fan-volley', animation: 'float', trait: 'Carrier radial fan.' }
    ],
    explosions: [
      { id: 'hit-spark', label: 'Hit Spark', color: '#ff9f40', shape: 'Micro Ring', visual: 'hit-spark', trait: 'Minor impact confirmation.' },
      { id: 'kill-burst', label: 'Kill Burst', color: '#ffb347', shape: 'Shard Cloud', visual: 'kill-burst', trait: 'Default enemy elimination burst.' },
      { id: 'carrier-breach', label: 'Carrier Breach', color: '#ff4de3', shape: 'Heavy Burst', visual: 'carrier-breach', trait: 'Large force explosion profile.' },
      { id: 'hull-rupture', label: 'Hull Rupture', color: '#ff5f56', shape: 'Player Crash', visual: 'hull-rupture', trait: 'Player damage blast signature.' },
      { id: 'shock-ring', label: 'Shock Ring', color: '#7df2ff', shape: 'Expanding Ring', visual: 'shock-ring', trait: 'Ring overlay from explosion core.' }
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
      '.ab-intel-swatch{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:4px;border:1px solid rgba(138,185,224,0.46);background:rgba(14,24,38,0.94);font-size:12px;font-weight:700;color:var(--intel-accent-color,#9fe8ff);text-shadow:0 0 4px rgba(0,0,0,0.6);box-shadow:0 0 7px rgba(0,0,0,0.3);}',
      '.ab-intel-swatch.is-pulse{animation:abIntelPulse 1.2s ease-in-out infinite;}',
      '.ab-intel-swatch.is-spin{animation:abIntelSpin 1.6s linear infinite;}',
      '.ab-intel-swatch.is-float{animation:abIntelFloat 1.5s ease-in-out infinite;}',
      '.ab-intel-swatch.is-blink{animation:abIntelBlink 0.9s step-start infinite;}',
      '.ab-intel-swatch.is-shake{animation:abIntelShake 0.8s linear infinite;}',
      '.ab-intel-swatch.is-glow{animation:abIntelGlow 1.4s ease-in-out infinite;}',
      '.ab-intel-swatch.is-team-player{background:rgba(24,42,76,0.93);border-color:rgba(118,186,255,0.7);box-shadow:inset 0 0 0 1px rgba(166,214,255,0.2),0 0 7px rgba(29,91,176,0.38);}',
      '.ab-intel-swatch.is-team-enemy{background:rgba(78,28,36,0.93);border-color:rgba(255,132,132,0.7);box-shadow:inset 0 0 0 1px rgba(255,188,188,0.2),0 0 7px rgba(176,44,60,0.38);}',
      '.ab-intel-swatch.is-bullet{position:relative;overflow:hidden;background:rgba(3,16,26,0.92);color:transparent;}',
      '.ab-intel-swatch.is-upgrade{position:relative;overflow:hidden;background:rgba(5,20,34,0.92);color:transparent;}',
      '.ab-intel-swatch.is-explosion{position:relative;overflow:hidden;background:rgba(20,8,10,0.9);color:transparent;}',
      '.ab-intel-swatch.is-preview-canvas{position:relative;overflow:hidden;padding:0;background:rgba(5,16,28,0.95);}',
      '.ab-intel-preview-canvas{display:block;width:18px;height:18px;image-rendering:pixelated;}',
      '.ab-intel-shot-line{position:absolute;left:50%;top:-10px;width:3px;height:12px;border-radius:999px;transform:translateX(-50%);background:var(--shot-color,#ffbf40);box-shadow:0 0 6px var(--shot-color,#ffbf40);animation:abIntelShotDrop 1.1s linear infinite;}',
      '.ab-intel-shot-line.is-long{height:15px;width:3px;}',
      '.ab-intel-shot-line.is-left{left:34%;transform:translateX(-50%) rotate(-22deg);}',
      '.ab-intel-shot-line.is-right{left:66%;transform:translateX(-50%) rotate(22deg);}',
      '.ab-intel-shot-line.is-aim{height:14px;width:2px;transform:translateX(-50%) rotate(28deg);}',
      '.ab-intel-shot-dot{position:absolute;width:3px;height:3px;border-radius:999px;background:var(--shot-color,#ff79f2);box-shadow:0 0 6px var(--shot-color,#ff79f2);animation:abIntelShotPulse 0.95s ease-in-out infinite;}',
      '.ab-intel-shot-dot.is-fan-a{left:22%;top:9px;}',
      '.ab-intel-shot-dot.is-fan-b{left:38%;top:5px;}',
      '.ab-intel-shot-dot.is-fan-c{left:50%;top:3px;}',
      '.ab-intel-shot-dot.is-fan-d{left:62%;top:5px;}',
      '.ab-intel-shot-dot.is-fan-e{left:78%;top:9px;}',
      '.ab-intel-burst-stack{position:absolute;left:50%;top:2px;transform:translateX(-50%);display:flex;flex-direction:column;gap:2px;}',
      '.ab-intel-burst-stack i{display:block;width:3px;height:4px;border-radius:999px;background:var(--shot-color,#ffbf40);box-shadow:0 0 6px var(--shot-color,#ffbf40);animation:abIntelBurstPulse 0.9s ease-in-out infinite;}',
      '.ab-intel-burst-stack i:nth-child(2){animation-delay:0.12s;}',
      '.ab-intel-burst-stack i:nth-child(3){animation-delay:0.24s;}',
      '.ab-intel-upgrade-shot{position:absolute;width:2px;height:8px;border-radius:999px;background:var(--shot-color,#7efcff);box-shadow:0 0 6px var(--shot-color,#7efcff);animation:abIntelUpgradeFlow 1s linear infinite;}',
      '.ab-intel-upgrade-shot.is-triple-left{left:28%;top:1px;}',
      '.ab-intel-upgrade-shot.is-triple-mid{left:50%;top:-2px;transform:translateX(-50%);} ',
      '.ab-intel-upgrade-shot.is-triple-right{left:72%;top:1px;}',
      '.ab-intel-upgrade-shot.is-overhead-mid{left:50%;top:-2px;transform:translateX(-50%);} ',
      '.ab-intel-upgrade-shot.is-overhead-left{left:37%;top:0;transform:translateX(-50%) rotate(-24deg);} ',
      '.ab-intel-upgrade-shot.is-overhead-right{left:63%;top:0;transform:translateX(-50%) rotate(24deg);} ',
      '.ab-intel-upgrade-shot.is-diag-left{left:38%;top:3px;transform:translateX(-50%) rotate(-32deg);} ',
      '.ab-intel-upgrade-shot.is-diag-right{left:62%;top:3px;transform:translateX(-50%) rotate(32deg);} ',
      '.ab-intel-upgrade-shot.is-track{left:50%;top:-2px;transform:translateX(-50%);} ',
      '.ab-intel-upgrade-target{position:absolute;left:62%;top:11px;width:5px;height:5px;border:1px solid var(--shot-color,#ff5252);border-radius:999px;box-shadow:0 0 6px var(--shot-color,#ff5252);animation:abIntelTrackPulse 0.95s ease-in-out infinite;}',
      '.ab-intel-upgrade-dot{position:absolute;width:3px;height:3px;border-radius:999px;background:var(--shot-color,#ff79f2);box-shadow:0 0 6px var(--shot-color,#ff79f2);animation:abIntelShotPulse 0.95s ease-in-out infinite;}',
      '.ab-intel-upgrade-dot.is-fan-1{left:20%;top:10px;}',
      '.ab-intel-upgrade-dot.is-fan-2{left:35%;top:6px;}',
      '.ab-intel-upgrade-dot.is-fan-3{left:50%;top:3px;}',
      '.ab-intel-upgrade-dot.is-fan-4{left:65%;top:6px;}',
      '.ab-intel-upgrade-dot.is-fan-5{left:80%;top:10px;}',
      '.ab-intel-explosion-core{position:absolute;left:50%;top:50%;width:4px;height:4px;border-radius:999px;transform:translate(-50%,-50%);background:var(--shot-color,#ffb347);box-shadow:0 0 7px var(--shot-color,#ffb347);animation:abIntelExplosionCore 0.8s ease-in-out infinite;}',
      '.ab-intel-explosion-ring{position:absolute;left:50%;top:50%;width:6px;height:6px;border:1px solid var(--shot-color,#ffb347);border-radius:999px;transform:translate(-50%,-50%);animation:abIntelExplosionRing 1s ease-out infinite;}',
      '.ab-intel-explosion-ring.is-large{animation-duration:1.2s;animation-delay:0.14s;}',
      '.ab-intel-explosion-shard{position:absolute;left:50%;top:50%;width:2px;height:6px;border-radius:999px;transform-origin:50% 0%;background:var(--shot-color,#ffb347);box-shadow:0 0 5px var(--shot-color,#ffb347);animation:abIntelExplosionShard 0.95s ease-in-out infinite;}',
      '.ab-intel-explosion-shard.is-a{transform:translate(-50%,-50%) rotate(18deg);} ',
      '.ab-intel-explosion-shard.is-b{transform:translate(-50%,-50%) rotate(84deg);animation-delay:0.08s;} ',
      '.ab-intel-explosion-shard.is-c{transform:translate(-50%,-50%) rotate(148deg);animation-delay:0.16s;} ',
      '.ab-intel-explosion-shard.is-d{transform:translate(-50%,-50%) rotate(218deg);animation-delay:0.24s;} ',
      '.ab-intel-explosion-shard.is-e{transform:translate(-50%,-50%) rotate(286deg);animation-delay:0.32s;} ',
      '.ab-intel-live{display:grid;grid-template-columns:auto 1fr;gap:4px 8px;font:11px monospace;color:#bee9ff;margin-bottom:6px;}',
      '.ab-intel-live-key{color:#74b2d6;}',
      '.ab-intel-live-val{color:#d9f6ff;}',
      '.ab-intel-feed{margin:8px 0 10px;border-top:1px solid rgba(114,171,222,0.24);padding-top:8px;}',
      '.ab-intel-feed-head{font:11px monospace;color:#8dd9ff;margin-bottom:6px;}',
      '.ab-intel-feed-host{display:flex;flex-direction:column;gap:6px;}',
      '@keyframes abIntelPulse{0%,100%{transform:scale(1);}50%{transform:scale(1.12);}}',
      '@keyframes abIntelSpin{0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}',
      '@keyframes abIntelFloat{0%,100%{transform:translateY(0);}50%{transform:translateY(-2px);}}',
      '@keyframes abIntelBlink{0%,45%{opacity:1;}46%,100%{opacity:0.3;}}',
      '@keyframes abIntelShake{0%,100%{transform:translateX(0);}25%{transform:translateX(-1px);}75%{transform:translateX(1px);}}',
      '@keyframes abIntelGlow{0%,100%{filter:brightness(1);}50%{filter:brightness(1.25);}}',
      '@keyframes abIntelShotDrop{0%{top:-10px;opacity:0.2;}25%{opacity:1;}100%{top:16px;opacity:0.25;}}',
      '@keyframes abIntelShotPulse{0%,100%{transform:scale(0.85);}50%{transform:scale(1.2);}}',
      '@keyframes abIntelBurstPulse{0%,100%{opacity:0.3;}45%{opacity:1;}}',
      '@keyframes abIntelUpgradeFlow{0%{top:-4px;opacity:0.2;}25%{opacity:1;}100%{top:14px;opacity:0.25;}}',
      '@keyframes abIntelTrackPulse{0%,100%{transform:scale(0.8);}50%{transform:scale(1.15);}}',
      '@keyframes abIntelExplosionCore{0%,100%{transform:translate(-50%,-50%) scale(0.7);}50%{transform:translate(-50%,-50%) scale(1.25);}}',
      '@keyframes abIntelExplosionRing{0%{transform:translate(-50%,-50%) scale(0.45);opacity:0.9;}100%{transform:translate(-50%,-50%) scale(1.8);opacity:0;}}',
      '@keyframes abIntelExplosionShard{0%,100%{opacity:0.2;height:4px;}40%{opacity:1;height:8px;}}'
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
        sector: row('Sector'),
        path: row('Path'),
        mobility: row('Thrusters'),
        fire: row('Fire'),
        shield: row('Shield'),
        special: row('Special'),
        hazard: row('Hazard')
      }
    };
  }

  function resolveSwatchTeam(entry, sectionKey){
    var explicitTeam = entry && typeof entry.team === 'string' ? String(entry.team).toLowerCase() : '';
    if(explicitTeam === 'player' || explicitTeam === 'enemy'){
      return explicitTeam;
    }
    var sectionTeams = runtimeConfig.sectionTeams || {};
    var sectionTeam = typeof sectionTeams[sectionKey] === 'string' ? String(sectionTeams[sectionKey]).toLowerCase() : '';
    if(sectionTeam === 'player' || sectionTeam === 'enemy'){
      return sectionTeam;
    }
    return '';
  }

  function resolveSwatchTeamClass(team){
    if(team === 'player'){
      return ' is-team-player';
    }
    if(team === 'enemy'){
      return ' is-team-enemy';
    }
    return '';
  }

  function createPreviewCanvasSwatch(entry, sectionKey, team){
    var teamClass = resolveSwatchTeamClass(team);
    var swatch = document.createElement('span');
    swatch.className = 'ab-intel-swatch is-preview-canvas' + teamClass;
    swatch.title = entry.label || '';
    swatch.style.setProperty('--intel-accent-color', entry.color || '#9fe8ff');
    swatch.style.setProperty('--shot-color', entry.color || '#ffbf40');

    var canvas = document.createElement('canvas');
    canvas.className = 'ab-intel-preview-canvas';
    canvas.width = 36;
    canvas.height = 36;
    swatch.appendChild(canvas);

    var previewCtx = canvas.getContext ? canvas.getContext('2d') : null;
    if(!previewCtx){
      swatch.className = 'ab-intel-swatch' + teamClass;
      swatch.textContent = entry.glyph || '•';
      return swatch;
    }

    swatch.__intelPreview = {
      section: sectionKey,
      visual: String(entry.visual || entry.id || '').toLowerCase(),
      color: entry.color || '#ffbf40',
      canvas: canvas,
      ctx: previewCtx
    };
    return swatch;
  }

  function createSwatch(entry, sectionKey){
    var team = resolveSwatchTeam(entry, sectionKey);
    if(sectionKey === 'bullets'){
      return createPreviewCanvasSwatch(entry, sectionKey, team);
    }
    if(sectionKey === 'upgrades'){
      return createPreviewCanvasSwatch(entry, sectionKey, team);
    }
    if(sectionKey === 'explosions'){
      return createPreviewCanvasSwatch(entry, sectionKey, team);
    }
    var swatch = document.createElement('span');
    var teamClass = resolveSwatchTeamClass(team);
    var animation = entry.animation ? ' is-' + entry.animation : '';
    swatch.className = 'ab-intel-swatch' + teamClass + animation;
    swatch.style.setProperty('--intel-accent-color', entry.color || '#9fe8ff');
    swatch.textContent = entry.glyph || '•';
    swatch.title = entry.label || '';
    return swatch;
  }

  function createSection(title, entries, sectionKey, previewRegistry){
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
    var isDropSection = sectionKey === 'drops';
    var headers = isDropSection ? ['Tile', 'Drop', 'Effect'] : ['Tile', 'Type', 'Shape'];
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
      var swatch = createSwatch(row, sectionKey);
      tileCell.appendChild(swatch);
      if(
        previewRegistry &&
        swatch &&
        swatch.__intelPreview &&
        swatch.__intelPreview.ctx
      ){
        previewRegistry.push(swatch.__intelPreview);
      }

      var typeCell = document.createElement('td');
      typeCell.textContent = row.label || row.id || 'Unknown';
      typeCell.title = row.trait || '';

      var shapeCell = document.createElement('td');
      shapeCell.textContent = isDropSection ? (row.effectLabel || row.shape || '-') : (row.shape || '-');

      tr.appendChild(tileCell);
      tr.appendChild(typeCell);
      tr.appendChild(shapeCell);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    section.appendChild(table);
    return section;
  }

  function fillColumn(column, order, previewRegistry){
    var sectionTitles = runtimeConfig.sectionTitles || {};
    var sectionData = runtimeConfig.sections || {};
    var i;
    for(i = 0; i < order.length; i++){
      var key = order[i];
      var rows = Array.isArray(sectionData[key]) ? sectionData[key] : [];
      if(rows.length === 0) continue;
      column.appendChild(createSection(sectionTitles[key] || key, rows, key, previewRegistry));
    }
  }

  function resolvePreviewRenderer(gameRef){
    var hooks = gameRef && typeof gameRef.getTestHooks === 'function' ? gameRef.getTestHooks() : null;
    if(!hooks || typeof hooks.renderIntelPreview !== 'function'){
      return null;
    }
    return hooks.renderIntelPreview;
  }

  function renderFallbackPreview(preview, tick){
    if(!preview || !preview.ctx || !preview.canvas) return;
    var ctx = preview.ctx;
    var width = preview.canvas.width || 36;
    var height = preview.canvas.height || 36;
    var pulse = 0.45 + 0.35 * Math.sin(tick * 0.13);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(6,20,34,0.94)';
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = preview.color || '#7efcff';
    ctx.fillRect(width * 0.46, height * 0.18, 3, height * 0.62);
    ctx.globalAlpha = 1;
  }

  function updatePreviewTiles(gameRef, intelState){
    if(!intelState || !Array.isArray(intelState.previewTiles) || intelState.previewTiles.length === 0){
      return;
    }

    intelState.previewTick = (intelState.previewTick || 0) + 1;
    var previewTick = intelState.previewTick;
    var previewRenderer = resolvePreviewRenderer(gameRef);
    var i;
    for(i = 0; i < intelState.previewTiles.length; i++){
      var preview = intelState.previewTiles[i];
      if(!preview || !preview.ctx || !preview.canvas) continue;
      if(!previewRenderer){
        renderFallbackPreview(preview, previewTick);
        continue;
      }
      try{
        previewRenderer(preview.ctx, {
          section: preview.section,
          visual: preview.visual,
          color: preview.color,
          tick: previewTick,
          width: preview.canvas.width || 36,
          height: preview.canvas.height || 36
        });
      }catch(e){
        renderFallbackPreview(preview, previewTick);
      }
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

    var feedWrap = document.createElement('div');
    feedWrap.className = 'ab-intel-feed';
    var feedHead = document.createElement('div');
    feedHead.className = 'ab-intel-feed-head';
    feedHead.textContent = 'Mission Feed';
    var feedHost = document.createElement('div');
    feedHost.className = 'ab-intel-feed-host';
    feedWrap.appendChild(feedHead);
    feedWrap.appendChild(feedHost);
    leftCol.appendChild(feedWrap);

    var previewTiles = [];
    fillColumn(leftCol, (runtimeConfig.sectionOrder && runtimeConfig.sectionOrder.left) || [], previewTiles);
    fillColumn(rightCol, (runtimeConfig.sectionOrder && runtimeConfig.sectionOrder.right) || [], previewTiles);

    root.appendChild(leftCol);
    root.appendChild(center);
    root.appendChild(rightCol);
    hostContainer.appendChild(root);

    var intelState = {
      root: root,
      hostContainer: hostContainer,
      gameHost: gameHost,
      overlayHost: feedHost,
      toggleBtn: toggleBtn,
      hidden: false,
      liveBoard: liveBoard,
      previewTiles: previewTiles,
      previewTick: 0,
      updateTimer: null,
      previewTimer: null,
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
      setField('path', snapshot.upgradeArchetype ? String(snapshot.upgradeArchetype).toUpperCase() : 'UNASSIGNED');
      setField('mobility', snapshot.verticalMobilityUnlocked ? 'ONLINE' : 'LOCKED');
      setField('fire', snapshot.fireAutoUnlocked ? ('AUTO T' + Number(snapshot.fireCadenceTier || 0)) : ('TAP T' + Number(snapshot.fireCadenceTier || 0)));
      setField('shield', Number(snapshot.shieldCharges || 0) > 0 ? ('Aegis x' + Number(snapshot.shieldCharges || 0)) : 'OFF');
      var charge = Math.max(0, Number(snapshot.specialCharge || 0));
      var chargeMax = Math.max(1, Number(snapshot.specialChargeMax || 100));
      var pct = Math.max(0, Math.min(100, Math.floor((charge / chargeMax) * 100)));
      setField('special', snapshot.specialReady ? 'EMP READY' : (pct + '%'));
      var hazardStatus = 'CLEAR';
      var jamTimer = Math.max(0, Number(snapshot.weaponJamTimer || 0));
      var slowTimer = Math.max(0, Number(snapshot.hazardSlowTimer || 0));
      var ambushTimer = Math.max(0, Number(snapshot.hazardReinforcementTimer || 0));
      if(jamTimer > 0){
        hazardStatus = 'JAM ' + (jamTimer / 60).toFixed(1) + 's';
      } else if(slowTimer > 0){
        hazardStatus = 'SLOW ' + (slowTimer / 60).toFixed(1) + 's';
      } else if(ambushTimer > 0){
        hazardStatus = 'AMBUSH ' + (ambushTimer / 60).toFixed(1) + 's';
      }
      setField('hazard', hazardStatus);
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
    setTimeout(function(){ updatePreviewTiles(gameRef, intelState); }, 0);
    intelState.updateTimer = setInterval(updateLiveBoard, 240);
    intelState.previewTimer = setInterval(function(){
      updatePreviewTiles(gameRef, intelState);
    }, 70);

    return intelState;
  }

  function removeCombatIntelPanel(intelState){
    if(!intelState) return;
    if(intelState.updateTimer){
      clearInterval(intelState.updateTimer);
      intelState.updateTimer = null;
    }
    if(intelState.previewTimer){
      clearInterval(intelState.previewTimer);
      intelState.previewTimer = null;
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
