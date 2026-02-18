/* Game 21: Boss Rush Mini - Dodge patterns, defeat 3 bosses */
var Game21 = (function(){
  var id='boss_rush_mini',title='Boss Rush Mini',description='Dodge boss attacks and strike back! 3 bosses await.',
      genreTag='Boss Rush',controls='Arrows: Move, Space: Shoot, R: Restart',
      hasLevels=true,scoreMode='score';
  var canvas,ctx,container,shared,raf,listeners=[],intervals=[];
  var W=480,H=500,state;

  function init(cont,sh){
    container=cont;shared=sh;
    canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
    container.appendChild(canvas);ctx=canvas.getContext('2d');
    var keys={};
    var kd=function(e){keys[e.key]=true;if(e.key==='r'||e.key==='R')restartGame();
      if([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(e.key)>=0)e.preventDefault();};
    var ku=function(e){keys[e.key]=false;};
    document.addEventListener('keydown',kd);listeners.push(['keydown',kd]);
    document.addEventListener('keyup',ku);listeners.push(['keyup',ku]);
    state={keys:keys};startGame();
  }

  function startGame(){
    var k=state.keys;
    state={keys:k,player:{x:W/2-10,y:H-50,w:20,h:20,speed:4},
      bullets:[],bossBullets:[],particles:[],
      boss:null,bossIdx:0,score:0,lives:3,gameOver:false,won:false,
      shootCool:0,tick:0,phase:'intro',introTimer:60};
    loadBoss(0);loop();
  }
  function restartGame(){cancelAnimationFrame(raf);startGame();}

  var BOSSES=[
    {name:'SENTINEL',hp:30,maxHp:30,w:60,h:40,color:'#f44',speed:2,
     pattern:function(b,tick){
       if(tick%30===0){
         for(var i=0;i<5;i++){
           var a=Math.PI/2+Math.PI/6*(i-2);
           state.bossBullets.push({x:b.x+b.w/2,y:b.y+b.h,vx:Math.cos(a)*2.5,vy:Math.sin(a)*2.5,r:4});
         }
       }
     }},
    {name:'CYCLONE',hp:40,maxHp:40,w:70,h:50,color:'#fa0',speed:3,
     pattern:function(b,tick){
       if(tick%8===0){
         var a=tick*0.15;
         state.bossBullets.push({x:b.x+b.w/2,y:b.y+b.h,vx:Math.cos(a)*3,vy:Math.sin(a)*3+1,r:3});
       }
     }},
    {name:'OVERLORD',hp:50,maxHp:50,w:80,h:60,color:'#f0f',speed:1.5,
     pattern:function(b,tick){
       if(tick%20===0){
         for(var i=0;i<8;i++){
           var a=Math.PI*2/8*i+tick*0.02;
           state.bossBullets.push({x:b.x+b.w/2,y:b.y+b.h/2,vx:Math.cos(a)*2,vy:Math.sin(a)*2,r:4});
         }
       }
       if(tick%60===0){
         /* Aimed shot */
         var dx=state.player.x-b.x,dy=state.player.y-b.y;
         var d=Math.sqrt(dx*dx+dy*dy)||1;
         state.bossBullets.push({x:b.x+b.w/2,y:b.y+b.h,vx:dx/d*4,vy:dy/d*4,r:6});
       }
     }}
  ];

  function loadBoss(idx){
    if(idx>=BOSSES.length){
      state.gameOver=true;state.won=true;draw();
      shared.highScores.maybeSubmit({gameId:id,score:state.score,mode:'score',title:title});return;
    }
    state.bossIdx=idx;
    var bd=BOSSES[idx];
    state.boss={x:W/2-bd.w/2,y:40,w:bd.w,h:bd.h,hp:bd.hp,maxHp:bd.maxHp,
      color:bd.color,speed:bd.speed,dir:1,name:bd.name,pattern:bd.pattern};
    state.bossBullets=[];
    state.phase='intro';state.introTimer=60;state.tick=0;
  }

  function loop(){update();draw();if(!state.gameOver)raf=requestAnimationFrame(loop);}

  function update(){
    if(state.phase==='intro'){state.introTimer--;if(state.introTimer<=0)state.phase='fight';return;}
    state.tick++;
    var p=state.player,k=state.keys,b=state.boss;
    if(k['ArrowLeft'])p.x-=p.speed;
    if(k['ArrowRight'])p.x+=p.speed;
    if(k['ArrowUp'])p.y-=p.speed;
    if(k['ArrowDown'])p.y+=p.speed;
    p.x=ArcadeUtils.clamp(p.x,0,W-p.w);
    p.y=ArcadeUtils.clamp(p.y,H/2,H-p.h);

    state.shootCool--;
    if(k[' ']&&state.shootCool<=0){
      state.shootCool=10;
      state.bullets.push({x:p.x+p.w/2-2,y:p.y,w:4,h:10,dy:-7});
      if(shared.beep)shared.beep(880,0.04,'square',0.02);
    }

    /* Boss movement */
    b.x+=b.dir*b.speed;
    if(b.x<10||b.x+b.w>W-10)b.dir*=-1;

    /* Boss pattern */
    b.pattern(b,state.tick);

    /* Player bullets hit boss */
    for(var i=state.bullets.length-1;i>=0;i--){
      state.bullets[i].y+=state.bullets[i].dy;
      if(state.bullets[i].y<-10){state.bullets.splice(i,1);continue;}
      if(ArcadeUtils.rectsOverlap(state.bullets[i],b)){
        state.bullets.splice(i,1);
        b.hp--;
        state.score+=10;
        if(b.hp<=0){
          addParticles(b.x+b.w/2,b.y+b.h/2,b.color,20);
          state.score+=500*(state.bossIdx+1);
          if(shared.beep)shared.beep(220,0.3,'sawtooth',0.06);
          loadBoss(state.bossIdx+1);
          return;
        }
      }
    }

    /* Boss bullets hit player */
    for(var i=state.bossBullets.length-1;i>=0;i--){
      var bb=state.bossBullets[i];
      bb.x+=bb.vx;bb.y+=bb.vy;
      if(bb.x<-20||bb.x>W+20||bb.y<-20||bb.y>H+20){state.bossBullets.splice(i,1);continue;}
      if(ArcadeUtils.dist(bb.x,bb.y,p.x+p.w/2,p.y+p.h/2)<bb.r+10){
        state.bossBullets.splice(i,1);
        state.lives--;
        addParticles(p.x+p.w/2,p.y+p.h/2,'#0ff',10);
        if(shared.beep)shared.beep(110,0.2,'sawtooth',0.05);
        if(state.lives<=0){
          state.gameOver=true;draw();
          shared.highScores.maybeSubmit({gameId:id,score:state.score,mode:'score',title:title});
          return;
        }
      }
    }

    /* Particles */
    for(var i=state.particles.length-1;i>=0;i--){
      var pt=state.particles[i];pt.x+=pt.vx;pt.y+=pt.vy;pt.life--;
      if(pt.life<=0)state.particles.splice(i,1);
    }
  }

  function addParticles(x,y,color,count){
    for(var i=0;i<count;i++){
      state.particles.push({x:x,y:y,vx:(Math.random()-0.5)*6,vy:(Math.random()-0.5)*6,life:20+Math.random()*15,color:color});
    }
  }

  function draw(){
    ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
    /* Stars */
    ctx.fillStyle='#223';
    for(var i=0;i<40;i++)ctx.fillRect((i*73)%W,(i*47+state.tick)%H,1,1);

    if(state.boss&&!state.gameOver){
      var b=state.boss;
      /* Boss */
      ctx.fillStyle=b.color;ctx.fillRect(b.x,b.y,b.w,b.h);
      ctx.fillStyle='#000';
      ctx.fillRect(b.x+b.w*0.2,b.y+b.h*0.3,b.w*0.2,b.h*0.2);
      ctx.fillRect(b.x+b.w*0.6,b.y+b.h*0.3,b.w*0.2,b.h*0.2);
      /* HP bar */
      ctx.fillStyle='#333';ctx.fillRect(b.x,b.y-10,b.w,6);
      ctx.fillStyle='#0f0';ctx.fillRect(b.x,b.y-10,b.w*(b.hp/b.maxHp),6);
      /* Name */
      ctx.fillStyle=b.color;ctx.font='12px monospace';ctx.textAlign='center';
      ctx.fillText(b.name,b.x+b.w/2,b.y-14);ctx.textAlign='left';
    }

    /* Player */
    var p=state.player;
    ctx.fillStyle='#0ff';
    ctx.beginPath();ctx.moveTo(p.x+p.w/2,p.y);ctx.lineTo(p.x,p.y+p.h);ctx.lineTo(p.x+p.w,p.y+p.h);ctx.closePath();ctx.fill();

    /* Bullets */
    state.bullets.forEach(function(b){ctx.fillStyle='#ff0';ctx.fillRect(b.x,b.y,b.w,b.h);});
    state.bossBullets.forEach(function(b){
      ctx.fillStyle='#f80';ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();
    });
    /* Particles */
    state.particles.forEach(function(pt){
      ctx.globalAlpha=pt.life/35;ctx.fillStyle=pt.color;ctx.fillRect(pt.x,pt.y,3,3);
    });
    ctx.globalAlpha=1;

    /* HUD */
    ctx.fillStyle='#0ff';ctx.font='13px monospace';
    ctx.fillText('Score:'+state.score+'  Lives:'+state.lives+'  Boss:'+(state.bossIdx+1)+'/3',10,H-10);

    if(state.phase==='intro'&&state.boss){
      ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(0,H/2-30,W,60);
      ctx.fillStyle=state.boss.color;ctx.font='24px monospace';ctx.textAlign='center';
      ctx.fillText('BOSS: '+state.boss.name,W/2,H/2+8);ctx.textAlign='left';
    }

    if(state.gameOver){
      ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,W,H);
      ctx.textAlign='center';ctx.fillStyle=state.won?'#0f0':'#f00';ctx.font='24px monospace';
      ctx.fillText(state.won?'ALL BOSSES DEFEATED!':'GAME OVER',W/2,H/2-20);
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
      getState:function(){return{level:state.bossIdx+1,score:state.score,gameOver:state.gameOver,won:state.won,lives:state.lives};},
      completeLevel:function(){
        if(state.boss)state.boss.hp=0;
        state.score+=500;
        loadBoss(state.bossIdx+1);
      },
      forceWin:function(){state.bossIdx=BOSSES.length-1;state.score+=1500;loadBoss(state.bossIdx+1);},
      setDeterministicSeed:function(){}
    };
  }

  return {id:id,title:title,description:description,genreTag:genreTag,controls:controls,
    hasLevels:hasLevels,scoreMode:scoreMode,init:init,destroy:destroy,getTestHooks:getTestHooks};
})();
