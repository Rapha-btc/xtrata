/* Shared High Scores Module */
var HighScores = (function(){
  var PB_STORAGE_KEY = 'retro_arcade_personal_bests';
  var MAX_ENTRIES = 10;

  var MODE_SCORE = 0;
  var MODE_TIME = 1;

  var DEFAULT_ONCHAIN_CONFIG = {
    enabled: true,
    network: 'mainnet',
    contractAddress: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
    contractName: 'xtrata-arcade-scores-v1-0',
    functionName: 'submit-score',
    leaderboardFunctionName: 'get-top10',
    apiBaseUrl: '',
    readSenderAddress: '',
    minRank: 10
  };

  var onChainConfig = _normalizeOnChainConfig(
    typeof window !== 'undefined' ? window.ARCADE_ONCHAIN_CONFIG : null
  );
  var customOnChainSubmitter = null;
  var customLeaderboardFetcher = null;
  var leaderboardCache = {};

  function _loadPB(){
    try{
      var raw = localStorage.getItem(PB_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    }catch(e){
      return {};
    }
  }

  function _savePB(data){
    try{
      localStorage.setItem(PB_STORAGE_KEY, JSON.stringify(data));
    }catch(e){}
  }

  function _key(gameId, mode){
    return _safeGameId(gameId) + '_' + (mode === 'time' ? 'time' : 'score');
  }

  function _copyEntry(entry){
    return {
      rank: entry.rank,
      name: entry.name,
      score: entry.score,
      updatedAt: entry.updatedAt,
      player: entry.player,
      pending: !!entry.pending
    };
  }

  function _copyList(list){
    return (list || []).map(_copyEntry);
  }

  function _isBetter(mode, candidate, existing){
    if(mode === 'time') return candidate < existing;
    return candidate > existing;
  }

  function _findRank(list, mode, score){
    var i;
    for(i = 0; i < list.length; i++){
      if(_isBetter(mode, score, list[i].score)){
        return i + 1;
      }
    }
    if(list.length < MAX_ENTRIES){
      return list.length + 1;
    }
    return 0;
  }

  function _buildPreviewList(list, rank, candidate){
    var next = _copyList(list);
    next.splice(rank - 1, 0, candidate);
    next = next.slice(0, MAX_ENTRIES);
    var i;
    for(i = 0; i < next.length; i++){
      next[i].rank = i + 1;
    }
    return next;
  }

  function _recordPersonalBest(gameId, mode, score){
    var data = _loadPB();
    var k = _key(gameId, mode);
    var prior = data[k];
    if(typeof prior !== 'number'){
      data[k] = score;
      _savePB(data);
      return { updated: true, best: score };
    }
    if(_isBetter(mode, score, prior)){
      data[k] = score;
      _savePB(data);
      return { updated: true, best: score };
    }
    return { updated: false, best: prior };
  }

  function getBest(gameId, mode){
    var data = _loadPB();
    var k = _key(gameId, mode);
    return typeof data[k] === 'number' ? data[k] : null;
  }

  function _copyOnChainConfig(source){
    return {
      enabled: !!source.enabled,
      network: source.network || 'mainnet',
      contractAddress: source.contractAddress || '',
      contractName: source.contractName || 'xtrata-arcade-scores-v1-0',
      functionName: source.functionName || 'submit-score',
      leaderboardFunctionName: source.leaderboardFunctionName || 'get-top10',
      apiBaseUrl: source.apiBaseUrl || '',
      readSenderAddress: source.readSenderAddress || '',
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
    if(typeof input.leaderboardFunctionName === 'string' && input.leaderboardFunctionName.trim()){
      base.leaderboardFunctionName = input.leaderboardFunctionName.trim();
    }
    if(typeof input.apiBaseUrl === 'string') base.apiBaseUrl = input.apiBaseUrl.trim();
    if(typeof input.readSenderAddress === 'string') base.readSenderAddress = input.readSenderAddress.trim();

    var rankNum = Number(input.minRank);
    if(isFinite(rankNum) && rankNum > 0){
      base.minRank = Math.floor(rankNum);
    }

    return base;
  }

  function configureOnChain(config){
    var next = _copyOnChainConfig(onChainConfig);
    config = config || {};
    var key;
    for(key in config){
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

  function setOnChainLeaderboardFetcher(fetcher){
    customLeaderboardFetcher = typeof fetcher === 'function' ? fetcher : null;
  }

  function _sanitizeAscii(input, maxLen, fallback){
    var raw = input == null ? '' : String(input);
    var out = '';
    var i;
    for(i = 0; i < raw.length; i++){
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
    var i;
    for(i = 0; i < text.length; i++){
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

  function _resolveLeaderboardFetcher(){
    if(customLeaderboardFetcher) return customLeaderboardFetcher;
    if(typeof window !== 'undefined' && window.ArcadeOnChain && typeof window.ArcadeOnChain.fetchTop10 === 'function'){
      return function(payload){
        return window.ArcadeOnChain.fetchTop10(payload);
      };
    }
    return _defaultLeaderboardFetcher;
  }

  function _isOnChainReady(){
    return !!(
      onChainConfig.enabled &&
      onChainConfig.contractAddress &&
      onChainConfig.contractName &&
      onChainConfig.functionName &&
      onChainConfig.leaderboardFunctionName
    );
  }

  function submitOnChainScore(opts){
    opts = opts || {};
    var config = getOnChainConfig();

    if(!_isOnChainReady()){
      return Promise.reject(new Error('On-chain leaderboard config is incomplete.'));
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

  function _stripHexPrefix(input){
    if(typeof input !== 'string') return '';
    return input.indexOf('0x') === 0 || input.indexOf('0X') === 0 ? input.substring(2) : input;
  }

  function _hexToAscii(hex){
    var out = '';
    var i;
    for(i = 0; i < hex.length; i += 2){
      out += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
    }
    return out;
  }

  function _readUInt32Hex(hex, offset){
    if(offset + 8 > hex.length) throw new Error('Invalid Clarity uint32 segment.');
    return {
      value: parseInt(hex.substring(offset, offset + 8), 16),
      offset: offset + 8
    };
  }

  function _parseClarityAt(hex, offset){
    if(offset + 2 > hex.length) throw new Error('Invalid Clarity value header.');

    var type = parseInt(hex.substring(offset, offset + 2), 16);
    var pos = offset + 2;

    if(type === 0x00 || type === 0x01){
      if(pos + 32 > hex.length) throw new Error('Invalid Clarity integer segment.');
      var intHex = hex.substring(pos, pos + 32);
      pos += 32;
      return {
        offset: pos,
        value: BigInt('0x' + intHex)
      };
    }

    if(type === 0x03){
      return { offset: pos, value: true };
    }
    if(type === 0x04){
      return { offset: pos, value: false };
    }

    if(type === 0x05){
      if(pos + 42 > hex.length) throw new Error('Invalid standard principal value.');
      var standardRaw = hex.substring(pos, pos + 42);
      pos += 42;
      return {
        offset: pos,
        value: { type: 'principal-standard', raw: standardRaw }
      };
    }

    if(type === 0x06){
      if(pos + 42 > hex.length) throw new Error('Invalid contract principal prefix.');
      var contractRaw = hex.substring(pos, pos + 42);
      pos += 42;
      if(pos + 2 > hex.length) throw new Error('Invalid contract principal name length.');
      var contractNameLen = parseInt(hex.substring(pos, pos + 2), 16);
      pos += 2;
      if(pos + (contractNameLen * 2) > hex.length) throw new Error('Invalid contract principal name bytes.');
      var contractNameHex = hex.substring(pos, pos + (contractNameLen * 2));
      pos += contractNameLen * 2;
      return {
        offset: pos,
        value: {
          type: 'principal-contract',
          raw: contractRaw,
          contractName: _hexToAscii(contractNameHex)
        }
      };
    }

    if(type === 0x07){
      var okInner = _parseClarityAt(hex, pos);
      return {
        offset: okInner.offset,
        value: {
          type: 'response-ok',
          value: okInner.value
        }
      };
    }

    if(type === 0x08){
      var errInner = _parseClarityAt(hex, pos);
      return {
        offset: errInner.offset,
        value: {
          type: 'response-err',
          value: errInner.value
        }
      };
    }

    if(type === 0x09){
      return { offset: pos, value: null };
    }

    if(type === 0x0a){
      var someInner = _parseClarityAt(hex, pos);
      return { offset: someInner.offset, value: someInner.value };
    }

    if(type === 0x0b){
      var listMeta = _readUInt32Hex(hex, pos);
      var listLen = listMeta.value;
      pos = listMeta.offset;
      var list = [];
      var i;
      for(i = 0; i < listLen; i++){
        var parsedListItem = _parseClarityAt(hex, pos);
        list.push(parsedListItem.value);
        pos = parsedListItem.offset;
      }
      return { offset: pos, value: list };
    }

    if(type === 0x0c){
      var tupleMeta = _readUInt32Hex(hex, pos);
      var tupleLen = tupleMeta.value;
      pos = tupleMeta.offset;
      var tuple = {};
      var t;
      for(t = 0; t < tupleLen; t++){
        if(pos + 2 > hex.length) throw new Error('Invalid tuple key length.');
        var keyLen = parseInt(hex.substring(pos, pos + 2), 16);
        pos += 2;
        if(pos + (keyLen * 2) > hex.length) throw new Error('Invalid tuple key bytes.');
        var keyHex = hex.substring(pos, pos + (keyLen * 2));
        pos += keyLen * 2;
        var key = _hexToAscii(keyHex);
        var parsedTupleVal = _parseClarityAt(hex, pos);
        tuple[key] = parsedTupleVal.value;
        pos = parsedTupleVal.offset;
      }
      return { offset: pos, value: tuple };
    }

    if(type === 0x0d || type === 0x0e){
      var strMeta = _readUInt32Hex(hex, pos);
      var strLen = strMeta.value;
      pos = strMeta.offset;
      if(pos + (strLen * 2) > hex.length) throw new Error('Invalid Clarity string bytes.');
      var strHex = hex.substring(pos, pos + (strLen * 2));
      pos += strLen * 2;
      return { offset: pos, value: _hexToAscii(strHex) };
    }

    throw new Error('Unsupported Clarity CV type: 0x' + type.toString(16));
  }

  function _parseClarityHex(hex){
    var clean = _stripHexPrefix(hex);
    if(!clean){
      throw new Error('Missing Clarity result bytes.');
    }
    var parsed = _parseClarityAt(clean, 0);
    return parsed.value;
  }

  function _toSafeNumber(value){
    if(typeof value === 'number') return value;
    if(typeof value === 'bigint'){
      if(value > BigInt(Number.MAX_SAFE_INTEGER)) return Number.MAX_SAFE_INTEGER;
      return Number(value);
    }
    var num = Number(value);
    if(isFinite(num)) return num;
    return 0;
  }

  function _defaultApiBase(network){
    var normalized = String(network || '').toLowerCase();
    if(normalized === 'mainnet' || normalized === 'main') return 'https://api.mainnet.hiro.so';
    if(normalized === 'testnet' || normalized === 'test') return 'https://api.testnet.hiro.so';
    if(normalized === 'devnet' || normalized === 'dev') return 'http://localhost:3999';
    return '';
  }

  function _callReadOnly(payload){
    if(typeof fetch !== 'function'){
      return Promise.reject(new Error('Browser fetch API is unavailable for leaderboard reads.'));
    }

    var apiBase = payload.apiBaseUrl || _defaultApiBase(payload.network);
    if(!apiBase){
      return Promise.reject(new Error('No API base URL configured for leaderboard read-only calls.'));
    }

    var sender = payload.readSenderAddress || payload.contractAddress;
    if(!sender){
      return Promise.reject(new Error('Missing sender principal for read-only leaderboard call.'));
    }

    var endpoint = apiBase.replace(/\/+$/, '') +
      '/v2/contracts/call-read/' +
      payload.contractAddress + '/' +
      payload.contractName + '/' +
      payload.leaderboardFunctionName;

    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: sender,
        arguments: [
          _encodeAsciiCV(payload.gameId),
          _encodeUIntCV(_toModeUint(payload.mode))
        ]
      })
    })
      .then(function(response){
        if(!response.ok){
          throw new Error('Leaderboard read call failed with HTTP ' + response.status + '.');
        }
        return response.json();
      })
      .then(function(body){
        if(!body || typeof body !== 'object'){
          throw new Error('Invalid leaderboard read response payload.');
        }
        if(body.okay !== true || typeof body.result !== 'string'){
          var cause = body.cause ? String(body.cause) : 'Read-only contract call failed.';
          throw new Error(cause);
        }
        return body.result;
      });
  }

  function _decodeTop10Result(resultHex){
    var parsed = _parseClarityHex(resultHex);
    if(!parsed || typeof parsed !== 'object' || parsed.type !== 'response-ok'){
      if(parsed && parsed.type === 'response-err'){
        throw new Error('Leaderboard read was rejected by contract.');
      }
      throw new Error('Unexpected leaderboard read format.');
    }

    if(!Array.isArray(parsed.value)){
      throw new Error('Leaderboard payload is not a list.');
    }

    var entries = [];
    var i;
    for(i = 0; i < parsed.value.length && i < MAX_ENTRIES; i++){
      var slot = parsed.value[i];
      if(!slot || typeof slot !== 'object') continue;
      entries.push({
        rank: i + 1,
        name: _safePlayerName(slot.name),
        score: Math.floor(_toSafeNumber(slot.score)),
        updatedAt: Math.floor(_toSafeNumber(slot['updated-at'])),
        player: slot.player || null
      });
    }
    return entries;
  }

  function _normalizeLeaderboardList(list, mode){
    if(!Array.isArray(list)) return [];
    var normalized = [];
    var i;
    for(i = 0; i < list.length && normalized.length < MAX_ENTRIES; i++){
      var item = list[i];
      if(!item || typeof item !== 'object') continue;
      var scoreNum = Math.floor(_toSafeNumber(item.score));
      if(!isFinite(scoreNum) || scoreNum <= 0) continue;
      normalized.push({
        rank: normalized.length + 1,
        name: _safePlayerName(item.name),
        score: scoreNum,
        updatedAt: Math.floor(_toSafeNumber(item.updatedAt || item['updated-at'] || 0)),
        player: item.player || null,
        pending: !!item.pending
      });
    }

    normalized.sort(function(a, b){
      if(mode === 'time'){
        return a.score - b.score;
      }
      return b.score - a.score;
    });

    for(i = 0; i < normalized.length; i++){
      normalized[i].rank = i + 1;
    }

    return normalized;
  }

  function _defaultLeaderboardFetcher(payload){
    return _callReadOnly(payload).then(function(resultHex){
      return _decodeTop10Result(resultHex);
    });
  }

  function fetchTop10(gameId, mode, opts){
    opts = opts || {};

    var safeGameId = _safeGameId(gameId);
    var safeMode = mode === 'time' ? 'time' : 'score';
    var cacheKey = _key(safeGameId, safeMode);

    if(!opts.force && leaderboardCache[cacheKey]){
      return Promise.resolve(_copyList(leaderboardCache[cacheKey]));
    }

    if(!_isOnChainReady()){
      leaderboardCache[cacheKey] = [];
      return Promise.resolve([]);
    }

    var config = getOnChainConfig();
    var payload = {
      gameId: safeGameId,
      mode: safeMode,
      contractAddress: config.contractAddress,
      contractName: config.contractName,
      leaderboardFunctionName: config.leaderboardFunctionName,
      network: config.network,
      apiBaseUrl: config.apiBaseUrl,
      readSenderAddress: config.readSenderAddress
    };

    var fetcher = _resolveLeaderboardFetcher();
    return Promise.resolve(fetcher(payload)).then(function(list){
      var normalized = _normalizeLeaderboardList(list, safeMode);
      leaderboardCache[cacheKey] = normalized;
      return _copyList(normalized);
    }).catch(function(error){
      if(opts.allowStale && leaderboardCache[cacheKey]){
        return _copyList(leaderboardCache[cacheKey]);
      }
      throw error;
    });
  }

  function getTop10(gameId, mode){
    var k = _key(gameId, mode);
    return _copyList(leaderboardCache[k] || []);
  }

  function _createOverlayEl(){
    var ov = document.createElement('div');
    ov.className = 'hs-overlay';
    return ov;
  }

  function _promptName(resolve){
    var ov = _createOverlayEl();
    var modal = document.createElement('div');
    modal.className = 'hs-modal';
    modal.innerHTML = '<h2>TOP 10 CANDIDATE</h2>' +
      '<div class="hs-new">Enter your name, then verify on-chain.</div>' +
      '<div class="hs-name-entry">' +
      '<label>Player Name (3-12 chars)</label>' +
      '<input type="text" id="hs-name-input" maxlength="12" placeholder="AAA">' +
      '<button id="hs-name-ok">Continue</button>' +
      '</div>';
    ov.appendChild(modal);
    document.body.appendChild(ov);

    var inp = document.getElementById('hs-name-input');
    var btn = document.getElementById('hs-name-ok');
    inp.focus();

    function submit(){
      var name = _safePlayerName(inp.value);
      try{ document.body.removeChild(ov); }catch(e){}
      resolve(name);
    }

    btn.onclick = submit;
    inp.onkeydown = function(e){ if(e.key === 'Enter') submit(); };
  }

  function renderOverlay(opts){
    opts = opts || {};
    hideOverlay();

    var gameId = _safeGameId(opts.gameId);
    var mode = opts.mode === 'time' ? 'time' : 'score';
    var title = opts.title || gameId;
    var highlightIdx = opts.highlightIdx != null ? opts.highlightIdx : -1;
    var list = _normalizeLeaderboardList(opts.list || getTop10(gameId, mode), mode);

    var ov = _createOverlayEl();
    var modal = document.createElement('div');
    modal.className = 'hs-modal';

    var isTime = mode === 'time';
    var html = '<h2>Top 10 - ' + title + '</h2>';

    if(opts.subtitle){
      html += '<div class="hs-subtitle">' + _sanitizeAscii(opts.subtitle, 180, '') + '</div>';
    }

    html += '<table class="hs-table"><tr><th>#</th><th>Name</th><th>' + (isTime ? 'Time' : 'Score') + '</th></tr>';

    var i;
    for(i = 0; i < MAX_ENTRIES; i++){
      var row = list[i];
      var classes = [];
      if(i === highlightIdx) classes.push('hs-highlight');
      if(row && row.pending) classes.push('hs-pending');
      var clsAttr = classes.length ? ' class="' + classes.join(' ') + '"' : '';

      if(row){
        var value = isTime ? ArcadeUtils.formatTime(row.score) : ArcadeUtils.formatScore(row.score);
        html += '<tr' + clsAttr + '><td class="rank">' + (i + 1) + '</td><td class="name">' + row.name + '</td><td class="score-col">' + value + '</td></tr>';
      } else {
        html += '<tr' + clsAttr + '><td class="rank">' + (i + 1) + '</td><td class="name">---</td><td class="score-col">--</td></tr>';
      }
    }

    html += '</table>';

    if(opts.showVerifyButton){
      html += '<button class="hs-verify-btn" id="hs-verify">' + (opts.verifyLabel || 'Verify High Score On-Chain') + '</button>';
    }
    html += '<button class="hs-close-btn" id="hs-close">Close</button>';

    modal.innerHTML = html;
    ov.appendChild(modal);
    document.body.appendChild(ov);

    var closeBtn = document.getElementById('hs-close');
    closeBtn.onclick = function(){
      hideOverlay();
      if(typeof opts.onClose === 'function') opts.onClose();
    };

    ov.onclick = function(e){
      if(e.target === ov){
        hideOverlay();
        if(typeof opts.onClose === 'function') opts.onClose();
      }
    };

    var verifyBtn = document.getElementById('hs-verify');
    if(verifyBtn && typeof opts.onVerify === 'function'){
      verifyBtn.onclick = function(){
        verifyBtn.disabled = true;
        verifyBtn.textContent = 'Verifying...';
        Promise.resolve(opts.onVerify()).catch(function(error){
          var message = error && error.message ? error.message : String(error);
          if(typeof window !== 'undefined' && typeof window.alert === 'function'){
            window.alert('On-chain score submit failed: ' + message);
          }
        }).finally(function(){
          verifyBtn.disabled = false;
          verifyBtn.textContent = opts.verifyLabel || 'Verify High Score On-Chain';
        });
      };
    }

    return ov;
  }

  function hideOverlay(){
    var overlays = document.querySelectorAll('.hs-overlay');
    overlays.forEach(function(o){
      try{ document.body.removeChild(o); }catch(e){}
    });
  }

  function _shouldOfferOnChain(rank){
    return !!(
      _isOnChainReady() &&
      rank > 0 &&
      rank <= onChainConfig.minRank
    );
  }

  function _offerVerifyFlow(opts){
    var settled = false;

    return new Promise(function(resolve){
      function done(result){
        if(settled) return;
        settled = true;
        resolve(result);
      }

      var pendingEntry = {
        name: _safePlayerName(opts.name),
        score: opts.score,
        updatedAt: 0,
        player: null,
        pending: true,
        rank: opts.rank
      };
      var preview = _buildPreviewList(opts.currentTop10, opts.rank, pendingEntry);

      renderOverlay({
        gameId: opts.gameId,
        mode: opts.mode,
        title: opts.title,
        list: preview,
        highlightIdx: opts.rank - 1,
        subtitle: 'Top 10 reached. Verify now or this score is discarded.',
        showVerifyButton: true,
        verifyLabel: 'Verify High Score On-Chain',
        onVerify: function(){
          return submitOnChainScore({
            gameId: opts.gameId,
            mode: opts.mode,
            score: opts.score,
            playerName: opts.name,
            rank: opts.rank
          }).then(function(result){
            return fetchTop10(opts.gameId, opts.mode, { force: true, allowStale: true })
              .then(function(latest){
                renderOverlay({
                  gameId: opts.gameId,
                  mode: opts.mode,
                  title: opts.title,
                  list: latest,
                  highlightIdx: -1,
                  subtitle: 'Score verified on-chain' + (result && result.txId ? ' · tx ' + String(result.txId).slice(0, 12) + '...' : '')
                });
              })
              .catch(function(){
                hideOverlay();
              })
              .finally(function(){
                done({
                  offered: true,
                  submitted: true,
                  txId: result && result.txId ? result.txId : null
                });
              });
          }).catch(function(error){
            var message = error && error.message ? error.message : String(error);
            if(typeof window !== 'undefined' && typeof window.alert === 'function'){
              window.alert('On-chain score submit failed: ' + message);
            }
            done({ offered: true, submitted: false, error: message });
            throw error;
          });
        },
        onClose: function(){
          done({ offered: true, submitted: false, skipped: true });
        }
      });
    });
  }

  function maybeSubmit(opts){
    opts = opts || {};

    var gameId = _safeGameId(opts.gameId);
    var score = Math.floor(Number(opts.score));
    var mode = opts.mode === 'time' ? 'time' : 'score';
    var title = opts.title || gameId;

    if(!isFinite(score) || score <= 0){
      renderOverlay({
        gameId: gameId,
        mode: mode,
        title: title,
        subtitle: 'Invalid score. Nothing submitted.'
      });
      return Promise.resolve({ submitted: false, onChain: { offered: false, submitted: false } });
    }

    var pb = _recordPersonalBest(gameId, mode, score);

    return fetchTop10(gameId, mode, { force: true, allowStale: true })
      .catch(function(){
        return getTop10(gameId, mode);
      })
      .then(function(board){
        var rank = _findRank(board, mode, score);

        if(!_shouldOfferOnChain(rank)){
          var subtitle = rank
            ? 'On-chain leaderboard is not configured. Candidate score discarded.'
            : 'Not in Top 10. Personal best is saved locally.';
          renderOverlay({
            gameId: gameId,
            mode: mode,
            title: title,
            list: board,
            highlightIdx: -1,
            subtitle: subtitle
          });
          return {
            submitted: false,
            rank: rank || null,
            personalBest: pb.best,
            onChain: { offered: false, submitted: false }
          };
        }

        return new Promise(function(resolve){
          _promptName(function(name){
            _offerVerifyFlow({
              gameId: gameId,
              mode: mode,
              title: title,
              score: score,
              name: name,
              rank: rank,
              currentTop10: board
            }).then(function(onChain){
              resolve({
                submitted: !!onChain.submitted,
                rank: rank,
                personalBest: pb.best,
                onChain: onChain
              });
            });
          });
        });
      });
  }

  function clearAll(){
    try{ localStorage.removeItem(PB_STORAGE_KEY); }catch(e){}
    leaderboardCache = {};
  }

  function _qualifies(gameId, mode, value, listOverride){
    var list = listOverride || getTop10(gameId, mode);
    return _findRank(list, mode === 'time' ? 'time' : 'score', value) > 0;
  }

  function _addEntry(gameId, mode, name, value){
    var k = _key(gameId, mode);
    var rank = _findRank(getTop10(gameId, mode), mode === 'time' ? 'time' : 'score', value);
    if(!rank) return -1;

    var entry = {
      rank: rank,
      name: _safePlayerName(name),
      score: Math.floor(_toSafeNumber(value)),
      updatedAt: 0,
      player: null,
      pending: true
    };

    var next = _buildPreviewList(getTop10(gameId, mode), rank, entry);
    leaderboardCache[k] = next;
    return rank - 1;
  }

  return {
    getTop10: getTop10,
    fetchTop10: fetchTop10,
    getBest: getBest,
    getPersonalBest: getBest,
    maybeSubmit: maybeSubmit,
    renderOverlay: renderOverlay,
    hideOverlay: hideOverlay,
    clearAll: clearAll,
    configureOnChain: configureOnChain,
    getOnChainConfig: getOnChainConfig,
    setOnChainSubmitter: setOnChainSubmitter,
    setOnChainLeaderboardFetcher: setOnChainLeaderboardFetcher,
    submitOnChainScore: submitOnChainScore,
    _qualifies: _qualifies,
    _addEntry: _addEntry,
    _shouldOfferOnChain: _shouldOfferOnChain,
    _recordPersonalBest: _recordPersonalBest
  };
})();
