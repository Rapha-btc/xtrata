/* Shared High Scores Module */
var HighScores = (function(){
  var STORAGE_KEY = 'retro_arcade_scores';
  var MAX_ENTRIES = 10;

  var MODE_SCORE = 0;
  var MODE_TIME = 1;

  var DEFAULT_ONCHAIN_CONFIG = {
    enabled: false,
    network: 'mainnet',
    contractAddress: '',
    contractName: 'xtrata-arcade-scores-v1-0',
    functionName: 'submit-score',
    minRank: 10
  };

  var onChainConfig = _normalizeOnChainConfig(
    typeof window !== 'undefined' ? window.ARCADE_ONCHAIN_CONFIG : null
  );
  var customOnChainSubmitter = null;

  function _load(){
    try{
      var d = localStorage.getItem(STORAGE_KEY);
      return d ? JSON.parse(d) : {};
    }catch(e){ return {}; }
  }
  function _save(data){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }catch(e){}
  }

  function _key(gameId, mode){ return gameId + '_' + (mode||'score'); }

  function getTop10(gameId, mode){
    var data = _load();
    var k = _key(gameId, mode);
    return (data[k] || []).slice(0, MAX_ENTRIES);
  }

  function _qualifies(gameId, mode, value){
    var list = getTop10(gameId, mode);
    if(list.length < MAX_ENTRIES) return true;
    if(mode === 'time'){
      return value < list[list.length-1].score;
    }
    return value > list[list.length-1].score;
  }

  function _addEntry(gameId, mode, name, value){
    var data = _load();
    var k = _key(gameId, mode);
    if(!data[k]) data[k] = [];
    var entry = { name: name, score: value, date: new Date().toISOString() };
    data[k].push(entry);
    if(mode === 'time'){
      data[k].sort(function(a,b){ return a.score - b.score; });
    } else {
      data[k].sort(function(a,b){ return b.score - a.score; });
    }
    data[k] = data[k].slice(0, MAX_ENTRIES);
    _save(data);
    return data[k].indexOf(entry);
  }

  function getBest(gameId, mode){
    var list = getTop10(gameId, mode);
    if(list.length === 0) return null;
    return list[0].score;
  }

  function _copyOnChainConfig(source){
    return {
      enabled: !!source.enabled,
      network: source.network || 'mainnet',
      contractAddress: source.contractAddress || '',
      contractName: source.contractName || 'xtrata-arcade-scores-v1-0',
      functionName: source.functionName || 'submit-score',
      minRank: source.minRank || 10
    };
  }

  function _normalizeOnChainConfig(input){
    var base = _copyOnChainConfig(DEFAULT_ONCHAIN_CONFIG);
    if(!input || typeof input !== 'object') return base;

    if(typeof input.enabled === 'boolean') base.enabled = input.enabled;
    if(typeof input.network === 'string' && input.network.trim()) base.network = input.network.trim();
    if(typeof input.contractAddress === 'string') base.contractAddress = input.contractAddress.trim();
    if(typeof input.contractName === 'string' && input.contractName.trim()) base.contractName = input.contractName.trim();
    if(typeof input.functionName === 'string' && input.functionName.trim()) base.functionName = input.functionName.trim();

    var rankNum = Number(input.minRank);
    if(isFinite(rankNum) && rankNum > 0){
      base.minRank = Math.floor(rankNum);
    }

    return base;
  }

  function configureOnChain(config){
    var next = _copyOnChainConfig(onChainConfig);
    config = config || {};
    for(var key in config){
      if(Object.prototype.hasOwnProperty.call(config, key)){
        next[key] = config[key];
      }
    }
    onChainConfig = _normalizeOnChainConfig(next);
    return getOnChainConfig();
  }

  function getOnChainConfig(){
    return _copyOnChainConfig(onChainConfig);
  }

  function setOnChainSubmitter(submitter){
    customOnChainSubmitter = typeof submitter === 'function' ? submitter : null;
  }

  function _sanitizeAscii(input, maxLen, fallback){
    var raw = input == null ? '' : String(input);
    var out = '';
    for(var i=0; i<raw.length; i++){
      var code = raw.charCodeAt(i);
      if(code >= 32 && code <= 126){
        out += raw.charAt(i);
        if(out.length >= maxLen) break;
      }
    }
    if(out.length === 0) out = fallback || '';
    if(out.length > maxLen) out = out.substring(0, maxLen);
    return out;
  }

  function _safePlayerName(input){
    var name = _sanitizeAscii(input, 12, 'AAA');
    if(name.length < 3){
      name = (name + 'AAA').substring(0,3);
    }
    return name;
  }

  function _safeGameId(input){
    return _sanitizeAscii(input, 32, 'unknown_game');
  }

  function _toModeUint(mode){
    return mode === 'time' ? MODE_TIME : MODE_SCORE;
  }

  function _encodeUIntCV(value){
    var num;
    try{
      num = BigInt(value);
    }catch(e){
      throw new Error('Invalid uint value for contract call.');
    }
    if(num < 0n){
      throw new Error('Contract call uint cannot be negative.');
    }
    var hex = num.toString(16);
    if(hex.length > 32){
      throw new Error('Contract call uint exceeds Clarity uint width.');
    }
    while(hex.length < 32) hex = '0' + hex;
    return '0x01' + hex;
  }

  function _encodeAsciiCV(value){
    var text = String(value == null ? '' : value);
    var hex = '';
    for(var i=0; i<text.length; i++){
      var code = text.charCodeAt(i);
      if(code < 0 || code > 127){
        throw new Error('Contract call string must be ASCII.');
      }
      var byteHex = code.toString(16);
      if(byteHex.length < 2) byteHex = '0' + byteHex;
      hex += byteHex;
    }
    var lenHex = text.length.toString(16);
    while(lenHex.length < 8) lenHex = '0' + lenHex;
    return '0x0d' + lenHex + hex;
  }

  function _getStacksProvider(){
    if(typeof window === 'undefined') return null;
    if(window.StacksProvider && typeof window.StacksProvider.request === 'function'){
      return window.StacksProvider;
    }
    if(window.LeatherProvider && typeof window.LeatherProvider.request === 'function'){
      return window.LeatherProvider;
    }
    return null;
  }

  function _requestWalletContractCall(provider, params){
    return Promise.resolve()
      .then(function(){
        return provider.request('stx_callContract', params);
      })
      .catch(function(){
        return provider.request({ method: 'stx_callContract', params: params });
      });
  }

  function _defaultOnChainSubmitter(payload){
    var provider = _getStacksProvider();
    if(!provider){
      return Promise.reject(new Error('No Stacks wallet provider found in this browser.'));
    }

    var params = {
      contractAddress: payload.contractAddress,
      contractName: payload.contractName,
      functionName: payload.functionName,
      functionArgs: [
        _encodeAsciiCV(_safeGameId(payload.gameId)),
        _encodeUIntCV(_toModeUint(payload.mode)),
        _encodeUIntCV(payload.score),
        _encodeAsciiCV(_safePlayerName(payload.playerName))
      ],
      network: payload.network || 'mainnet',
      postConditionMode: 'allow'
    };

    return _requestWalletContractCall(provider, params).then(function(result){
      var txId = null;
      if(result && typeof result === 'object'){
        txId = result.txId || result.txid || result.tx_id || null;
      }
      return {
        txId: txId,
        raw: result
      };
    });
  }

  function _resolveOnChainSubmitter(){
    if(customOnChainSubmitter) return customOnChainSubmitter;
    if(typeof window !== 'undefined' && window.ArcadeOnChain && typeof window.ArcadeOnChain.submitScore === 'function'){
      return function(payload){
        return window.ArcadeOnChain.submitScore(payload);
      };
    }
    return _defaultOnChainSubmitter;
  }

  function submitOnChainScore(opts){
    opts = opts || {};
    var config = getOnChainConfig();

    if(!config.contractAddress || !config.contractName){
      return Promise.reject(new Error('Missing ARCADE_ONCHAIN_CONFIG contractAddress/contractName.'));
    }

    var scoreNum = Number(opts.score);
    if(!isFinite(scoreNum) || scoreNum <= 0){
      return Promise.reject(new Error('Score must be a positive number for on-chain submit.'));
    }

    var payload = {
      gameId: _safeGameId(opts.gameId),
      mode: opts.mode === 'time' ? 'time' : 'score',
      score: Math.floor(scoreNum),
      playerName: _safePlayerName(opts.playerName),
      rank: opts.rank,
      contractAddress: config.contractAddress,
      contractName: config.contractName,
      functionName: config.functionName,
      network: config.network
    };

    var submitter = _resolveOnChainSubmitter();
    return Promise.resolve(submitter(payload));
  }

  function _shouldOfferOnChain(rank){
    return !!(
      onChainConfig.enabled &&
      onChainConfig.contractAddress &&
      onChainConfig.contractName &&
      rank > 0 &&
      rank <= onChainConfig.minRank
    );
  }

  function _maybeOfferOnChainSubmit(opts){
    if(!_shouldOfferOnChain(opts.rank)){
      return Promise.resolve({ offered:false, submitted:false });
    }

    var value = opts.mode === 'time' ? ArcadeUtils.formatTime(opts.score) : ArcadeUtils.formatScore(opts.score);
    var proceed = true;

    if(typeof window !== 'undefined' && typeof window.confirm === 'function'){
      proceed = window.confirm(
        'Top ' + onChainConfig.minRank + ' reached for ' + (opts.title || opts.gameId) +
        ' (#' + opts.rank + ', ' + value + ').\n\n' +
        'Submit this score on-chain now?'
      );
    }

    if(!proceed){
      return Promise.resolve({ offered:true, submitted:false, skipped:true });
    }

    return submitOnChainScore({
      gameId: opts.gameId,
      mode: opts.mode,
      score: opts.score,
      playerName: opts.name,
      rank: opts.rank
    })
      .then(function(result){
        return {
          offered:true,
          submitted:true,
          txId: result && result.txId ? result.txId : null
        };
      })
      .catch(function(error){
        var message = error && error.message ? error.message : String(error);
        if(typeof window !== 'undefined' && typeof window.alert === 'function'){
          window.alert('On-chain score submit failed: ' + message);
        }
        return {
          offered:true,
          submitted:false,
          error: message
        };
      });
  }

  /* Name entry + overlay */
  function _createOverlayEl(){
    var ov = document.createElement('div');
    ov.className = 'hs-overlay';
    return ov;
  }

  function _promptName(resolve){
    var ov = _createOverlayEl();
    var modal = document.createElement('div');
    modal.className = 'hs-modal';
    modal.innerHTML = '<h2>NEW HIGH SCORE!</h2>' +
      '<div class="hs-new">Congratulations!</div>' +
      '<div class="hs-name-entry">' +
      '<label>Enter your name (3-12 chars)</label>' +
      '<input type="text" id="hs-name-input" maxlength="12" placeholder="AAA">' +
      '<button id="hs-name-ok">OK</button>' +
      '</div>';
    ov.appendChild(modal);
    document.body.appendChild(ov);
    var inp = document.getElementById('hs-name-input');
    var btn = document.getElementById('hs-name-ok');
    inp.focus();
    function submit(){
      var n = inp.value.trim();
      if(n.length < 3) n = n + 'AAA'.substring(0, 3 - n.length);
      if(n.length > 12) n = n.substring(0,12);
      document.body.removeChild(ov);
      resolve(n);
    }
    btn.onclick = submit;
    inp.onkeydown = function(e){ if(e.key==='Enter') submit(); };
  }

  function renderOverlay(opts){
    var gameId = opts.gameId;
    var mode = opts.mode || 'score';
    var highlightIdx = opts.highlightIdx != null ? opts.highlightIdx : -1;
    var list = getTop10(gameId, mode);

    var ov = _createOverlayEl();
    var modal = document.createElement('div');
    modal.className = 'hs-modal';
    var isTime = mode === 'time';
    var h = '<h2>Top 10 - ' + (opts.title || gameId) + '</h2>';
    if(highlightIdx >= 0) h += '<div class="hs-new">* NEW HIGH SCORE *</div>';
    h += '<table class="hs-table"><tr><th>#</th><th>Name</th><th>' + (isTime?'Time':'Score') + '</th></tr>';
    for(var i=0;i<list.length;i++){
      var cls = i===highlightIdx ? ' class="hs-highlight"' : '';
      var val = isTime ? ArcadeUtils.formatTime(list[i].score) : ArcadeUtils.formatScore(list[i].score);
      h += '<tr'+cls+'><td class="rank">'+(i+1)+'</td><td class="name">'+list[i].name+'</td><td class="score-col">'+val+'</td></tr>';
    }
    if(list.length===0) h += '<tr><td colspan="3" style="color:#555">No scores yet</td></tr>';
    h += '</table>';
    h += '<button class="hs-close-btn" id="hs-close">Close</button>';
    modal.innerHTML = h;
    ov.appendChild(modal);
    document.body.appendChild(ov);
    document.getElementById('hs-close').onclick = function(){ hideOverlay(); };
    ov.onclick = function(e){ if(e.target===ov) hideOverlay(); };
    return ov;
  }

  function hideOverlay(){
    var ovs = document.querySelectorAll('.hs-overlay');
    ovs.forEach(function(o){ try{document.body.removeChild(o);}catch(e){} });
  }

  function maybeSubmit(opts){
    var gameId = opts.gameId;
    var score = opts.score;
    var mode = opts.mode || 'score';
    var title = opts.title || gameId;

    return new Promise(function(resolve){
      if(_qualifies(gameId, mode, score)){
        _promptName(function(name){
          var idx = _addEntry(gameId, mode, name, score);
          var rank = idx >= 0 ? (idx + 1) : null;
          renderOverlay({ gameId:gameId, mode:mode, title:title, highlightIdx:idx });

          if(rank){
            _maybeOfferOnChainSubmit({
              gameId: gameId,
              mode: mode,
              score: score,
              title: title,
              name: name,
              rank: rank
            }).then(function(onChain){
              resolve({ submitted:true, rank:rank, onChain:onChain });
            });
          } else {
            resolve({ submitted:true, rank:null, onChain:{ offered:false, submitted:false } });
          }
        });
      } else {
        renderOverlay({ gameId:gameId, mode:mode, title:title, highlightIdx:-1 });
        resolve({ submitted:false, onChain:{ offered:false, submitted:false } });
      }
    });
  }

  function clearAll(){
    try{ localStorage.removeItem(STORAGE_KEY); }catch(e){}
  }

  return {
    getTop10: getTop10,
    getBest: getBest,
    maybeSubmit: maybeSubmit,
    renderOverlay: renderOverlay,
    hideOverlay: hideOverlay,
    clearAll: clearAll,
    configureOnChain: configureOnChain,
    getOnChainConfig: getOnChainConfig,
    setOnChainSubmitter: setOnChainSubmitter,
    submitOnChainScore: submitOnChainScore,
    _qualifies: _qualifies,
    _addEntry: _addEntry,
    _shouldOfferOnChain: _shouldOfferOnChain
  };
})();
