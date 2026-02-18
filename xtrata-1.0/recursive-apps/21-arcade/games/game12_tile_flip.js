/* Game 12: Tile Flip - Lights Out puzzle */
var Game12 = (function(){
  var id='tile_flip',title='Tile Flip',description='Turn off all the lights! Clicking toggles neighbors.',
      genreTag='Puzzle',controls='Click: Toggle tile, R: Restart',
      hasLevels=true,scoreMode='score';
  var canvas,ctx,container,shared,raf,listeners=[],intervals=[];
  var SIZE=5,CELL=70,PAD=20,state;

  function init(cont,sh){
    container=cont;shared=sh;
    var W=SIZE*CELL+PAD*2,H=SIZE*CELL+PAD*2+40;
    canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
    container.appendChild(canvas);ctx=canvas.getContext('2d');
    var mc=function(e){
      if(!state||state.gameOver)return;
      var rect=canvas.getBoundingClientRect();
      var mx=e.clientX-rect.left-PAD,my=e.clientY-rect.top-PAD-40;
      var c=Math.floor(mx/CELL),r=Math.floor(my/CELL);
      if(c>=0&&c<SIZE&&r>=0&&r<SIZE)toggle(r,c);
    };
    canvas.addEventListener('click',mc);listeners.push(['click',mc,canvas]);
    var kd=function(e){if(e.key==='r'||e.key==='R')restartGame();};
    document.addEventListener('keydown',kd);listeners.push(['keydown',kd]);
    startGame();
  }

  function startGame(){
    /* Initialize state FIRST, then generate grid using state.level */
    state={grid:null,moves:0,level:1,score:0,gameOver:false,won:false};
    state.grid=makeGrid();
    draw();
  }
  function restartGame(){startGame();}

  function makeGrid(){
    /* Start from solved and apply random toggles to ensure solvability */
    var g=[];for(var r=0;r<SIZE;r++){g.push([]);for(var c=0;c<SIZE;c++)g[r].push(0);}
    var flips=3+state.level*2;if(flips>15)flips=15;
    for(var i=0;i<flips;i++){
      var rr=Math.floor(Math.random()*SIZE),cc=Math.floor(Math.random()*SIZE);
      applyToggle(g,rr,cc);
    }
    /* Ensure at least one light is on */
    var any=false;g.forEach(function(row){row.forEach(function(v){if(v)any=true;});});
    if(!any)applyToggle(g,2,2);
    return g;
  }

  function applyToggle(g,r,c){
    g[r][c]^=1;
    if(r>0)g[r-1][c]^=1;
    if(r<SIZE-1)g[r+1][c]^=1;
    if(c>0)g[r][c-1]^=1;
    if(c<SIZE-1)g[r][c+1]^=1;
  }

  function toggle(r,c){
    applyToggle(state.grid,r,c);
    state.moves++;
    if(shared.beep)shared.beep(440,0.05,'square',0.03);
    checkWin();
    draw();
  }

  function checkWin(){
    if(!state||!state.grid)return;
    var allOff=true;
    state.grid.forEach(function(row){row.forEach(function(v){if(v)allOff=false;});});
    if(allOff){
      state.score+=Math.max(10,(100-state.moves)*state.level);
      state.level++;
      if(state.level>10){
        state.gameOver=true;state.won=true;
        shared.highScores.maybeSubmit({gameId:id,score:state.score,mode:'score',title:title});
      } else {
        state.grid=makeGrid();state.moves=0;
      }
    }
  }

  function draw(){
    if(!canvas||!ctx||!state)return;
    var W=canvas.width,H=canvas.height;
    ctx.fillStyle='#0a0a1a';ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#0ff';ctx.font='14px monospace';ctx.textAlign='center';
    ctx.fillText('Level: '+state.level+'  Moves: '+state.moves+'  Score: '+state.score,W/2,24);
    ctx.fillStyle='#888';ctx.font='11px monospace';
    ctx.fillText('Turn off all the yellow lights!',W/2,38);

    if(state.grid){
      for(var r=0;r<SIZE;r++)for(var c=0;c<SIZE;c++){
        var x=PAD+c*CELL,y=PAD+40+r*CELL;
        ctx.fillStyle=state.grid[r][c]?'#ff0':'#222';
        ctx.fillRect(x+2,y+2,CELL-4,CELL-4);
        ctx.strokeStyle=state.grid[r][c]?'#aa0':'#444';
        ctx.strokeRect(x+2,y+2,CELL-4,CELL-4);
      }
    }
    ctx.textAlign='left';

    if(state.gameOver){
      ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,W,H);
      ctx.textAlign='center';ctx.fillStyle='#0f0';ctx.font='24px monospace';
      ctx.fillText('ALL CLEAR!',W/2,H/2-20);
      ctx.fillStyle='#ff0';ctx.font='16px monospace';ctx.fillText('Score: '+state.score,W/2,H/2+10);
      ctx.fillStyle='#ccc';ctx.font='12px monospace';ctx.fillText('Press R to restart',W/2,H/2+40);
      ctx.textAlign='left';
    }
  }

  function destroy(){
    cancelAnimationFrame(raf);intervals.forEach(function(i){clearInterval(i);});intervals=[];
    listeners.forEach(function(l){var t=l[2]||document;t.removeEventListener(l[0],l[1]);});listeners=[];
    if(container)container.innerHTML='';
    state=null;
  }

  function getTestHooks(){
    return {
      getState:function(){if(!state)return{level:0,score:0,gameOver:true,moves:0};return{level:state.level,score:state.score,gameOver:state.gameOver,moves:state.moves};},
      completeLevel:function(){
        if(!state||!state.grid)return;
        /* Solve by clearing grid */
        for(var r=0;r<SIZE;r++)for(var c=0;c<SIZE;c++)state.grid[r][c]=0;
        checkWin();draw();
      },
      forceWin:function(){if(!state)return;state.level=10;for(var r=0;r<SIZE;r++)for(var c=0;c<SIZE;c++)state.grid[r][c]=0;checkWin();draw();},
      setDeterministicSeed:function(){}
    };
  }

  return {id:id,title:title,description:description,genreTag:genreTag,controls:controls,
    hasLevels:hasLevels,scoreMode:scoreMode,init:init,destroy:destroy,getTestHooks:getTestHooks};
})();
