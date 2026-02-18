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
  var walletStatusBadge = document.getElementById('wallet-status-badge');
  var errorOverlay = document.getElementById('error-overlay');
  var errorMsg = document.getElementById('error-msg');
  var errorClose = document.getElementById('error-close');

  var activeGame = null;
  var focusIdx = 0;
  var walletStatusTimer = null;

  function setWalletBadge(state, label){
    if(!walletStatusBadge) return;
    walletStatusBadge.className = 'wallet-status-badge ' + state;
    walletStatusBadge.textContent = label;
    walletStatusBadge.title = label;
  }

  function resolveProviderPath(path){
    if(typeof path !== 'string' || !path) return null;
    var parts = path.split('.');
    var node = window;
    var i;
    for(i = 0; i < parts.length; i++){
      var key = parts[i];
      if(!key || !node || typeof node !== 'object') return null;
      if(!(key in node)) return null;
      node = node[key];
    }
    return node;
  }

  function getProvider(){
    var direct = [
      { name: 'Stacks', provider: window.StacksProvider },
      { name: 'Leather', provider: window.LeatherProvider },
      { name: 'BTC', provider: window.btc },
      { name: 'Stacks', provider: window.stacks },
      { name: 'BitcoinProvider', provider: window.BitcoinProvider },
      { name: 'Xverse', provider: window.XverseProviders },
      { name: 'xverse', provider: window.xverseProviders },
      {
        name: 'Xverse',
        provider: window.XverseProviders && (
          window.XverseProviders.StacksProvider ||
          window.XverseProviders.BitcoinProvider
        )
      },
      {
        name: 'xverse',
        provider: window.xverseProviders && (
          window.xverseProviders.StacksProvider ||
          window.xverseProviders.BitcoinProvider
        )
      }
    ];
    var d;
    for(d = 0; d < direct.length; d++){
      var item = direct[d];
      if(item.provider && typeof item.provider.request === 'function'){
        return item;
      }
    }

    var registries = [window.btc_providers, window.webbtc_providers, window.wbip_providers];
    var r;
    for(r = 0; r < registries.length; r++){
      var registry = registries[r];
      if(!Array.isArray(registry)) continue;
      var i;
      for(i = 0; i < registry.length; i++){
        var entry = registry[i];
        if(!entry) continue;
        var methods = Array.isArray(entry.methods) ? entry.methods : null;
        if(
          methods &&
          methods.indexOf('stx_getAddresses') < 0 &&
          methods.indexOf('stx_getAccounts') < 0 &&
          methods.indexOf('getAddresses') < 0 &&
          methods.indexOf('getAccounts') < 0 &&
          methods.indexOf('stx_callContract') < 0
        ){
          continue;
        }
        var provider = null;
        if(entry.provider && typeof entry.provider.request === 'function'){
          provider = entry.provider;
        } else if(typeof entry.id === 'string' && entry.id){
          provider = resolveProviderPath(entry.id);
        }
        if(provider && typeof provider.request === 'function'){
          return { name: entry.name || entry.id || 'Wallet', provider: provider };
        }
      }
    }
    return null;
  }

  function normalizeNetwork(value){
    if(!value) return null;
    var raw = String(value).toLowerCase();
    if(raw.indexOf('mainnet') >= 0 || raw === 'main') return 'mainnet';
    if(raw.indexOf('testnet') >= 0 || raw === 'test') return 'testnet';
    if(raw.indexOf('devnet') >= 0 || raw === 'dev') return 'devnet';
    return null;
  }

  function inferNetworkFromAddress(address){
    if(!address || typeof address !== 'string') return null;
    var prefix = address.slice(0,2);
    if(prefix === 'SP' || prefix === 'SM') return 'mainnet';
    if(prefix === 'ST' || prefix === 'SN') return 'testnet';
    return null;
  }

  function shortAddress(address){
    if(!address || address.length < 12) return address || '';
    return address.slice(0,6) + '...' + address.slice(-4);
  }

  function extractAddress(payload){
    if(!payload) return null;
    if(typeof payload === 'string') return payload;
    if(Array.isArray(payload)){
      if(payload.length === 0) return null;
      var first = payload[0];
      if(typeof first === 'string') return first;
      if(first && typeof first.address === 'string') return first.address;
      if(first && first.stxAddress){
        if(typeof first.stxAddress === 'string') return first.stxAddress;
        if(typeof first.stxAddress.mainnet === 'string') return first.stxAddress.mainnet;
        if(typeof first.stxAddress.testnet === 'string') return first.stxAddress.testnet;
      }
      return null;
    }
    if(typeof payload === 'object'){
      if(typeof payload.address === 'string') return payload.address;
      if(Array.isArray(payload.addresses)) return extractAddress(payload.addresses);
      if(Array.isArray(payload.accounts)) return extractAddress(payload.accounts);
      if(payload.result) return extractAddress(payload.result);
      if(payload.stxAddress){
        if(typeof payload.stxAddress === 'string') return payload.stxAddress;
        if(typeof payload.stxAddress.mainnet === 'string') return payload.stxAddress.mainnet;
        if(typeof payload.stxAddress.testnet === 'string') return payload.stxAddress.testnet;
      }
    }
    return null;
  }

  function extractNetwork(payload){
    if(!payload) return null;
    if(typeof payload === 'string') return normalizeNetwork(payload);
    if(typeof payload === 'object'){
      return (
        normalizeNetwork(payload.network) ||
        normalizeNetwork(payload.name) ||
        normalizeNetwork(payload.id) ||
        normalizeNetwork(payload.chain) ||
        normalizeNetwork(payload.result)
      );
    }
    return null;
  }

  function requestProvider(provider, method){
    return Promise.resolve()
      .then(function(){ return provider.request(method); })
      .catch(function(){ return provider.request({ method: method, params: {} }); });
  }

  async function getWalletStatus(){
    var detected = getProvider();
    if(!detected){
      return {
        state: 'is-missing',
        label: 'Wallet: not detected'
      };
    }

    var provider = detected.provider;
    var address = null;
    var network = null;

    var addressMethods = ['stx_getAddresses', 'getAddresses', 'stx_getAccounts', 'getAccounts'];
    for(var i=0; i<addressMethods.length && !address; i++){
      try{
        var addressPayload = await requestProvider(provider, addressMethods[i]);
        address = extractAddress(addressPayload);
      }catch(e){}
    }

    if(!address){
      if(typeof provider.selectedAddress === 'string' && provider.selectedAddress){
        address = provider.selectedAddress;
      } else if(typeof provider.address === 'string' && provider.address){
        address = provider.address;
      }
    }

    var networkMethods = ['stx_getNetwork', 'getNetwork'];
    for(var j=0; j<networkMethods.length && !network; j++){
      try{
        var networkPayload = await requestProvider(provider, networkMethods[j]);
        network = extractNetwork(networkPayload);
      }catch(e){}
    }

    if(!network){
      network = inferNetworkFromAddress(address);
    }

    var targetNetwork = window.ARCADE_ONCHAIN_CONFIG && window.ARCADE_ONCHAIN_CONFIG.network
      ? normalizeNetwork(window.ARCADE_ONCHAIN_CONFIG.network) : null;

    if(!address){
      return {
        state: 'is-warning',
        label: 'Wallet: ' + detected.name + ' detected · not connected'
      };
    }

    var resolvedNetwork = network || targetNetwork || 'unknown';
    var connectedLabel = 'Wallet: ' + shortAddress(address) + ' · ' + resolvedNetwork;
    var warning = targetNetwork && network && targetNetwork !== network;
    return {
      state: warning ? 'is-warning' : 'is-connected',
      label: warning ? connectedLabel + ' (target ' + targetNetwork + ')' : connectedLabel
    };
  }

  async function refreshWalletStatus(){
    if(!walletStatusBadge) return;
    try{
      var status = await getWalletStatus();
      setWalletBadge(status.state, status.label);
    }catch(e){
      setWalletBadge('is-warning', 'Wallet: status unavailable');
    }
  }

  function startWalletStatusPolling(){
    if(!walletStatusBadge) return;
    if(walletStatusTimer){ clearInterval(walletStatusTimer); }
    setWalletBadge('is-loading', 'Wallet: checking...');
    void refreshWalletStatus();
    walletStatusTimer = setInterval(function(){
      void refreshWalletStatus();
    }, 5000);
    window.addEventListener('focus', function(){ void refreshWalletStatus(); });
    document.addEventListener('visibilitychange', function(){
      if(document.visibilityState === 'visible'){
        void refreshWalletStatus();
      }
    });
  }

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
  startWalletStatusPolling();
  buildGrid();
  var tiles = homeGrid.querySelectorAll('.tile');
  if(tiles[0]) tiles[0].focus();
})();
