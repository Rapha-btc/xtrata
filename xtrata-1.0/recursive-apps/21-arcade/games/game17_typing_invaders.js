/* Game 17: Typing Invaders - Defeat enemies by typing words */
var Game17 = (function(){
  var id='typing_invaders',title='Typing Invaders',description='Type the words to destroy invaders!',
      genreTag='Typing',controls='Type words to shoot, R: Restart',
      hasLevels=false,scoreMode='score';
  var canvas,ctx,container,shared,raf,listeners=[],intervals=[];
  var W=500,H=450,state;

  var WORDS=['bug','code','hack','data','byte','loop','node','ping','port','disk',
    'file','link','core','chip','scan','sync','load','dump','hash','root',
    'void','null','type','enum','func','call','heap','stack','array','class',
    'pixel','debug','cache','parse','query','index','proxy','shell','crypt','block'];

  function init(cont,sh){
    container=cont;shared=sh;
    canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
    container.appendChild(canvas);ctx=canvas.getContext('2d');
    var kd=function(e){
      if(state.gameOver){if(e.key==='r'||e.key==='R')restartGame();return;}
      if(e.key==='Backspace'){state.typed=state.typed.slice(0,-1);e.preventDefault();return;}
      if(e.key==='r'&&state.typed==='')restartGame();
      if(e.key.length===1&&e.key.match(/[a-z]/i)){
        state.typed+=e.key.toLowerCase();
        checkWord();
      }
    };
    document.addEventListener('keydown',kd);listeners.push(['keydown',kd]);
    startGame();
  }

  function startGame(){
    state={enemies:[],typed:'',score:0,gameOver:false,spawnTimer:0,speed:0.3,lives:5};
    loop();
  }
  function restartGame(){cancelAnimationFrame(raf);startGame();}

  function spawnEnemy(){
    var word=WORDS[Math.floor(Math.random()*WORDS.length)];
    state.enemies.push({word:word,x:ArcadeUtils.randInt(40,W-80),y:-20,speed:state.speed+Math.random()*0.2});
  }

  function checkWord(){
    for(var i=state.enemies.length-1;i>=0;i--){
      if(state.enemies[i].word===state.typed){
        state.score+=state.enemies[i].word.length*20;
        state.enemies.splice(i,1);
        state.typed='';
        if(shared.beep)shared.beep(660,0.1,'sine',0.04);
        return;
      }
    }
  }

  function loop(){
    update();draw();
    if(!state.gameOver)raf=requestAnimationFrame(loop);
  }

  function update(){
    state.speed=0.3+state.score/2000;
    state.spawnTimer++;
    var interval=Math.max(40,120-state.score/50);
    if(state.spawnTimer>=interval){state.spawnTimer=0;spawnEnemy();}

    for(var i=state.enemies.length-1;i>=0;i--){
      state.enemies[i].y+=state.enemies[i].speed;
      if(state.enemies[i].y>H){
        state.enemies.splice(i,1);
        state.lives--;
        if(shared.beep)shared.beep(110,0.15,'sawtooth',0.04);
        if(state.lives<=0)endGame();
      }
    }
  }

  function endGame(){state.gameOver=true;draw();
    shared.highScores.maybeSubmit({gameId:id,score:state.score,mode:'score',title:title});}

  function draw(){
    ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
    /* Defense line */
    ctx.strokeStyle='#f44';ctx.setLineDash([5,5]);
    ctx.beginPath();ctx.moveTo(0,H-10);ctx.lineTo(W,H-10);ctx.stroke();
    ctx.setLineDash([]);
    /* Enemies */
    state.enemies.forEach(function(e){
      ctx.fillStyle='#1a1a3e';
      var tw=ctx.measureText(e.word).width+16;
      ctx.fillRect(e.x-tw/2,e.y-12,tw,24);
      ctx.strokeStyle='#f44';ctx.strokeRect(e.x-tw/2,e.y-12,tw,24);
      /* Highlight matched chars */
      var matched=0;
      for(var i=0;i<state.typed.length&&i<e.word.length;i++){
        if(state.typed[i]===e.word[i])matched++;else break;
      }
      ctx.font='14px monospace';ctx.textAlign='center';
      if(matched>0){
        ctx.fillStyle='#0f0';ctx.fillText(e.word.substring(0,matched),e.x-ctx.measureText(e.word.substring(matched)).width/2,e.y+5);
      }
      ctx.fillStyle='#f44';
      ctx.fillText(e.word.substring(matched),e.x+ctx.measureText(e.word.substring(0,matched)).width/2,e.y+5);
      ctx.textAlign='left';
    });
    /* Typed */
    ctx.fillStyle='#0ff';ctx.font='18px monospace';
    ctx.fillText('> '+state.typed+'_',10,H-30);
    /* HUD */
    ctx.fillStyle='#0ff';ctx.font='13px monospace';
    ctx.fillText('Score: '+state.score+'  Lives: '+state.lives,10,20);

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
      getState:function(){return{score:state.score,gameOver:state.gameOver,lives:state.lives};},
      forceWin:function(){state.score=9999;endGame();},
      setDeterministicSeed:function(){}
    };
  }

  return {id:id,title:title,description:description,genreTag:genreTag,controls:controls,
    hasLevels:hasLevels,scoreMode:scoreMode,init:init,destroy:destroy,getTestHooks:getTestHooks};
})();
