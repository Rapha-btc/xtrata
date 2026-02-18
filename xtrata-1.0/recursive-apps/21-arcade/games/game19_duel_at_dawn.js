/* Game 19: Duel at Dawn - Reaction time duel */
var Game19 = (function(){
  var id='duel_at_dawn',title='Duel at Dawn',description='Test your reflexes! Draw faster than your opponent.',
      genreTag='Reaction',controls='Space: Draw!, R: Restart',
      hasLevels=false,scoreMode='score';
  var canvas,ctx,container,shared,raf,listeners=[],intervals=[];
  var W=500,H=350,state;

  function init(cont,sh){
    container=cont;shared=sh;
    canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
    container.appendChild(canvas);ctx=canvas.getContext('2d');
    var kd=function(e){
      if(e.key===' '){
        e.preventDefault();
        if(state.phase==='draw')playerDraw();
        else if(state.phase==='wait')tooEarly();
      }
      if(e.key==='r'||e.key==='R')restartGame();
    };
    document.addEventListener('keydown',kd);listeners.push(['keydown',kd]);
    startGame();
  }

  function startGame(){
    state={round:1,score:0,wins:0,losses:0,phase:'countdown',
      timer:0,drawTime:0,reactionTime:0,gameOver:false,
      message:'',opponentTime:0,countdownTimer:0};
    startRound();loop();
  }
  function restartGame(){cancelAnimationFrame(raf);intervals.forEach(function(i){clearInterval(i);});intervals=[];startGame();}

  function startRound(){
    state.phase='countdown';
    state.countdownTimer=60+Math.random()*60;
    state.message='Get ready...';
    state.opponentTime=200+Math.random()*400; /* ms */
    state.drawTime=0;state.reactionTime=0;
  }

  function playerDraw(){
    state.reactionTime=Date.now()-state.drawTime;
    if(state.reactionTime<state.opponentTime){
      state.wins++;
      state.score+=Math.max(10,Math.floor(500-state.reactionTime));
      state.message='YOU WIN! '+state.reactionTime+'ms vs '+Math.floor(state.opponentTime)+'ms';
      if(shared.beep)shared.beep(880,0.15,'sine',0.05);
    } else {
      state.losses++;
      state.message='YOU LOSE! '+state.reactionTime+'ms vs '+Math.floor(state.opponentTime)+'ms';
      if(shared.beep)shared.beep(110,0.2,'sawtooth',0.05);
    }
    state.phase='result';
    state.round++;
    if(state.round>10){
      state.gameOver=true;
      draw();
      shared.highScores.maybeSubmit({gameId:id,score:state.score,mode:'score',title:title});
    } else {
      setTimeout(function(){if(!state.gameOver)startRound();},2000);
    }
  }

  function tooEarly(){
    state.losses++;
    state.message='TOO EARLY! -50 points';
    state.score=Math.max(0,state.score-50);
    state.phase='result';
    state.round++;
    if(shared.beep)shared.beep(110,0.3,'sawtooth',0.05);
    if(state.round>10){
      state.gameOver=true;
      draw();
      shared.highScores.maybeSubmit({gameId:id,score:state.score,mode:'score',title:title});
    } else {
      setTimeout(function(){if(!state.gameOver)startRound();},2000);
    }
  }

  function loop(){
    update();draw();
    if(!state.gameOver)raf=requestAnimationFrame(loop);
  }

  function update(){
    if(state.phase==='countdown'){
      state.countdownTimer--;
      if(state.countdownTimer<=0){
        state.phase='wait';
        state.timer=60+Math.random()*180; /* Random wait before DRAW */
      }
    }
    if(state.phase==='wait'){
      state.timer--;
      if(state.timer<=0){
        state.phase='draw';
        state.drawTime=Date.now();
        state.message='DRAW!';
        if(shared.beep)shared.beep(1000,0.1,'square',0.06);
      }
    }
  }

  function draw(){
    /* Sky gradient */
    ctx.fillStyle='#210';ctx.fillRect(0,0,W,H/2);
    ctx.fillStyle='#420';ctx.fillRect(0,H/2-40,W,40);
    /* Ground */
    ctx.fillStyle='#331';ctx.fillRect(0,H/2,W,H/2);
    /* Sun */
    ctx.fillStyle='#f80';ctx.beginPath();ctx.arc(W/2,H/2-10,40,Math.PI,0);ctx.fill();
    ctx.fillStyle='#fa0';ctx.beginPath();ctx.arc(W/2,H/2-10,30,Math.PI,0);ctx.fill();

    /* Duelists */
    drawDuelist(80,H/2-60,'#0ff','Player');
    drawDuelist(W-80,H/2-60,'#f44','CPU');

    /* Message */
    ctx.textAlign='center';
    if(state.phase==='draw'){
      ctx.fillStyle='#f00';ctx.font='bold 48px monospace';
      ctx.fillText('DRAW!',W/2,100);
    } else if(state.phase==='wait'||state.phase==='countdown'){
      ctx.fillStyle='#ff0';ctx.font='24px monospace';
      ctx.fillText(state.message,W/2,100);
    } else {
      ctx.fillStyle='#0ff';ctx.font='16px monospace';
      ctx.fillText(state.message,W/2,100);
    }

    /* HUD */
    ctx.fillStyle='#0ff';ctx.font='13px monospace';ctx.textAlign='left';
    ctx.fillText('Round: '+state.round+'/10  Score: '+state.score+'  W:'+state.wins+' L:'+state.losses,10,20);

    if(state.gameOver){
      ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,W,H);
      ctx.textAlign='center';ctx.fillStyle=state.wins>state.losses?'#0f0':'#f00';ctx.font='24px monospace';
      ctx.fillText(state.wins>state.losses?'VICTORY!':'DEFEAT!',W/2,H/2-30);
      ctx.fillStyle='#ff0';ctx.font='16px monospace';
      ctx.fillText('Score: '+state.score+' (W:'+state.wins+' L:'+state.losses+')',W/2,H/2);
      ctx.fillStyle='#ccc';ctx.font='12px monospace';ctx.fillText('Press R to restart',W/2,H/2+30);
      ctx.textAlign='left';
    }
  }

  function drawDuelist(x,y,color,label){
    ctx.fillStyle=color;
    /* Body */
    ctx.fillRect(x-8,y,16,30);
    /* Head */
    ctx.beginPath();ctx.arc(x,y-8,10,0,Math.PI*2);ctx.fill();
    /* Hat */
    ctx.fillRect(x-14,y-18,28,4);ctx.fillRect(x-6,y-24,12,8);
    /* Label */
    ctx.fillStyle='#fff';ctx.font='10px monospace';ctx.textAlign='center';
    ctx.fillText(label,x,y+45);ctx.textAlign='left';
  }

  function destroy(){
    cancelAnimationFrame(raf);intervals.forEach(function(i){clearInterval(i);});intervals=[];
    listeners.forEach(function(l){document.removeEventListener(l[0],l[1]);});listeners=[];
    if(container)container.innerHTML='';
  }

  function getTestHooks(){
    return {
      getState:function(){return{score:state.score,gameOver:state.gameOver,round:state.round,wins:state.wins};},
      forceWin:function(){state.score=5000;state.gameOver=true;draw();
        shared.highScores.maybeSubmit({gameId:id,score:state.score,mode:'score',title:title});},
      setDeterministicSeed:function(){}
    };
  }

  return {id:id,title:title,description:description,genreTag:genreTag,controls:controls,
    hasLevels:hasLevels,scoreMode:scoreMode,init:init,destroy:destroy,getTestHooks:getTestHooks};
})();
