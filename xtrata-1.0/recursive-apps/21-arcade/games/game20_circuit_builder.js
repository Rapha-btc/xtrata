/* Game 20: Circuit Builder - Trace the word through scattered nodes */
var Game20 = (function(){
  var id='circuit_builder',title='Circuit Builder',
      description='Wire the circuit by spelling the word!',
      genreTag='Puzzle',
      controls='Click two nodes to wire them. Right-click/Z: Undo. R: Reset level.',
      hasLevels=true,scoreMode='score';
  var canvas,ctx,container,shared,raf,listeners=[],intervals=[];
  var W=500,H=460,state;

  /*
   * Each level has a word. Nodes carry the letters of that word,
   * scattered across the board. The player must connect them in
   * the order that spells the word. No guide lines are shown —
   * figuring out the route IS the puzzle.
   */
  var LEVELS=[
    { word:'ARC',
      nodes:[{x:130,y:260,l:'A'},{x:370,y:140,l:'R'},{x:250,y:360,l:'C'}],
      extraWires:1 },
    { word:'BOLT',
      nodes:[{x:350,y:310,l:'B'},{x:140,y:140,l:'O'},{x:360,y:140,l:'L'},{x:140,y:310,l:'T'}],
      extraWires:1 },
    { word:'SPARK',
      nodes:[{x:400,y:100,l:'S'},{x:120,y:280,l:'P'},{x:300,y:340,l:'A'},{x:100,y:120,l:'R'},{x:380,y:280,l:'K'}],
      extraWires:2 },
    { word:'CHARGE',
      nodes:[{x:250,y:80,l:'C'},{x:420,y:180,l:'H'},{x:80,y:180,l:'A'},{x:380,y:340,l:'R'},{x:120,y:340,l:'G'},{x:250,y:400,l:'E'}],
      extraWires:2 },
    { word:'CIRCUIT',
      nodes:[{x:250,y:70,l:'C'},{x:410,y:130,l:'I'},{x:90,y:130,l:'R'},{x:430,y:280,l:'C'},{x:70,y:280,l:'U'},{x:170,y:390,l:'I'},{x:330,y:390,l:'T'}],
      extraWires:2 }
  ];

  /* Build the required edges: consecutive letter pairs in the word */
  function getRequired(lvl){
    var req=[];
    for(var i=0;i<lvl.word.length-1;i++){
      /* Find node indices for letter i and letter i+1 */
      var fromIdx=-1,toIdx=-1;
      var usedFrom={},usedTo={};
      /* Map each position in the word to a specific node.
         Since letters can repeat (e.g. CIRCUIT has two C's and two I's),
         we pre-assign: node index = position in word */
      fromIdx=i; toIdx=i+1;
      req.push([fromIdx,toIdx]);
    }
    return req;
  }

  function init(cont,sh){
    container=cont;shared=sh;
    canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
    container.appendChild(canvas);ctx=canvas.getContext('2d');
    var mc=function(e){
      if(!state||state.gameOver||state.transitioning)return;
      var rect=canvas.getBoundingClientRect();
      var mx=(e.clientX-rect.left)*(W/rect.width);
      var my=(e.clientY-rect.top)*(H/rect.height);
      handleClick(mx,my);
    };
    canvas.addEventListener('click',mc);listeners.push(['click',mc,canvas]);
    var rc=function(e){
      e.preventDefault();
      if(!state||state.gameOver||state.transitioning)return;
      undoLastWire();
    };
    canvas.addEventListener('contextmenu',rc);listeners.push(['contextmenu',rc,canvas]);
    var kd=function(e){
      if(!state)return;
      if(e.key==='r'||e.key==='R')resetLevel();
      if(e.key==='z'||e.key==='Z')undoLastWire();
    };
    document.addEventListener('keydown',kd);listeners.push(['keydown',kd]);
    startGame();
  }

  function startGame(){
    state={levelIdx:0,score:0,gameOver:false,won:false,
      selected:-1,connections:[],wiresLeft:0,transitioning:false,
      wrongCount:0};
    loadLevel(0);
  }

  function resetLevel(){
    if(!state||state.gameOver)return;
    var lvl=LEVELS[state.levelIdx];
    state.connections=[];
    state.selected=-1;
    state.wiresLeft=lvl.word.length-1+lvl.extraWires;
    state.wrongCount=0;
    state.transitioning=false;
    draw();
  }

  function undoLastWire(){
    if(!state||state.transitioning)return;
    if(state.connections.length>0){
      var removed=state.connections.pop();
      state.wiresLeft++;
      /* Check if it was a wrong connection and decrement wrongCount */
      var lvl=LEVELS[state.levelIdx];
      var req=getRequired(lvl);
      var a=Math.min(removed[0],removed[1]),b=Math.max(removed[0],removed[1]);
      var isReq=req.some(function(r){
        var ra=Math.min(r[0],r[1]),rb=Math.max(r[0],r[1]);
        return ra===a&&rb===b;
      });
      if(!isReq&&state.wrongCount>0)state.wrongCount--;
      state.selected=-1;
      if(shared.beep)shared.beep(330,0.05,'square',0.02);
      draw();
    }
  }

  function loadLevel(idx){
    if(idx>=LEVELS.length){
      state.gameOver=true;state.won=true;state.transitioning=false;draw();
      shared.highScores.maybeSubmit({gameId:id,score:state.score,mode:'score',title:title});
      return;
    }
    state.levelIdx=idx;
    state.connections=[];
    state.selected=-1;
    state.wrongCount=0;
    var lvl=LEVELS[idx];
    state.wiresLeft=lvl.word.length-1+lvl.extraWires;
    state.transitioning=false;
    draw();
  }

  function handleClick(mx,my){
    if(state.transitioning)return;
    var lvl=LEVELS[state.levelIdx];
    var clickedNode=-1;
    for(var i=0;i<lvl.nodes.length;i++){
      var dx=mx-lvl.nodes[i].x,dy=my-lvl.nodes[i].y;
      if(Math.sqrt(dx*dx+dy*dy)<26){clickedNode=i;break;}
    }
    if(clickedNode<0){state.selected=-1;draw();return;}

    if(state.selected<0){
      state.selected=clickedNode;
      if(shared.beep)shared.beep(440,0.05,'square',0.02);
    } else if(state.selected===clickedNode){
      state.selected=-1;
    } else {
      var a=Math.min(state.selected,clickedNode),b=Math.max(state.selected,clickedNode);
      var exists=state.connections.some(function(c){return c[0]===a&&c[1]===b;});
      if(!exists&&state.wiresLeft>0){
        state.connections.push([a,b]);
        state.wiresLeft--;
        /* Check if this is a required connection */
        var req=getRequired(lvl);
        var isReq=req.some(function(r){
          var ra=Math.min(r[0],r[1]),rb=Math.max(r[0],r[1]);
          return ra===a&&rb===b;
        });
        if(isReq){
          if(shared.beep)shared.beep(660,0.08,'sine',0.04);
        } else {
          state.wrongCount++;
          if(shared.beep)shared.beep(220,0.1,'sawtooth',0.04);
        }
        checkWin();
      } else if(exists){
        /* Remove existing connection */
        var wasWrong=false;
        var req2=getRequired(lvl);
        var isReq2=req2.some(function(r){
          var ra=Math.min(r[0],r[1]),rb=Math.max(r[0],r[1]);
          return ra===a&&rb===b;
        });
        if(!isReq2)wasWrong=true;
        state.connections=state.connections.filter(function(c){return !(c[0]===a&&c[1]===b);});
        state.wiresLeft++;
        if(wasWrong&&state.wrongCount>0)state.wrongCount--;
        if(shared.beep)shared.beep(330,0.05,'square',0.02);
      }
      state.selected=-1;
    }
    draw();
  }

  function checkWin(){
    var lvl=LEVELS[state.levelIdx];
    var req=getRequired(lvl);
    var allConnected=req.every(function(r){
      var a=Math.min(r[0],r[1]),b=Math.max(r[0],r[1]);
      return state.connections.some(function(c){return c[0]===a&&c[1]===b;});
    });
    if(allConnected){
      var bonus=Math.max(0,(state.wiresLeft+1)*20-state.wrongCount*10);
      state.score+=bonus+50*(state.levelIdx+1);
      state.transitioning=true;
      if(shared.beep)shared.beep(880,0.2,'sine',0.05);
      setTimeout(function(){loadLevel(state.levelIdx+1);},800);
    }
  }

  function draw(){
    if(!ctx||!state)return;
    ctx.fillStyle='#0a0a1a';ctx.fillRect(0,0,W,H);
    var lvl=LEVELS[state.levelIdx];
    if(!lvl)return;

    /* HUD */
    ctx.fillStyle='#0ff';ctx.font='13px monospace';ctx.textAlign='left';
    ctx.fillText('Level '+(state.levelIdx+1)+'/'+LEVELS.length+'   Wires: '+state.wiresLeft+'   Score: '+state.score,12,22);

    /* Word clue — show the word with arrows between letters */
    ctx.textAlign='center';ctx.font='bold 18px monospace';
    var clue='';
    for(var ci=0;ci<lvl.word.length;ci++){
      if(ci>0)clue+=' \u2192 ';
      clue+=lvl.word[ci];
    }
    ctx.fillStyle='#ff0';
    ctx.fillText('Trace: '+clue,W/2,50);

    /* Hint text */
    ctx.fillStyle='#666';ctx.font='11px monospace';
    ctx.fillText('Connect the letters in order to complete the circuit',W/2,68);

    /* Player connections */
    var req=getRequired(lvl);
    ctx.lineWidth=3;
    state.connections.forEach(function(c){
      var isReq=req.some(function(r){
        var ra=Math.min(r[0],r[1]),rb=Math.max(r[0],r[1]);
        return c[0]===ra&&c[1]===rb;
      });
      ctx.strokeStyle=isReq?'#0f0':'#f44';
      ctx.beginPath();
      ctx.moveTo(lvl.nodes[c[0]].x,lvl.nodes[c[0]].y);
      ctx.lineTo(lvl.nodes[c[1]].x,lvl.nodes[c[1]].y);
      ctx.stroke();
      /* Draw a small electricity effect on correct wires */
      if(isReq){
        ctx.strokeStyle='rgba(0,255,100,0.3)';ctx.lineWidth=8;
        ctx.beginPath();
        ctx.moveTo(lvl.nodes[c[0]].x,lvl.nodes[c[0]].y);
        ctx.lineTo(lvl.nodes[c[1]].x,lvl.nodes[c[1]].y);
        ctx.stroke();
        ctx.lineWidth=3;
      }
    });

    /* Nodes */
    lvl.nodes.forEach(function(n,i){
      /* Check if this node is fully wired (all its required connections are made) */
      var nodeComplete=true;
      req.forEach(function(r){
        if(r[0]===i||r[1]===i){
          var a=Math.min(r[0],r[1]),b=Math.max(r[0],r[1]);
          var has=state.connections.some(function(c){return c[0]===a&&c[1]===b;});
          if(!has)nodeComplete=false;
        }
      });

      /* Glow for selected */
      if(i===state.selected){
        ctx.fillStyle='rgba(255,255,0,0.25)';
        ctx.beginPath();ctx.arc(n.x,n.y,32,0,Math.PI*2);ctx.fill();
      }

      /* Node circle */
      var col=i===state.selected?'#ff0':nodeComplete?'#0f0':'#0cf';
      ctx.fillStyle=col;
      ctx.beginPath();ctx.arc(n.x,n.y,20,0,Math.PI*2);ctx.fill();

      /* Border */
      ctx.strokeStyle='#fff';ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(n.x,n.y,20,0,Math.PI*2);ctx.stroke();

      /* Letter */
      ctx.fillStyle='#000';ctx.font='bold 16px monospace';ctx.textAlign='center';
      ctx.fillText(n.l,n.x,n.y+6);
    });

    /* Controls hint */
    ctx.fillStyle='#555';ctx.font='10px monospace';ctx.textAlign='center';
    ctx.fillText('Right-click or Z: Undo  |  R: Reset level  |  Click existing wire to remove',W/2,H-8);
    ctx.textAlign='left';

    /* Transition overlay */
    if(state.transitioning){
      ctx.fillStyle='rgba(0,40,0,0.5)';ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#0f0';ctx.font='bold 22px monospace';ctx.textAlign='center';
      ctx.fillText('CIRCUIT COMPLETE!',W/2,H/2-10);
      ctx.fillStyle='#ff0';ctx.font='14px monospace';
      ctx.fillText(lvl.word+' connected!',W/2,H/2+16);
      ctx.textAlign='left';
    }

    /* Game over */
    if(state.gameOver){
      ctx.fillStyle='rgba(0,0,0,0.75)';ctx.fillRect(0,0,W,H);
      ctx.textAlign='center';ctx.fillStyle='#0f0';ctx.font='bold 24px monospace';
      ctx.fillText('ALL CIRCUITS COMPLETE!',W/2,H/2-30);
      ctx.fillStyle='#ff0';ctx.font='18px monospace';
      ctx.fillText('Score: '+state.score,W/2,H/2+5);
      ctx.fillStyle='#ccc';ctx.font='13px monospace';
      ctx.fillText('Press R to play again',W/2,H/2+35);
      ctx.textAlign='left';
    }
  }

  function destroy(){
    cancelAnimationFrame(raf);
    intervals.forEach(function(i){clearInterval(i);});intervals=[];
    listeners.forEach(function(l){var t=l[2]||document;t.removeEventListener(l[0],l[1]);});listeners=[];
    if(container)container.innerHTML='';
    state=null;
  }

  function getTestHooks(){
    return {
      getState:function(){
        if(!state)return{level:0,score:0,gameOver:true,won:false};
        return{level:state.levelIdx+1,score:state.score,gameOver:state.gameOver,won:state.won};
      },
      completeLevel:function(){
        if(!state||state.gameOver)return;
        var lvl=LEVELS[state.levelIdx];
        var req=getRequired(lvl);
        state.connections=req.map(function(r){return[Math.min(r[0],r[1]),Math.max(r[0],r[1])];});
        state.score+=50*(state.levelIdx+1);
        state.transitioning=true;
        loadLevel(state.levelIdx+1);
      },
      forceWin:function(){
        if(!state)return;
        state.levelIdx=LEVELS.length-1;
        state.score+=500;state.transitioning=true;
        loadLevel(state.levelIdx+1);
      },
      setDeterministicSeed:function(){}
    };
  }

  return {id:id,title:title,description:description,genreTag:genreTag,controls:controls,
    hasLevels:hasLevels,scoreMode:scoreMode,init:init,destroy:destroy,getTestHooks:getTestHooks};
})();
