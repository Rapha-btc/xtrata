/* Game 06: Meteor Miner - Collect resources, avoid hazards, fuel pressure */
var Game06 = (function(){
  var id='meteor_miner',title='Meteor Miner',description='Collect crystals in the asteroid field! Watch your fuel.',
      genreTag='Action',controls='Arrows: Move, R: Restart',
      hasLevels=false,scoreMode='score';
  var canvas,ctx,container,shared,raf,listeners=[],intervals=[];
  var W=500,H=400,state;

  function init(cont,sh){
    container=cont;shared=sh;
    canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
    container.appendChild(canvas);ctx=canvas.getContext('2d');
    var keys={};
    var kd=function(e){keys[e.key]=true;if(e.key==='r'||e.key==='R')restartGame();
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(e.key)>=0)e.preventDefault();};
    var ku=function(e){keys[e.key]=false;};
    document.addEventListener('keydown',kd);listeners.push(['keydown',kd]);
    document.addEventListener('keyup',ku);listeners.push(['keyup',ku]);
    state={keys:keys};
    startGame();
  }

  function startGame(){
    var k=state.keys;
    state={keys:k,player:{x:W/2,y:H/2,w:20,h:20,speed:3},
      crystals:[],meteors:[],fuel:100,score:0,gameOver:false,spawnTimer:0,fuelTimer:0};
    for(var i=0;i<8;i++)spawnCrystal();
    for(var i=0;i<4;i++)spawnMeteor();
    loop();
  }
  function restartGame(){cancelAnimationFrame(raf);startGame();}

  function spawnCrystal(){
    state.crystals.push({x:ArcadeUtils.randInt(20,W-20),y:ArcadeUtils.randInt(20,H-20),w:12,h:12});
  }
  function spawnMeteor(){
    var s=ArcadeUtils.randFloat(1,3);
    var a=Math.random()*Math.PI*2;
    state.meteors.push({x:Math.random()<0.5?-20:W+20,y:Math.random()*H,
      w:ArcadeUtils.randInt(15,30),h:ArcadeUtils.randInt(15,30),
      vx:Math.cos(a)*s,vy:Math.sin(a)*s});
  }

  function loop(){
    update();draw();
    if(!state.gameOver)raf=requestAnimationFrame(loop);
  }

  function update(){
    var p=state.player,k=state.keys;
    if(k['ArrowLeft'])p.x-=p.speed;
    if(k['ArrowRight'])p.x+=p.speed;
    if(k['ArrowUp'])p.y-=p.speed;
    if(k['ArrowDown'])p.y+=p.speed;
    p.x=ArcadeUtils.clamp(p.x,0,W-p.w);
    p.y=ArcadeUtils.clamp(p.y,0,H-p.h);

    state.fuelTimer++;
    if(state.fuelTimer>=3){state.fuelTimer=0;state.fuel-=0.15;}
    if(state.fuel<=0){endGame();}

    /* Crystals */
    for(var i=state.crystals.length-1;i>=0;i--){
      if(ArcadeUtils.rectsOverlap(p,state.crystals[i])){
        state.crystals.splice(i,1);
        state.score+=50;
        state.fuel=Math.min(100,state.fuel+8);
        spawnCrystal();
        if(shared.beep)shared.beep(880,0.08,'sine',0.04);
      }
    }

    /* Meteors */
    state.spawnTimer++;
    if(state.spawnTimer>120){state.spawnTimer=0;spawnMeteor();}
    for(var i=state.meteors.length-1;i>=0;i--){
      var m=state.meteors[i];
      m.x+=m.vx;m.y+=m.vy;
      if(m.x<-60||m.x>W+60||m.y<-60||m.y>H+60){state.meteors.splice(i,1);continue;}
      if(ArcadeUtils.rectsOverlap(p,m)){endGame();}
    }
  }

  function endGame(){
    state.gameOver=true;draw();
    shared.highScores.maybeSubmit({gameId:id,score:state.score,mode:'score',title:title});
  }

  function draw(){
    ctx.fillStyle='#0a0a1a';ctx.fillRect(0,0,W,H);
    /* Stars */
    ctx.fillStyle='#223';
    for(var i=0;i<40;i++)ctx.fillRect((i*97)%W,(i*53)%H,1,1);
    /* Crystals */
    state.crystals.forEach(function(c){
      ctx.fillStyle='#0ff';ctx.beginPath();
      ctx.moveTo(c.x+c.w/2,c.y);ctx.lineTo(c.x+c.w,c.y+c.h/2);
      ctx.lineTo(c.x+c.w/2,c.y+c.h);ctx.lineTo(c.x,c.y+c.h/2);ctx.closePath();ctx.fill();
    });
    /* Meteors */
    state.meteors.forEach(function(m){
      ctx.fillStyle='#864';ctx.fillRect(m.x,m.y,m.w,m.h);
      ctx.fillStyle='#642';ctx.fillRect(m.x+3,m.y+3,m.w/2,m.h/2);
    });
    /* Player */
    ctx.fillStyle='#0f0';ctx.fillRect(state.player.x,state.player.y,state.player.w,state.player.h);
    /* HUD */
    ctx.fillStyle='#0ff';ctx.font='13px monospace';
    ctx.fillText('Score: '+state.score,10,18);
    /* Fuel bar */
    ctx.fillStyle='#333';ctx.fillRect(W-120,6,100,12);
    ctx.fillStyle=state.fuel>25?'#0f0':'#f00';
    ctx.fillRect(W-120,6,state.fuel,12);
    ctx.fillStyle='#ccc';ctx.font='10px monospace';ctx.fillText('FUEL',W-120,30);

    if(state.gameOver){
      ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,W,H);
      ctx.textAlign='center';ctx.fillStyle='#f00';ctx.font='24px monospace';
      ctx.fillText('GAME OVER',W/2,H/2-20);
      ctx.fillStyle='#ff0';ctx.font='16px monospace';
      ctx.fillText('Score: '+state.score,W/2,H/2+10);
      ctx.fillStyle='#ccc';ctx.font='12px monospace';
      ctx.fillText('Press R to restart',W/2,H/2+40);
      ctx.textAlign='left';
    }
  }

  function destroy(){
    cancelAnimationFrame(raf);
    intervals.forEach(function(i){clearInterval(i);});intervals=[];
    listeners.forEach(function(l){document.removeEventListener(l[0],l[1]);});listeners=[];
    if(container)container.innerHTML='';
  }

  function getTestHooks(){
    return {
      getState:function(){return{score:state.score,gameOver:state.gameOver,fuel:state.fuel};},
      forceWin:function(){state.score=5000;endGame();},
      setDeterministicSeed:function(){}
    };
  }

  return {id:id,title:title,description:description,genreTag:genreTag,controls:controls,
    hasLevels:hasLevels,scoreMode:scoreMode,init:init,destroy:destroy,getTestHooks:getTestHooks};
})();
