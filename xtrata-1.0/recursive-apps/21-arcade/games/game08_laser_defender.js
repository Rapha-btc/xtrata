/* Game 08: Laser Defender - Space Invaders style */
var Game08 = (function(){
  var id='laser_defender',title='Laser Defender',description='Defend Earth from alien invaders!',
      genreTag='Shoot \'em Up',controls='Arrows: Move, Space: Shoot, R: Restart',
      hasLevels=true,scoreMode='score';
  var canvas,ctx,container,shared,raf,listeners=[],intervals=[];
  var W=480,H=500,state;

  function init(cont,sh){
    container=cont;shared=sh;
    canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
    container.appendChild(canvas);ctx=canvas.getContext('2d');
    var keys={};
    var kd=function(e){keys[e.key]=true;if(e.key==='r'||e.key==='R')restartGame();
      if([' ','ArrowLeft','ArrowRight'].indexOf(e.key)>=0)e.preventDefault();};
    var ku=function(e){keys[e.key]=false;};
    document.addEventListener('keydown',kd);listeners.push(['keydown',kd]);
    document.addEventListener('keyup',ku);listeners.push(['keyup',ku]);
    state={keys:keys};startGame();
  }

  function startGame(){
    var k=state.keys;
    state={keys:k,player:{x:W/2-15,y:H-40,w:30,h:20},
      bullets:[],enemyBullets:[],invaders:[],
      score:0,level:1,lives:3,gameOver:false,shootCool:0,
      invDir:1,invSpeed:0.5,invDrop:false,invDropAmount:0};
    spawnInvaders();loop();
  }
  function restartGame(){cancelAnimationFrame(raf);startGame();}

  function spawnInvaders(){
    state.invaders=[];
    var rows=3+Math.min(state.level,4);var cols=8;
    for(var r=0;r<rows;r++)for(var c=0;c<cols;c++){
      state.invaders.push({x:40+c*48,y:40+r*36,w:32,h:24,alive:true});
    }
    state.invDir=1;state.invSpeed=0.5+state.level*0.2;
  }

  function loop(){update();draw();if(!state.gameOver)raf=requestAnimationFrame(loop);}

  function update(){
    var p=state.player,k=state.keys;
    if(k['ArrowLeft'])p.x-=4;
    if(k['ArrowRight'])p.x+=4;
    p.x=ArcadeUtils.clamp(p.x,0,W-p.w);

    state.shootCool--;
    if(k[' ']&&state.shootCool<=0){
      state.shootCool=15;
      state.bullets.push({x:p.x+p.w/2-2,y:p.y,w:4,h:10});
      if(shared.beep)shared.beep(660,0.05,'square',0.03);
    }

    /* Player bullets */
    for(var i=state.bullets.length-1;i>=0;i--){
      state.bullets[i].y-=6;
      if(state.bullets[i].y<-10){state.bullets.splice(i,1);continue;}
      for(var j=state.invaders.length-1;j>=0;j--){
        if(state.invaders[j].alive&&ArcadeUtils.rectsOverlap(state.bullets[i],state.invaders[j])){
          state.invaders[j].alive=false;state.bullets.splice(i,1);
          state.score+=50*state.level;
          if(shared.beep)shared.beep(220,0.1,'sawtooth',0.04);
          break;
        }
      }
    }

    /* Move invaders */
    var edge=false;
    var alive=state.invaders.filter(function(inv){return inv.alive;});
    alive.forEach(function(inv){
      inv.x+=state.invDir*state.invSpeed;
      if(inv.x<5||inv.x+inv.w>W-5)edge=true;
    });
    if(edge){
      state.invDir*=-1;
      alive.forEach(function(inv){inv.y+=16;});
    }

    /* Enemy shooting */
    if(alive.length>0&&Math.random()<0.01*state.level){
      var shooter=alive[Math.floor(Math.random()*alive.length)];
      state.enemyBullets.push({x:shooter.x+shooter.w/2-2,y:shooter.y+shooter.h,w:4,h:8});
    }

    for(var i=state.enemyBullets.length-1;i>=0;i--){
      state.enemyBullets[i].y+=3;
      if(state.enemyBullets[i].y>H+10){state.enemyBullets.splice(i,1);continue;}
      if(ArcadeUtils.rectsOverlap(state.enemyBullets[i],p)){
        state.enemyBullets.splice(i,1);
        state.lives--;
        if(shared.beep)shared.beep(110,0.2,'sawtooth',0.05);
        if(state.lives<=0)endGame();
      }
    }

    /* Invaders reach bottom */
    alive.forEach(function(inv){if(inv.y+inv.h>H-50)endGame();});

    /* Wave clear */
    if(alive.length===0&&!state.gameOver){
      state.level++;
      if(state.level>8)endGame();
      else spawnInvaders();
    }
  }

  function endGame(){state.gameOver=true;draw();
    shared.highScores.maybeSubmit({gameId:id,score:state.score,mode:'score',title:title});}

  function draw(){
    ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
    /* Invaders */
    state.invaders.forEach(function(inv){
      if(!inv.alive)return;
      ctx.fillStyle='#0f0';ctx.fillRect(inv.x,inv.y,inv.w,inv.h);
      ctx.fillStyle='#000';ctx.fillRect(inv.x+6,inv.y+6,6,4);ctx.fillRect(inv.x+inv.w-12,inv.y+6,6,4);
    });
    /* Player */
    ctx.fillStyle='#0ff';
    ctx.beginPath();ctx.moveTo(state.player.x+state.player.w/2,state.player.y);
    ctx.lineTo(state.player.x,state.player.y+state.player.h);
    ctx.lineTo(state.player.x+state.player.w,state.player.y+state.player.h);ctx.closePath();ctx.fill();
    /* Bullets */
    state.bullets.forEach(function(b){ctx.fillStyle='#ff0';ctx.fillRect(b.x,b.y,b.w,b.h);});
    state.enemyBullets.forEach(function(b){ctx.fillStyle='#f44';ctx.fillRect(b.x,b.y,b.w,b.h);});
    /* HUD */
    ctx.fillStyle='#0ff';ctx.font='13px monospace';
    ctx.fillText('Score:'+state.score+'  Level:'+state.level+'  Lives:'+state.lives,10,18);

    if(state.gameOver){
      ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,W,H);
      ctx.textAlign='center';ctx.fillStyle='#f00';ctx.font='24px monospace';
      ctx.fillText('GAME OVER',W/2,H/2-20);
      ctx.fillStyle='#ff0';ctx.font='16px monospace';ctx.fillText('Score: '+state.score,W/2,H/2+10);
      ctx.fillStyle='#ccc';ctx.font='12px monospace';ctx.fillText('Press R to restart',W/2,H/2+40);
      ctx.textAlign='left';
    }
  }

  function destroy(){
    cancelAnimationFrame(raf);intervals.forEach(function(i){clearInterval(i);});intervals=[];
    listeners.forEach(function(l){document.removeEventListener(l[0],l[1]);});listeners=[];
    if(container)container.innerHTML='';
  }

  function getTestHooks(){
    return {
      getState:function(){return{level:state.level,score:state.score,gameOver:state.gameOver,lives:state.lives};},
      completeLevel:function(){state.invaders.forEach(function(inv){inv.alive=false;});},
      forceWin:function(){state.level=8;state.invaders.forEach(function(inv){inv.alive=false;});},
      setDeterministicSeed:function(){}
    };
  }

  return {id:id,title:title,description:description,genreTag:genreTag,controls:controls,
    hasLevels:hasLevels,scoreMode:scoreMode,init:init,destroy:destroy,getTestHooks:getTestHooks};
})();
