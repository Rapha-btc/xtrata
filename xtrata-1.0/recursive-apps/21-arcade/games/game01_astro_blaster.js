/* Game 01: Astro Blaster - Scalable top-down shoot 'em up
 * Update playbook: ./game01_astro_blaster.playbook.md
 */
var Game01 = (function(){
  var id = 'astro_blaster';
  var title = 'Astro Blaster';
  var description = 'Top-down space shooter. Push through deep sectors and survive endless overdrive.';
  var genreTag = 'Shoot \'em Up';
  var controls = 'Arrows: Move, Space: Shoot, R: Restart';
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

  function addKey(fn){
    document.addEventListener('keydown', fn);
    listeners.push(['keydown', fn]);
  }

  function addKeyUp(fn){
    document.addEventListener('keyup', fn);
    listeners.push(['keyup', fn]);
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

  function startGame(){
    var rngBundle = createRngBundle();
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
      powerups: [],
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
      powerLevel: 1,
      powerTimer: 0,
      combo: 0,
      comboTimer: 0,
      invulnTimer: 0,
      shake: 0,
      testMode: false,
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
    var wave = buildWaveSpec(state.level);
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
    var centerX = p.x + p.w * 0.5 - 2;
    var baseY = p.y - 6;

    var cooldown = state.powerLevel >= 3 ? 6 : 8;
    state.shootCool = cooldown;

    spawnPlayerShot(centerX, baseY, 0, -7.4, state.powerLevel >= 3 ? 2 : 1, '#fff08f');

    if(state.powerLevel >= 2){
      spawnPlayerShot(p.x + 1, baseY + 8, -0.4, -6.9, 1, '#7efcff');
      spawnPlayerShot(p.x + p.w - 5, baseY + 8, 0.4, -6.9, 1, '#7efcff');
    }

    if(state.powerLevel >= 3){
      spawnPlayerShot(centerX - 8, baseY + 12, -1.05, -6.3, 1, '#ffde59');
      spawnPlayerShot(centerX + 8, baseY + 12, 1.05, -6.3, 1, '#ffde59');
    }

    if(shared.beep) shared.beep(900, 0.035, 'square', 0.02);
  }

  function enemyFire(enemy){
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

    var p = state.player;
    var moveSpeed = state.invulnTimer > 0 ? p.speed * 1.08 : p.speed;

    if(keys.ArrowLeft) p.x -= moveSpeed;
    if(keys.ArrowRight) p.x += moveSpeed;
    if(keys.ArrowUp) p.y -= moveSpeed;
    if(keys.ArrowDown) p.y += moveSpeed;

    p.x = ArcadeUtils.clamp(p.x, 0, WIDTH - p.w);
    p.y = ArcadeUtils.clamp(p.y, 220, HEIGHT - p.h);

    state.shootCool--;
    if(keys[' '] && state.shootCool <= 0){
      firePlayerWeapons();
    }

    if(state.powerTimer > 0){
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

      spawnWave();
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

  function drawShots(){
    var i;
    for(i = 0; i < state.playerShots.length; i++){
      var ps = state.playerShots[i];
      ctx.fillStyle = ps.color;
      ctx.fillRect(ps.x, ps.y, ps.w, ps.h);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ps.x + 1, ps.y - 3, 2, 3);
    }

    for(i = 0; i < state.enemyShots.length; i++){
      var es = state.enemyShots[i];
      ctx.fillStyle = es.color;
      ctx.fillRect(es.x, es.y, es.w, es.h);
    }
  }

  function drawPowerups(){
    var i;
    for(i = 0; i < state.powerups.length; i++){
      var pw = state.powerups[i];
      ctx.fillStyle = pw.type === 'life' ? '#6dff8d' : '#4de8ff';
      ctx.fillRect(pw.x, pw.y, pw.w, pw.h);
      ctx.fillStyle = '#071019';
      ctx.font = '10px monospace';
      ctx.fillText(pw.type === 'life' ? '+' : 'P', pw.x + 4, pw.y + 12);
    }
  }

  function drawParticlesAndExplosions(){
    var i;

    for(i = 0; i < state.explosions.length; i++){
      var ex = state.explosions[i];
      var alpha = ex.life / ex.maxLife;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = ex.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, ex.radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    for(i = 0; i < state.particles.length; i++){
      var pt = state.particles[i];
      var pAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.globalAlpha = pAlpha;
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x, pt.y, pt.size || 2, pt.size || 2);
    }

    ctx.globalAlpha = 1;
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
    shared.highScores.maybeSubmit({
      gameId: id,
      score: state.score,
      mode: 'score',
      title: title
    });
  }

  function destroy(){
    cancelAnimationFrame(raf);
    intervals.forEach(function(id){ clearInterval(id); });
    intervals = [];
    listeners.forEach(function(l){ document.removeEventListener(l[0], l[1]); });
    listeners = [];
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
    getTestHooks: getTestHooks
  };
})();
