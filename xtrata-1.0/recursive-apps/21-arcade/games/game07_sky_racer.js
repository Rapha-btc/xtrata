/* Game 07: Sky Racer - Lane-based racer, avoid obstacles */
var Game07 = (function(){
  var id='sky_racer',title='Sky Racer',description='Dodge traffic at increasing speeds!',
      genreTag='Racing',controls='Left/Right: Change lane, R: Restart',
      hasLevels=false,scoreMode='score';
  var canvas,ctx,container,shared,raf,listeners=[],intervals=[];
  var W=360,H=500,LANES=3,LANE_W=80,state;

  function init(cont,sh){
    container=cont;shared=sh;
    canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
    container.appendChild(canvas);ctx=canvas.getContext('2d');
    var kd=function(e){
      if(state.gameOver){if(e.key==='r'||e.key==='R')restartGame();return;}
      if(e.key==='ArrowLeft'&&state.lane>0){state.lane--;if(shared.beep)shared.beep(330,0.05,'square',0.02);}
      if(e.key==='ArrowRight'&&state.lane<LANES-1){state.lane++;if(shared.beep)shared.beep(330,0.05,'square',0.02);}
      if(e.key==='r'||e.key==='R')restartGame();
      if(['ArrowLeft','ArrowRight'].indexOf(e.key)>=0)e.preventDefault();
    };
    document.addEventListener('keydown',kd);listeners.push(['keydown',kd]);
    startGame();
  }

  function startGame(){
    state={lane:1,obstacles:[],score:0,speed:3,dist:0,spawnTimer:0,gameOver:false,roadOffset:0};
    loop();
  }
  function restartGame(){cancelAnimationFrame(raf);startGame();}

  function laneX(l){return (W-LANES*LANE_W)/2+l*LANE_W+LANE_W/2;}

  function loop(){
    update();draw();
    if(!state.gameOver)raf=requestAnimationFrame(loop);
  }

  function update(){
    state.speed=3+state.dist/1500;
    state.dist+=state.speed;
    state.score=Math.floor(state.dist/10);
    state.roadOffset=(state.roadOffset+state.speed)%40;

    state.spawnTimer-=state.speed;
    if(state.spawnTimer<=0){
      state.spawnTimer=60+Math.random()*40;
      var l=Math.floor(Math.random()*LANES);
      state.obstacles.push({lane:l,y:-40,w:50,h:60});
    }

    var px=laneX(state.lane),py=H-80;
    for(var i=state.obstacles.length-1;i>=0;i--){
      var o=state.obstacles[i];
      o.y+=state.speed;
      if(o.y>H+60){state.obstacles.splice(i,1);continue;}
      var ox=laneX(o.lane);
      if(Math.abs(ox-px)<35&&Math.abs(o.y-py)<50){
        endGame();return;
      }
    }
  }

  function endGame(){
    state.gameOver=true;draw();
    shared.highScores.maybeSubmit({gameId:id,score:state.score,mode:'score',title:title});
  }

  function draw(){
    ctx.fillStyle='#1a1a2e';ctx.fillRect(0,0,W,H);
    /* Road */
    var rx=(W-LANES*LANE_W)/2;
    ctx.fillStyle='#222';ctx.fillRect(rx,0,LANES*LANE_W,H);
    /* Lane dividers */
    ctx.strokeStyle='#555';ctx.setLineDash([20,20]);ctx.lineDashOffset=-state.roadOffset;
    for(var i=1;i<LANES;i++){
      ctx.beginPath();ctx.moveTo(rx+i*LANE_W,0);ctx.lineTo(rx+i*LANE_W,H);ctx.stroke();
    }
    ctx.setLineDash([]);
    /* Obstacles */
    state.obstacles.forEach(function(o){
      var ox=laneX(o.lane);
      ctx.fillStyle='#f44';ctx.fillRect(ox-o.w/2,o.y-o.h/2,o.w,o.h);
      ctx.fillStyle='#f88';ctx.fillRect(ox-10,o.y-o.h/2+5,20,10);
    });
    /* Player car */
    var px=laneX(state.lane),py=H-80;
    ctx.fillStyle='#0ff';ctx.fillRect(px-20,py-25,40,50);
    ctx.fillStyle='#088';ctx.fillRect(px-15,py-20,30,15);
    /* HUD */
    ctx.fillStyle='#0ff';ctx.font='14px monospace';
    ctx.fillText('Score: '+state.score,10,20);
    ctx.fillText('Speed: '+state.speed.toFixed(1),10,38);

    if(state.gameOver){
      ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,W,H);
      ctx.textAlign='center';ctx.fillStyle='#f00';ctx.font='24px monospace';
      ctx.fillText('CRASH!',W/2,H/2-20);
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
      getState:function(){return{score:state.score,gameOver:state.gameOver,speed:state.speed};},
      forceWin:function(){state.score=9999;endGame();},
      setDeterministicSeed:function(){}
    };
  }

  return {id:id,title:title,description:description,genreTag:genreTag,controls:controls,
    hasLevels:hasLevels,scoreMode:scoreMode,init:init,destroy:destroy,getTestHooks:getTestHooks};
})();
