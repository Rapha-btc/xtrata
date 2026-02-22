/* Retro Arcade - Main Launcher */
(function(){
  var GAMES = [
    typeof Game01 !== 'undefined' ? Game01 : null
  ].filter(Boolean);

  var homeGrid = document.getElementById('home-grid');
  var gameContainer = document.getElementById('game-container');
  var exitBtn = document.getElementById('exit-btn');
  var soundToggle = document.getElementById('sound-toggle');
  var walletStatusBadge = document.getElementById('wallet-status-badge');
  var walletConnectBtn = document.getElementById('wallet-connect-btn');
  var walletDisconnectBtn = document.getElementById('wallet-disconnect-btn');
  var adminBtn = document.getElementById('admin-btn');
  var forceNextWaveBtn = document.getElementById('force-next-wave-btn');

  var adminOverlay = document.getElementById('admin-overlay');
  var adminClose = document.getElementById('admin-close');
  var adminRefresh = document.getElementById('admin-refresh');
  var adminContractId = document.getElementById('admin-contract-id');
  var adminFeeCurrent = document.getElementById('admin-fee-current');
  var adminFeeInput = document.getElementById('admin-fee-stx-input');
  var adminFeeApply = document.getElementById('admin-fee-apply');
  var adminVerifierCurrent = document.getElementById('admin-verifier-current');
  var adminVerifierInput = document.getElementById('admin-verifier-input');
  var adminVerifierApply = document.getElementById('admin-verifier-apply');
  var adminVerifierClear = document.getElementById('admin-verifier-clear');
  var adminStatus = document.getElementById('admin-status');

  var errorOverlay = document.getElementById('error-overlay');
  var errorMsg = document.getElementById('error-msg');
  var errorClose = document.getElementById('error-close');

  var activeGame = null;
  var pendingStartGameIdx = null;
  var startScreenLoopTimer = null;
  var startScreenLoopPhase = 'scores';
  var startScreenLoopManualOverride = false;
  var START_SCREEN_LOOP_MS = 8000;
  var focusIdx = 0;
  var walletStatusTimer = null;
  var walletStatusRefreshInFlight = null;
  var lastWalletStatus = null;
  var walletDisconnectOverride = false;
  var connectPromptShown = false;
  var connectWalletInFlight = null;
  var walletConnectSession = null;
  var walletConnectSdkModulePromise = null;
  var WALLET_CONNECT_SESSION_STORAGE_KEY = 'arcade-wallet-session-v1';
  var adminBusy = false;
  var WALLET_DEBUG_BUILD = 'wallet-debug-2026-02-20-12';
  var providerMethodUnsupported = {};
  var walletDebugEvents = [];
  var walletDebugEventLimit = 800;
  var walletDebugThrottleState = {};
  var walletDebugChangeState = {};
  var walletRpcLogOnceState = {};
  var WALLET_DEBUG_THROTTLE_DEFAULT_MS = 350;
  var WALLET_DEBUG_THROTTLE_SUMMARY_IDLE_MS = 1800;
  var WALLET_DEBUG_THROTTLE_RULES = {
    'Provider request attempt': 1200,
    'Provider request attempt retrying': 1600,
    'Provider request attempt failed': 1600,
    'Wallet status refreshed': 2200,
    'resolveConnectedWallet candidate resolved': 1000,
    '[wallet-connect] attempt': 1000,
    '[wallet-connect] provider candidate': 1200,
    '[wallet-connect] non-event': 1300,
    '[wallet-connect] outcome': 1800
  };
  var walletDebugSummaryWindow = null;
  var walletDebugSummaryCounter = 0;
  var WALLET_DEBUG_SUMMARY_WINDOW_MS = 3000;
  var disconnectWalletInFlight = null;
  var gameVersionBySlot = resolveGameVersionBySlot();

  function parseGameScriptVersion(pathValue){
    if(typeof pathValue !== 'string') return null;
    var cleaned = pathValue.trim();
    if(!cleaned) return null;
    var noQuery = cleaned.split('?')[0];
    var fileName = noQuery.split('/').pop();
    if(!fileName) return null;
    var match = fileName.match(/^game(\d{2})_[a-z0-9_]+(?:-v([a-z0-9][a-z0-9._-]*))?\.js$/i);
    if(!match) return null;
    return {
      slot: Number(match[1]),
      version: match[2] ? String(match[2]) : '1'
    };
  }

  function normalizeVersionText(versionValue){
    if(typeof versionValue === 'undefined' || versionValue === null){
      return null;
    }
    var cleaned = String(versionValue).trim();
    if(!cleaned) return null;
    return cleaned.replace(/^v/i, '') || '1';
  }

  function applySlotVersion(versionMap, slot, versionText){
    if(!versionMap) return;
    if(typeof slot !== 'number' || !isFinite(slot) || slot < 1) return;
    var normalized = normalizeVersionText(versionText);
    if(!normalized) return;
    versionMap[slot] = normalized;
  }

  function resolveGameVersionBySlot(){
    var versionMap = {};
    var manifest = window.ARCADE_GAME_SCRIPT_MANIFEST;
    var i;

    if(manifest && Array.isArray(manifest.games)){
      for(i = 0; i < manifest.games.length; i += 1){
        var entry = manifest.games[i];
        if(!entry) continue;
        var slot = Number(entry.slot);
        var versionText = normalizeVersionText(entry.version);
        if(!versionText){
          var parsedFromManifest = parseGameScriptVersion(entry.script || entry.file || '');
          if(parsedFromManifest){
            if(!slot) slot = parsedFromManifest.slot;
            versionText = parsedFromManifest.version;
          }
        }
        applySlotVersion(versionMap, slot, versionText);
      }
    }

    if(typeof document !== 'undefined'){
      var scripts = document.getElementsByTagName('script');
      for(i = 0; i < scripts.length; i += 1){
        var src = scripts[i] && scripts[i].getAttribute ? scripts[i].getAttribute('src') : '';
        var parsed = parseGameScriptVersion(src || '');
        if(!parsed) continue;
        if(!versionMap[parsed.slot]){
          applySlotVersion(versionMap, parsed.slot, parsed.version);
        }
      }
    }

    return versionMap;
  }

  function getGameVersionLabelByIndex(idx){
    var slot = Number(idx) + 1;
    var versionText = gameVersionBySlot[slot];
    var normalized = normalizeVersionText(versionText || '1') || '1';
    if(/^\d+$/.test(normalized)){
      return 'v' + normalized + '.0';
    }
    return 'v' + String(normalized);
  }

  function walletDebugEnabled(){
    if(typeof window === 'undefined') return false;
    if(window.ARCADE_ONCHAIN_DEBUG === true) return true;
    return !!(window.ARCADE_ONCHAIN_CONFIG && window.ARCADE_ONCHAIN_CONFIG.debug === true);
  }

  function emitWalletDebugLine(level, message, detail){
    recordWalletDebugEvent(level, message, detail);
    if(typeof console === 'undefined') return;
    var fn = console[level];
    if(typeof fn !== 'function') fn = console.log;
    try{
      if(typeof detail === 'undefined'){
        fn.call(console, '[ArcadeWallet] ' + message);
      } else {
        fn.call(console, '[ArcadeWallet] ' + message, detail);
      }
    }catch(e){}
  }

  function walletDebugMessageKey(message){
    return String(message || '').replace(/#[0-9]+/g, '#*');
  }

  function walletDebugThrottleWindowMs(level, message){
    if(level === 'error') return 0;
    var normalized = walletDebugMessageKey(message);
    var key;
    for(key in WALLET_DEBUG_THROTTLE_RULES){
      if(!Object.prototype.hasOwnProperty.call(WALLET_DEBUG_THROTTLE_RULES, key)) continue;
      if(normalized.indexOf(key) === 0){
        return WALLET_DEBUG_THROTTLE_RULES[key];
      }
    }
    if(level === 'warn') return 700;
    if(level === 'info') return WALLET_DEBUG_THROTTLE_DEFAULT_MS;
    return 0;
  }

  function walletDebugThrottleKey(level, message, detail){
    var key = String(level || 'log') + '|' + walletDebugMessageKey(message);
    if(detail && typeof detail === 'object'){
      if(detail.provider) key += '|provider:' + String(detail.provider);
      else if(detail.providerLabel) key += '|provider:' + String(detail.providerLabel);
      if(detail.method) key += '|method:' + String(detail.method);
    }
    return key;
  }

  function flushWalletDebugThrottleSummaries(now){
    var key;
    for(key in walletDebugThrottleState){
      if(!Object.prototype.hasOwnProperty.call(walletDebugThrottleState, key)) continue;
      var state = walletDebugThrottleState[key];
      if(!state || !state.suppressedCount) continue;
      if(now - state.lastAt < WALLET_DEBUG_THROTTLE_SUMMARY_IDLE_MS) continue;
      emitWalletDebugLine('info', 'Debug summary: throttled repeated logs', {
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

  function walletDebug(level, message, detail){
    if(!walletDebugEnabled()) return;
    var now = Date.now();
    flushWalletDebugThrottleSummaries(now);
    var windowMs = walletDebugThrottleWindowMs(level, message);
    if(windowMs > 0){
      var throttleKey = walletDebugThrottleKey(level, message, detail);
      var state = walletDebugThrottleState[throttleKey];
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
        walletDebugThrottleState[throttleKey] = state;
      }
      if(state.lastAt > 0 && (now - state.lastAt) < windowMs){
        state.suppressedCount += 1;
        state.lastDetail = cloneWalletDebugDetail(detail);
        return;
      }
      if(state.suppressedCount > 0){
        emitWalletDebugLine('info', 'Debug summary: throttled repeated logs', {
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
    emitWalletDebugLine(level, message, detail);
  }

  function originForRpcLog(){
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

  function walletRpcLogOnce(key, message, detail){
    if(!walletDebugEnabled()) return;
    var normalizedKey = String(key || '').trim();
    if(!normalizedKey) return;
    if(walletRpcLogOnceState[normalizedKey]) return;
    walletRpcLogOnceState[normalizedKey] = true;
    walletDebug('info', '[RPC] ' + message, detail);
  }

  function cloneWalletDebugDetail(detail){
    if(typeof detail === 'undefined') return undefined;
    if(detail === null) return null;
    if(typeof detail === 'string' || typeof detail === 'number' || typeof detail === 'boolean'){
      return detail;
    }
    try{
      return JSON.parse(JSON.stringify(detail));
    }catch(e){
      if(detail && typeof detail === 'object'){
        return {
          name: detail.name || null,
          message: detail.message || String(detail),
          code: typeof detail.code === 'undefined' ? null : detail.code
        };
      }
      return String(detail);
    }
  }

  function walletDebugKey(detail){
    var cloned = cloneWalletDebugDetail(detail);
    if(typeof cloned === 'undefined') return '__undefined__';
    if(cloned === null) return '__null__';
    if(typeof cloned === 'string' || typeof cloned === 'number' || typeof cloned === 'boolean'){
      return String(cloned);
    }
    try{
      return JSON.stringify(cloned);
    }catch(e){
      return String(cloned);
    }
  }

  function walletDebugChanged(level, message, detail, key){
    var stateKey = String(key || message || 'wallet-debug-change');
    var nextKey = walletDebugKey(detail);
    if(walletDebugChangeState[stateKey] === nextKey){
      return false;
    }
    walletDebugChangeState[stateKey] = nextKey;
    walletDebug(level, message, detail);
    return true;
  }

  function walletStatusKey(status){
    if(!status || typeof status !== 'object'){
      return 'status:none';
    }
    return [
      String(status.state || ''),
      status.hasAddress ? '1' : '0',
      String(status.address || ''),
      String(status.network || ''),
      String(status.provider || ''),
      String(status.label || '')
    ].join('|');
  }

  function recordWalletDebugEvent(level, message, detail){
    walletDebugEvents.push({
      ts: Date.now(),
      level: String(level || 'log'),
      message: String(message || ''),
      detail: cloneWalletDebugDetail(detail)
    });
    if(walletDebugEvents.length > walletDebugEventLimit){
      walletDebugEvents.splice(0, walletDebugEvents.length - walletDebugEventLimit);
    }
  }

  function findLastWalletDebugEvent(events, message){
    var i;
    for(i = events.length - 1; i >= 0; i--){
      if(events[i].message === message){
        return events[i];
      }
    }
    return null;
  }

  function summarizeWalletDebugMessages(events, limit){
    var counts = {};
    var i;
    for(i = 0; i < events.length; i++){
      counts[events[i].message] = (counts[events[i].message] || 0) + 1;
    }
    var rows = Object.keys(counts).map(function(message){
      return {
        message: message,
        count: counts[message]
      };
    });
    rows.sort(function(a, b){
      if(b.count !== a.count) return b.count - a.count;
      return a.message < b.message ? -1 : 1;
    });
    return rows.slice(0, limit);
  }

  function compactWalletDebugEvent(event, startedAt){
    return {
      tMs: event.ts - startedAt,
      level: event.level,
      message: event.message
    };
  }

  function extractWalletDebugErrorMessage(payload){
    if(!payload) return null;
    if(typeof payload === 'string') return payload;
    if(typeof payload.message === 'string' && payload.message) return payload.message;
    return null;
  }

  function buildWalletRequestSummary(events){
    var stats = {};
    var unsupported = [];

    function keyFor(detail){
      var provider = detail && detail.provider ? String(detail.provider) : 'unknown-provider';
      var method = detail && detail.method ? String(detail.method) : 'unknown-method';
      return provider + '|' + method;
    }

    function ensure(detail){
      var key = keyFor(detail);
      if(stats[key]) return stats[key];
      var provider = detail && detail.provider ? String(detail.provider) : 'unknown-provider';
      var method = detail && detail.method ? String(detail.method) : 'unknown-method';
      stats[key] = {
        provider: provider,
        method: method,
        attempts: 0,
        retries: 0,
        failures: 0,
        lastError: null
      };
      return stats[key];
    }

    var i;
    for(i = 0; i < events.length; i++){
      var event = events[i];
      var detail = event.detail || {};
      if(
        event.message !== 'Provider request attempt' &&
        event.message !== 'Provider request attempt retrying' &&
        event.message !== 'Provider request attempt failed' &&
        event.message !== 'Provider method marked unsupported'
      ){
        continue;
      }
      var entry = ensure(detail);
      if(event.message === 'Provider request attempt'){
        entry.attempts += 1;
      } else if(event.message === 'Provider request attempt retrying'){
        entry.retries += 1;
        entry.lastError = extractWalletDebugErrorMessage(detail.error);
      } else if(event.message === 'Provider request attempt failed'){
        entry.failures += 1;
        entry.lastError = extractWalletDebugErrorMessage(detail.error);
      } else if(event.message === 'Provider method marked unsupported'){
        unsupported.push({
          provider: entry.provider,
          method: entry.method,
          error: extractWalletDebugErrorMessage(detail.error)
        });
      }
    }

    var rows = Object.keys(stats).map(function(key){
      return stats[key];
    });
    rows.sort(function(a, b){
      var scoreA = a.attempts + a.retries + a.failures;
      var scoreB = b.attempts + b.retries + b.failures;
      if(scoreB !== scoreA) return scoreB - scoreA;
      if(a.provider !== b.provider) return a.provider < b.provider ? -1 : 1;
      return a.method < b.method ? -1 : 1;
    });

    return {
      methods: rows.slice(0, 20),
      unsupported: unsupported.slice(0, 20)
    };
  }

  function buildWalletDebugSummary(windowInfo, events){
    var startedAt = windowInfo.startedAt;
    var endedAt = windowInfo.endedAt;
    var requestSummary = buildWalletRequestSummary(events);
    var providerDiscovery = findLastWalletDebugEvent(events, 'Provider discovery completed');
    var resolveStart = findLastWalletDebugEvent(events, 'resolveConnectedWallet start');
    var resolveSelected = findLastWalletDebugEvent(events, 'resolveConnectedWallet selected candidate');
    var resolveNoAddress = findLastWalletDebugEvent(events, 'resolveConnectedWallet providers detected but no address resolved');
    var resolveMismatch = findLastWalletDebugEvent(events, 'resolveConnectedWallet returning mismatched-network candidate');
    var connectResolved = findLastWalletDebugEvent(events, 'connectWallet resolved');
    var connectRejected = findLastWalletDebugEvent(events, 'connectWallet rejected');
    var internalNoAccount = findLastWalletDebugEvent(events, 'connectWalletInternal failed: no connected account resolved');
    var internalMismatch = findLastWalletDebugEvent(events, 'connectWalletInternal failed due to network mismatch');
    var statusRefreshed = findLastWalletDebugEvent(events, 'Wallet status refreshed');
    var i;
    var errorEvents = [];

    for(i = 0; i < events.length; i++){
      var event = events[i];
      if(event.level !== 'error' && event.message.toLowerCase().indexOf('failed') < 0 && event.message.toLowerCase().indexOf('rejected') < 0){
        continue;
      }
      var detail = event.detail || {};
      var errorPayload = detail.error || detail.lastConnectError || detail;
      var errorMessage = extractWalletDebugErrorMessage(errorPayload);
      errorEvents.push({
        tMs: event.ts - startedAt,
        message: event.message,
        error: errorMessage
      });
    }

    var connectionOutcome = {
      status: 'unknown',
      detail: null
    };
    if(connectResolved){
      connectionOutcome.status = 'connected';
      connectionOutcome.detail = connectResolved.detail;
    } else if(connectRejected){
      connectionOutcome.status = 'rejected';
      connectionOutcome.detail = connectRejected.detail;
    } else if(internalNoAccount){
      connectionOutcome.status = 'no-connected-account';
      connectionOutcome.detail = internalNoAccount.detail;
    } else if(internalMismatch){
      connectionOutcome.status = 'network-mismatch';
      connectionOutcome.detail = internalMismatch.detail;
    }

    var resolution = {
      status: 'unknown',
      detail: null
    };
    if(resolveSelected){
      resolution.status = 'selected-candidate';
      resolution.detail = resolveSelected.detail;
    } else if(resolveMismatch){
      resolution.status = 'mismatched-network-candidate';
      resolution.detail = resolveMismatch.detail;
    } else if(resolveNoAddress){
      resolution.status = 'no-address-resolved';
      resolution.detail = resolveNoAddress.detail;
    }

    return {
      label: 'debug-summary',
      build: WALLET_DEBUG_BUILD,
      trigger: windowInfo.trigger,
      triggerMeta: windowInfo.meta || null,
      startedAtIso: new Date(startedAt).toISOString(),
      endedAtIso: new Date(endedAt).toISOString(),
      durationMs: endedAt - startedAt,
      eventCount: events.length,
      targetNetwork: resolveTargetNetwork(),
      providerDiscovery: providerDiscovery ? providerDiscovery.detail : null,
      resolveConnectedWallet: {
        lastStart: resolveStart ? resolveStart.detail : null,
        finalResolution: resolution
      },
      requestSummary: requestSummary,
      connectionOutcome: connectionOutcome,
      walletStatus: statusRefreshed ? statusRefreshed.detail : lastWalletStatus,
      topMessages: summarizeWalletDebugMessages(events, 12),
      notableErrors: errorEvents.slice(0, 12),
      timeline: {
        first: events.slice(0, 6).map(function(event){ return compactWalletDebugEvent(event, startedAt); }),
        last: events.slice(Math.max(events.length - 6, 0)).map(function(event){ return compactWalletDebugEvent(event, startedAt); })
      }
    };
  }

  function emitWalletDebugSummary(summary){
    if(!walletDebugEnabled()) return;
    if(typeof console === 'undefined') return;
    var fn = typeof console.info === 'function' ? console.info : console.log;
    try{
      fn.call(console, '[ArcadeWallet][DEBUG-SUMMARY]', summary);
    }catch(e){}
  }

  function flushWalletDebugSummaryWindow(windowId){
    if(!walletDebugSummaryWindow || walletDebugSummaryWindow.id !== windowId){
      return;
    }
    var start = walletDebugSummaryWindow.startedAt;
    var end = Date.now();
    var info = {
      id: walletDebugSummaryWindow.id,
      trigger: walletDebugSummaryWindow.trigger,
      meta: walletDebugSummaryWindow.meta,
      startedAt: start,
      endedAt: end
    };
    walletDebugSummaryWindow = null;
    var events = walletDebugEvents.filter(function(event){
      return event.ts >= start && event.ts <= end;
    });
    emitWalletDebugSummary(buildWalletDebugSummary(info, events));
  }

  function startWalletDebugSummaryWindow(trigger, meta){
    if(!walletDebugEnabled()) return;
    if(walletDebugSummaryWindow && walletDebugSummaryWindow.timer){
      clearTimeout(walletDebugSummaryWindow.timer);
      flushWalletDebugSummaryWindow(walletDebugSummaryWindow.id);
    }
    walletDebugSummaryWindow = {
      id: ++walletDebugSummaryCounter,
      trigger: trigger || 'unknown-trigger',
      meta: cloneWalletDebugDetail(meta),
      startedAt: Date.now(),
      timer: null
    };
    walletDebugSummaryWindow.timer = setTimeout(function(){
      flushWalletDebugSummaryWindow(walletDebugSummaryWindow ? walletDebugSummaryWindow.id : -1);
    }, WALLET_DEBUG_SUMMARY_WINDOW_MS);
  }

  function walletErrorForLog(error){
    if(!error) return null;
    return {
      name: error.name || null,
      message: error.message || String(error),
      code: typeof error.code === 'undefined' ? null : error.code,
      data: typeof error.data === 'undefined' ? null : error.data
    };
  }

  function isLikelyIpv6LocalOrigin(){
    if(typeof window === 'undefined' || !window.location) return false;
    var host = String(window.location.host || '').toLowerCase();
    var hostname = String(window.location.hostname || '').toLowerCase();
    return (
      host.indexOf('[::]') >= 0 ||
      host.indexOf('[::1]') >= 0 ||
      hostname === '::' ||
      hostname === '[::]' ||
      hostname === '::1' ||
      hostname === '[::1]'
    );
  }

  function localhostOriginHint(){
    if(typeof window === 'undefined' || !window.location) return 'http://localhost';
    var port = window.location.port ? ':' + window.location.port : '';
    return window.location.protocol + '//localhost' + port + '/';
  }

  function buildWalletConnectFailureMessage(baseMessage, detailError){
    var message = String(baseMessage || 'Wallet connection failed.');
    if(detailError && detailError.message){
      message += ' Last wallet error: ' + detailError.message;
      var lower = String(detailError.message).toLowerCase();
      if(
        lower.indexOf('requestaccounts') >= 0 &&
        (lower.indexOf('not supported') >= 0 || lower.indexOf('unsupported') >= 0 || lower.indexOf('not support') >= 0)
      ){
        message += ' Open your wallet extension for this site and approve access, then retry.';
      }
    }
    if(isLikelyIpv6LocalOrigin()){
      message += ' This page is using an IPv6 local URL; open ' + localhostOriginHint() + ' and retry.';
    }
    return message;
  }

  function getProviderLabel(provider){
    if(!provider) return 'anonymous-provider';
    if(typeof provider.__arcadeWalletLabel === 'string' && provider.__arcadeWalletLabel){
      return provider.__arcadeWalletLabel;
    }
    return 'anonymous-provider';
  }

  function getProviderUnsupportedKey(provider){
    if(!provider) return 'anonymous-provider';
    var label = getProviderLabel(provider);
    if(label && label !== 'anonymous-provider'){
      return 'label:' + label;
    }
    if(typeof provider.name === 'string' && provider.name){
      return 'name:' + provider.name;
    }
    if(typeof provider.id === 'string' && provider.id){
      return 'id:' + provider.id;
    }
    return 'anonymous-provider';
  }

  function getProviderUnsupportedRecord(provider){
    var key = getProviderUnsupportedKey(provider);
    if(providerMethodUnsupported[key]){
      return providerMethodUnsupported[key];
    }
    var next = { key: key, methods: {} };
    providerMethodUnsupported[key] = next;
    return next;
  }

  function isKnownUnsupportedMethod(provider, method){
    if(!provider || !method) return false;
    var record = getProviderUnsupportedRecord(provider);
    return record.methods[method] === true;
  }

  function markMethodUnsupported(provider, method){
    if(!provider || !method) return;
    var record = getProviderUnsupportedRecord(provider);
    record.methods[method] = true;
  }

  function clearMethodUnsupported(provider, method){
    if(!provider || !method) return;
    var record = getProviderUnsupportedRecord(provider);
    if(record && record.methods){
      delete record.methods[method];
    }
  }

  function clearUnsupportedMethodsForProviders(providerEntries, methods){
    if(!Array.isArray(providerEntries) || !Array.isArray(methods)) return;
    var i;
    var m;
    for(i = 0; i < providerEntries.length; i++){
      var entry = providerEntries[i];
      if(!entry || !entry.provider) continue;
      for(m = 0; m < methods.length; m++){
        clearMethodUnsupported(entry.provider, methods[m]);
      }
    }
  }

  function createKnownUnsupportedMethodError(method){
    var error = new Error('Wallet provider does not support method "' + method + '".');
    error.code = -32601;
    error.__knownUnsupported = true;
    return error;
  }

  function isLikelyBitcoinOnlyProvider(entry){
    if(!entry) return false;
    var label = String(entry.label || '').toLowerCase();
    return label.indexOf('bitcoinprovider') >= 0 && label.indexOf('stacksprovider') < 0;
  }

  function providerHasNestedStacksCandidate(provider){
    if(!provider || typeof provider !== 'object') return false;
    return !!(
      (provider.StacksProvider && typeof provider.StacksProvider === 'object') ||
      (provider.stacksProvider && typeof provider.stacksProvider === 'object') ||
      (provider.walletProvider && typeof provider.walletProvider === 'object') ||
      (provider.provider && typeof provider.provider === 'object' && provider.provider !== provider) ||
      (provider.wallet && typeof provider.wallet === 'object')
    );
  }

  function providerLooksLikeNamespaceContainer(provider){
    if(!provider || typeof provider !== 'object') return false;
    if(!providerHasNestedStacksCandidate(provider)) return false;
    if(providerHasDirectRpcMethods(provider)) return false;
    if(typeof provider.transactionRequest === 'function') return false;
    if(typeof provider.enable === 'function') return false;
    if(typeof provider.connect === 'function') return false;
    return true;
  }

  function splitWalletAddressCandidates(providers){
    var primary = [];
    var fallback = [];
    var i;
    if(!Array.isArray(providers) || providers.length === 0){
      return { primary: primary, fallback: fallback };
    }
    for(i = 0; i < providers.length; i++){
      if(isLikelyBitcoinOnlyProvider(providers[i])){
        fallback.push(providers[i]);
      } else {
        primary.push(providers[i]);
      }
    }
    return { primary: primary, fallback: fallback };
  }

  function getWalletAddressCandidates(providers){
    var split = splitWalletAddressCandidates(providers);
    if(split.primary.length > 0){
      return split.primary.concat(split.fallback);
    }
    return split.fallback;
  }

  function providerHasDirectRpcMethods(provider){
    if(!provider || typeof provider !== 'object') return false;
    return (
      typeof provider.stx_getAddresses === 'function' ||
      typeof provider.getAddresses === 'function' ||
      typeof provider.stx_getAccounts === 'function' ||
      typeof provider.getAccounts === 'function' ||
      typeof provider.stx_requestAccounts === 'function' ||
      typeof provider.requestAccounts === 'function' ||
      typeof provider.stx_connect === 'function' ||
      typeof provider.wallet_connect === 'function'
    );
  }

  function providerHasCapabilities(provider){
    if(!provider || typeof provider !== 'object') return false;
    return (
      typeof provider.request === 'function' ||
      typeof provider.transactionRequest === 'function' ||
      providerHasDirectRpcMethods(provider) ||
      typeof provider.enable === 'function' ||
      typeof provider.connect === 'function'
    );
  }

  function setWalletBadge(state, label){
    if(!walletStatusBadge) return;
    walletStatusBadge.className = 'wallet-status-badge ' + state;
    walletStatusBadge.textContent = label;
    walletStatusBadge.title = label;
  }

  function updateWalletDisconnectButtonState(){
    if(!walletDisconnectBtn) return;
    var hasAddress = !!(lastWalletStatus && lastWalletStatus.hasAddress);
    walletDisconnectBtn.style.display = hasAddress ? 'inline-block' : 'none';
    walletDisconnectBtn.disabled = !hasAddress || !!connectWalletInFlight || !!disconnectWalletInFlight;
    walletDisconnectBtn.title = hasAddress
      ? 'Disconnect wallet so you can reconnect a different account'
      : 'Connect a wallet to enable disconnect';
    updateWalletConnectButtonState();
  }

  function updateWalletConnectButtonState(){
    if(!walletConnectBtn) return;
    var hasAddress = !!(lastWalletStatus && lastWalletStatus.hasAddress);
    walletConnectBtn.style.display = hasAddress ? 'none' : 'inline-block';
    walletConnectBtn.disabled = !!connectWalletInFlight || !!disconnectWalletInFlight;
    walletConnectBtn.title = hasAddress
      ? 'Wallet connected'
      : 'Connect wallet';
  }

  function syncOnChainReadSenderAddress(address){
    if(typeof window === 'undefined') return;
    if(!window.ARCADE_ONCHAIN_CONFIG || typeof window.ARCADE_ONCHAIN_CONFIG !== 'object') return;
    var next = looksLikeStacksAddress(address) ? String(address).trim() : '';
    if(String(window.ARCADE_ONCHAIN_CONFIG.readSenderAddress || '') === next){
      return;
    }
    window.ARCADE_ONCHAIN_CONFIG.readSenderAddress = next;
    walletDebug('info', 'Synced on-chain read sender address', {
      readSenderAddress: next || null
    });
  }

  function setWalletDisconnectOverride(enabled, meta){
    var next = !!enabled;
    if(walletDisconnectOverride === next){
      return;
    }
    walletDisconnectOverride = next;
    walletDebug(next ? 'warn' : 'info', next ? 'Enabled local wallet disconnect override' : 'Cleared local wallet disconnect override', meta || null);
  }

  function setAdminStatus(message, tone){
    if(!adminStatus) return;
    adminStatus.className = 'admin-status';
    if(tone){
      adminStatus.className += ' ' + tone;
    }
    adminStatus.textContent = message || '';
  }

  function setAdminBusy(isBusy){
    adminBusy = !!isBusy;
    var controls = [
      adminRefresh,
      adminFeeApply,
      adminVerifierApply,
      adminVerifierClear,
      adminFeeInput,
      adminVerifierInput
    ];
    controls.forEach(function(el){
      if(el) el.disabled = adminBusy;
    });
  }

  function getActiveGameHooks(){
    if(!activeGame || typeof activeGame.getTestHooks !== 'function') return null;
    try{
      return activeGame.getTestHooks();
    }catch(e){
      return null;
    }
  }

  function canForceNextWave(){
    var hooks = getActiveGameHooks();
    return !!(hooks && typeof hooks.completeLevel === 'function');
  }

  function isScoringLocked(){
    if(!activeGame) return false;
    if(!HighScores || typeof HighScores.isScoringDisabled !== 'function') return false;
    return !!HighScores.isScoringDisabled(activeGame.id);
  }

  function updateForceWaveButtonState(){
    if(!forceNextWaveBtn) return;

    var hasActiveGame = !!activeGame;
    var canForce = hasActiveGame && canForceNextWave();
    var locked = isScoringLocked();

    forceNextWaveBtn.style.display = hasActiveGame ? 'inline-block' : 'none';
    forceNextWaveBtn.disabled = !canForce;
    forceNextWaveBtn.className = locked ? 'is-locked' : '';
    forceNextWaveBtn.textContent = locked ? 'Next Wave (Scoring Off)' : 'Next Wave';

    if(!canForce){
      forceNextWaveBtn.title = 'This game does not expose a next-wave test hook.';
    } else if(locked){
      forceNextWaveBtn.title = 'Scoring is disabled for this game session because Force Next Wave was used.';
    } else {
      forceNextWaveBtn.title = 'Force the next wave/level for testing.';
    }
  }

  function forceNextWave(){
    if(!activeGame) return;
    var hooks = getActiveGameHooks();
    if(!hooks || typeof hooks.completeLevel !== 'function'){
      updateForceWaveButtonState();
      return;
    }

    var scoringJustDisabled = false;
    if(HighScores && typeof HighScores.disableScoring === 'function'){
      scoringJustDisabled = !!HighScores.disableScoring('force-next-wave', activeGame && activeGame.id);
    }

    if(scoringJustDisabled && typeof window !== 'undefined' && typeof window.alert === 'function'){
      window.alert(
        'Scoring is now disabled for this game session because Next Wave test mode was used.\n\n' +
        'It will reset when you start another game or reload the page.'
      );
    }

    try{
      hooks.completeLevel();
    }catch(error){
      showError(error && error.message ? error.message : String(error));
    }

    updateForceWaveButtonState();
  }

  function maybePromptWalletConnectForOnChain(){
    var onChainEnabled = !!(
      window.ARCADE_ONCHAIN_CONFIG &&
      window.ARCADE_ONCHAIN_CONFIG.enabled
    );
    var walletConnected = !!(lastWalletStatus && lastWalletStatus.state === 'is-connected');
    if(!onChainEnabled || walletConnected || connectPromptShown){
      return;
    }

    connectPromptShown = true;
    walletDebug('info', 'Showing wallet connect prompt before gameplay', {
      onChainEnabled: onChainEnabled,
      walletConnected: walletConnected
    });
    setTimeout(function(){
      var shouldConnect = false;
      if(typeof window !== 'undefined' && typeof window.confirm === 'function'){
        shouldConnect = window.confirm(
          'Connect wallet for on-chain Top 10 eligibility before playing?\\n\\n' +
          'Choose Cancel to play as guest (local PB only).'
        );
      }
      walletDebug('info', 'Wallet connect prompt completed', {
        accepted: !!shouldConnect
      });
      if(shouldConnect){
        startWalletDebugSummaryWindow('wallet-connect-prompt-confirm', {
          source: 'maybePromptWalletConnectForOnChain',
          targetNetwork: resolveTargetNetwork()
        });
        connectWallet().catch(function(error){
          var msg = error && error.message ? error.message : String(error);
          walletDebug('warn', 'Wallet connect prompt-triggered connect failed', walletErrorForLog(error));
          if(typeof window !== 'undefined' && typeof window.alert === 'function'){
            window.alert('Wallet connect was not completed: ' + msg);
          }
        });
      }
    }, 0);
  }

  function resolveProviderPath(path){
    return resolveProviderPathFromRoot(path, window);
  }

  function resolveProviderPathFromRoot(path, rootNode){
    if(typeof path !== 'string' || !path) return null;
    var parts = path.split('.');
    var node = rootNode || window;
    var i;
    for(i = 0; i < parts.length; i++){
      var key = parts[i];
      if(!key || !node || typeof node !== 'object') return null;
      try{
        if(!(key in node)) return null;
        node = node[key];
      }catch(e){
        return null;
      }
    }
    return node;
  }

  function safeWindowRead(target, key){
    if(!target || typeof target !== 'object') return null;
    try{
      return target[key];
    }catch(e){
      return null;
    }
  }

  function collectProviderContexts(){
    var out = [];

    function push(target, label){
      if(!target || (typeof target !== 'object' && typeof target !== 'function')) return;
      var i;
      for(i = 0; i < out.length; i++){
        if(out[i].target === target) return;
      }
      out.push({
        target: target,
        label: label
      });
    }

    if(typeof window === 'undefined'){
      return out;
    }

    push(window, 'window');

    try{
      if(window.parent && window.parent !== window){
        push(window.parent, 'window.parent');
      }
    }catch(e){}

    try{
      if(window.top && window.top !== window){
        push(window.top, 'window.top');
      }
    }catch(e){}

    try{
      if(window.opener && window.opener !== window){
        push(window.opener, 'window.opener');
      }
    }catch(e){}

    return out;
  }

  function collectProviders(){
    var out = [];

    function push(provider, label){
      if(providerLooksLikeNamespaceContainer(provider)) return;
      if(!providerHasCapabilities(provider)) return;
      var i;
      for(i = 0; i < out.length; i++){
        if(out[i].provider === provider) return;
      }
      try{
        provider.__arcadeWalletLabel = label || 'anonymous-provider';
      }catch(e){}
      out.push({
        provider: provider,
        label: label,
        name: String(label || 'Wallet')
      });
    }

    var providerContexts = collectProviderContexts();
    var contextIndex;
    for(contextIndex = 0; contextIndex < providerContexts.length; contextIndex++){
      var context = providerContexts[contextIndex];
      var contextRoot = context.target;
      var prefix = context.label || 'window';
      var directCandidates = [
        { label: prefix + '.StacksProvider', value: safeWindowRead(contextRoot, 'StacksProvider') },
        { label: prefix + '.StacksProvider.StacksProvider', value: resolveProviderPathFromRoot('StacksProvider.StacksProvider', contextRoot) },
        { label: prefix + '.StacksProvider.provider', value: resolveProviderPathFromRoot('StacksProvider.provider', contextRoot) },
        { label: prefix + '.StacksProvider.stacksProvider', value: resolveProviderPathFromRoot('StacksProvider.stacksProvider', contextRoot) },
        { label: prefix + '.StacksProvider.walletProvider', value: resolveProviderPathFromRoot('StacksProvider.walletProvider', contextRoot) },
        { label: prefix + '.StacksProvider.wallet', value: resolveProviderPathFromRoot('StacksProvider.wallet', contextRoot) },
        { label: prefix + '.LeatherProvider', value: safeWindowRead(contextRoot, 'LeatherProvider') },
        { label: prefix + '.LeatherProvider.provider', value: resolveProviderPathFromRoot('LeatherProvider.provider', contextRoot) },
        { label: prefix + '.LeatherProvider.stacksProvider', value: resolveProviderPathFromRoot('LeatherProvider.stacksProvider', contextRoot) },
        { label: prefix + '.LeatherProvider.walletProvider', value: resolveProviderPathFromRoot('LeatherProvider.walletProvider', contextRoot) },
        { label: prefix + '.XverseProviders', value: safeWindowRead(contextRoot, 'XverseProviders') },
        { label: prefix + '.XverseProviders.provider', value: resolveProviderPathFromRoot('XverseProviders.provider', contextRoot) },
        { label: prefix + '.XverseProviders.walletProvider', value: resolveProviderPathFromRoot('XverseProviders.walletProvider', contextRoot) },
        { label: prefix + '.xverseProviders', value: safeWindowRead(contextRoot, 'xverseProviders') },
        { label: prefix + '.XverseProviders.StacksProvider', value: resolveProviderPathFromRoot('XverseProviders.StacksProvider', contextRoot) },
        { label: prefix + '.xverseProviders.StacksProvider', value: resolveProviderPathFromRoot('xverseProviders.StacksProvider', contextRoot) },
        { label: prefix + '.XverseProviders.BitcoinProvider', value: resolveProviderPathFromRoot('XverseProviders.BitcoinProvider', contextRoot) },
        { label: prefix + '.xverseProviders.BitcoinProvider', value: resolveProviderPathFromRoot('xverseProviders.BitcoinProvider', contextRoot) },
        { label: prefix + '.stacksProvider', value: safeWindowRead(contextRoot, 'stacksProvider') },
        { label: prefix + '.btc', value: safeWindowRead(contextRoot, 'btc') },
        { label: prefix + '.stacks', value: safeWindowRead(contextRoot, 'stacks') },
        { label: prefix + '.BitcoinProvider', value: safeWindowRead(contextRoot, 'BitcoinProvider') }
      ];

      var c;
      for(c = 0; c < directCandidates.length; c++){
        push(directCandidates[c].value, directCandidates[c].label);
      }

      var registries = [
        safeWindowRead(contextRoot, 'btc_providers'),
        safeWindowRead(contextRoot, 'webbtc_providers'),
        safeWindowRead(contextRoot, 'wbip_providers')
      ];
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
            methods.indexOf('stx_callContract') < 0 &&
            methods.indexOf('stx_callContractV2') < 0 &&
            methods.indexOf('stx_requestAccounts') < 0 &&
            methods.indexOf('requestAccounts') < 0
          ){
            continue;
          }

          var provider = null;
          if(entry.provider && providerHasCapabilities(entry.provider)){
            provider = entry.provider;
          } else if(typeof entry.id === 'string' && entry.id){
            provider = resolveProviderPathFromRoot(entry.id, contextRoot);
            if(!provider && entry.id.indexOf('window.') === 0){
              provider = resolveProviderPathFromRoot(entry.id.substring(7), contextRoot);
            }
          }

          if(providerHasCapabilities(provider)){
            push(provider, prefix + ':registry:' + (entry.name || entry.id || ('#' + i)));
          }
        }
      }
    }

    out.sort(function(a, b){
      function score(entry){
        var label = String(entry && entry.label ? entry.label : '').toLowerCase();
        var score = 0;
        if(label.indexOf('window.stacksprovider') === 0) score += 140;
        if(
          label === 'window.stacksprovider' ||
          label === 'window.parent.stacksprovider' ||
          label === 'window.top.stacksprovider' ||
          label === 'window.opener.stacksprovider'
        ){
          score -= 45;
        }
        if(
          label.indexOf('.stacksprovider.stacksprovider') >= 0 ||
          label.indexOf('.stacksprovider.provider') >= 0 ||
          label.indexOf('.stacksprovider.walletprovider') >= 0 ||
          label.indexOf('.leatherprovider.provider') >= 0 ||
          label.indexOf('.leatherprovider.walletprovider') >= 0
        ){
          score += 65;
        }
        if(label.indexOf('stacksprovider') >= 0) score += 100;
        if(label.indexOf('leatherprovider') >= 0) score += 80;
        if(label.indexOf('xverseproviders.stacksprovider') >= 0) score += 60;
        if(label === 'window.xverseproviders') score -= 40;
        if(label.indexOf('xverse') >= 0) score += 20;
        if(label.indexOf('registry:') === 0 || label.indexOf(':registry:') >= 0) score += 10;
        if(label.indexOf('bitcoinprovider') >= 0) score -= 140;
        return score;
      }
      return score(b) - score(a);
    });

    var inIframe = false;
    try{
      inIframe = window.self !== window.top;
    }catch(e){
      inIframe = true;
    }

    var providerDiscoveryDetail = {
      build: WALLET_DEBUG_BUILD,
      count: out.length,
      labels: out.map(function(entry){ return entry.label; }),
      hasStacksProvider: providerContexts.some(function(context){ return !!safeWindowRead(context.target, 'StacksProvider'); }),
      hasLeatherProvider: providerContexts.some(function(context){ return !!safeWindowRead(context.target, 'LeatherProvider'); }),
      hasXverseProviders: providerContexts.some(function(context){ return !!safeWindowRead(context.target, 'XverseProviders'); }),
      providerContexts: providerContexts.map(function(context){ return context.label; }),
      inIframe: inIframe
    };
    walletDebugChanged('info', 'Provider discovery completed', providerDiscoveryDetail, 'provider-discovery');

    return out;
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

  function looksLikeStacksAddress(value){
    if(typeof value !== 'string') return false;
    var trimmed = value.trim();
    if(trimmed.length < 20) return false;
    var prefix = trimmed.slice(0,2);
    return prefix === 'SP' || prefix === 'ST' || prefix === 'SM' || prefix === 'SN';
  }

  function resolveTargetNetwork(){
    return window.ARCADE_ONCHAIN_CONFIG && window.ARCADE_ONCHAIN_CONFIG.network
      ? normalizeNetwork(window.ARCADE_ONCHAIN_CONFIG.network)
      : null;
  }

  function collectStacksAddresses(payload, out){
    if(!payload) return out;

    if(typeof payload === 'string'){
      if(looksLikeStacksAddress(payload)){
        out.push(payload.trim());
      }
      return out;
    }

    if(Array.isArray(payload)){
      var i;
      for(i = 0; i < payload.length; i++){
        collectStacksAddresses(payload[i], out);
      }
      return out;
    }

    if(typeof payload !== 'object'){
      return out;
    }

    if(payload.stxAddress){
      if(typeof payload.stxAddress === 'string'){
        collectStacksAddresses(payload.stxAddress, out);
      } else if(typeof payload.stxAddress === 'object'){
        collectStacksAddresses(payload.stxAddress.mainnet, out);
        collectStacksAddresses(payload.stxAddress.testnet, out);
      }
    }

    collectStacksAddresses(payload.identityAddress, out);
    collectStacksAddresses(payload.address, out);
    collectStacksAddresses(payload.selectedAddress, out);
    collectStacksAddresses(payload.paymentAddress, out);
    collectStacksAddresses(payload.addresses, out);
    collectStacksAddresses(payload.accounts, out);
    collectStacksAddresses(payload.stxAddresses, out);

    if(payload.profile && typeof payload.profile === 'object' && payload.profile.stxAddress){
      collectStacksAddresses(payload.profile.stxAddress, out);
    }
    if(payload.result){
      collectStacksAddresses(payload.result, out);
    }

    return out;
  }

  function pickPreferredStacksAddress(candidates, preferredNetwork){
    if(!Array.isArray(candidates) || !candidates.length) return null;

    var deduped = [];
    var seen = {};
    var i;
    for(i = 0; i < candidates.length; i++){
      var candidate = candidates[i];
      if(!looksLikeStacksAddress(candidate)) continue;
      if(seen[candidate]) continue;
      seen[candidate] = true;
      deduped.push(candidate);
    }

    if(!deduped.length) return null;
    if(preferredNetwork){
      for(i = 0; i < deduped.length; i++){
        if(inferNetworkFromAddress(deduped[i]) === preferredNetwork){
          return deduped[i];
        }
      }
    }
    return deduped[0];
  }

  function extractAddress(payload, preferredNetwork){
    var candidates = collectStacksAddresses(payload, []);
    return pickPreferredStacksAddress(candidates, preferredNetwork || null);
  }

  function isTargetNetworkMismatch(targetNetwork, resolvedNetwork, address){
    if(!targetNetwork) return false;
    var effective = resolvedNetwork || inferNetworkFromAddress(address);
    return !!(effective && effective !== targetNetwork);
  }

  function shortAddress(address){
    if(!address || address.length < 12) return address || '';
    return address.slice(0,6) + '...' + address.slice(-4);
  }

  function stripHexPrefix(input){
    if(typeof input !== 'string') return '';
    return input.indexOf('0x') === 0 || input.indexOf('0X') === 0 ? input.substring(2) : input;
  }

  function extractNetwork(payload){
    if(!payload) return null;
    if(typeof payload === 'string') return normalizeNetwork(payload);
    if(typeof payload === 'object'){
      if(payload.result && typeof payload.result === 'object'){
        var nested = extractNetwork(payload.result);
        if(nested) return nested;
      }
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

  function maybeCallDirectProviderConnect(provider){
    if(!provider) return Promise.resolve(null);
    var directConnectTimeoutMs = 12000;
    var attempts = [];

    if(typeof provider.enable === 'function'){
      attempts.push({
        method: 'enable',
        variant: '()',
        run: function(){ return provider.enable(); }
      });
    }

    if(typeof provider.connect === 'function'){
      var defaults = defaultMethodParams('connect');
      var i;
      for(i = 0; i < defaults.length; i++){
        (function(param, idx){
          attempts.push({
            method: 'connect',
            variant: '(default-' + idx + ')',
            run: function(){ return provider.connect(param); }
          });
        })(defaults[i], i);
      }
      if(defaults.length === 0){
        attempts.push({
          method: 'connect',
          variant: '()',
          run: function(){ return provider.connect(); }
        });
      }
    }

    function run(index){
      if(index >= attempts.length){
        return Promise.resolve(null);
      }
      return Promise.resolve()
        .then(function(){
          var attempt = attempts[index];
          walletDebug('info', 'Direct provider connect attempt', {
            provider: getProviderLabel(provider),
            method: attempt.method,
            variant: attempt.variant
          });
          return withPromiseTimeout(
            Promise.resolve(attempt.run()),
            directConnectTimeoutMs,
            'Direct wallet connect timed out.'
          );
        })
        .then(function(result){
          return result || true;
        })
        .catch(function(error){
          var attempt = attempts[index];
          walletDebug('warn', 'Direct provider connect failed', {
            provider: getProviderLabel(provider),
            method: attempt.method,
            variant: attempt.variant,
            error: walletErrorForLog(error)
          });
          return run(index + 1);
        });
    }
    return run(0);
  }

  function isUnsupportedProviderError(error){
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

  function isInvalidParamsError(error){
    if(!error) return false;
    if(typeof error.code !== 'undefined' && error.code === -32602) return true;
    var message = (error && error.message ? error.message : String(error)).toLowerCase();
    return (
      message.indexOf('invalid parameters') >= 0 ||
      message.indexOf('invalid params') >= 0
    );
  }

  function shouldCacheUnsupportedMethod(hasParams, error){
    if(!error) return false;
    return isUnsupportedProviderError(error);
  }

  function prefersDefaultParamCall(method){
    return (
      method === 'requestAccounts' ||
      method === 'stx_requestAccounts' ||
      method === 'connect' ||
      method === 'stx_connect' ||
      method === 'wallet_connect'
    );
  }

  function shouldSkipBareCallForMethod(method){
    return (
      method === 'connect' ||
      method === 'stx_connect' ||
      method === 'wallet_connect'
    );
  }

  function withPromiseTimeout(promise, timeoutMs, message){
    if(!timeoutMs || timeoutMs <= 0){
      return promise;
    }
    return new Promise(function(resolve, reject){
      var completed = false;
      var timer = setTimeout(function(){
        if(completed) return;
        completed = true;
        var timeoutError = new Error(message || 'Wallet request timed out.');
        timeoutError.code = 'REQUEST_TIMEOUT';
        reject(timeoutError);
      }, timeoutMs);

      promise.then(function(value){
        if(completed) return;
        completed = true;
        clearTimeout(timer);
        resolve(value);
      }).catch(function(error){
        if(completed) return;
        completed = true;
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  function shouldSkipConnectMethodForProvider(entry, method){
    if(!entry) return false;
    if(!isLikelyBitcoinOnlyProvider(entry)) return false;
    return (
      method === 'stx_requestAccounts' ||
      method === 'requestAccounts' ||
      method === 'connect' ||
      method === 'stx_connect' ||
      method === 'wallet_connect'
    );
  }

  function isWalletConnectMethod(method){
    return (
      method === 'stx_requestAccounts' ||
      method === 'requestAccounts' ||
      method === 'stx_connect' ||
      method === 'connect' ||
      method === 'wallet_connect'
    );
  }

  function isRequestFunctionNotImplementedError(error){
    if(!error) return false;
    var message = (error && error.message ? error.message : String(error)).toLowerCase();
    return message.indexOf('`request` function is not implemented') >= 0 || message.indexOf('request function is not implemented') >= 0;
  }

  function walletConnectErrorKind(error){
    if(!error) return 'unknown';
    if(isUserRejectedError(error)) return 'user-rejected';
    if(isRequestFunctionNotImplementedError(error)) return 'request-not-implemented';
    if(isUnsupportedProviderError(error)) return 'unsupported-method';
    if(isInvalidParamsError(error)) return 'invalid-params';
    if(error && error.code === 'REQUEST_TIMEOUT') return 'timeout';
    return 'other';
  }

  function walletConnectDebug(level, message, detail){
    walletDebug(level, '[wallet-connect] ' + String(message || ''), detail);
  }

  function readWalletConnectSessionStorage(){
    if(typeof window === 'undefined') return null;
    if(!window.localStorage) return null;
    try{
      return window.localStorage.getItem(WALLET_CONNECT_SESSION_STORAGE_KEY);
    }catch(error){
      return null;
    }
  }

  function writeWalletConnectSessionStorage(value){
    if(typeof window === 'undefined') return;
    if(!window.localStorage) return;
    try{
      if(value){
        window.localStorage.setItem(WALLET_CONNECT_SESSION_STORAGE_KEY, value);
      } else {
        window.localStorage.removeItem(WALLET_CONNECT_SESSION_STORAGE_KEY);
      }
    }catch(error){}
  }

  function restoreWalletConnectSession(){
    if(walletConnectSession) return;
    var raw = readWalletConnectSessionStorage();
    if(!raw) return;
    try{
      var parsed = JSON.parse(raw);
      if(!parsed || !looksLikeStacksAddress(parsed.address)) return;
      walletConnectSession = {
        address: String(parsed.address).trim(),
        network: normalizeNetwork(parsed.network) || inferNetworkFromAddress(parsed.address) || null,
        provider: parsed.provider ? String(parsed.provider) : null,
        source: parsed.source ? String(parsed.source) : 'storage'
      };
      walletConnectDebug('info', 'session restored', {
        address: walletConnectSession.address,
        network: walletConnectSession.network,
        provider: walletConnectSession.provider
      });
    }catch(error){
      writeWalletConnectSessionStorage('');
    }
  }

  function clearWalletConnectSession(reason){
    if(walletConnectSession){
      walletConnectDebug('info', 'session cleared', {
        reason: reason || 'unspecified',
        address: walletConnectSession.address || null,
        network: walletConnectSession.network || null,
        provider: walletConnectSession.provider || null,
        source: walletConnectSession.source || null
      });
    }
    walletConnectSession = null;
    writeWalletConnectSessionStorage('');
  }

  function setWalletConnectSession(address, network, providerLabel, source){
    if(!looksLikeStacksAddress(address)) return false;
    var normalizedAddress = String(address).trim();
    walletConnectSession = {
      address: normalizedAddress,
      network: normalizeNetwork(network) || inferNetworkFromAddress(normalizedAddress) || null,
      provider: providerLabel ? String(providerLabel) : null,
      source: source ? String(source) : null
    };
    walletConnectDebug('info', 'session updated', {
      address: walletConnectSession.address,
      network: walletConnectSession.network,
      provider: walletConnectSession.provider,
      source: walletConnectSession.source
    });
    writeWalletConnectSessionStorage(JSON.stringify(walletConnectSession));
    return true;
  }

  function extractAddressFromConnectAuthPayload(payload, targetNetwork){
    var candidates = [];

    if(payload && payload.userSession && typeof payload.userSession.loadUserData === 'function'){
      try{
        var userData = payload.userSession.loadUserData();
        collectStacksAddresses(userData, candidates);
        if(userData && userData.profile){
          collectStacksAddresses(userData.profile, candidates);
        }
        if(userData && userData.identityAddress){
          collectStacksAddresses(userData.identityAddress, candidates);
        }
      }catch(error){
        walletConnectDebug('warn', 'auth payload userSession read failed', {
          error: walletErrorForLog(error)
        });
      }
    }

    if(payload && payload.authResponsePayload){
      collectStacksAddresses(payload.authResponsePayload, candidates);
      if(payload.authResponsePayload.profile){
        collectStacksAddresses(payload.authResponsePayload.profile, candidates);
      }
      if(payload.authResponsePayload.identityAddress){
        collectStacksAddresses(payload.authResponsePayload.identityAddress, candidates);
      }
    }

    return pickPreferredStacksAddress(candidates, targetNetwork) || pickPreferredStacksAddress(candidates, null);
  }

  function setWalletConnectSessionFromAuthPayload(payload, targetNetwork, providerLabel){
    var address = extractAddressFromConnectAuthPayload(payload, targetNetwork);
    if(!address){
      return false;
    }
    var payloadNetwork = inferNetworkFromAddress(address) || targetNetwork || null;
    return setWalletConnectSession(address, payloadNetwork, providerLabel || 'stacks-connect', 'stacks-connect-auth');
  }

  function isWalletConnectCancelledStatus(status){
    if(typeof status === 'undefined' || status === null) return false;
    var lower = String(status).toLowerCase();
    return lower === 'cancelled' || lower === 'canceled' || lower === 'cancel';
  }

  function walletConnectImportUrls(){
    return [
      'https://cdn.jsdelivr.net/npm/@stacks/connect@7.10.2/dist/index.mjs',
      'https://unpkg.com/@stacks/connect@7.10.2/dist/index.mjs'
    ];
  }

  function normalizeWalletConnectModule(imported){
    if(!imported || typeof imported !== 'object') return null;
    if(
      typeof imported.authenticate === 'function' ||
      typeof imported.showConnect === 'function'
    ){
      return imported;
    }
    if(imported.default && typeof imported.default === 'object'){
      if(
        typeof imported.default.authenticate === 'function' ||
        typeof imported.default.showConnect === 'function'
      ){
        return imported.default;
      }
    }
    return imported;
  }

  function loadWalletConnectModule(){
    if(walletConnectSdkModulePromise){
      return walletConnectSdkModulePromise;
    }
    walletConnectSdkModulePromise = (async function(){
      var urls = walletConnectImportUrls();
      var lastError = null;
      var i;
      for(i = 0; i < urls.length; i++){
        var url = urls[i];
        try{
          walletConnectDebug('info', 'fallback sdk import attempt', {
            url: url
          });
          var imported = await import(url);
          var walletConnectModule = normalizeWalletConnectModule(imported);
          if(
            walletConnectModule &&
            (typeof walletConnectModule.authenticate === 'function' || typeof walletConnectModule.showConnect === 'function')
          ){
            walletConnectDebug('info', 'fallback sdk import succeeded', {
              url: url,
              hasAuthenticate: typeof walletConnectModule.authenticate === 'function',
              hasShowConnect: typeof walletConnectModule.showConnect === 'function'
            });
            return walletConnectModule;
          }
          throw new Error('Stacks Connect module did not expose authenticate/showConnect.');
        }catch(error){
          lastError = error;
          walletConnectDebug('warn', 'fallback sdk import failed', {
            url: url,
            error: walletErrorForLog(error)
          });
        }
      }
      throw lastError || new Error('Unable to load Stacks Connect module.');
    })().catch(function(error){
      walletConnectSdkModulePromise = null;
      throw error;
    });
    return walletConnectSdkModulePromise;
  }

  function resolveWalletConnectRedirectPath(){
    if(typeof window === 'undefined' || !window.location) return '/';
    var path =
      String(window.location.pathname || '/') +
      String(window.location.search || '') +
      String(window.location.hash || '');
    return path || '/';
  }

  function resolveWalletConnectIconUrl(){
    if(typeof window === 'undefined' || !window.location) return '';
    return window.location.origin + '/favicon.ico';
  }

  function createWalletConnectUserSession(walletConnectModule){
    if(!walletConnectModule) return null;
    if(typeof walletConnectModule.AppConfig !== 'function') return null;
    if(typeof walletConnectModule.UserSession !== 'function') return null;
    try{
      var appConfig = new walletConnectModule.AppConfig(['store_write'], undefined, '', '/manifest.json');
      return new walletConnectModule.UserSession({ appConfig: appConfig });
    }catch(error){
      walletConnectDebug('warn', 'fallback user session creation failed', {
        error: walletErrorForLog(error)
      });
      return null;
    }
  }

  async function attemptWalletConnectWithStacksConnect(providerEntry, targetNetwork){
    var provider = providerEntry && providerEntry.provider ? providerEntry.provider : null;
    var providerLabel = providerEntry && providerEntry.label ? providerEntry.label : 'unknown-provider';
    var walletConnectModule = await loadWalletConnectModule();
    var authFn = walletConnectModule && typeof walletConnectModule.authenticate === 'function'
      ? walletConnectModule.authenticate
      : null;
    var showConnectFn = walletConnectModule && typeof walletConnectModule.showConnect === 'function'
      ? walletConnectModule.showConnect
      : null;
    if(!authFn && !showConnectFn){
      throw new Error('Stacks Connect module did not expose authenticate/showConnect.');
    }
    var userSession = createWalletConnectUserSession(walletConnectModule);
    var strategy = showConnectFn ? 'showConnect' : 'authenticate';
    walletConnectDebug('info', 'fallback auth invocation', {
      provider: providerLabel,
      targetNetwork: targetNetwork,
      strategy: strategy,
      hasProvider: !!provider
    });

    return await new Promise(function(resolve, reject){
      var settled = false;
      var timeoutMs = 90000;
      var timeoutId = setTimeout(function(){
        if(settled) return;
        settled = true;
        reject(new Error('Wallet authentication timed out.'));
      }, timeoutMs);

      function settle(error, result){
        if(settled) return;
        settled = true;
        clearTimeout(timeoutId);
        if(error){
          reject(error);
        } else {
          resolve(result);
        }
      }

      var authOptions = {
        appDetails: {
          name: 'Retro Arcade',
          icon: resolveWalletConnectIconUrl()
        },
        manifestPath: '/manifest.json',
        redirectTo: resolveWalletConnectRedirectPath(),
        onFinish: function(payload){
          settle(null, {
            status: 'finished',
            payload: payload || null
          });
        },
        onCancel: function(){
          settle(null, {
            status: 'cancelled'
          });
        }
      };
      if(userSession){
        authOptions.userSession = userSession;
      }

      try{
        var invocation;
        if(showConnectFn){
          invocation = showConnectFn(authOptions);
        } else {
          invocation = authFn(authOptions, provider || undefined);
        }
        Promise.resolve(invocation).catch(function(error){
          settle(error);
        });
      }catch(error){
        settle(error);
      }
    });
  }

  function isUserRejectedError(error){
    if(!error) return false;
    if(typeof error.code !== 'undefined'){
      if(error.code === 4001 || error.code === -32000 || error.code === 'USER_REJECTION'){
        return true;
      }
    }
    var message = (error && error.message ? error.message : String(error)).toLowerCase();
    return (
      message.indexOf('user rejected') >= 0 ||
      message.indexOf('cancelled') >= 0 ||
      message.indexOf('canceled') >= 0 ||
      message.indexOf('rejected') >= 0 ||
      message.indexOf('denied') >= 0
    );
  }

  function requestProvider(provider, method, params, options){
    if(!provider || typeof provider !== 'object'){
      return Promise.reject(new Error('Wallet provider is unavailable.'));
    }

    var hasParams = typeof params !== 'undefined';
    var timeoutMs = options && typeof options.timeoutMs === 'number'
      ? options.timeoutMs
      : 3500;
    var providerLabel = getProviderLabel(provider);
    var connectMethod = isWalletConnectMethod(method);
    if(isKnownUnsupportedMethod(provider, method)){
      if(connectMethod){
        walletConnectDebug('info', 'non-event: method already known unsupported', {
          provider: providerLabel,
          method: method
        });
      }
      return Promise.reject(createKnownUnsupportedMethodError(method));
    }
    var attempts = [];

    var targets = [];
    var targetSeen = [];

    function pushTarget(target, tag){
      var i;
      if(!target || typeof target !== 'object') return;
      for(i = 0; i < targetSeen.length; i++){
        if(targetSeen[i] === target) return;
      }
      targetSeen.push(target);
      targets.push({
        target: target,
        tag: tag || 'provider'
      });
    }

    pushTarget(provider, providerLabel + ':self');
    if(provider && typeof provider === 'object'){
      var nestedKeys = [
        'StacksProvider',
        'stacksProvider',
        'provider',
        'walletProvider',
        'wallet',
        'providers',
        'stacks',
        'rpc',
        'client',
        'BitcoinProvider'
      ];
      var n;
      for(n = 0; n < nestedKeys.length; n++){
        if(provider[nestedKeys[n]] && typeof provider[nestedKeys[n]] === 'object'){
          pushTarget(provider[nestedKeys[n]], providerLabel + ':' + nestedKeys[n]);
        }
      }
      if(typeof provider.getProvider === 'function'){
        try{
          pushTarget(provider.getProvider(), providerLabel + ':getProvider()');
        }catch(e){
          walletDebug('warn', 'Provider getProvider() threw during target discovery', {
            provider: providerLabel,
            error: walletErrorForLog(e)
          });
        }
      }
    }

    targets.sort(function(a, b){
      function score(targetEntry){
        var tag = String(targetEntry && targetEntry.tag ? targetEntry.tag : '').toLowerCase();
        var s = 0;
        if(tag.indexOf(':stacksprovider') >= 0) s += 120;
        if(tag.indexOf(':walletprovider') >= 0) s += 60;
        if(tag.indexOf(':provider') >= 0) s += 40;
        if(tag.indexOf(':wallet') >= 0) s += 20;
        if(tag.indexOf(':bitcoinprovider') >= 0) s -= 120;
        if(tag.indexOf(':self') >= 0) s -= 10;
        return s;
      }
      return score(b) - score(a);
    });

    function nextAttemptIndexAfterSource(index){
      var source = attempts[index] ? attempts[index].source : null;
      var i;
      for(i = index + 1; i < attempts.length; i++){
        if(attempts[i].source !== source){
          return i;
        }
      }
      return attempts.length;
    }

    function addAttempt(target, source, variant, run){
      attempts.push({
        source: source,
        variant: variant,
        run: run
      });
    }

    function addDirectMethodAttempts(target, source){
      if(!target || typeof target !== 'object') return;
      if(typeof target[method] !== 'function') return;
      var fn = target[method];
      if(hasParams){
        addAttempt(target, source, method + '(params)', function(){ return fn.call(target, params); });
        addAttempt(target, source, method + '()', function(){ return fn.call(target); });
      } else {
        var defaults = defaultMethodParams(method);
        var preferDefaults = prefersDefaultParamCall(method);
        var skipBare = shouldSkipBareCallForMethod(method);
        var i;

        if(preferDefaults){
          for(i = 0; i < defaults.length; i++){
            (function(p, idx){
              addAttempt(target, source, method + '(default-' + idx + ')', function(){ return fn.call(target, p); });
            })(defaults[i], i);
          }
          if(!skipBare || defaults.length === 0){
            addAttempt(target, source, method + '({})', function(){ return fn.call(target, {}); });
            addAttempt(target, source, method + '()', function(){ return fn.call(target); });
          }
        } else {
          addAttempt(target, source, method + '()', function(){ return fn.call(target); });
          addAttempt(target, source, method + '({})', function(){ return fn.call(target, {}); });
          for(i = 0; i < defaults.length; i++){
            (function(p, idx){
              addAttempt(target, source, method + '(default-' + idx + ')', function(){ return fn.call(target, p); });
            })(defaults[i], i);
          }
        }
      }
    }

    function addRequestAttempts(target, source){
      if(!target || typeof target.request !== 'function') return;
      if(hasParams){
        addAttempt(target, source, 'request(method, params)', function(){ return target.request(method, params); });
        addAttempt(target, source, 'request({method, params})', function(){ return target.request({ method: method, params: params }); });
      } else {
        var defaults = defaultMethodParams(method);
        var preferDefaults = prefersDefaultParamCall(method);
        var skipBare = shouldSkipBareCallForMethod(method);
        var i;

        if(preferDefaults){
          for(i = 0; i < defaults.length; i++){
            (function(p, idx){
              addAttempt(target, source, 'request(method, default-' + idx + ')', function(){ return target.request(method, p); });
              addAttempt(target, source, 'request({method, default-' + idx + '})', function(){ return target.request({ method: method, params: p }); });
            })(defaults[i], i);
          }
          if(!skipBare || defaults.length === 0){
            addAttempt(target, source, 'request({method, params:{}})', function(){ return target.request({ method: method, params: {} }); });
            addAttempt(target, source, 'request(method, {})', function(){ return target.request(method, {}); });
            addAttempt(target, source, 'request({method})', function(){ return target.request({ method: method }); });
            addAttempt(target, source, 'request(method)', function(){ return target.request(method); });
          }
        } else {
          addAttempt(target, source, 'request(method)', function(){ return target.request(method); });
          addAttempt(target, source, 'request({method})', function(){ return target.request({ method: method }); });
          addAttempt(target, source, 'request(method, {})', function(){ return target.request(method, {}); });
          addAttempt(target, source, 'request({method, params:{}})', function(){ return target.request({ method: method, params: {} }); });
          for(i = 0; i < defaults.length; i++){
            (function(p, idx){
              addAttempt(target, source, 'request(method, default-' + idx + ')', function(){ return target.request(method, p); });
              addAttempt(target, source, 'request({method, default-' + idx + '})', function(){ return target.request({ method: method, params: p }); });
            })(defaults[i], i);
          }
        }
      }
    }

    var t;
    for(t = 0; t < targets.length; t++){
      addDirectMethodAttempts(targets[t].target, targets[t].tag);
      addRequestAttempts(targets[t].target, targets[t].tag);
    }

    if(attempts.length === 0){
      return Promise.reject(new Error('Wallet provider has no callable method for "' + method + '".'));
    }

    if(connectMethod){
      walletConnectDebug('info', 'attempt plan', {
        provider: providerLabel,
        method: method,
        attemptCount: attempts.length,
        targetSources: targets.map(function(target){ return target.tag; })
      });
    }

    async function run(index, previousError){
      if(index >= attempts.length){
        if(connectMethod){
          walletConnectDebug('warn', 'non-event: exhausted request attempts', {
            provider: providerLabel,
            method: method,
            lastError: walletErrorForLog(previousError)
          });
        }
        if(shouldCacheUnsupportedMethod(hasParams, previousError)){
          markMethodUnsupported(provider, method);
        }
        throw previousError || new Error('Wallet provider rejected request.');
      }
      var attempt = attempts[index];
      try{
        if(connectMethod){
          walletConnectDebug('info', 'attempt', {
            provider: providerLabel,
            method: method,
            attemptIndex: index,
            source: attempt.source,
            variant: attempt.variant,
            timeoutMs: timeoutMs
          });
        }
        walletDebug('info', 'Provider request attempt', {
          provider: providerLabel,
          method: method,
          attemptIndex: index,
          hasParams: hasParams,
          source: attempt.source,
          variant: attempt.variant,
          timeoutMs: timeoutMs
        });
        var result = await withPromiseTimeout(
          Promise.resolve(attempt.run()),
          timeoutMs,
          'Wallet provider request timed out for "' + method + '".'
        );
        if(connectMethod){
          walletConnectDebug('info', 'attempt succeeded', {
            provider: providerLabel,
            method: method,
            attemptIndex: index,
            source: attempt.source,
            variant: attempt.variant
          });
        }
        return result;
      }catch(error){
        var retryable = isUnsupportedProviderError(error) || isInvalidParamsError(error);
        if(retryable){
          if(
            connectMethod &&
            isRequestFunctionNotImplementedError(error) &&
            attempt &&
            typeof attempt.variant === 'string' &&
            attempt.variant.indexOf('request(') === 0
          ){
            var nextIndex = nextAttemptIndexAfterSource(index);
            walletConnectDebug('warn', 'non-event: request shim not implemented; skipping source', {
              provider: providerLabel,
              method: method,
              source: attempt.source,
              attemptIndex: index,
              variant: attempt.variant,
              skippedUntilIndex: nextIndex,
              error: walletErrorForLog(error)
            });
            return run(nextIndex, error);
          }
          var cacheMethod = shouldCacheUnsupportedMethod(hasParams, error);
          if(cacheMethod && index >= attempts.length - 1){
            markMethodUnsupported(provider, method);
            walletDebug('warn', 'Provider method marked unsupported', {
              provider: providerLabel,
              method: method,
              error: walletErrorForLog(error)
            });
          } else {
            walletDebug('warn', 'Provider request attempt retrying', {
              provider: providerLabel,
              method: method,
              attemptIndex: index,
              source: attempts[index].source,
              variant: attempts[index].variant,
              error: walletErrorForLog(error)
            });
          }
          if(connectMethod){
            walletConnectDebug('warn', 'attempt retrying', {
              provider: providerLabel,
              method: method,
              attemptIndex: index,
              source: attempts[index].source,
              variant: attempts[index].variant,
              errorKind: walletConnectErrorKind(error),
              error: walletErrorForLog(error)
            });
          }
          return run(index + 1, error);
        }
        walletDebug('warn', 'Provider request attempt failed', {
          provider: providerLabel,
          method: method,
          attemptIndex: index,
          source: attempts[index].source,
          variant: attempts[index].variant,
          error: walletErrorForLog(error)
        });
        if(connectMethod){
          walletConnectDebug('warn', 'attempt failed', {
            provider: providerLabel,
            method: method,
            attemptIndex: index,
            source: attempts[index].source,
            variant: attempts[index].variant,
            errorKind: walletConnectErrorKind(error),
            error: walletErrorForLog(error)
          });
        }
        throw error;
      }
    }

    return run(0, null);
  }

  function defaultMethodParams(method){
    var target = resolveTargetNetwork() || 'mainnet';
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
        { addresses: ['ordinals', 'payment', 'stacks'] }
      ];
    }
    if(method === 'stx_getAccounts' || method === 'stx_getAddresses' || method === 'stx_requestAccounts'){
      return [
        { network: target },
        { message: commonMessage }
      ];
    }
    if(method === 'wallet_connect'){
      return [
        { addresses: ['stacks'], purposes: ['stacks'], message: commonMessage },
        { addresses: ['payment', 'ordinals', 'stacks'], purposes: ['payment', 'ordinals', 'stacks'], message: commonMessage },
        { addresses: ['payment', 'stacks'] },
        { network: target }
      ];
    }
    if(method === 'connect' || method === 'stx_connect'){
      return [
        { addresses: ['stacks'], purposes: ['stacks'], message: commonMessage },
        { addresses: ['payment', 'ordinals', 'stacks'], purposes: ['payment', 'ordinals', 'stacks'], message: commonMessage },
        { addresses: ['payment', 'stacks'] },
        { network: target }
      ];
    }
    return [];
  }

  async function resolveProviderAddress(provider, preferredNetwork){
    if(!provider) return null;
    var fallbackAddress = null;
    var providerLabel = getProviderLabel(provider);

    if(typeof provider.selectedAddress === 'string' && looksLikeStacksAddress(provider.selectedAddress)){
      if(inferNetworkFromAddress(provider.selectedAddress) === preferredNetwork || !preferredNetwork){
        walletDebug('info', 'Using provider.selectedAddress', {
          provider: providerLabel,
          preferredNetwork: preferredNetwork,
          selectedAddress: provider.selectedAddress
        });
        return provider.selectedAddress;
      }
      fallbackAddress = provider.selectedAddress;
    }
    if(typeof provider.address === 'string' && looksLikeStacksAddress(provider.address)){
      if(inferNetworkFromAddress(provider.address) === preferredNetwork || !preferredNetwork){
        walletDebug('info', 'Using provider.address', {
          provider: providerLabel,
          preferredNetwork: preferredNetwork,
          address: provider.address
        });
        return provider.address;
      }
      if(!fallbackAddress){
        fallbackAddress = provider.address;
      }
    }

    var methods = ['stx_getAddresses', 'getAddresses', 'stx_getAccounts', 'getAccounts', 'wallet_getAccount'];
    var i;
    for(i = 0; i < methods.length; i++){
      if(isKnownUnsupportedMethod(provider, methods[i])) continue;
      try{
        var payload = await requestProvider(provider, methods[i]);
        var rpcError = extractRpcError(payload);
        if(rpcError) throw rpcError;
        var parsed = extractAddress(payload, preferredNetwork);
        if(parsed) return parsed;
        var fallbackParsed = extractAddress(payload);
        if(!fallbackAddress && fallbackParsed){
          fallbackAddress = fallbackParsed;
        }
        walletDebug('info', 'Provider address method response', {
          provider: providerLabel,
          method: methods[i],
          preferredNetwork: preferredNetwork,
          parsedAddress: parsed || null,
          fallbackAddress: fallbackAddress || null
        });
      }catch(e){
        if(shouldCacheUnsupportedMethod(false, e)){
          markMethodUnsupported(provider, methods[i]);
        }
        walletDebug('warn', 'Provider address method failed', {
          provider: providerLabel,
          method: methods[i],
          error: walletErrorForLog(e)
        });
      }
    }

    walletDebug('info', 'Provider address resolution finished', {
      provider: providerLabel,
      preferredNetwork: preferredNetwork,
      resolvedAddress: fallbackAddress || null
    });
    return fallbackAddress;
  }

  async function resolveProviderNetwork(provider, addressHint){
    if(!provider) return inferNetworkFromAddress(addressHint);
    var providerLabel = getProviderLabel(provider);

    var methods = ['stx_getNetwork', 'getNetwork'];
    var i;
    for(i = 0; i < methods.length; i++){
      if(isKnownUnsupportedMethod(provider, methods[i])) continue;
      try{
        var payload = await requestProvider(provider, methods[i]);
        var rpcError = extractRpcError(payload);
        if(rpcError) throw rpcError;
        var network = extractNetwork(payload);
        if(network){
          walletDebug('info', 'Provider network resolved via method', {
            provider: providerLabel,
            method: methods[i],
            network: network
          });
          return network;
        }
      }catch(e){
        if(shouldCacheUnsupportedMethod(false, e)){
          markMethodUnsupported(provider, methods[i]);
        }
        walletDebug('warn', 'Provider network method failed', {
          provider: providerLabel,
          method: methods[i],
          error: walletErrorForLog(e)
        });
      }
    }

    var inferred = inferNetworkFromAddress(addressHint);
    walletDebug('info', 'Provider network inferred from address', {
      provider: providerLabel,
      addressHint: addressHint || null,
      inferredNetwork: inferred || null
    });
    return inferred;
  }

  async function resolveConnectedWallet(options){
    var providers = collectProviders();
    var candidateProviders = getWalletAddressCandidates(providers);
    var splitCandidates = splitWalletAddressCandidates(candidateProviders);
    var targetNetwork = options && options.targetNetwork ? options.targetNetwork : null;
    var resolveStartDetail = {
      targetNetwork: targetNetwork,
      providers: providers.map(function(entry){ return entry.label; }),
      candidateProviders: candidateProviders.map(function(entry){ return entry.label; }),
      primaryCandidates: splitCandidates.primary.map(function(entry){ return entry.label; }),
      fallbackCandidates: splitCandidates.fallback.map(function(entry){ return entry.label; })
    };
    walletDebugChanged('info', 'resolveConnectedWallet start', resolveStartDetail, 'resolve-start');
    if(!providers.length){
      walletDebugChanged('warn', 'resolveConnectedWallet found no providers', {
        status: 'no-providers',
        targetNetwork: targetNetwork
      }, 'resolve-outcome');
      return {
        providers: providers,
        providerEntry: null,
        address: null,
        network: null
      };
    }

    var groups = [];
    if(splitCandidates.primary.length > 0){
      groups.push({ kind: 'primary', entries: splitCandidates.primary });
    }
    if(splitCandidates.fallback.length > 0){
      groups.push({ kind: 'fallback', entries: splitCandidates.fallback });
    }

    var g;
    var i;
    var firstResolved = null;
    for(g = 0; g < groups.length; g++){
      for(i = 0; i < groups[g].entries.length; i++){
        var entry = groups[g].entries[i];
        var address = await resolveProviderAddress(entry.provider, targetNetwork);
        if(address){
          var network = await resolveProviderNetwork(entry.provider, address);
          var candidateDetail = {
            provider: entry.label,
            address: address,
            network: network || null,
            targetNetwork: targetNetwork,
            candidateGroup: groups[g].kind
          };
          walletDebugChanged('info', 'resolveConnectedWallet candidate resolved', candidateDetail, 'resolve-candidate');
          var resolved = {
            providers: providers,
            providerEntry: entry,
            address: address,
            network: network
          };
          if(!firstResolved){
            firstResolved = resolved;
          }
          if(!isTargetNetworkMismatch(targetNetwork, network, address)){
            walletDebugChanged('info', 'resolveConnectedWallet selected candidate', {
              provider: entry.label,
              address: address,
              network: network || null,
              candidateGroup: groups[g].kind
            }, 'resolve-selected');
            return resolved;
          }
        }
      }
    }

    if(firstResolved){
      walletDebugChanged('warn', 'resolveConnectedWallet returning mismatched-network candidate', {
        status: 'mismatch',
        provider: firstResolved.providerEntry ? firstResolved.providerEntry.label : null,
        address: firstResolved.address || null,
        network: firstResolved.network || null,
        targetNetwork: targetNetwork
      }, 'resolve-outcome');
      return firstResolved;
    }

    walletDebugChanged('warn', 'resolveConnectedWallet providers detected but no address resolved', {
      status: 'no-address',
      firstProvider: candidateProviders[0] ? candidateProviders[0].label : null,
      targetNetwork: targetNetwork
    }, 'resolve-outcome');
    return {
      providers: providers,
      providerEntry: candidateProviders[0] || providers[0] || null,
      address: null,
      network: null
    };
  }

  async function getWalletStatus(){
    var targetNetwork = resolveTargetNetwork();

    if(walletConnectSession && looksLikeStacksAddress(walletConnectSession.address)){
      if(walletDisconnectOverride){
        return {
          state: 'is-warning',
          label: 'Wallet: disconnected on page · click to reconnect',
          hasAddress: false,
          address: null,
          network: null,
          provider: walletConnectSession.provider || 'wallet session'
        };
      }
      var sessionNetwork = walletConnectSession.network || inferNetworkFromAddress(walletConnectSession.address) || targetNetwork || 'unknown';
      var sessionLabel = 'Wallet: ' + shortAddress(walletConnectSession.address) + ' · ' + sessionNetwork;
      var sessionWarning = isTargetNetworkMismatch(targetNetwork, walletConnectSession.network, walletConnectSession.address);
      return {
        state: sessionWarning ? 'is-warning' : 'is-connected',
        label: sessionWarning ? sessionLabel + ' (target ' + targetNetwork + ')' : sessionLabel,
        hasAddress: true,
        address: walletConnectSession.address,
        network: sessionNetwork,
        provider: walletConnectSession.provider || 'stacks-connect'
      };
    }

    var resolved = await resolveConnectedWallet({ targetNetwork: targetNetwork });
    var providers = resolved.providers;
    if(!providers || providers.length === 0){
      return {
        state: 'is-missing',
        label: 'Wallet: not detected',
        hasAddress: false,
        address: null,
        network: null,
        provider: null
      };
    }

    if(!resolved.address){
      var providerName = resolved.providerEntry && resolved.providerEntry.name
        ? resolved.providerEntry.name
        : 'wallet provider';
      var warningLabel = 'Wallet: ' + providerName + ' detected · not connected';
      if(isLikelyIpv6LocalOrigin()){
        warningLabel += ' · use localhost URL';
      }
      return {
        state: 'is-warning',
        label: warningLabel,
        hasAddress: false,
        address: null,
        network: null,
        provider: providerName
      };
    }

    setWalletConnectSession(
      resolved.address,
      resolved.network || inferNetworkFromAddress(resolved.address) || targetNetwork || null,
      resolved.providerEntry ? resolved.providerEntry.label : null,
      'provider-resolve'
    );

    if(walletDisconnectOverride){
      var disconnectedProviderName = resolved.providerEntry && resolved.providerEntry.name
        ? resolved.providerEntry.name
        : 'wallet provider';
      return {
        state: 'is-warning',
        label: 'Wallet: disconnected on page · click to reconnect',
        hasAddress: false,
        address: null,
        network: null,
        provider: disconnectedProviderName
      };
    }

    var resolvedNetwork = resolved.network || inferNetworkFromAddress(resolved.address) || targetNetwork || 'unknown';
    var connectedLabel = 'Wallet: ' + shortAddress(resolved.address) + ' · ' + resolvedNetwork;
    var warning = isTargetNetworkMismatch(targetNetwork, resolved.network, resolved.address);
    walletDebugChanged('info', 'getWalletStatus computed', {
      targetNetwork: targetNetwork,
      resolvedAddress: resolved.address || null,
      resolvedNetwork: resolvedNetwork,
      warning: warning
    }, 'wallet-status-computed');

    return {
      state: warning ? 'is-warning' : 'is-connected',
      label: warning ? connectedLabel + ' (target ' + targetNetwork + ')' : connectedLabel,
      hasAddress: true,
      address: resolved.address,
      network: resolvedNetwork,
      provider: resolved.providerEntry ? resolved.providerEntry.label : null
    };
  }

  function refreshWalletStatus(){
    if(!walletStatusBadge) return Promise.resolve();
    if(walletStatusRefreshInFlight) return walletStatusRefreshInFlight;

    var previousStatus = lastWalletStatus;
    walletStatusRefreshInFlight = getWalletStatus()
      .then(function(status){
        lastWalletStatus = status;
        syncOnChainReadSenderAddress(status && status.address ? status.address : '');
        setWalletBadge(status.state, status.label);
        updateWalletDisconnectButtonState();
        var previousKey = walletStatusKey(previousStatus);
        var nextKey = walletStatusKey(status);
        walletDebugChangeState['wallet-status-error'] = '__none__';
        if(previousKey !== nextKey){
          walletDebug('info', 'Wallet status refreshed', {
            changed: true,
            previous: previousStatus ? {
              state: previousStatus.state || null,
              address: previousStatus.address || null,
              network: previousStatus.network || null,
              provider: previousStatus.provider || null
            } : null,
            next: status
          });
        }
      })
      .catch(function(error){
        lastWalletStatus = { state: 'is-warning', label: 'Wallet: status unavailable', hasAddress: false };
        setWalletBadge('is-warning', 'Wallet: status unavailable');
        updateWalletDisconnectButtonState();
        var errorKey = String(error && error.code ? error.code : '') + '|' + String(error && error.message ? error.message : String(error));
        if(walletDebugChangeState['wallet-status-error'] !== errorKey){
          walletDebugChangeState['wallet-status-error'] = errorKey;
          walletDebug('warn', 'Wallet status refresh failed', walletErrorForLog(error));
        }
      })
      .finally(function(){
        walletStatusRefreshInFlight = null;
      });

    return walletStatusRefreshInFlight;
  }

  async function connectWalletInternal(){
    var targetNetwork = resolveTargetNetwork();
    var lastConnectError = null;
    var providers = collectProviders();
    var requireInteractiveReconnect = !!walletDisconnectOverride;
    var interactiveReconnectCompleted = false;
    walletDebug('info', 'connectWalletInternal start', {
      targetNetwork: targetNetwork,
      build: WALLET_DEBUG_BUILD,
      providerCount: providers.length,
      requireInteractiveReconnect: requireInteractiveReconnect
    });
    walletConnectDebug('info', 'start', {
      targetNetwork: targetNetwork,
      providerCount: providers.length,
      requireInteractiveReconnect: requireInteractiveReconnect
    });
    try{
      var rpcContract = getContractConfigOrThrow();
      walletRpcLogOnce('connect-context', 'Wallet connect context and RPC resolution inputs', {
        origin: originForRpcLog(),
        targetNetwork: targetNetwork,
        configuredApiBaseUrl: rpcContract.apiBaseUrl || null,
        configuredApiFallbackBaseUrls: rpcContract.apiFallbackBaseUrls || [],
        resolvedReadOnlyApiBases: resolveReadOnlyApiBases(rpcContract)
      });
    }catch(rpcConfigError){
      walletRpcLogOnce('connect-context-missing-config', 'Wallet connect context without contract RPC config', {
        origin: originForRpcLog(),
        targetNetwork: targetNetwork,
        error: walletErrorForLog(rpcConfigError)
      });
    }
    if(
      !walletDisconnectOverride &&
      walletConnectSession &&
      looksLikeStacksAddress(walletConnectSession.address) &&
      !isTargetNetworkMismatch(targetNetwork, walletConnectSession.network, walletConnectSession.address)
    ){
      walletConnectDebug('info', 'short-circuit: existing connect session', {
        address: walletConnectSession.address,
        network: walletConnectSession.network || null,
        provider: walletConnectSession.provider || null
      });
      await refreshWalletStatus();
      return true;
    }
    if(
      !walletDisconnectOverride &&
      lastWalletStatus &&
      lastWalletStatus.hasAddress &&
      !isTargetNetworkMismatch(targetNetwork, lastWalletStatus.network, lastWalletStatus.address)
    ){
      walletDebug('info', 'connectWalletInternal short-circuit: already connected', {
        address: lastWalletStatus.address || null,
        network: lastWalletStatus.network || null
      });
      await refreshWalletStatus();
      return true;
    }

    if(!providers.length){
      walletDebug('warn', 'connectWalletInternal failed: no providers');
      walletConnectDebug('error', 'outcome: no providers', {
        targetNetwork: targetNetwork
      });
      throw new Error(buildWalletConnectFailureMessage(
        'No Stacks-compatible wallet provider detected in this browser.',
        null
      ));
    }

    setWalletBadge('is-loading', 'Wallet: connecting...');

    var connectMethods = ['stx_requestAccounts', 'requestAccounts', 'stx_connect', 'connect', 'wallet_connect'];
    clearUnsupportedMethodsForProviders(providers, connectMethods);
    var connectProviders = getWalletAddressCandidates(providers);
    var fallbackAuthTried = false;
    walletConnectDebug('info', 'provider candidate list', {
      targetNetwork: targetNetwork,
      providers: connectProviders.map(function(entry){ return entry.label; }),
      methods: connectMethods.slice()
    });

    var primaryAuthEntry = null;
    var pa;
    for(pa = 0; pa < connectProviders.length; pa++){
      if(!isLikelyBitcoinOnlyProvider(connectProviders[pa])){
        primaryAuthEntry = connectProviders[pa];
        break;
      }
    }

    if(primaryAuthEntry){
      fallbackAuthTried = true;
      try{
        var primaryAuthResult = await attemptWalletConnectWithStacksConnect(primaryAuthEntry, targetNetwork);
        if(primaryAuthResult && isWalletConnectCancelledStatus(primaryAuthResult.status)){
          walletConnectDebug('warn', 'outcome: user cancelled primary auth', {
            provider: primaryAuthEntry.label
          });
          throw new Error('Wallet connection was cancelled in the wallet prompt.');
        }

        var sessionCaptured = setWalletConnectSessionFromAuthPayload(
          primaryAuthResult ? primaryAuthResult.payload : null,
          targetNetwork,
          primaryAuthEntry.label
        );

        await refreshWalletStatus();
        var primaryResolved = await resolveConnectedWallet({ targetNetwork: targetNetwork });
        if(sessionCaptured || (primaryResolved.address && !isTargetNetworkMismatch(targetNetwork, primaryResolved.network, primaryResolved.address))){
          setWalletDisconnectOverride(false, {
            source: 'connectWalletInternal',
            provider: primaryAuthEntry.label,
            mode: 'stacksConnectAuthPrimary'
          });
          if(primaryResolved.address){
            setWalletConnectSession(
              primaryResolved.address,
              primaryResolved.network || inferNetworkFromAddress(primaryResolved.address) || targetNetwork || null,
              primaryResolved.providerEntry ? primaryResolved.providerEntry.label : primaryAuthEntry.label,
              'stacks-connect-auth-primary-resolve'
            );
          }
          await refreshWalletStatus();
          walletConnectDebug('info', 'outcome: connected via primary auth', {
            provider: primaryAuthEntry.label,
            address: primaryResolved.address || (walletConnectSession ? walletConnectSession.address : null),
            network: primaryResolved.network || (walletConnectSession ? walletConnectSession.network : null)
          });
          return true;
        }
        walletConnectDebug('warn', 'non-event: primary auth finished without connected address', {
          provider: primaryAuthEntry.label,
          status: primaryAuthResult ? primaryAuthResult.status : null
        });
      }catch(primaryAuthError){
        lastConnectError = primaryAuthError;
        walletConnectDebug('warn', 'primary auth failed', {
          provider: primaryAuthEntry.label,
          errorKind: walletConnectErrorKind(primaryAuthError),
          error: walletErrorForLog(primaryAuthError)
        });
        if(isUserRejectedError(primaryAuthError)){
          throw new Error('Wallet connection was cancelled in the wallet prompt.');
        }
      }
    } else {
      walletConnectDebug('warn', 'non-event: no non-bitcoin provider available for primary auth', {
        providers: connectProviders.map(function(entry){ return entry.label; })
      });
    }

    var i;
    var m;

    for(i = 0; i < connectProviders.length; i++){
      var entry = connectProviders[i];
      var provider = entry.provider;
      walletDebug('info', 'Trying provider candidate for connect', {
        provider: entry.label,
        index: i,
        total: connectProviders.length
      });
      walletConnectDebug('info', 'provider candidate', {
        provider: entry.label,
        index: i,
        total: connectProviders.length
      });

      for(m = 0; m < connectMethods.length; m++){
        if(shouldSkipConnectMethodForProvider(entry, connectMethods[m])){
          walletDebug('info', 'Skipping connect method for provider', {
            provider: entry.label,
            method: connectMethods[m],
            reason: 'bitcoin-only-provider'
          });
          walletConnectDebug('info', 'non-event: skipped method for provider', {
            provider: entry.label,
            method: connectMethods[m],
            reason: 'bitcoin-only-provider'
          });
          continue;
        }
        if(isKnownUnsupportedMethod(provider, connectMethods[m])){
          walletConnectDebug('info', 'non-event: method already marked unsupported', {
            provider: entry.label,
            method: connectMethods[m]
          });
          continue;
        }
        try{
          walletDebug('info', 'Requesting account access', {
            provider: entry.label,
            method: connectMethods[m]
          });
          walletConnectDebug('info', 'requesting account access', {
            provider: entry.label,
            method: connectMethods[m]
          });
          var payload = await requestProvider(provider, connectMethods[m], undefined, { timeoutMs: 15000 });
          var rpcError = extractRpcError(payload);
          if(rpcError) throw rpcError;
          var requestedAddress = extractAddress(payload, targetNetwork);
          if(!requestedAddress){
            requestedAddress = await resolveProviderAddress(provider, targetNetwork);
            if(!requestedAddress){
              walletConnectDebug('warn', 'non-event: method completed but no address resolved', {
                provider: entry.label,
                method: connectMethods[m],
                payloadType: payload && typeof payload
              });
            }
          }
          if(requestedAddress){
            setWalletConnectSession(
              requestedAddress,
              inferNetworkFromAddress(requestedAddress) || targetNetwork || null,
              entry.label,
              'provider-request-method'
            );
            walletDebug('info', 'Account access returned address', {
              provider: entry.label,
              method: connectMethods[m],
              requestedAddress: requestedAddress
            });
            walletConnectDebug('info', 'address resolved', {
              provider: entry.label,
              method: connectMethods[m],
              address: requestedAddress
            });
            await refreshWalletStatus();
            var postConnect = await resolveConnectedWallet({ targetNetwork: targetNetwork });
            if(postConnect.address && !isTargetNetworkMismatch(targetNetwork, postConnect.network, postConnect.address)){
              interactiveReconnectCompleted = true;
              setWalletDisconnectOverride(false, {
                source: 'connectWalletInternal',
                provider: entry.label,
                mode: 'requestAccounts'
              });
              await refreshWalletStatus();
              walletDebug('info', 'connectWalletInternal succeeded after requestAccounts', {
                provider: entry.label,
                address: postConnect.address,
                network: postConnect.network || null
              });
              walletConnectDebug('info', 'outcome: connected via account request', {
                provider: entry.label,
                address: postConnect.address,
                network: postConnect.network || null
              });
              return true;
            }
            walletConnectDebug('warn', 'non-event: address resolved but post-connect validation failed', {
              provider: entry.label,
              method: connectMethods[m],
              targetNetwork: targetNetwork,
              postConnect: postConnect
            });
          }
        }catch(error){
          lastConnectError = error;
          if(shouldCacheUnsupportedMethod(false, error)){
            markMethodUnsupported(provider, connectMethods[m]);
          }
          walletDebug('warn', 'Account access request failed', {
            provider: entry.label,
            method: connectMethods[m],
            error: walletErrorForLog(error)
          });
          walletConnectDebug('warn', 'account access failed', {
            provider: entry.label,
            method: connectMethods[m],
            errorKind: walletConnectErrorKind(error),
            error: walletErrorForLog(error)
          });
          if(isUserRejectedError(error)){
            walletConnectDebug('warn', 'outcome: user rejected request', {
              provider: entry.label,
              method: connectMethods[m]
            });
            throw new Error('Wallet connection was cancelled in the wallet prompt.');
          }
          if(isUnsupportedProviderError(error) || isInvalidParamsError(error)){
            continue;
          }
        }
      }

      if(!fallbackAuthTried && !requireInteractiveReconnect && !isLikelyBitcoinOnlyProvider(entry)){
        fallbackAuthTried = true;
        try{
          var fallbackAuthResult = await attemptWalletConnectWithStacksConnect(entry, targetNetwork);
          if(fallbackAuthResult && isWalletConnectCancelledStatus(fallbackAuthResult.status)){
            walletConnectDebug('warn', 'outcome: user cancelled fallback auth', {
              provider: entry.label
            });
            throw new Error('Wallet connection was cancelled in the wallet prompt.');
          }

          var fallbackSessionCaptured = setWalletConnectSessionFromAuthPayload(
            fallbackAuthResult ? fallbackAuthResult.payload : null,
            targetNetwork,
            entry.label
          );

          await refreshWalletStatus();
          var fallbackResolved = await resolveConnectedWallet({ targetNetwork: targetNetwork });
          if(fallbackSessionCaptured || (fallbackResolved.address && !isTargetNetworkMismatch(targetNetwork, fallbackResolved.network, fallbackResolved.address))){
            setWalletDisconnectOverride(false, {
              source: 'connectWalletInternal',
              provider: entry.label,
              mode: 'stacksConnectAuth'
            });
            if(fallbackResolved.address){
              setWalletConnectSession(
                fallbackResolved.address,
                fallbackResolved.network || inferNetworkFromAddress(fallbackResolved.address) || targetNetwork || null,
                fallbackResolved.providerEntry ? fallbackResolved.providerEntry.label : entry.label,
                'stacks-connect-auth-fallback-resolve'
              );
            }
            await refreshWalletStatus();
            walletConnectDebug('info', 'outcome: connected via fallback auth', {
              provider: entry.label,
              address: fallbackResolved.address || (walletConnectSession ? walletConnectSession.address : null),
              network: fallbackResolved.network || (walletConnectSession ? walletConnectSession.network : null)
            });
            return true;
          }
          walletConnectDebug('warn', 'non-event: fallback auth finished without connected address', {
            provider: entry.label,
            status: fallbackAuthResult ? fallbackAuthResult.status : null
          });
        }catch(fallbackAuthError){
          lastConnectError = fallbackAuthError;
          walletConnectDebug('warn', 'fallback auth failed', {
            provider: entry.label,
            errorKind: walletConnectErrorKind(fallbackAuthError),
            error: walletErrorForLog(fallbackAuthError)
          });
          if(isUserRejectedError(fallbackAuthError)){
            throw new Error('Wallet connection was cancelled in the wallet prompt.');
          }
        }
      }

      if(isLikelyBitcoinOnlyProvider(entry)){
        walletDebug('info', 'Skipping direct provider connect for provider', {
          provider: entry.label,
          reason: 'bitcoin-only-provider'
        });
        walletConnectDebug('info', 'non-event: skipped direct connect for provider', {
          provider: entry.label,
          reason: 'bitcoin-only-provider'
        });
      } else if(requireInteractiveReconnect){
        walletDebug('info', 'Skipping direct provider connect while interactive reconnect is required', {
          provider: entry.label
        });
        walletConnectDebug('info', 'non-event: skipped direct connect while interactive reconnect required', {
          provider: entry.label
        });
      } else {
        try{
          await maybeCallDirectProviderConnect(provider);
          var directAddress = await resolveProviderAddress(provider, targetNetwork);
          if(directAddress){
            walletDebug('info', 'Direct provider connect resolved address', {
              provider: entry.label,
              address: directAddress
            });
            await refreshWalletStatus();
            var directResolved = await resolveConnectedWallet({ targetNetwork: targetNetwork });
            if(directResolved.address && !isTargetNetworkMismatch(targetNetwork, directResolved.network, directResolved.address)){
              setWalletDisconnectOverride(false, {
                source: 'connectWalletInternal',
                provider: entry.label,
                mode: 'directConnect'
              });
              setWalletConnectSession(
                directResolved.address,
                directResolved.network || inferNetworkFromAddress(directResolved.address) || targetNetwork || null,
                directResolved.providerEntry ? directResolved.providerEntry.label : entry.label,
                'direct-provider-connect'
              );
              await refreshWalletStatus();
              walletDebug('info', 'connectWalletInternal succeeded after direct provider connect', {
                provider: entry.label,
                address: directResolved.address,
                network: directResolved.network || null
              });
              walletConnectDebug('info', 'outcome: connected via direct provider connect', {
                provider: entry.label,
                address: directResolved.address,
                network: directResolved.network || null
              });
              return true;
            }
          }
        }catch(eDirect){
          lastConnectError = eDirect;
          walletConnectDebug('warn', 'direct connect failed', {
            provider: entry.label,
            errorKind: walletConnectErrorKind(eDirect),
            error: walletErrorForLog(eDirect)
          });
        }
      }

      if(requireInteractiveReconnect){
        walletDebug('info', 'Skipping passive provider resolve while interactive reconnect is required', {
          provider: entry.label
        });
        walletConnectDebug('info', 'non-event: skipped passive resolve while interactive reconnect required', {
          provider: entry.label
        });
      } else {
        try{
          var passiveAddress = await resolveProviderAddress(provider, targetNetwork);
          if(passiveAddress){
            walletDebug('info', 'Passive provider address resolved', {
              provider: entry.label,
              address: passiveAddress
            });
            await refreshWalletStatus();
            var passiveResolved = await resolveConnectedWallet({ targetNetwork: targetNetwork });
            if(passiveResolved.address && !isTargetNetworkMismatch(targetNetwork, passiveResolved.network, passiveResolved.address)){
              setWalletDisconnectOverride(false, {
                source: 'connectWalletInternal',
                provider: entry.label,
                mode: 'passiveResolve'
              });
              setWalletConnectSession(
                passiveResolved.address,
                passiveResolved.network || inferNetworkFromAddress(passiveResolved.address) || targetNetwork || null,
                passiveResolved.providerEntry ? passiveResolved.providerEntry.label : entry.label,
                'passive-provider-resolve'
              );
              await refreshWalletStatus();
              walletDebug('info', 'connectWalletInternal succeeded after passive resolve', {
                provider: entry.label,
                address: passiveResolved.address,
                network: passiveResolved.network || null
              });
              walletConnectDebug('info', 'outcome: connected via passive resolve', {
                provider: entry.label,
                address: passiveResolved.address,
                network: passiveResolved.network || null
              });
              return true;
            }
          }
        }catch(e){
          lastConnectError = e;
          walletDebug('warn', 'Passive provider address resolution failed', {
            provider: entry.label,
            error: walletErrorForLog(e)
          });
          walletConnectDebug('warn', 'passive resolve failed', {
            provider: entry.label,
            errorKind: walletConnectErrorKind(e),
            error: walletErrorForLog(e)
          });
        }
      }
    }

    var finalResolved = await resolveConnectedWallet({ targetNetwork: targetNetwork });
    await refreshWalletStatus();
    if(finalResolved.address && !isTargetNetworkMismatch(targetNetwork, finalResolved.network, finalResolved.address)){
      if(requireInteractiveReconnect && !interactiveReconnectCompleted){
        walletDebug('warn', 'connectWalletInternal blocked passive reconnect while local override is active', {
          address: finalResolved.address,
          network: finalResolved.network || null
        });
        walletConnectDebug('warn', 'outcome: blocked by local reconnect override', {
          address: finalResolved.address,
          network: finalResolved.network || null
        });
        throw new Error(
          'Reconnect requires wallet account selection. ' +
          'Use Connect and approve account selection in the wallet popup, then retry.'
        );
      }
      setWalletDisconnectOverride(false, {
        source: 'connectWalletInternal',
        mode: 'finalCheck'
      });
      setWalletConnectSession(
        finalResolved.address,
        finalResolved.network || inferNetworkFromAddress(finalResolved.address) || targetNetwork || null,
        finalResolved.providerEntry ? finalResolved.providerEntry.label : null,
        'final-check'
      );
      await refreshWalletStatus();
      walletDebug('info', 'connectWalletInternal succeeded at final check', {
        address: finalResolved.address,
        network: finalResolved.network || null
      });
      walletConnectDebug('info', 'outcome: connected at final check', {
        address: finalResolved.address,
        network: finalResolved.network || null
      });
      return true;
    }
    if(finalResolved.address && isTargetNetworkMismatch(targetNetwork, finalResolved.network, finalResolved.address)){
      var actual = finalResolved.network || inferNetworkFromAddress(finalResolved.address) || 'unknown';
      walletDebug('warn', 'connectWalletInternal failed due to network mismatch', {
        targetNetwork: targetNetwork,
        actualNetwork: actual,
        address: finalResolved.address
      });
      walletConnectDebug('warn', 'outcome: network mismatch', {
        targetNetwork: targetNetwork,
        actualNetwork: actual,
        address: finalResolved.address
      });
      throw new Error(
        'Wallet connected on ' + actual + ', but arcade is configured for ' + targetNetwork + '. Switch wallet network and retry.'
      );
    }

    walletDebug('error', 'connectWalletInternal failed: no connected account resolved', {
      targetNetwork: targetNetwork,
      lastWalletStatus: lastWalletStatus,
      lastConnectError: walletErrorForLog(lastConnectError)
    });
    walletConnectDebug('error', 'outcome: no connected account resolved', {
      targetNetwork: targetNetwork,
      lastWalletStatus: lastWalletStatus,
      lastConnectErrorKind: walletConnectErrorKind(lastConnectError),
      lastConnectError: walletErrorForLog(lastConnectError)
    });
    throw new Error(buildWalletConnectFailureMessage(
      'Wallet did not return a connected account.',
      lastConnectError
    ));
  }

  function connectWallet(){
    if(connectWalletInFlight){
      walletDebug('info', 'connectWallet deduped: existing in-flight promise');
      walletConnectDebug('info', 'non-event: connect deduped (already in flight)');
      return connectWalletInFlight;
    }
    if(disconnectWalletInFlight){
      walletConnectDebug('warn', 'non-event: connect blocked by disconnect in flight');
      return Promise.reject(new Error('Wallet disconnect is in progress. Please retry in a moment.'));
    }

    walletDebug('info', 'connectWallet invoked');
    walletConnectDebug('info', 'connect invoked');
    connectWalletInFlight = (async function(){
      try{
        var result = await connectWalletInternal();
        walletDebug('info', 'connectWallet resolved', { result: !!result });
        walletConnectDebug('info', 'outcome: connect resolved', { result: !!result });
        return result;
      }catch(error){
        walletDebug('error', 'connectWallet rejected', walletErrorForLog(error));
        walletConnectDebug('error', 'outcome: connect rejected', {
          errorKind: walletConnectErrorKind(error),
          error: walletErrorForLog(error)
        });
        throw error;
      }finally{
        connectWalletInFlight = null;
        updateWalletDisconnectButtonState();
      }
    })();
    updateWalletDisconnectButtonState();

    return connectWalletInFlight;
  }

  async function disconnectWalletInternal(){
    var targetNetwork = resolveTargetNetwork();
    var lastDisconnectError = null;
    var disconnectSucceeded = false;
    var attemptedAnyMethod = false;
    walletDebug('info', 'disconnectWalletInternal start', {
      targetNetwork: targetNetwork,
      build: WALLET_DEBUG_BUILD
    });

    setWalletBadge('is-loading', 'Wallet: disconnecting...');
    var initial = await resolveConnectedWallet({ targetNetwork: targetNetwork });
    var disconnectProviders = getWalletAddressCandidates(initial.providers || []);
    if(disconnectProviders.length === 0){
      walletDebug('warn', 'disconnectWalletInternal found no providers');
      await refreshWalletStatus();
      return false;
    }

    var disconnectMethods = ['stx_disconnect', 'wallet_disconnect', 'disconnect', 'deactivate'];
    var i;
    var m;
    for(i = 0; i < disconnectProviders.length; i++){
      var entry = disconnectProviders[i];
      var provider = entry.provider;
      if(isLikelyBitcoinOnlyProvider(entry)){
        walletDebug('info', 'Skipping disconnect methods for provider', {
          provider: entry.label,
          reason: 'bitcoin-only-provider'
        });
        continue;
      }
      for(m = 0; m < disconnectMethods.length; m++){
        if(isKnownUnsupportedMethod(provider, disconnectMethods[m])) continue;
        attemptedAnyMethod = true;
        try{
          walletDebug('info', 'Provider disconnect attempt', {
            provider: entry.label,
            method: disconnectMethods[m],
            providerIndex: i
          });
          var payload = await requestProvider(provider, disconnectMethods[m], undefined, { timeoutMs: 7000 });
          var rpcError = extractRpcError(payload);
          if(rpcError) throw rpcError;
          disconnectSucceeded = true;
          walletDebug('info', 'Provider disconnect attempt succeeded', {
            provider: entry.label,
            method: disconnectMethods[m]
          });
        }catch(error){
          lastDisconnectError = error;
          if(shouldCacheUnsupportedMethod(false, error)){
            markMethodUnsupported(provider, disconnectMethods[m]);
          }
          walletDebug('warn', 'Provider disconnect attempt failed', {
            provider: entry.label,
            method: disconnectMethods[m],
            error: walletErrorForLog(error)
          });
          if(isUserRejectedError(error)){
            throw new Error('Wallet disconnect was cancelled in the wallet prompt.');
          }
          if(isUnsupportedProviderError(error) || isInvalidParamsError(error)){
            continue;
          }
        }
      }
    }

    await refreshWalletStatus();
    var finalResolved = await resolveConnectedWallet({ targetNetwork: targetNetwork });
    if(!finalResolved.address){
      setWalletDisconnectOverride(false, {
        source: 'disconnectWalletInternal',
        mode: 'providerCleared'
      });
      clearWalletConnectSession('disconnect-provider-cleared');
      walletDebug('info', 'disconnectWalletInternal completed', {
        disconnected: true,
        attemptedAnyMethod: attemptedAnyMethod,
        disconnectSucceeded: disconnectSucceeded
      });
      return true;
    }

    walletDebug('warn', 'disconnectWalletInternal provider did not clear account', {
      attemptedAnyMethod: attemptedAnyMethod,
      disconnectSucceeded: disconnectSucceeded,
      address: finalResolved.address,
      network: finalResolved.network || inferNetworkFromAddress(finalResolved.address) || null,
      lastDisconnectError: walletErrorForLog(lastDisconnectError)
    });

    setWalletDisconnectOverride(true, {
      source: 'disconnectWalletInternal',
      mode: 'localOverride',
      attemptedAnyMethod: attemptedAnyMethod,
      disconnectSucceeded: disconnectSucceeded,
      address: finalResolved.address
    });
    clearWalletConnectSession('disconnect-local-override');
    syncOnChainReadSenderAddress('');
    await refreshWalletStatus();
    return true;
  }

  function disconnectWallet(){
    if(disconnectWalletInFlight){
      walletDebug('info', 'disconnectWallet deduped: existing in-flight promise');
      return disconnectWalletInFlight;
    }
    if(connectWalletInFlight){
      return Promise.reject(new Error('Wallet connect is in progress. Please retry in a moment.'));
    }

    walletDebug('info', 'disconnectWallet invoked');
    disconnectWalletInFlight = (async function(){
      try{
        var result = await disconnectWalletInternal();
        walletDebug('info', 'disconnectWallet resolved', { result: !!result });
        return result;
      }catch(error){
        walletDebug('error', 'disconnectWallet rejected', walletErrorForLog(error));
        throw error;
      }finally{
        disconnectWalletInFlight = null;
        updateWalletDisconnectButtonState();
      }
    })();
    updateWalletDisconnectButtonState();

    return disconnectWalletInFlight;
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

  function getOnChainConfig(){
    return window.ARCADE_ONCHAIN_CONFIG || {};
  }

  function getContractConfigOrThrow(){
    var config = getOnChainConfig();
    if(!config.contractAddress || !config.contractName){
      throw new Error('Missing on-chain contract config.');
    }
    var fallbackList = [];
    if(Array.isArray(config.apiFallbackBaseUrls)){
      fallbackList = config.apiFallbackBaseUrls;
    } else if(typeof config.apiFallbackBaseUrls === 'string'){
      fallbackList = config.apiFallbackBaseUrls.split(',');
    }
    var normalizedFallbackList = [];
    var i;
    for(i = 0; i < fallbackList.length; i++){
      var base = String(fallbackList[i] == null ? '' : fallbackList[i]).trim();
      if(!base || normalizedFallbackList.indexOf(base) >= 0) continue;
      normalizedFallbackList.push(base);
    }
    return {
      contractAddress: String(config.contractAddress),
      contractName: String(config.contractName),
      network: normalizeNetwork(config.network) || 'mainnet',
      apiBaseUrl: String(config.apiBaseUrl || '').trim(),
      apiFallbackBaseUrls: normalizedFallbackList,
      readSenderAddress: String(config.readSenderAddress || '').trim()
    };
  }

  function defaultApiBase(network){
    if(network === 'testnet') return 'https://api.testnet.hiro.so';
    if(network === 'devnet') return 'http://localhost:3999';
    return 'https://api.mainnet.hiro.so';
  }

  function defaultApiFallbackBases(network){
    if(network === 'testnet') return [];
    if(network === 'devnet') return [];
    return [];
  }

  function resolveReadOnlyApiBases(contract){
    var out = [];

    function push(value){
      var normalized = String(value || '').trim().replace(/\/+$/, '');
      if(!normalized) return;
      if(out.indexOf(normalized) >= 0) return;
      out.push(normalized);
    }

    push(contract.apiBaseUrl);
    push(defaultApiBase(contract.network));
    (contract.apiFallbackBaseUrls || []).forEach(push);
    defaultApiFallbackBases(contract.network).forEach(push);
    return out;
  }

  function encodeUIntCV(value){
    var bigint;
    try{
      bigint = BigInt(value);
    }catch(e){
      throw new Error('Invalid uint value.');
    }
    if(bigint < 0n){
      throw new Error('Uint must be positive.');
    }
    var hex = bigint.toString(16);
    if(hex.length > 32){
      throw new Error('Uint exceeds Clarity width.');
    }
    while(hex.length < 32){
      hex = '0' + hex;
    }
    return '0x01' + hex;
  }

  function encodeBufferCV(hexValue){
    var clean = stripHexPrefix(String(hexValue || '')).toLowerCase();
    if(!clean || clean.length % 2 !== 0 || /[^0-9a-f]/.test(clean)){
      throw new Error('Buffer value must be valid hex.');
    }
    var byteLen = clean.length / 2;
    var lenHex = byteLen.toString(16);
    while(lenHex.length < 8){
      lenHex = '0' + lenHex;
    }
    return '0x02' + lenHex + clean;
  }

  function encodeOptionalBuffer20CV(hexValue){
    var clean = stripHexPrefix(String(hexValue || '')).toLowerCase();
    if(!clean){
      return '0x09';
    }
    if(clean.length !== 40 || /[^0-9a-f]/.test(clean)){
      throw new Error('Verifier hash must be 20-byte hex (40 characters).');
    }
    var inner = stripHexPrefix(encodeBufferCV(clean));
    return '0x0a' + inner;
  }

  function decodeOkUInt(resultHex){
    var clean = stripHexPrefix(String(resultHex || '')).toLowerCase();
    if(clean.length < 36 || clean.substring(0, 4) !== '0701'){
      throw new Error('Unexpected uint read-only result format.');
    }
    return BigInt('0x' + clean.substring(4, 36));
  }

  function decodeOkOptionalBuffer(resultHex){
    var clean = stripHexPrefix(String(resultHex || '')).toLowerCase();
    if(clean.length < 4 || clean.substring(0, 2) !== '07'){
      throw new Error('Unexpected optional read-only result format.');
    }

    var body = clean.substring(2);
    if(body.substring(0, 2) === '09'){
      return null;
    }

    if(body.substring(0, 4) !== '0a02'){
      throw new Error('Unexpected optional buffer result format.');
    }

    var lenHex = body.substring(4, 12);
    if(lenHex.length !== 8){
      throw new Error('Unexpected optional buffer length format.');
    }
    var len = parseInt(lenHex, 16);
    var dataHex = body.substring(12);
    if(dataHex.length < len * 2){
      throw new Error('Optional buffer payload is truncated.');
    }
    return dataHex.substring(0, len * 2);
  }

  function toStxString(microstx){
    var value = BigInt(microstx);
    var whole = value / 1000000n;
    var frac = value % 1000000n;
    if(frac === 0n) return whole.toString();
    var fracText = frac.toString();
    while(fracText.length < 6){
      fracText = '0' + fracText;
    }
    fracText = fracText.replace(/0+$/, '');
    return whole.toString() + '.' + fracText;
  }

  function parseStxToMicro(input){
    var text = String(input || '').trim();
    if(!text){
      throw new Error('Fee is required.');
    }
    if(!/^\d+(\.\d{1,6})?$/.test(text)){
      throw new Error('Fee must be a decimal STX amount with up to 6 decimals.');
    }

    var parts = text.split('.');
    var whole = parts[0] || '0';
    var frac = parts[1] || '';
    while(frac.length < 6){
      frac += '0';
    }

    return (BigInt(whole) * 1000000n) + BigInt(frac || '0');
  }

  async function callReadOnlyFunction(functionName, args){
    var contract = getContractConfigOrThrow();
    var sender = contract.readSenderAddress || contract.contractAddress;
    var apiBases = resolveReadOnlyApiBases(contract);
    var lastError = null;
    var i;

    if(apiBases.length === 0){
      throw new Error('No API base URL configured for read-only calls.');
    }
    walletRpcLogOnce('readonly-plan', 'Read-only endpoint candidate plan resolved', {
      origin: originForRpcLog(),
      network: contract.network,
      contract: contract.contractAddress + '.' + contract.contractName,
      sender: sender,
      apiBases: apiBases
    });

    for(i = 0; i < apiBases.length; i++){
      var endpoint = apiBases[i] +
        '/v2/contracts/call-read/' +
        contract.contractAddress + '/' +
        contract.contractName + '/' +
        functionName;
      try{
        var response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: sender,
            arguments: Array.isArray(args) ? args : []
          })
        });

        if(!response.ok){
          throw new Error('Read-only call failed with HTTP ' + response.status + '.');
        }

        var body = await response.json();
        if(!body || body.okay !== true || typeof body.result !== 'string'){
          var cause = body && body.cause ? String(body.cause) : 'Read-only contract call failed.';
          throw new Error(cause);
        }

        if(i > 0){
          walletDebug('warn', 'Read-only call succeeded via fallback endpoint', {
            functionName: functionName,
            endpoint: apiBases[i]
          });
        }
        walletRpcLogOnce('readonly-selected', 'Read-only endpoint selected for successful response', {
          origin: originForRpcLog(),
          functionName: functionName,
          selectedApiBase: apiBases[i],
          selectedEndpoint: endpoint,
          usedFallback: i > 0
        });
        return body.result;
      }catch(error){
        lastError = error;
        if(i + 1 < apiBases.length){
          walletDebug('warn', 'Read-only call endpoint failed, trying fallback', {
            functionName: functionName,
            endpoint: apiBases[i],
            nextEndpoint: apiBases[i + 1],
            error: walletErrorForLog(error)
          });
        }
      }
    }

    walletRpcLogOnce('readonly-failed', 'All read-only endpoints failed during resolution', {
      origin: originForRpcLog(),
      functionName: functionName,
      apiBases: apiBases,
      error: walletErrorForLog(lastError)
    });

    throw lastError || new Error('Read-only contract call failed.');
  }

  function extractRpcError(result){
    if(!result || typeof result !== 'object' || !result.error){
      return null;
    }
    var details = result.error;
    var message = details && details.message ? String(details.message) : 'Wallet RPC request failed.';
    var err = new Error(message);
    err.code = details && typeof details.code !== 'undefined' ? details.code : null;
    err.data = details && typeof details.data !== 'undefined' ? details.data : null;
    return err;
  }

  function buildContractCallParamVariants(params){
    var fullContract = params.contractAddress + '.' + params.contractName;
    return [
      {
        label: 'legacy-split',
        params: {
          contractAddress: params.contractAddress,
          contractName: params.contractName,
          functionName: params.functionName,
          functionArgs: params.functionArgs,
          network: params.network,
          postConditionMode: 1
        }
      },
      {
        label: 'sats-minimal',
        params: {
          contract: fullContract,
          functionName: params.functionName,
          functionArgs: params.functionArgs,
          network: params.network
        }
      }
    ];
  }

  function orderContractCallVariants(providerLabel, variants){
    var label = String(providerLabel || '').toLowerCase();
    var preferMinimal =
      label.indexOf('bitcoinprovider') >= 0 ||
      label.indexOf('xverse') >= 0 ||
      label.indexOf('btc') >= 0;

    return variants.slice().sort(function(a, b){
      var scoreA = a.label === 'sats-minimal' ? (preferMinimal ? 2 : 1) : (preferMinimal ? 1 : 2);
      var scoreB = b.label === 'sats-minimal' ? (preferMinimal ? 2 : 1) : (preferMinimal ? 1 : 2);
      return scoreB - scoreA;
    });
  }

  function extractTxId(result){
    if(!result || typeof result !== 'object') return null;
    return (
      result.txId ||
      result.txid ||
      result.tx_id ||
      (result.result && (result.result.txId || result.result.txid || result.result.tx_id)) ||
      null
    );
  }

  async function requestWalletContractCall(entry, params){
    var provider = entry.provider;
    var methods = ['stx_callContract', 'stx_callContractV2'];
    var variants = orderContractCallVariants(entry.label, buildContractCallParamVariants(params));
    var lastError = null;

    var v;
    var m;
    for(v = 0; v < variants.length; v++){
      for(m = 0; m < methods.length; m++){
        try{
          var result = await requestProvider(provider, methods[m], variants[v].params);
          var rpcError = extractRpcError(result);
          if(rpcError){
            throw rpcError;
          }
          return result;
        }catch(error){
          lastError = error;
          if(isUnsupportedProviderError(error) || isInvalidParamsError(error)){
            continue;
          }
          throw error;
        }
      }
    }

    throw lastError || new Error('Wallet provider rejected contract-call request.');
  }

  async function submitAdminContractCall(functionName, functionArgs){
    var contract = getContractConfigOrThrow();
    var providers = collectProviders();
    if(!providers.length){
      throw new Error('No compatible Stacks wallet provider was detected.');
    }

    var params = {
      contractAddress: contract.contractAddress,
      contractName: contract.contractName,
      functionName: functionName,
      functionArgs: functionArgs,
      network: contract.network
    };

    var i;
    var lastError = null;
    for(i = 0; i < providers.length; i++){
      try{
        var result = await requestWalletContractCall(providers[i], params);
        return {
          txId: extractTxId(result),
          raw: result
        };
      }catch(error){
        lastError = error;
        if(isUserRejectedError(error)){
          throw new Error('Wallet transaction was cancelled.');
        }
        if(isUnsupportedProviderError(error) || isInvalidParamsError(error)){
          continue;
        }
      }
    }

    throw lastError || new Error('No wallet provider accepted this admin transaction.');
  }

  async function refreshAdminState(){
    if(!adminOverlay) return;

    try{
      var contract = getContractConfigOrThrow();
      if(adminContractId){
        adminContractId.textContent = contract.contractAddress + '.' + contract.contractName;
      }
    }catch(error){
      setAdminStatus(error && error.message ? error.message : String(error), 'is-error');
      return;
    }

    setAdminBusy(true);
    setAdminStatus('Loading on-chain admin state...', 'is-loading');

    try{
      var readResults = await Promise.all([
        callReadOnlyFunction('get-fee-unit', []),
        callReadOnlyFunction('get-verifier-pubkey-hash', [])
      ]);

      var feeUnit = decodeOkUInt(readResults[0]);
      var verifierHash = decodeOkOptionalBuffer(readResults[1]);

      if(adminFeeCurrent){
        adminFeeCurrent.textContent = feeUnit.toString() + ' microSTX (' + toStxString(feeUnit) + ' STX)';
      }
      if(adminFeeInput){
        adminFeeInput.value = toStxString(feeUnit);
      }
      if(adminVerifierCurrent){
        adminVerifierCurrent.textContent = verifierHash ? verifierHash : '(none)';
      }
      if(adminVerifierInput){
        adminVerifierInput.value = verifierHash ? verifierHash : '';
      }

      setAdminStatus('Admin state loaded.', 'is-ok');
    }catch(error){
      setAdminStatus('Admin state load failed: ' + (error && error.message ? error.message : String(error)), 'is-error');
    }finally{
      setAdminBusy(false);
    }
  }

  async function applyFeeUnit(){
    if(!adminFeeInput) return;

    var feeMicro;
    try{
      feeMicro = parseStxToMicro(adminFeeInput.value);
    }catch(error){
      setAdminStatus(error && error.message ? error.message : String(error), 'is-error');
      return;
    }

    if(feeMicro < 100n || feeMicro > 1000000n){
      setAdminStatus('Fee must be between 0.0001 STX and 1 STX.', 'is-error');
      return;
    }

    setAdminBusy(true);
    setAdminStatus('Waiting for wallet confirmation to set fee...', 'is-loading');

    try{
      await connectWallet();
      var result = await submitAdminContractCall('set-fee-unit', [encodeUIntCV(feeMicro)]);
      var txSummary = result && result.txId ? ' · tx ' + String(result.txId).slice(0, 16) + '...' : '.';
      setAdminStatus(
        'Fee update submitted' + txSummary,
        'is-ok'
      );
      await refreshWalletStatus();
      await refreshAdminState();
      setAdminStatus('Fee update submitted' + txSummary, 'is-ok');
    }catch(error){
      setAdminStatus('Fee update failed: ' + (error && error.message ? error.message : String(error)), 'is-error');
    }finally{
      setAdminBusy(false);
    }
  }

  async function applyVerifierHash(clearOnly){
    var arg;
    if(clearOnly){
      arg = '0x09';
    } else {
      var input = adminVerifierInput ? adminVerifierInput.value : '';
      try{
        arg = encodeOptionalBuffer20CV(input);
      }catch(error){
        setAdminStatus(error && error.message ? error.message : String(error), 'is-error');
        return;
      }
    }

    setAdminBusy(true);
    setAdminStatus('Waiting for wallet confirmation to set verifier hash...', 'is-loading');

    try{
      await connectWallet();
      var result = await submitAdminContractCall('set-verifier-pubkey-hash', [arg]);
      var txSummary = result && result.txId ? ' · tx ' + String(result.txId).slice(0, 16) + '...' : '.';
      setAdminStatus(
        'Verifier hash update submitted' + txSummary,
        'is-ok'
      );
      await refreshWalletStatus();
      await refreshAdminState();
      setAdminStatus('Verifier hash update submitted' + txSummary, 'is-ok');
    }catch(error){
      setAdminStatus('Verifier hash update failed: ' + (error && error.message ? error.message : String(error)), 'is-error');
    }finally{
      setAdminBusy(false);
    }
  }

  function openAdminOverlay(){
    if(!adminOverlay) return;
    adminOverlay.style.display = 'flex';
    void refreshAdminState();
  }

  function closeAdminOverlay(){
    if(!adminOverlay) return;
    adminOverlay.style.display = 'none';
  }

  function initAdminUi(){
    if(adminBtn){
      adminBtn.onclick = function(){
        openAdminOverlay();
      };
    }

    if(adminClose){
      adminClose.onclick = function(){
        closeAdminOverlay();
      };
    }

    if(adminOverlay){
      adminOverlay.onclick = function(event){
        if(event.target === adminOverlay){
          closeAdminOverlay();
        }
      };
    }

    if(adminRefresh){
      adminRefresh.onclick = function(){
        if(!adminBusy){
          void refreshAdminState();
        }
      };
    }

    if(adminFeeApply){
      adminFeeApply.onclick = function(){
        if(!adminBusy){
          void applyFeeUnit();
        }
      };
    }

    if(adminVerifierApply){
      adminVerifierApply.onclick = function(){
        if(!adminBusy){
          void applyVerifierHash(false);
        }
      };
    }

    if(adminVerifierClear){
      adminVerifierClear.onclick = function(){
        if(!adminBusy){
          void applyVerifierHash(true);
        }
      };
    }
  }

  /* Sound toggle */
  soundToggle.onclick = function(){
    ArcadeUtils.initAudio();
    var on = !ArcadeUtils.isSoundEnabled();
    ArcadeUtils.setSoundEnabled(on);
    soundToggle.textContent = on ? '🔊' : '🔇';
  };

  if(forceNextWaveBtn){
    forceNextWaveBtn.onclick = function(){
      forceNextWave();
    };
  }

  function escapeHtml(value){
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitizeAscii(value, maxLen, fallback){
    var text = String(value == null ? '' : value);
    var out = '';
    var i;
    for(i = 0; i < text.length; i++){
      var code = text.charCodeAt(i);
      if(code >= 32 && code <= 126){
        out += text[i];
        if(maxLen && out.length >= maxLen) break;
      }
    }
    if(!out && typeof fallback === 'string'){
      return fallback;
    }
    return out;
  }

  function buildStartLeaderboardRows(mode, list){
    var rows = '';
    var isTime = mode === 'time';
    var i;
    for(i = 0; i < 10; i++){
      var entry = list && list[i] ? list[i] : null;
      var name = entry ? sanitizeAscii(entry.name, 12, '---') : '---';
      var scoreText = '--';
      if(entry && isFinite(Number(entry.score))){
        var scoreNum = Math.floor(Number(entry.score));
        scoreText = isTime ? ArcadeUtils.formatTime(scoreNum) : ArcadeUtils.formatScore(scoreNum);
      }
      rows += '<tr>' +
        '<td class="rank">' + (i + 1) + '</td>' +
        '<td class="name">' + escapeHtml(name) + '</td>' +
        '<td class="score-col">' + escapeHtml(scoreText) + '</td>' +
      '</tr>';
    }
    return rows;
  }

  function buildStartTipsMarkup(game, mode){
    var tips = [];
    var rows = '';
    var i;

    if(mode === 'time'){
      tips.push('Lower time ranks higher. Clean movement beats risky shortcuts.');
    } else {
      tips.push('Higher score ranks higher. Keep your streak alive to climb fast.');
    }

    if(game && game.hasLevels){
      tips.push('Clear each stage quickly to carry momentum into later levels.');
    } else {
      tips.push('Stay alive and keep pressure up to grow your run.');
    }

    tips.push('Press Esc any time to return to this start screen.');

    for(i = 0; i < tips.length; i++){
      rows += '<li>' + escapeHtml(sanitizeAscii(tips[i], 120, '')) + '</li>';
    }
    return rows;
  }

  function setGameStartScreenPhase(phase){
    var card = gameContainer ? gameContainer.querySelector('.game-start-card') : null;
    var state = phase === 'briefing' ? 'briefing' : 'scores';
    startScreenLoopPhase = state;
    if(!card) return;
    card.classList.toggle('is-scores', state === 'scores');
    card.classList.toggle('is-briefing', state === 'briefing');
  }

  function setGameStartScreenManualPhase(phase){
    var target = phase === 'briefing' ? 'briefing' : 'scores';
    if(startScreenLoopPhase === target){
      return false;
    }
    setGameStartScreenPhase(target);
    startScreenLoopManualOverride = true;
    clearGameStartScreenLoop();
    return true;
  }

  function clearGameStartScreenLoop(){
    if(startScreenLoopTimer){
      clearInterval(startScreenLoopTimer);
      startScreenLoopTimer = null;
    }
  }

  function startGameStartScreenLoop(idx){
    clearGameStartScreenLoop();
    if(startScreenLoopManualOverride){
      return;
    }
    setGameStartScreenPhase('scores');
    startScreenLoopTimer = setInterval(function(){
      if(pendingStartGameIdx !== idx || activeGame){
        clearGameStartScreenLoop();
        return;
      }
      if(startScreenLoopManualOverride){
        clearGameStartScreenLoop();
        return;
      }
      setGameStartScreenPhase(startScreenLoopPhase === 'scores' ? 'briefing' : 'scores');
    }, START_SCREEN_LOOP_MS);
  }

  function renderGameStartScreen(idx, game, top10, statusText){
    if(pendingStartGameIdx !== idx) return;
    if(!game) return;

    var mode = game.scoreMode === 'time' ? 'time' : 'score';
    var best = HighScores.getBest(game.id, mode);
    var bestText = '--';
    if(best != null){
      bestText = mode === 'time' ? ArcadeUtils.formatTime(best) : ArcadeUtils.formatScore(best);
    }
    var scoreHeading = mode === 'time' ? 'Time' : 'Score';
    var modeLabel = mode === 'time' ? 'Time Trial - lower is better' : 'Score Attack - higher is better';
    var title = sanitizeAscii(game.title || 'Game', 60, 'Game');
    var description = sanitizeAscii(game.description || '', 220, 'No mission briefing available.');
    var controls = sanitizeAscii(game.controls || '', 160, 'Use controls shown in-game.');
    var genre = sanitizeAscii(game.genreTag || '', 40, 'Arcade');
    var status = sanitizeAscii(statusText || '', 160, '');

    gameContainer.innerHTML =
      '<div class="game-start-screen">' +
        '<div class="game-start-card is-scores">' +
          '<div class="game-start-stage">' +
            '<div class="game-start-stage-track">' +
              '<section class="game-start-pane game-start-pane-scores">' +
                '<h2>' + escapeHtml(title) + '</h2>' +
                '<div class="game-start-meta">' + escapeHtml(genre) + ' · ' + escapeHtml(modeLabel) + '</div>' +
                '<div class="game-start-best">Personal Best: ' + escapeHtml(bestText) + '</div>' +
                '<div class="game-start-status">' + escapeHtml(status) + '</div>' +
                '<table class="game-start-table">' +
                  '<tr><th>#</th><th>Name</th><th>' + scoreHeading + '</th></tr>' +
                  buildStartLeaderboardRows(mode, top10 || []) +
                '</table>' +
              '</section>' +
              '<section class="game-start-pane game-start-pane-briefing">' +
                '<h3>Mission Briefing</h3>' +
                '<p class="game-start-description">' + escapeHtml(description) + '</p>' +
                '<div class="game-start-brief-block">' +
                  '<div class="game-start-brief-label">Controls</div>' +
                  '<p class="game-start-brief-text">' + escapeHtml(controls) + '</p>' +
                '</div>' +
                '<div class="game-start-brief-block">' +
                  '<div class="game-start-brief-label">Tips</div>' +
                  '<ul class="game-start-tips">' + buildStartTipsMarkup(game, mode) + '</ul>' +
                '</div>' +
              '</section>' +
            '</div>' +
          '</div>' +
          '<div class="game-start-cycle">' +
            '<span class="game-start-cycle-text">Intro Loop</span>' +
            '<span class="game-start-cycle-dots">' +
              '<span class="game-start-cycle-dot game-start-cycle-dot-scores"></span>' +
              '<span class="game-start-cycle-dot game-start-cycle-dot-briefing"></span>' +
            '</span>' +
          '</div>' +
          '<button class="game-start-btn" type="button">Start</button>' +
        '</div>' +
      '</div>';

    var startBtn = gameContainer.querySelector('.game-start-btn');
    if(startBtn){
      startBtn.onclick = function(){
        if(pendingStartGameIdx !== idx) return;
        clearGameStartScreenLoop();
        pendingStartGameIdx = null;
        launchGame(idx);
      };
    }
    setGameStartScreenPhase(startScreenLoopPhase);
  }

  function openGameStartScreen(idx){
    var g = GAMES[idx];
    if(!g) return;

    clearGameStartScreenLoop();
    focusIdx = idx;
    pendingStartGameIdx = idx;
    startScreenLoopPhase = 'scores';
    startScreenLoopManualOverride = false;
    activeGame = null;

    homeGrid.style.display = 'none';
    gameContainer.style.display = 'block';
    gameContainer.innerHTML = '';
    exitBtn.style.display = 'inline-block';
    updateForceWaveButtonState();

    var mode = g.scoreMode === 'time' ? 'time' : 'score';
    var cached = HighScores.getTop10(g.id, mode);
    renderGameStartScreen(idx, g, cached, 'Loading top scores...');
    startGameStartScreenLoop(idx);

    HighScores.fetchTop10(g.id, mode, { force: true, allowStale: true })
      .then(function(list){
        if(pendingStartGameIdx !== idx) return;
        var status = list && list.length
          ? 'Top on-chain scores'
          : 'No scores yet. Be the first on the board.';
        renderGameStartScreen(idx, g, list || [], status);
      })
      .catch(function(error){
        if(pendingStartGameIdx !== idx) return;
        var fallback = HighScores.getTop10(g.id, mode);
        var detail = error && error.message ? error.message : String(error);
        renderGameStartScreen(idx, g, fallback, 'Top scores unavailable: ' + detail);
      });
  }

  /* Build home grid */
  function buildGrid(){
    homeGrid.innerHTML = '';
    GAMES.forEach(function(g, i){
      var tile = document.createElement('div');
      tile.className = 'tile';
      tile.tabIndex = 0;
      tile.dataset.idx = i;
      var versionLabel = getGameVersionLabelByIndex(i);
      var mode = (g.scoreMode || 'score');
      var best = HighScores.getBest(g.id, mode);
      var bestStr = '--';
      if(best != null){
        bestStr = mode === 'time' ? ('Best: ' + ArcadeUtils.formatTime(best)) : ('Best: ' + ArcadeUtils.formatScore(best));
      }
      tile.innerHTML =
        '<span class="tile-num">#'+(i+1)+'</span>' +
        '<span class="tile-ver">'+versionLabel+'</span>' +
        '<div class="tile-title">'+g.title+'</div>' +
        '<div class="tile-genre">'+g.genreTag+'</div>' +
        '<div class="tile-best">'+bestStr+'</div>';
      tile.onclick = function(){ openGameStartScreen(i); };
      tile.onkeydown = function(e){ if(e.key==='Enter') openGameStartScreen(i); };
      homeGrid.appendChild(tile);
    });
  }

  function showHome(){
    if(!GAMES.length) return;
    clearGameStartScreenLoop();
    pendingStartGameIdx = null;
    HighScores.hideOverlay();
    gameContainer.style.display = 'block';
    homeGrid.style.display = 'none';
    exitBtn.style.display = 'inline-block';
    openGameStartScreen(0);
  }

  function launchGame(idx){
    var g = GAMES[idx];
    if(!g) return;

    clearGameStartScreenLoop();
    pendingStartGameIdx = null;
    if(HighScores && typeof HighScores.clearScoringDisabled === 'function'){
      HighScores.clearScoringDisabled();
    }
    ArcadeUtils.initAudio();
    focusIdx = idx;
    homeGrid.style.display = 'none';
    gameContainer.style.display = 'block';
    gameContainer.innerHTML = '';
    exitBtn.style.display = 'inline-block';
    activeGame = g;
    maybePromptWalletConnectForOnChain();

    requestAnimationFrame(function(){
      if(activeGame !== g) return;
      try{
        var shared = {
          beep: ArcadeUtils.beep,
          highScores: HighScores,
          utils: ArcadeUtils,
          exitToArcade: exitGame
        };
        g.init(gameContainer, shared);
        updateForceWaveButtonState();
      }catch(e){
        showError(e.message || String(e));
      }
    });
  }

  function exitGame(){
    clearGameStartScreenLoop();
    pendingStartGameIdx = null;
    if(activeGame){
      try{ activeGame.destroy(); }catch(e){}
      activeGame = null;
    }
    updateForceWaveButtonState();
    HighScores.hideOverlay();
    showHome();
  }

  exitBtn.onclick = exitGame;

  /* Esc key */
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape'){
      if(activeGame || pendingStartGameIdx != null){
        exitGame();
      }
    }
    if(!activeGame && pendingStartGameIdx != null){
      if(e.key === 'ArrowRight' || e.key === 'ArrowDown'){
        setGameStartScreenManualPhase('briefing');
        e.preventDefault();
      }
      if(e.key === 'ArrowLeft' || e.key === 'ArrowUp'){
        setGameStartScreenManualPhase('scores');
        e.preventDefault();
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
    openGameStartScreen: openGameStartScreen,
    exitGame: exitGame,
    forceNextWave: forceNextWave,
    getActiveGame: function(){ return activeGame; },
    showHome: showHome,
    connectWallet: connectWallet,
    disconnectWallet: disconnectWallet,
    refreshWalletStatus: refreshWalletStatus
  };

  /* Init */
  if(walletStatusBadge){
    walletStatusBadge.style.cursor = 'pointer';
    walletStatusBadge.onclick = function(){
      startWalletDebugSummaryWindow('wallet-badge-click', {
        source: 'walletStatusBadge',
        targetNetwork: resolveTargetNetwork()
      });
      walletDebug('info', 'Wallet badge clicked for manual connect');
      connectWallet().catch(function(error){
        var msg = error && error.message ? error.message : String(error);
        walletDebug('error', 'Manual wallet connect failed', walletErrorForLog(error));
        if(typeof window !== 'undefined' && typeof window.alert === 'function'){
          window.alert('Wallet connect failed: ' + msg);
        }
      });
    };
  }

  if(walletDisconnectBtn){
    walletDisconnectBtn.onclick = function(){
      startWalletDebugSummaryWindow('wallet-disconnect-click', {
        source: 'walletDisconnectBtn',
        targetNetwork: resolveTargetNetwork()
      });
      walletDebug('info', 'Wallet disconnect button clicked');
      disconnectWallet().catch(function(error){
        var msg = error && error.message ? error.message : String(error);
        walletDebug('error', 'Manual wallet disconnect failed', walletErrorForLog(error));
        if(typeof window !== 'undefined' && typeof window.alert === 'function'){
          window.alert('Wallet disconnect failed: ' + msg);
        }
      });
    };
    updateWalletDisconnectButtonState();
  }

  if(walletConnectBtn){
    walletConnectBtn.onclick = function(){
      startWalletDebugSummaryWindow('wallet-connect-btn-click', {
        source: 'walletConnectBtn',
        targetNetwork: resolveTargetNetwork()
      });
      walletDebug('info', 'Wallet connect button clicked');
      connectWallet().catch(function(error){
        var msg = error && error.message ? error.message : String(error);
        walletDebug('error', 'Connect button wallet connect failed', walletErrorForLog(error));
        if(typeof window !== 'undefined' && typeof window.alert === 'function'){
          window.alert('Wallet connect failed: ' + msg);
        }
      });
    };
    updateWalletConnectButtonState();
  }

  walletDebug('info', 'main.js initialized', {
    build: WALLET_DEBUG_BUILD,
    origin: typeof window !== 'undefined' && window.location ? window.location.origin : null,
    onChainConfig: typeof window !== 'undefined' ? (window.ARCADE_ONCHAIN_CONFIG || null) : null
  });
  startWalletStatusPolling();
  initAdminUi();
  updateForceWaveButtonState();
  if(GAMES.length){
    openGameStartScreen(0);
  } else {
    showError('Astro Blaster game runtime not loaded.');
  }
})();
