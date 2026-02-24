/* Game 01: Astro Blaster - Scalable top-down shoot 'em up
 * Update playbook: ./game01_astro_blaster.playbook.md
 */
var Game01 = (function(){
  var id = 'astro_blaster';
  var title = 'Astro Blaster';
  var description = 'Top-down space shooter. Push through deep sectors and survive endless overdrive.';
  var genreTag = 'Shoot \'em Up';
  var controls = 'Arrows: Move (Up/Down unlock later), Space: Tap Fire (Auto unlocks), X: EMP Pulse, P: Pause, R: Restart';
  var hasLevels = true;
  var scoreMode = 'score';

  var WIDTH = 480;
  var HEIGHT = 600;
  var MAX_CAMPAIGN_LEVEL = 120;
  var MAX_LIVES = 5;
  var WAVE_CLEARS_PER_LEVEL = 2;
  var FIRE_CADENCE_COOLDOWNS = [14, 12, 11, 10, 9, 8, 7, 6];
  var FIRE_AUTO_UNLOCK_TIER = 4;
  var SPECIAL_CHARGE_MAX = 100;
  var SPECIAL_COOLDOWN_FRAMES = 540;
  var SPECIAL_PULSE_FRAMES = 34;

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

  function purgeLegacyPauseButtons(){
    if(!container || typeof container.querySelectorAll !== 'function') return;
    var nodes = container.querySelectorAll('.ab-pause-btn');
    var i;
    for(i = 0; i < nodes.length; i++){
      if(nodes[i] && nodes[i].parentNode){
        nodes[i].parentNode.removeChild(nodes[i]);
      }
    }
  }

  function setPaused(nextPaused){
    if(!state || state.gameOver) return;
    var target = !!nextPaused;
    if(state.paused === target) return;

    state.paused = target;
    keys['ArrowLeft'] = false;
    keys['ArrowRight'] = false;
    keys['ArrowUp'] = false;
    keys['ArrowDown'] = false;
    keys[' '] = false;

    if(shared && shared.beep){
      if(target){
        shared.beep(210, 0.05, 'square', 0.04);
      } else {
        shared.beep(560, 0.05, 'sine', 0.04);
      }
    }
  }

  function togglePause(){
    if(!state || state.gameOver) return;
    setPaused(!state.paused);
  }

  function init(cont, sh){
    container = cont;
    shared = sh;
    purgeLegacyPauseButtons();
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

      if(e.key === 'p' || e.key === 'P'){
        e.preventDefault();
        togglePause();
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
        var runtimeAutoUnlockTier = Math.max(1, Math.floor(Number(runtimeState.fireAutoUnlockTier) || FIRE_AUTO_UNLOCK_TIER));
        var runtimeMaxFireTier = Math.max(
          runtimeAutoUnlockTier,
          Math.floor(Number(runtimeState.maxFireCadenceTier) || (FIRE_CADENCE_COOLDOWNS.length - 1))
        );
        return {
          powerups: Array.isArray(runtimeState.powerups) ? runtimeState.powerups : [],
          powerLevel: Math.max(1, Math.floor(Number(runtimeState.powerLevel) || 1)),
          powerTimer: Math.max(0, Math.floor(Number(runtimeState.powerTimer) || 0)),
          fireCadenceTier: Math.max(
            0,
            Math.min(runtimeMaxFireTier, Math.floor(Number(runtimeState.fireCadenceTier) || 0))
          ),
          fireAutoUnlocked: !!runtimeState.fireAutoUnlocked,
          fireAutoUnlockTier: runtimeAutoUnlockTier,
          maxFireCadenceTier: runtimeMaxFireTier
        };
      }
    }
    return {
      powerups: [],
      powerLevel: 1,
      powerTimer: 0,
      fireCadenceTier: 0,
      fireAutoUnlocked: false,
      fireAutoUnlockTier: FIRE_AUTO_UNLOCK_TIER,
      maxFireCadenceTier: FIRE_CADENCE_COOLDOWNS.length - 1
    };
  }

  function getFallbackShotPattern(player){
    var centerX = player.x + player.w * 0.5 - 2;
    var baseY = player.y - 6;
    var powerLevel = state.powerLevel;
    var maxFireTier = Math.max(
      FIRE_AUTO_UNLOCK_TIER,
      Math.floor(Number(state.maxFireCadenceTier) || (FIRE_CADENCE_COOLDOWNS.length - 1))
    );
    var fireCadenceTier = Math.max(0, Math.min(maxFireTier, Math.floor(Number(state.fireCadenceTier) || 0)));
    var fallbackCooldown = Number(FIRE_CADENCE_COOLDOWNS[fireCadenceTier]);
    if(!isFinite(fallbackCooldown)){
      fallbackCooldown = powerLevel >= 3 ? 6 : 8;
    }
    var pattern = {
      cooldown: Math.max(1, Math.floor(fallbackCooldown)),
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
      shootHeldLast: false,
      powerLevel: powerupState.powerLevel,
      powerTimer: powerupState.powerTimer,
      fireCadenceTier: powerupState.fireCadenceTier,
      fireAutoUnlocked: !!powerupState.fireAutoUnlocked,
      upgradeArchetype: null,
      fireAutoUnlockTier: powerupState.fireAutoUnlockTier,
      maxFireCadenceTier: powerupState.maxFireCadenceTier,
      fireUnlockIntro: 0,
      weaponJamTimer: 0,
      hazardSlowTimer: 0,
      hazardSlowMultiplier: 1,
      hazardReinforcementTimer: 0,
      hazardReinforcementBudget: 0,
      shieldCharges: 0,
      shieldTimer: 0,
      shieldMaxCharges: 1,
      shieldHitFlash: 0,
      shieldFacingAngle: -Math.PI * 0.5,
      shieldArcHalfAngle: Math.PI * 0.42,
      specialCharge: 0,
      specialChargeMax: SPECIAL_CHARGE_MAX,
      specialCooldown: 0,
      specialPulseTimer: 0,
      specialHeldLast: false,
      combo: 0,
      comboTimer: 0,
      invulnTimer: 0,
      shake: 0,
      paused: false,
      verticalMobilityUnlocked: false,
      mobilityUnlockIntro: 0,
      wavesClearedSinceLevelUp: 0,
      wavesPerLevel: WAVE_CLEARS_PER_LEVEL,
      testMode: false,
      forceNextWaveInvincible: false,
      deterministicSeed: forcedSeed,
      submitQueued: false,
      currentProfile: null
    };

    spawnWave();
    loop();
  }

  function restartGame(){
    cancelAnimationFrame(raf);
    intervals.forEach(function(id){ clearInterval(id); });
    intervals = [];
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

    if(shared.beep){
      shared.beep(480, 0.05, 'square', 0.03);
      shared.beep(640, 0.04, 'square', 0.03);
    }
  }

  function spawnHazardReinforcements(budgetBonus){
    var bonus = Math.max(0, Math.floor(Number(budgetBonus) || 0));
    if(bonus <= 0) return 0;

    var profile = state.currentProfile || getLevelProfile(state.level);
    var budget = Math.max(1, Math.min(24, bonus));
    var picks = [];

    while(budget > 0 && picks.length < 8){
      var typeId = pickEnemyType(profile, budget);
      if(!typeId){
        break;
      }
      picks.push(typeId);
      budget -= ENEMY_TYPES[typeId].cost;
    }

    if(picks.length === 0){
      picks.push('scout');
    }

    var slots = buildFormationSlots(picks.length, 'swarm');
    var added = 0;
    var i;
    for(i = 0; i < picks.length; i++){
      var enemy = makeEnemy(picks[i], slots[i], profile, i + state.enemies.length);
      enemy.y -= 48 + randInt(0, 90);
      enemy.fireCooldown += randInt(10, 60);
      state.enemies.push(enemy);
      added++;
    }

    if(added > 0){
      if(shared.beep){
        shared.beep(320, 0.06, 'sawtooth', 0.04);
        shared.beep(260, 0.07, 'square', 0.04);
      }
      state.waveIntro = Math.max(state.waveIntro, 24);
    }

    return added;
  }

  function advanceProgressionAfterWaveClear(){
    if(state.gameOver) return;

    state.wavesClearedSinceLevelUp += 1;
    if(state.wavesClearedSinceLevelUp >= state.wavesPerLevel){
      state.wavesClearedSinceLevelUp = 0;
      state.level++;
      state.score += 320 + Math.floor(state.level * 10);
    }

    if(!state.campaignComplete && state.level > MAX_CAMPAIGN_LEVEL){
      state.campaignComplete = true;
      state.score += 5000;
      if(shared.beep){
        shared.beep(420, 0.06, 'triangle', 0.04);
        shared.beep(620, 0.06, 'triangle', 0.04);
        shared.beep(820, 0.08, 'triangle', 0.05);
      }
    }

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

    var dropRoll = rand();
    var type = dropRoll < 0.48 ? 'multiplier' : (dropRoll < 0.8 ? 'spread' : 'life');
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

    var threat = Math.max(1, Math.floor(Number(enemy && (enemy.maxHp || enemy.hp) || 1)));
    var chargeGain = 4 + Math.floor(threat * 1.5);
    state.specialCharge = Math.min(state.specialChargeMax, Math.max(0, Number(state.specialCharge || 0) + chargeGain));
  }

  function activateSpecialWeapon(){
    if(!state || state.gameOver) return false;
    if(state.specialCooldown > 0) return false;
    if((Number(state.specialCharge) || 0) < (Number(state.specialChargeMax) || SPECIAL_CHARGE_MAX)) return false;

    state.specialCharge = 0;
    state.specialCooldown = SPECIAL_COOLDOWN_FRAMES;
    state.specialPulseTimer = SPECIAL_PULSE_FRAMES;
    state.shake = Math.max(state.shake, 8);

    state.enemyShots = [];

    var i;
    for(i = state.enemies.length - 1; i >= 0; i--){
      var enemy = state.enemies[i];
      enemy.hp -= 1;
      spawnExplosion(enemy.x + enemy.w * 0.5, enemy.y + enemy.h * 0.5, '#7df2ff', 0.72);
      if(enemy.hp <= 0){
        state.enemies.splice(i, 1);
        addScoreForKill(enemy);
        maybeDropPowerup(enemy);
      }
    }

    if(shared && shared.beep){
      shared.beep(420, 0.06, 'triangle', 0.05);
      shared.beep(620, 0.08, 'sine', 0.05);
      shared.beep(320, 0.06, 'square', 0.04);
    }
    return true;
  }

  function normalizeAngle(angle){
    var tau = Math.PI * 2;
    while(angle <= -Math.PI){
      angle += tau;
    }
    while(angle > Math.PI){
      angle -= tau;
    }
    return angle;
  }

  function getShieldFacingAngle(){
    var facing = Number(state.shieldFacingAngle);
    if(!isFinite(facing)){
      facing = -Math.PI * 0.5;
    }
    return normalizeAngle(facing);
  }

  function setShieldFacingFromInput(dx, dy){
    if(Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001){
      return;
    }
    state.shieldFacingAngle = normalizeAngle(Math.atan2(dy, dx));
  }

  function shieldCanIntercept(sourceX, sourceY){
    if((state.shieldCharges <= 0) || (state.shieldTimer <= 0)){
      return false;
    }

    if(!isFinite(sourceX) || !isFinite(sourceY)){
      return true;
    }

    var p = state.player;
    var shieldCenterX = p.x + p.w * 0.5;
    var shieldCenterY = p.y + p.h * 0.54;
    var incomingAngle = Math.atan2(sourceY - shieldCenterY, sourceX - shieldCenterX);
    var halfArc = Number(state.shieldArcHalfAngle);
    if(!isFinite(halfArc) || halfArc <= 0){
      halfArc = Math.PI * 0.42;
    }
    var delta = normalizeAngle(incomingAngle - getShieldFacingAngle());
    return Math.abs(delta) <= halfArc;
  }

  function damagePlayer(amount, source){
    if(state.invulnTimer > 0 || state.gameOver) return;

    if(state.forceNextWaveInvincible){
      state.invulnTimer = Math.max(state.invulnTimer, 18);
      return;
    }

    var sourceX = source ? Number(source.x) : NaN;
    var sourceY = source ? Number(source.y) : NaN;

    if(shieldCanIntercept(sourceX, sourceY)){
      state.shieldCharges = Math.max(0, state.shieldCharges - 1);
      state.shieldHitFlash = 28;
      state.invulnTimer = Math.max(state.invulnTimer, 18);
      if(state.shieldCharges <= 0){
        state.shieldTimer = 0;
      }
      var sp = state.player;
      spawnExplosion(sp.x + sp.w * 0.5, sp.y + sp.h * 0.5, '#7df2ff', 0.95);
      if(shared && shared.beep){
        shared.beep(700, 0.06, 'triangle', 0.05);
      }
      return;
    }

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

    if(state.paused){
      state.shootHeldLast = !!keys[' '];
      state.specialHeldLast = !!keys['x'] || !!keys['X'];
      if(state.shake > 0){
        state.shake--;
      }
      return;
    }

    var p = state.player;
    var powerupsRuntime = getPowerupsRuntime();
    var rewardsHazardsRuntime = getRewardsHazardsRuntime();
    var moveSpeed = state.invulnTimer > 0 ? p.speed * 1.08 : p.speed;
    var moveInputX = 0;
    var moveInputY = 0;
    if(state.hazardSlowTimer > 0){
      moveSpeed *= Math.max(0.35, Math.min(1, Number(state.hazardSlowMultiplier) || 1));
    }

    if(keys.ArrowLeft){
      p.x -= moveSpeed;
      moveInputX -= 1;
    }
    if(keys.ArrowRight){
      p.x += moveSpeed;
      moveInputX += 1;
    }

    if(state.verticalMobilityUnlocked){
      if(keys.ArrowUp){
        p.y -= moveSpeed;
        moveInputY -= 1;
      }
      if(keys.ArrowDown){
        p.y += moveSpeed;
        moveInputY += 1;
      }
    } else if((keys.ArrowUp || keys.ArrowDown) && shared && shared.beep && (state.tick % 28 === 0)){
      shared.beep(185, 0.03, 'square', 0.025);
    }

    setShieldFacingFromInput(moveInputX, moveInputY);

    p.x = ArcadeUtils.clamp(p.x, 0, WIDTH - p.w);
    p.y = ArcadeUtils.clamp(p.y, 220, HEIGHT - p.h);

    if(state.weaponJamTimer > 0){
      state.weaponJamTimer--;
    }
    if(state.hazardSlowTimer > 0){
      state.hazardSlowTimer--;
      if(state.hazardSlowTimer <= 0){
        state.hazardSlowTimer = 0;
        state.hazardSlowMultiplier = 1;
      }
    }
    if(state.hazardReinforcementTimer > 0){
      state.hazardReinforcementTimer--;
      if(state.hazardReinforcementTimer <= 0){
        var reinforcementBudget = Math.max(0, Math.floor(Number(state.hazardReinforcementBudget) || 0));
        state.hazardReinforcementTimer = 0;
        state.hazardReinforcementBudget = 0;
        if(reinforcementBudget > 0){
          spawnHazardReinforcements(reinforcementBudget);
        }
      }
    }
    if(state.specialCooldown > 0){
      state.specialCooldown--;
    }
    if(state.specialPulseTimer > 0){
      state.specialPulseTimer--;
    }

    state.shootCool--;
    var shootHeld = !!keys[' '];
    var shootPressed = shootHeld && !state.shootHeldLast;
    state.shootHeldLast = shootHeld;
    var specialHeld = !!keys['x'] || !!keys['X'];
    var specialPressed = specialHeld && !state.specialHeldLast;
    state.specialHeldLast = specialHeld;
    if(specialPressed){
      activateSpecialWeapon();
    }
    var shouldFireAttempt = state.fireAutoUnlocked ? shootHeld : shootPressed;
    if(shouldFireAttempt && state.shootCool <= 0){
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
    if(state.shieldTimer > 0){
      state.shieldTimer--;
      if(state.shieldTimer <= 0){
        state.shieldTimer = 0;
        state.shieldCharges = 0;
      }
    }
    if(state.shieldHitFlash > 0){
      state.shieldHitFlash--;
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
        damagePlayer(1, {
          x: es.x + es.w * 0.5,
          y: es.y + es.h * 0.5,
          type: 'enemy-shot'
        });
      }
    }

    for(i = state.enemies.length - 1; i >= 0; i--){
      var alive = updateEnemy(state.enemies[i]);
      if(!alive){
        state.enemies.splice(i, 1);
        continue;
      }

      if(ArcadeUtils.rectsOverlap(state.enemies[i], p)){
        var impactEnemy = state.enemies[i];
        spawnExplosion(impactEnemy.x + impactEnemy.w * 0.5, impactEnemy.y + impactEnemy.h * 0.5, impactEnemy.color, 0.9);
        state.enemies.splice(i, 1);
        damagePlayer(1, {
          x: impactEnemy.x + impactEnemy.w * 0.5,
          y: impactEnemy.y + impactEnemy.h * 0.5,
          type: 'enemy-body'
        });
      }
    }

    if(powerupsRuntime && typeof powerupsRuntime.updatePowerups === 'function'){
      powerupsRuntime.updatePowerups({
        state: state,
        player: p,
        tick: state.tick,
        shared: shared,
        spawnEnemyShot: spawnEnemyShot,
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
          } else if(pw.type === 'multiplier'){
            state.fireCadenceTier = Math.min(state.maxFireCadenceTier, Math.max(0, state.fireCadenceTier + 1));
            state.fireAutoUnlocked = state.fireCadenceTier >= state.fireAutoUnlockTier;
            if(state.fireAutoUnlocked){
              state.fireUnlockIntro = Math.max(state.fireUnlockIntro, 180);
            }
            if(shared.beep){
              if(state.fireAutoUnlocked){
                shared.beep(540, 0.05, 'triangle', 0.04);
                shared.beep(760, 0.07, 'triangle', 0.04);
              } else {
                shared.beep(620, 0.05, 'square', 0.03);
              }
            }
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

    if(state.mobilityUnlockIntro > 0){
      state.mobilityUnlockIntro--;
    }
    if(state.fireUnlockIntro > 0){
      state.fireUnlockIntro--;
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
      advanceProgressionAfterWaveClear();
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

    if(state.shieldCharges > 0 && state.shieldTimer > 0){
      var shieldPulse = 0.35 + Math.sin(state.tick * 0.14) * 0.22;
      var shieldFlash = state.shieldHitFlash > 0 ? 0.85 : 0;
      var shieldAlpha = Math.max(0.22, Math.min(0.9, shieldPulse + shieldFlash));
      var shieldRadius = Math.max(p.w, p.h) * 0.66;
      var shieldCenterX = p.x + p.w * 0.5;
      var shieldCenterY = p.y + p.h * 0.54;
      var shieldFacing = getShieldFacingAngle();
      var shieldHalfArc = Number(state.shieldArcHalfAngle);
      if(!isFinite(shieldHalfArc) || shieldHalfArc <= 0){
        shieldHalfArc = Math.PI * 0.42;
      }
      ctx.globalAlpha = shieldAlpha;
      ctx.strokeStyle = '#7df2ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(shieldCenterX, shieldCenterY, shieldRadius, shieldFacing - shieldHalfArc, shieldFacing + shieldHalfArc);
      ctx.stroke();
      ctx.lineWidth = 1.25;
      ctx.globalAlpha = Math.max(0.2, shieldAlpha * 0.7);
      ctx.beginPath();
      ctx.arc(shieldCenterX, shieldCenterY, shieldRadius - 3, shieldFacing - shieldHalfArc * 0.85, shieldFacing + shieldHalfArc * 0.85);
      ctx.stroke();
      ctx.globalAlpha = 1;
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
        : (pw.type === 'hazard' ? '#ff5b6e' : (pw.type === 'multiplier' ? '#ffd66e' : '#4de8ff'));
      ctx.fillRect(pw.x, pw.y, pw.w, pw.h);
      ctx.fillStyle = '#071019';
      ctx.font = '10px monospace';
      ctx.fillText(pw.type === 'life' ? '+' : (pw.type === 'hazard' ? '!' : (pw.type === 'multiplier' ? 'x' : 'P')), pw.x + 4, pw.y + 12);
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

    if(state.specialPulseTimer > 0){
      var pulseRatio = 1 - (state.specialPulseTimer / SPECIAL_PULSE_FRAMES);
      var radius = 22 + pulseRatio * (Math.max(WIDTH, HEIGHT) * 0.46);
      ctx.globalAlpha = Math.max(0.08, 0.34 * (1 - pulseRatio));
      ctx.strokeStyle = '#7df2ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(state.player.x + state.player.w * 0.5, state.player.y + state.player.h * 0.5, radius, 0, Math.PI * 2);
      ctx.stroke();
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
    if(state.hazardSlowTimer > 0){
      ctx.fillStyle = '#ff9b6e';
      ctx.font = '12px monospace';
      ctx.fillText('THRUSTER DRAG ' + (state.hazardSlowTimer / 60).toFixed(1) + 's', 300, 74);
    }
    if(state.hazardReinforcementTimer > 0){
      ctx.fillStyle = '#ff6f9e';
      ctx.font = '12px monospace';
      ctx.fillText('AMBUSH ETA ' + (state.hazardReinforcementTimer / 60).toFixed(1) + 's', 300, 90);
    }

    ctx.font = '11px monospace';
    ctx.fillStyle = state.verticalMobilityUnlocked ? '#89f4ff' : '#ffb980';
    ctx.fillText(
      state.verticalMobilityUnlocked ? 'Vertical Thrusters: ONLINE' : 'Vertical Thrusters: LOCKED',
      10,
      58
    );
    ctx.fillStyle = state.fireAutoUnlocked ? '#8bffbe' : '#ffd089';
    ctx.fillText(
      'Fire: ' + (state.fireAutoUnlocked ? 'AUTO' : 'TAP') + ' T' + state.fireCadenceTier + '/' + state.maxFireCadenceTier,
      10,
      74
    );
    ctx.fillStyle = state.upgradeArchetype ? '#d2c2ff' : '#9eaec1';
    ctx.fillText(
      'Path: ' + (state.upgradeArchetype ? String(state.upgradeArchetype).toUpperCase() : 'UNASSIGNED'),
      10,
      90
    );
    ctx.fillStyle = state.shieldCharges > 0 && state.shieldTimer > 0 ? '#7df2ff' : '#8aa7be';
    ctx.fillText(
      'Shield: ' + (state.shieldCharges > 0 && state.shieldTimer > 0
        ? ('Aegis x' + state.shieldCharges + ' (' + (state.shieldTimer / 60).toFixed(1) + 's)')
        : 'Offline'),
      10,
      106
    );
    var specialReady = (state.specialCharge >= state.specialChargeMax) && (state.specialCooldown <= 0);
    ctx.fillStyle = specialReady ? '#7df2ff' : '#9fb6ca';
    ctx.fillText(
      'EMP: ' + (specialReady
        ? 'READY [X]'
        : (Math.floor((state.specialCharge / state.specialChargeMax) * 100) + '%'
          + (state.specialCooldown > 0 ? (' CD ' + (state.specialCooldown / 60).toFixed(1) + 's') : ''))),
      10,
      122
    );
    if(state.forceNextWaveInvincible){
      ctx.fillStyle = '#ffb86b';
      ctx.fillText('TEST INVINCIBLE (NEXT WAVE)', 10, 138);
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

  function drawPauseOverlay(){
    if(!state.paused || state.gameOver) return;

    ctx.fillStyle = 'rgba(0,0,0,0.58)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#9cecff';
    ctx.font = '22px monospace';
    ctx.fillText('PAUSED', WIDTH * 0.5, HEIGHT * 0.42);

    ctx.fillStyle = '#ffd66e';
    ctx.font = '15px monospace';
    ctx.fillText('Take a break, then resume when ready.', WIDTH * 0.5, HEIGHT * 0.42 + 30);

    ctx.fillStyle = '#d7d7d7';
    ctx.font = '13px monospace';
    ctx.fillText('Press P to resume', WIDTH * 0.5, HEIGHT * 0.42 + 58);
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
    drawPauseOverlay();
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
    state.paused = false;
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
    purgeLegacyPauseButtons();
    if(container) container.innerHTML = '';
  }

  function getTestHooks(){
    return {
      getState: function(){
        return {
          level: state.level,
          score: state.score,
          gameOver: state.gameOver,
          paused: !!state.paused,
          lives: state.lives,
          wave: state.wave,
          verticalMobilityUnlocked: !!state.verticalMobilityUnlocked,
          fireCadenceTier: state.fireCadenceTier,
          fireAutoUnlocked: !!state.fireAutoUnlocked,
          upgradeArchetype: state.upgradeArchetype || null,
          weaponJamTimer: Math.max(0, Math.floor(Number(state.weaponJamTimer) || 0)),
          hazardSlowTimer: Math.max(0, Math.floor(Number(state.hazardSlowTimer) || 0)),
          hazardSlowMultiplier: Math.max(0.35, Math.min(1, Number(state.hazardSlowMultiplier) || 1)),
          hazardReinforcementTimer: Math.max(0, Math.floor(Number(state.hazardReinforcementTimer) || 0)),
          hazardReinforcementBudget: Math.max(0, Math.floor(Number(state.hazardReinforcementBudget) || 0)),
          shieldCharges: Math.max(0, Math.floor(Number(state.shieldCharges) || 0)),
          shieldTimer: Math.max(0, Math.floor(Number(state.shieldTimer) || 0)),
          shieldFacingAngle: getShieldFacingAngle(),
          shieldArcHalfAngle: Math.max(0.1, Math.min(Math.PI, Number(state.shieldArcHalfAngle) || (Math.PI * 0.42))),
          specialCharge: Math.max(0, Math.floor(Number(state.specialCharge) || 0)),
          specialChargeMax: Math.max(1, Math.floor(Number(state.specialChargeMax) || SPECIAL_CHARGE_MAX)),
          specialCooldown: Math.max(0, Math.floor(Number(state.specialCooldown) || 0)),
          specialReady: ((Number(state.specialCharge) || 0) >= (Number(state.specialChargeMax) || SPECIAL_CHARGE_MAX)) && ((Number(state.specialCooldown) || 0) <= 0),
          forceNextWaveInvincible: !!state.forceNextWaveInvincible,
          sector: state.currentProfile ? state.currentProfile.sectorName : null,
          seed: state.seed
        };
      },
      completeLevel: function(){
        state.testMode = true;
        state.forceNextWaveInvincible = true;
        state.lives = Math.max(state.lives, 10000);
        state.invulnTimer = Math.max(state.invulnTimer, 60);
        state.enemies = [];
        state.enemyShots = [];
      },
      primeSpecial: function(){
        state.specialCharge = state.specialChargeMax;
        state.specialCooldown = 0;
      },
      triggerSpecial: function(){
        return activateSpecialWeapon();
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
