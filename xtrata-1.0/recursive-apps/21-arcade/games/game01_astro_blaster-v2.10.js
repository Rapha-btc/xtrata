/* eslint-disable */
/*
 * AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.
 * Source: recursive-apps/21-arcade/game01_astro_blaster-v2/src/legacy/game01_astro_blaster.legacy.js
 * Build Framework: recursive-apps/21-arcade/game01_astro_blaster-v2/src/build/build-game.mjs
 * Generated At: 2026-02-20T17:08:16.119Z
 * Legacy Source SHA256: 80790aeca98e37181c3a4de4a12917cf3af93381b611a0970f1fa78e4b6d4d5a
 */

var Game01 = (function(){
  var id = 'astro_blaster';
  var title = 'Astro Blaster';
  var description = 'Top-down space shooter. Push through deep sectors and survive endless overdrive.';
  var genreTag = 'Shoot \'em Up';
  var controls = 'Arrows: Move, Space: Shoot, Enter/Space: Ready, R: Restart';
  var hasLevels = true;
  var scoreMode = 'score';

  var WIDTH = 480;
  var HEIGHT = 600;
  var MAX_CAMPAIGN_LEVEL = 120;
  var MAX_LIVES = 5;

  var ENEMY_TYPES = {
    scout: {
      unlock: 1,
      cost: 1,
      baseWeight: 8,
      w: 22,
      h: 22,
      baseHp: 1,
      baseSpeed: 1.0,
      baseScore: 70,
      fireRate: 180,
      bulletSpeed: 3.2,
      motion: 'sway',
      fireMode: 'single',
      color: '#ff5b6e'
    },
    zigzag: {
      unlock: 4,
      cost: 2,
      baseWeight: 5,
      w: 24,
      h: 24,
      baseHp: 2,
      baseSpeed: 1.05,
      baseScore: 120,
      fireRate: 190,
      bulletSpeed: 3.5,
      motion: 'zigzag',
      fireMode: 'spread',
      color: '#ff3fa2'
    },
    tank: {
      unlock: 8,
      cost: 4,
      baseWeight: 3,
      w: 34,
      h: 30,
      baseHp: 4,
      baseSpeed: 0.78,
      baseScore: 260,
      fireRate: 250,
      bulletSpeed: 2.9,
      motion: 'march',
      fireMode: 'burst',
      color: '#ff9f40'
    },
    sniper: {
      unlock: 12,
      cost: 3,
      baseWeight: 3,
      w: 22,
      h: 22,
      baseHp: 2,
      baseSpeed: 0.88,
      baseScore: 210,
      fireRate: 145,
      bulletSpeed: 4.8,
      motion: 'hover',
      fireMode: 'aim',
      color: '#b28cff'
    },
    dive: {
      unlock: 18,
      cost: 2,
      baseWeight: 2,
      w: 20,
      h: 20,
      baseHp: 1,
      baseSpeed: 1.35,
      baseScore: 180,
      fireRate: 9999,
      bulletSpeed: 0,
      motion: 'dive',
      fireMode: 'none',
      color: '#ffe066'
    },
    carrier: {
      unlock: 30,
      cost: 6,
      baseWeight: 1,
      w: 52,
      h: 36,
      baseHp: 9,
      baseSpeed: 0.6,
      baseScore: 620,
      fireRate: 180,
      bulletSpeed: 2.5,
      motion: 'march',
      fireMode: 'fan',
      color: '#ff4de3'
    }
  };

  var SECTOR_THEMES = [
    {
      id: 'perimeter',
      name: 'Perimeter Drift',
      formations: ['line', 'stagger'],
      enemyWeights: { scout: 1.35, zigzag: 0.85, sniper: 0.7 },
      speedMul: 0.95,
      fireMul: 0.92,
      hpMul: 0.94,
      dropBonus: 0.02,
      forcedType: 'scout',
      budgetBonus: 0
    },
    {
      id: 'ion',
      name: 'Ion Storm',
      formations: ['stagger', 'swarm', 'vee'],
      enemyWeights: { zigzag: 1.4, sniper: 1.12, scout: 0.82 },
      speedMul: 1.07,
      fireMul: 1.08,
      hpMul: 0.95,
      dropBonus: 0,
      forcedType: 'zigzag',
      budgetBonus: 1
    },
    {
      id: 'bulwark',
      name: 'Bulwark Ring',
      formations: ['columns', 'line', 'ring'],
      enemyWeights: { tank: 1.45, carrier: 1.1, scout: 0.72, dive: 0.7 },
      speedMul: 0.93,
      fireMul: 0.96,
      hpMul: 1.2,
      dropBonus: -0.015,
      forcedType: 'tank',
      budgetBonus: 2
    },
    {
      id: 'sniper',
      name: 'Sniper Alley',
      formations: ['vee', 'columns'],
      enemyWeights: { sniper: 1.55, scout: 0.85, tank: 0.92 },
      speedMul: 1.02,
      fireMul: 1.24,
      hpMul: 0.95,
      dropBonus: -0.005,
      forcedType: 'sniper',
      budgetBonus: 1
    },
    {
      id: 'dive',
      name: 'Dive Corridor',
      formations: ['swarm', 'vee'],
      enemyWeights: { dive: 1.75, zigzag: 1.15, tank: 0.8 },
      speedMul: 1.12,
      fireMul: 1.01,
      hpMul: 0.96,
      dropBonus: 0.01,
      forcedType: 'dive',
      budgetBonus: 1
    },
    {
      id: 'siege',
      name: 'Carrier Siege',
      formations: ['ring', 'columns'],
      enemyWeights: { carrier: 1.85, tank: 1.28, sniper: 1.12, scout: 0.7 },
      speedMul: 0.98,
      fireMul: 1.16,
      hpMul: 1.2,
      dropBonus: -0.01,
      forcedType: 'carrier',
      budgetBonus: 3
    }
  ];

  var canvas, ctx, container, shared;
  var raf, keys, state;
  var listeners = [];
  var intervals = [];
  var forcedSeed = null;
  var runtimeHooks = null;
  var readyButton = null;

  function setV2RuntimeHooks(nextHooks){
    runtimeHooks = nextHooks || null;
  }

  function getPowerupsRuntime(){
    if(runtimeHooks && runtimeHooks.powerups){
      return runtimeHooks.powerups;
    }
    return null;
  }

  function getRewardsHazardsRuntime(){
    if(runtimeHooks && runtimeHooks.rewardsHazards){
      return runtimeHooks.rewardsHazards;
    }
    return null;
  }

  function getWaveProgressionRuntime(){
    if(runtimeHooks && runtimeHooks.waveProgression){
      return runtimeHooks.waveProgression;
    }
    return null;
  }

  function getEnemyCombatRuntime(){
    if(runtimeHooks && runtimeHooks.enemyCombat){
      return runtimeHooks.enemyCombat;
    }
    return null;
  }

  function isArcadeDebugEnabled(){
    if(typeof window === 'undefined') return false;
    if(window.ARCADE_ONCHAIN_DEBUG === true) return true;
    return !!(window.ARCADE_ONCHAIN_CONFIG && window.ARCADE_ONCHAIN_CONFIG.debug === true);
  }

  function logScoreFlow(event, detail){
    if(!isArcadeDebugEnabled() || typeof console === 'undefined') return;
    var payload = detail || {};
    try{
      console.info('[AstroBlaster ScoreFlow] ' + event, payload);
    }catch(e){}
  }

  function addKey(fn){
    document.addEventListener('keydown', fn);
    listeners.push(['keydown', fn]);
  }

  function addKeyUp(fn){
    document.addEventListener('keyup', fn);
    listeners.push(['keyup', fn]);
  }

  function ensureReadyButton(){
    if(!container) return null;
    if(readyButton && readyButton.parentNode === container){
      return readyButton;
    }

    if(!container.style.position || container.style.position === 'static'){
      container.style.position = 'relative';
    }

    readyButton = document.createElement('button');
    readyButton.type = 'button';
    readyButton.className = 'ab-ready-btn';
    readyButton.textContent = 'Ready?';
    readyButton.style.position = 'absolute';
    readyButton.style.left = '50%';
    readyButton.style.bottom = '22px';
    readyButton.style.transform = 'translateX(-50%)';
    readyButton.style.padding = '10px 18px';
    readyButton.style.border = '1px solid #6fd5ff';
    readyButton.style.borderRadius = '9px';
    readyButton.style.background = 'rgba(3, 22, 38, 0.9)';
    readyButton.style.color = '#d6f6ff';
    readyButton.style.font = '13px monospace';
    readyButton.style.letterSpacing = '0.3px';
    readyButton.style.cursor = 'pointer';
    readyButton.style.boxShadow = '0 0 12px rgba(57, 191, 255, 0.28)';
    readyButton.style.zIndex = '22';
    readyButton.style.display = 'none';
    readyButton.onclick = function(){
      beginNextWaveFromReady();
    };

    container.appendChild(readyButton);
    return readyButton;
  }

  function removeReadyButton(){
    if(readyButton && readyButton.parentNode){
      readyButton.parentNode.removeChild(readyButton);
    }
    readyButton = null;
  }

  function setReadyButtonVisible(isVisible){
    var btn = ensureReadyButton();
    if(!btn) return;
    btn.style.display = isVisible ? 'inline-block' : 'none';
    if(isVisible){
      btn.textContent = 'Ready?';
      btn.title = 'Start the next wave';
    }
  }

  function init(cont, sh){
    container = cont;
    shared = sh;
    canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    container.appendChild(canvas);
    ctx = canvas.getContext('2d');
    keys = {};

    var kd = function(e){
      keys[e.key] = true;
      if(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].indexOf(e.key) >= 0){
        e.preventDefault();
      }
      if(state && !state.gameOver && state.awaitingReady && (e.key === 'Enter' || e.key === ' ')){
        beginNextWaveFromReady();
        return;
      }
      if(e.key === 'r' || e.key === 'R'){
        restartGame();
      }
    };

    var ku = function(e){
      keys[e.key] = false;
    };

    addKey(kd);
    addKeyUp(ku);
    startGame();
  }

  function createRngBundle(){
    var seed = forcedSeed;
    if(seed == null){
      seed = ((Date.now() & 0x7fffffff) ^ ((Math.random() * 0x7fffffff) | 0)) >>> 0;
      if(seed === 0){
        seed = 1;
      }
    }
    return {
      seed: seed,
      rng: new ArcadeUtils.SeededRNG(seed)
    };
  }

  function rand(){
    return state && state.rng ? state.rng.next() : Math.random();
  }

  function randInt(min, max){
    if(state && state.rng){
      return state.rng.nextInt(min, max);
    }
    return ArcadeUtils.randInt(min, max);
  }

  function getInitialPowerupState(){
    var runtime = getPowerupsRuntime();
    if(runtime && typeof runtime.getInitialState === 'function'){
      var runtimeState = runtime.getInitialState();
      if(runtimeState && typeof runtimeState === 'object'){
        return {
          powerups: Array.isArray(runtimeState.powerups) ? runtimeState.powerups : [],
          powerLevel: Math.max(1, Math.floor(Number(runtimeState.powerLevel) || 1)),
          powerTimer: Math.max(0, Math.floor(Number(runtimeState.powerTimer) || 0))
        };
      }
    }
    return {
      powerups: [],
      powerLevel: 1,
      powerTimer: 0
    };
  }

  function getFallbackShotPattern(player){
    var centerX = player.x + player.w * 0.5 - 2;
    var baseY = player.y - 6;
    var powerLevel = state.powerLevel;
    var pattern = {
      cooldown: powerLevel >= 3 ? 6 : 8,
      shots: [
        {
          x: centerX,
          y: baseY,
          vx: 0,
          vy: -7.4,
          damage: powerLevel >= 3 ? 2 : 1,
          color: '#fff08f'
        }
      ]
    };

    if(powerLevel >= 2){
      pattern.shots.push({ x: player.x + 1, y: baseY + 8, vx: -0.4, vy: -6.9, damage: 1, color: '#7efcff' });
      pattern.shots.push({ x: player.x + player.w - 5, y: baseY + 8, vx: 0.4, vy: -6.9, damage: 1, color: '#7efcff' });
    }

    if(powerLevel >= 3){
      pattern.shots.push({ x: centerX - 8, y: baseY + 12, vx: -1.05, vy: -6.3, damage: 1, color: '#ffde59' });
      pattern.shots.push({ x: centerX + 8, y: baseY + 12, vx: 1.05, vy: -6.3, damage: 1, color: '#ffde59' });
    }

    return pattern;
  }

  function getPlayerShotPattern(player){
    var runtime = getPowerupsRuntime();
    if(runtime && typeof runtime.getPlayerShotPattern === 'function'){
      var runtimePattern = runtime.getPlayerShotPattern(state, player);
      if(runtimePattern && Array.isArray(runtimePattern.shots)){
        return {
          cooldown: Math.max(1, Math.floor(Number(runtimePattern.cooldown) || 8)),
          shots: runtimePattern.shots
        };
      }
    }
    return getFallbackShotPattern(player);
  }

  function startGame(){
    var rngBundle = createRngBundle();
    var powerupState = getInitialPowerupState();
    state = {
      rng: rngBundle.rng,
      seed: rngBundle.seed,
      tick: 0,
      player: { x: 220, y: 520, w: 32, h: 32, speed: 4.2 },
      playerShots: [],
      enemyShots: [],
      enemies: [],
      particles: [],
      explosions: [],
      powerups: powerupState.powerups,
      stars: buildStars(),
      score: 0,
      level: 1,
      wave: 0,
      waveLabel: 'Sector 1',
      waveIntro: 0,
      lives: 3,
      gameOver: false,
      won: false,
      campaignComplete: false,
      shootCool: 0,
      powerLevel: powerupState.powerLevel,
      powerTimer: powerupState.powerTimer,
      weaponJamTimer: 0,
      combo: 0,
      comboTimer: 0,
      invulnTimer: 0,
      shake: 0,
      testMode: false,
      deterministicSeed: forcedSeed,
      submitQueued: false,
      currentProfile: null,
      awaitingReady: false
    };

    setReadyButtonVisible(false);
    spawnWave();
    loop();
  }

  function restartGame(){
    cancelAnimationFrame(raf);
    intervals.forEach(function(id){ clearInterval(id); });
    intervals = [];
    setReadyButtonVisible(false);
    startGame();
  }

  function buildStars(){
    var stars = [];
    var i;
    for(i = 0; i < 72; i++){
      stars.push({
        x: rand() * WIDTH,
        y: rand() * HEIGHT,
        speed: 0.35 + rand() * 1.75,
        size: rand() < 0.25 ? 2 : 1,
        twinkle: rand() * Math.PI * 2
      });
    }
    return stars;
  }

  function getUnlockedTypes(level){
    var unlocked = [];
    var key;
    for(key in ENEMY_TYPES){
      if(!ENEMY_TYPES.hasOwnProperty(key)) continue;
      if(level >= ENEMY_TYPES[key].unlock){
        unlocked.push(key);
      }
    }
    return unlocked;
  }

  function getSectorTheme(level, overflow){
    if(overflow > 0){
      return {
        id: 'overdrive',
        name: 'Overdrive',
        sectorNumber: Math.floor((MAX_CAMPAIGN_LEVEL - 1) / 10) + 1 + overflow,
        formations: ['swarm', 'ring', 'vee'],
        enemyWeights: { dive: 1.35, sniper: 1.22, carrier: 1.26, tank: 1.1 },
        speedMul: 1.12 + Math.min(0.42, overflow * 0.012),
        fireMul: 1.13 + Math.min(0.45, overflow * 0.011),
        hpMul: 1.06 + Math.min(0.28, overflow * 0.006),
        dropBonus: -0.012,
        forcedType: overflow % 3 === 0 ? 'carrier' : 'dive',
        budgetBonus: 2 + Math.floor(overflow / 10)
      };
    }

    var sectorNumber = Math.floor((level - 1) / 10) + 1;
    var base = SECTOR_THEMES[(sectorNumber - 1) % SECTOR_THEMES.length];
    return {
      id: base.id,
      name: base.name,
      sectorNumber: sectorNumber,
      formations: base.formations,
      enemyWeights: base.enemyWeights,
      speedMul: base.speedMul,
      fireMul: base.fireMul,
      hpMul: base.hpMul,
      dropBonus: base.dropBonus,
      forcedType: base.forcedType,
      budgetBonus: base.budgetBonus
    };
  }

  function getLevelProfile(level){
    var overflow = level > MAX_CAMPAIGN_LEVEL ? (level - MAX_CAMPAIGN_LEVEL) : 0;
    var effectiveLevel = Math.min(MAX_CAMPAIGN_LEVEL, level) + Math.floor(overflow * 0.65);
    var sectorTheme = getSectorTheme(level, overflow);
    var budget = 8 + Math.floor(effectiveLevel * 1.4) + Math.floor(overflow * 0.25) + (sectorTheme.budgetBonus || 0);
    var speedScale = (1 + Math.min(2.6, effectiveLevel * 0.018 + overflow * 0.012)) * (sectorTheme.speedMul || 1);
    var fireScale = (1 + Math.min(2.9, effectiveLevel * 0.016 + overflow * 0.01)) * (sectorTheme.fireMul || 1);
    var hpScale = (1 + Math.min(1.7, effectiveLevel * 0.009 + overflow * 0.007)) * (sectorTheme.hpMul || 1);
    var dropChance = 0.13 - effectiveLevel * 0.0007 + (sectorTheme.dropBonus || 0);

    return {
      level: level,
      effectiveLevel: effectiveLevel,
      overflow: overflow,
      budget: Math.min(52, budget),
      speedScale: speedScale,
      fireScale: fireScale,
      hpScale: hpScale,
      dropChance: Math.max(0.025, Math.min(0.22, dropChance)),
      unlocked: getUnlockedTypes(level),
      formation: pickFormation(level, sectorTheme),
      sectorTheme: sectorTheme,
      sectorName: sectorTheme.name,
      sectorNumber: sectorTheme.sectorNumber
    };
  }

  function pickFormation(level, sectorTheme){
    var options = ['line', 'stagger', 'columns'];
    if(level >= 10) options.push('vee');
    if(level >= 20) options.push('swarm');
    if(level >= 35) options.push('ring');

    if(
      sectorTheme &&
      Array.isArray(sectorTheme.formations) &&
      sectorTheme.formations.length > 0 &&
      rand() < 0.72
    ){
      return sectorTheme.formations[randInt(0, sectorTheme.formations.length - 1)];
    }

    return options[randInt(0, options.length - 1)];
  }

  function pickEnemyType(profile, budget){
    var choices = [];
    var totalWeight = 0;
    var sectorTheme = profile.sectorTheme || null;
    var sectorWeights = sectorTheme && sectorTheme.enemyWeights ? sectorTheme.enemyWeights : null;
    var i;
    for(i = 0; i < profile.unlocked.length; i++){
      var typeId = profile.unlocked[i];
      var spec = ENEMY_TYPES[typeId];
      if(spec.cost > budget) continue;

      var unlockDistance = Math.max(0, profile.level - spec.unlock);
      var weight = spec.baseWeight + unlockDistance * 0.08;
      if(spec.cost >= 4 && profile.level >= 20){
        weight += (profile.level - 20) * 0.03;
      }
      if(spec.cost >= 6 && profile.level < 40){
        weight *= 0.55;
      }

      if(sectorWeights && sectorWeights[typeId]){
        weight *= sectorWeights[typeId];
      }

      if(sectorTheme && sectorTheme.forcedType === typeId){
        weight *= 1.08;
      }

      if(weight <= 0){
        continue;
      }

      choices.push({ id: typeId, weight: weight });
      totalWeight += weight;
    }

    if(!choices.length){
      return null;
    }

    var roll = rand() * totalWeight;
    var cursor = 0;
    for(i = 0; i < choices.length; i++){
      cursor += choices[i].weight;
      if(roll <= cursor){
        return choices[i].id;
      }
    }

    return choices[choices.length - 1].id;
  }

  function buildWaveSpec(level){
    var profile = getLevelProfile(level);
    var sectorTheme = profile.sectorTheme || null;
    var picks = [];
    var budget = profile.budget;
    var maxCount = Math.min(34, 10 + Math.floor(level * 0.24));

    if(
      sectorTheme &&
      sectorTheme.forcedType &&
      ENEMY_TYPES[sectorTheme.forcedType] &&
      budget >= ENEMY_TYPES[sectorTheme.forcedType].cost &&
      rand() < 0.72
    ){
      picks.push(sectorTheme.forcedType);
      budget -= ENEMY_TYPES[sectorTheme.forcedType].cost;
    }

    if(level % 15 === 0){
      picks.push('carrier');
      budget -= ENEMY_TYPES.carrier.cost;
      if(budget < 0) budget = 0;
      picks.push('tank');
      picks.push('sniper');
    }

    while(budget > 0 && picks.length < maxCount){
      var typeId = pickEnemyType(profile, budget);
      if(!typeId) break;
      picks.push(typeId);
      budget -= ENEMY_TYPES[typeId].cost;
    }

    if(picks.length === 0){
      picks.push('scout');
    }

    if(level % 7 === 0 && picks.length < maxCount){
      picks.push(level >= 18 ? 'dive' : 'zigzag');
    }

    if(level % 9 === 0 && level >= 12 && picks.length < maxCount){
      picks.push('sniper');
    }

    if(
      sectorTheme &&
      sectorTheme.id === 'sniper' &&
      level % 2 === 0 &&
      picks.length < maxCount &&
      budget >= ENEMY_TYPES.sniper.cost
    ){
      picks.push('sniper');
      budget -= ENEMY_TYPES.sniper.cost;
    }

    if(
      sectorTheme &&
      sectorTheme.id === 'dive' &&
      level % 3 === 0 &&
      picks.length < maxCount &&
      budget >= ENEMY_TYPES.dive.cost
    ){
      picks.push('dive');
      budget -= ENEMY_TYPES.dive.cost;
    }

    if(
      sectorTheme &&
      sectorTheme.id === 'siege' &&
      level % 5 === 0 &&
      picks.length < maxCount &&
      budget >= ENEMY_TYPES.tank.cost
    ){
      picks.push('tank');
      budget -= ENEMY_TYPES.tank.cost;
    }

    var slots = buildFormationSlots(picks.length, profile.formation);
    var enemies = [];
    var i;
    for(i = 0; i < picks.length; i++){
      enemies.push(makeEnemy(picks[i], slots[i], profile, i));
    }

    return {
      enemies: enemies,
      profile: profile,
      label: buildWaveLabel(level, profile)
    };
  }

  function buildWaveLabel(level, profile){
    var sectorTitle = profile.sectorName || 'Sector Drift';
    var sectorNumber = profile.sectorNumber || (Math.floor((level - 1) / 10) + 1);
    if(profile.overflow > 0){
      return 'Overdrive ' + profile.overflow + ' - ' + sectorTitle;
    }
    if(level % 15 === 0){
      return 'Sector ' + sectorNumber + ' - Elite Surge';
    }
    if(level % 10 === 0){
      return 'Sector ' + sectorNumber + ' - ' + sectorTitle + ' Peak';
    }
    return 'Sector ' + sectorNumber + ' - ' + sectorTitle;
  }

  function buildFormationSlots(count, formation){
    var slots = [];
    var i;

    function pushGrid(cols, xPadding, yStart, xStep, yStep, stagger){
      for(i = 0; i < count; i++){
        var row = Math.floor(i / cols);
        var col = i % cols;
        var x = xPadding + col * xStep;
        if(stagger && (row % 2 === 1)){
          x += xStep * 0.5;
        }
        var y = yStart - row * yStep;
        slots.push({ x: x, y: y });
      }
    }

    if(formation === 'line'){
      pushGrid(Math.min(11, count), 24, -24, 40, 44, false);
      return slots;
    }

    if(formation === 'stagger'){
      pushGrid(Math.min(10, count), 26, -24, 42, 40, true);
      return slots;
    }

    if(formation === 'columns'){
      pushGrid(Math.min(5, count), 44, -24, 84, 38, false);
      return slots;
    }

    if(formation === 'vee'){
      for(i = 0; i < count; i++){
        var layer = Math.floor(i / 2);
        var side = i % 2 === 0 ? -1 : 1;
        var lane = Math.ceil(i / 2);
        var vx = WIDTH * 0.5 + side * lane * 22;
        var vy = -24 - layer * 30;
        slots.push({ x: vx, y: vy });
      }
      return slots;
    }

    if(formation === 'ring'){
      for(i = 0; i < count; i++){
        var angle = (Math.PI * 2 * i) / Math.max(1, count);
        var radius = 100 + Math.floor(i / 12) * 26;
        slots.push({
          x: WIDTH * 0.5 + Math.cos(angle) * radius,
          y: -120 + Math.sin(angle) * radius * 0.55
        });
      }
      return slots;
    }

    /* swarm */
    for(i = 0; i < count; i++){
      slots.push({
        x: 18 + rand() * (WIDTH - 36),
        y: -30 - rand() * 220
      });
    }
    return slots;
  }

  function makeEnemy(typeId, slot, profile, index){
    var spec = ENEMY_TYPES[typeId] || ENEMY_TYPES.scout;
    var hpScaleBonus = spec.cost >= 4 ? 0.22 : 0.08;
    var hp = Math.max(1, Math.floor(spec.baseHp + profile.hpScale * hpScaleBonus * spec.baseHp));
    var speed = spec.baseSpeed * profile.speedScale;
    var fireRate = Math.max(45, Math.floor(spec.fireRate / profile.fireScale));
    var baseScore = Math.floor(spec.baseScore * (1 + profile.effectiveLevel * 0.026));

    return {
      type: typeId,
      x: slot.x,
      y: slot.y,
      w: spec.w,
      h: spec.h,
      hp: hp,
      maxHp: hp,
      speed: speed,
      scoreValue: baseScore,
      motion: spec.motion,
      fireMode: spec.fireMode,
      bulletSpeed: spec.bulletSpeed + profile.effectiveLevel * 0.03,
      fireRate: fireRate,
      fireCooldown: randInt(Math.floor(fireRate * 0.35), fireRate + 25),
      color: spec.color,
      dir: rand() < 0.5 ? -1 : 1,
      phase: rand() * Math.PI * 2,
      age: 0,
      vx: 0,
      vy: 0,
      diveDelay: 65 + randInt(0, 100),
      diving: false,
      variant: index % 3
    };
  }

  function spawnWave(){
    var waveRuntime = getWaveProgressionRuntime();
    var wave = null;

    if(waveRuntime && typeof waveRuntime.buildWaveSpec === 'function'){
      wave = waveRuntime.buildWaveSpec({
        level: state.level,
        width: WIDTH,
        maxCampaignLevel: MAX_CAMPAIGN_LEVEL,
        enemyTypes: ENEMY_TYPES,
        sectorThemes: SECTOR_THEMES,
        rand: rand,
        randInt: randInt
      });
    }

    if(!wave){
      wave = buildWaveSpec(state.level);
    }

    state.wave++;
    state.waveLabel = wave.label;
    state.waveIntro = 80;
    state.currentProfile = wave.profile;
    state.enemies = wave.enemies;
    state.awaitingReady = false;
    setReadyButtonVisible(false);

    if(shared.beep){
      shared.beep(480, 0.05, 'square', 0.03);
      shared.beep(640, 0.04, 'square', 0.03);
    }
  }

  function startInterWavePause(){
    if(state.awaitingReady || state.gameOver) return;

    state.level++;
    state.score += 400 + Math.floor(state.level * 14);

    if(!state.campaignComplete && state.level > MAX_CAMPAIGN_LEVEL){
      state.campaignComplete = true;
      state.score += 5000;
      if(shared.beep){
        shared.beep(420, 0.06, 'triangle', 0.04);
        shared.beep(620, 0.06, 'triangle', 0.04);
        shared.beep(820, 0.08, 'triangle', 0.05);
      }
    }

    state.awaitingReady = true;
    state.waveIntro = 0;
    setReadyButtonVisible(true);
    if(shared.beep){
      shared.beep(520, 0.05, 'sine', 0.03);
    }
  }

  function beginNextWaveFromReady(){
    if(!state || state.gameOver || !state.awaitingReady) return;
    state.awaitingReady = false;
    setReadyButtonVisible(false);
    keys[' '] = false;
    keys['Enter'] = false;
    spawnWave();
  }

  function spawnPlayerShot(x, y, vx, vy, damage, color){
    state.playerShots.push({
      x: x,
      y: y,
      w: 4,
      h: 14,
      vx: vx,
      vy: vy,
      damage: damage,
      life: 110,
      color: color || '#ffe066',
      trailColor: '#ff9f1a'
    });
  }

  function spawnEnemyShot(x, y, vx, vy, w, h, color){
    state.enemyShots.push({
      x: x,
      y: y,
      w: w || 4,
      h: h || 10,
      vx: vx,
      vy: vy,
      life: 240,
      color: color || '#ff7a1a'
    });
  }

  function firePlayerWeapons(){
    var p = state.player;
    var pattern = getPlayerShotPattern(p);
    var i;

    state.shootCool = pattern.cooldown;
    for(i = 0; i < pattern.shots.length; i++){
      var shot = pattern.shots[i];
      spawnPlayerShot(shot.x, shot.y, shot.vx, shot.vy, shot.damage, shot.color);
    }

    if(shared.beep) shared.beep(900, 0.035, 'square', 0.02);
  }

  function enemyFire(enemy){
    var runtime = getEnemyCombatRuntime();
    if(runtime && typeof runtime.fireEnemy === 'function'){
      var handled = runtime.fireEnemy({
        enemy: enemy,
        state: state,
        spawnEnemyShot: spawnEnemyShot
      });
      if(handled){
        return;
      }
    }

    if(enemy.fireMode === 'none') return;

    var cx = enemy.x + enemy.w * 0.5;
    var cy = enemy.y + enemy.h;

    if(enemy.fireMode === 'single'){
      spawnEnemyShot(cx - 2, cy, 0, enemy.bulletSpeed, 4, 10, '#ff8f00');
      return;
    }

    if(enemy.fireMode === 'spread'){
      spawnEnemyShot(cx - 2, cy, -0.7, enemy.bulletSpeed, 4, 10, '#ff7f50');
      spawnEnemyShot(cx - 2, cy, 0.7, enemy.bulletSpeed, 4, 10, '#ff7f50');
      return;
    }

    if(enemy.fireMode === 'burst'){
      spawnEnemyShot(cx - 3, cy, -0.3, enemy.bulletSpeed, 5, 12, '#ffbf40');
      spawnEnemyShot(cx - 1, cy, 0, enemy.bulletSpeed + 0.5, 5, 13, '#ffbf40');
      spawnEnemyShot(cx + 1, cy, 0.3, enemy.bulletSpeed, 5, 12, '#ffbf40');
      return;
    }

    if(enemy.fireMode === 'aim'){
      var px = state.player.x + state.player.w * 0.5;
      var py = state.player.y + state.player.h * 0.5;
      var dx = px - cx;
      var dy = py - cy;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      var speed = enemy.bulletSpeed;
      spawnEnemyShot(cx - 2, cy, dx / d * speed, dy / d * speed, 4, 12, '#ff5252');
      return;
    }

    if(enemy.fireMode === 'fan'){
      var i;
      for(i = -2; i <= 2; i++){
        var angle = Math.PI * 0.5 + i * 0.2;
        spawnEnemyShot(cx - 2, cy, Math.cos(angle) * enemy.bulletSpeed * 0.85, Math.sin(angle) * enemy.bulletSpeed, 5, 11, '#ff79f2');
      }
    }
  }

  function pushParticle(particle){
    state.particles.push(particle);
    if(state.particles.length > 420){
      state.particles.shift();
    }
  }

  function addTrail(x, y, color){
    pushParticle({
      x: x,
      y: y,
      vx: (rand() - 0.5) * 0.7,
      vy: 0.8 + rand() * 0.6,
      life: 10 + randInt(0, 6),
      maxLife: 16,
      size: 2,
      color: color || '#ffa63b'
    });
  }

  function spawnExplosion(x, y, color, force){
    var count = 10 + Math.floor(force * 6);
    var i;
    for(i = 0; i < count; i++){
      pushParticle({
        x: x,
        y: y,
        vx: (rand() - 0.5) * (2.2 + force * 2.4),
        vy: (rand() - 0.5) * (2.0 + force * 2.2),
        life: 16 + randInt(0, 18),
        maxLife: 34,
        size: 2 + rand() * 2,
        color: color
      });
    }

    state.explosions.push({
      x: x,
      y: y,
      radius: 2,
      maxRadius: 12 + force * 16,
      life: 14 + Math.floor(force * 9),
      maxLife: 24 + Math.floor(force * 10),
      color: color
    });

    if(state.explosions.length > 60){
      state.explosions.shift();
    }

    state.shake = Math.max(state.shake, Math.floor(2 + force * 3));
  }

  function maybeDropPowerup(enemy){
    var runtime = getPowerupsRuntime();
    var rewardsHazards = getRewardsHazardsRuntime();
    if(runtime && typeof runtime.maybeDrop === 'function'){
      runtime.maybeDrop({
        state: state,
        enemy: enemy,
        profile: state.currentProfile || getLevelProfile(state.level),
        rand: rand,
        rewardsHazards: rewardsHazards
      });
      return;
    }

    var profile = state.currentProfile || getLevelProfile(state.level);
    if(rand() > profile.dropChance) return;

    var type = rand() < 0.78 ? 'spread' : 'life';
    state.powerups.push({
      x: enemy.x + enemy.w * 0.5 - 8,
      y: enemy.y + enemy.h * 0.5 - 8,
      w: 16,
      h: 16,
      dy: 1.2 + rand() * 0.7,
      type: type,
      phase: rand() * Math.PI * 2
    });
  }

  function addScoreForKill(enemy){
    state.combo = Math.min(30, state.combo + 1);
    state.comboTimer = 210;

    var comboMult = 1 + state.combo * 0.06;
    var gained = Math.floor(enemy.scoreValue * comboMult);
    state.score += gained;
  }

  function damagePlayer(amount){
    if(state.invulnTimer > 0 || state.gameOver) return;

    state.lives -= amount;
    state.invulnTimer = 75;
    state.combo = 0;
    state.comboTimer = 0;

    var p = state.player;
    spawnExplosion(p.x + p.w * 0.5, p.y + p.h * 0.5, '#ff5f56', 1.2);
    if(shared.beep) shared.beep(130, 0.2, 'sawtooth', 0.06);

    if(state.lives <= 0){
      endGame(false);
    }
  }

  function updateStars(){
    var i;
    for(i = 0; i < state.stars.length; i++){
      var s = state.stars[i];
      s.y += s.speed;
      if(s.y > HEIGHT + 2){
        s.y = -2;
        s.x = rand() * WIDTH;
      }
    }
  }

  function updateEnemy(enemy){
    var runtime = getEnemyCombatRuntime();
    if(runtime && typeof runtime.updateEnemy === 'function'){
      var runtimeResult = runtime.updateEnemy({
        enemy: enemy,
        state: state,
        width: WIDTH,
        height: HEIGHT,
        rand: rand,
        randInt: randInt,
        clamp: ArcadeUtils.clamp,
        fireEnemy: enemyFire,
        spawnEnemyShot: spawnEnemyShot
      });
      if(typeof runtimeResult === 'boolean'){
        return runtimeResult;
      }
    }

    enemy.age++;

    if(enemy.motion === 'dive'){
      if(!enemy.diving){
        enemy.diveDelay--;
        enemy.y += enemy.speed * 0.7;
        enemy.x += Math.sin((state.tick + enemy.phase) / 14) * 1.1;
        if(enemy.diveDelay <= 0 || enemy.y > 170){
          enemy.diving = true;
          var px = state.player.x + state.player.w * 0.5;
          enemy.vx = (px - (enemy.x + enemy.w * 0.5)) * 0.012;
          enemy.vy = enemy.speed * 1.4;
        }
      } else {
        enemy.vy += 0.028;
        enemy.x += enemy.vx;
        enemy.y += enemy.vy;
      }
    } else if(enemy.motion === 'zigzag'){
      enemy.y += enemy.speed;
      enemy.x += enemy.dir * (1.1 + enemy.speed * 0.14);
      if(enemy.x < 8 || enemy.x > WIDTH - enemy.w - 8){
        enemy.dir *= -1;
      }
    } else if(enemy.motion === 'hover'){
      enemy.y += enemy.speed * 0.7;
      enemy.x += Math.sin((state.tick + enemy.phase) / 20) * 1.2;
    } else if(enemy.motion === 'march'){
      enemy.y += enemy.speed;
      enemy.x += enemy.dir * 0.45;
      if(enemy.x < 8 || enemy.x > WIDTH - enemy.w - 8){
        enemy.dir *= -1;
      }
    } else {
      enemy.y += enemy.speed;
      enemy.x += Math.sin((state.tick + enemy.phase) / 24) * 0.9;
    }

    if(enemy.y > HEIGHT + 90){
      enemy.y = -enemy.h - randInt(20, 140);
      enemy.x = 16 + rand() * (WIDTH - enemy.w - 32);
      enemy.fireCooldown = Math.max(20, Math.floor(enemy.fireRate * 0.5));
      if(enemy.motion === 'dive'){
        enemy.diving = false;
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.diveDelay = 50 + randInt(0, 90);
      }
    }

    if(enemy.x < -enemy.w - 26 || enemy.x > WIDTH + 26){
      enemy.dir *= -1;
      enemy.x = ArcadeUtils.clamp(enemy.x, -enemy.w * 0.35, WIDTH - enemy.w * 0.65);
    }

    enemy.fireCooldown--;
    if(enemy.fireCooldown <= 0){
      enemyFire(enemy);
      enemy.fireCooldown = enemy.fireRate + randInt(0, Math.floor(enemy.fireRate * 0.35));
    }

    return true;
  }

  function update(){
    var i;

    state.tick++;
    updateStars();

    if(state.gameOver){
      return;
    }

    if(state.awaitingReady){
      if(state.waveIntro > 0){
        state.waveIntro--;
      }
      if(state.shake > 0){
        state.shake--;
      }
      return;
    }

    var p = state.player;
    var powerupsRuntime = getPowerupsRuntime();
    var rewardsHazardsRuntime = getRewardsHazardsRuntime();
    var moveSpeed = state.invulnTimer > 0 ? p.speed * 1.08 : p.speed;

    if(keys.ArrowLeft) p.x -= moveSpeed;
    if(keys.ArrowRight) p.x += moveSpeed;
    if(keys.ArrowUp) p.y -= moveSpeed;
    if(keys.ArrowDown) p.y += moveSpeed;

    p.x = ArcadeUtils.clamp(p.x, 0, WIDTH - p.w);
    p.y = ArcadeUtils.clamp(p.y, 220, HEIGHT - p.h);

    if(state.weaponJamTimer > 0){
      state.weaponJamTimer--;
    }

    state.shootCool--;
    if(keys[' '] && state.shootCool <= 0){
      if(state.weaponJamTimer > 0){
        state.shootCool = 4;
        if(shared.beep && (state.tick % 18 === 0)){
          shared.beep(190, 0.04, 'square', 0.03);
        }
      } else {
        firePlayerWeapons();
      }
    }

    if(powerupsRuntime && typeof powerupsRuntime.tickPowerTimer === 'function'){
      powerupsRuntime.tickPowerTimer({ state: state });
    } else if(state.powerTimer > 0){
      state.powerTimer--;
      if(state.powerTimer <= 0){
        state.powerLevel = 1;
      }
    }

    if(state.comboTimer > 0){
      state.comboTimer--;
      if(state.comboTimer <= 0){
        state.combo = 0;
      }
    }

    if(state.invulnTimer > 0){
      state.invulnTimer--;
    }

    if(state.shake > 0){
      state.shake--;
    }

    if(state.waveIntro > 0){
      state.waveIntro--;
    }

    for(i = state.playerShots.length - 1; i >= 0; i--){
      var ps = state.playerShots[i];
      ps.x += ps.vx;
      ps.y += ps.vy;
      ps.life--;
      addTrail(ps.x + ps.w * 0.5, ps.y + ps.h, ps.trailColor);

      if(ps.y < -24 || ps.x < -24 || ps.x > WIDTH + 24 || ps.life <= 0){
        state.playerShots.splice(i, 1);
        continue;
      }

      var hitEnemy = false;
      var j;
      for(j = state.enemies.length - 1; j >= 0; j--){
        var enemy = state.enemies[j];
        if(ArcadeUtils.rectsOverlap(ps, enemy)){
          enemy.hp -= ps.damage;
          state.playerShots.splice(i, 1);
          hitEnemy = true;

          if(enemy.hp <= 0){
            spawnExplosion(enemy.x + enemy.w * 0.5, enemy.y + enemy.h * 0.5, enemy.color, enemy.type === 'carrier' ? 1.9 : 1.1);
            addScoreForKill(enemy);
            maybeDropPowerup(enemy);
            state.enemies.splice(j, 1);
            if(shared.beep) shared.beep(220 + randInt(0, 80), 0.08, 'sawtooth', 0.04);
          } else {
            spawnExplosion(enemy.x + enemy.w * 0.5, enemy.y + enemy.h * 0.5, enemy.color, 0.45);
          }
          break;
        }
      }

      if(hitEnemy){
        continue;
      }
    }

    for(i = state.enemyShots.length - 1; i >= 0; i--){
      var es = state.enemyShots[i];
      es.x += es.vx;
      es.y += es.vy;
      es.life--;
      addTrail(es.x + es.w * 0.5, es.y, '#ff6837');

      if(es.y > HEIGHT + 24 || es.x < -24 || es.x > WIDTH + 24 || es.life <= 0){
        state.enemyShots.splice(i, 1);
        continue;
      }

      if(ArcadeUtils.rectsOverlap(es, p)){
        state.enemyShots.splice(i, 1);
        damagePlayer(1);
      }
    }

    for(i = state.enemies.length - 1; i >= 0; i--){
      var alive = updateEnemy(state.enemies[i]);
      if(!alive){
        state.enemies.splice(i, 1);
        continue;
      }

      if(ArcadeUtils.rectsOverlap(state.enemies[i], p)){
        spawnExplosion(state.enemies[i].x + state.enemies[i].w * 0.5, state.enemies[i].y + state.enemies[i].h * 0.5, state.enemies[i].color, 0.9);
        state.enemies.splice(i, 1);
        damagePlayer(1);
      }
    }

    if(powerupsRuntime && typeof powerupsRuntime.updatePowerups === 'function'){
      powerupsRuntime.updatePowerups({
        state: state,
        player: p,
        tick: state.tick,
        shared: shared,
        rewardsHazards: rewardsHazardsRuntime,
        maxLives: MAX_LIVES,
        worldHeight: HEIGHT,
        rectsOverlap: ArcadeUtils.rectsOverlap
      });
    } else {
      for(i = state.powerups.length - 1; i >= 0; i--){
        var pw = state.powerups[i];
        pw.y += pw.dy;
        pw.x += Math.sin((state.tick + pw.phase) / 10) * 0.45;

        if(ArcadeUtils.rectsOverlap(pw, p)){
          if(pw.type === 'life'){
            state.lives = Math.min(MAX_LIVES, state.lives + 1);
            if(shared.beep) shared.beep(760, 0.12, 'sine', 0.05);
          } else {
            state.powerLevel = Math.min(3, state.powerLevel + 1);
            state.powerTimer = 720;
            if(shared.beep) shared.beep(660, 0.14, 'sine', 0.05);
          }
          state.powerups.splice(i, 1);
          continue;
        }

        if(pw.y > HEIGHT + 28){
          state.powerups.splice(i, 1);
        }
      }
    }

    for(i = state.particles.length - 1; i >= 0; i--){
      var pt = state.particles[i];
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.life--;
      if(pt.life <= 0){
        state.particles.splice(i, 1);
      }
    }

    for(i = state.explosions.length - 1; i >= 0; i--){
      var ex = state.explosions[i];
      ex.life--;
      ex.radius += (ex.maxRadius - ex.radius) * 0.34;
      if(ex.life <= 0){
        state.explosions.splice(i, 1);
      }
    }

    if(state.enemies.length === 0 && !state.gameOver){
      startInterWavePause();
    }
  }

  function drawBackground(){
    var grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    grad.addColorStop(0, '#050613');
    grad.addColorStop(1, '#0c1f3f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    var i;
    for(i = 0; i < state.stars.length; i++){
      var s = state.stars[i];
      var twinkle = 0.55 + Math.sin(state.tick * 0.03 + s.twinkle) * 0.35;
      ctx.globalAlpha = twinkle;
      ctx.fillStyle = s.size > 1 ? '#d7edff' : '#8bbdff';
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawPlayer(){
    var p = state.player;
    if(state.invulnTimer > 0 && Math.floor(state.invulnTimer / 4) % 2 === 0){
      return;
    }

    ctx.fillStyle = state.powerLevel >= 3 ? '#fff08f' : (state.powerLevel >= 2 ? '#73f8ff' : '#67ff88');
    ctx.beginPath();
    ctx.moveTo(p.x + p.w * 0.5, p.y - 4);
    ctx.lineTo(p.x - 1, p.y + p.h);
    ctx.lineTo(p.x + p.w + 1, p.y + p.h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#0e1f2f';
    ctx.fillRect(p.x + p.w * 0.5 - 3, p.y + 7, 6, 9);

    ctx.fillStyle = state.powerLevel >= 2 ? '#7efcff' : '#4df67a';
    ctx.fillRect(p.x + p.w * 0.5 - 2, p.y + p.h - 2, 4, 8);
  }

  function drawEnemy(enemy){
    ctx.fillStyle = enemy.color;

    if(enemy.type === 'dive'){
      ctx.beginPath();
      ctx.moveTo(enemy.x + enemy.w * 0.5, enemy.y);
      ctx.lineTo(enemy.x, enemy.y + enemy.h);
      ctx.lineTo(enemy.x + enemy.w, enemy.y + enemy.h);
      ctx.closePath();
      ctx.fill();
    } else if(enemy.type === 'carrier'){
      ctx.fillRect(enemy.x, enemy.y, enemy.w, enemy.h);
      ctx.fillStyle = '#2a1131';
      ctx.fillRect(enemy.x + 8, enemy.y + 8, enemy.w - 16, enemy.h - 14);
      ctx.fillStyle = enemy.color;
      ctx.fillRect(enemy.x + 4, enemy.y + enemy.h - 8, enemy.w - 8, 5);
    } else if(enemy.type === 'tank'){
      ctx.fillRect(enemy.x, enemy.y, enemy.w, enemy.h);
      ctx.fillStyle = '#401a08';
      ctx.fillRect(enemy.x + 5, enemy.y + 6, enemy.w - 10, enemy.h - 12);
      ctx.fillStyle = enemy.color;
      ctx.fillRect(enemy.x + enemy.w * 0.5 - 8, enemy.y - 4, 16, 6);
    } else {
      ctx.fillRect(enemy.x, enemy.y, enemy.w, enemy.h);
      ctx.fillStyle = '#341626';
      ctx.fillRect(enemy.x + 4, enemy.y + 5, 6, 6);
      ctx.fillRect(enemy.x + enemy.w - 10, enemy.y + 5, 6, 6);
    }

    if(enemy.maxHp > 1){
      var hpRatio = enemy.hp / enemy.maxHp;
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(enemy.x, enemy.y - 5, enemy.w, 3);
      ctx.fillStyle = '#7df2ff';
      ctx.fillRect(enemy.x, enemy.y - 5, enemy.w * hpRatio, 3);
    }
  }

  function drawShotGlyph(targetCtx, shot, includeNose){
    if(!targetCtx || !shot) return;
    targetCtx.fillStyle = shot.color;
    targetCtx.fillRect(shot.x, shot.y, shot.w, shot.h);
    if(includeNose){
      targetCtx.fillStyle = '#ffffff';
      targetCtx.fillRect(shot.x + 1, shot.y - 3, 2, 3);
    }
  }

  function drawParticleGlyph(targetCtx, particle){
    if(!targetCtx || !particle) return;
    var pAlpha = Math.max(0, particle.life / particle.maxLife);
    targetCtx.globalAlpha = pAlpha;
    targetCtx.fillStyle = particle.color;
    targetCtx.fillRect(particle.x, particle.y, particle.size || 2, particle.size || 2);
    targetCtx.globalAlpha = 1;
  }

  function drawExplosionGlyph(targetCtx, explosion){
    if(!targetCtx || !explosion) return;
    var alpha = explosion.life / explosion.maxLife;
    targetCtx.globalAlpha = alpha;
    targetCtx.strokeStyle = explosion.color;
    targetCtx.lineWidth = 2;
    targetCtx.beginPath();
    targetCtx.arc(explosion.x, explosion.y, explosion.radius, 0, Math.PI * 2);
    targetCtx.stroke();
    targetCtx.globalAlpha = 1;
  }

  function drawShots(){
    var i;
    for(i = 0; i < state.playerShots.length; i++){
      var ps = state.playerShots[i];
      drawShotGlyph(ctx, ps, true);
    }

    for(i = 0; i < state.enemyShots.length; i++){
      var es = state.enemyShots[i];
      drawShotGlyph(ctx, es, false);
    }
  }

  function drawPowerups(){
    var i;
    for(i = 0; i < state.powerups.length; i++){
      var pw = state.powerups[i];
      ctx.fillStyle = pw.type === 'life'
        ? '#6dff8d'
        : (pw.type === 'hazard' ? '#ff5b6e' : '#4de8ff');
      ctx.fillRect(pw.x, pw.y, pw.w, pw.h);
      ctx.fillStyle = '#071019';
      ctx.font = '10px monospace';
      ctx.fillText(pw.type === 'life' ? '+' : (pw.type === 'hazard' ? '!' : 'P'), pw.x + 4, pw.y + 12);
    }
  }

  function drawParticlesAndExplosions(){
    var i;

    for(i = 0; i < state.explosions.length; i++){
      drawExplosionGlyph(ctx, state.explosions[i]);
    }

    for(i = 0; i < state.particles.length; i++){
      drawParticleGlyph(ctx, state.particles[i]);
    }

    ctx.globalAlpha = 1;
  }

  function drawPreviewTrailSparks(previewCtx, tick, shot, trailColor, trailConfig){
    var direction = trailConfig && trailConfig.direction === 'up' ? -1 : 1;
    var count = Math.max(3, Math.floor((trailConfig && trailConfig.count) || 6));
    var spread = Math.max(0.2, Number(trailConfig && trailConfig.spread) || 0.72);
    var phase = Number(trailConfig && trailConfig.phase) || 0;
    var i;
    for(i = 0; i < count; i++){
      var t = tick + phase + i * 3;
      var distance = (i + 1) * (1.8 + Math.sin((t + i) * 0.21) * 0.2);
      var jitterX = Math.sin((t + phase) * 0.56 + i * 1.17) * (spread + i * 0.12);
      var jitterY = Math.cos((t + phase) * 0.42 + i * 0.68) * 0.45;
      var life = Math.max(2, 12 - i + Math.floor((Math.sin((t + i) * 0.35) + 1) * 1.4));
      drawParticleGlyph(previewCtx, {
        x: shot.x + shot.w * 0.5 + jitterX,
        y: shot.y + (direction > 0 ? -distance : (shot.h + distance)) + jitterY,
        life: life,
        maxLife: 14,
        size: i < 2 ? 2 : 1.8,
        color: trailColor
      });
    }
  }

  function drawPreviewEnemyShot(previewCtx, tick, width, height, shotConfig){
    var travelHeight = height + 22;
    var phase = Math.floor(shotConfig.phase || 0);
    var y = ((tick * (shotConfig.speed || 1.4) + phase) % travelHeight) - 16;
    var x = (shotConfig.baseX || (width * 0.5)) + Math.sin((tick + phase) * 0.08) * (shotConfig.wobble || 0);
    var shot = {
      x: Math.round(x),
      y: Math.round(y),
      w: shotConfig.w || 3,
      h: shotConfig.h || 12,
      color: shotConfig.color || '#ff8f00'
    };
    drawShotGlyph(previewCtx, shot, false);

    drawPreviewTrailSparks(previewCtx, tick, shot, shotConfig.trailColor || '#ff6837', {
      direction: 'down',
      count: shotConfig.trailCount || 7,
      spread: shotConfig.trailSpread || 0.7,
      phase: phase
    });
  }

  function drawPreviewPlayerShot(previewCtx, tick, width, height, shotConfig){
    var travelHeight = height + 18;
    var phase = Math.floor(shotConfig.phase || 0);
    var y = height + 6 - ((tick * (shotConfig.speed || 1.7) + phase) % travelHeight);
    var x = (shotConfig.baseX || (width * 0.5)) + Math.sin((tick + phase) * 0.06) * (shotConfig.wobble || 0);
    var shot = {
      x: Math.round(x),
      y: Math.round(y),
      w: shotConfig.w || 3,
      h: shotConfig.h || 12,
      color: shotConfig.color || '#fff08f'
    };
    drawShotGlyph(previewCtx, shot, true);

    drawPreviewTrailSparks(previewCtx, tick, shot, shotConfig.trailColor || '#ff9f1a', {
      direction: 'up',
      count: shotConfig.trailCount || 6,
      spread: shotConfig.trailSpread || 0.62,
      phase: phase
    });
  }

  function drawPreviewExplosion(previewCtx, tick, width, height, visual, color){
    var pulse = (tick % 30) / 30;
    var cx = width * 0.5;
    var cy = height * 0.5;
    var baseColor = color || '#ffb347';
    var maxRadius = visual === 'carrier-breach' ? 11 : (visual === 'shock-ring' ? 9 : 8);
    var radius = 1.8 + pulse * maxRadius;
    drawExplosionGlyph(previewCtx, {
      x: cx,
      y: cy,
      radius: radius,
      life: Math.max(1, Math.floor((1 - pulse) * 24)),
      maxLife: 24,
      color: baseColor
    });

    if(visual === 'shock-ring' || visual === 'carrier-breach' || visual === 'kill-burst'){
      drawExplosionGlyph(previewCtx, {
        x: cx,
        y: cy,
        radius: radius * 0.62,
        life: Math.max(1, Math.floor((1 - pulse) * 20)),
        maxLife: 20,
        color: baseColor
      });
    }

    var shardCount = visual === 'hit-spark' ? 4 : (visual === 'carrier-breach' ? 8 : 6);
    var i;
    for(i = 0; i < shardCount; i++){
      var angle = (Math.PI * 2 * i / shardCount) + (tick * 0.05);
      var dist = (2.5 + pulse * (visual === 'carrier-breach' ? 10 : 7));
      drawParticleGlyph(previewCtx, {
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        life: Math.max(2, Math.floor((1 - pulse) * 18)),
        maxLife: 18,
        size: visual === 'carrier-breach' ? 2.2 : 2,
        color: baseColor
      });
    }
  }

  function renderIntelPreviewTile(previewCtx, previewSpec){
    if(!previewCtx || !previewSpec) return;

    var width = Math.max(18, Math.floor(Number(previewSpec.width) || (previewCtx.canvas ? previewCtx.canvas.width : 36)));
    var height = Math.max(18, Math.floor(Number(previewSpec.height) || (previewCtx.canvas ? previewCtx.canvas.height : 36)));
    var section = String(previewSpec.section || '').toLowerCase();
    var visual = String(previewSpec.visual || '').toLowerCase();
    var color = previewSpec.color || '#ffbf40';
    var tick = Math.max(0, Number(previewSpec.tick) || 0);

    previewCtx.clearRect(0, 0, width, height);
    previewCtx.fillStyle = section === 'explosions' ? 'rgba(20,8,10,0.9)' : 'rgba(3,16,26,0.92)';
    previewCtx.fillRect(0, 0, width, height);

    if(section === 'bullets'){
      if(visual === 'split-lance'){
        drawPreviewEnemyShot(previewCtx, tick, width, height, { baseX: width * 0.34, wobble: 0.2, w: 3, h: 11, color: color, trailColor: '#ff6837', trailCount: 6, speed: 1.35, phase: 3 });
        drawPreviewEnemyShot(previewCtx, tick, width, height, { baseX: width * 0.62, wobble: 0.2, w: 3, h: 11, color: color, trailColor: '#ff6837', trailCount: 6, speed: 1.35, phase: 11 });
        return;
      }
      if(visual === 'burst-stack'){
        drawPreviewEnemyShot(previewCtx, tick, width, height, { baseX: width * 0.42, wobble: 0.16, w: 3, h: 11, color: color, trailColor: '#ff6837', speed: 1.38, phase: 2 });
        drawPreviewEnemyShot(previewCtx, tick, width, height, { baseX: width * 0.5, wobble: 0.12, w: 4, h: 12, color: color, trailColor: '#ff6837', speed: 1.46, phase: 7 });
        drawPreviewEnemyShot(previewCtx, tick, width, height, { baseX: width * 0.58, wobble: 0.16, w: 3, h: 11, color: color, trailColor: '#ff6837', speed: 1.38, phase: 13 });
        return;
      }
      if(visual === 'aim-lance'){
        drawPreviewEnemyShot(previewCtx, tick, width, height, { baseX: width * 0.35, wobble: 2.2, w: 3, h: 13, color: color, trailColor: '#ff6837', trailCount: 7, speed: 1.42, phase: 5 });
        return;
      }
      if(visual === 'fan-volley'){
        drawPreviewEnemyShot(previewCtx, tick, width, height, { baseX: width * 0.2, wobble: 0.25, w: 3, h: 10, color: color, trailColor: '#ff6837', speed: 1.3, phase: 0 });
        drawPreviewEnemyShot(previewCtx, tick, width, height, { baseX: width * 0.35, wobble: 0.2, w: 3, h: 10, color: color, trailColor: '#ff6837', speed: 1.32, phase: 4 });
        drawPreviewEnemyShot(previewCtx, tick, width, height, { baseX: width * 0.5, wobble: 0.14, w: 3, h: 10, color: color, trailColor: '#ff6837', speed: 1.34, phase: 8 });
        drawPreviewEnemyShot(previewCtx, tick, width, height, { baseX: width * 0.65, wobble: 0.2, w: 3, h: 10, color: color, trailColor: '#ff6837', speed: 1.32, phase: 12 });
        drawPreviewEnemyShot(previewCtx, tick, width, height, { baseX: width * 0.8, wobble: 0.25, w: 3, h: 10, color: color, trailColor: '#ff6837', speed: 1.3, phase: 16 });
        return;
      }
      drawPreviewEnemyShot(previewCtx, tick, width, height, { baseX: width * 0.5, wobble: 0.2, w: 4, h: 14, color: color, trailColor: '#ff6837', trailCount: 8, trailSpread: 0.75, speed: 1.4, phase: 6 });
      return;
    }

    if(section === 'upgrades'){
      if(visual === 'triple-volley'){
        drawPreviewPlayerShot(previewCtx, tick, width, height, { baseX: width * 0.34, wobble: 0.15, w: 3, h: 11, color: '#fff08f', speed: 1.75, phase: 2 });
        drawPreviewPlayerShot(previewCtx, tick, width, height, { baseX: width * 0.5, wobble: 0.1, w: 3, h: 12, color: '#fff08f', speed: 1.82, phase: 7 });
        drawPreviewPlayerShot(previewCtx, tick, width, height, { baseX: width * 0.66, wobble: 0.15, w: 3, h: 11, color: '#fff08f', speed: 1.75, phase: 12 });
        return;
      }
      if(visual === 'overhead-spread'){
        drawPreviewPlayerShot(previewCtx, tick, width, height, { baseX: width * 0.5, wobble: 0.1, w: 3, h: 12, color: '#7efcff', speed: 1.8, phase: 2 });
        drawPreviewPlayerShot(previewCtx, tick, width, height, { baseX: width * 0.35, wobble: 0.25, w: 3, h: 10, color: '#7efcff', speed: 1.72, phase: 9 });
        drawPreviewPlayerShot(previewCtx, tick, width, height, { baseX: width * 0.65, wobble: 0.25, w: 3, h: 10, color: '#7efcff', speed: 1.72, phase: 15 });
        return;
      }
      if(visual === 'diagonal-lances'){
        drawPreviewPlayerShot(previewCtx, tick, width, height, { baseX: width * 0.38, wobble: 1.4, w: 3, h: 10, color: '#ffde59', speed: 1.76, phase: 4 });
        drawPreviewPlayerShot(previewCtx, tick, width, height, { baseX: width * 0.62, wobble: 1.4, w: 3, h: 10, color: '#ffde59', speed: 1.76, phase: 11 });
        return;
      }
      if(visual === 'tracking-pulse'){
        drawPreviewPlayerShot(previewCtx, tick, width, height, { baseX: width * 0.5, wobble: 0.12, w: 3, h: 12, color: '#ff5252', speed: 1.8, phase: 4 });
        drawParticleGlyph(previewCtx, {
          x: width * 0.7 + Math.sin(tick * 0.08) * 1.2,
          y: 7 + Math.cos(tick * 0.08) * 1.2,
          life: 8,
          maxLife: 10,
          size: 3,
          color: '#ff5252'
        });
        return;
      }
      if(visual === 'arc-fan'){
        drawPreviewPlayerShot(previewCtx, tick, width, height, { baseX: width * 0.2, wobble: 0.25, w: 3, h: 9, color: '#ff79f2', speed: 1.66, phase: 0 });
        drawPreviewPlayerShot(previewCtx, tick, width, height, { baseX: width * 0.35, wobble: 0.2, w: 3, h: 9, color: '#ff79f2', speed: 1.68, phase: 4 });
        drawPreviewPlayerShot(previewCtx, tick, width, height, { baseX: width * 0.5, wobble: 0.14, w: 3, h: 10, color: '#ff79f2', speed: 1.7, phase: 8 });
        drawPreviewPlayerShot(previewCtx, tick, width, height, { baseX: width * 0.65, wobble: 0.2, w: 3, h: 9, color: '#ff79f2', speed: 1.68, phase: 12 });
        drawPreviewPlayerShot(previewCtx, tick, width, height, { baseX: width * 0.8, wobble: 0.25, w: 3, h: 9, color: '#ff79f2', speed: 1.66, phase: 16 });
        return;
      }
      drawPreviewPlayerShot(previewCtx, tick, width, height, { baseX: width * 0.5, wobble: 0.12, w: 3, h: 11, color: color, speed: 1.75, phase: 6 });
      return;
    }

    if(section === 'explosions'){
      drawPreviewExplosion(previewCtx, tick, width, height, visual, color);
      return;
    }
  }

  function drawHud(){
    ctx.fillStyle = '#8ff8ff';
    ctx.font = '14px monospace';
    ctx.fillText('Score: ' + state.score, 10, 20);
    ctx.fillText('Level: ' + state.level, 180, 20);
    ctx.fillText('Lives: ' + state.lives, 360, 20);

    ctx.fillStyle = '#ffd66e';
    ctx.font = '12px monospace';
    ctx.fillText(state.waveLabel, 10, 40);

    if(state.combo > 1){
      ctx.fillStyle = '#ffb347';
      ctx.fillText('Combo x' + (1 + state.combo * 0.06).toFixed(2), 180, 40);
    }

    if(state.campaignComplete){
      ctx.fillStyle = '#ff66da';
      ctx.fillText('OVERDRIVE ACTIVE', 318, 40);
    }

    if(state.weaponJamTimer > 0){
      ctx.fillStyle = '#ff6f6f';
      ctx.font = '12px monospace';
      ctx.fillText('WEAPON JAM ' + (state.weaponJamTimer / 60).toFixed(1) + 's', 300, 58);
    }

    if(state.waveIntro > 0){
      var overlayAlpha = Math.min(0.85, state.waveIntro / 80);
      ctx.globalAlpha = overlayAlpha;
      ctx.fillStyle = 'rgba(2,6,16,0.82)';
      ctx.fillRect(0, HEIGHT * 0.42, WIDTH, 74);
      ctx.globalAlpha = overlayAlpha;
      ctx.fillStyle = '#7efcff';
      ctx.font = '24px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(state.waveLabel, WIDTH * 0.5, HEIGHT * 0.42 + 44);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }
  }

  function drawGameOver(){
    if(!state.gameOver) return;

    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.textAlign = 'center';
    ctx.fillStyle = state.won ? '#6dff8d' : '#ff6464';
    ctx.font = '28px monospace';
    ctx.fillText(state.won ? 'SECTOR CLEARED' : 'GAME OVER', WIDTH * 0.5, 248);

    ctx.fillStyle = '#ffd66e';
    ctx.font = '18px monospace';
    ctx.fillText('Score: ' + state.score, WIDTH * 0.5, 286);

    ctx.fillStyle = '#9cecff';
    ctx.font = '14px monospace';
    ctx.fillText('Reached Level: ' + state.level, WIDTH * 0.5, 314);

    ctx.fillStyle = '#cccccc';
    ctx.fillText('Press R to restart', WIDTH * 0.5, 350);
    ctx.textAlign = 'left';
  }

  function drawReadyOverlay(){
    if(!state.awaitingReady || state.gameOver) return;

    ctx.fillStyle = 'rgba(0,0,0,0.58)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#9cecff';
    ctx.font = '20px monospace';
    ctx.fillText('WAVE CLEARED', WIDTH * 0.5, HEIGHT * 0.42);

    ctx.fillStyle = '#ffd66e';
    ctx.font = '15px monospace';
    ctx.fillText('Level ' + state.level + ' is ready.', WIDTH * 0.5, HEIGHT * 0.42 + 30);

    ctx.fillStyle = '#d7d7d7';
    ctx.font = '13px monospace';
    ctx.fillText('Press Ready, Enter, or Space to continue', WIDTH * 0.5, HEIGHT * 0.42 + 58);
    ctx.textAlign = 'left';
  }

  function draw(){
    ctx.save();
    if(state.shake > 0){
      ctx.translate(randInt(-state.shake, state.shake), randInt(-state.shake, state.shake));
    }

    drawBackground();

    var i;
    for(i = 0; i < state.enemies.length; i++){
      drawEnemy(state.enemies[i]);
    }

    drawShots();
    drawPowerups();
    drawParticlesAndExplosions();
    drawPlayer();
    drawHud();
    drawReadyOverlay();
    drawGameOver();

    ctx.restore();
  }

  function loop(){
    update();
    draw();
    if(!state.gameOver){
      raf = requestAnimationFrame(loop);
    }
  }

  function endGame(won){
    if(state.gameOver) return;

    state.gameOver = true;
    state.won = !!won;
    draw();

    if(state.submitQueued) return;
    state.submitQueued = true;
    var submissionPayload = {
      gameId: id,
      score: state.score,
      mode: 'score',
      title: title
    };
    logScoreFlow('end-game-submit-start', {
      won: state.won,
      score: state.score,
      level: state.level,
      livesRemaining: state.lives,
      wave: state.wave,
      payload: submissionPayload
    });

    var submitPromise = shared.highScores.maybeSubmit(submissionPayload);
    if(submitPromise && typeof submitPromise.then === 'function'){
      submitPromise.then(function(result){
        logScoreFlow('end-game-submit-resolved', {
          won: state.won,
          score: state.score,
          level: state.level,
          result: result
        });
      }).catch(function(error){
        logScoreFlow('end-game-submit-failed', {
          won: state.won,
          score: state.score,
          level: state.level,
          error: error && error.message ? error.message : String(error)
        });
      });
    }
  }

  function destroy(){
    cancelAnimationFrame(raf);
    intervals.forEach(function(id){ clearInterval(id); });
    intervals = [];
    listeners.forEach(function(l){ document.removeEventListener(l[0], l[1]); });
    listeners = [];
    removeReadyButton();
    if(container) container.innerHTML = '';
  }

  function getTestHooks(){
    return {
      getState: function(){
        return {
          level: state.level,
          score: state.score,
          gameOver: state.gameOver,
          lives: state.lives,
          wave: state.wave,
          sector: state.currentProfile ? state.currentProfile.sectorName : null,
          seed: state.seed
        };
      },
      completeLevel: function(){
        state.enemies = [];
        state.enemyShots = [];
      },
      forceWin: function(){
        endGame(true);
      },
      renderIntelPreview: function(previewCtx, previewSpec){
        renderIntelPreviewTile(previewCtx, previewSpec);
      },
      setDeterministicSeed: function(n){
        var parsed = Number(n);
        if(!isFinite(parsed)) return;
        forcedSeed = (Math.floor(parsed) >>> 0);
        if(forcedSeed === 0) forcedSeed = 1;
        if(state){
          state.testMode = true;
          state.deterministicSeed = forcedSeed;
          restartGame();
        }
      }
    };
  }

  return {
    id: id,
    title: title,
    description: description,
    genreTag: genreTag,
    controls: controls,
    hasLevels: hasLevels,
    scoreMode: scoreMode,
    init: init,
    destroy: destroy,
    getTestHooks: getTestHooks,
    setV2RuntimeHooks: setV2RuntimeHooks
  };
})();

(function(game){
  if(!game) return;
  function cloneSerializable(value){
    return JSON.parse(JSON.stringify(value));
  }
  var runtimePatch = {
    "version": "game01_astro_blaster-v2",
    "buildFramework": "modular-pipeline",
    "migratedFrom": "game01_astro_blaster-v2/src/legacy/game01_astro_blaster.legacy.js",
    "invariants": {
      "id": "astro_blaster",
      "scoreMode": "score",
      "requiresGuardedSubmitCall": true,
      "stableTestHooks": [
        "getState",
        "completeLevel",
        "forceWin",
        "setDeterministicSeed"
      ]
    },
    "gameModes": [
      {
        "id": "campaign",
        "label": "Campaign",
        "description": "Narrative sector climb with escalating mixed formations.",
        "scoreMode": "score",
        "leaderboardIdSuffix": "campaign",
        "riskLevel": "medium"
      },
      {
        "id": "overdrive",
        "label": "Overdrive",
        "description": "Infinite pressure mode with aggressive pacing and score multipliers.",
        "scoreMode": "score",
        "leaderboardIdSuffix": "overdrive",
        "riskLevel": "high"
      },
      {
        "id": "hardcore",
        "label": "Hardcore",
        "description": "Single-life mode tuned for elite score competition.",
        "scoreMode": "score",
        "leaderboardIdSuffix": "hardcore",
        "riskLevel": "extreme"
      },
      {
        "id": "mutator",
        "label": "Mutator Ops",
        "description": "Rotating modifiers blending positive and negative combat twists.",
        "scoreMode": "score",
        "leaderboardIdSuffix": "mutator",
        "riskLevel": "high"
      }
    ],
    "upgrades": [
      {
        "id": "shield_aegis_shell",
        "label": "Aegis Shell",
        "category": "defense",
        "tier": 1,
        "rarity": "common",
        "summary": "Adds a temporary shield bubble that absorbs one hit.",
        "effects": {
          "shieldCharges": 1,
          "durationFrames": 720
        }
      },
      {
        "id": "shield_recharge_matrix",
        "label": "Recharge Matrix",
        "category": "defense",
        "tier": 2,
        "rarity": "rare",
        "summary": "Periodically rebuilds one shield charge in prolonged fights.",
        "effects": {
          "shieldRegenFrames": 900
        }
      },
      {
        "id": "clone_mirror_gunner",
        "label": "Mirror Gunner",
        "category": "autonomous_clone",
        "tier": 2,
        "rarity": "rare",
        "summary": "Spawns a mirrored clone that tracks and fires reduced-damage shots.",
        "effects": {
          "cloneCount": 1,
          "cloneDamageMultiplier": 0.45
        }
      },
      {
        "id": "clone_turret_core",
        "label": "Turret Core",
        "category": "autonomous_clone",
        "tier": 3,
        "rarity": "epic",
        "summary": "Adds a stationary support clone with interception fire.",
        "effects": {
          "supportTurrets": 1,
          "interceptionRadius": 130
        }
      },
      {
        "id": "arsenal_plasma_spindle",
        "label": "Plasma Spindle",
        "category": "offense",
        "tier": 2,
        "rarity": "rare",
        "summary": "Converts center shot to piercing plasma with longer uptime.",
        "effects": {
          "piercingShots": 1,
          "bonusDamage": 1
        }
      },
      {
        "id": "arsenal_arc_burst",
        "label": "Arc Burst",
        "category": "offense",
        "tier": 3,
        "rarity": "epic",
        "summary": "Adds chained arc damage between nearby enemies.",
        "effects": {
          "chainTargets": 2,
          "chainDamageMultiplier": 0.35
        }
      },
      {
        "id": "mobility_vector_thrusters",
        "label": "Vector Thrusters",
        "category": "mobility",
        "tier": 1,
        "rarity": "common",
        "summary": "Boosts strafe speed to improve dodge windows.",
        "effects": {
          "moveSpeedMultiplier": 1.12
        }
      },
      {
        "id": "utility_salvage_radar",
        "label": "Salvage Radar",
        "category": "utility",
        "tier": 2,
        "rarity": "rare",
        "summary": "Improves quality of reward crates while lowering drop frequency.",
        "effects": {
          "rewardQualityBonus": 0.18,
          "dropRateMultiplier": 0.9
        }
      },
      {
        "id": "utility_overclock_capacitor",
        "label": "Overclock Capacitor",
        "category": "utility",
        "tier": 3,
        "rarity": "epic",
        "summary": "Temporarily reduces weapon cooldown after elite kills.",
        "effects": {
          "cooldownMultiplier": 0.82,
          "triggerWindowFrames": 420
        }
      }
    ],
    "rewards": [
      {
        "id": "reward_supply_cache",
        "label": "Supply Cache",
        "type": "crate",
        "rarity": "common",
        "outcome": "Small score boost plus minor repair.",
        "weight": 42
      },
      {
        "id": "reward_proto_upgrade",
        "label": "Prototype Upgrade",
        "type": "crate",
        "rarity": "rare",
        "outcome": "Select one upgrade from a curated trio.",
        "weight": 18
      },
      {
        "id": "reward_elite_bounty",
        "label": "Elite Bounty",
        "type": "challenge",
        "rarity": "epic",
        "outcome": "High score bonus if objective is completed in time.",
        "weight": 8
      },
      {
        "id": "reward_resonance_core",
        "label": "Resonance Core",
        "type": "crate",
        "rarity": "legendary",
        "outcome": "Grants mode-specific modifier and temporary invulnerability.",
        "weight": 3
      }
    ],
    "hazards": [
      {
        "id": "hazard_false_salvage",
        "label": "False Salvage Beacon",
        "type": "negative_box",
        "summary": "Looks like a reward but jams weapons briefly.",
        "severity": "medium",
        "effects": {
          "weaponJamFrames": 180
        }
      },
      {
        "id": "hazard_spike_mine_case",
        "label": "Spike Mine Case",
        "type": "negative_box",
        "summary": "Detonates radial shards on pickup.",
        "severity": "high",
        "effects": {
          "radialProjectiles": 8,
          "projectileDamage": 1
        }
      },
      {
        "id": "hazard_gravity_dud",
        "label": "Gravity Dud",
        "type": "negative_box",
        "summary": "Reduces movement speed and widens incoming aim assist.",
        "severity": "medium",
        "effects": {
          "moveSpeedMultiplier": 0.78,
          "durationFrames": 300
        }
      },
      {
        "id": "hazard_ambush_signal",
        "label": "Ambush Signal",
        "type": "red_herring",
        "summary": "Triggers an immediate elite reinforcement wave.",
        "severity": "high",
        "effects": {
          "enemyBudgetBonus": 6,
          "reinforcementDelayFrames": 30
        }
      }
    ],
    "runtime": {
      "rewardsHazardsConfig": {
        "defaultDropChance": 0.13,
        "hazardChance": 0.08,
        "spreadPowerDurationFrames": 720,
        "maxPowerLevel": 3,
        "lifePickupType": "life",
        "spreadPickupType": "spread",
        "lifeRewardId": "reward_supply_cache",
        "spreadRewardId": "reward_proto_upgrade",
        "rewards": [
          {
            "id": "reward_supply_cache",
            "label": "Supply Cache",
            "type": "crate",
            "rarity": "common",
            "outcome": "Small score boost plus minor repair.",
            "weight": 42
          },
          {
            "id": "reward_proto_upgrade",
            "label": "Prototype Upgrade",
            "type": "crate",
            "rarity": "rare",
            "outcome": "Select one upgrade from a curated trio.",
            "weight": 18
          },
          {
            "id": "reward_elite_bounty",
            "label": "Elite Bounty",
            "type": "challenge",
            "rarity": "epic",
            "outcome": "High score bonus if objective is completed in time.",
            "weight": 8
          },
          {
            "id": "reward_resonance_core",
            "label": "Resonance Core",
            "type": "crate",
            "rarity": "legendary",
            "outcome": "Grants mode-specific modifier and temporary invulnerability.",
            "weight": 3
          }
        ],
        "hazards": [
          {
            "id": "hazard_false_salvage",
            "label": "False Salvage Beacon",
            "type": "negative_box",
            "summary": "Looks like a reward but jams weapons briefly.",
            "severity": "medium",
            "effects": {
              "weaponJamFrames": 180
            }
          },
          {
            "id": "hazard_spike_mine_case",
            "label": "Spike Mine Case",
            "type": "negative_box",
            "summary": "Detonates radial shards on pickup.",
            "severity": "high",
            "effects": {
              "radialProjectiles": 8,
              "projectileDamage": 1
            }
          },
          {
            "id": "hazard_gravity_dud",
            "label": "Gravity Dud",
            "type": "negative_box",
            "summary": "Reduces movement speed and widens incoming aim assist.",
            "severity": "medium",
            "effects": {
              "moveSpeedMultiplier": 0.78,
              "durationFrames": 300
            }
          },
          {
            "id": "hazard_ambush_signal",
            "label": "Ambush Signal",
            "type": "red_herring",
            "summary": "Triggers an immediate elite reinforcement wave.",
            "severity": "high",
            "effects": {
              "enemyBudgetBonus": 6,
              "reinforcementDelayFrames": 30
            }
          }
        ]
      },
      "waveProgressionConfig": {
        "maxCampaignLevelFallback": 120,
        "defaultWidth": 480
      },
      "enemyCombatConfig": {
        "defaultWidth": 480,
        "defaultHeight": 600
      },
      "powerupsConfig": {
        "initialPowerLevel": 1,
        "maxPowerLevel": 3,
        "spreadPowerDurationFrames": 720,
        "lifePickupType": "life",
        "spreadPickupType": "spread",
        "spreadDropChance": 0.78,
        "pickupSize": 16,
        "pickupBaseDy": 1.2,
        "pickupDyVariance": 0.7,
        "pickupDriftDivisor": 10,
        "pickupDriftAmplitude": 0.45,
        "pickupExpireOffsetY": 28,
        "shotProfiles": {
          "powerLevel1": {
            "cooldown": 8,
            "centerDamage": 1,
            "centerColor": "#fff08f",
            "includeSideShots": false,
            "includeWingShots": false
          },
          "powerLevel2": {
            "cooldown": 8,
            "centerDamage": 1,
            "centerColor": "#fff08f",
            "includeSideShots": true,
            "includeWingShots": false
          },
          "powerLevel3": {
            "cooldown": 6,
            "centerDamage": 2,
            "centerColor": "#fff08f",
            "includeSideShots": true,
            "includeWingShots": true
          }
        }
      },
      "combatIntelPanel": {
        "module": "combat-intel-panel",
        "status": "active",
        "displayModes": [
          "desktop-side-columns",
          "ios-top-bottom"
        ],
        "toggleHotkey": "i"
      }
    },
    "combatIntelPanel": {
      "players": [
        {
          "id": "pilot-mk1",
          "label": "Pilot MK-I",
          "color": "#67ff88",
          "shape": "Tri-Delta",
          "glyph": "▲",
          "animation": "pulse",
          "trait": "Baseline hull and speed profile."
        },
        {
          "id": "pilot-overdrive",
          "label": "Pilot MK-II",
          "color": "#73f8ff",
          "shape": "Twin-Wing",
          "glyph": "△",
          "animation": "glow",
          "trait": "Power level 2 with side emitters."
        },
        {
          "id": "pilot-apex",
          "label": "Pilot MK-III",
          "color": "#fff08f",
          "shape": "Tri-Wing",
          "glyph": "✦",
          "animation": "pulse",
          "trait": "Power level 3 with dense spread."
        },
        {
          "id": "pilot-invuln",
          "label": "Invuln State",
          "color": "#ffffff",
          "shape": "Blink Shield",
          "glyph": "◉",
          "animation": "blink",
          "trait": "Post-hit invulnerability frames."
        }
      ],
      "enemies": [
        {
          "id": "scout",
          "label": "Scout",
          "color": "#ff5b6e",
          "shape": "Block Scout",
          "glyph": "▣",
          "animation": "float",
          "trait": "Fast opener with single shots."
        },
        {
          "id": "zigzag",
          "label": "Zigzag",
          "color": "#ff3fa2",
          "shape": "Zig Strider",
          "glyph": "◇",
          "animation": "shake",
          "trait": "Wide lateral movement and split shots."
        },
        {
          "id": "tank",
          "label": "Tank",
          "color": "#ff9f40",
          "shape": "Heavy Block",
          "glyph": "▤",
          "animation": "pulse",
          "trait": "High HP, burst volley pressure."
        },
        {
          "id": "sniper",
          "label": "Sniper",
          "color": "#b28cff",
          "shape": "Hover Node",
          "glyph": "◆",
          "animation": "glow",
          "trait": "Aimed lance fire at player vector."
        },
        {
          "id": "dive",
          "label": "Dive",
          "color": "#ffe066",
          "shape": "Dive Wedge",
          "glyph": "▼",
          "animation": "float",
          "trait": "Dive-bomb motion spikes."
        },
        {
          "id": "carrier",
          "label": "Carrier",
          "color": "#ff4de3",
          "shape": "Carrier Barge",
          "glyph": "▦",
          "animation": "pulse",
          "trait": "Fan-fire boss-lite encounter."
        }
      ],
      "weapons": [
        {
          "id": "pulse-core",
          "label": "Pulse Core",
          "color": "#fff08f",
          "shape": "Forward Beam",
          "glyph": "┃",
          "animation": "glow",
          "trait": "Primary centerline stream."
        },
        {
          "id": "side-lances",
          "label": "Side Lances",
          "color": "#7efcff",
          "shape": "Dual Offsets",
          "glyph": "∥",
          "animation": "pulse",
          "trait": "Unlocked at power level 2."
        },
        {
          "id": "wing-spears",
          "label": "Wing Spears",
          "color": "#ffde59",
          "shape": "Angled Pair",
          "glyph": "⟋",
          "animation": "float",
          "trait": "Unlocked at power level 3."
        },
        {
          "id": "weapon-jam",
          "label": "Jam State",
          "color": "#ff5b6e",
          "shape": "Suppression",
          "glyph": "✖",
          "animation": "blink",
          "trait": "Hazard locks firing briefly."
        }
      ],
      "upgrades": [
        {
          "id": "upgrade-triple-volley",
          "label": "Triple Volley",
          "color": "#fff08f",
          "shape": "3x Forward",
          "visual": "triple-volley",
          "trait": "Adds central triple-shot burst pattern."
        },
        {
          "id": "upgrade-overhead-spread",
          "label": "Overhead Spread",
          "color": "#7efcff",
          "shape": "Top Split",
          "visual": "overhead-spread",
          "trait": "Projectiles split downward from overhead lane."
        },
        {
          "id": "upgrade-diagonal-lances",
          "label": "Diagonal Lances",
          "color": "#ffde59",
          "shape": "Cross Angles",
          "visual": "diagonal-lances",
          "trait": "Adds diagonal wing lances to widen hitbox coverage."
        },
        {
          "id": "upgrade-tracking-pulse",
          "label": "Tracking Pulse",
          "color": "#ff5252",
          "shape": "Seek Target",
          "visual": "tracking-pulse",
          "trait": "Target-seeking pulse aligns to nearest hostile."
        },
        {
          "id": "upgrade-arc-fan",
          "label": "Arc Fan",
          "color": "#ff79f2",
          "shape": "Fan Arc",
          "visual": "arc-fan",
          "trait": "Wide fan burst for crowd pressure."
        }
      ],
      "bullets": [
        {
          "id": "enemy-single",
          "label": "Single Lance",
          "color": "#ff8f00",
          "shape": "Linear Drop",
          "glyph": "•",
          "visual": "single-lance",
          "animation": "pulse",
          "trait": "Basic enemy shot line."
        },
        {
          "id": "enemy-spread",
          "label": "Split Arc",
          "color": "#ff7f50",
          "shape": "Twin Diverge",
          "glyph": "⋰",
          "visual": "split-lance",
          "animation": "shake",
          "trait": "Spread pattern from zigzag foes."
        },
        {
          "id": "enemy-burst",
          "label": "Burst Trio",
          "color": "#ffbf40",
          "shape": "3-Round Burst",
          "glyph": "⋮",
          "visual": "burst-stack",
          "animation": "glow",
          "trait": "Tank burst pattern."
        },
        {
          "id": "enemy-aim",
          "label": "Aim Lance",
          "color": "#ff5252",
          "shape": "Tracking Vector",
          "glyph": "↘",
          "visual": "aim-lance",
          "animation": "blink",
          "trait": "Sniper aimed shot."
        },
        {
          "id": "enemy-fan",
          "label": "Fan Volley",
          "color": "#ff79f2",
          "shape": "Arc Spread",
          "glyph": "⌒",
          "visual": "fan-volley",
          "animation": "float",
          "trait": "Carrier radial fan."
        }
      ],
      "explosions": [
        {
          "id": "hit-spark",
          "label": "Hit Spark",
          "color": "#ff9f40",
          "shape": "Micro Ring",
          "visual": "hit-spark",
          "trait": "Minor impact confirmation."
        },
        {
          "id": "kill-burst",
          "label": "Kill Burst",
          "color": "#ffb347",
          "shape": "Shard Cloud",
          "visual": "kill-burst",
          "trait": "Default enemy elimination burst."
        },
        {
          "id": "carrier-breach",
          "label": "Carrier Breach",
          "color": "#ff4de3",
          "shape": "Heavy Burst",
          "visual": "carrier-breach",
          "trait": "Large force explosion profile."
        },
        {
          "id": "hull-rupture",
          "label": "Hull Rupture",
          "color": "#ff5f56",
          "shape": "Player Crash",
          "visual": "hull-rupture",
          "trait": "Player damage blast signature."
        },
        {
          "id": "shock-ring",
          "label": "Shock Ring",
          "color": "#7df2ff",
          "shape": "Expanding Ring",
          "visual": "shock-ring",
          "trait": "Ring overlay from explosion core."
        }
      ]
    },
    "combatIntelPanelLayout": {
      "desktopMinWidth": 980,
      "mobileModeOnIOS": true,
      "toggleHotkey": "i"
    },
    "maintenance": {
      "buildCommand": "npm run arcade:astro-v2:build",
      "testCommand": "npm run arcade:astro-v2:test",
      "docs": "recursive-apps/21-arcade/game01_astro_blaster-v2/AGENTS.md"
    }
  };
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
  
      function resolveDrop(payload){
        if(!payload || !payload.profile) return null;
  
        var rand = typeof payload.rand === "function" ? payload.rand : Math.random;
        var profileDrop = Number(payload.profile.dropChance);
        var dropChance = isFinite(profileDrop) ? profileDrop : Number(config.defaultDropChance || 0.13);
        if(rand() > dropChance) return null;
  
        var hazardChance = Number(config.hazardChance || 0);
        if(hazardChance > 0 && rand() < hazardChance && hazards.length > 0){
          var hazard = hazards[Math.floor(rand() * hazards.length) % hazards.length];
          return {
            sourceType: "hazard",
            sourceId: hazard.id,
            pickupType: "hazard",
            pickupLabel: hazard.label || "Hazard",
            hazardEffect: hazard.effects || null
          };
        }
  
        var spreadReward = rewardById[config.spreadRewardId] || null;
        var lifeReward = rewardById[config.lifeRewardId] || null;
        var spreadType = config.spreadPickupType || "spread";
        var lifeType = config.lifePickupType || "life";
  
        if(rand() < 0.78){
          return {
            sourceType: "reward",
            sourceId: spreadReward ? spreadReward.id : null,
            pickupType: spreadType,
            pickupLabel: spreadReward ? spreadReward.label : "Power",
            reward: spreadReward
          };
        }
  
        return {
          sourceType: "reward",
          sourceId: lifeReward ? lifeReward.id : null,
          pickupType: lifeType,
          pickupLabel: lifeReward ? lifeReward.label : "Life",
          reward: lifeReward
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
        var lifeType = config.lifePickupType || "life";
        var spreadType = config.spreadPickupType || "spread";
  
        if(pickup.pickupType === lifeType || pickup.type === lifeType){
          state.lives = Math.min(maxLives, state.lives + 1);
          if(shared && shared.beep) shared.beep(760, 0.12, "sine", 0.05);
          return { consumed: true, outcome: "life" };
        }
  
        if(pickup.pickupType === spreadType || pickup.type === spreadType){
          state.powerLevel = Math.min(maxPowerLevel, Math.max(1, Math.floor(Number(state.powerLevel) || 1)) + 1);
          state.powerTimer = spreadPowerDurationFrames;
          if(shared && shared.beep) shared.beep(660, 0.14, "sine", 0.05);
          return { consumed: true, outcome: "spread" };
        }
  
        if((pickup.pickupType === "hazard" || pickup.type === "hazard") && pickup.hazardEffect){
          if(pickup.hazardEffect.weaponJamFrames){
            state.weaponJamTimer = Math.max(state.weaponJamTimer || 0, Number(pickup.hazardEffect.weaponJamFrames) || 0);
          }
          if(shared && shared.beep) shared.beep(220, 0.14, "sawtooth", 0.05);
          return { consumed: true, outcome: "hazard" };
        }
  
        return { consumed: false };
      }
  
      return {
        resolveDrop: resolveDrop,
        applyPickup: applyPickup
      };
    }
  
    var runtimeConfig = {
    "defaultDropChance": 0.13,
    "hazardChance": 0.08,
    "spreadPowerDurationFrames": 720,
    "maxPowerLevel": 3,
    "lifePickupType": "life",
    "spreadPickupType": "spread",
    "lifeRewardId": "reward_supply_cache",
    "spreadRewardId": "reward_proto_upgrade",
    "rewards": [
      {
        "id": "reward_supply_cache",
        "label": "Supply Cache",
        "type": "crate",
        "rarity": "common",
        "outcome": "Small score boost plus minor repair.",
        "weight": 42
      },
      {
        "id": "reward_proto_upgrade",
        "label": "Prototype Upgrade",
        "type": "crate",
        "rarity": "rare",
        "outcome": "Select one upgrade from a curated trio.",
        "weight": 18
      },
      {
        "id": "reward_elite_bounty",
        "label": "Elite Bounty",
        "type": "challenge",
        "rarity": "epic",
        "outcome": "High score bonus if objective is completed in time.",
        "weight": 8
      },
      {
        "id": "reward_resonance_core",
        "label": "Resonance Core",
        "type": "crate",
        "rarity": "legendary",
        "outcome": "Grants mode-specific modifier and temporary invulnerability.",
        "weight": 3
      }
    ],
    "hazards": [
      {
        "id": "hazard_false_salvage",
        "label": "False Salvage Beacon",
        "type": "negative_box",
        "summary": "Looks like a reward but jams weapons briefly.",
        "severity": "medium",
        "effects": {
          "weaponJamFrames": 180
        }
      },
      {
        "id": "hazard_spike_mine_case",
        "label": "Spike Mine Case",
        "type": "negative_box",
        "summary": "Detonates radial shards on pickup.",
        "severity": "high",
        "effects": {
          "radialProjectiles": 8,
          "projectileDamage": 1
        }
      },
      {
        "id": "hazard_gravity_dud",
        "label": "Gravity Dud",
        "type": "negative_box",
        "summary": "Reduces movement speed and widens incoming aim assist.",
        "severity": "medium",
        "effects": {
          "moveSpeedMultiplier": 0.78,
          "durationFrames": 300
        }
      },
      {
        "id": "hazard_ambush_signal",
        "label": "Ambush Signal",
        "type": "red_herring",
        "summary": "Triggers an immediate elite reinforcement wave.",
        "severity": "high",
        "effects": {
          "enemyBudgetBonus": 6,
          "reinforcementDelayFrames": 30
        }
      }
    ]
  };
    var runtimeHooks = game.__astroV2RuntimeHooks || {};
    runtimeHooks.rewardsHazards = createRewardsHazardsRuntime(runtimeConfig);
    game.__astroV2RuntimeHooks = runtimeHooks;
    if(typeof game.setV2RuntimeHooks === "function"){
      game.setV2RuntimeHooks(runtimeHooks);
    }
  
    runtimePatch.runtime = runtimePatch.runtime || {};
    runtimePatch.runtime.rewardsHazards = {
      module: "rewards-hazards-runtime-hooks",
      status: "active",
      hazardChance: runtimeConfig.hazardChance,
      behaviorParity: "legacy-v1-safe"
    };
  })();
  (function(){
    function createWaveProgressionRuntime(config){
      var maxCampaignLevelFallback = Math.max(1, Number(config.maxCampaignLevelFallback) || 120);
      var defaultWidth = Math.max(200, Number(config.defaultWidth) || 480);
  
      function getUnlockedTypes(level, enemyTypes){
        var unlocked = [];
        var key;
        for(key in enemyTypes){
          if(!enemyTypes.hasOwnProperty(key)) continue;
          if(level >= Number(enemyTypes[key].unlock || 0)){
            unlocked.push(key);
          }
        }
        return unlocked;
      }
  
      function getSectorTheme(level, overflow, sectorThemes, maxCampaignLevel){
        if(overflow > 0){
          return {
            id: "overdrive",
            name: "Overdrive",
            sectorNumber: Math.floor((maxCampaignLevel - 1) / 10) + 1 + overflow,
            formations: ["swarm", "ring", "vee"],
            enemyWeights: { dive: 1.35, sniper: 1.22, carrier: 1.26, tank: 1.1 },
            speedMul: 1.12 + Math.min(0.42, overflow * 0.012),
            fireMul: 1.13 + Math.min(0.45, overflow * 0.011),
            hpMul: 1.06 + Math.min(0.28, overflow * 0.006),
            dropBonus: -0.012,
            forcedType: overflow % 3 === 0 ? "carrier" : "dive",
            budgetBonus: 2 + Math.floor(overflow / 10)
          };
        }
  
        var sectorNumber = Math.floor((level - 1) / 10) + 1;
        var base = sectorThemes[(sectorNumber - 1) % sectorThemes.length];
        return {
          id: base.id,
          name: base.name,
          sectorNumber: sectorNumber,
          formations: base.formations,
          enemyWeights: base.enemyWeights,
          speedMul: base.speedMul,
          fireMul: base.fireMul,
          hpMul: base.hpMul,
          dropBonus: base.dropBonus,
          forcedType: base.forcedType,
          budgetBonus: base.budgetBonus
        };
      }
  
      function pickFormation(level, sectorTheme, rand){
        var options = ["line", "stagger", "columns"];
        if(level >= 10) options.push("vee");
        if(level >= 20) options.push("swarm");
        if(level >= 35) options.push("ring");
  
        if(
          sectorTheme &&
          Array.isArray(sectorTheme.formations) &&
          sectorTheme.formations.length > 0 &&
          rand() < 0.72
        ){
          return sectorTheme.formations[Math.floor(rand() * sectorTheme.formations.length)];
        }
  
        return options[Math.floor(rand() * options.length)];
      }
  
      function getLevelProfile(payload){
        var level = Math.max(1, Math.floor(Number(payload.level) || 1));
        var maxCampaignLevel = Math.max(1, Math.floor(Number(payload.maxCampaignLevel) || maxCampaignLevelFallback));
        var enemyTypes = payload.enemyTypes || {};
        var sectorThemes = Array.isArray(payload.sectorThemes) ? payload.sectorThemes : [];
        var rand = typeof payload.rand === "function" ? payload.rand : Math.random;
  
        var overflow = level > maxCampaignLevel ? (level - maxCampaignLevel) : 0;
        var effectiveLevel = Math.min(maxCampaignLevel, level) + Math.floor(overflow * 0.65);
        var sectorTheme = getSectorTheme(level, overflow, sectorThemes, maxCampaignLevel);
        var budget = 8 + Math.floor(effectiveLevel * 1.4) + Math.floor(overflow * 0.25) + (sectorTheme.budgetBonus || 0);
        var speedScale = (1 + Math.min(2.6, effectiveLevel * 0.018 + overflow * 0.012)) * (sectorTheme.speedMul || 1);
        var fireScale = (1 + Math.min(2.9, effectiveLevel * 0.016 + overflow * 0.01)) * (sectorTheme.fireMul || 1);
        var hpScale = (1 + Math.min(1.7, effectiveLevel * 0.009 + overflow * 0.007)) * (sectorTheme.hpMul || 1);
        var dropChance = 0.13 - effectiveLevel * 0.0007 + (sectorTheme.dropBonus || 0);
  
        return {
          level: level,
          effectiveLevel: effectiveLevel,
          overflow: overflow,
          budget: Math.min(52, budget),
          speedScale: speedScale,
          fireScale: fireScale,
          hpScale: hpScale,
          dropChance: Math.max(0.025, Math.min(0.22, dropChance)),
          unlocked: getUnlockedTypes(level, enemyTypes),
          formation: pickFormation(level, sectorTheme, rand),
          sectorTheme: sectorTheme,
          sectorName: sectorTheme.name,
          sectorNumber: sectorTheme.sectorNumber
        };
      }
  
      function pickEnemyType(payload){
        var profile = payload.profile;
        var budget = Math.max(0, Number(payload.budget) || 0);
        var enemyTypes = payload.enemyTypes || {};
        var rand = typeof payload.rand === "function" ? payload.rand : Math.random;
        var choices = [];
        var totalWeight = 0;
        var sectorTheme = profile.sectorTheme || null;
        var sectorWeights = sectorTheme && sectorTheme.enemyWeights ? sectorTheme.enemyWeights : null;
        var i;
  
        for(i = 0; i < profile.unlocked.length; i++){
          var typeId = profile.unlocked[i];
          var spec = enemyTypes[typeId];
          if(!spec) continue;
          if(Number(spec.cost || 0) > budget) continue;
  
          var unlockDistance = Math.max(0, profile.level - Number(spec.unlock || 0));
          var weight = Number(spec.baseWeight || 0) + unlockDistance * 0.08;
          if(Number(spec.cost || 0) >= 4 && profile.level >= 20){
            weight += (profile.level - 20) * 0.03;
          }
          if(Number(spec.cost || 0) >= 6 && profile.level < 40){
            weight *= 0.55;
          }
  
          if(sectorWeights && sectorWeights[typeId]){
            weight *= sectorWeights[typeId];
          }
  
          if(sectorTheme && sectorTheme.forcedType === typeId){
            weight *= 1.08;
          }
  
          if(weight <= 0){
            continue;
          }
  
          choices.push({ id: typeId, weight: weight });
          totalWeight += weight;
        }
  
        if(!choices.length){
          return null;
        }
  
        var roll = rand() * totalWeight;
        var cursor = 0;
        for(i = 0; i < choices.length; i++){
          cursor += choices[i].weight;
          if(roll <= cursor){
            return choices[i].id;
          }
        }
  
        return choices[choices.length - 1].id;
      }
  
      function buildFormationSlots(payload){
        var count = Math.max(0, Math.floor(Number(payload.count) || 0));
        var formation = payload.formation || "line";
        var width = Math.max(200, Number(payload.width) || defaultWidth);
        var rand = typeof payload.rand === "function" ? payload.rand : Math.random;
        var slots = [];
        var i;
  
        function pushGrid(cols, xPadding, yStart, xStep, yStep, stagger){
          for(i = 0; i < count; i++){
            var row = Math.floor(i / cols);
            var col = i % cols;
            var x = xPadding + col * xStep;
            if(stagger && (row % 2 === 1)){
              x += xStep * 0.5;
            }
            var y = yStart - row * yStep;
            slots.push({ x: x, y: y });
          }
        }
  
        if(formation === "line"){
          pushGrid(Math.min(11, count), 24, -24, 40, 44, false);
          return slots;
        }
  
        if(formation === "stagger"){
          pushGrid(Math.min(10, count), 26, -24, 42, 40, true);
          return slots;
        }
  
        if(formation === "columns"){
          pushGrid(Math.min(5, count), 44, -24, 84, 38, false);
          return slots;
        }
  
        if(formation === "vee"){
          for(i = 0; i < count; i++){
            var layer = Math.floor(i / 2);
            var side = i % 2 === 0 ? -1 : 1;
            var lane = Math.ceil(i / 2);
            var vx = width * 0.5 + side * lane * 22;
            var vy = -24 - layer * 30;
            slots.push({ x: vx, y: vy });
          }
          return slots;
        }
  
        if(formation === "ring"){
          for(i = 0; i < count; i++){
            var angle = (Math.PI * 2 * i) / Math.max(1, count);
            var radius = 100 + Math.floor(i / 12) * 26;
            slots.push({
              x: width * 0.5 + Math.cos(angle) * radius,
              y: -120 + Math.sin(angle) * radius * 0.55
            });
          }
          return slots;
        }
  
        for(i = 0; i < count; i++){
          slots.push({
            x: 18 + rand() * (width - 36),
            y: -30 - rand() * 220
          });
        }
        return slots;
      }
  
      function makeEnemy(payload){
        var typeId = payload.typeId || "scout";
        var slot = payload.slot || { x: 24, y: -24 };
        var profile = payload.profile;
        var index = Math.max(0, Math.floor(Number(payload.index) || 0));
        var enemyTypes = payload.enemyTypes || {};
        var rand = typeof payload.rand === "function" ? payload.rand : Math.random;
        var randInt = typeof payload.randInt === "function" ? payload.randInt : function(min, max){
          return Math.floor(rand() * (max - min + 1)) + min;
        };
  
        var spec = enemyTypes[typeId] || enemyTypes.scout;
        if(!spec){
          return null;
        }
  
        var hpScaleBonus = Number(spec.cost || 0) >= 4 ? 0.22 : 0.08;
        var hp = Math.max(1, Math.floor(Number(spec.baseHp || 1) + profile.hpScale * hpScaleBonus * Number(spec.baseHp || 1)));
        var speed = Number(spec.baseSpeed || 1) * profile.speedScale;
        var fireRate = Math.max(45, Math.floor(Number(spec.fireRate || 180) / profile.fireScale));
        var baseScore = Math.floor(Number(spec.baseScore || 70) * (1 + profile.effectiveLevel * 0.026));
  
        return {
          type: typeId,
          x: slot.x,
          y: slot.y,
          w: Number(spec.w || 22),
          h: Number(spec.h || 22),
          hp: hp,
          maxHp: hp,
          speed: speed,
          scoreValue: baseScore,
          motion: spec.motion || "sway",
          fireMode: spec.fireMode || "single",
          bulletSpeed: Number(spec.bulletSpeed || 3.2) + profile.effectiveLevel * 0.03,
          fireRate: fireRate,
          fireCooldown: randInt(Math.floor(fireRate * 0.35), fireRate + 25),
          color: spec.color || "#ff5b6e",
          dir: rand() < 0.5 ? -1 : 1,
          phase: rand() * Math.PI * 2,
          age: 0,
          vx: 0,
          vy: 0,
          diveDelay: 65 + randInt(0, 100),
          diving: false,
          variant: index % 3
        };
      }
  
      function buildWaveLabel(level, profile){
        var sectorTitle = profile.sectorName || "Sector Drift";
        var sectorNumber = profile.sectorNumber || (Math.floor((level - 1) / 10) + 1);
        if(profile.overflow > 0){
          return "Overdrive " + profile.overflow + " - " + sectorTitle;
        }
        if(level % 15 === 0){
          return "Sector " + sectorNumber + " - Elite Surge";
        }
        if(level % 10 === 0){
          return "Sector " + sectorNumber + " - " + sectorTitle + " Peak";
        }
        return "Sector " + sectorNumber + " - " + sectorTitle;
      }
  
      function buildWaveSpec(payload){
        if(!payload || !payload.enemyTypes || !Array.isArray(payload.sectorThemes)){
          return null;
        }
  
        var level = Math.max(1, Math.floor(Number(payload.level) || 1));
        var width = Math.max(200, Number(payload.width) || defaultWidth);
        var maxCampaignLevel = Math.max(1, Math.floor(Number(payload.maxCampaignLevel) || maxCampaignLevelFallback));
        var enemyTypes = payload.enemyTypes;
        var sectorThemes = payload.sectorThemes;
        var rand = typeof payload.rand === "function" ? payload.rand : Math.random;
        var randInt = typeof payload.randInt === "function" ? payload.randInt : function(min, max){
          return Math.floor(rand() * (max - min + 1)) + min;
        };
  
        var profile = getLevelProfile({
          level: level,
          maxCampaignLevel: maxCampaignLevel,
          enemyTypes: enemyTypes,
          sectorThemes: sectorThemes,
          rand: rand
        });
  
        var sectorTheme = profile.sectorTheme || null;
        var picks = [];
        var budget = profile.budget;
        var maxCount = Math.min(34, 10 + Math.floor(level * 0.24));
  
        if(
          sectorTheme &&
          sectorTheme.forcedType &&
          enemyTypes[sectorTheme.forcedType] &&
          budget >= Number(enemyTypes[sectorTheme.forcedType].cost || 0) &&
          rand() < 0.72
        ){
          picks.push(sectorTheme.forcedType);
          budget -= Number(enemyTypes[sectorTheme.forcedType].cost || 0);
        }
  
        if(level % 15 === 0 && enemyTypes.carrier && enemyTypes.tank && enemyTypes.sniper){
          picks.push("carrier");
          budget -= Number(enemyTypes.carrier.cost || 0);
          if(budget < 0) budget = 0;
          picks.push("tank");
          picks.push("sniper");
        }
  
        while(budget > 0 && picks.length < maxCount){
          var typeId = pickEnemyType({
            profile: profile,
            budget: budget,
            enemyTypes: enemyTypes,
            rand: rand
          });
          if(!typeId) break;
          picks.push(typeId);
          budget -= Number(enemyTypes[typeId].cost || 0);
        }
  
        if(picks.length === 0){
          picks.push("scout");
        }
  
        if(level % 7 === 0 && picks.length < maxCount){
          picks.push(level >= 18 ? "dive" : "zigzag");
        }
  
        if(level % 9 === 0 && level >= 12 && picks.length < maxCount){
          picks.push("sniper");
        }
  
        if(
          sectorTheme &&
          sectorTheme.id === "sniper" &&
          level % 2 === 0 &&
          picks.length < maxCount &&
          enemyTypes.sniper &&
          budget >= Number(enemyTypes.sniper.cost || 0)
        ){
          picks.push("sniper");
          budget -= Number(enemyTypes.sniper.cost || 0);
        }
  
        if(
          sectorTheme &&
          sectorTheme.id === "dive" &&
          level % 3 === 0 &&
          picks.length < maxCount &&
          enemyTypes.dive &&
          budget >= Number(enemyTypes.dive.cost || 0)
        ){
          picks.push("dive");
          budget -= Number(enemyTypes.dive.cost || 0);
        }
  
        if(
          sectorTheme &&
          sectorTheme.id === "siege" &&
          level % 5 === 0 &&
          picks.length < maxCount &&
          enemyTypes.tank &&
          budget >= Number(enemyTypes.tank.cost || 0)
        ){
          picks.push("tank");
          budget -= Number(enemyTypes.tank.cost || 0);
        }
  
        var slots = buildFormationSlots({
          count: picks.length,
          formation: profile.formation,
          width: width,
          rand: rand
        });
  
        var enemies = [];
        var i;
        for(i = 0; i < picks.length; i++){
          var enemy = makeEnemy({
            typeId: picks[i],
            slot: slots[i],
            profile: profile,
            index: i,
            enemyTypes: enemyTypes,
            rand: rand,
            randInt: randInt
          });
          if(enemy){
            enemies.push(enemy);
          }
        }
  
        return {
          enemies: enemies,
          profile: profile,
          label: buildWaveLabel(level, profile)
        };
      }
  
      return {
        buildWaveSpec: buildWaveSpec,
        getLevelProfile: getLevelProfile
      };
    }
  
    var runtimeConfig = {
    "maxCampaignLevelFallback": 120,
    "defaultWidth": 480
  };
    var runtimeHooks = game.__astroV2RuntimeHooks || {};
    runtimeHooks.waveProgression = createWaveProgressionRuntime(runtimeConfig);
    game.__astroV2RuntimeHooks = runtimeHooks;
    if(typeof game.setV2RuntimeHooks === "function"){
      game.setV2RuntimeHooks(runtimeHooks);
    }
  
    runtimePatch.runtime = runtimePatch.runtime || {};
    runtimePatch.runtime.waveProgression = {
      module: "wave-progression-runtime-hooks",
      status: "active",
      behaviorParity: "legacy-v1-wave-system"
    };
  })();
  (function(){
    function createEnemyCombatRuntime(config){
      var defaultWidth = Math.max(200, Number(config.defaultWidth) || 480);
      var defaultHeight = Math.max(200, Number(config.defaultHeight) || 600);
  
      function clampValue(value, min, max){
        return Math.max(min, Math.min(max, value));
      }
  
      function fireEnemy(payload){
        if(!payload || !payload.enemy || typeof payload.spawnEnemyShot !== "function"){
          return false;
        }
  
        var enemy = payload.enemy;
        var state = payload.state || null;
        if(enemy.fireMode === "none") return true;
  
        var cx = enemy.x + enemy.w * 0.5;
        var cy = enemy.y + enemy.h;
  
        if(enemy.fireMode === "single"){
          payload.spawnEnemyShot(cx - 2, cy, 0, enemy.bulletSpeed, 4, 10, "#ff8f00");
          return true;
        }
  
        if(enemy.fireMode === "spread"){
          payload.spawnEnemyShot(cx - 2, cy, -0.7, enemy.bulletSpeed, 4, 10, "#ff7f50");
          payload.spawnEnemyShot(cx - 2, cy, 0.7, enemy.bulletSpeed, 4, 10, "#ff7f50");
          return true;
        }
  
        if(enemy.fireMode === "burst"){
          payload.spawnEnemyShot(cx - 3, cy, -0.3, enemy.bulletSpeed, 5, 12, "#ffbf40");
          payload.spawnEnemyShot(cx - 1, cy, 0, enemy.bulletSpeed + 0.5, 5, 13, "#ffbf40");
          payload.spawnEnemyShot(cx + 1, cy, 0.3, enemy.bulletSpeed, 5, 12, "#ffbf40");
          return true;
        }
  
        if(enemy.fireMode === "aim" && state && state.player){
          var px = state.player.x + state.player.w * 0.5;
          var py = state.player.y + state.player.h * 0.5;
          var dx = px - cx;
          var dy = py - cy;
          var d = Math.sqrt(dx * dx + dy * dy) || 1;
          var speed = enemy.bulletSpeed;
          payload.spawnEnemyShot(cx - 2, cy, dx / d * speed, dy / d * speed, 4, 12, "#ff5252");
          return true;
        }
  
        if(enemy.fireMode === "fan"){
          var i;
          for(i = -2; i <= 2; i++){
            var angle = Math.PI * 0.5 + i * 0.2;
            payload.spawnEnemyShot(
              cx - 2,
              cy,
              Math.cos(angle) * enemy.bulletSpeed * 0.85,
              Math.sin(angle) * enemy.bulletSpeed,
              5,
              11,
              "#ff79f2"
            );
          }
          return true;
        }
  
        return false;
      }
  
      function updateEnemy(payload){
        if(!payload || !payload.enemy || !payload.state){
          return true;
        }
  
        var enemy = payload.enemy;
        var state = payload.state;
        var width = Math.max(200, Number(payload.width) || defaultWidth);
        var height = Math.max(200, Number(payload.height) || defaultHeight);
        var rand = typeof payload.rand === "function" ? payload.rand : Math.random;
        var randInt = typeof payload.randInt === "function"
          ? payload.randInt
          : function(min, max){ return min + Math.floor(rand() * (max - min + 1)); };
        var clamp = typeof payload.clamp === "function" ? payload.clamp : clampValue;
        var fireEnemyFn = typeof payload.fireEnemy === "function"
          ? payload.fireEnemy
          : function(enemyRef){
              fireEnemy({ enemy: enemyRef, state: state, spawnEnemyShot: payload.spawnEnemyShot || function(){} });
            };
  
        enemy.age++;
  
        if(enemy.motion === "dive"){
          if(!enemy.diving){
            enemy.diveDelay--;
            enemy.y += enemy.speed * 0.7;
            enemy.x += Math.sin((state.tick + enemy.phase) / 14) * 1.1;
            if(enemy.diveDelay <= 0 || enemy.y > 170){
              enemy.diving = true;
              var px = state.player.x + state.player.w * 0.5;
              enemy.vx = (px - (enemy.x + enemy.w * 0.5)) * 0.012;
              enemy.vy = enemy.speed * 1.4;
            }
          } else {
            enemy.vy += 0.028;
            enemy.x += enemy.vx;
            enemy.y += enemy.vy;
          }
        } else if(enemy.motion === "zigzag"){
          enemy.y += enemy.speed;
          enemy.x += enemy.dir * (1.1 + enemy.speed * 0.14);
          if(enemy.x < 8 || enemy.x > width - enemy.w - 8){
            enemy.dir *= -1;
          }
        } else if(enemy.motion === "hover"){
          enemy.y += enemy.speed * 0.7;
          enemy.x += Math.sin((state.tick + enemy.phase) / 20) * 1.2;
        } else if(enemy.motion === "march"){
          enemy.y += enemy.speed;
          enemy.x += enemy.dir * 0.45;
          if(enemy.x < 8 || enemy.x > width - enemy.w - 8){
            enemy.dir *= -1;
          }
        } else {
          enemy.y += enemy.speed;
          enemy.x += Math.sin((state.tick + enemy.phase) / 24) * 0.9;
        }
  
        if(enemy.y > height + 90){
          enemy.y = -enemy.h - randInt(20, 140);
          enemy.x = 16 + rand() * (width - enemy.w - 32);
          enemy.fireCooldown = Math.max(20, Math.floor(enemy.fireRate * 0.5));
          if(enemy.motion === "dive"){
            enemy.diving = false;
            enemy.vx = 0;
            enemy.vy = 0;
            enemy.diveDelay = 50 + randInt(0, 90);
          }
        }
  
        if(enemy.x < -enemy.w - 26 || enemy.x > width + 26){
          enemy.dir *= -1;
          enemy.x = clamp(enemy.x, -enemy.w * 0.35, width - enemy.w * 0.65);
        }
  
        enemy.fireCooldown--;
        if(enemy.fireCooldown <= 0){
          fireEnemyFn(enemy);
          enemy.fireCooldown = enemy.fireRate + randInt(0, Math.floor(enemy.fireRate * 0.35));
        }
  
        return true;
      }
  
      return {
        fireEnemy: fireEnemy,
        updateEnemy: updateEnemy
      };
    }
  
    var runtimeConfig = {
    "defaultWidth": 480,
    "defaultHeight": 600
  };
    var runtimeHooks = game.__astroV2RuntimeHooks || {};
    runtimeHooks.enemyCombat = createEnemyCombatRuntime(runtimeConfig);
    game.__astroV2RuntimeHooks = runtimeHooks;
    if(typeof game.setV2RuntimeHooks === "function"){
      game.setV2RuntimeHooks(runtimeHooks);
    }
  
    runtimePatch.runtime = runtimePatch.runtime || {};
    runtimePatch.runtime.enemyCombat = {
      module: "enemy-combat-runtime-hooks",
      status: "active",
      behaviorParity: "legacy-v1-enemy-combat"
    };
  })();
  (function(){
    function createPowerupsRuntime(config){
      var maxPowerLevel = Math.max(1, Number(config.maxPowerLevel) || 3);
      var lifePickupType = config.lifePickupType || "life";
      var spreadPickupType = config.spreadPickupType || "spread";
      var spreadDropChance = Number(config.spreadDropChance);
      if(!isFinite(spreadDropChance)) spreadDropChance = 0.78;
      var pickupSize = Math.max(8, Number(config.pickupSize) || 16);
      var pickupBaseDy = Number(config.pickupBaseDy);
      if(!isFinite(pickupBaseDy)) pickupBaseDy = 1.2;
      var pickupDyVariance = Number(config.pickupDyVariance);
      if(!isFinite(pickupDyVariance)) pickupDyVariance = 0.7;
      var pickupDriftDivisor = Number(config.pickupDriftDivisor);
      if(!isFinite(pickupDriftDivisor) || pickupDriftDivisor === 0) pickupDriftDivisor = 10;
      var pickupDriftAmplitude = Number(config.pickupDriftAmplitude);
      if(!isFinite(pickupDriftAmplitude)) pickupDriftAmplitude = 0.45;
      var pickupExpireOffsetY = Number(config.pickupExpireOffsetY);
      if(!isFinite(pickupExpireOffsetY)) pickupExpireOffsetY = 28;
      var spreadPowerDurationFrames = Math.max(1, Number(config.spreadPowerDurationFrames) || 720);
      var shotProfiles = config.shotProfiles || {};
  
      function clampPowerLevel(level){
        var parsed = Number(level);
        if(!isFinite(parsed)) return 1;
        parsed = Math.floor(parsed);
        if(parsed < 1) return 1;
        if(parsed > maxPowerLevel) return maxPowerLevel;
        return parsed;
      }
  
      function pickShotProfile(level){
        var clamped = clampPowerLevel(level);
        if(clamped >= 3 && shotProfiles.powerLevel3) return shotProfiles.powerLevel3;
        if(clamped >= 2 && shotProfiles.powerLevel2) return shotProfiles.powerLevel2;
        return shotProfiles.powerLevel1 || { cooldown: 8, centerDamage: 1, centerColor: "#fff08f" };
      }
  
      function getInitialState(){
        return {
          powerups: [],
          powerLevel: clampPowerLevel(config.initialPowerLevel),
          powerTimer: 0
        };
      }
  
      function getPlayerShotPattern(state, player){
        if(!state || !player) return null;
        var profile = pickShotProfile(state.powerLevel);
        var centerX = player.x + player.w * 0.5 - 2;
        var baseY = player.y - 6;
        var shots = [
          { x: centerX, y: baseY, vx: 0, vy: -7.4, damage: profile.centerDamage || 1, color: profile.centerColor || "#fff08f" }
        ];
        if(profile.includeSideShots){
          shots.push({ x: player.x + 1, y: baseY + 8, vx: -0.4, vy: -6.9, damage: 1, color: "#7efcff" });
          shots.push({ x: player.x + player.w - 5, y: baseY + 8, vx: 0.4, vy: -6.9, damage: 1, color: "#7efcff" });
        }
        if(profile.includeWingShots){
          shots.push({ x: centerX - 8, y: baseY + 12, vx: -1.05, vy: -6.3, damage: 1, color: "#ffde59" });
          shots.push({ x: centerX + 8, y: baseY + 12, vx: 1.05, vy: -6.3, damage: 1, color: "#ffde59" });
        }
        return {
          cooldown: Math.max(1, Number(profile.cooldown) || 8),
          shots: shots
        };
      }
  
      function maybeDrop(payload){
        if(!payload || !payload.state || !payload.enemy) return;
        var state = payload.state;
        var profile = payload.profile;
        if(!profile || !isFinite(profile.dropChance)) return;
        var rand = typeof payload.rand === "function" ? payload.rand : Math.random;
        var rewardsHazards = payload.rewardsHazards || null;
        if(rand() > profile.dropChance) return;
  
        if(rewardsHazards && typeof rewardsHazards.resolveDrop === "function"){
          var resolved = rewardsHazards.resolveDrop({
            profile: profile,
            rand: rand
          });
          if(!resolved) return;
          state.powerups.push({
            x: payload.enemy.x + payload.enemy.w * 0.5 - pickupSize * 0.5,
            y: payload.enemy.y + payload.enemy.h * 0.5 - pickupSize * 0.5,
            w: pickupSize,
            h: pickupSize,
            dy: pickupBaseDy + rand() * pickupDyVariance,
            type: resolved.pickupType || spreadPickupType,
            sourceType: resolved.sourceType || "reward",
            sourceId: resolved.sourceId || null,
            pickupLabel: resolved.pickupLabel || null,
            hazardEffect: resolved.hazardEffect || null,
            phase: rand() * Math.PI * 2
          });
          return;
        }
  
        var type = rand() < spreadDropChance ? spreadPickupType : lifePickupType;
        state.powerups.push({
          x: payload.enemy.x + payload.enemy.w * 0.5 - pickupSize * 0.5,
          y: payload.enemy.y + payload.enemy.h * 0.5 - pickupSize * 0.5,
          w: pickupSize,
          h: pickupSize,
          dy: pickupBaseDy + rand() * pickupDyVariance,
          type: type,
          phase: rand() * Math.PI * 2
        });
      }
  
      function tickPowerTimer(payload){
        if(!payload || !payload.state) return;
        var state = payload.state;
        if(!(state.powerTimer > 0)) return;
        state.powerTimer -= 1;
        if(state.powerTimer <= 0){
          state.powerTimer = 0;
          state.powerLevel = 1;
        }
      }
  
      function updatePowerups(payload){
        if(!payload || !payload.state || !payload.player || typeof payload.rectsOverlap !== "function"){
          return;
        }
  
        var state = payload.state;
        var player = payload.player;
        var tick = Number(payload.tick) || 0;
        var maxLives = Math.max(1, Number(payload.maxLives) || 5);
        var worldHeight = Number(payload.worldHeight) || 600;
        var shared = payload.shared || null;
        var rewardsHazards = payload.rewardsHazards || null;
  
        for(var i = state.powerups.length - 1; i >= 0; i--){
          var powerup = state.powerups[i];
          powerup.y += powerup.dy;
          powerup.x += Math.sin((tick + powerup.phase) / pickupDriftDivisor) * pickupDriftAmplitude;
  
          if(payload.rectsOverlap(powerup, player)){
            if(rewardsHazards && typeof rewardsHazards.applyPickup === "function"){
              var applied = rewardsHazards.applyPickup({
                state: state,
                pickup: powerup,
                shared: shared,
                maxLives: maxLives
              });
              if(applied && applied.consumed){
                state.powerups.splice(i, 1);
                continue;
              }
            }
  
            if(powerup.type === lifePickupType){
              state.lives = Math.min(maxLives, state.lives + 1);
              if(shared && shared.beep) shared.beep(760, 0.12, "sine", 0.05);
            } else {
              state.powerLevel = Math.min(maxPowerLevel, clampPowerLevel(state.powerLevel) + 1);
              state.powerTimer = spreadPowerDurationFrames;
              if(shared && shared.beep) shared.beep(660, 0.14, "sine", 0.05);
            }
            state.powerups.splice(i, 1);
            continue;
          }
  
          if(powerup.y > worldHeight + pickupExpireOffsetY){
            state.powerups.splice(i, 1);
          }
        }
      }
  
      return {
        getInitialState: getInitialState,
        getPlayerShotPattern: getPlayerShotPattern,
        maybeDrop: maybeDrop,
        tickPowerTimer: tickPowerTimer,
        updatePowerups: updatePowerups
      };
    }
  
    var runtimeConfig = {
    "initialPowerLevel": 1,
    "maxPowerLevel": 3,
    "spreadPowerDurationFrames": 720,
    "lifePickupType": "life",
    "spreadPickupType": "spread",
    "spreadDropChance": 0.78,
    "pickupSize": 16,
    "pickupBaseDy": 1.2,
    "pickupDyVariance": 0.7,
    "pickupDriftDivisor": 10,
    "pickupDriftAmplitude": 0.45,
    "pickupExpireOffsetY": 28,
    "shotProfiles": {
      "powerLevel1": {
        "cooldown": 8,
        "centerDamage": 1,
        "centerColor": "#fff08f",
        "includeSideShots": false,
        "includeWingShots": false
      },
      "powerLevel2": {
        "cooldown": 8,
        "centerDamage": 1,
        "centerColor": "#fff08f",
        "includeSideShots": true,
        "includeWingShots": false
      },
      "powerLevel3": {
        "cooldown": 6,
        "centerDamage": 2,
        "centerColor": "#fff08f",
        "includeSideShots": true,
        "includeWingShots": true
      }
    }
  };
    var runtimeHooks = game.__astroV2RuntimeHooks || {};
    runtimeHooks.powerups = createPowerupsRuntime(runtimeConfig);
    game.__astroV2RuntimeHooks = runtimeHooks;
    if(typeof game.setV2RuntimeHooks === "function"){
      game.setV2RuntimeHooks(runtimeHooks);
    }
  
    runtimePatch.runtime = runtimePatch.runtime || {};
    runtimePatch.runtime.powerups = {
      module: "powerups-runtime-hooks",
      status: "active",
      behaviorParity: "legacy-v1" 
    };
  })();
  (function(){
    var runtimeConfig = {
    "layout": {
      "desktopMinWidth": 980,
      "mobileModeOnIOS": true,
      "toggleHotkey": "i"
    },
    "sectionOrder": {
      "left": [
        "players",
        "enemies"
      ],
      "right": [
        "weapons",
        "upgrades",
        "bullets",
        "explosions"
      ]
    },
    "sectionTitles": {
      "players": "Player Types",
      "enemies": "Enemy Types",
      "weapons": "Weapon Types",
      "upgrades": "Upgrade Patterns",
      "bullets": "Bullet Types",
      "explosions": "Explosion Types"
    },
    "sections": {
      "players": [
        {
          "id": "pilot-mk1",
          "label": "Pilot MK-I",
          "color": "#67ff88",
          "shape": "Tri-Delta",
          "glyph": "▲",
          "animation": "pulse",
          "trait": "Baseline hull and speed profile."
        },
        {
          "id": "pilot-overdrive",
          "label": "Pilot MK-II",
          "color": "#73f8ff",
          "shape": "Twin-Wing",
          "glyph": "△",
          "animation": "glow",
          "trait": "Power level 2 with side emitters."
        },
        {
          "id": "pilot-apex",
          "label": "Pilot MK-III",
          "color": "#fff08f",
          "shape": "Tri-Wing",
          "glyph": "✦",
          "animation": "pulse",
          "trait": "Power level 3 with dense spread."
        },
        {
          "id": "pilot-invuln",
          "label": "Invuln State",
          "color": "#ffffff",
          "shape": "Blink Shield",
          "glyph": "◉",
          "animation": "blink",
          "trait": "Post-hit invulnerability frames."
        }
      ],
      "enemies": [
        {
          "id": "scout",
          "label": "Scout",
          "color": "#ff5b6e",
          "shape": "Block Scout",
          "glyph": "▣",
          "animation": "float",
          "trait": "Fast opener with single shots."
        },
        {
          "id": "zigzag",
          "label": "Zigzag",
          "color": "#ff3fa2",
          "shape": "Zig Strider",
          "glyph": "◇",
          "animation": "shake",
          "trait": "Wide lateral movement and split shots."
        },
        {
          "id": "tank",
          "label": "Tank",
          "color": "#ff9f40",
          "shape": "Heavy Block",
          "glyph": "▤",
          "animation": "pulse",
          "trait": "High HP, burst volley pressure."
        },
        {
          "id": "sniper",
          "label": "Sniper",
          "color": "#b28cff",
          "shape": "Hover Node",
          "glyph": "◆",
          "animation": "glow",
          "trait": "Aimed lance fire at player vector."
        },
        {
          "id": "dive",
          "label": "Dive",
          "color": "#ffe066",
          "shape": "Dive Wedge",
          "glyph": "▼",
          "animation": "float",
          "trait": "Dive-bomb motion spikes."
        },
        {
          "id": "carrier",
          "label": "Carrier",
          "color": "#ff4de3",
          "shape": "Carrier Barge",
          "glyph": "▦",
          "animation": "pulse",
          "trait": "Fan-fire boss-lite encounter."
        }
      ],
      "weapons": [
        {
          "id": "pulse-core",
          "label": "Pulse Core",
          "color": "#fff08f",
          "shape": "Forward Beam",
          "glyph": "┃",
          "animation": "glow",
          "trait": "Primary centerline stream."
        },
        {
          "id": "side-lances",
          "label": "Side Lances",
          "color": "#7efcff",
          "shape": "Dual Offsets",
          "glyph": "∥",
          "animation": "pulse",
          "trait": "Unlocked at power level 2."
        },
        {
          "id": "wing-spears",
          "label": "Wing Spears",
          "color": "#ffde59",
          "shape": "Angled Pair",
          "glyph": "⟋",
          "animation": "float",
          "trait": "Unlocked at power level 3."
        },
        {
          "id": "weapon-jam",
          "label": "Jam State",
          "color": "#ff5b6e",
          "shape": "Suppression",
          "glyph": "✖",
          "animation": "blink",
          "trait": "Hazard locks firing briefly."
        }
      ],
      "upgrades": [
        {
          "id": "upgrade-triple-volley",
          "label": "Triple Volley",
          "color": "#fff08f",
          "shape": "3x Forward",
          "visual": "triple-volley",
          "trait": "Adds central triple-shot burst pattern."
        },
        {
          "id": "upgrade-overhead-spread",
          "label": "Overhead Spread",
          "color": "#7efcff",
          "shape": "Top Split",
          "visual": "overhead-spread",
          "trait": "Projectiles split downward from overhead lane."
        },
        {
          "id": "upgrade-diagonal-lances",
          "label": "Diagonal Lances",
          "color": "#ffde59",
          "shape": "Cross Angles",
          "visual": "diagonal-lances",
          "trait": "Adds diagonal wing lances to widen hitbox coverage."
        },
        {
          "id": "upgrade-tracking-pulse",
          "label": "Tracking Pulse",
          "color": "#ff5252",
          "shape": "Seek Target",
          "visual": "tracking-pulse",
          "trait": "Target-seeking pulse aligns to nearest hostile."
        },
        {
          "id": "upgrade-arc-fan",
          "label": "Arc Fan",
          "color": "#ff79f2",
          "shape": "Fan Arc",
          "visual": "arc-fan",
          "trait": "Wide fan burst for crowd pressure."
        }
      ],
      "bullets": [
        {
          "id": "enemy-single",
          "label": "Single Lance",
          "color": "#ff8f00",
          "shape": "Linear Drop",
          "glyph": "•",
          "visual": "single-lance",
          "animation": "pulse",
          "trait": "Basic enemy shot line."
        },
        {
          "id": "enemy-spread",
          "label": "Split Arc",
          "color": "#ff7f50",
          "shape": "Twin Diverge",
          "glyph": "⋰",
          "visual": "split-lance",
          "animation": "shake",
          "trait": "Spread pattern from zigzag foes."
        },
        {
          "id": "enemy-burst",
          "label": "Burst Trio",
          "color": "#ffbf40",
          "shape": "3-Round Burst",
          "glyph": "⋮",
          "visual": "burst-stack",
          "animation": "glow",
          "trait": "Tank burst pattern."
        },
        {
          "id": "enemy-aim",
          "label": "Aim Lance",
          "color": "#ff5252",
          "shape": "Tracking Vector",
          "glyph": "↘",
          "visual": "aim-lance",
          "animation": "blink",
          "trait": "Sniper aimed shot."
        },
        {
          "id": "enemy-fan",
          "label": "Fan Volley",
          "color": "#ff79f2",
          "shape": "Arc Spread",
          "glyph": "⌒",
          "visual": "fan-volley",
          "animation": "float",
          "trait": "Carrier radial fan."
        }
      ],
      "explosions": [
        {
          "id": "hit-spark",
          "label": "Hit Spark",
          "color": "#ff9f40",
          "shape": "Micro Ring",
          "visual": "hit-spark",
          "trait": "Minor impact confirmation."
        },
        {
          "id": "kill-burst",
          "label": "Kill Burst",
          "color": "#ffb347",
          "shape": "Shard Cloud",
          "visual": "kill-burst",
          "trait": "Default enemy elimination burst."
        },
        {
          "id": "carrier-breach",
          "label": "Carrier Breach",
          "color": "#ff4de3",
          "shape": "Heavy Burst",
          "visual": "carrier-breach",
          "trait": "Large force explosion profile."
        },
        {
          "id": "hull-rupture",
          "label": "Hull Rupture",
          "color": "#ff5f56",
          "shape": "Player Crash",
          "visual": "hull-rupture",
          "trait": "Player damage blast signature."
        },
        {
          "id": "shock-ring",
          "label": "Shock Ring",
          "color": "#7df2ff",
          "shape": "Expanding Ring",
          "visual": "shock-ring",
          "trait": "Ring overlay from explosion core."
        }
      ]
    }
  };
  
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
      ].join('\n');
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
  
    function createPreviewCanvasSwatch(entry, sectionKey){
      var swatch = document.createElement('span');
      swatch.className = 'ab-intel-swatch is-preview-canvas';
      swatch.title = entry.label || '';
      swatch.style.setProperty('--shot-color', entry.color || '#ffbf40');
  
      var canvas = document.createElement('canvas');
      canvas.className = 'ab-intel-preview-canvas';
      canvas.width = 36;
      canvas.height = 36;
      swatch.appendChild(canvas);
  
      var previewCtx = canvas.getContext ? canvas.getContext('2d') : null;
      if(!previewCtx){
        swatch.className = 'ab-intel-swatch';
        swatch.style.backgroundColor = entry.color || '#416181';
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
      if(sectionKey === 'bullets'){
        return createPreviewCanvasSwatch(entry, sectionKey);
      }
      if(sectionKey === 'upgrades'){
        return createPreviewCanvasSwatch(entry, sectionKey);
      }
      if(sectionKey === 'explosions'){
        return createPreviewCanvasSwatch(entry, sectionKey);
      }
      var swatch = document.createElement('span');
      var animation = entry.animation ? ' is-' + entry.animation : '';
      swatch.className = 'ab-intel-swatch' + animation;
      swatch.style.backgroundColor = entry.color || '#416181';
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
  game.__astroV2 = cloneSerializable(runtimePatch);
  game.getV2Manifest = function(){ return cloneSerializable(game.__astroV2); };
})(typeof Game01 !== "undefined" ? Game01 : null);
