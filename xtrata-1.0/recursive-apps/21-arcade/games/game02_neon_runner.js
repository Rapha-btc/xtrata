/* Game 02: Neon Runner - Endless runner */
var Game02 = (function(){
  var id='neon_runner', title='Neon Runner', description='Endless runner. Jump and slide to survive!',
      genreTag='Endless Runner', controls='Up/Space: Jump, Down: Slide, R: Restart',
      hasLevels=false, scoreMode='score';
  var canvas,ctx,container,shared,raf,keys={},listeners=[],intervals=[];
  var state;
  var W=600,H=300;
  var GROUND_Y=260; /* y-coordinate of the ground line (floor) */
  var PLAYER_H=40, SLIDE_H=20, PLAYER_W=24;

  function init(cont,sh){
    container=cont;shared=sh;
    canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
    container.appendChild(canvas);ctx=canvas.getContext('2d');
    keys={};
    var kd=function(e){keys[e.key]=true;if(['ArrowUp','ArrowDown',' '].indexOf(e.key)>=0)e.preventDefault();if(e.key==='r'||e.key==='R')restartGame();};
    var ku=function(e){keys[e.key]=false;};
    document.addEventListener('keydown',kd);listeners.push(['keydown',kd]);
    document.addEventListener('keyup',ku);listeners.push(['keyup',ku]);
    startGame();
  }

  function startGame(){
    state={
      /* Player y = top of player; feet at y + h = GROUND_Y when standing on ground */
      player:{x:60, y:GROUND_Y-PLAYER_H, w:PLAYER_W, h:PLAYER_H, vy:0, grounded:true, sliding:false},
      obstacles:[],particles:[],
      score:0,speed:4,dist:0,spawnTimer:0,
      gameOver:false
    };
    loop();
  }
  function restartGame(){cancelAnimationFrame(raf);startGame();}

  function loop(){
    update();draw();
    if(!state.gameOver) raf=requestAnimationFrame(loop);
  }

  function update(){
    var p=state.player;
    state.speed=4+state.dist/2000;
    state.dist+=state.speed;
    state.score=Math.floor(state.dist/10);

    /* Jump */
    if((keys['ArrowUp']||keys[' '])&&p.grounded&&!p.sliding){
      p.vy=-10;p.grounded=false;
      if(shared.beep)shared.beep(440,0.08,'square',0.03);
    }

    /* Slide - only when on ground */
    var wantsSlide=!!(keys['ArrowDown']&&p.grounded);
    if(wantsSlide&&!p.sliding){
      /* Start sliding: shrink from top, keep feet on ground */
      p.sliding=true;
      p.h=SLIDE_H;
      p.y=GROUND_Y-SLIDE_H;
    } else if(!wantsSlide&&p.sliding){
      /* Stop sliding: restore full height, keep feet on ground */
      p.sliding=false;
      p.h=PLAYER_H;
      p.y=GROUND_Y-PLAYER_H;
    }

    /* Gravity */
    p.vy+=0.5;
    p.y+=p.vy;
    /* Land on ground */
    var feetY=p.y+p.h;
    if(feetY>=GROUND_Y){
      p.y=GROUND_Y-p.h;
      p.vy=0;
      p.grounded=true;
    }

    /* Spawn obstacles */
    state.spawnTimer-=state.speed;
    if(state.spawnTimer<=0){
      state.spawnTimer=120+Math.random()*80;
      var type=Math.random()<0.4?'high':'low';
      if(type==='low'){
        /* Low obstacle: sits on ground, must jump over */
        var oh=30+Math.random()*20;
        state.obstacles.push({x:W, y:GROUND_Y-oh, w:20+Math.random()*15, h:oh, type:'low'});
      } else {
        /* High obstacle: floating bar, must slide under */
        state.obstacles.push({x:W, y:GROUND_Y-PLAYER_H-10, w:40, h:16, type:'high'});
      }
    }

    /* Move and collide obstacles */
    for(var i=state.obstacles.length-1;i>=0;i--){
      state.obstacles[i].x-=state.speed;
      if(state.obstacles[i].x<-50){state.obstacles.splice(i,1);continue;}
      var o=state.obstacles[i];
      /* Player hitbox: exact position */
      var pr={x:p.x, y:p.y, w:p.w, h:p.h};
      /* Obstacle hitbox: already stored as top-left y and dimensions */
      var or={x:o.x, y:o.y, w:o.w, h:o.h};
      if(ArcadeUtils.rectsOverlap(pr,or)){
        endGame();
      }
    }

    /* Particles (trail) */
    if(Math.random()<0.3){
      state.particles.push({x:p.x, y:p.y+p.h, vx:-1-Math.random(), vy:-Math.random(), life:15, color:'#0ff'});
    }
    for(var i=state.particles.length-1;i>=0;i--){
      var pt=state.particles[i];pt.x+=pt.vx;pt.y+=pt.vy;pt.life--;
      if(pt.life<=0)state.particles.splice(i,1);
    }
  }

  function draw(){
    ctx.fillStyle='#0a0a1a';ctx.fillRect(0,0,W,H);
    /* Ground line */
    ctx.strokeStyle='#0ff';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(0,GROUND_Y);ctx.lineTo(W,GROUND_Y);ctx.stroke();
    /* Grid lines below ground */
    ctx.strokeStyle='#112';ctx.lineWidth=1;
    for(var i=0;i<10;i++){
      var gx=((i*80-state.dist*0.5)%W+W)%W;
      ctx.beginPath();ctx.moveTo(gx,GROUND_Y);ctx.lineTo(gx,H);ctx.stroke();
    }

    /* Player */
    var p=state.player;
    ctx.fillStyle='#0f0';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    if(!p.sliding){
      /* Eyes */
      ctx.fillStyle='#0a0';
      ctx.fillRect(p.x+6, p.y+6, 5, 5);
      ctx.fillRect(p.x+14, p.y+6, 5, 5);
    } else {
      /* Slide visor */
      ctx.fillStyle='#0a0';
      ctx.fillRect(p.x+4, p.y+4, 16, 4);
    }

    /* Obstacles */
    state.obstacles.forEach(function(o){
      ctx.fillStyle=o.type==='low'?'#f44':'#fa0';
      ctx.fillRect(o.x, o.y, o.w, o.h);
    });

    /* Particles */
    state.particles.forEach(function(pt){
      ctx.globalAlpha=pt.life/15;ctx.fillStyle=pt.color;ctx.fillRect(pt.x,pt.y,2,2);
    });
    ctx.globalAlpha=1;

    /* HUD */
    ctx.fillStyle='#0ff';ctx.font='16px monospace';
    ctx.fillText('Score: '+state.score,10,24);
    ctx.fillText('Speed: '+state.speed.toFixed(1),200,24);

    if(state.gameOver){
      ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#f00';ctx.font='28px monospace';ctx.textAlign='center';
      ctx.fillText('GAME OVER',W/2,120);
      ctx.fillStyle='#ff0';ctx.font='18px monospace';
      ctx.fillText('Score: '+state.score,W/2,160);
      ctx.fillStyle='#ccc';ctx.font='14px monospace';
      ctx.fillText('Press R to restart',W/2,200);
      ctx.textAlign='left';
    }
  }

  function endGame(){
    state.gameOver=true;draw();
    shared.highScores.maybeSubmit({gameId:id,score:state.score,mode:'score',title:title});
  }

  function destroy(){
    cancelAnimationFrame(raf);
    intervals.forEach(function(id){clearInterval(id);});intervals=[];
    listeners.forEach(function(l){document.removeEventListener(l[0],l[1]);});listeners=[];
    if(container)container.innerHTML='';
  }

  function getTestHooks(){
    return {
      getState:function(){return{score:state.score,gameOver:state.gameOver,speed:state.speed};},
      forceWin:function(){state.score=9999;endGame();},
      setDeterministicSeed:function(){}
    };
  }

  return {id:id,title:title,description:description,genreTag:genreTag,controls:controls,
    hasLevels:hasLevels,scoreMode:scoreMode,init:init,destroy:destroy,getTestHooks:getTestHooks};
})();
