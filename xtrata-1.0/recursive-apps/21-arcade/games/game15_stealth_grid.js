/* Game 15: Stealth Grid - Avoid vision cones, reach exit */
var Game15 = (function(){
  var id='stealth_grid',title='Stealth Grid',description='Sneak past guards to reach the exit!',
      genreTag='Stealth',controls='Arrows: Move, R: Restart',
      hasLevels=true,scoreMode='time';
  var canvas,ctx,container,shared,raf,listeners=[],intervals=[];
  var CELL=32,state;

  /* Prebuilt levels: 0=empty,1=wall,2=start,3=exit,4+=guard positions */
  var LEVELS=[
    {w:10,h:8,walls:[[0,0,10,1],[0,7,10,1],[0,0,1,8],[9,0,1,8],[3,2,1,3],[6,4,1,3]],
     start:{r:6,c:1},exit:{r:1,c:8},guards:[{r:3,c:5,dir:0,range:4},{r:5,c:3,dir:2,range:3}]},
    {w:12,h:9,walls:[[0,0,12,1],[0,8,12,1],[0,0,1,9],[11,0,1,9],[4,2,1,4],[7,3,1,4],[2,6,4,1]],
     start:{r:7,c:1},exit:{r:1,c:10},guards:[{r:3,c:6,dir:0,range:4},{r:5,c:3,dir:1,range:3},{r:6,c:9,dir:2,range:3}]},
    {w:13,h:10,walls:[[0,0,13,1],[0,9,13,1],[0,0,1,10],[12,0,1,10],[3,2,1,5],[6,3,4,1],[9,4,1,4]],
     start:{r:8,c:1},exit:{r:1,c:11},guards:[{r:4,c:5,dir:0,range:5},{r:7,c:8,dir:1,range:4},{r:2,c:9,dir:2,range:3},{r:6,c:2,dir:3,range:3}]}
  ];

  function init(cont,sh){
    container=cont;shared=sh;
    canvas=document.createElement('canvas');
    container.appendChild(canvas);ctx=canvas.getContext('2d');
    var kd=function(e){
      if(state.gameOver){if(e.key==='r'||e.key==='R')restartGame();return;}
      if(e.key==='ArrowUp')tryMove(0,-1);
      if(e.key==='ArrowDown')tryMove(0,1);
      if(e.key==='ArrowLeft')tryMove(-1,0);
      if(e.key==='ArrowRight')tryMove(1,0);
      if(e.key==='r'||e.key==='R')restartGame();
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(e.key)>=0)e.preventDefault();
    };
    document.addEventListener('keydown',kd);listeners.push(['keydown',kd]);
    startGame();
  }

  function startGame(){
    state={levelIdx:0,gameOver:false,won:false,startTime:Date.now(),totalTime:0,
      grid:null,player:null,guards:[],exit:null,tick:0};
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
    canvas.width=lvl.w*CELL;canvas.height=lvl.h*CELL;
    state.grid=[];
    for(var r=0;r<lvl.h;r++){state.grid.push(new Array(lvl.w).fill(0));}
    lvl.walls.forEach(function(w){
      for(var r=w[1];r<w[1]+w[3];r++)for(var c=w[0];c<w[0]+w[2];c++){
        if(r>=0&&r<lvl.h&&c>=0&&c<lvl.w)state.grid[r][c]=1;
      }
    });
    state.player={r:lvl.start.r,c:lvl.start.c};
    state.exit={r:lvl.exit.r,c:lvl.exit.c};
    state.guards=lvl.guards.map(function(g){return{r:g.r,c:g.c,dir:g.dir,range:g.range,tick:0};});
  }

  function tryMove(dc,dr){
    var nr=state.player.r+dr,nc=state.player.c+dc;
    var lvl=LEVELS[state.levelIdx];
    if(nr<0||nr>=lvl.h||nc<0||nc>=lvl.w)return;
    if(state.grid[nr][nc]===1)return;
    state.player.r=nr;state.player.c=nc;
    if(shared.beep)shared.beep(400,0.03,'square',0.02);
    if(nr===state.exit.r&&nc===state.exit.c){
      loadLevel(state.levelIdx+1);
    }
    checkDetection();
  }

  function checkDetection(){
    var DIRS=[[0,-1],[1,0],[0,1],[-1,0]]; /* up,right,down,left */
    for(var g=0;g<state.guards.length;g++){
      var guard=state.guards[g];
      var d=DIRS[guard.dir];
      for(var i=1;i<=guard.range;i++){
        var cr=guard.r+d[1]*i,cc=guard.c+d[0]*i;
        if(cr<0||cr>=state.grid.length||cc<0||cc>=state.grid[0].length)break;
        if(state.grid[cr][cc]===1)break;
        if(cr===state.player.r&&cc===state.player.c){
          state.totalTime=Date.now()-state.startTime;
          state.gameOver=true;state.won=false;draw();
          shared.highScores.maybeSubmit({gameId:id,score:state.totalTime,mode:'time',title:title});
          return;
        }
      }
    }
  }

  function loop(){
    state.tick++;
    /* Rotate guards every 90 frames */
    if(state.tick%90===0){
      state.guards.forEach(function(g){g.dir=(g.dir+1)%4;});
    }
    checkDetection();
    draw();
    if(!state.gameOver)raf=requestAnimationFrame(loop);
  }

  function draw(){
    var W=canvas.width,H=canvas.height;
    ctx.fillStyle='#0a0a1a';ctx.fillRect(0,0,W,H);
    /* Grid */
    for(var r=0;r<state.grid.length;r++)for(var c=0;c<state.grid[r].length;c++){
      if(state.grid[r][c]===1){ctx.fillStyle='#334';ctx.fillRect(c*CELL,r*CELL,CELL,CELL);}
    }
    /* Vision cones */
    var DIRS=[[0,-1],[1,0],[0,1],[-1,0]];
    state.guards.forEach(function(g){
      var d=DIRS[g.dir];
      ctx.fillStyle='rgba(255,0,0,0.15)';
      for(var i=1;i<=g.range;i++){
        var cr=g.r+d[1]*i,cc=g.c+d[0]*i;
        if(cr<0||cr>=state.grid.length||cc<0||cc>=state.grid[0].length)break;
        if(state.grid[cr][cc]===1)break;
        ctx.fillRect(cc*CELL,cr*CELL,CELL,CELL);
      }
    });
    /* Exit */
    ctx.fillStyle='#0f0';ctx.fillRect(state.exit.c*CELL+6,state.exit.r*CELL+6,CELL-12,CELL-12);
    ctx.fillStyle='#000';ctx.font='10px monospace';ctx.fillText('EXIT',state.exit.c*CELL+4,state.exit.r*CELL+CELL/2+3);
    /* Guards */
    state.guards.forEach(function(g){
      ctx.fillStyle='#f44';
      ctx.beginPath();ctx.arc(g.c*CELL+CELL/2,g.r*CELL+CELL/2,CELL/2-4,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#fff';ctx.font='12px monospace';ctx.textAlign='center';
      ctx.fillText(['↑','→','↓','←'][g.dir],g.c*CELL+CELL/2,g.r*CELL+CELL/2+4);ctx.textAlign='left';
    });
    /* Player */
    ctx.fillStyle='#0ff';ctx.fillRect(state.player.c*CELL+4,state.player.r*CELL+4,CELL-8,CELL-8);
    /* HUD */
    ctx.fillStyle='#0ff';ctx.font='11px monospace';
    ctx.fillText('Lvl:'+(state.levelIdx+1)+' Time:'+ArcadeUtils.formatTime(Date.now()-state.startTime),4,H-4);

    if(state.gameOver){
      ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,W,H);
      ctx.textAlign='center';ctx.fillStyle=state.won?'#0f0':'#f00';ctx.font='22px monospace';
      ctx.fillText(state.won?'ESCAPED!':'DETECTED!',W/2,H/2-20);
      ctx.fillStyle='#ff0';ctx.font='14px monospace';ctx.fillText('Time: '+ArcadeUtils.formatTime(state.totalTime),W/2,H/2+10);
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
