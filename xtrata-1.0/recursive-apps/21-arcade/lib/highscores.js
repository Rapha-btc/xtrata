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
    contractName: 'xtrata-arcade-scores-v1-3',
    functionName: 'submit-score',
    leaderboardFunctionName: 'get-top10',
    apiBaseUrl: '',
    apiFallbackBaseUrls: [],
    readSenderAddress: '',
    requiresAttestation: false,
    attestationEndpoint: '',
    attestationTimeoutMs: 10000,
    minRank: 10,
    useDenyModePostConditions: true,
    fallbackToAllowModeOnPostConditionFailure: false,
    debug: false
  };

  var onChainConfig = _normalizeOnChainConfig(
    typeof window !== 'undefined' ? window.ARCADE_ONCHAIN_CONFIG : null
  );
  var customOnChainSubmitter = null;
  var customLeaderboardFetcher = null;
  var leaderboardCache = {};
  var submitInFlight = null;
  var submitFlowInFlight = {};
  var finalizedScoreResults = {};
  var FINALIZED_SCORE_TTL_MS = 30000;
  var scoringDisabledState = _loadScoringDisabledState();
  var feeUnitCacheByContract = {};
  var ONCHAIN_DEBUG_THROTTLE_DEFAULT_MS = 450;
  var ONCHAIN_DEBUG_THROTTLE_SUMMARY_IDLE_MS = 1800;
  var onChainDebugThrottleState = {};
  var onChainRpcLogOnceState = {};
  var onChainReadOnlyCallCounter = 0;
  var ONCHAIN_DEBUG_THROTTLE_RULES = {
    'Wallet request attempt #': 1300,
    'Wallet request returned result': 900,
    'Wallet transactionRequest payload prepared': 1200,
    'Retrying leaderboard read with fallback sender': 1800,
    'Retrying leaderboard read with fallback endpoint': 1800,
    'Read-only leaderboard call completed': 1400,
    'Read-only leaderboard call completed via fallback': 2200,
    'fetchTop10 served from cache': 1200,
    'Provider discovery started': 1200,
    'Provider discovery completed': 1200
  };

  var POST_CONDITION_MODE_ALLOW = 1;
  var POST_CONDITION_MODE_DENY = 2;

  function _debugEnabled(){
    if(onChainConfig && onChainConfig.debug) return true;
    if(typeof window !== 'undefined' && window.ARCADE_ONCHAIN_DEBUG === true) return true;
    return false;
  }

  function _emitDebugLine(level, message, detail){
    if(typeof console === 'undefined') return;
    var logFn = console[level];
    if(typeof logFn !== 'function') logFn = console.log;
    try{
      if(typeof detail === 'undefined'){
        logFn.call(console, '[ArcadeOnChain] ' + message);
      } else {
        logFn.call(console, '[ArcadeOnChain] ' + message, detail);
      }
    }catch(e){}
  }

  function _normalizeDebugMessageForKey(message){
    return String(message || '').replace(/#[0-9]+/g, '#*');
  }

  function _cloneDebugDetail(detail){
    if(typeof detail === 'undefined') return undefined;
    if(detail === null) return null;
    if(typeof detail === 'string' || typeof detail === 'number' || typeof detail === 'boolean'){
      return detail;
    }
    try{
      return JSON.parse(JSON.stringify(detail));
    }catch(e){
      if(detail && typeof detail === 'object'){
        return _errorForLog(detail);
      }
      return String(detail);
    }
  }

  function _debugThrottleWindowMs(level, message){
    if(level === 'error') return 0;
    var normalized = _normalizeDebugMessageForKey(message);
    var key;
    for(key in ONCHAIN_DEBUG_THROTTLE_RULES){
      if(!Object.prototype.hasOwnProperty.call(ONCHAIN_DEBUG_THROTTLE_RULES, key)) continue;
      if(normalized.indexOf(key) === 0){
        return ONCHAIN_DEBUG_THROTTLE_RULES[key];
      }
    }
    if(level === 'warn') return 700;
    if(level === 'info') return ONCHAIN_DEBUG_THROTTLE_DEFAULT_MS;
    return 0;
  }

  function _debugThrottleKey(level, message, detail){
    var key = String(level || 'log') + '|' + _normalizeDebugMessageForKey(message);
    if(detail && typeof detail === 'object'){
      if(detail.providerLabel) key += '|provider:' + String(detail.providerLabel);
      else if(detail.provider) key += '|provider:' + String(detail.provider);
      if(detail.method) key += '|method:' + String(detail.method);
      if(detail.functionName) key += '|fn:' + String(detail.functionName);
    }
    return key;
  }

  function _flushOnChainDebugThrottleSummaries(now){
    var key;
    for(key in onChainDebugThrottleState){
      if(!Object.prototype.hasOwnProperty.call(onChainDebugThrottleState, key)) continue;
      var state = onChainDebugThrottleState[key];
      if(!state || !state.suppressedCount) continue;
      if(now - state.lastAt < ONCHAIN_DEBUG_THROTTLE_SUMMARY_IDLE_MS) continue;
      _emitDebugLine('info', 'Debug summary: throttled repeated logs', {
        message: state.message,
        level: state.level,
        suppressed: state.suppressedCount,
        windowMs: state.windowMs,
        lastDetail: state.lastDetail
      });
      state.suppressedCount = 0;
      state.lastDetail = null;
      state.lastSummaryAt = now;
    }
  }

  function _debugLog(level, message, detail){
    if(!_debugEnabled()) return;
    var now = Date.now();
    _flushOnChainDebugThrottleSummaries(now);
    var windowMs = _debugThrottleWindowMs(level, message);
    if(windowMs > 0){
      var key = _debugThrottleKey(level, message, detail);
      var state = onChainDebugThrottleState[key];
      if(!state){
        state = {
          level: String(level || 'log'),
          message: String(message || ''),
          windowMs: windowMs,
          lastAt: 0,
          lastSummaryAt: 0,
          suppressedCount: 0,
          lastDetail: null
        };
        onChainDebugThrottleState[key] = state;
      }
      if(state.lastAt > 0 && (now - state.lastAt) < windowMs){
        state.suppressedCount += 1;
        state.lastDetail = _cloneDebugDetail(detail);
        return;
      }
      if(state.suppressedCount > 0){
        _emitDebugLine('info', 'Debug summary: throttled repeated logs', {
          message: state.message,
          level: state.level,
          suppressed: state.suppressedCount,
          windowMs: state.windowMs,
          lastDetail: state.lastDetail
        });
        state.suppressedCount = 0;
        state.lastDetail = null;
        state.lastSummaryAt = now;
      }
      state.lastAt = now;
    }
    _emitDebugLine(level, message, detail);
  }

  function _originForRpcLog(){
    if(typeof window === 'undefined' || !window.location){
      return 'unknown-origin';
    }
    if(typeof window.location.origin === 'string' && window.location.origin){
      return window.location.origin;
    }
    var protocol = window.location.protocol || 'http:';
    var host = window.location.host || 'localhost';
    return protocol + '//' + host;
  }

  function _rpcLogOnce(key, message, detail){
    if(!_debugEnabled()) return;
    var normalizedKey = String(key || '').trim();
    if(!normalizedKey) return;
    if(onChainRpcLogOnceState[normalizedKey]) return;
    onChainRpcLogOnceState[normalizedKey] = true;
    _debugLog('info', '[RPC] ' + message, detail);
  }

  function _errorForLog(error){
    if(!error) return null;
    var out = {
      name: error.name || null,
      message: error.message || String(error),
      code: error.code || null
    };
    if(typeof error.data !== 'undefined'){
      out.data = error.data;
    } else if(error.rpc && error.rpc.error && typeof error.rpc.error.data !== 'undefined'){
      out.data = error.rpc.error.data;
    }
    return out;
  }

  function _loadPB(){
    try{
      var raw = localStorage.getItem(PB_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    }catch(e){
      return {};
    }
  }

  function _loadScoringDisabledState(){
    return { disabled: false, reason: '', at: 0, gameId: '' };
  }

  function _savePB(data){
    try{
      localStorage.setItem(PB_STORAGE_KEY, JSON.stringify(data));
    }catch(e){}
  }

  function _saveScoringDisabledState(){
    // Scoring lock is intentionally in-memory only.
    // It resets when a new game starts or on page reload.
  }

  function isScoringDisabled(gameId){
    if(!scoringDisabledState || scoringDisabledState.disabled !== true){
      return false;
    }
    var lockedGameId = scoringDisabledState.gameId || '';
    if(!lockedGameId){
      return true;
    }
    if(!gameId){
      return false;
    }
    return _safeGameId(gameId) === lockedGameId;
  }

  function disableScoring(reason, gameId){
    var scopedGameId = gameId ? _safeGameId(gameId) : '';
    if(isScoringDisabled(scopedGameId)) return false;
    scoringDisabledState = {
      disabled: true,
      reason: typeof reason === 'string' ? reason : '',
      at: Date.now(),
      gameId: scopedGameId
    };
    _saveScoringDisabledState();
    return true;
  }

  function getScoringDisabledState(gameId){
    var applies = isScoringDisabled(gameId);
    return {
      disabled: applies,
      reason: applies && scoringDisabledState && scoringDisabledState.reason ? scoringDisabledState.reason : '',
      at: applies && scoringDisabledState && scoringDisabledState.at ? scoringDisabledState.at : 0,
      gameId: scoringDisabledState && scoringDisabledState.gameId ? scoringDisabledState.gameId : ''
    };
  }

  function clearScoringDisabled(gameId){
    if(!scoringDisabledState || scoringDisabledState.disabled !== true){
      return false;
    }
    var lockedGameId = scoringDisabledState.gameId || '';
    if(gameId && lockedGameId && _safeGameId(gameId) !== lockedGameId){
      return false;
    }
    scoringDisabledState = { disabled: false, reason: '', at: 0, gameId: '' };
    _saveScoringDisabledState();
    return true;
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
      pending: !!entry.pending,
      submitted: !!entry.submitted,
      onChain: !!entry.onChain
    };
  }

  function _copyList(list){
    return (list || []).map(_copyEntry);
  }

  function _cloneSubmitResult(result){
    if(!result || typeof result !== 'object') return result;
    var clone = Object.assign({}, result);
    if(result.onChain && typeof result.onChain === 'object'){
      clone.onChain = Object.assign({}, result.onChain);
    }
    return clone;
  }

  function _getCachedFinalizedScoreResult(key){
    var cached = finalizedScoreResults[key];
    if(!cached) return null;
    if(Date.now() > cached.expiresAt){
      delete finalizedScoreResults[key];
      return null;
    }
    return _cloneSubmitResult(cached.result);
  }

  function _cacheFinalizedScoreResult(key, result){
    finalizedScoreResults[key] = {
      result: _cloneSubmitResult(result),
      expiresAt: Date.now() + FINALIZED_SCORE_TTL_MS
    };
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

  function _computeInsertRank(list, mode, score){
    var normalized = _normalizeLeaderboardList(list, mode);
    return _findRank(normalized, mode, score);
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

  function _entriesMatch(a, b){
    if(!a || !b) return false;
    return (
      _safePlayerName(a.name) === _safePlayerName(b.name) &&
      Math.floor(_toSafeNumber(a.score)) === Math.floor(_toSafeNumber(b.score))
    );
  }

  function _findEntryIndex(list, target){
    if(!Array.isArray(list) || !target) return -1;
    var i;
    for(i = 0; i < list.length; i++){
      if(_entriesMatch(list[i], target)) return i;
    }
    return -1;
  }

  function _escapeHtml(input){
    return String(input == null ? '' : input)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function _buildPostSubmitDisplay(list, mode, candidate, rankHint){
    var normalized = _normalizeLeaderboardList(list, mode);
    var idx = _findEntryIndex(normalized, candidate);
    if(idx >= 0){
      normalized[idx].pending = false;
      normalized[idx].submitted = false;
      normalized[idx].onChain = true;
      return { list: normalized, highlightIdx: idx, onChain: true };
    }

    var optimistic = {
      rank: rankHint,
      name: _safePlayerName(candidate.name),
      score: Math.floor(_toSafeNumber(candidate.score)),
      updatedAt: 0,
      player: null,
      pending: false,
      submitted: true,
      onChain: false
    };
    var preview = _buildPreviewList(normalized, rankHint, optimistic);
    var previewIdx = _findEntryIndex(preview, optimistic);
    return {
      list: preview,
      highlightIdx: previewIdx >= 0 ? previewIdx : (rankHint - 1),
      onChain: false
    };
  }

  function _scheduleOnChainRefresh(opts){
    if(typeof document === 'undefined') return;
    var attempts = 4;
    var delayMs = 3500;

    function hasOverlay(){
      return !!document.querySelector('.hs-overlay');
    }

    function poll(attempt){
      if(attempt >= attempts) return;
      setTimeout(function(){
        if(!hasOverlay()) return;
        fetchTop10(opts.gameId, opts.mode, { force: true, allowStale: true })
          .then(function(latest){
            var display = _buildPostSubmitDisplay(latest, opts.mode, opts.candidate, opts.rank);
            if(display.onChain){
              renderOverlay({
                gameId: opts.gameId,
                mode: opts.mode,
                title: opts.title,
                list: display.list,
                highlightIdx: display.highlightIdx,
                subtitle: 'Score verified on-chain' + (opts.txId ? ' · tx ' + String(opts.txId).slice(0, 12) + '...' : '')
              });
              return;
            }
            poll(attempt + 1);
          })
          .catch(function(){
            poll(attempt + 1);
          });
      }, delayMs);
    }

    poll(0);
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
      contractName: source.contractName || 'xtrata-arcade-scores-v1-3',
      functionName: source.functionName || 'submit-score',
      leaderboardFunctionName: source.leaderboardFunctionName || 'get-top10',
      apiBaseUrl: source.apiBaseUrl || '',
      apiFallbackBaseUrls: Array.isArray(source.apiFallbackBaseUrls) ? source.apiFallbackBaseUrls.slice() : [],
      readSenderAddress: source.readSenderAddress || '',
      requiresAttestation: !!source.requiresAttestation,
      attestationEndpoint: source.attestationEndpoint || '',
      attestationTimeoutMs: source.attestationTimeoutMs || 10000,
      minRank: source.minRank || 10,
      useDenyModePostConditions: !!source.useDenyModePostConditions,
      fallbackToAllowModeOnPostConditionFailure: !!source.fallbackToAllowModeOnPostConditionFailure,
      debug: !!source.debug
    };
  }

  function _normalizeApiFallbackList(input){
    if(!input) return [];
    var rawList;
    if(Array.isArray(input)){
      rawList = input;
    } else if(typeof input === 'string'){
      rawList = input.split(',');
    } else {
      return [];
    }
    var out = [];
    var i;
    for(i = 0; i < rawList.length; i++){
      var value = String(rawList[i] == null ? '' : rawList[i]).trim();
      if(!value || out.indexOf(value) >= 0) continue;
      out.push(value);
    }
    return out;
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
    base.apiFallbackBaseUrls = _normalizeApiFallbackList(input.apiFallbackBaseUrls);
    if(typeof input.readSenderAddress === 'string') base.readSenderAddress = input.readSenderAddress.trim();
    if(typeof input.requiresAttestation === 'boolean'){
      base.requiresAttestation = input.requiresAttestation;
    }
    if(typeof input.attestationEndpoint === 'string'){
      base.attestationEndpoint = input.attestationEndpoint.trim();
    }

    var timeoutNum = Number(input.attestationTimeoutMs);
    if(isFinite(timeoutNum) && timeoutNum >= 1000){
      base.attestationTimeoutMs = Math.floor(timeoutNum);
    }

    var rankNum = Number(input.minRank);
    if(isFinite(rankNum) && rankNum > 0){
      base.minRank = Math.floor(rankNum);
    }
    if(typeof input.useDenyModePostConditions === 'boolean'){
      base.useDenyModePostConditions = input.useDenyModePostConditions;
    }
    if(typeof input.fallbackToAllowModeOnPostConditionFailure === 'boolean'){
      base.fallbackToAllowModeOnPostConditionFailure = input.fallbackToAllowModeOnPostConditionFailure;
    }
    if(typeof input.debug === 'boolean') base.debug = input.debug;

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
    _debugLog('info', 'Updated on-chain config', onChainConfig);
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

  function _encodeBufferCV(hexValue){
    var clean = _stripHexPrefix(String(hexValue == null ? '' : hexValue)).toLowerCase();
    if(!clean || clean.length % 2 !== 0 || /[^0-9a-f]/.test(clean)){
      throw new Error('Contract call buffer must be a valid hex string.');
    }
    var byteLen = clean.length / 2;
    var lenHex = byteLen.toString(16);
    while(lenHex.length < 8) lenHex = '0' + lenHex;
    return '0x02' + lenHex + clean;
  }

  var C32_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  var STX_POST_CONDITION_TYPE = 0;
  var POST_CONDITION_PRINCIPAL_STANDARD = 2;

  function _leftPadHex(value, length){
    var hex = String(value == null ? '' : value).toLowerCase();
    while(hex.length < length) hex = '0' + hex;
    return hex;
  }

  function _normalizeC32(input){
    return String(input == null ? '' : input)
      .toUpperCase()
      .replace(/O/g, '0')
      .replace(/[LI]/g, '1');
  }

  function _c32DecodeHex(input){
    var normalized = _normalizeC32(input);
    if(!normalized || !new RegExp('^[' + C32_ALPHABET + ']+$').test(normalized)){
      throw new Error('Invalid c32 data.');
    }
    var zeroPrefix = 0;
    while(zeroPrefix < normalized.length && normalized.charAt(zeroPrefix) === C32_ALPHABET.charAt(0)){
      zeroPrefix += 1;
    }

    var hexDigits = [];
    var carry = 0;
    var carryBits = 0;
    var i;
    for(i = normalized.length - 1; i >= 0; i--){
      if(carryBits === 4){
        hexDigits.unshift(carry.toString(16));
        carryBits = 0;
        carry = 0;
      }
      var idx = C32_ALPHABET.indexOf(normalized.charAt(i));
      if(idx < 0){
        throw new Error('Invalid c32 alphabet character.');
      }
      var current = (idx << carryBits) + carry;
      var nibble = current & 0x0f;
      hexDigits.unshift(nibble.toString(16));
      carryBits += 1;
      carry = current >> 4;
      if(carry > (1 << carryBits)){
        throw new Error('Invalid c32 carry state.');
      }
    }
    hexDigits.unshift(carry.toString(16));
    if(hexDigits.length % 2 === 1){
      hexDigits.unshift('0');
    }

    var trim = 0;
    while(trim < hexDigits.length && hexDigits[trim] === '0'){
      trim += 1;
    }
    trim = trim - (trim % 2);
    hexDigits = hexDigits.slice(trim);
    var out = hexDigits.join('');
    for(i = 0; i < zeroPrefix; i++){
      out = '00' + out;
    }
    return out.toLowerCase();
  }

  function _decodeStacksAddressNoChecksum(address){
    var normalized = _normalizeC32(address);
    if(normalized.length <= 5 || normalized.charAt(0) !== 'S'){
      throw new Error('Invalid Stacks address.');
    }
    var payload = normalized.substring(1);
    var version = C32_ALPHABET.indexOf(payload.charAt(0));
    if(version < 0){
      throw new Error('Invalid Stacks address version.');
    }
    var decoded = _c32DecodeHex(payload.substring(1));
    if(decoded.length < 8){
      throw new Error('Stacks address payload is too short.');
    }
    // c32check payload is hash160 + 4-byte checksum.
    var hash160 = decoded.substring(0, decoded.length - 8);
    if(!/^[0-9a-f]+$/.test(hash160)){
      throw new Error('Stacks address payload is not valid hex.');
    }
    if(hash160.length < 40){
      hash160 = _leftPadHex(hash160, 40);
    }
    if(hash160.length > 40){
      hash160 = hash160.substring(hash160.length - 40);
    }
    return {
      version: version,
      hash160Hex: hash160
    };
  }

  function _normalizeStxConditionCode(value){
    if(typeof value === 'number' && isFinite(value)){
      var numeric = Math.floor(value);
      if(numeric >= 1 && numeric <= 5) return numeric;
    }
    var normalized = String(value == null ? '' : value).toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if(
      normalized === 'equal' ||
      normalized === 'eq' ||
      normalized === 'sent_equal'
    ){
      return 1;
    }
    if(
      normalized === 'greater' ||
      normalized === 'gt' ||
      normalized === 'sent_greater'
    ){
      return 2;
    }
    if(
      normalized === 'greater_equal' ||
      normalized === 'ge' ||
      normalized === 'gte' ||
      normalized === 'sent_greater_equal'
    ){
      return 3;
    }
    if(
      normalized === 'less' ||
      normalized === 'lt' ||
      normalized === 'sent_less'
    ){
      return 4;
    }
    if(
      normalized === 'less_equal' ||
      normalized === 'le' ||
      normalized === 'lte' ||
      normalized === 'sent_less_equal'
    ){
      return 5;
    }
    throw new Error('Unsupported STX post condition code.');
  }

  function _uintToFixedHex(value, byteLength, label){
    var amount = _normalizeUIntInput(value, label);
    var bigint = BigInt(amount);
    var max = (1n << BigInt(byteLength * 8)) - 1n;
    if(bigint < 0n || bigint > max){
      throw new Error(label + ' exceeds uint' + (byteLength * 8) + '.');
    }
    return _leftPadHex(bigint.toString(16), byteLength * 2);
  }

  function _serializeStxPostConditionHex(postCondition){
    if(!postCondition || typeof postCondition !== 'object'){
      throw new Error('Post condition must be an object.');
    }
    var type = String(postCondition.type || '').toLowerCase();
    if(type && type !== 'stx'){
      throw new Error('Only STX post conditions are supported for score submit.');
    }

    var principal = String(postCondition.address || postCondition.principal || '').trim();
    if(!_looksLikeStacksAddress(principal)){
      throw new Error('STX post condition principal address is invalid.');
    }

    var decoded = _decodeStacksAddressNoChecksum(principal);
    var conditionCode = _normalizeStxConditionCode(
      typeof postCondition.conditionCode !== 'undefined'
        ? postCondition.conditionCode
        : postCondition.condition
    );
    var amountHex = _uintToFixedHex(postCondition.amount, 8, 'Post condition amount');
    return (
      _leftPadHex(STX_POST_CONDITION_TYPE.toString(16), 2) +
      _leftPadHex(POST_CONDITION_PRINCIPAL_STANDARD.toString(16), 2) +
      _leftPadHex(decoded.version.toString(16), 2) +
      decoded.hash160Hex +
      _leftPadHex(conditionCode.toString(16), 2) +
      amountHex
    );
  }

  function _toPostConditionHexList(postConditions){
    if(!Array.isArray(postConditions) || postConditions.length === 0){
      return [];
    }
    var out = [];
    var i;
    for(i = 0; i < postConditions.length; i++){
      var item = postConditions[i];
      if(typeof item === 'string'){
        var clean = _stripHexPrefix(item).toLowerCase();
        if(!clean || clean.length % 2 !== 0 || /[^0-9a-f]/.test(clean)){
          throw new Error('Post condition hex string is invalid.');
        }
        out.push(clean);
      } else {
        out.push(_serializeStxPostConditionHex(item));
      }
    }
    return out;
  }

  function _collectPostConditionSpecs(params){
    var sets = [];
    var i;
    if(Array.isArray(params.postConditionVariants) && params.postConditionVariants.length > 0){
      for(i = 0; i < params.postConditionVariants.length; i++){
        if(Array.isArray(params.postConditionVariants[i]) && params.postConditionVariants[i].length > 0){
          sets.push(params.postConditionVariants[i]);
        }
      }
    } else if(Array.isArray(params.postConditions) && params.postConditions.length > 0){
      sets.push(params.postConditions);
    }

    if(sets.length === 0){
      return [{ labelSuffix: '', postConditions: null }];
    }

    var specs = [];
    for(i = 0; i < sets.length && i < 2; i++){
      var suffix = ':pc' + (i + 1);
      var rawSet = sets[i];
      try{
        var hexSet = _toPostConditionHexList(rawSet);
        if(hexSet.length > 0){
          specs.push({
            labelSuffix: suffix + ':hex',
            postConditions: hexSet
          });
        }
      }catch(error){
        _debugLog('warn', 'Failed to serialize post conditions as hex; using raw object format variant', {
          suffix: suffix,
          error: _errorForLog(error)
        });
      }
      specs.push({
        labelSuffix: suffix + ':raw',
        postConditions: rawSet
      });
    }
    return specs;
  }

  function _collectFunctionArgSpecs(functionArgs){
    var baseArgs = Array.isArray(functionArgs) ? functionArgs.slice() : [];
    var stripped = [];
    var changed = false;
    var i;
    for(i = 0; i < baseArgs.length; i++){
      var arg = baseArgs[i];
      if(typeof arg === 'string'){
        var strippedArg = _stripHexPrefix(arg);
        if(strippedArg !== arg) changed = true;
        stripped.push(strippedArg);
      } else {
        stripped.push(arg);
      }
    }
    if(changed){
      return [
        { labelSuffix: ':args-no0x', functionArgs: stripped },
        { labelSuffix: ':args-0x', functionArgs: baseArgs }
      ];
    }
    return [{ labelSuffix: ':args', functionArgs: baseArgs }];
  }

  function _providerDebugSnapshot(){
    if(typeof window === 'undefined'){
      return { env: 'non-browser' };
    }
    return {
      origin: window.location ? window.location.origin : null,
      hasStacksProvider: !!window.StacksProvider,
      hasLeatherProvider: !!window.LeatherProvider,
      hasBtc: !!window.btc,
      hasStacks: !!window.stacks,
      hasBitcoinProvider: !!window.BitcoinProvider,
      hasXverseProviders: !!window.XverseProviders,
      hasxverseProviders: !!window.xverseProviders,
      btcProvidersCount: Array.isArray(window.btc_providers) ? window.btc_providers.length : 0,
      webbtcProvidersCount: Array.isArray(window.webbtc_providers) ? window.webbtc_providers.length : 0,
      wbipProvidersCount: Array.isArray(window.wbip_providers) ? window.wbip_providers.length : 0
    };
  }

  function _collectStacksProviders(){
    if(typeof window === 'undefined') return null;

    _debugLog('info', 'Provider discovery started', _providerDebugSnapshot());

    var directCandidates = [
      { label: 'window.StacksProvider', value: window.StacksProvider },
      { label: 'window.LeatherProvider', value: window.LeatherProvider },
      { label: 'window.XverseProviders', value: window.XverseProviders },
      { label: 'window.xverseProviders', value: window.xverseProviders },
      {
        label: 'window.XverseProviders.StacksProvider',
        value: window.XverseProviders && window.XverseProviders.StacksProvider
      },
      {
        label: 'window.xverseProviders.StacksProvider',
        value: window.xverseProviders && window.xverseProviders.StacksProvider
      },
      {
        label: 'window.XverseProviders.BitcoinProvider',
        value: window.XverseProviders && window.XverseProviders.BitcoinProvider
      },
      {
        label: 'window.xverseProviders.BitcoinProvider',
        value: window.xverseProviders && window.xverseProviders.BitcoinProvider
      },
      { label: 'window.btc', value: window.btc },
      { label: 'window.stacks', value: window.stacks },
      { label: 'window.BitcoinProvider', value: window.BitcoinProvider }
    ];
    var out = [];

    function pushProvider(provider, label){
      if(
        !provider ||
        (typeof provider.request !== 'function' && typeof provider.transactionRequest !== 'function')
      ) return;
      var i;
      for(i = 0; i < out.length; i++){
        if(out[i].provider === provider) return;
      }
      out.push({
        provider: provider,
        label: label,
        hasRequest: typeof provider.request === 'function',
        hasTransactionRequest: typeof provider.transactionRequest === 'function'
      });
    }

    var c;
    for(c = 0; c < directCandidates.length; c++){
      var directEntry = directCandidates[c];
      var direct = directEntry.value;
      if(direct && (typeof direct.request === 'function' || typeof direct.transactionRequest === 'function')){
        _debugLog('info', 'Provider discovered via direct global', {
          source: directEntry.label,
          hasRequest: typeof direct.request === 'function',
          hasTransactionRequest: typeof direct.transactionRequest === 'function'
        });
        pushProvider(direct, directEntry.label);
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
          methods.indexOf('stx_callContract') < 0 &&
          methods.indexOf('stx_callContractV2') < 0
        ){
          continue;
        }
        var provider = null;
        if(
          entry.provider &&
          (typeof entry.provider.request === 'function' || typeof entry.provider.transactionRequest === 'function')
        ){
          provider = entry.provider;
        } else if(typeof entry.id === 'string' && entry.id){
          provider = _resolveProviderPath(entry.id);
        }
        if(provider && (typeof provider.request === 'function' || typeof provider.transactionRequest === 'function')){
          _debugLog('info', 'Provider discovered via provider registry', {
            registryIndex: r,
            providerName: entry.name || null,
            providerId: entry.id || null,
            methods: methods || null,
            hasRequest: typeof provider.request === 'function',
            hasTransactionRequest: typeof provider.transactionRequest === 'function'
          });
          pushProvider(provider, 'registry:' + (entry.name || entry.id || ('#' + i)));
        }
      }
    }

    if(out.length === 0){
      _debugLog('warn', 'No provider detected after discovery sweep', _providerDebugSnapshot());
      return [];
    }
    out.sort(function(a, b){
      function scoreProvider(item){
        var label = String(item.label || '').toLowerCase();
        var score = 0;
        if(item.hasTransactionRequest) score += 100;
        if(item.hasRequest) score += 10;
        if(label.indexOf('bitcoinprovider') >= 0) score += 40;
        if(label.indexOf('xverse') >= 0) score += 20;
        if(label.indexOf('registry:') === 0) score += 15;
        if(label.indexOf('window.stacksprovider') === 0) score -= 10;
        return score;
      }
      return scoreProvider(b) - scoreProvider(a);
    });

    _debugLog('info', 'Provider discovery completed', {
      count: out.length,
      labels: out.map(function(item){ return item.label; }),
      capabilities: out.map(function(item){
        return {
          label: item.label,
          hasRequest: !!item.hasRequest,
          hasTransactionRequest: !!item.hasTransactionRequest
        };
      })
    });
    return out;
  }

  function _getStacksProvider(){
    var providers = _collectStacksProviders();
    return providers && providers.length ? providers[0].provider : null;
  }

  function _resolveProviderPath(path){
    if(typeof window === 'undefined') return null;
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

  function _legacyNetworkConfig(network){
    var normalized = String(network || 'mainnet').toLowerCase();
    if(normalized === 'testnet'){
      return {
        version: 128,
        chainId: 2147483648,
        bnsLookupUrl: 'https://api.mainnet.hiro.so',
        broadcastEndpoint: '/v2/transactions',
        transferFeeEstimateEndpoint: '/v2/fees/transfer',
        transactionFeeEstimateEndpoint: '/v2/fees/transaction',
        accountEndpoint: '/v2/accounts',
        contractAbiEndpoint: '/v2/contracts/interface',
        readOnlyFunctionCallEndpoint: '/v2/contracts/call-read',
        coreApiUrl: 'https://api.testnet.hiro.so'
      };
    }
    if(normalized === 'devnet' || normalized === 'regtest'){
      return {
        version: 128,
        chainId: 2147483648,
        bnsLookupUrl: 'http://localhost:3999',
        broadcastEndpoint: '/v2/transactions',
        transferFeeEstimateEndpoint: '/v2/fees/transfer',
        transactionFeeEstimateEndpoint: '/v2/fees/transaction',
        accountEndpoint: '/v2/accounts',
        contractAbiEndpoint: '/v2/contracts/interface',
        readOnlyFunctionCallEndpoint: '/v2/contracts/call-read',
        coreApiUrl: 'http://localhost:3999'
      };
    }
    return {
      version: 0,
      chainId: 1,
      bnsLookupUrl: 'https://api.mainnet.hiro.so',
      broadcastEndpoint: '/v2/transactions',
      transferFeeEstimateEndpoint: '/v2/fees/transfer',
      transactionFeeEstimateEndpoint: '/v2/fees/transaction',
      accountEndpoint: '/v2/accounts',
      contractAbiEndpoint: '/v2/contracts/interface',
      readOnlyFunctionCallEndpoint: '/v2/contracts/call-read',
      coreApiUrl: 'https://api.mainnet.hiro.so'
    };
  }

  function _normalizePostConditionMode(value){
    if(value === POST_CONDITION_MODE_ALLOW || value === POST_CONDITION_MODE_DENY) return value;
    if(typeof value === 'string'){
      var lower = value.toLowerCase();
      if(lower === 'allow') return POST_CONDITION_MODE_ALLOW;
      if(lower === 'deny') return POST_CONDITION_MODE_DENY;
    }
    return POST_CONDITION_MODE_ALLOW;
  }

  function _base64UrlEncodeUtf8(input){
    var base64;
    if(typeof btoa === 'function'){
      base64 = btoa(unescape(encodeURIComponent(String(input))));
    } else if(typeof Buffer !== 'undefined'){
      base64 = Buffer.from(String(input), 'utf8').toString('base64');
    } else {
      throw new Error('No base64 encoder is available in this environment.');
    }
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function _createUnsecuredJwt(payload){
    var header = { typ: 'JWT', alg: 'none' };
    return _base64UrlEncodeUtf8(JSON.stringify(header)) +
      '.' +
      _base64UrlEncodeUtf8(JSON.stringify(payload)) +
      '.';
  }

  function _buildContractCallParamVariants(params){
    var fullContract = params.contractAddress + '.' + params.contractName;
    var variants = [];
    var postConditionMode = _normalizePostConditionMode(params.postConditionMode);
    var postConditionSpecs = _collectPostConditionSpecs(params);
    var functionArgSpecs = _collectFunctionArgSpecs(params.functionArgs);

    function legacyVariant(modeValue, labelSuffix, postConditions, functionArgs){
      var out = {
        contractAddress: params.contractAddress,
        contractName: params.contractName,
        functionName: params.functionName,
        functionArgs: functionArgs,
        network: params.network,
        postConditionMode: modeValue
      };
      if(Array.isArray(postConditions) && postConditions.length > 0){
        out.postConditions = postConditions;
      }
      variants.push({
        label: 'legacy-split' + labelSuffix,
        params: out
      });
    }

    function minimalVariant(modeValue, labelSuffix, postConditions, functionArgs){
      var out = {
        contract: fullContract,
        functionName: params.functionName,
        functionArgs: functionArgs,
        network: params.network
      };
      if(typeof modeValue !== 'undefined'){
        out.postConditionMode = modeValue;
      }
      if(Array.isArray(postConditions) && postConditions.length > 0){
        out.postConditions = postConditions;
      }
      variants.push({
        label: 'sats-minimal' + labelSuffix,
        params: out
      });
    }

    var i;
    var j;
    for(i = 0; i < postConditionSpecs.length; i++){
      var postSpec = postConditionSpecs[i];
      for(j = 0; j < functionArgSpecs.length; j++){
        var argSpec = functionArgSpecs[j];
        var suffix = postSpec.labelSuffix + argSpec.labelSuffix;
        minimalVariant(
          postConditionMode === POST_CONDITION_MODE_DENY ? 'deny' : 'allow',
          suffix + ':mode-str',
          postSpec.postConditions,
          argSpec.functionArgs
        );
        minimalVariant(postConditionMode, suffix + ':mode-num', postSpec.postConditions, argSpec.functionArgs);
        legacyVariant(
          postConditionMode === POST_CONDITION_MODE_DENY ? 'deny' : 'allow',
          suffix + ':mode-str',
          postSpec.postConditions,
          argSpec.functionArgs
        );
        legacyVariant(postConditionMode, suffix + ':mode-num', postSpec.postConditions, argSpec.functionArgs);
      }
    }

    return variants;
  }

  function _buildTransactionRequestPayloadVariants(params){
    var base = {
      txType: 'contract_call',
      contractAddress: params.contractAddress,
      contractName: params.contractName,
      functionName: params.functionName
    };
    var network = params.network || 'mainnet';
    var postConditionMode = _normalizePostConditionMode(params.postConditionMode);
    var postConditionSpecs = _collectPostConditionSpecs(params);
    var functionArgSpecs = _collectFunctionArgSpecs(params.functionArgs);
    var networkSpecs = [
      { labelSuffix: ':net-str', network: network },
      { labelSuffix: ':net-obj', network: _legacyNetworkConfig(network) },
      { labelSuffix: ':net-none' }
    ];
    var variants = [];

    function addVariant(label, modeValue, postConditions, functionArgs, networkValue){
      var payload = Object.assign({}, base, {
        functionArgs: functionArgs,
        postConditionMode: modeValue
      });
      if(typeof networkValue !== 'undefined'){
        payload.network = networkValue;
      }
      if(Array.isArray(postConditions) && postConditions.length > 0){
        payload.postConditions = postConditions;
      }
      variants.push({ label: label, payload: payload });
    }

    var i;
    var j;
    var k;
    for(i = 0; i < postConditionSpecs.length; i++){
      var postSpec = postConditionSpecs[i];
      for(j = 0; j < functionArgSpecs.length; j++){
        var argSpec = functionArgSpecs[j];
        for(k = 0; k < networkSpecs.length; k++){
          var netSpec = networkSpecs[k];
          var suffix = postSpec.labelSuffix + argSpec.labelSuffix + netSpec.labelSuffix;
          addVariant(
            'tx-token-connect-mode-str' + suffix,
            postConditionMode === POST_CONDITION_MODE_DENY ? 'deny' : 'allow',
            postSpec.postConditions,
            argSpec.functionArgs,
            netSpec.network
          );
          addVariant(
            'tx-token-connect-mode-num' + suffix,
            postConditionMode,
            postSpec.postConditions,
            argSpec.functionArgs,
            netSpec.network
          );
        }
      }
    }
    return variants;
  }

  function _withTimeout(promise, ms, label){
    var timer = null;
    return new Promise(function(resolve, reject){
      timer = setTimeout(function(){
        var timeoutErr = new Error('Wallet request timed out after ' + ms + 'ms (' + label + ').');
        timeoutErr.code = 'ETIMEOUT';
        reject(timeoutErr);
      }, ms);
      Promise.resolve(promise).then(function(value){
        clearTimeout(timer);
        resolve(value);
      }).catch(function(error){
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  function _callProviderRequest(provider, method, params){
    if(!provider || typeof provider.request !== 'function'){
      throw new Error('Wallet provider request method is unavailable.');
    }
    if(provider.request.length >= 2){
      return provider.request(method, params);
    }
    return provider.request({ method: method, params: params });
  }

  function _callProviderMethod(provider, method){
    if(!provider || typeof provider.request !== 'function'){
      throw new Error('Wallet provider request method is unavailable.');
    }
    if(provider.request.length >= 2){
      return provider.request(method);
    }
    return provider.request({ method: method });
  }

  function _defaultProviderMethodParams(method, preferredNetwork){
    var target = preferredNetwork || _normalizeWalletNetwork(onChainConfig.network) || 'mainnet';
    var commonMessage = 'Connect Retro Arcade for on-chain leaderboard access';

    if(method === 'getAccounts' || method === 'getAddresses' || method === 'requestAccounts'){
      return [
        { purposes: ['stacks'], message: commonMessage },
        { purposes: ['payment', 'ordinals', 'stacks'], message: commonMessage },
        { addresses: ['stacks'] },
        { network: target }
      ];
    }
    if(method === 'wallet_getAccount'){
      return [
        { addresses: ['stacks'] },
        { addresses: ['payment', 'ordinals', 'stacks'] }
      ];
    }
    if(method === 'stx_getAccounts' || method === 'stx_getAddresses' || method === 'stx_requestAccounts'){
      return [
        { network: target },
        { message: commonMessage }
      ];
    }
    if(method === 'connect' || method === 'stx_connect' || method === 'wallet_connect'){
      return [
        { addresses: ['stacks'], purposes: ['stacks'], message: commonMessage },
        { addresses: ['payment', 'ordinals', 'stacks'], purposes: ['payment', 'ordinals', 'stacks'], message: commonMessage },
        { network: target }
      ];
    }
    return [];
  }

  function _callProviderMethodWithFallback(provider, method, preferredNetwork, timeoutMs){
    var defaults = _defaultProviderMethodParams(method, preferredNetwork);
    var attempts = [];
    var i;

    attempts.push({
      label: method + '()',
      run: function(){
        return _callProviderMethod(provider, method);
      }
    });

    for(i = 0; i < defaults.length; i++){
      (function(param, idx){
        attempts.push({
          label: method + '(default-' + idx + ')',
          run: function(){
            return _callProviderRequest(provider, method, param);
          }
        });
      })(defaults[i], i);
    }

    if(defaults.length === 0){
      attempts.push({
        label: method + '({})',
        run: function(){
          return _callProviderRequest(provider, method, {});
        }
      });
    }

    function run(index, lastError){
      if(index >= attempts.length){
        throw lastError || new Error('Wallet provider rejected "' + method + '" request.');
      }
      var attempt = attempts[index];
      return Promise.resolve()
        .then(function(){
          return _withTimeout(attempt.run(), timeoutMs || 4000, 'provider-method:' + attempt.label);
        })
        .catch(function(error){
          if(_isUserRejectedError(error)){
            throw error;
          }
          if(_isUnsupportedProviderError(error)){
            return run(index + 1, error);
          }
          if(_isRetryableParamError(error)){
            return run(index + 1, error);
          }
          throw error;
        });
    }

    return run(0, null);
  }

  function _looksLikeStacksAddress(value){
    if(typeof value !== 'string') return false;
    var trimmed = value.trim();
    if(trimmed.length < 20) return false;
    var prefix = trimmed.substring(0, 2);
    return prefix === 'SP' || prefix === 'ST' || prefix === 'SM' || prefix === 'SN';
  }

  function _normalizeWalletNetwork(value){
    if(!value) return null;
    var raw = String(value).toLowerCase();
    if(raw.indexOf('mainnet') >= 0 || raw === 'main') return 'mainnet';
    if(raw.indexOf('testnet') >= 0 || raw === 'test') return 'testnet';
    if(raw.indexOf('devnet') >= 0 || raw === 'dev') return 'devnet';
    return null;
  }

  function _networkFromAddress(value){
    if(typeof value !== 'string' || !value) return null;
    var prefix = value.substring(0, 2);
    if(prefix === 'SP' || prefix === 'SM') return 'mainnet';
    if(prefix === 'ST' || prefix === 'SN') return 'testnet';
    return null;
  }

  function _collectStacksAddressesFromPayload(payload, out){
    if(!payload) return out;

    if(typeof payload === 'string'){
      if(_looksLikeStacksAddress(payload)){
        out.push(payload.trim());
      }
      return out;
    }

    if(Array.isArray(payload)){
      var i;
      for(i = 0; i < payload.length; i++){
        _collectStacksAddressesFromPayload(payload[i], out);
      }
      return out;
    }

    if(typeof payload !== 'object') return out;

    if(payload.stxAddress){
      _collectStacksAddressesFromPayload(payload.stxAddress, out);
      if(typeof payload.stxAddress === 'object'){
        _collectStacksAddressesFromPayload(payload.stxAddress.mainnet, out);
        _collectStacksAddressesFromPayload(payload.stxAddress.testnet, out);
      }
    }

    _collectStacksAddressesFromPayload(payload.identityAddress, out);
    _collectStacksAddressesFromPayload(payload.address, out);
    _collectStacksAddressesFromPayload(payload.selectedAddress, out);
    _collectStacksAddressesFromPayload(payload.paymentAddress, out);
    _collectStacksAddressesFromPayload(payload.addresses, out);
    _collectStacksAddressesFromPayload(payload.accounts, out);
    _collectStacksAddressesFromPayload(payload.stxAddresses, out);

    if(payload.profile && typeof payload.profile === 'object' && payload.profile.stxAddress){
      _collectStacksAddressesFromPayload(payload.profile.stxAddress, out);
    }
    if(payload.result){
      _collectStacksAddressesFromPayload(payload.result, out);
    }
    return out;
  }

  function _pickPreferredStacksAddress(candidates, preferredNetwork){
    if(!Array.isArray(candidates) || !candidates.length){
      return null;
    }

    var deduped = [];
    var seen = {};
    var i;
    for(i = 0; i < candidates.length; i++){
      var candidate = candidates[i];
      if(!_looksLikeStacksAddress(candidate)) continue;
      if(seen[candidate]) continue;
      seen[candidate] = true;
      deduped.push(candidate);
    }

    if(!deduped.length){
      return null;
    }
    if(preferredNetwork){
      for(i = 0; i < deduped.length; i++){
        if(_networkFromAddress(deduped[i]) === preferredNetwork){
          return deduped[i];
        }
      }
    }
    return deduped[0];
  }

  function _extractAddressFromPayload(payload, preferredNetwork){
    var candidates = _collectStacksAddressesFromPayload(payload, []);
    return _pickPreferredStacksAddress(candidates, preferredNetwork || null);
  }

  function _resolveProviderAddress(provider, preferredNetwork, options){
    if(!provider) return Promise.resolve(null);
    var fallbackAddress = null;
    var allowInteractive = !(options && options.allowInteractive === false);

    if(typeof provider.selectedAddress === 'string' && _looksLikeStacksAddress(provider.selectedAddress)){
      if(!preferredNetwork || _networkFromAddress(provider.selectedAddress) === preferredNetwork){
        return Promise.resolve(provider.selectedAddress);
      }
      fallbackAddress = provider.selectedAddress;
    }
    if(typeof provider.address === 'string' && _looksLikeStacksAddress(provider.address)){
      if(!preferredNetwork || _networkFromAddress(provider.address) === preferredNetwork){
        return Promise.resolve(provider.address);
      }
      if(!fallbackAddress){
        fallbackAddress = provider.address;
      }
    }
    if(typeof provider.request !== 'function'){
      return Promise.resolve(fallbackAddress);
    }

    var methods = ['stx_getAddresses', 'getAddresses', 'stx_getAccounts', 'getAccounts'];
    function tryMethod(index){
      if(index >= methods.length) return Promise.resolve(fallbackAddress);
      var method = methods[index];
      return Promise.resolve()
        .then(function(){
          return _callProviderMethodWithFallback(provider, method, preferredNetwork, 4500);
        })
        .then(function(result){
          var address = _extractAddressFromPayload(result, preferredNetwork);
          if(address) return address;
          var fallback = _extractAddressFromPayload(result);
          if(!fallbackAddress && fallback){
            fallbackAddress = fallback;
          }
          return tryMethod(index + 1);
        })
        .catch(function(){
          return tryMethod(index + 1);
        });
    }

    function tryRequest(index){
      var requestMethods = ['stx_requestAccounts', 'requestAccounts', 'stx_connect', 'connect', 'wallet_connect'];
      if(index >= requestMethods.length) return Promise.resolve(null);
      var method = requestMethods[index];
      return Promise.resolve()
        .then(function(){
          return _callProviderMethodWithFallback(provider, method, preferredNetwork, 15000);
        })
        .then(function(result){
          var address = _extractAddressFromPayload(result, preferredNetwork);
          if(address) return address;
          var fallback = _extractAddressFromPayload(result);
          if(!fallbackAddress && fallback){
            fallbackAddress = fallback;
          }
          return tryMethod(0);
        })
        .catch(function(error){
          if(_isUserRejectedError(error)){
            throw error;
          }
          return tryRequest(index + 1);
        });
    }

    return tryMethod(0).then(function(address){
      if(address) return address;
      if(!allowInteractive){
        return fallbackAddress;
      }
      return tryRequest(0).catch(function(error){
        if(_isUserRejectedError(error)){
          throw error;
        }
        return fallbackAddress;
      });
    });
  }

  function _resolveConfiguredSenderAddress(payload){
    if(payload && typeof payload.readSenderAddress === 'string'){
      var fromPayload = payload.readSenderAddress.trim();
      if(_looksLikeStacksAddress(fromPayload)){
        return fromPayload;
      }
    }
    if(
      typeof window !== 'undefined' &&
      window.ARCADE_ONCHAIN_CONFIG &&
      typeof window.ARCADE_ONCHAIN_CONFIG.readSenderAddress === 'string'
    ){
      var fromConfig = window.ARCADE_ONCHAIN_CONFIG.readSenderAddress.trim();
      if(_looksLikeStacksAddress(fromConfig)){
        return fromConfig;
      }
    }
    return null;
  }

  function _normalizeUIntInput(value, label){
    if(typeof value === 'bigint'){
      if(value < 0n) throw new Error(label + ' must be an unsigned integer.');
      return value.toString(10);
    }
    var text = String(value == null ? '' : value).trim();
    if(!text || !/^[0-9]+$/.test(text)){
      throw new Error(label + ' must be an unsigned integer.');
    }
    return text.replace(/^0+(\d)/, '$1');
  }

  function _normalizeAttestationResponse(raw){
    if(!raw || typeof raw !== 'object'){
      throw new Error('Attestation response is missing or invalid.');
    }

    var nonce = _normalizeUIntInput(raw.nonce, 'Attestation nonce');
    var expiresAt = _normalizeUIntInput(
      typeof raw.expiresAt !== 'undefined'
        ? raw.expiresAt
        : (typeof raw.expires_at !== 'undefined' ? raw.expires_at : raw['expires-at']),
      'Attestation expiry'
    );
    var signatureHex = _stripHexPrefix(
      raw.signature || raw.signatureHex || raw.signature_hex || raw.sig || ''
    ).toLowerCase();

    if(signatureHex.length !== 130 || /[^0-9a-f]/.test(signatureHex)){
      throw new Error('Attestation signature must be a 65-byte hex string.');
    }

    return {
      nonce: nonce,
      expiresAt: expiresAt,
      signatureHex: signatureHex
    };
  }

  function _requestScoreAttestation(payload, playerAddress){
    if(payload.attestation && typeof payload.attestation === 'object'){
      return Promise.resolve(_normalizeAttestationResponse(payload.attestation));
    }

    if(!payload.requiresAttestation){
      return Promise.resolve(null);
    }

    if(typeof fetch !== 'function'){
      return Promise.reject(new Error('Browser fetch API is unavailable for score attestation.'));
    }

    if(!payload.attestationEndpoint){
      return Promise.reject(new Error('This leaderboard requires attestation, but no attestation endpoint is configured.'));
    }
    if(!playerAddress){
      return Promise.reject(new Error('Unable to resolve the wallet address required for attestation.'));
    }

    var endpoint = String(payload.attestationEndpoint);
    var timeoutMs = Number(payload.attestationTimeoutMs || 10000);
    if(!isFinite(timeoutMs) || timeoutMs < 1000) timeoutMs = 10000;

    var requestBody = {
      gameId: payload.gameId,
      mode: payload.mode,
      score: payload.score,
      playerName: payload.playerName,
      player: playerAddress,
      contractAddress: payload.contractAddress,
      contractName: payload.contractName,
      functionName: payload.functionName,
      network: payload.network || 'mainnet',
      origin:
        (typeof window !== 'undefined' && window.location && window.location.origin)
          ? window.location.origin
          : null
    };

    _debugLog('info', 'Requesting score attestation', {
      endpoint: endpoint,
      player: playerAddress,
      gameId: payload.gameId,
      mode: payload.mode,
      score: payload.score
    });

    return _withTimeout(fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    }), timeoutMs, 'attestation-request')
      .then(function(response){
        if(!response.ok){
          throw new Error('Attestation endpoint returned HTTP ' + response.status + '.');
        }
        return response.json();
      })
      .then(function(body){
        var attestation = _normalizeAttestationResponse(body);
        _debugLog('info', 'Score attestation received', {
          nonce: attestation.nonce,
          expiresAt: attestation.expiresAt
        });
        return attestation;
      });
  }

  function _buildSubmitFunctionArgs(payload, attestation){
    var args = [
      _encodeAsciiCV(_safeGameId(payload.gameId)),
      _encodeUIntCV(_toModeUint(payload.mode)),
      _encodeUIntCV(payload.score),
      _encodeAsciiCV(_safePlayerName(payload.playerName))
    ];

    if(attestation){
      args.push(_encodeUIntCV(attestation.nonce));
      args.push(_encodeUIntCV(attestation.expiresAt));
      args.push(_encodeBufferCV(attestation.signatureHex));
    }
    return args;
  }

  function _pickContractCallVariants(providerLabel, params){
    var variants = _buildContractCallParamVariants(params);
    var lowerLabel = String(providerLabel || '').toLowerCase();
    var preferMinimal =
      lowerLabel.indexOf('bitcoinprovider') >= 0 ||
      lowerLabel.indexOf('xverse') >= 0 ||
      lowerLabel.indexOf('btc') >= 0;

    variants.sort(function(a, b){
      var scoreA = 0;
      var scoreB = 0;
      if(a.label.indexOf('sats-minimal') === 0) scoreA += preferMinimal ? 10 : 0;
      if(a.label.indexOf('legacy-split') === 0) scoreA += preferMinimal ? 0 : 10;
      if(a.label.indexOf(':hex') >= 0) scoreA += 35;
      if(a.label.indexOf(':args-no0x') >= 0) scoreA += 25;
      if(a.label.indexOf(':mode-str') >= 0) scoreA += 15;
      if(a.label.indexOf(':raw') >= 0) scoreA -= 10;
      if(b.label.indexOf('sats-minimal') === 0) scoreB += preferMinimal ? 10 : 0;
      if(b.label.indexOf('legacy-split') === 0) scoreB += preferMinimal ? 0 : 10;
      if(b.label.indexOf(':hex') >= 0) scoreB += 35;
      if(b.label.indexOf(':args-no0x') >= 0) scoreB += 25;
      if(b.label.indexOf(':mode-str') >= 0) scoreB += 15;
      if(b.label.indexOf(':raw') >= 0) scoreB -= 10;
      return scoreB - scoreA;
    });
    return variants;
  }

  function _providerPrefersTransactionRequest(providerLabel, params){
    var label = String(providerLabel || '').toLowerCase();
    var hasPostConditions = !!(
      (Array.isArray(params.postConditionVariants) && params.postConditionVariants.length > 0) ||
      (Array.isArray(params.postConditions) && params.postConditions.length > 0)
    );
    if(!hasPostConditions) return false;
    return (
      label.indexOf('xverse') >= 0 ||
      label.indexOf('bitcoinprovider') >= 0 ||
      label.indexOf('window.btc') >= 0
    );
  }

  function _requestWalletContractCall(provider, params, providerLabel){
    var enableCallV2Fallback = !!params.enableCallV2Fallback;
    var enableTransactionRequestFallback = !!params.enableTransactionRequestFallback;
    var preferTransactionRequest = _providerPrefersTransactionRequest(providerLabel, params);
    _debugLog('info', 'Submitting wallet contract call', {
      providerLabel: providerLabel || null,
      contractAddress: params.contractAddress,
      contractName: params.contractName,
      functionName: params.functionName,
      network: params.network,
      argsCount: params.functionArgs ? params.functionArgs.length : 0,
      postConditionMode: _normalizePostConditionMode(params.postConditionMode),
      postConditionsCount: Array.isArray(params.postConditions) ? params.postConditions.length : 0,
      enableCallV2Fallback: enableCallV2Fallback,
      enableTransactionRequestFallback: enableTransactionRequestFallback,
      preferTransactionRequest: preferTransactionRequest
    });

    var attempts = [];
    var requestAttempts = [];
    var transactionAttempts = [];

    if(typeof provider.request === 'function'){
      var paramVariants = _pickContractCallVariants(providerLabel, params);
      var v;
      for(v = 0; v < paramVariants.length && v < 8; v++){
        (function(variant){
          requestAttempts.push({
            label: 'provider.request("stx_callContract", ' + variant.label + ')',
            exec: function(){ return _callProviderRequest(provider, 'stx_callContract', variant.params); }
          });
          if(enableCallV2Fallback){
            requestAttempts.push({
              label: 'provider.request("stx_callContractV2", ' + variant.label + ')',
              exec: function(){ return _callProviderRequest(provider, 'stx_callContractV2', variant.params); }
            });
          }
        })(paramVariants[v]);
      }
    }
    var transactionVariants = _buildTransactionRequestPayloadVariants(params);
    if(
      typeof provider.transactionRequest === 'function' &&
      (requestAttempts.length === 0 || enableTransactionRequestFallback || preferTransactionRequest)
    ){
      var t;
      for(t = 0; t < transactionVariants.length && t < 10; t++){
        (function(variant){
          transactionAttempts.push({
            label: 'provider.transactionRequest(' + variant.label + ')',
            exec: function(){
              _debugLog('info', 'Wallet transactionRequest payload prepared', {
                providerLabel: providerLabel || null,
                variant: variant.label,
                payload: variant.payload
              });
              var token = _createUnsecuredJwt(variant.payload);
              return provider.transactionRequest(token);
            }
          });
        })(transactionVariants[t]);
      }
    }

    if(preferTransactionRequest && transactionAttempts.length > 0){
      attempts = transactionAttempts.concat(requestAttempts);
    } else {
      attempts = requestAttempts.concat(transactionAttempts);
    }
    _rpcLogOnce('wallet-call-strategy', 'Wallet RPC strategy prepared for contract call', {
      origin: _originForRpcLog(),
      providerLabel: providerLabel || null,
      network: params.network || null,
      preferTransactionRequest: preferTransactionRequest,
      requestAttemptCount: requestAttempts.length,
      transactionAttemptCount: transactionAttempts.length,
      orderedAttemptsPreview: attempts.slice(0, 8).map(function(item){ return item.label; }),
      hasPostConditions: !!(
        (Array.isArray(params.postConditionVariants) && params.postConditionVariants.length > 0) ||
        (Array.isArray(params.postConditions) && params.postConditions.length > 0)
      )
    });

    function runAttempt(index, previousError){
      if(index >= attempts.length){
        throw previousError || new Error('Wallet provider rejected contract call request.');
      }
      var attempt = attempts[index];
      _debugLog('info', 'Wallet request attempt #' + (index + 1), attempt.label);
      return Promise.resolve()
        .then(function(){
          return attempt.exec();
        })
        .then(function(result){
          _debugLog('info', 'Wallet request returned result', result);
          var rpcError = _extractRpcError(result);
          if(rpcError){
            _debugLog('warn', 'Wallet request returned RPC error', _errorForLog(rpcError));
            if(_isUnsupportedProviderError(rpcError)){
              return runAttempt(index + 1, rpcError);
            }
            throw rpcError;
          }
          _rpcLogOnce('wallet-call-success', 'Wallet RPC call accepted a contract call payload', {
            origin: _originForRpcLog(),
            providerLabel: providerLabel || null,
            attemptLabel: attempt.label
          });
          return result;
        })
        .catch(function(error){
          _debugLog('warn', 'Wallet request attempt failed', {
            attempt: attempt.label,
            error: _errorForLog(error)
          });
          var isTransactionRequestAttempt = String(attempt.label || '').indexOf('provider.transactionRequest(') === 0;
          var transactionErrorMessage = (error && error.message ? String(error.message) : String(error)).toLowerCase();
          var isTransactionCreationCancelLike =
            transactionErrorMessage === 'cancel' ||
            transactionErrorMessage.indexOf('unexpected error creating transaction') >= 0;
          var shouldTryNextTransactionVariant =
            isTransactionRequestAttempt &&
            !_isUserRejectedError(error) &&
            !_isUnsupportedProviderError(error) &&
            !isTransactionCreationCancelLike &&
            index + 1 < attempts.length;
          if(shouldTryNextTransactionVariant){
            _debugLog('warn', 'Retrying wallet transactionRequest with next payload variant', {
              failedAttempt: attempt.label,
              nextAttempt: attempts[index + 1] ? attempts[index + 1].label : null,
              error: _errorForLog(error)
            });
            return runAttempt(index + 1, error);
          }
          if(isTransactionRequestAttempt && !_isUserRejectedError(error) && isTransactionCreationCancelLike){
            var nextMethodIndex = -1;
            var i;
            for(i = index + 1; i < attempts.length; i++){
              if(String(attempts[i].label || '').indexOf('provider.transactionRequest(') !== 0){
                nextMethodIndex = i;
                break;
              }
            }
            if(nextMethodIndex >= 0){
              _debugLog('warn', 'Switching from transactionRequest to provider.request method after wallet creation error', {
                failedAttempt: attempt.label,
                nextAttempt: attempts[nextMethodIndex].label,
                error: _errorForLog(error)
              });
              return runAttempt(nextMethodIndex, error);
            }
          }
          if(
            _isUnsupportedProviderError(error) ||
            _isRetryableParamError(error)
          ){
            return runAttempt(index + 1, error);
          }
          throw error;
        });
    }

    return runAttempt(0, null).catch(function(finalError){
      _debugLog('error', 'Wallet request failed', _errorForLog(finalError));
      _rpcLogOnce('wallet-call-failed', 'Wallet RPC strategy exhausted without accepted payload', {
        origin: _originForRpcLog(),
        providerLabel: providerLabel || null,
        error: _errorForLog(finalError)
      });
      throw finalError;
    });
  }

  function _extractRpcError(result){
    if(!result || typeof result !== 'object') return null;
    if(!result.error) return null;
    var details = result.error;
    var message = details && details.message ? String(details.message) : 'Wallet RPC request failed.';
    var err = new Error(message);
    err.code = details && typeof details.code !== 'undefined' ? details.code : null;
    err.data = details && typeof details.data !== 'undefined' ? details.data : null;
    err.rpc = result;
    return err;
  }

  function _isUnsupportedProviderError(error){
    if(!error) return false;
    if(typeof error.code !== 'undefined' && error.code === -32601) return true;
    var message = (error && error.message ? error.message : String(error)).toLowerCase();
    return (
      message.indexOf('not implemented') >= 0 ||
      message.indexOf('unsupported') >= 0 ||
      message.indexOf('not support') >= 0 ||
      message.indexOf('unknown method') >= 0 ||
      message.indexOf('method not found') >= 0
    );
  }

  function _isRetryableParamError(error){
    if(!error) return false;
    if(typeof error.code !== 'undefined' && error.code === -32602) return true;
    var message = (error && error.message ? error.message : String(error)).toLowerCase();
    return (
      message.indexOf('invalid parameters') >= 0 ||
      message.indexOf('invalid params') >= 0
    );
  }

  function _isUserRejectedError(error){
    if(!error) return false;
    if(typeof error.code !== 'undefined' && Number(error.code) === 4001) return true;
    var message = (error && error.message ? error.message : String(error)).toLowerCase();
    return (
      message.indexOf('rejected') >= 0 ||
      message.indexOf('denied') >= 0 ||
      message.indexOf('cancelled') >= 0 ||
      message.indexOf('canceled') >= 0
    );
  }

  function _isMissingAddressError(error){
    if(!error) return false;
    var message = (error && error.message ? error.message : String(error)).toLowerCase();
    return (
      message.indexOf('unable to resolve the wallet address') >= 0 ||
      message.indexOf('unable to resolve wallet address') >= 0 ||
      message.indexOf('wallet address required for attestation') >= 0 ||
      message.indexOf('wallet address required for deny-mode post conditions') >= 0
    );
  }

  function _normalizeApiBaseCandidate(value){
    if(typeof value !== 'string') return '';
    return value.trim().replace(/\/+$/, '');
  }

  function _collectApiBaseCandidates(payload){
    var out = [];
    var i;

    function push(value){
      var normalized = _normalizeApiBaseCandidate(value);
      if(!normalized) return;
      if(out.indexOf(normalized) >= 0) return;
      out.push(normalized);
    }

    push(payload && payload.apiBaseUrl);
    push(_defaultApiBase(payload && payload.network));

    var configuredFallbacks = _normalizeApiFallbackList(payload && payload.apiFallbackBaseUrls);
    for(i = 0; i < configuredFallbacks.length; i++){
      push(configuredFallbacks[i]);
    }

    var defaultFallbacks = _defaultApiFallbackBases(payload && payload.network);
    for(i = 0; i < defaultFallbacks.length; i++){
      push(defaultFallbacks[i]);
    }

    return out;
  }

  function _buildReadOnlyEndpointFromBase(apiBase, payload, functionName){
    return apiBase +
      '/v2/contracts/call-read/' +
      payload.contractAddress + '/' +
      payload.contractName + '/' +
      functionName;
  }

  function _buildReadOnlyEndpoints(payload, functionName){
    var apiBases = _collectApiBaseCandidates(payload);
    if(apiBases.length === 0){
      throw new Error('No API base URL configured for read-only contract calls.');
    }
    return apiBases.map(function(apiBase){
      return _buildReadOnlyEndpointFromBase(apiBase, payload, functionName);
    });
  }

  function _resolveReadOnlySenderCandidates(payload){
    var candidates = [];
    var targetNetwork = _normalizeWalletNetwork(payload && payload.network);
    var preferred = payload && typeof payload.readSenderAddress === 'string'
      ? payload.readSenderAddress.trim()
      : '';
    var fallback = payload && typeof payload.contractAddress === 'string'
      ? payload.contractAddress.trim()
      : '';

    function push(sender){
      if(!sender) return;
      if(candidates.indexOf(sender) >= 0) return;
      candidates.push(sender);
    }

    if(preferred){
      var senderNetwork = _networkFromAddress(preferred);
      if(!senderNetwork || !targetNetwork || targetNetwork === 'devnet' || senderNetwork === targetNetwork){
        push(preferred);
      } else {
        _debugLog('warn', 'Ignoring readSenderAddress network mismatch for read-only call', {
          sender: preferred,
          senderNetwork: senderNetwork,
          targetNetwork: targetNetwork
        });
      }
    }

    push(fallback);
    return candidates;
  }

  function _callContractReadOnly(payload, functionName, functionArgs){
    if(typeof fetch !== 'function'){
      return Promise.reject(new Error('Browser fetch API is unavailable for read-only calls.'));
    }
    var senderCandidates = _resolveReadOnlySenderCandidates(payload);
    if(senderCandidates.length === 0){
      return Promise.reject(new Error('Missing sender principal for read-only call.'));
    }

    var endpoints;
    try{
      endpoints = _buildReadOnlyEndpoints(payload, functionName);
    }catch(error){
      return Promise.reject(error);
    }
    _rpcLogOnce('readonly-plan', 'Read-only endpoint candidate plan resolved', {
      origin: _originForRpcLog(),
      network: payload && payload.network ? payload.network : null,
      contract: String(payload && payload.contractAddress ? payload.contractAddress : '') + '.' +
        String(payload && payload.contractName ? payload.contractName : ''),
      functionName: functionName,
      senders: senderCandidates.slice(),
      endpoints: endpoints.slice()
    });

    function execute(endpoint, sender){
      return fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: sender,
          arguments: Array.isArray(functionArgs) ? functionArgs : []
        })
      })
        .then(function(response){
          if(!response.ok){
            throw new Error('Read-only call failed with HTTP ' + response.status + '.');
          }
          return response.json();
        })
        .then(function(body){
          if(!body || body.okay !== true || typeof body.result !== 'string'){
            var cause = body && body.cause ? String(body.cause) : 'Read-only contract call failed.';
            throw new Error(cause);
          }
          return {
            result: body.result,
            endpoint: endpoint,
            sender: sender
          };
        });
    }

    function attemptSender(endpoint, senderIndex, lastError){
      if(senderIndex >= senderCandidates.length){
        throw lastError || new Error('Read-only contract call failed.');
      }
      var sender = senderCandidates[senderIndex];
      return execute(endpoint, sender).catch(function(error){
        if(senderIndex + 1 >= senderCandidates.length){
          throw error;
        }
        _debugLog('warn', 'Retrying read-only contract call with fallback sender', {
          functionName: functionName,
          failedSender: sender,
          nextSender: senderCandidates[senderIndex + 1],
          endpoint: endpoint,
          error: _errorForLog(error)
        });
        return attemptSender(endpoint, senderIndex + 1, error);
      });
    }

    function attemptEndpoint(endpointIndex, lastError){
      if(endpointIndex >= endpoints.length){
        throw lastError || new Error('Read-only contract call failed.');
      }
      var endpoint = endpoints[endpointIndex];
      return attemptSender(endpoint, 0, null).catch(function(error){
        if(endpointIndex + 1 >= endpoints.length){
          throw error;
        }
        _debugLog('warn', 'Retrying read-only contract call with fallback endpoint', {
          functionName: functionName,
          failedEndpoint: endpoint,
          nextEndpoint: endpoints[endpointIndex + 1],
          error: _errorForLog(error)
        });
        return attemptEndpoint(endpointIndex + 1, error);
      });
    }

    return attemptEndpoint(0, null)
      .then(function(outcome){
        var selectedEndpoint = outcome && outcome.endpoint ? outcome.endpoint : null;
        var selectedSender = outcome && outcome.sender ? outcome.sender : null;
        _rpcLogOnce('readonly-selected', 'Read-only endpoint selected for successful response', {
          origin: _originForRpcLog(),
          functionName: functionName,
          endpoint: selectedEndpoint,
          sender: selectedSender,
          usedEndpointFallback: endpoints.indexOf(selectedEndpoint) > 0,
          usedSenderFallback: senderCandidates.indexOf(selectedSender) > 0
        });
        if(!outcome || typeof outcome.result !== 'string'){
          throw new Error('Read-only contract call returned an invalid payload.');
        }
        return outcome.result;
      })
      .catch(function(error){
        _rpcLogOnce('readonly-failed', 'All read-only endpoints failed during resolution', {
          origin: _originForRpcLog(),
          functionName: functionName,
          endpoints: endpoints.slice(),
          senders: senderCandidates.slice(),
          error: _errorForLog(error)
        });
        throw error;
      });
  }

  function _decodeReadOnlyUIntResult(resultHex, functionName){
    var parsed = _parseClarityHex(resultHex);
    if(!parsed || typeof parsed !== 'object' || parsed.type !== 'response-ok'){
      throw new Error('Read-only ' + functionName + ' call returned non-ok response.');
    }
    var value = parsed.value;
    if(typeof value === 'bigint'){
      if(value < 0n){
        throw new Error(functionName + ' returned a negative value.');
      }
      return value.toString(10);
    }
    if(typeof value === 'number'){
      if(!isFinite(value) || value < 0){
        throw new Error(functionName + ' returned an invalid number.');
      }
      return Math.floor(value).toString(10);
    }
    if(typeof value === 'string' && /^[0-9]+$/.test(value)){
      return value;
    }
    throw new Error(functionName + ' did not return a uint value.');
  }

  function _getSubmitFeeCacheKey(payload){
    return (
      String(payload.contractAddress || '') + '.' +
      String(payload.contractName || '') + '@' +
      String(payload.network || 'mainnet')
    );
  }

  function _fetchSubmitFeeUnitMicroStx(payload){
    var cacheKey = _getSubmitFeeCacheKey(payload);
    return _callContractReadOnly(payload, 'get-fee-unit', [])
      .then(function(resultHex){
        var amount = _decodeReadOnlyUIntResult(resultHex, 'get-fee-unit');
        feeUnitCacheByContract[cacheKey] = amount;
        _debugLog('info', 'Loaded fee-unit for deny-mode post conditions', {
          cacheKey: cacheKey,
          feeUnitMicroStx: amount
        });
        return amount;
      })
      .catch(function(error){
        var cached = feeUnitCacheByContract[cacheKey];
        if(cached){
          _debugLog('warn', 'Using cached fee-unit for deny-mode post conditions', {
            cacheKey: cacheKey,
            feeUnitMicroStx: cached,
            error: _errorForLog(error)
          });
          return cached;
        }
        throw new Error(
          'Unable to load fee-unit for deny-mode score submit: ' +
          (error && error.message ? error.message : String(error))
        );
      });
  }

  function _buildSubmitPostConditionVariants(senderAddress, feeCapMicroStx){
    var principal = String(senderAddress || '').trim();
    if(!_looksLikeStacksAddress(principal)){
      throw new Error('Unable to resolve wallet address required for deny-mode post conditions.');
    }
    var amount = _normalizeUIntInput(feeCapMicroStx, 'Score submit fee cap');

    return [
      [{
        type: 'stx',
        address: principal,
        amount: amount,
        condition: 'less_equal'
      }],
      [{
        type: 'stx',
        principal: principal,
        amount: amount,
        conditionCode: 5
      }]
    ];
  }

  function _resolveFallbackPostConditionAddress(payload, candidateAddress, providers, providerIndex){
    if(_looksLikeStacksAddress(candidateAddress)){
      return Promise.resolve(candidateAddress);
    }

    var configured = _resolveConfiguredSenderAddress(payload);
    if(configured){
      return Promise.resolve(configured);
    }

    if(!Array.isArray(providers) || providerIndex < 0 || providerIndex >= providers.length){
      return Promise.resolve(null);
    }
    var active = providers[providerIndex];
    if(!active || !active.provider){
      return Promise.resolve(null);
    }
    return _resolveProviderAddress(active.provider, null, { allowInteractive: true })
      .then(function(address){
        if(_looksLikeStacksAddress(address)){
          return address;
        }
        return null;
      })
      .catch(function(){
        return null;
      });
  }

  function _defaultOnChainSubmitter(payload){
    if(typeof window !== 'undefined' && window.location && window.location.protocol === 'file:'){
      _debugLog('error', 'On-chain submit blocked: file:// origin does not support wallet injection');
      return Promise.reject(new Error(
        'Wallet extensions do not inject providers on file:// pages. Open this arcade via http://localhost (or https) and retry.'
      ));
    }

    var providers = _collectStacksProviders();
    if(!providers || providers.length === 0){
      _debugLog('error', 'On-chain submit blocked: provider missing', _providerDebugSnapshot());
      return Promise.reject(new Error(
        'No compatible Stacks wallet provider was detected. Enable Xverse/Leather in this browser and refresh.'
      ));
    }
    _rpcLogOnce('submit-context', 'On-chain submit context and RPC origin resolved', {
      origin: _originForRpcLog(),
      network: payload && payload.network ? payload.network : null,
      contract: String(payload && payload.contractAddress ? payload.contractAddress : '') + '.' +
        String(payload && payload.contractName ? payload.contractName : ''),
      functionName: payload && payload.functionName ? payload.functionName : null,
      configuredApiBaseUrl: payload && payload.apiBaseUrl ? payload.apiBaseUrl : null,
      configuredApiFallbackBaseUrls: payload && payload.apiFallbackBaseUrls ? payload.apiFallbackBaseUrls : [],
      providerCandidates: providers.map(function(item){ return item.label; })
    });

    _debugLog('info', 'Preparing on-chain submit payload', {
      gameId: payload.gameId,
      mode: payload.mode,
      score: payload.score,
      playerName: payload.playerName,
      contractAddress: payload.contractAddress,
      contractName: payload.contractName,
      functionName: payload.functionName,
      network: payload.network,
      requiresAttestation: !!payload.requiresAttestation,
      hasAttestationEndpoint: !!payload.attestationEndpoint,
      useDenyModePostConditions: !!payload.useDenyModePostConditions,
      fallbackToAllowModeOnPostConditionFailure: !!payload.fallbackToAllowModeOnPostConditionFailure
    });

    function tryProvider(index, previousError){
      if(index >= providers.length){
        if(_isMissingAddressError(previousError)){
          throw new Error(
            'Unable to resolve wallet address required for strict fee post conditions. ' +
            'Reconnect via the Connect button, then retry score submit.'
          );
        }
        throw previousError || new Error('No compatible wallet provider accepted contract-call request.');
      }
      var candidate = providers[index];
      _debugLog('info', 'Attempting wallet provider candidate', {
        index: index,
        total: providers.length,
        label: candidate.label
      });

      return _resolveProviderAddress(
        candidate.provider,
        _normalizeWalletNetwork(payload.network),
        { allowInteractive: true }
      )
        .then(function(playerAddress){
          function submitAllowMode(attestation){
            var allowParams = {
              contractAddress: payload.contractAddress,
              contractName: payload.contractName,
              functionName: payload.functionName,
              functionArgs: _buildSubmitFunctionArgs(payload, attestation),
              network: payload.network || 'mainnet',
              postConditionMode: POST_CONDITION_MODE_ALLOW,
              enableCallV2Fallback: false,
              enableTransactionRequestFallback: false
            };
            _debugLog('info', 'Submitting score with compatible allow-mode transaction params', {
              providerLabel: candidate.label
            });
            return _requestWalletContractCall(candidate.provider, allowParams, candidate.label);
          }

          _debugLog('info', 'Resolved wallet address for candidate', {
            providerLabel: candidate.label,
            playerAddress: playerAddress || null
          });
          var attestationPromise = _requestScoreAttestation(payload, playerAddress);
          if(!payload.useDenyModePostConditions){
            return attestationPromise.then(function(attestation){
              return submitAllowMode(attestation);
            });
          }

          return Promise.all([
            attestationPromise,
            _fetchSubmitFeeUnitMicroStx(payload)
          ])
            .then(function(values){
              var attestation = values[0];
              var feeCapMicroStx = values[1];
              return _resolveFallbackPostConditionAddress(payload, playerAddress, providers, index)
                .then(function(senderAddress){
                  if(!senderAddress){
                    throw new Error('Unable to resolve wallet address required for deny-mode post conditions.');
                  }
                  var params = {
                    contractAddress: payload.contractAddress,
                    contractName: payload.contractName,
                    functionName: payload.functionName,
                    functionArgs: _buildSubmitFunctionArgs(payload, attestation),
                    network: payload.network || 'mainnet',
                    postConditionMode: POST_CONDITION_MODE_DENY,
                    enableCallV2Fallback: false,
                    enableTransactionRequestFallback: false,
                    postConditionVariants: _buildSubmitPostConditionVariants(senderAddress, feeCapMicroStx)
                  };
                  _debugLog('info', 'Prepared deny-mode post conditions for score submit', {
                    providerLabel: candidate.label,
                    feeCapMicroStx: feeCapMicroStx,
                    senderAddress: senderAddress,
                    postConditionVariants: params.postConditionVariants
                  });
                  return _requestWalletContractCall(candidate.provider, params, candidate.label);
                });
            })
            .catch(function(error){
              if(_isUserRejectedError(error)){
                throw error;
              }
              if(!payload.fallbackToAllowModeOnPostConditionFailure){
                _debugLog('error', 'Strict deny-mode submit failed; allow-mode fallback is disabled', {
                  providerLabel: candidate.label,
                  error: _errorForLog(error)
                });
                var strictDetail = error && error.message ? ('Details: ' + error.message) : '';
                if(_isMissingAddressError(error)){
                  strictDetail += (strictDetail ? ' ' : '') +
                    'Reconnect wallet from the Connect button so the sender address is available.';
                }
                throw new Error(
                  'Strict fee post conditions could not be prepared or accepted by the wallet. ' +
                  'On-chain submit was blocked to preserve fee-trust guarantees. ' +
                  strictDetail
                );
              }
              _debugLog('warn', 'Deny-mode submit preparation failed; falling back to allow-mode by config', {
                providerLabel: candidate.label,
                error: _errorForLog(error)
              });
              return attestationPromise.then(function(attestation){
                return submitAllowMode(attestation);
              });
            });
        })
        .then(function(result){
          var txId = null;
          if(result && typeof result === 'object'){
            txId =
              result.txId ||
              result.txid ||
              result.tx_id ||
              (result.result && (result.result.txId || result.result.txid || result.result.tx_id)) ||
              null;
          }
          _debugLog('info', 'On-chain submit completed', {
            providerLabel: candidate.label,
            txId: txId,
            result: result
          });
          return {
            txId: txId,
            raw: result
          };
        })
        .catch(function(error){
          _debugLog('warn', 'Wallet provider candidate failed', {
            providerLabel: candidate.label,
            error: _errorForLog(error)
          });
          if(_isUserRejectedError(error)){
            throw error;
          }
          var message = (error && error.message ? String(error.message) : String(error)).toLowerCase();
          var isStrictPostConditionAssemblyError =
            message.indexOf('strict fee post conditions could not be prepared or accepted by the wallet') >= 0 ||
            message.indexOf('on-chain submit was blocked to preserve fee-trust guarantees') >= 0;
          if(_isUnsupportedProviderError(error) || _isRetryableParamError(error) || isStrictPostConditionAssemblyError){
            _debugLog('warn', 'Trying next provider after candidate failure', {
              providerLabel: candidate.label,
              reason: isStrictPostConditionAssemblyError ? 'strict-postcondition-wallet-reject' : 'provider-retryable'
            });
            return tryProvider(index + 1, error);
          }
          if(_isMissingAddressError(error)){
            _debugLog('warn', 'Trying next provider because address resolution failed', {
              providerLabel: candidate.label
            });
            return tryProvider(index + 1, error);
          }
          throw error;
        });
    }

    return tryProvider(0, null);
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
    _debugLog('info', 'submitOnChainScore called', { opts: opts, config: config });

    if(submitInFlight){
      _debugLog('warn', 'submitOnChainScore deduped: submit already in flight');
      return submitInFlight;
    }

    if(!_isOnChainReady()){
      _debugLog('error', 'On-chain config is incomplete', config);
      return Promise.reject(new Error('On-chain leaderboard config is incomplete.'));
    }

    var scoreNum = Number(opts.score);
    if(!isFinite(scoreNum) || scoreNum <= 0){
      _debugLog('error', 'Invalid score passed to submitOnChainScore', { rawScore: opts.score });
      return Promise.reject(new Error('Score must be a positive number for on-chain submit.'));
    }

    if(config.requiresAttestation && !config.attestationEndpoint && !opts.attestation){
      _debugLog('error', 'Attestation is required but endpoint is missing', config);
      return Promise.reject(
        new Error('On-chain attestation is required, but no attestation endpoint is configured.')
      );
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
      network: config.network,
      apiBaseUrl: config.apiBaseUrl,
      apiFallbackBaseUrls: config.apiFallbackBaseUrls,
      readSenderAddress: config.readSenderAddress,
      requiresAttestation: !!config.requiresAttestation,
      attestationEndpoint: config.attestationEndpoint || '',
      attestationTimeoutMs: config.attestationTimeoutMs || 10000,
      useDenyModePostConditions: !!config.useDenyModePostConditions,
      fallbackToAllowModeOnPostConditionFailure: !!config.fallbackToAllowModeOnPostConditionFailure,
      attestation: opts.attestation || null
    };

    var submitter = _resolveOnChainSubmitter();
    submitInFlight = Promise.resolve(submitter(payload))
      .catch(function(error){
        _debugLog('error', 'submitOnChainScore failed', _errorForLog(error));
        throw error;
      })
      .finally(function(){
        submitInFlight = null;
      });
    return submitInFlight;
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

  function _defaultApiFallbackBases(network){
    var normalized = String(network || '').toLowerCase();
    if(normalized === 'mainnet' || normalized === 'main') return [];
    if(normalized === 'testnet' || normalized === 'test') return [];
    if(normalized === 'devnet' || normalized === 'dev') return [];
    return [];
  }

  function _callReadOnly(payload){
    var callId = ++onChainReadOnlyCallCounter;
    var callStartedAt = Date.now();
    var callMetrics = {
      callId: callId,
      endpointAttempts: 0,
      senderAttempts: 0,
      fallbackEndpointCount: 0,
      fallbackSenderCount: 0,
      selectedEndpoint: null,
      selectedSender: null
    };

    _debugLog('info', 'Read-only leaderboard call starting', {
      callId: callId,
      contractAddress: payload.contractAddress,
      contractName: payload.contractName,
      functionName: payload.leaderboardFunctionName,
      network: payload.network,
      apiBaseUrl: payload.apiBaseUrl || null
    });
    if(typeof fetch !== 'function'){
      _debugLog('error', 'Read-only call failed: fetch missing');
      return Promise.reject(new Error('Browser fetch API is unavailable for leaderboard reads.'));
    }

    var apiBases = _collectApiBaseCandidates(payload);
    if(apiBases.length === 0){
      _debugLog('error', 'Read-only call failed: apiBase missing', payload);
      return Promise.reject(new Error('No API base URL configured for leaderboard read-only calls.'));
    }

    var senderCandidates = _resolveReadOnlySenderCandidates(payload);
    if(senderCandidates.length === 0){
      _debugLog('error', 'Read-only call failed: sender missing', payload);
      return Promise.reject(new Error('Missing sender principal for read-only leaderboard call.'));
    }

    var endpoints = apiBases.map(function(apiBase){
      return _buildReadOnlyEndpointFromBase(apiBase, payload, payload.leaderboardFunctionName);
    });
    _debugLog('info', 'Read-only leaderboard endpoint candidates resolved', {
      callId: callId,
      candidates: apiBases
    });

    function execute(endpoint, sender){
      callMetrics.endpointAttempts += 1;
      callMetrics.senderAttempts += 1;
      callMetrics.selectedEndpoint = endpoint;
      callMetrics.selectedSender = sender;
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

    function attemptSender(endpoint, senderIndex, lastError){
      if(senderIndex >= senderCandidates.length){
        throw lastError || new Error('Read-only leaderboard call failed.');
      }
      var sender = senderCandidates[senderIndex];
      return execute(endpoint, sender).catch(function(error){
        if(senderIndex + 1 >= senderCandidates.length){
          throw error;
        }
        callMetrics.fallbackSenderCount += 1;
        if(callMetrics.fallbackSenderCount === 1){
          _debugLog('warn', 'Retrying leaderboard read with fallback sender', {
            callId: callId,
            failedSender: sender,
            nextSender: senderCandidates[senderIndex + 1],
            endpoint: endpoint,
            error: _errorForLog(error),
            suppression: 'Further sender fallback logs are summarized per call.'
          });
        }
        return attemptSender(endpoint, senderIndex + 1, error);
      });
    }

    function attemptEndpoint(endpointIndex, lastError){
      if(endpointIndex >= endpoints.length){
        throw lastError || new Error('Read-only leaderboard call failed.');
      }
      var endpoint = endpoints[endpointIndex];
      return attemptSender(endpoint, 0, null).catch(function(error){
        if(endpointIndex + 1 >= endpoints.length){
          throw error;
        }
        callMetrics.fallbackEndpointCount += 1;
        if(callMetrics.fallbackEndpointCount === 1){
          _debugLog('warn', 'Retrying leaderboard read with fallback endpoint', {
            callId: callId,
            failedEndpoint: endpoint,
            nextEndpoint: endpoints[endpointIndex + 1],
            error: _errorForLog(error),
            suppression: 'Further endpoint fallback logs are summarized per call.'
          });
        }
        return attemptEndpoint(endpointIndex + 1, error);
      });
    }

    return attemptEndpoint(0, null)
      .then(function(resultHex){
        var summary = {
          callId: callId,
          functionName: payload.leaderboardFunctionName,
          durationMs: Date.now() - callStartedAt,
          endpointAttempts: callMetrics.endpointAttempts,
          senderAttempts: callMetrics.senderAttempts,
          fallbackEndpoints: callMetrics.fallbackEndpointCount,
          fallbackSenders: callMetrics.fallbackSenderCount,
          selectedEndpoint: callMetrics.selectedEndpoint,
          selectedSender: callMetrics.selectedSender
        };
        if(callMetrics.fallbackEndpointCount > 0 || callMetrics.fallbackSenderCount > 0){
          _debugLog('warn', 'Read-only leaderboard call completed via fallback', summary);
        } else {
          _debugLog('info', 'Read-only leaderboard call completed', summary);
        }
        return resultHex;
      })
      .catch(function(error){
        _debugLog('error', 'Read-only leaderboard call failed', {
          callId: callId,
          functionName: payload.leaderboardFunctionName,
          durationMs: Date.now() - callStartedAt,
          endpointAttempts: callMetrics.endpointAttempts,
          senderAttempts: callMetrics.senderAttempts,
          fallbackEndpoints: callMetrics.fallbackEndpointCount,
          fallbackSenders: callMetrics.fallbackSenderCount,
          lastEndpoint: callMetrics.selectedEndpoint || null,
          lastSender: callMetrics.selectedSender || null,
          error: _errorForLog(error)
        });
        throw error;
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
        player: slot.player || null,
        pending: false,
        submitted: false,
        onChain: true
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
        pending: !!item.pending,
        submitted: !!item.submitted,
        onChain: !!item.onChain
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
      _debugLog('info', 'fetchTop10 served from cache', { gameId: safeGameId, mode: safeMode, count: leaderboardCache[cacheKey].length });
      return Promise.resolve(_copyList(leaderboardCache[cacheKey]));
    }

    if(!_isOnChainReady()){
      _debugLog('warn', 'fetchTop10 skipped: on-chain config incomplete');
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
      apiFallbackBaseUrls: config.apiFallbackBaseUrls,
      readSenderAddress: config.readSenderAddress
    };

    var fetcher = _resolveLeaderboardFetcher();
    return Promise.resolve(fetcher(payload)).then(function(list){
      var normalized = _normalizeLeaderboardList(list, safeMode);
      normalized.forEach(function(entry){
        entry.pending = false;
        entry.submitted = false;
        entry.onChain = true;
      });
      leaderboardCache[cacheKey] = normalized;
      _debugLog('info', 'fetchTop10 loaded from chain', { gameId: safeGameId, mode: safeMode, count: normalized.length });
      return _copyList(normalized);
    }).catch(function(error){
      _debugLog('error', 'fetchTop10 failed', _errorForLog(error));
      if(opts.allowStale && leaderboardCache[cacheKey]){
        _debugLog('warn', 'fetchTop10 returning stale cache after failure', { gameId: safeGameId, mode: safeMode });
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
    var html = '<h2>Top 10 - ' + _escapeHtml(title) + '</h2>';

    if(opts.subtitle){
      html += '<div class="hs-subtitle">' + _escapeHtml(_sanitizeAscii(opts.subtitle, 180, '')) + '</div>';
    }

    html += '<table class="hs-table"><tr><th>#</th><th>Name</th><th></th><th>' + (isTime ? 'Time' : 'Score') + '</th></tr>';

    var i;
    for(i = 0; i < MAX_ENTRIES; i++){
      var row = list[i];
      var classes = [];
      if(i === highlightIdx) classes.push('hs-highlight');
      if(row && row.pending) classes.push('hs-pending');
      if(row && row.submitted) classes.push('hs-submitted');
      if(row && row.onChain) classes.push('hs-onchain');
      var clsAttr = classes.length ? ' class="' + classes.join(' ') + '"' : '';

      if(row){
        var value = isTime ? ArcadeUtils.formatTime(row.score) : ArcadeUtils.formatScore(row.score);
        var nameHtml = _escapeHtml(row.name);
        var chainHtml = row.onChain
          ? '<span class="hs-chain-icon" title="On-chain verified" aria-label="On-chain verified">&#128279;</span>'
          : '';
        if(row.onChain){
          nameHtml = '<span class="hs-name-label">' + nameHtml + '</span>';
        }
        html += '<tr' + clsAttr + '><td class="rank">' + (i + 1) + '</td><td class="name">' + nameHtml + '</td><td class="chain-col">' + chainHtml + '</td><td class="score-col">' + value + '</td></tr>';
      } else {
        html += '<tr' + clsAttr + '><td class="rank">' + (i + 1) + '</td><td class="name">---</td><td class="chain-col"></td><td class="score-col">--</td></tr>';
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
      rank <= MAX_ENTRIES
    );
  }

  function _offerVerifyFlow(opts){
    var settled = false;

    return new Promise(function(resolve){
      function done(result){
        if(settled) return;
        settled = true;
        _debugLog('info', 'Verify flow settled', {
          gameId: opts.gameId,
          mode: opts.mode,
          score: opts.score,
          rank: opts.rank,
          offered: !!(result && result.offered),
          submitted: !!(result && result.submitted),
          txId: result && result.txId ? result.txId : null,
          skipped: !!(result && result.skipped),
          error: result && result.error ? result.error : null
        });
        resolve(result);
      }

      var pendingEntry = {
        name: _safePlayerName(opts.name),
        score: opts.score,
        updatedAt: 0,
        player: null,
        pending: true,
        submitted: false,
        onChain: false,
        rank: opts.rank
      };
      var preview = _buildPreviewList(opts.currentTop10, opts.rank, pendingEntry);
      _debugLog('info', 'Verify flow opened', {
        gameId: opts.gameId,
        mode: opts.mode,
        score: opts.score,
        rank: opts.rank,
        currentTopCount: Array.isArray(opts.currentTop10) ? opts.currentTop10.length : 0
      });

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
          _debugLog('info', 'Verify flow submitting on-chain transaction', {
            gameId: opts.gameId,
            mode: opts.mode,
            score: opts.score,
            rank: opts.rank,
            name: opts.name
          });
          return submitOnChainScore({
            gameId: opts.gameId,
            mode: opts.mode,
            score: opts.score,
            playerName: opts.name,
            rank: opts.rank
          }).then(function(result){
            _debugLog('info', 'Verify flow submitOnChainScore completed', {
              gameId: opts.gameId,
              mode: opts.mode,
              score: opts.score,
              rank: opts.rank,
              txId: result && result.txId ? result.txId : null
            });
            var submittedEntry = {
              name: pendingEntry.name,
              score: pendingEntry.score,
              updatedAt: 0,
              player: null,
              pending: false,
              submitted: true,
              onChain: false,
              rank: opts.rank
            };
            return fetchTop10(opts.gameId, opts.mode, { force: true, allowStale: true })
              .then(function(latest){
                var display = _buildPostSubmitDisplay(latest, opts.mode, submittedEntry, opts.rank);
                renderOverlay({
                  gameId: opts.gameId,
                  mode: opts.mode,
                  title: opts.title,
                  list: display.list,
                  highlightIdx: display.highlightIdx,
                  subtitle: display.onChain
                    ? ('Score verified on-chain' + (result && result.txId ? ' · tx ' + String(result.txId).slice(0, 12) + '...' : ''))
                    : ('Transaction submitted. Score will turn chain-verified after index update' + (result && result.txId ? ' · tx ' + String(result.txId).slice(0, 12) + '...' : ''))
                });
                if(!display.onChain){
                  _scheduleOnChainRefresh({
                    gameId: opts.gameId,
                    mode: opts.mode,
                    title: opts.title,
                    rank: opts.rank,
                    candidate: submittedEntry,
                    txId: result && result.txId ? result.txId : null
                  });
                }
              })
              .catch(function(){
                _debugLog('warn', 'Verify flow post-submit refresh failed; using optimistic preview', {
                  gameId: opts.gameId,
                  mode: opts.mode,
                  score: opts.score,
                  rank: opts.rank
                });
                var fallback = _buildPreviewList(opts.currentTop10, opts.rank, submittedEntry);
                renderOverlay({
                  gameId: opts.gameId,
                  mode: opts.mode,
                  title: opts.title,
                  list: fallback,
                  highlightIdx: opts.rank - 1,
                  subtitle: 'Transaction submitted. Waiting for chain read to catch up'
                });
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
            _debugLog('error', 'Verify flow submission failed', {
              gameId: opts.gameId,
              mode: opts.mode,
              score: opts.score,
              rank: opts.rank,
              error: message
            });
            done({ offered: true, submitted: false, error: message });
            throw error;
          });
        },
        onClose: function(){
          _debugLog('info', 'Verify flow closed without submission', {
            gameId: opts.gameId,
            mode: opts.mode,
            score: opts.score,
            rank: opts.rank
          });
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
    var flowKey = _key(gameId, mode) + ':' + String(score);
    var onChainReady = _isOnChainReady();

    _debugLog('info', 'Final score flow started', {
      flowKey: flowKey,
      gameId: gameId,
      mode: mode,
      score: score,
      onChainReady: onChainReady,
      scoringDisabled: isScoringDisabled(gameId)
    });

    if(isScoringDisabled(gameId)){
      var disabledState = getScoringDisabledState(gameId);
      var reasonSuffix = disabledState.reason === 'force-next-wave'
        ? ' Force Next Wave test mode was used in this game session.'
        : '';
      renderOverlay({
        gameId: gameId,
        mode: mode,
        title: title,
        subtitle: 'Score submission is disabled for this browser.' + reasonSuffix
      });
      return Promise.resolve({
        submitted: false,
        disabled: true,
        onChain: { offered: false, submitted: false }
      });
    }

    var cachedResult = _getCachedFinalizedScoreResult(flowKey);
    if(cachedResult){
      _debugLog('info', 'maybeSubmit reused finalized score result', {
        flowKey: flowKey,
        submitted: !!cachedResult.submitted,
        offered: !!(cachedResult.onChain && cachedResult.onChain.offered)
      });
      return Promise.resolve(cachedResult);
    }

    if(submitFlowInFlight[flowKey]){
      _debugLog('warn', 'maybeSubmit deduped: submit flow already in flight', { flowKey: flowKey });
      return submitFlowInFlight[flowKey];
    }

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
    _debugLog('info', 'Personal best evaluated', {
      flowKey: flowKey,
      gameId: gameId,
      mode: mode,
      score: score,
      personalBest: pb && pb.best,
      improved: !!(pb && pb.improved)
    });
    var chainReadFailed = false;
    var chainReadError = null;
    var flowPromise = fetchTop10(gameId, mode, { force: true, allowStale: false })
      .catch(function(error){
        chainReadFailed = true;
        chainReadError = error || null;
        _debugLog('warn', 'maybeSubmit proceeding without fresh leaderboard read', {
          gameId: gameId,
          mode: mode,
          error: _errorForLog(error)
        });
        return [];
      })
      .then(function(board){
        var normalizedBoard = _normalizeLeaderboardList(board, mode);
        var rank = _computeInsertRank(normalizedBoard, mode, score);

        _debugLog('info', 'Leaderboard loaded for final score decision', {
          flowKey: flowKey,
          gameId: gameId,
          mode: mode,
          score: score,
          boardCount: normalizedBoard.length,
          rank: rank,
          chainReadFailed: chainReadFailed
        });

        if(rank === 0 && normalizedBoard.length < MAX_ENTRIES){
          rank = normalizedBoard.length + 1;
          _debugLog('warn', 'maybeSubmit corrected rank to next open slot', {
            gameId: gameId,
            mode: mode,
            score: score,
            boardCount: normalizedBoard.length,
            correctedRank: rank
          });
        }

        if(chainReadFailed && _isOnChainReady() && (rank <= 0 || rank > MAX_ENTRIES)){
          // When chain read fails we intentionally avoid false negatives.
          // Offer a provisional verification flow; contract enforces the true top-10 gate.
          rank = Math.min(MAX_ENTRIES, Math.max(1, normalizedBoard.length + 1));
        }

        var shouldOfferOnChain = _shouldOfferOnChain(rank) || (chainReadFailed && _isOnChainReady());
        _debugLog('info', 'Final score eligibility decision computed', {
          flowKey: flowKey,
          gameId: gameId,
          mode: mode,
          score: score,
          rank: rank,
          shouldOfferOnChain: shouldOfferOnChain,
          chainReadFailed: chainReadFailed,
          onChainReady: _isOnChainReady()
        });

        if(!shouldOfferOnChain){
          var subtitle = rank
            ? 'On-chain leaderboard is not configured. Candidate score discarded.'
            : (chainReadFailed
              ? 'Top 10 check unavailable right now. Personal best is saved locally.'
              : 'Not in Top 10. Personal best is saved locally.');
          if(chainReadFailed){
            _debugLog('warn', 'maybeSubmit did not offer on-chain verify after chain read failure', {
              gameId: gameId,
              mode: mode,
              score: score,
              boardCount: normalizedBoard.length,
              error: _errorForLog(chainReadError)
            });
          }
          renderOverlay({
            gameId: gameId,
            mode: mode,
            title: title,
            list: normalizedBoard,
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

        _debugLog('info', 'Opening verify flow for final score', {
          flowKey: flowKey,
          gameId: gameId,
          mode: mode,
          score: score,
          rank: rank,
          boardCount: normalizedBoard.length
        });

        return new Promise(function(resolve){
          _promptName(function(name){
            _offerVerifyFlow({
              gameId: gameId,
              mode: mode,
              title: title,
              score: score,
              name: name,
              rank: rank,
              currentTop10: normalizedBoard
            }).then(function(onChain){
              _debugLog('info', 'Final score verify flow resolved', {
                flowKey: flowKey,
                gameId: gameId,
                mode: mode,
                score: score,
                rank: rank,
                offered: !!(onChain && onChain.offered),
                submitted: !!(onChain && onChain.submitted),
                txId: onChain && onChain.txId ? onChain.txId : null,
                skipped: !!(onChain && onChain.skipped),
                error: onChain && onChain.error ? onChain.error : null
              });
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
    var trackedFlow = flowPromise.then(function(result){
      _debugLog('info', 'Final score flow finished', {
        flowKey: flowKey,
        gameId: gameId,
        mode: mode,
        score: score,
        submitted: !!(result && result.submitted),
        onChainOffered: !!(result && result.onChain && result.onChain.offered),
        onChainSubmitted: !!(result && result.onChain && result.onChain.submitted),
        txId: result && result.onChain && result.onChain.txId ? result.onChain.txId : null
      });
      _cacheFinalizedScoreResult(flowKey, result);
      return result;
    });
    submitFlowInFlight[flowKey] = trackedFlow.finally(function(){
      if(submitFlowInFlight[flowKey] === trackedFlow){
        delete submitFlowInFlight[flowKey];
      }
    });
    return submitFlowInFlight[flowKey];
  }

  function clearAll(){
    try{ localStorage.removeItem(PB_STORAGE_KEY); }catch(e){}
    leaderboardCache = {};
    submitInFlight = null;
    submitFlowInFlight = {};
    finalizedScoreResults = {};
    scoringDisabledState = { disabled: false, reason: '', at: 0, gameId: '' };
  }

  function _qualifies(gameId, mode, value, listOverride){
    var scoreMode = mode === 'time' ? 'time' : 'score';
    var list = listOverride || getTop10(gameId, mode);
    return _computeInsertRank(list, scoreMode, value) > 0;
  }

  function _addEntry(gameId, mode, name, value){
    var k = _key(gameId, mode);
    var scoreMode = mode === 'time' ? 'time' : 'score';
    var rank = _computeInsertRank(getTop10(gameId, mode), scoreMode, value);
    if(!rank) return -1;

    var entry = {
      rank: rank,
      name: _safePlayerName(name),
      score: Math.floor(_toSafeNumber(value)),
      updatedAt: 0,
      player: null,
      pending: true,
      submitted: false,
      onChain: false
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
    disableScoring: disableScoring,
    isScoringDisabled: isScoringDisabled,
    getScoringDisabledState: getScoringDisabledState,
    clearScoringDisabled: clearScoringDisabled,
    configureOnChain: configureOnChain,
    getOnChainConfig: getOnChainConfig,
    setOnChainSubmitter: setOnChainSubmitter,
    setOnChainLeaderboardFetcher: setOnChainLeaderboardFetcher,
    submitOnChainScore: submitOnChainScore,
    _qualifies: _qualifies,
    _addEntry: _addEntry,
    _shouldOfferOnChain: _shouldOfferOnChain,
    _recordPersonalBest: _recordPersonalBest,
    _computeInsertRank: _computeInsertRank,
    _debugSerializeStxPostConditionHex: _serializeStxPostConditionHex,
    _debugToPostConditionHexList: _toPostConditionHexList,
    _debugBuildContractCallParamVariants: _buildContractCallParamVariants,
    _debugBuildTransactionRequestPayloadVariants: _buildTransactionRequestPayloadVariants,
    _debugRequestWalletContractCall: _requestWalletContractCall
  };
})();
