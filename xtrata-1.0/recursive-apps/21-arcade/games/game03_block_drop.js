/* Game 03: Block Drop - Falling block puzzler */
var Game03 = (function(){
  var id='block_drop',title='Block Drop',description='Falling block puzzler. Clear lines to score!',
      genreTag='Puzzle',controls='Arrows: Move/Rotate, Down: Fast, R: Restart',
      hasLevels=true,scoreMode='score';
  var canvas,ctx,container,shared,raf,listeners=[],intervals=[];
  var COLS=10,ROWS=20,CELL=24,state;
  var SHAPES=[
    [[1,1,1,1]],
    [[1,1],[1,1]],
    [[0,1,0],[1,1,1]],
    [[1,0,0],[1,1,1]],
    [[0,0,1],[1,1,1]],
    [[1,1,0],[0,1,1]],
    [[0,1,1],[1,1,0]]
  ];
  var COLORS=['#0ff','#ff0','#a0f','#f80','#08f','#0f0','#f44'];

  function init(cont,sh){
    container=cont;shared=sh;
    canvas=document.createElement('canvas');
    canvas.width=COLS*CELL+140;canvas.height=ROWS*CELL;
    container.appendChild(canvas);ctx=canvas.getContext('2d');
    var kd=function(e){
      if(state.gameOver){if(e.key==='r'||e.key==='R')restartGame();return;}
      if(e.key==='ArrowLeft')movePiece(-1,0);
      if(e.key==='ArrowRight')movePiece(1,0);
      if(e.key==='ArrowDown')movePiece(0,1);
      if(e.key==='ArrowUp')rotatePiece();
      if(e.key==='r'||e.key==='R')restartGame();
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(e.key)>=0)e.preventDefault();
    };
    document.addEventListener('keydown',kd);listeners.push(['keydown',kd]);
    startGame();
  }

  function startGame(){
    state={board:makeBoard(),piece:null,px:0,py:0,pcolor:'',pIdx:0,
      score:0,lines:0,level:1,gameOver:false,dropTimer:0,dropInterval:45};
    spawnPiece();
    loop();
  }
  function restartGame(){cancelAnimationFrame(raf);intervals.forEach(function(i){clearInterval(i);});intervals=[];startGame();}

  function makeBoard(){var b=[];for(var r=0;r<ROWS;r++){b.push(new Array(COLS).fill(0));}return b;}

  function spawnPiece(){
    var idx=Math.floor(Math.random()*SHAPES.length);
    state.piece=SHAPES[idx].map(function(r){return r.slice();});
    state.pIdx=idx;state.pcolor=COLORS[idx];
    state.px=Math.floor((COLS-state.piece[0].length)/2);state.py=0;
    if(!fits(state.piece,state.px,state.py)){state.gameOver=true;}
  }

  function fits(piece,px,py){
    for(var r=0;r<piece.length;r++)for(var c=0;c<piece[r].length;c++){
      if(piece[r][c]){
        var nx=px+c,ny=py+r;
        if(nx<0||nx>=COLS||ny>=ROWS)return false;
        if(ny>=0&&state.board[ny][nx])return false;
      }
    }
    return true;
  }

  function movePiece(dx,dy){
    if(fits(state.piece,state.px+dx,state.py+dy)){state.px+=dx;state.py+=dy;return true;}
    return false;
  }

  function rotatePiece(){
    var p=state.piece,rows=p.length,cols=p[0].length;
    var rot=[];for(var c=0;c<cols;c++){rot.push([]);for(var r=rows-1;r>=0;r--)rot[c].push(p[r][c]);}
    if(fits(rot,state.px,state.py))state.piece=rot;
  }

  function lockPiece(){
    for(var r=0;r<state.piece.length;r++)for(var c=0;c<state.piece[r].length;c++){
      if(state.piece[r][c]){
        var ny=state.py+r;if(ny<0)continue;
        state.board[ny][state.px+c]=state.pcolor;
      }
    }
    clearLines();
    spawnPiece();
  }

  function clearLines(){
    var cleared=0;
    for(var r=ROWS-1;r>=0;r--){
      if(state.board[r].every(function(c){return c!==0;})){
        state.board.splice(r,1);
        state.board.unshift(new Array(COLS).fill(0));
        cleared++;r++;
      }
    }
    if(cleared>0){
      state.lines+=cleared;
      state.score+=cleared*cleared*100*state.level;
      state.level=Math.floor(state.lines/10)+1;
      state.dropInterval=Math.max(5,45-state.level*4);
      if(shared.beep)shared.beep(660,0.1,'square',0.04);
    }
  }

  function loop(){
    state.dropTimer++;
    if(state.dropTimer>=state.dropInterval){
      state.dropTimer=0;
      if(!movePiece(0,1))lockPiece();
    }
    draw();
    if(!state.gameOver)raf=requestAnimationFrame(loop);
    else{
      draw();
      shared.highScores.maybeSubmit({gameId:id,score:state.score,mode:'score',title:title});
    }
  }

  function draw(){
    ctx.fillStyle='#0a0a1a';ctx.fillRect(0,0,canvas.width,canvas.height);
    /* Board */
    for(var r=0;r<ROWS;r++)for(var c=0;c<COLS;c++){
      ctx.strokeStyle='#1a1a2e';ctx.strokeRect(c*CELL,r*CELL,CELL,CELL);
      if(state.board[r][c]){ctx.fillStyle=state.board[r][c];ctx.fillRect(c*CELL+1,r*CELL+1,CELL-2,CELL-2);}
    }
    /* Current piece */
    if(state.piece&&!state.gameOver){
      ctx.fillStyle=state.pcolor;
      for(var r=0;r<state.piece.length;r++)for(var c=0;c<state.piece[r].length;c++){
        if(state.piece[r][c])ctx.fillRect((state.px+c)*CELL+1,(state.py+r)*CELL+1,CELL-2,CELL-2);
      }
    }
    /* Side panel */
    var sx=COLS*CELL+10;
    ctx.fillStyle='#0ff';ctx.font='14px monospace';
    ctx.fillText('Score',sx,30);ctx.fillText(state.score,sx,48);
    ctx.fillText('Lines',sx,80);ctx.fillText(state.lines,sx,98);
    ctx.fillText('Level',sx,130);ctx.fillText(state.level,sx,148);

    if(state.gameOver){
      ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,COLS*CELL,ROWS*CELL);
      ctx.fillStyle='#f00';ctx.font='22px monospace';ctx.textAlign='center';
      ctx.fillText('GAME OVER',COLS*CELL/2,ROWS*CELL/2-20);
      ctx.fillStyle='#ff0';ctx.font='16px monospace';
      ctx.fillText('Score: '+state.score,COLS*CELL/2,ROWS*CELL/2+10);
      ctx.fillStyle='#ccc';ctx.font='12px monospace';
      ctx.fillText('Press R to restart',COLS*CELL/2,ROWS*CELL/2+40);
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
      getState:function(){return{level:state.level,score:state.score,lines:state.lines,gameOver:state.gameOver};},
      completeLevel:function(){
        state.lines+=10;state.score+=1000;state.level=Math.floor(state.lines/10)+1;
        state.dropInterval=Math.max(5,45-state.level*4);
      },
      forceWin:function(){state.score=99999;state.gameOver=true;draw();}
    };
  }

  return {id:id,title:title,description:description,genreTag:genreTag,controls:controls,
    hasLevels:hasLevels,scoreMode:scoreMode,init:init,destroy:destroy,getTestHooks:getTestHooks};
})();
