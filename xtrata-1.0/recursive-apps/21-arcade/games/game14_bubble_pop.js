/* Game 14: Bubble Pop - Aim and pop matching bubbles */
var Game14 = (function(){
  var id='bubble_pop',title='Bubble Pop',description='Aim and shoot to match 3+ bubbles!',
      genreTag='Puzzle Shooter',controls='Left/Right: Aim, Space: Shoot, R: Restart',
      hasLevels=false,scoreMode='score';
  var canvas,ctx,container,shared,raf,listeners=[],intervals=[];
  var W=360,H=480,R=16,COLS=11,state;
  var BCOLORS=['#f44','#4a4','#44f','#ff0','#f8f','#fa0'];

  function init(cont,sh){
    container=cont;shared=sh;
    canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
    container.appendChild(canvas);ctx=canvas.getContext('2d');
    var keys={};
    var kd=function(e){keys[e.key]=true;
      if(e.key===' '&&!state.shooting)shoot();
      if(e.key==='r'||e.key==='R')restartGame();
      if(['ArrowLeft','ArrowRight',' '].indexOf(e.key)>=0)e.preventDefault();};
    var ku=function(e){keys[e.key]=false;};
    document.addEventListener('keydown',kd);listeners.push(['keydown',kd]);
    document.addEventListener('keyup',ku);listeners.push(['keyup',ku]);
    state={keys:keys};startGame();
  }

  function startGame(){
    var k=state.keys;
    state={keys:k,grid:[],angle:Math.PI/2,shooting:false,
      bullet:null,nextColor:0,score:0,gameOver:false,rowOffset:0};
    /* Fill initial rows */
    for(var r=0;r<5;r++){
      var row=[];
      var cols=r%2===0?COLS:COLS-1;
      for(var c=0;c<cols;c++){
        row.push({color:Math.floor(Math.random()*4)});
      }
      state.grid.push(row);
    }
    state.nextColor=Math.floor(Math.random()*4);
    loop();
  }
  function restartGame(){cancelAnimationFrame(raf);startGame();}

  function bubbleX(row,col){
    var offset=(row%2===0)?0:R;
    return R+col*R*2+offset;
  }
  function bubbleY(row){return R+row*R*1.7+state.rowOffset;}

  function shoot(){
    state.shooting=true;
    var speed=8;
    state.bullet={x:W/2,y:H-40,vx:Math.cos(state.angle)*speed,vy:-Math.sin(state.angle)*speed,
      color:state.nextColor};
    state.nextColor=Math.floor(Math.random()*4);
  }

  function loop(){
    update();draw();
    if(!state.gameOver)raf=requestAnimationFrame(loop);
  }

  function update(){
    var k=state.keys;
    if(k['ArrowLeft'])state.angle=Math.min(state.angle+0.03,Math.PI-0.1);
    if(k['ArrowRight'])state.angle=Math.max(state.angle-0.03,0.1);

    if(state.shooting&&state.bullet){
      var b=state.bullet;
      b.x+=b.vx;b.y+=b.vy;
      /* Wall bounce */
      if(b.x<R){b.x=R;b.vx*=-1;}
      if(b.x>W-R){b.x=W-R;b.vx*=-1;}
      /* Check collision with grid */
      var landed=false;
      if(b.y<=R){landed=true;}
      for(var r=0;r<state.grid.length&&!landed;r++){
        for(var c=0;c<state.grid[r].length;c++){
          if(!state.grid[r][c])continue;
          var bx=bubbleX(r,c),by=bubbleY(r);
          if(ArcadeUtils.dist(b.x,b.y,bx,by)<R*1.8){landed=true;break;}
        }
      }
      if(landed){
        /* Find closest grid position */
        var bestR=state.grid.length,bestC=0,bestDist=Infinity;
        for(var r=0;r<=state.grid.length;r++){
          var cols=r%2===0?COLS:COLS-1;
          for(var c=0;c<cols;c++){
            var bx=bubbleX(r,c),by=bubbleY(r);
            var d=ArcadeUtils.dist(b.x,b.y,bx,by);
            if(d<bestDist){
              var occupied=state.grid[r]&&state.grid[r][c];
              if(!occupied){bestDist=d;bestR=r;bestC=c;}
            }
          }
        }
        /* Place bubble */
        while(state.grid.length<=bestR){
          state.grid.push([]);
        }
        var cols=bestR%2===0?COLS:COLS-1;
        while(state.grid[bestR].length<cols)state.grid[bestR].push(null);
        state.grid[bestR][bestC]={color:b.color};

        /* Check matches */
        var matches=findMatches(bestR,bestC,b.color);
        if(matches.length>=3){
          matches.forEach(function(m){state.grid[m.r][m.c]=null;});
          state.score+=matches.length*10;
          if(shared.beep)shared.beep(660,0.1,'sine',0.04);
        }
        state.shooting=false;state.bullet=null;

        /* Check game over */
        var lastRow=state.grid.length-1;
        while(lastRow>=0&&(!state.grid[lastRow]||state.grid[lastRow].every(function(b){return !b;})))lastRow--;
        if(bubbleY(lastRow)>H-60){endGame();}
      }
    }
  }

  function findMatches(r,c,color){
    var visited={};var matches=[];
    function dfs(rr,cc){
      var key=rr+','+cc;
      if(visited[key])return;
      if(rr<0||rr>=state.grid.length)return;
      if(!state.grid[rr]||cc<0||cc>=state.grid[rr].length)return;
      if(!state.grid[rr][cc]||state.grid[rr][cc].color!==color)return;
      visited[key]=true;
      matches.push({r:rr,c:cc});
      /* Hex neighbors */
      var even=rr%2===0;
      var neighbors=even?
        [[-1,-1],[-1,0],[0,-1],[0,1],[1,-1],[1,0]]:
        [[-1,0],[-1,1],[0,-1],[0,1],[1,0],[1,1]];
      neighbors.forEach(function(n){dfs(rr+n[0],cc+n[1]);});
    }
    dfs(r,c);
    return matches;
  }

  function endGame(){state.gameOver=true;draw();
    shared.highScores.maybeSubmit({gameId:id,score:state.score,mode:'score',title:title});}

  function draw(){
    ctx.fillStyle='#0a0a1a';ctx.fillRect(0,0,W,H);
    /* Grid bubbles */
    for(var r=0;r<state.grid.length;r++){
      for(var c=0;c<state.grid[r].length;c++){
        if(!state.grid[r][c])continue;
        var bx=bubbleX(r,c),by=bubbleY(r);
        ctx.fillStyle=BCOLORS[state.grid[r][c].color];
        ctx.beginPath();ctx.arc(bx,by,R-1,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='rgba(255,255,255,0.3)';
        ctx.beginPath();ctx.arc(bx-3,by-3,4,0,Math.PI*2);ctx.fill();
      }
    }
    /* Bullet */
    if(state.bullet){
      ctx.fillStyle=BCOLORS[state.bullet.color];
      ctx.beginPath();ctx.arc(state.bullet.x,state.bullet.y,R-1,0,Math.PI*2);ctx.fill();
    }
    /* Aimer */
    if(!state.shooting){
      ctx.strokeStyle='#0ff';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(W/2,H-40);
      ctx.lineTo(W/2+Math.cos(state.angle)*60,H-40-Math.sin(state.angle)*60);ctx.stroke();
      /* Next bubble */
      ctx.fillStyle=BCOLORS[state.nextColor];
      ctx.beginPath();ctx.arc(W/2,H-40,R-1,0,Math.PI*2);ctx.fill();
    }
    /* HUD */
    ctx.fillStyle='#0ff';ctx.font='13px monospace';ctx.fillText('Score: '+state.score,10,H-8);

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
      getState:function(){return{score:state.score,gameOver:state.gameOver};},
      forceWin:function(){state.score=5000;endGame();},
      setDeterministicSeed:function(){}
    };
  }

  return {id:id,title:title,description:description,genreTag:genreTag,controls:controls,
    hasLevels:hasLevels,scoreMode:scoreMode,init:init,destroy:destroy,getTestHooks:getTestHooks};
})();
