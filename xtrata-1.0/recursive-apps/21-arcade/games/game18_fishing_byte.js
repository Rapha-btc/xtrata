/* Game 18: Fishing Byte - Timing-based fishing mini-game */
var Game18 = (function(){
  var id='fishing_byte',title='Fishing Byte',description='Cast your line and time your catch!',
      genreTag='Timing',controls='Space: Cast/Reel, R: Restart',
      hasLevels=false,scoreMode='score';
  var canvas,ctx,container,shared,raf,listeners=[],intervals=[];
  var W=400,H=400,state;

  var FISH_TYPES=[
    {name:'Minnow',points:10,speed:2,size:12,color:'#888'},
    {name:'Bass',points:30,speed:1.5,size:18,color:'#0a0'},
    {name:'Trout',points:50,speed:2.5,size:16,color:'#fa0'},
    {name:'Salmon',points:80,speed:3,size:20,color:'#f44'},
    {name:'Goldfish',points:100,speed:1,size:14,color:'#ff0'},
    {name:'Shark',points:200,speed:4,size:28,color:'#66f'}
  ];

  function init(cont,sh){
    container=cont;shared=sh;
    canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
    container.appendChild(canvas);ctx=canvas.getContext('2d');
    var kd=function(e){
      if(e.key===' '){
        e.preventDefault();
        if(state.gameOver){return;}
        if(state.phase==='idle')castLine();
        else if(state.phase==='waiting'||state.phase==='bite')reelIn();
      }
      if(e.key==='r'||e.key==='R')restartGame();
    };
    document.addEventListener('keydown',kd);listeners.push(['keydown',kd]);
    startGame();
  }

  function startGame(){
    state={phase:'idle',score:0,catches:0,misses:0,gameOver:false,
      hook:{y:100},fish:[],biteTimer:0,catchWindow:0,
      timeLeft:60000,lastTime:Date.now(),message:'',msgTimer:0,
      bobber:{y:100,targetY:0},reeling:false};
    spawnFish();loop();
  }
  function restartGame(){cancelAnimationFrame(raf);startGame();}

  function spawnFish(){
    state.fish=[];
    for(var i=0;i<6;i++){
      var type=FISH_TYPES[Math.floor(Math.random()*FISH_TYPES.length)];
      state.fish.push({
        type:type,x:Math.random()*W,y:180+Math.random()*180,
        vx:(Math.random()>0.5?1:-1)*type.speed,size:type.size
      });
    }
  }

  function castLine(){
    state.phase='waiting';
    state.bobber.targetY=200+Math.random()*150;
    state.bobber.y=100;
    state.biteTimer=60+Math.random()*120;
    if(shared.beep)shared.beep(330,0.1,'sine',0.03);
  }

  function reelIn(){
    if(state.phase==='bite'){
      /* Check if fish is near hook */
      var hookY=state.bobber.targetY;
      var caught=null;
      state.fish.forEach(function(f){
        if(Math.abs(f.y-hookY)<30&&Math.abs(f.x-W/2)<50){
          if(!caught||f.type.points>caught.type.points)caught=f;
        }
      });
      if(caught){
        state.score+=caught.type.points;
        state.catches++;
        state.message='Caught '+caught.type.name+'! +'+caught.type.points;
        state.msgTimer=90;
        /* Remove and respawn */
        var idx=state.fish.indexOf(caught);
        if(idx>=0)state.fish.splice(idx,1);
        var type=FISH_TYPES[Math.floor(Math.random()*FISH_TYPES.length)];
        state.fish.push({type:type,x:Math.random()*W,y:180+Math.random()*180,
          vx:(Math.random()>0.5?1:-1)*type.speed,size:type.size});
        if(shared.beep)shared.beep(880,0.15,'sine',0.05);
      } else {
        state.misses++;
        state.message='Missed!';state.msgTimer=60;
        if(shared.beep)shared.beep(110,0.1,'sawtooth',0.03);
      }
    } else {
      state.misses++;
      state.message='Too early!';state.msgTimer=60;
    }
    state.phase='idle';
  }

  function loop(){
    var now=Date.now();
    var dt=now-state.lastTime;
    state.lastTime=now;
    state.timeLeft-=dt;
    if(state.timeLeft<=0&&!state.gameOver){endGame();}
    update();draw();
    if(!state.gameOver)raf=requestAnimationFrame(loop);
  }

  function update(){
    /* Fish movement */
    state.fish.forEach(function(f){
      f.x+=f.vx;
      if(f.x<-30)f.x=W+30;
      if(f.x>W+30)f.x=-30;
    });

    if(state.phase==='waiting'){
      state.bobber.y+=(state.bobber.targetY-state.bobber.y)*0.1;
      state.biteTimer--;
      if(state.biteTimer<=0){
        state.phase='bite';
        state.catchWindow=45;
        if(shared.beep)shared.beep(660,0.05,'square',0.04);
      }
    }
    if(state.phase==='bite'){
      state.catchWindow--;
      if(state.catchWindow<=0){
        state.phase='idle';
        state.misses++;
        state.message='Got away!';state.msgTimer=60;
      }
    }
    if(state.msgTimer>0)state.msgTimer--;
  }

  function endGame(){state.gameOver=true;draw();
    shared.highScores.maybeSubmit({gameId:id,score:state.score,mode:'score',title:title});}

  function draw(){
    /* Sky */
    ctx.fillStyle='#112';ctx.fillRect(0,0,W,160);
    /* Water */
    ctx.fillStyle='#024';ctx.fillRect(0,160,W,H-160);
    /* Waves */
    ctx.strokeStyle='#046';ctx.lineWidth=1;
    for(var i=0;i<W;i+=20){
      ctx.beginPath();ctx.moveTo(i,160+Math.sin(Date.now()/500+i/30)*3);
      ctx.lineTo(i+15,160+Math.sin(Date.now()/500+(i+15)/30)*3);ctx.stroke();
    }
    /* Fish */
    state.fish.forEach(function(f){
      ctx.fillStyle=f.type.color;
      ctx.beginPath();
      ctx.ellipse(f.x,f.y,f.size,f.size*0.6,0,0,Math.PI*2);ctx.fill();
      /* Tail */
      var dir=f.vx>0?-1:1;
      ctx.beginPath();ctx.moveTo(f.x+dir*f.size,f.y);
      ctx.lineTo(f.x+dir*(f.size+8),f.y-6);
      ctx.lineTo(f.x+dir*(f.size+8),f.y+6);ctx.closePath();ctx.fill();
      /* Eye */
      ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(f.x-dir*f.size*0.4,f.y-2,2,0,Math.PI*2);ctx.fill();
    });
    /* Fishing line */
    if(state.phase!=='idle'){
      ctx.strokeStyle='#aaa';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(W/2,80);ctx.lineTo(W/2,state.bobber.y);ctx.stroke();
      /* Bobber */
      ctx.fillStyle=state.phase==='bite'?'#f00':'#fa0';
      ctx.beginPath();ctx.arc(W/2,state.bobber.y,6,0,Math.PI*2);ctx.fill();
      if(state.phase==='bite'){
        ctx.fillStyle='#ff0';ctx.font='16px monospace';ctx.textAlign='center';
        ctx.fillText('! BITE !',W/2,state.bobber.y-15);ctx.textAlign='left';
      }
    }
    /* Rod */
    ctx.strokeStyle='#864';ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(W/2-40,130);ctx.lineTo(W/2,80);ctx.stroke();
    /* HUD */
    ctx.fillStyle='#0ff';ctx.font='13px monospace';
    ctx.fillText('Score: '+state.score+'  Catches: '+state.catches+'  Time: '+Math.ceil(state.timeLeft/1000)+'s',10,20);
    ctx.fillText(state.phase==='idle'?'Press SPACE to cast':'',10,40);
    /* Message */
    if(state.msgTimer>0){
      ctx.fillStyle='#ff0';ctx.font='18px monospace';ctx.textAlign='center';
      ctx.fillText(state.message,W/2,70);ctx.textAlign='left';
    }

    if(state.gameOver){
      ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,W,H);
      ctx.textAlign='center';ctx.fillStyle='#0ff';ctx.font='22px monospace';
      ctx.fillText('TIME\'S UP!',W/2,H/2-30);
      ctx.fillStyle='#ff0';ctx.font='16px monospace';
      ctx.fillText('Score: '+state.score+' ('+state.catches+' fish)',W/2,H/2);
      ctx.fillStyle='#ccc';ctx.font='12px monospace';ctx.fillText('Press R to restart',W/2,H/2+30);
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
      getState:function(){return{score:state.score,gameOver:state.gameOver,catches:state.catches};},
      forceWin:function(){state.score=5000;endGame();},
      setDeterministicSeed:function(){}
    };
  }

  return {id:id,title:title,description:description,genreTag:genreTag,controls:controls,
    hasLevels:hasLevels,scoreMode:scoreMode,init:init,destroy:destroy,getTestHooks:getTestHooks};
})();
