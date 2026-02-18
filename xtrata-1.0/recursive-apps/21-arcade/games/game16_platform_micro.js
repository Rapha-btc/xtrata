/* Game 16: Platform Micro - 1-screen platformer with coins and timer */
var Game16 = (function(){
  var id='platform_micro',title='Platform Micro',description='Collect all coins before time runs out!',
      genreTag='Platformer',controls='Arrows: Move, Up: Jump, R: Restart',
      hasLevels=true,scoreMode='time';
  var canvas,ctx,container,shared,raf,listeners=[],intervals=[];
  var W=480,H=360,state;

  var LEVELS=[
    {platforms:[[0,340,480,20],[50,270,120,10],[200,220,100,10],[340,270,120,10],[120,160,240,10],[50,100,100,10],[330,100,100,10]],
     coins:[[100,250],[250,200],[380,250],[180,140],[360,80],[80,80]],start:{x:30,y:310}},
    {platforms:[[0,340,480,20],[20,280,80,10],[150,250,80,10],[280,220,80,10],[380,180,80,10],[200,140,80,10],[50,100,80,10],[320,80,80,10],[150,50,180,10]],
     coins:[[50,260],[180,230],[310,200],[410,160],[230,120],[80,80],[350,60],[230,30]],start:{x:30,y:310}},
    {platforms:[[0,340,480,20],[40,290,60,10],[140,260,60,10],[240,230,60,10],[340,260,60,10],[440,290,30,10],[100,180,80,10],[280,180,80,10],[180,120,120,10],[60,60,80,10],[340,60,80,10]],
     coins:[[60,270],[170,240],[270,210],[370,240],[130,160],[310,160],[220,100],[90,40],[370,40]],start:{x:30,y:310}}
  ];

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
    state={keys:keys};startGame();
  }

  function startGame(){
    var k=state.keys;
    state={keys:k,levelIdx:0,gameOver:false,won:false,startTime:Date.now(),totalTime:0,
      player:null,coins:[],platforms:[],timer:0};
    loadLevel(0);loop();
  }
  function restartGame(){cancelAnimationFrame(raf);startGame();}

  function loadLevel(idx){
    if(idx>=LEVELS.length){
      state.totalTime=Date.now()-state.startTime;
      state.gameOver=true;state.won=true;draw();
      shared.highScores.maybeSubmit({gameId:id,score:state.totalTime,mode:'time',title:title});return;
    }
    state.levelIdx=idx;
    var lvl=LEVELS[idx];
    state.player={x:lvl.start.x,y:lvl.start.y,w:16,h:24,vx:0,vy:0,grounded:false};
    state.platforms=lvl.platforms.map(function(p){return{x:p[0],y:p[1],w:p[2],h:p[3]};});
    state.coins=lvl.coins.map(function(c){return{x:c[0],y:c[1],w:12,h:12,collected:false};});
    state.timer=30000; /* 30 seconds per level */
  }

  function loop(){
    update();draw();
    if(!state.gameOver)raf=requestAnimationFrame(loop);
  }

  function update(){
    var p=state.player,k=state.keys;
    if(k['ArrowLeft'])p.vx=-3;
    else if(k['ArrowRight'])p.vx=3;
    else p.vx*=0.8;
    if((k['ArrowUp']||k[' '])&&p.grounded){p.vy=-8;p.grounded=false;
      if(shared.beep)shared.beep(440,0.06,'square',0.03);}

    p.vy+=0.4;
    p.x+=p.vx;p.y+=p.vy;
    p.grounded=false;

    /* Platform collision */
    state.platforms.forEach(function(pl){
      if(p.x+p.w>pl.x&&p.x<pl.x+pl.w){
        if(p.vy>=0&&p.y+p.h>=pl.y&&p.y+p.h<=pl.y+pl.h+p.vy+1){
          p.y=pl.y-p.h;p.vy=0;p.grounded=true;
        }
      }
    });

    p.x=ArcadeUtils.clamp(p.x,0,W-p.w);
    if(p.y>H){p.y=LEVELS[state.levelIdx].start.y;p.x=LEVELS[state.levelIdx].start.x;p.vy=0;}

    /* Coins */
    state.coins.forEach(function(c){
      if(!c.collected&&ArcadeUtils.rectsOverlap(p,c)){
        c.collected=true;
        if(shared.beep)shared.beep(880,0.08,'sine',0.04);
      }
    });

    var allCollected=state.coins.every(function(c){return c.collected;});
    if(allCollected){loadLevel(state.levelIdx+1);return;}

    state.timer-=16;
    if(state.timer<=0){
      state.totalTime=Date.now()-state.startTime;
      state.gameOver=true;state.won=false;draw();
      shared.highScores.maybeSubmit({gameId:id,score:state.totalTime,mode:'time',title:title});
    }
  }

  function draw(){
    ctx.fillStyle='#0a0a2a';ctx.fillRect(0,0,W,H);
    /* Platforms */
    state.platforms.forEach(function(pl){
      ctx.fillStyle='#446';ctx.fillRect(pl.x,pl.y,pl.w,pl.h);
    });
    /* Coins */
    state.coins.forEach(function(c){
      if(c.collected)return;
      ctx.fillStyle='#ff0';ctx.beginPath();ctx.arc(c.x+6,c.y+6,6,0,Math.PI*2);ctx.fill();
    });
    /* Player */
    var p=state.player;
    ctx.fillStyle='#0ff';ctx.fillRect(p.x,p.y,p.w,p.h);
    ctx.fillStyle='#088';ctx.fillRect(p.x+3,p.y+3,4,4);ctx.fillRect(p.x+9,p.y+3,4,4);
    /* HUD */
    var remaining=state.coins.filter(function(c){return!c.collected;}).length;
    ctx.fillStyle='#0ff';ctx.font='13px monospace';
    ctx.fillText('Level:'+(state.levelIdx+1)+'  Coins:'+remaining+'  Time:'+Math.ceil(state.timer/1000)+'s',10,16);

    if(state.gameOver){
      ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,W,H);
      ctx.textAlign='center';ctx.fillStyle=state.won?'#0f0':'#f00';ctx.font='22px monospace';
      ctx.fillText(state.won?'ALL CLEAR!':'TIME UP!',W/2,H/2-20);
      ctx.fillStyle='#ff0';ctx.font='14px monospace';
      ctx.fillText('Time: '+ArcadeUtils.formatTime(state.totalTime),W/2,H/2+10);
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
      getState:function(){return{level:state.levelIdx+1,gameOver:state.gameOver,won:state.won};},
      completeLevel:function(){loadLevel(state.levelIdx+1);},
      forceWin:function(){state.levelIdx=LEVELS.length-1;loadLevel(state.levelIdx+1);},
      setDeterministicSeed:function(){}
    };
  }

  return {id:id,title:title,description:description,genreTag:genreTag,controls:controls,
    hasLevels:hasLevels,scoreMode:scoreMode,init:init,destroy:destroy,getTestHooks:getTestHooks};
})();
