/* Game 11: Memory Matrix - Simon-style memory pattern game */
var Game11 = (function(){
  var id='memory_matrix',title='Memory Matrix',description='Remember and repeat the pattern! Simon-style.',
      genreTag='Memory',controls='Click/1-4: Select tile, R: Restart',
      hasLevels=true,scoreMode='score';
  var canvas,ctx,container,shared,raf,listeners=[],intervals=[];
  var W=400,H=400,state;
  var COLORS=['#f44','#4a4','#44f','#ff0'];
  var BRIGHT=['#f88','#8f8','#88f','#ff8'];
  var TONES=[262,330,392,523];

  function init(cont,sh){
    container=cont;shared=sh;
    canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
    container.appendChild(canvas);ctx=canvas.getContext('2d');
    var mc=function(e){
      if(state.phase!=='input')return;
      var rect=canvas.getBoundingClientRect();
      var mx=e.clientX-rect.left,my=e.clientY-rect.top;
      var idx=getTileAt(mx,my);
      if(idx>=0)playerInput(idx);
    };
    canvas.addEventListener('click',mc);listeners.push(['click',mc,canvas]);
    var kd=function(e){
      if(e.key==='r'||e.key==='R')restartGame();
      var n=parseInt(e.key);
      if(n>=1&&n<=4&&state.phase==='input')playerInput(n-1);
    };
    document.addEventListener('keydown',kd);listeners.push(['keydown',kd]);
    startGame();
  }

  function startGame(){
    state={sequence:[],inputIdx:0,level:1,score:0,phase:'show',showIdx:0,
      showTimer:0,flash:-1,gameOver:false,flashTimer:0};
    addToSequence();
    showSequence();
  }
  function restartGame(){cancelAnimationFrame(raf);intervals.forEach(function(i){clearInterval(i);});intervals=[];startGame();}

  function addToSequence(){state.sequence.push(Math.floor(Math.random()*4));}

  function showSequence(){
    state.phase='show';state.showIdx=0;state.showTimer=0;state.flash=-1;
    loop();
  }

  function getTileAt(mx,my){
    var pads=getPads();
    for(var i=0;i<4;i++){
      var p=pads[i];
      if(mx>=p.x&&mx<=p.x+p.w&&my>=p.y&&my<=p.y+p.h)return i;
    }
    return -1;
  }

  function getPads(){
    var gap=20,sz=160,ox=(W-sz*2-gap)/2,oy=80;
    return [
      {x:ox,y:oy,w:sz,h:sz},
      {x:ox+sz+gap,y:oy,w:sz,h:sz},
      {x:ox,y:oy+sz+gap,w:sz,h:sz},
      {x:ox+sz+gap,y:oy+sz+gap,w:sz,h:sz}
    ];
  }

  function playerInput(idx){
    state.flash=idx;state.flashTimer=8;
    if(shared.beep)shared.beep(TONES[idx],0.15,'sine',0.06);
    if(idx===state.sequence[state.inputIdx]){
      state.inputIdx++;
      if(state.inputIdx>=state.sequence.length){
        state.score+=state.level*10;
        state.level++;
        addToSequence();
        state.inputIdx=0;
        state.phase='pause';
        setTimeout(function(){if(!state.gameOver)showSequence();},600);
      }
    } else {
      endGame();
    }
  }

  function loop(){
    if(state.phase==='show'){
      state.showTimer++;
      if(state.showTimer>=30){
        state.showTimer=0;
        if(state.showIdx<state.sequence.length){
          state.flash=state.sequence[state.showIdx];
          state.flashTimer=15;
          if(shared.beep)shared.beep(TONES[state.flash],0.15,'sine',0.05);
          state.showIdx++;
        } else {
          state.phase='input';state.inputIdx=0;state.flash=-1;
        }
      }
    }
    if(state.flashTimer>0)state.flashTimer--;
    if(state.flashTimer<=0)state.flash=-1;
    draw();
    if(!state.gameOver)raf=requestAnimationFrame(loop);
  }

  function endGame(){state.gameOver=true;draw();
    shared.highScores.maybeSubmit({gameId:id,score:state.score,mode:'score',title:title});}

  function draw(){
    ctx.fillStyle='#0a0a1a';ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#0ff';ctx.font='16px monospace';ctx.textAlign='center';
    ctx.fillText('Level: '+state.level+'  Score: '+state.score,W/2,30);
    ctx.fillText(state.phase==='show'?'Watch...':'Your turn!',W/2,55);

    var pads=getPads();
    for(var i=0;i<4;i++){
      var p=pads[i];
      ctx.fillStyle=(state.flash===i)?BRIGHT[i]:COLORS[i];
      ctx.fillRect(p.x,p.y,p.w,p.h);
      ctx.fillStyle='rgba(0,0,0,0.3)';
      ctx.font='40px monospace';
      ctx.fillText(''+(i+1),p.x+p.w/2,p.y+p.h/2+14);
    }
    ctx.textAlign='left';

    if(state.gameOver){
      ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,W,H);
      ctx.textAlign='center';ctx.fillStyle='#f00';ctx.font='24px monospace';
      ctx.fillText('WRONG!',W/2,H/2-20);
      ctx.fillStyle='#ff0';ctx.font='16px monospace';ctx.fillText('Score: '+state.score,W/2,H/2+10);
      ctx.fillStyle='#ccc';ctx.font='12px monospace';ctx.fillText('Press R to restart',W/2,H/2+40);
      ctx.textAlign='left';
    }
  }

  function destroy(){
    cancelAnimationFrame(raf);intervals.forEach(function(i){clearInterval(i);});intervals=[];
    listeners.forEach(function(l){var t=l[2]||document;t.removeEventListener(l[0],l[1]);});listeners=[];
    if(container)container.innerHTML='';
  }

  function getTestHooks(){
    return {
      getState:function(){return{level:state.level,score:state.score,gameOver:state.gameOver,phase:state.phase};},
      completeLevel:function(){
        state.score+=state.level*10;state.level++;addToSequence();
        state.inputIdx=0;state.phase='show';state.showIdx=0;state.showTimer=0;
      },
      forceWin:function(){state.score=5000;endGame();},
      setDeterministicSeed:function(){}
    };
  }

  return {id:id,title:title,description:description,genreTag:genreTag,controls:controls,
    hasLevels:hasLevels,scoreMode:scoreMode,init:init,destroy:destroy,getTestHooks:getTestHooks};
})();
