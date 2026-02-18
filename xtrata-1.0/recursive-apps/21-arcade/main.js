/* Retro Arcade - Main Launcher */
(function(){
  var GAMES = [
    typeof Game01 !== 'undefined' ? Game01 : null,
    typeof Game02 !== 'undefined' ? Game02 : null,
    typeof Game03 !== 'undefined' ? Game03 : null,
    typeof Game04 !== 'undefined' ? Game04 : null,
    typeof Game05 !== 'undefined' ? Game05 : null,
    typeof Game06 !== 'undefined' ? Game06 : null,
    typeof Game07 !== 'undefined' ? Game07 : null,
    typeof Game08 !== 'undefined' ? Game08 : null,
    typeof Game09 !== 'undefined' ? Game09 : null,
    typeof Game10 !== 'undefined' ? Game10 : null,
    typeof Game11 !== 'undefined' ? Game11 : null,
    typeof Game12 !== 'undefined' ? Game12 : null,
    typeof Game13 !== 'undefined' ? Game13 : null,
    typeof Game14 !== 'undefined' ? Game14 : null,
    typeof Game15 !== 'undefined' ? Game15 : null,
    typeof Game16 !== 'undefined' ? Game16 : null,
    typeof Game17 !== 'undefined' ? Game17 : null,
    typeof Game18 !== 'undefined' ? Game18 : null,
    typeof Game19 !== 'undefined' ? Game19 : null,
    typeof Game20 !== 'undefined' ? Game20 : null,
    typeof Game21 !== 'undefined' ? Game21 : null
  ].filter(Boolean);

  var homeGrid = document.getElementById('home-grid');
  var gameContainer = document.getElementById('game-container');
  var exitBtn = document.getElementById('exit-btn');
  var soundToggle = document.getElementById('sound-toggle');
  var errorOverlay = document.getElementById('error-overlay');
  var errorMsg = document.getElementById('error-msg');
  var errorClose = document.getElementById('error-close');

  var activeGame = null;
  var focusIdx = 0;

  /* Sound toggle */
  soundToggle.onclick = function(){
    ArcadeUtils.initAudio();
    var on = !ArcadeUtils.isSoundEnabled();
    ArcadeUtils.setSoundEnabled(on);
    soundToggle.textContent = on ? '🔊' : '🔇';
  };

  /* Build home grid */
  function buildGrid(){
    homeGrid.innerHTML = '';
    GAMES.forEach(function(g, i){
      var tile = document.createElement('div');
      tile.className = 'tile';
      tile.tabIndex = 0;
      tile.dataset.idx = i;
      var mode = (g.scoreMode || 'score');
      var best = HighScores.getBest(g.id, mode);
      var bestStr = '--';
      if(best != null){
        bestStr = mode === 'time' ? ('Best: ' + ArcadeUtils.formatTime(best)) : ('Best: ' + ArcadeUtils.formatScore(best));
      }
      tile.innerHTML =
        '<span class="tile-num">#'+(i+1)+'</span>' +
        '<div class="tile-title">'+g.title+'</div>' +
        '<div class="tile-genre">'+g.genreTag+'</div>' +
        '<div class="tile-best">'+bestStr+'</div>';
      tile.onclick = function(){ launchGame(i); };
      tile.onkeydown = function(e){ if(e.key==='Enter') launchGame(i); };
      homeGrid.appendChild(tile);
    });
  }

  function showHome(){
    HighScores.hideOverlay();
    gameContainer.style.display = 'none';
    gameContainer.innerHTML = '';
    homeGrid.style.display = 'grid';
    exitBtn.style.display = 'none';
    buildGrid();
    var tiles = homeGrid.querySelectorAll('.tile');
    if(tiles[focusIdx]) tiles[focusIdx].focus();
  }

  function launchGame(idx){
    ArcadeUtils.initAudio();
    var g = GAMES[idx];
    if(!g) return;
    focusIdx = idx;
    homeGrid.style.display = 'none';
    gameContainer.style.display = 'block';
    gameContainer.innerHTML = '';
    exitBtn.style.display = 'inline-block';
    activeGame = g;
    try{
      var shared = {
        beep: ArcadeUtils.beep,
        highScores: HighScores,
        utils: ArcadeUtils,
        exitToArcade: exitGame
      };
      g.init(gameContainer, shared);
    }catch(e){
      showError(e.message || String(e));
    }
  }

  function exitGame(){
    if(activeGame){
      try{ activeGame.destroy(); }catch(e){}
      activeGame = null;
    }
    HighScores.hideOverlay();
    showHome();
  }

  exitBtn.onclick = exitGame;

  /* Esc key */
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape'){
      if(activeGame){
        exitGame();
      }
    }
    /* Arrow key navigation on home grid */
    if(!activeGame && homeGrid.style.display !== 'none'){
      var tiles = homeGrid.querySelectorAll('.tile');
      var cols = 7;
      if(e.key === 'ArrowRight'){ focusIdx = Math.min(focusIdx+1, tiles.length-1); tiles[focusIdx].focus(); e.preventDefault(); }
      if(e.key === 'ArrowLeft'){ focusIdx = Math.max(focusIdx-1, 0); tiles[focusIdx].focus(); e.preventDefault(); }
      if(e.key === 'ArrowDown'){ focusIdx = Math.min(focusIdx+cols, tiles.length-1); tiles[focusIdx].focus(); e.preventDefault(); }
      if(e.key === 'ArrowUp'){ focusIdx = Math.max(focusIdx-cols, 0); tiles[focusIdx].focus(); e.preventDefault(); }
    }
  });

  /* Error handling */
  function showError(msg){
    errorMsg.textContent = msg;
    errorOverlay.style.display = 'flex';
  }
  errorClose.onclick = function(){
    errorOverlay.style.display = 'none';
    exitGame();
  };

  window.addEventListener('error', function(e){
    if(activeGame){
      showError(e.message || 'Unknown error');
    }
  });

  /* Expose for tests */
  window.ArcadeLauncher = {
    getGames: function(){ return GAMES; },
    launchGame: launchGame,
    exitGame: exitGame,
    getActiveGame: function(){ return activeGame; },
    showHome: showHome
  };

  /* Init */
  buildGrid();
  var tiles = homeGrid.querySelectorAll('.tile');
  if(tiles[0]) tiles[0].focus();
})();
