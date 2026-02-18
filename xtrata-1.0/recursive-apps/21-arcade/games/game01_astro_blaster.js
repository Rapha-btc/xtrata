/* Game 01: Astro Blaster - Top-down shoot 'em up */
var Game01 = (function(){
  var id = 'astro_blaster';
  var title = 'Astro Blaster';
  var description = 'Top-down space shooter. Destroy waves of enemies!';
  var genreTag = 'Shoot \'em Up';
  var controls = 'Arrows: Move, Space: Shoot, R: Restart';
  var hasLevels = true;
  var scoreMode = 'score';

  var canvas, ctx, container, shared;
  var raf, keys, state;
  var listeners = [];
  var intervals = [];

  function addKey(fn){ document.addEventListener('keydown',fn); listeners.push(['keydown',fn]); }
  function addKeyUp(fn){ document.addEventListener('keyup',fn); listeners.push(['keyup',fn]); }

  function init(cont, sh){
    container = cont; shared = sh;
    canvas = document.createElement('canvas');
    canvas.width = 480; canvas.height = 600;
    container.appendChild(canvas);
    ctx = canvas.getContext('2d');
    keys = {};
    var kd = function(e){ keys[e.key]=true; if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].indexOf(e.key)>=0) e.preventDefault(); if(e.key==='r'||e.key==='R') restartGame(); };
    var ku = function(e){ keys[e.key]=false; };
    addKey(kd); addKeyUp(ku);
    startGame();
  }

  function startGame(){
    state = {
      player: {x:220,y:520,w:32,h:32,speed:4},
      bullets: [],
      enemies: [],
      particles: [],
      powerups: [],
      score: 0,
      level: 1,
      lives: 3,
      wave: 0,
      waveTimer: 0,
      gameOver: false,
      won: false,
      shootCool: 0,
      powerLevel: 1,
      powerTimer: 0,
      testMode: false,
      deterministicSeed: null
    };
    spawnWave();
    loop();
  }

  function restartGame(){
    cancelAnimationFrame(raf);
    intervals.forEach(function(id){clearInterval(id);});
    intervals=[];
    startGame();
  }

  function spawnWave(){
    state.wave++;
    var count = 4 + state.level * 2;
    for(var i=0;i<count;i++){
      state.enemies.push({
        x: 30 + (i % 8) * 54,
        y: -30 - Math.floor(i/8)*40,
        w:28, h:28,
        hp: 1 + Math.floor(state.level/3),
        speed: 0.5 + state.level*0.15,
        dir: 1,
        shootTimer: Math.random()*200+100
      });
    }
  }

  function loop(){
    update();
    draw();
    if(!state.gameOver) raf = requestAnimationFrame(loop);
  }

  function update(){
    var p = state.player;
    if(keys['ArrowLeft']) p.x -= p.speed;
    if(keys['ArrowRight']) p.x += p.speed;
    if(keys['ArrowUp']) p.y -= p.speed;
    if(keys['ArrowDown']) p.y += p.speed;
    p.x = ArcadeUtils.clamp(p.x, 0, canvas.width-p.w);
    p.y = ArcadeUtils.clamp(p.y, 200, canvas.height-p.h);

    state.shootCool--;
    if(keys[' '] && state.shootCool<=0){
      state.shootCool = 8;
      state.bullets.push({x:p.x+p.w/2-2,y:p.y,w:4,h:10,dy:-6,friendly:true});
      if(state.powerLevel>=2){
        state.bullets.push({x:p.x,y:p.y+8,w:4,h:10,dy:-6,friendly:true});
        state.bullets.push({x:p.x+p.w-4,y:p.y+8,w:4,h:10,dy:-6,friendly:true});
      }
      if(shared.beep) shared.beep(880,0.05,'square',0.03);
    }

    if(state.powerTimer>0) state.powerTimer--;
    if(state.powerTimer<=0 && state.powerLevel>1) state.powerLevel=1;

    /* Bullets */
    for(var i=state.bullets.length-1;i>=0;i--){
      var b=state.bullets[i];
      b.y += b.dy;
      if(b.y<-10||b.y>canvas.height+10){ state.bullets.splice(i,1); continue; }
      if(b.friendly){
        for(var j=state.enemies.length-1;j>=0;j--){
          if(ArcadeUtils.rectsOverlap(b,state.enemies[j])){
            state.enemies[j].hp--;
            state.bullets.splice(i,1);
            if(state.enemies[j].hp<=0){
              addParticles(state.enemies[j].x,state.enemies[j].y,'#f80',8);
              state.score += 100 * state.level;
              if(Math.random()<0.1) state.powerups.push({x:state.enemies[j].x,y:state.enemies[j].y,w:16,h:16,dy:1.5});
              state.enemies.splice(j,1);
              if(shared.beep) shared.beep(220,0.1,'sawtooth',0.04);
            }
            break;
          }
        }
      } else {
        if(ArcadeUtils.rectsOverlap(b,p)){
          state.bullets.splice(i,1);
          state.lives--;
          addParticles(p.x+p.w/2,p.y+p.h/2,'#f00',12);
          if(shared.beep) shared.beep(110,0.2,'sawtooth',0.06);
          if(state.lives<=0) endGame(false);
        }
      }
    }

    /* Enemies */
    state.enemies.forEach(function(e){
      e.y += e.speed;
      e.x += e.dir * 0.3;
      if(e.x<0||e.x>canvas.width-e.w) e.dir*=-1;
      e.shootTimer--;
      if(e.shootTimer<=0){
        e.shootTimer = 150+Math.random()*100;
        state.bullets.push({x:e.x+e.w/2-2,y:e.y+e.h,w:4,h:8,dy:3,friendly:false});
      }
      if(e.y>canvas.height) e.y = -30;
    });

    /* Powerups */
    for(var i=state.powerups.length-1;i>=0;i--){
      state.powerups[i].y += state.powerups[i].dy;
      if(ArcadeUtils.rectsOverlap(state.powerups[i],p)){
        state.powerLevel=2; state.powerTimer=600;
        state.powerups.splice(i,1);
        if(shared.beep) shared.beep(660,0.15,'sine',0.05);
        continue;
      }
      if(state.powerups[i].y>canvas.height+20) state.powerups.splice(i,1);
    }

    /* Particles */
    for(var i=state.particles.length-1;i>=0;i--){
      var pt=state.particles[i];
      pt.x+=pt.vx; pt.y+=pt.vy; pt.life--;
      if(pt.life<=0) state.particles.splice(i,1);
    }

    /* Wave clear */
    if(state.enemies.length===0 && !state.gameOver){
      state.level++;
      if(state.level>10){ endGame(true); }
      else { spawnWave(); }
    }
  }

  function addParticles(x,y,color,count){
    for(var i=0;i<count;i++){
      state.particles.push({x:x,y:y,vx:(Math.random()-0.5)*4,vy:(Math.random()-0.5)*4,life:20+Math.random()*15,color:color});
    }
  }

  function draw(){
    ctx.fillStyle='#000';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    /* Stars */
    ctx.fillStyle='#224';
    for(var i=0;i<30;i++){
      var sx=((i*73+state.score)%canvas.width), sy=((i*47+state.wave*10)%canvas.height);
      ctx.fillRect(sx,sy,1,1);
    }
    /* Player */
    var p=state.player;
    ctx.fillStyle=state.powerLevel>=2?'#0ff':'#0f0';
    ctx.beginPath();
    ctx.moveTo(p.x+p.w/2,p.y);
    ctx.lineTo(p.x,p.y+p.h);
    ctx.lineTo(p.x+p.w,p.y+p.h);
    ctx.closePath();
    ctx.fill();
    /* Enemies */
    state.enemies.forEach(function(e){
      ctx.fillStyle='#f44';
      ctx.fillRect(e.x,e.y,e.w,e.h);
      ctx.fillStyle='#f88';
      ctx.fillRect(e.x+6,e.y+6,6,6);
      ctx.fillRect(e.x+e.w-12,e.y+6,6,6);
    });
    /* Bullets */
    state.bullets.forEach(function(b){
      ctx.fillStyle=b.friendly?'#ff0':'#f80';
      ctx.fillRect(b.x,b.y,b.w,b.h);
    });
    /* Powerups */
    state.powerups.forEach(function(pw){
      ctx.fillStyle='#0ff';
      ctx.fillRect(pw.x,pw.y,pw.w,pw.h);
      ctx.fillStyle='#000';
      ctx.font='10px monospace';
      ctx.fillText('P',pw.x+4,pw.y+12);
    });
    /* Particles */
    state.particles.forEach(function(pt){
      ctx.globalAlpha=pt.life/35;
      ctx.fillStyle=pt.color;
      ctx.fillRect(pt.x,pt.y,3,3);
    });
    ctx.globalAlpha=1;
    /* HUD */
    ctx.fillStyle='#0ff';
    ctx.font='14px monospace';
    ctx.fillText('Score: '+state.score,10,20);
    ctx.fillText('Level: '+state.level,200,20);
    ctx.fillText('Lives: '+state.lives,380,20);

    if(state.gameOver){
      ctx.fillStyle='rgba(0,0,0,0.7)';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle=state.won?'#0f0':'#f00';
      ctx.font='28px monospace';
      ctx.textAlign='center';
      ctx.fillText(state.won?'YOU WIN!':'GAME OVER',canvas.width/2,260);
      ctx.fillStyle='#ff0';
      ctx.font='18px monospace';
      ctx.fillText('Score: '+state.score,canvas.width/2,300);
      ctx.fillStyle='#ccc';
      ctx.font='14px monospace';
      ctx.fillText('Press R to restart',canvas.width/2,340);
      ctx.textAlign='left';
    }
  }

  function endGame(won){
    state.gameOver=true;
    state.won=won;
    draw();
    shared.highScores.maybeSubmit({gameId:id,score:state.score,mode:'score',title:title});
  }

  function destroy(){
    cancelAnimationFrame(raf);
    intervals.forEach(function(id){clearInterval(id);});
    intervals=[];
    listeners.forEach(function(l){ document.removeEventListener(l[0],l[1]); });
    listeners=[];
    if(container) container.innerHTML='';
  }

  function getTestHooks(){
    return {
      getState: function(){ return {level:state.level,score:state.score,gameOver:state.gameOver,lives:state.lives}; },
      completeLevel: function(){
        state.enemies=[];
      },
      forceWin: function(){
        state.level=10;
        state.enemies=[];
      },
      setDeterministicSeed: function(n){ state.deterministicSeed=n; state.testMode=true; }
    };
  }

  return {
    id:id, title:title, description:description, genreTag:genreTag,
    controls:controls, hasLevels:hasLevels, scoreMode:scoreMode,
    init:init, destroy:destroy, getTestHooks:getTestHooks
  };
})();
