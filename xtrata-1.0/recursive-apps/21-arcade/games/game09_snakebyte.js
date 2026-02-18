/* Game 09: Snakebyte - Snake variant with obstacles */
var Game09 = (function(){
  var id='snakebyte',title='Snakebyte',description='Classic snake with obstacles. Eat to grow!',
      genreTag='Snake',controls='Arrows: Direction, R: Restart',
      hasLevels=false,scoreMode='score';
  var canvas,ctx,container,shared,raf,listeners=[],intervals=[];
  var CELL=16,COLS=25,ROWS=25,W,H,state;

  function init(cont,sh){
    container=cont;shared=sh;
    W=COLS*CELL;H=ROWS*CELL;
    canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
    container.appendChild(canvas);ctx=canvas.getContext('2d');
    var kd=function(e){
      if(e.key==='ArrowUp'&&state.dir.y!==1)state.nextDir={x:0,y:-1};
      if(e.key==='ArrowDown'&&state.dir.y!==-1)state.nextDir={x:0,y:1};
      if(e.key==='ArrowLeft'&&state.dir.x!==1)state.nextDir={x:-1,y:0};
      if(e.key==='ArrowRight'&&state.dir.x!==-1)state.nextDir={x:1,y:0};
      if(e.key==='r'||e.key==='R')restartGame();
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(e.key)>=0)e.preventDefault();
    };
    document.addEventListener('keydown',kd);listeners.push(['keydown',kd]);
    startGame();
  }

  function startGame(){
    state={snake:[{x:12,y:12},{x:11,y:12},{x:10,y:12}],
      dir:{x:1,y:0},nextDir:{x:1,y:0},
      food:null,obstacles:[],score:0,gameOver:false,moveTimer:0,moveInterval:8};
    placeObstacles();placeFood();loop();
  }
  function restartGame(){cancelAnimationFrame(raf);intervals.forEach(function(i){clearInterval(i);});intervals=[];startGame();}

  function placeObstacles(){
    state.obstacles=[];
    for(var i=0;i<15;i++){
      var ox=ArcadeUtils.randInt(2,COLS-3),oy=ArcadeUtils.randInt(2,ROWS-3);
      if(Math.abs(ox-12)<3&&Math.abs(oy-12)<3)continue;
      state.obstacles.push({x:ox,y:oy});
    }
  }

  function placeFood(){
    var tries=0;
    while(tries<200){
      var fx=ArcadeUtils.randInt(1,COLS-2),fy=ArcadeUtils.randInt(1,ROWS-2);
      var ok=true;
      state.snake.forEach(function(s){if(s.x===fx&&s.y===fy)ok=false;});
      state.obstacles.forEach(function(o){if(o.x===fx&&o.y===fy)ok=false;});
      if(ok){state.food={x:fx,y:fy};return;}
      tries++;
    }
    state.food={x:5,y:5};
  }

  function loop(){
    state.moveTimer++;
    if(state.moveTimer>=state.moveInterval){
      state.moveTimer=0;
      state.dir=state.nextDir;
      moveSnake();
    }
    draw();
    if(!state.gameOver)raf=requestAnimationFrame(loop);
  }

  function moveSnake(){
    var head={x:state.snake[0].x+state.dir.x,y:state.snake[0].y+state.dir.y};
    /* Walls */
    if(head.x<0||head.x>=COLS||head.y<0||head.y>=ROWS){endGame();return;}
    /* Self */
    for(var i=0;i<state.snake.length;i++){if(state.snake[i].x===head.x&&state.snake[i].y===head.y){endGame();return;}}
    /* Obstacles */
    for(var i=0;i<state.obstacles.length;i++){if(state.obstacles[i].x===head.x&&state.obstacles[i].y===head.y){endGame();return;}}

    state.snake.unshift(head);
    if(state.food&&head.x===state.food.x&&head.y===state.food.y){
      state.score+=10;
      if(state.moveInterval>3)state.moveInterval-=0.3;
      placeFood();
      if(shared.beep)shared.beep(660,0.06,'square',0.03);
    } else {
      state.snake.pop();
    }
  }

  function endGame(){state.gameOver=true;draw();
    shared.highScores.maybeSubmit({gameId:id,score:state.score,mode:'score',title:title});}

  function draw(){
    ctx.fillStyle='#0a0a1a';ctx.fillRect(0,0,W,H);
    /* Grid */
    ctx.strokeStyle='#111';
    for(var r=0;r<ROWS;r++)for(var c=0;c<COLS;c++)ctx.strokeRect(c*CELL,r*CELL,CELL,CELL);
    /* Obstacles */
    ctx.fillStyle='#555';
    state.obstacles.forEach(function(o){ctx.fillRect(o.x*CELL+1,o.y*CELL+1,CELL-2,CELL-2);});
    /* Food */
    if(state.food){ctx.fillStyle='#f00';ctx.fillRect(state.food.x*CELL+2,state.food.y*CELL+2,CELL-4,CELL-4);}
    /* Snake */
    state.snake.forEach(function(s,i){
      ctx.fillStyle=i===0?'#0f0':'#0a0';
      ctx.fillRect(s.x*CELL+1,s.y*CELL+1,CELL-2,CELL-2);
    });
    /* HUD */
    ctx.fillStyle='#0ff';ctx.font='13px monospace';
    ctx.fillText('Score: '+state.score+'  Length: '+state.snake.length,4,H-4);

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
      getState:function(){return{score:state.score,gameOver:state.gameOver,length:state.snake.length};},
      forceWin:function(){state.score=5000;endGame();},
      setDeterministicSeed:function(){}
    };
  }

  return {id:id,title:title,description:description,genreTag:genreTag,controls:controls,
    hasLevels:hasLevels,scoreMode:scoreMode,init:init,destroy:destroy,getTestHooks:getTestHooks};
})();
