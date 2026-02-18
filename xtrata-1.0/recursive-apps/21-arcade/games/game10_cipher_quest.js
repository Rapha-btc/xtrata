/* Game 10: Cipher Quest - Tiny branching text adventure */
var Game10 = (function(){
  var id='cipher_quest',title='Cipher Quest',description='A branching text adventure. Choose wisely!',
      genreTag='Adventure',controls='1-4: Choose option, R: Restart',
      hasLevels=true,scoreMode='score';
  var container,shared,listeners=[],intervals=[];
  var state;

  var STORY = [
    {id:0,text:'You stand before an ancient terminal. A blinking cursor awaits.\nThe screen reads: "ENTER THE CIPHER VAULT"\n\nWhat do you do?',
      choices:[{text:'Type "OPEN"',next:1,pts:10},{text:'Type "HACK"',next:2,pts:20},{text:'Walk away',next:3,pts:0}]},
    {id:1,text:'The terminal accepts your command. A door slides open revealing a dimly lit corridor.\nYou hear mechanical whirring ahead.',
      choices:[{text:'Proceed carefully',next:4,pts:10},{text:'Run through',next:5,pts:5}]},
    {id:2,text:'Your hack triggers a security protocol! Alarms blare but you bypass the firewall.\nA secret passage opens beneath the terminal.',
      choices:[{text:'Descend into darkness',next:6,pts:20},{text:'Disable alarms first',next:4,pts:15}]},
    {id:3,text:'You turn away, but curiosity pulls you back. The terminal now shows: "LAST CHANCE"',
      choices:[{text:'Type "OPEN"',next:1,pts:5},{text:'Smash the terminal',next:7,pts:0}]},
    {id:4,text:'You find a room with three locked chests. Each has a cipher lock.\nA note reads: "Only one holds the key. The others hold traps."',
      choices:[{text:'Open left chest (cipher: ROT13)',next:8,pts:30},{text:'Open middle chest (cipher: BASE64)',next:9,pts:20},{text:'Open right chest (cipher: BINARY)',next:10,pts:25}]},
    {id:5,text:'You sprint through and trip a wire! A cage drops from above.\nYou manage to squeeze through the bars.',
      choices:[{text:'Continue wounded',next:4,pts:5},{text:'Rest and heal',next:4,pts:10}]},
    {id:6,text:'The passage leads to an underground vault. Rows of ancient servers hum.\nA guardian robot activates!',
      choices:[{text:'Fight the robot',next:11,pts:25},{text:'Solve its riddle',next:12,pts:40},{text:'Sneak past',next:8,pts:15}]},
    {id:7,text:'The terminal sparks and dies. In the debris, you find a USB drive.\nIt contains encrypted coordinates.',
      choices:[{text:'Decrypt the drive',next:6,pts:30},{text:'Pocket it and leave',next:13,pts:10}]},
    {id:8,text:'SUCCESS! The chest opens revealing a golden circuit board.\nIt\'s the legendary Cipher Key!',
      choices:[{text:'Take the key and escape',next:14,pts:50}]},
    {id:9,text:'The chest was trapped! Gas fills the room.\nYou hold your breath and stumble to the exit.',
      choices:[{text:'Escape quickly',next:13,pts:10}]},
    {id:10,text:'The binary lock clicks open. Inside: a map to the main vault.\nYou now know the path.',
      choices:[{text:'Follow the map',next:8,pts:35}]},
    {id:11,text:'You battle the robot with a pipe you found. Sparks fly!\nYou defeat it but are exhausted.',
      choices:[{text:'Search the robot',next:8,pts:30},{text:'Press onward',next:4,pts:15}]},
    {id:12,text:'"What has keys but no locks?" the robot asks.\nYou answer: "A keyboard!"\nThe robot powers down peacefully.',
      choices:[{text:'Access the vault',next:8,pts:50}]},
    {id:13,text:'You escape the vault complex. The adventure ends here.\nBut you feel you missed something important...',
      choices:[{text:'Play again?',next:-1,pts:0}]},
    {id:14,text:'You escape with the Cipher Key! The ancient vault seals behind you.\nYou\'ve completed the Cipher Quest!\n\n*** VICTORY ***',
      choices:[{text:'Play again?',next:-1,pts:0}]}
  ];

  function init(cont,sh){
    container=cont;shared=sh;
    startGame();
  }

  function startGame(){
    state={nodeId:0,score:0,history:[],gameOver:false,level:1};
    render();
  }
  function restartGame(){startGame();}

  function render(){
    container.innerHTML='';
    var div=document.createElement('div');
    div.style.cssText='max-width:600px;margin:20px auto;padding:20px;color:#0ff;font-family:monospace;';

    var node=STORY.find(function(n){return n.id===state.nodeId;});
    if(!node){endGame();return;}

    var txt=document.createElement('pre');
    txt.style.cssText='white-space:pre-wrap;color:#0f0;font-size:15px;margin-bottom:20px;line-height:1.6;';
    txt.textContent=node.text;
    div.appendChild(txt);

    var scoreEl=document.createElement('div');
    scoreEl.style.cssText='color:#ff0;margin-bottom:16px;font-size:14px;';
    scoreEl.textContent='Score: '+state.score+' | Chapter: '+state.level;
    div.appendChild(scoreEl);

    node.choices.forEach(function(ch,i){
      var btn=document.createElement('button');
      btn.style.cssText='display:block;margin:8px 0;padding:10px 20px;background:#1a1a2e;border:1px solid #0ff;color:#0ff;cursor:pointer;font-family:monospace;font-size:14px;width:100%;text-align:left;border-radius:4px;';
      btn.textContent=(i+1)+'. '+ch.text;
      btn.onmouseover=function(){btn.style.background='#0ff';btn.style.color='#000';};
      btn.onmouseout=function(){btn.style.background='#1a1a2e';btn.style.color='#0ff';};
      btn.onclick=function(){choose(ch);};
      div.appendChild(btn);
    });

    var restartBtn=document.createElement('button');
    restartBtn.className='game-ui-btn';
    restartBtn.style.marginTop='20px';
    restartBtn.textContent='Restart (R)';
    restartBtn.onclick=restartGame;
    div.appendChild(restartBtn);

    container.appendChild(div);

    /* Keyboard */
    var kd=function(e){
      if(e.key==='r'||e.key==='R'){restartGame();return;}
      var idx=parseInt(e.key)-1;
      if(idx>=0&&idx<node.choices.length)choose(node.choices[idx]);
    };
    document.addEventListener('keydown',kd);
    listeners.push(['keydown',kd]);
  }

  function choose(ch){
    /* Remove old listeners */
    listeners.forEach(function(l){document.removeEventListener(l[0],l[1]);});listeners=[];
    state.score+=ch.pts;
    state.level++;
    state.history.push(state.nodeId);
    if(ch.next===-1){endGame();return;}
    state.nodeId=ch.next;
    render();
  }

  function endGame(){
    state.gameOver=true;
    container.innerHTML='';
    var div=document.createElement('div');
    div.style.cssText='max-width:600px;margin:40px auto;padding:20px;text-align:center;color:#0ff;font-family:monospace;';
    div.innerHTML='<h2 style="color:#ff0">Quest Complete!</h2><p style="font-size:18px">Final Score: '+state.score+'</p><p style="color:#888">Press R to play again</p>';
    container.appendChild(div);
    var kd=function(e){if(e.key==='r'||e.key==='R'){listeners.forEach(function(l){document.removeEventListener(l[0],l[1]);});listeners=[];restartGame();}};
    document.addEventListener('keydown',kd);listeners.push(['keydown',kd]);
    shared.highScores.maybeSubmit({gameId:id,score:state.score,mode:'score',title:title});
  }

  function destroy(){
    intervals.forEach(function(i){clearInterval(i);});intervals=[];
    listeners.forEach(function(l){document.removeEventListener(l[0],l[1]);});listeners=[];
    if(container)container.innerHTML='';
  }

  function getTestHooks(){
    return {
      getState:function(){return{level:state.level,score:state.score,gameOver:state.gameOver,nodeId:state.nodeId};},
      completeLevel:function(){
        var node=STORY.find(function(n){return n.id===state.nodeId;});
        if(node&&node.choices.length>0)choose(node.choices[0]);
      },
      forceWin:function(){state.score=200;state.nodeId=14;render();},
      setDeterministicSeed:function(){}
    };
  }

  return {id:id,title:title,description:description,genreTag:genreTag,controls:controls,
    hasLevels:hasLevels,scoreMode:scoreMode,init:init,destroy:destroy,getTestHooks:getTestHooks};
})();
