/* Game 04: Maze Escape - Navigate maze, avoid chaser */
var Game04 = (function(){
  var id='maze_escape',title='Maze Escape',description='Navigate the maze before the chaser catches you!',
      genreTag='Maze',controls='Arrows: Move, R: Restart',
      hasLevels=true,scoreMode='time';
  var canvas,ctx,container,shared,raf,listeners=[],intervals=[];
  var CELL=24,state;

  function init(cont,sh){
    container=cont;shared=sh;
    canvas=document.createElement('canvas');
    container.appendChild(canvas);ctx=canvas.getContext('2d');
    var kd=function(e){
      if(state.gameOver){if(e.key==='r'||e.key==='R')restartGame();return;}
      if(e.key==='ArrowLeft')tryMove(-1,0);
      if(e.key==='ArrowRight')tryMove(1,0);
      if(e.key==='ArrowUp')tryMove(0,-1);
      if(e.key==='ArrowDown')tryMove(0,1);
      if(e.key==='r'||e.key==='R')restartGame();
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(e.key)>=0)e.preventDefault();
    };
    document.addEventListener('keydown',kd);listeners.push(['keydown',kd]);
    startGame();
  }

  function startGame(){
    state={level:1,gameOver:false,won:false,startTime:Date.now(),totalTime:0,maze:null,
      player:{r:0,c:0},chaser:{r:0,c:0},exit:{r:0,c:0},chaserTimer:0,cols:0,rows:0};
    buildLevel();
    loop();
  }
  function restartGame(){cancelAnimationFrame(raf);intervals.forEach(function(i){clearInterval(i);});intervals=[];startGame();}

  function buildLevel(){
    var size=7+state.level*2;
    if(size>21)size=21;
    /* Ensure odd size for proper maze generation */
    if(size%2===0)size++;
    state.cols=size;state.rows=size;
    canvas.width=size*CELL;canvas.height=size*CELL;
    state.maze=generateMaze(size,size);

    /* Player starts top-left */
    state.player={r:1,c:1};
    state.maze[1][1]=0;

    /* Exit at bottom-right */
    state.exit={r:size-2,c:size-2};
    state.maze[size-2][size-2]=0;

    /* Find the path from player to exit using BFS */
    var path=bfs(1,1,size-2,size-2);

    /* Place chaser far from the path between player and exit.
       Find an open cell that is NOT on the shortest path and is far from player. */
    var pathSet={};
    if(path){
      path.forEach(function(p){pathSet[p.r+','+p.c]=true;});
    }

    /* Collect all open cells */
    var openCells=[];
    for(var r=1;r<size-1;r++){
      for(var c=1;c<size-1;c++){
        if(state.maze[r][c]===0 && !(r===1&&c===1) && !(r===size-2&&c===size-2)){
          openCells.push({r:r,c:c});
        }
      }
    }

    /* Prefer cells NOT on the shortest path, and far from player start */
    var offPath=openCells.filter(function(cell){return !pathSet[cell.r+','+cell.c];});
    var candidates=offPath.length>3?offPath:openCells;

    /* Sort by distance from player (descending), pick from the far ones */
    candidates.sort(function(a,b){
      var da=Math.abs(a.r-1)+Math.abs(a.c-1);
      var db=Math.abs(b.r-1)+Math.abs(b.c-1);
      return db-da;
    });

    /* Pick a chaser position from the farthest quarter that isn't the exit */
    var chosen=null;
    for(var i=0;i<candidates.length;i++){
      var cc=candidates[i];
      if(cc.r===state.exit.r&&cc.c===state.exit.c)continue;
      /* Make sure chaser isn't directly adjacent to exit (give player a chance) */
      var distToExit=Math.abs(cc.r-state.exit.r)+Math.abs(cc.c-state.exit.c);
      if(distToExit>=3){chosen=cc;break;}
    }
    if(!chosen)chosen=candidates[0]||{r:size-2,c:1};

    state.chaser={r:chosen.r,c:chosen.c};
    state.maze[state.chaser.r][state.chaser.c]=0;
    state.chaserTimer=0;
  }

  function generateMaze(rows,cols){
    var m=[];for(var r=0;r<rows;r++){m.push([]);for(var c=0;c<cols;c++)m[r].push(1);}
    function carve(r,c){
      m[r][c]=0;
      var dirs=[[0,2],[0,-2],[2,0],[-2,0]];
      shuffle(dirs);
      dirs.forEach(function(d){
        var nr=r+d[0],nc=c+d[1];
        if(nr>0&&nr<rows-1&&nc>0&&nc<cols-1&&m[nr][nc]===1){
          m[r+d[0]/2][c+d[1]/2]=0;
          carve(nr,nc);
        }
      });
    }
    carve(1,1);
    return m;
  }

  function shuffle(a){for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}}

  /* BFS from (sr,sc) to (er,ec), returns array of {r,c} or null */
  function bfs(sr,sc,er,ec){
    var visited=[];
    for(var r=0;r<state.rows;r++){visited.push(new Array(state.cols).fill(false));}
    var queue=[{r:sr,c:sc,path:[{r:sr,c:sc}]}];
    visited[sr][sc]=true;
    var dirs=[[0,1],[0,-1],[1,0],[-1,0]];
    while(queue.length>0){
      var cur=queue.shift();
      if(cur.r===er&&cur.c===ec)return cur.path;
      for(var d=0;d<4;d++){
        var nr=cur.r+dirs[d][0],nc=cur.c+dirs[d][1];
        if(nr>=0&&nr<state.rows&&nc>=0&&nc<state.cols&&!visited[nr][nc]&&state.maze[nr][nc]===0){
          visited[nr][nc]=true;
          queue.push({r:nr,c:nc,path:cur.path.concat([{r:nr,c:nc}])});
        }
      }
    }
    return null;
  }

  function tryMove(dc,dr){
    var nr=state.player.r+dr,nc=state.player.c+dc;
    if(nr>=0&&nr<state.rows&&nc>=0&&nc<state.cols&&state.maze[nr][nc]===0){
      state.player.r=nr;state.player.c=nc;
      if(shared.beep)shared.beep(550,0.04,'square',0.02);
      if(nr===state.exit.r&&nc===state.exit.c){
        nextLevel();
      }
    }
  }

  function nextLevel(){
    state.level++;
    if(state.level>8){
      state.totalTime=Date.now()-state.startTime;
      state.gameOver=true;state.won=true;
      draw();
      shared.highScores.maybeSubmit({gameId:id,score:state.totalTime,mode:'time',title:title});
    } else {
      buildLevel();
    }
  }

  function moveChaser(){
    state.chaserTimer++;
    /* Chaser moves slower on early levels, faster on later ones */
    var chaserDelay=Math.max(6, 18-state.level*2);
    if(state.chaserTimer<chaserDelay)return;
    state.chaserTimer=0;
    var cr=state.chaser.r,cc=state.chaser.c;
    var pr=state.player.r,pc=state.player.c;
    /* BFS toward player */
    var visited=[];for(var r=0;r<state.rows;r++){visited.push(new Array(state.cols).fill(false));}
    var queue=[{r:cr,c:cc,path:[]}];visited[cr][cc]=true;
    var dirs=[[0,1],[0,-1],[1,0],[-1,0]];
    var found=null;
    while(queue.length>0&&!found){
      var cur=queue.shift();
      for(var d=0;d<4;d++){
        var nr=cur.r+dirs[d][0],nc=cur.c+dirs[d][1];
        if(nr>=0&&nr<state.rows&&nc>=0&&nc<state.cols&&!visited[nr][nc]&&state.maze[nr][nc]===0){
          visited[nr][nc]=true;
          var np=cur.path.concat([{r:nr,c:nc}]);
          if(nr===pr&&nc===pc){found=np;break;}
          queue.push({r:nr,c:nc,path:np});
        }
      }
    }
    if(found&&found.length>0){
      state.chaser.r=found[0].r;state.chaser.c=found[0].c;
    }
    if(state.chaser.r===state.player.r&&state.chaser.c===state.player.c){
      state.totalTime=Date.now()-state.startTime;
      state.gameOver=true;state.won=false;
      draw();
      shared.highScores.maybeSubmit({gameId:id,score:state.totalTime,mode:'time',title:title});
    }
  }

  function loop(){
    if(!state.gameOver){
      moveChaser();
    }
    draw();
    if(!state.gameOver)raf=requestAnimationFrame(loop);
  }

  function draw(){
    ctx.fillStyle='#0a0a1a';ctx.fillRect(0,0,canvas.width,canvas.height);
    for(var r=0;r<state.rows;r++)for(var c=0;c<state.cols;c++){
      if(state.maze[r][c]===1){ctx.fillStyle='#334';ctx.fillRect(c*CELL,r*CELL,CELL,CELL);}
    }
    /* Exit */
    ctx.fillStyle='#0f0';ctx.fillRect(state.exit.c*CELL+4,state.exit.r*CELL+4,CELL-8,CELL-8);
    ctx.fillStyle='#0a0';ctx.font='10px monospace';ctx.textAlign='center';
    ctx.fillText('EXIT',state.exit.c*CELL+CELL/2,state.exit.r*CELL+CELL/2+3);ctx.textAlign='left';
    /* Chaser */
    ctx.fillStyle='#f00';
    ctx.beginPath();ctx.arc(state.chaser.c*CELL+CELL/2,state.chaser.r*CELL+CELL/2,CELL/2-3,0,Math.PI*2);ctx.fill();
    /* Player */
    ctx.fillStyle='#0ff';
    ctx.fillRect(state.player.c*CELL+3,state.player.r*CELL+3,CELL-6,CELL-6);
    /* HUD */
    ctx.fillStyle='#0ff';ctx.font='12px monospace';
    ctx.fillText('Lvl:'+state.level+' Time:'+ArcadeUtils.formatTime(Date.now()-state.startTime),4,canvas.height-4);

    if(state.gameOver){
      ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.textAlign='center';
      ctx.fillStyle=state.won?'#0f0':'#f00';ctx.font='22px monospace';
      ctx.fillText(state.won?'MAZE CLEARED!':'CAUGHT!',canvas.width/2,canvas.height/2-20);
      ctx.fillStyle='#ff0';ctx.font='16px monospace';
      ctx.fillText('Time: '+ArcadeUtils.formatTime(state.totalTime),canvas.width/2,canvas.height/2+10);
      ctx.fillStyle='#ccc';ctx.font='12px monospace';
      ctx.fillText('Press R to restart',canvas.width/2,canvas.height/2+40);
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
      getState:function(){return{level:state.level,gameOver:state.gameOver,won:state.won};},
      completeLevel:function(){nextLevel();},
      forceWin:function(){state.level=8;nextLevel();},
      setDeterministicSeed:function(){}
    };
  }

  return {id:id,title:title,description:description,genreTag:genreTag,controls:controls,
    hasLevels:hasLevels,scoreMode:scoreMode,init:init,destroy:destroy,getTestHooks:getTestHooks};
})();
