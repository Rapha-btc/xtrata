/* Game 05: Paddle Punk - Pong/Breakout hybrid */
var Game05 = (function(){
  var id='paddle_punk',title='Paddle Punk',description='Break all the bricks! Progressive stages.',
      genreTag='Breakout',controls='Arrows/Mouse: Move paddle, Space: Launch, R: Restart',
      hasLevels=true,scoreMode='score';
  var canvas,ctx,container,shared,raf,listeners=[],intervals=[];
  var W=480,H=400,state;

  function init(cont,sh){
    container=cont;shared=sh;
    canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
    container.appendChild(canvas);ctx=canvas.getContext('2d');
    var kd=function(e){
      if(e.key==='ArrowLeft')state.moveLeft=true;
      if(e.key==='ArrowRight')state.moveRight=true;
      if(e.key===' '&&state.ballStuck){launchBall();e.preventDefault();}
      if(e.key==='r'||e.key==='R')restartGame();
      if(['ArrowLeft','ArrowRight'].indexOf(e.key)>=0)e.preventDefault();
    };
    var ku=function(e){
      if(e.key==='ArrowLeft')state.moveLeft=false;
      if(e.key==='ArrowRight')state.moveRight=false;
    };
    var mm=function(e){
      var rect=canvas.getBoundingClientRect();
      state.paddle.x=e.clientX-rect.left-state.paddle.w/2;
    };
    document.addEventListener('keydown',kd);listeners.push(['keydown',kd]);
    document.addEventListener('keyup',ku);listeners.push(['keyup',ku]);
    canvas.addEventListener('mousemove',mm);listeners.push(['mousemove',mm,canvas]);
    startGame();
  }

  function startGame(){
    state={paddle:{x:W/2-40,y:H-30,w:80,h:12},
      ball:{x:W/2,y:H-42,r:6,vx:3,vy:-3},
      bricks:[],score:0,level:1,lives:3,
      ballStuck:true,moveLeft:false,moveRight:false,gameOver:false};
    buildBricks();
    loop();
  }
  function restartGame(){cancelAnimationFrame(raf);startGame();}

  function buildBricks(){
    state.bricks=[];
    var rows=3+state.level;if(rows>7)rows=7;
    var cols=8;var bw=W/cols-4;
    var colors=['#f44','#fa0','#ff0','#0f0','#0af','#a0f','#f0a'];
    for(var r=0;r<rows;r++)for(var c=0;c<cols;c++){
      state.bricks.push({x:c*(bw+4)+2,y:40+r*22,w:bw,h:18,color:colors[r%colors.length],hp:r<2&&state.level>2?2:1});
    }
  }

  function launchBall(){state.ballStuck=false;state.ball.vx=3*(Math.random()>0.5?1:-1);state.ball.vy=-4;}

  function loop(){
    update();draw();
    if(!state.gameOver)raf=requestAnimationFrame(loop);
  }

  function update(){
    var p=state.paddle,b=state.ball;
    if(state.moveLeft)p.x-=6;
    if(state.moveRight)p.x+=6;
    p.x=ArcadeUtils.clamp(p.x,0,W-p.w);

    if(state.ballStuck){b.x=p.x+p.w/2;b.y=p.y-b.r;return;}

    b.x+=b.vx;b.y+=b.vy;
    if(b.x-b.r<0){b.x=b.r;b.vx*=-1;}
    if(b.x+b.r>W){b.x=W-b.r;b.vx*=-1;}
    if(b.y-b.r<0){b.y=b.r;b.vy*=-1;}

    /* Paddle collision */
    if(b.vy>0&&b.y+b.r>=p.y&&b.y+b.r<=p.y+p.h&&b.x>=p.x&&b.x<=p.x+p.w){
      b.vy*=-1;b.y=p.y-b.r;
      b.vx=((b.x-(p.x+p.w/2))/(p.w/2))*5;
      if(shared.beep)shared.beep(440,0.05,'square',0.03);
    }

    /* Brick collision */
    for(var i=state.bricks.length-1;i>=0;i--){
      var br=state.bricks[i];
      if(b.x+b.r>br.x&&b.x-b.r<br.x+br.w&&b.y+b.r>br.y&&b.y-b.r<br.y+br.h){
        b.vy*=-1;
        br.hp--;
        if(br.hp<=0){
          state.bricks.splice(i,1);
          state.score+=10*state.level;
          if(shared.beep)shared.beep(660,0.06,'square',0.03);
        }
        break;
      }
    }

    /* Ball lost */
    if(b.y>H+20){
      state.lives--;
      if(state.lives<=0){endGame();}
      else{state.ballStuck=true;b.x=p.x+p.w/2;b.y=p.y-b.r;}
    }

    /* Level clear */
    if(state.bricks.length===0){
      state.level++;
      if(state.level>8){endGame();}
      else{state.ballStuck=true;buildBricks();}
    }
  }

  function endGame(){
    state.gameOver=true;draw();
    shared.highScores.maybeSubmit({gameId:id,score:state.score,mode:'score',title:title});
  }

  function draw(){
    ctx.fillStyle='#0a0a1a';ctx.fillRect(0,0,W,H);
    /* Bricks */
    state.bricks.forEach(function(br){
      ctx.fillStyle=br.hp>1?'#fff':br.color;
      ctx.fillRect(br.x,br.y,br.w,br.h);
      if(br.hp>1){ctx.fillStyle=br.color;ctx.fillRect(br.x+2,br.y+2,br.w-4,br.h-4);}
    });
    /* Paddle */
    ctx.fillStyle='#0ff';ctx.fillRect(state.paddle.x,state.paddle.y,state.paddle.w,state.paddle.h);
    /* Ball */
    ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(state.ball.x,state.ball.y,state.ball.r,0,Math.PI*2);ctx.fill();
    /* HUD */
    ctx.fillStyle='#0ff';ctx.font='13px monospace';
    ctx.fillText('Score:'+state.score+'  Level:'+state.level+'  Lives:'+state.lives,10,16);

    if(state.gameOver){
      ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,W,H);
      ctx.textAlign='center';ctx.fillStyle='#f00';ctx.font='24px monospace';
      ctx.fillText('GAME OVER',W/2,H/2-20);
      ctx.fillStyle='#ff0';ctx.font='16px monospace';
      ctx.fillText('Score: '+state.score,W/2,H/2+10);
      ctx.fillStyle='#ccc';ctx.font='12px monospace';
      ctx.fillText('Press R to restart',W/2,H/2+40);
      ctx.textAlign='left';
    }
    if(state.ballStuck&&!state.gameOver){
      ctx.fillStyle='#ff0';ctx.font='14px monospace';ctx.textAlign='center';
      ctx.fillText('Press SPACE to launch',W/2,H/2);ctx.textAlign='left';
    }
  }

  function destroy(){
    cancelAnimationFrame(raf);
    intervals.forEach(function(i){clearInterval(i);});intervals=[];
    listeners.forEach(function(l){
      var t=l[2]||document;t.removeEventListener(l[0],l[1]);
    });listeners=[];
    if(container)container.innerHTML='';
  }

  function getTestHooks(){
    return {
      getState:function(){return{level:state.level,score:state.score,gameOver:state.gameOver,lives:state.lives,bricksLeft:state.bricks.length};},
      completeLevel:function(){state.bricks=[];state.level++;if(state.level>8){endGame();}else{state.ballStuck=true;buildBricks();}},
      forceWin:function(){state.level=8;state.bricks=[];},
      setDeterministicSeed:function(){}
    };
  }

  return {id:id,title:title,description:description,genreTag:genreTag,controls:controls,
    hasLevels:hasLevels,scoreMode:scoreMode,init:init,destroy:destroy,getTestHooks:getTestHooks};
})();
