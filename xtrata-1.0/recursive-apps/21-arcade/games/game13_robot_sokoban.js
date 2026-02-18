/* Game 13: Robot Sokoban - Push-box puzzle with prebuilt levels */
var Game13 = (function(){
  var id='robot_sokoban',title='Robot Sokoban',description='Push boxes onto targets. Think before you move!',
      genreTag='Puzzle',controls='Arrows: Move, R: Restart level, Z: Undo',
      hasLevels=true,scoreMode='score';
  var canvas,ctx,container,shared,raf,listeners=[],intervals=[];
  var CELL=36,state;

  /* Prebuilt solvable levels: #=wall, .=target, $=box, @=player, *=box on target, +=player on target */
  var LEVELS=[
    ['#####','#   #','# $ #','# .@#','#####'],
    ['######','#    #','# $$ #','# .. #','#  @ #','######'],
    ['#######','#     #','# .$. #','# $.$ #','# .$. #','#  @  #','#######'],
    ['########','#      #','# $.@. #','#  $$  #','# .  . #','########'],
    ['########','#  #   #','# $  $ #','#.# @#.#','# $  $ #','#  #   #','########']
  ];

  function init(cont,sh){
    container=cont;shared=sh;
    canvas=document.createElement('canvas');
    container.appendChild(canvas);ctx=canvas.getContext('2d');
    var kd=function(e){
      if(state.won){if(e.key==='r'||e.key==='R')restartGame();return;}
      if(e.key==='ArrowUp')tryMove(0,-1);
      if(e.key==='ArrowDown')tryMove(0,1);
      if(e.key==='ArrowLeft')tryMove(-1,0);
      if(e.key==='ArrowRight')tryMove(1,0);
      if(e.key==='z'||e.key==='Z')undo();
      if(e.key==='r'||e.key==='R')loadLevel(state.levelIdx);
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(e.key)>=0)e.preventDefault();
    };
    document.addEventListener('keydown',kd);listeners.push(['keydown',kd]);
    startGame();
  }

  function startGame(){
    state={levelIdx:0,moves:0,score:0,gameOver:false,won:false,
      grid:null,player:null,targets:[],history:[]};
    loadLevel(0);
  }
  function restartGame(){startGame();}

  function loadLevel(idx){
    if(idx>=LEVELS.length){state.gameOver=true;state.won=true;draw();
      shared.highScores.maybeSubmit({gameId:id,score:state.score,mode:'score',title:title});return;}
    state.levelIdx=idx;state.moves=0;state.history=[];
    var lvl=LEVELS[idx];
    var rows=lvl.length,cols=0;
    lvl.forEach(function(r){if(r.length>cols)cols=r.length;});
    state.grid=[];state.targets=[];
    canvas.width=cols*CELL;canvas.height=rows*CELL+30;
    for(var r=0;r<rows;r++){
      state.grid.push([]);
      for(var c=0;c<cols;c++){
        var ch=r<lvl.length&&c<lvl[r].length?lvl[r][c]:' ';
        if(ch==='#')state.grid[r].push('wall');
        else if(ch==='$'){state.grid[r].push('box');}
        else if(ch==='.'){state.grid[r].push('empty');state.targets.push({r:r,c:c});}
        else if(ch==='@'){state.grid[r].push('empty');state.player={r:r,c:c};}
        else if(ch==='*'){state.grid[r].push('box');state.targets.push({r:r,c:c});}
        else if(ch==='+'){state.grid[r].push('empty');state.player={r:r,c:c};state.targets.push({r:r,c:c});}
        else state.grid[r].push('empty');
      }
    }
    draw();
  }

  function tryMove(dx,dy){
    var pr=state.player.r+dy,pc=state.player.c+dx;
    if(pr<0||pr>=state.grid.length||pc<0||pc>=state.grid[0].length)return;
    if(state.grid[pr][pc]==='wall')return;
    if(state.grid[pr][pc]==='box'){
      var br=pr+dy,bc=pc+dx;
      if(br<0||br>=state.grid.length||bc<0||bc>=state.grid[0].length)return;
      if(state.grid[br][bc]!=='empty')return;
      /* Save state for undo */
      state.history.push({pr:state.player.r,pc:state.player.c,boxFrom:{r:pr,c:pc},boxTo:{r:br,c:bc}});
      state.grid[br][bc]='box';state.grid[pr][pc]='empty';
    } else {
      state.history.push({pr:state.player.r,pc:state.player.c,boxFrom:null,boxTo:null});
    }
    state.player.r=pr;state.player.c=pc;
    state.moves++;
    if(shared.beep)shared.beep(330,0.04,'square',0.02);
    checkWin();draw();
  }

  function undo(){
    if(state.history.length===0)return;
    var h=state.history.pop();
    if(h.boxFrom){
      state.grid[h.boxFrom.r][h.boxFrom.c]='box';
      state.grid[h.boxTo.r][h.boxTo.c]='empty';
    }
    state.player.r=h.pr;state.player.c=h.pc;
    state.moves--;draw();
  }

  function checkWin(){
    var allOnTarget=state.targets.every(function(t){return state.grid[t.r][t.c]==='box';});
    if(allOnTarget){
      state.score+=(200-state.moves*2)*(state.levelIdx+1);
      if(state.score<0)state.score=0;
      if(shared.beep)shared.beep(880,0.2,'sine',0.05);
      setTimeout(function(){loadLevel(state.levelIdx+1);},500);
    }
  }

  function draw(){
    var W=canvas.width,H=canvas.height;
    ctx.fillStyle='#0a0a1a';ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#0ff';ctx.font='12px monospace';
    ctx.fillText('Level:'+(state.levelIdx+1)+'/'+LEVELS.length+'  Moves:'+state.moves+'  Score:'+state.score+'  Z:Undo',4,16);

    var oy=30;
    for(var r=0;r<state.grid.length;r++)for(var c=0;c<state.grid[r].length;c++){
      var x=c*CELL,y=oy+r*CELL;
      if(state.grid[r][c]==='wall'){ctx.fillStyle='#445';ctx.fillRect(x,y,CELL,CELL);}
      else{ctx.fillStyle='#111';ctx.fillRect(x,y,CELL,CELL);}
    }
    /* Targets */
    state.targets.forEach(function(t){
      ctx.fillStyle='#0a0';ctx.beginPath();
      ctx.arc(t.c*CELL+CELL/2,oy+t.r*CELL+CELL/2,6,0,Math.PI*2);ctx.fill();
    });
    /* Boxes */
    for(var r=0;r<state.grid.length;r++)for(var c=0;c<state.grid[r].length;c++){
      if(state.grid[r][c]==='box'){
        var onTarget=state.targets.some(function(t){return t.r===r&&t.c===c;});
        ctx.fillStyle=onTarget?'#0f0':'#fa0';
        ctx.fillRect(c*CELL+4,oy+r*CELL+4,CELL-8,CELL-8);
      }
    }
    /* Player */
    if(state.player){
      ctx.fillStyle='#0ff';
      ctx.beginPath();ctx.arc(state.player.c*CELL+CELL/2,oy+state.player.r*CELL+CELL/2,CELL/2-4,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#066';ctx.fillRect(state.player.c*CELL+CELL/2-4,oy+state.player.r*CELL+CELL/2-6,3,4);
      ctx.fillRect(state.player.c*CELL+CELL/2+1,oy+state.player.r*CELL+CELL/2-6,3,4);
    }

    if(state.gameOver&&state.won){
      ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,W,H);
      ctx.textAlign='center';ctx.fillStyle='#0f0';ctx.font='22px monospace';
      ctx.fillText('ALL LEVELS CLEAR!',W/2,H/2-20);
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
      getState:function(){return{level:state.levelIdx+1,score:state.score,gameOver:state.gameOver,won:state.won,moves:state.moves};},
      completeLevel:function(){
        state.score+=100;loadLevel(state.levelIdx+1);
      },
      forceWin:function(){state.score=2000;state.levelIdx=LEVELS.length-1;
        state.score+=100;loadLevel(state.levelIdx+1);},
      setDeterministicSeed:function(){}
    };
  }

  return {id:id,title:title,description:description,genreTag:genreTag,controls:controls,
    hasLevels:hasLevels,scoreMode:scoreMode,init:init,destroy:destroy,getTestHooks:getTestHooks};
})();
