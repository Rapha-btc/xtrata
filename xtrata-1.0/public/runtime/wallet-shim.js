(function () {
  if (typeof window === 'undefined') return;
  if (window.__xtrataRuntimeWalletShimInstalled) return;
  window.__xtrataRuntimeWalletShimInstalled = true;

  var search = null;
  try {
    search = new URLSearchParams(window.location.search || '');
  } catch (error) {
    search = new URLSearchParams('');
  }

  function normalizeNetwork(value) {
    if (!value) return null;
    var lower = String(value).toLowerCase();
    if (lower.indexOf('mainnet') >= 0 || lower === 'main') return 'mainnet';
    if (lower.indexOf('testnet') >= 0 || lower === 'test') return 'testnet';
    return null;
  }

  var TARGET_NETWORK = normalizeNetwork(search.get('network')) || 'mainnet';
  var DEBUG_ENABLED =
    search.get('debug') === '1' || search.get('arcadeDebug') === '1';
  var HOST_BRIDGE_TOKEN = String(search.get('walletBridgeToken') || '');
  var HOST_BRIDGE_REQUEST_TYPE = 'xtrata:wallet:request';
  var HOST_BRIDGE_RESPONSE_TYPE = 'xtrata:wallet:response';
  var STORAGE_KEY = 'xtrata.runtime.wallet.session.v1';
  var CONNECT_URLS = [
    'https://esm.sh/@stacks/connect@7.10.2?bundle',
    'https://esm.run/@stacks/connect@7.10.2'
  ];
  var SHIM_METHODS = [
    'stx_getAddresses',
    'getAddresses',
    'stx_getAccounts',
    'getAccounts',
    'wallet_getAccount',
    'stx_getNetwork',
    'getNetwork',
    'stx_requestAccounts',
    'requestAccounts',
    'stx_connect',
    'connect',
    'wallet_connect',
    'stx_callContract',
    'stx_callContractV2',
    'stx_disconnect',
    'wallet_disconnect',
    'disconnect',
    'deactivate'
  ];

  var connectModulePromise = null;
  var connectInFlight = null;
  var hostBridgePending = new Map();
  var hostBridgeListenerInstalled = false;
  var hostBridgeSeq = 0;

  function debugLog(message, detail) {
    if (!DEBUG_ENABLED) return;
    if (typeof console === 'undefined' || typeof console.info !== 'function') return;
    try {
      if (typeof detail === 'undefined') {
        console.info('[xtrata-runtime-wallet] ' + message);
      } else {
        console.info('[xtrata-runtime-wallet] ' + message, detail);
      }
    } catch (error) {}
  }

  function inferNetworkFromAddress(address) {
    if (typeof address !== 'string') return null;
    var prefix = address.slice(0, 2);
    if (prefix === 'SP' || prefix === 'SM') return 'mainnet';
    if (prefix === 'ST' || prefix === 'SN') return 'testnet';
    return null;
  }

  function looksLikeStacksAddress(value) {
    if (typeof value !== 'string') return false;
    var trimmed = value.trim();
    if (trimmed.length < 20) return false;
    var prefix = trimmed.slice(0, 2);
    return prefix === 'SP' || prefix === 'SM' || prefix === 'ST' || prefix === 'SN';
  }

  function readStoredSession() {
    try {
      if (!window.localStorage) return null;
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !looksLikeStacksAddress(parsed.address)) return null;
      return {
        address: String(parsed.address).trim(),
        network:
          normalizeNetwork(parsed.network) ||
          inferNetworkFromAddress(parsed.address) ||
          TARGET_NETWORK
      };
    } catch (error) {
      return null;
    }
  }

  function writeStoredSession(session) {
    try {
      if (!window.localStorage) return;
      if (session && looksLikeStacksAddress(session.address)) {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            address: String(session.address).trim(),
            network:
              normalizeNetwork(session.network) ||
              inferNetworkFromAddress(session.address) ||
              TARGET_NETWORK
          })
        );
        return;
      }
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {}
  }

  function extractStacksAddress(payload, depth) {
    if (depth > 8) return null;
    if (typeof payload === 'string' && looksLikeStacksAddress(payload)) {
      return payload.trim();
    }
    if (!payload) return null;
    if (Array.isArray(payload)) {
      for (var i = 0; i < payload.length; i += 1) {
        var nested = extractStacksAddress(payload[i], depth + 1);
        if (nested) return nested;
      }
      return null;
    }
    if (typeof payload !== 'object') return null;

    var keys = [
      'address',
      'selectedAddress',
      'identityAddress',
      'stxAddress',
      'addresses',
      'accounts',
      'result',
      'profile',
      'authResponsePayload',
      'userData'
    ];

    for (var k = 0; k < keys.length; k += 1) {
      var key = keys[k];
      if (!(key in payload)) continue;
      var found = extractStacksAddress(payload[key], depth + 1);
      if (found) return found;
    }

    if (payload.mainnet && looksLikeStacksAddress(payload.mainnet)) {
      return String(payload.mainnet).trim();
    }
    if (payload.testnet && looksLikeStacksAddress(payload.testnet)) {
      return String(payload.testnet).trim();
    }
    return null;
  }

  function loadConnectModule() {
    if (connectModulePromise) return connectModulePromise;

    connectModulePromise = (async function () {
      var lastError = null;
      for (var i = 0; i < CONNECT_URLS.length; i += 1) {
        var url = CONNECT_URLS[i];
        try {
          var mod = await import(url);
          if (
            mod &&
            (typeof mod.showConnect === 'function' ||
              typeof mod.authenticate === 'function')
          ) {
            debugLog('wallet sdk import succeeded', { url: url });
            return mod;
          }
        } catch (error) {
          lastError = error;
          debugLog('wallet sdk import failed', {
            url: url,
            error: error && error.message ? error.message : String(error)
          });
        }
      }
      throw lastError || new Error('Failed to load wallet connect SDK.');
    })().catch(function (error) {
      connectModulePromise = null;
      throw error;
    });

    return connectModulePromise;
  }

  function createUserSession(mod) {
    if (!mod || typeof mod.AppConfig !== 'function' || typeof mod.UserSession !== 'function') {
      return null;
    }
    try {
      var appConfig = new mod.AppConfig(['store_write'], undefined, '', '/manifest.json');
      return new mod.UserSession({ appConfig: appConfig });
    } catch (error) {
      return null;
    }
  }

  function resolveRedirectPath() {
    var path =
      String(window.location.pathname || '/') +
      String(window.location.search || '') +
      String(window.location.hash || '');
    return path || '/';
  }

  function buildSessionResponse(session) {
    if (!session || !looksLikeStacksAddress(session.address)) {
      return { addresses: [], accounts: [] };
    }
    var network =
      normalizeNetwork(session.network) ||
      inferNetworkFromAddress(session.address) ||
      TARGET_NETWORK;
    var stxAddress =
      network === 'mainnet'
        ? { mainnet: session.address }
        : { testnet: session.address };
    return {
      address: session.address,
      selectedAddress: session.address,
      identityAddress: session.address,
      addresses: [session.address],
      accounts: [session.address],
      stxAddress: stxAddress,
      network: network
    };
  }

  function createShimError(message, code) {
    var error = new Error(String(message || 'Runtime wallet shim error.'));
    if (typeof code !== 'undefined') {
      error.code = code;
    }
    return error;
  }

  function getHostBridgeTargets() {
    var targets = [];
    if (window.opener && window.opener !== window) {
      targets.push(window.opener);
    }
    if (window.parent && window.parent !== window) {
      targets.push(window.parent);
    }
    if (window.top && window.top !== window && targets.indexOf(window.top) < 0) {
      targets.push(window.top);
    }
    return targets;
  }

  function hasHostBridge() {
    return !!HOST_BRIDGE_TOKEN && getHostBridgeTargets().length > 0;
  }

  function ensureHostBridgeResponseListener() {
    if (hostBridgeListenerInstalled) return;
    hostBridgeListenerInstalled = true;
    window.addEventListener('message', function (event) {
      var payload = event && event.data ? event.data : null;
      if (!payload || payload.type !== HOST_BRIDGE_RESPONSE_TYPE) {
        return;
      }
      if (event.origin !== window.location.origin) {
        return;
      }
      var requestId =
        typeof payload.requestId === 'string' ? payload.requestId : '';
      if (!requestId || !hostBridgePending.has(requestId)) {
        return;
      }
      var pending = hostBridgePending.get(requestId);
      hostBridgePending.delete(requestId);
      clearTimeout(pending.timeout);
      if (payload.ok) {
        pending.resolve(payload.result);
        return;
      }
      var detail = payload.error || {};
      var message =
        detail && detail.message
          ? String(detail.message)
          : 'Runtime wallet host bridge rejected request.';
      var error = createShimError(message);
      if (detail && typeof detail.code === 'number') {
        error.code = detail.code;
      }
      pending.reject(error);
    });
  }

  function requestHostBridge(method, params) {
    if (!HOST_BRIDGE_TOKEN) {
      return Promise.reject(
        createShimError('Host wallet bridge token is missing.', -32001)
      );
    }
    var targets = getHostBridgeTargets();
    if (!targets.length) {
      return Promise.reject(
        createShimError('Host wallet bridge target is unavailable.', -32001)
      );
    }

    ensureHostBridgeResponseListener();

    return new Promise(function (resolve, reject) {
      var requestId = 'runtime-wallet-' + String(++hostBridgeSeq);
      var timeout = setTimeout(function () {
        hostBridgePending.delete(requestId);
        reject(createShimError('Host wallet bridge request timed out.', -32001));
      }, 120000);
      hostBridgePending.set(requestId, { resolve: resolve, reject: reject, timeout: timeout });

      var message = {
        type: HOST_BRIDGE_REQUEST_TYPE,
        requestId: requestId,
        bridgeToken: HOST_BRIDGE_TOKEN,
        method: method,
        params: typeof params === 'undefined' ? null : params
      };

      var sent = false;
      for (var i = 0; i < targets.length; i += 1) {
        var target = targets[i];
        try {
          target.postMessage(message, window.location.origin);
          sent = true;
          break;
        } catch (error) {}
      }

      if (!sent) {
        clearTimeout(timeout);
        hostBridgePending.delete(requestId);
        reject(createShimError('Host wallet bridge postMessage failed.', -32001));
      }
    });
  }

  function resolveSessionFromPayload(payload) {
    var address = extractStacksAddress(payload, 0);
    if (!address) return null;
    return {
      address: String(address).trim(),
      network:
        normalizeNetwork(payload && payload.network) ||
        inferNetworkFromAddress(address) ||
        TARGET_NETWORK
    };
  }

  function isHostBridgeUnavailableError(error) {
    if (!error) return false;
    if (typeof error.code !== 'undefined' && Number(error.code) === -32001) {
      return true;
    }
    var message = error && error.message ? String(error.message).toLowerCase() : '';
    return (
      message.indexOf('host wallet bridge') >= 0 ||
      message.indexOf('bridge target is unavailable') >= 0 ||
      message.indexOf('bridge token is missing') >= 0
    );
  }

  function isMethodUnsupportedError(error) {
    var message = error && error.message ? String(error.message).toLowerCase() : '';
    return (
      message.indexOf('method not found') >= 0 ||
      message.indexOf('unsupported') >= 0 ||
      message.indexOf('not implemented') >= 0 ||
      message.indexOf('request function is not implemented') >= 0
    );
  }

  function isUserCancelledError(error) {
    if (error && typeof error.code !== 'undefined') {
      var numericCode = Number(error.code);
      if (numericCode === 4001 || numericCode === -32000 || numericCode === -31001) {
        return true;
      }
    }
    var message = error && error.message ? String(error.message).toLowerCase() : '';
    return (
      message.indexOf('cancel') >= 0 ||
      message.indexOf('reject') >= 0 ||
      message.indexOf('denied') >= 0 ||
      message.indexOf('closed') >= 0
    );
  }

  function parseRequestArgs(methodOrPayload, maybeParams) {
    if (typeof methodOrPayload === 'string') {
      return { method: methodOrPayload, params: maybeParams };
    }
    if (methodOrPayload && typeof methodOrPayload === 'object') {
      return { method: methodOrPayload.method, params: methodOrPayload.params };
    }
    return { method: null, params: null };
  }

  function isConnectMethod(method) {
    return (
      method === 'stx_requestAccounts' ||
      method === 'requestAccounts' ||
      method === 'stx_connect' ||
      method === 'connect' ||
      method === 'wallet_connect'
    );
  }

  function isReadMethod(method) {
    return (
      method === 'stx_getAddresses' ||
      method === 'getAddresses' ||
      method === 'stx_getAccounts' ||
      method === 'getAccounts' ||
      method === 'wallet_getAccount'
    );
  }

  function isNetworkMethod(method) {
    return method === 'stx_getNetwork' || method === 'getNetwork';
  }

  function isDisconnectMethod(method) {
    return (
      method === 'stx_disconnect' ||
      method === 'wallet_disconnect' ||
      method === 'disconnect' ||
      method === 'deactivate'
    );
  }

  function isContractCallMethod(method) {
    return method === 'stx_callContract' || method === 'stx_callContractV2';
  }

  function pickDelegatedRequest(root, originalRequest) {
    if (!root || typeof root !== 'object') return null;
    var queue = [root];
    var seen = [];
    var keys = [
      'provider',
      'walletProvider',
      'wallet',
      'StacksProvider',
      'stacksProvider',
      'stacks',
      'rpc',
      'client',
      'providers'
    ];

    while (queue.length) {
      var current = queue.shift();
      if (!current || typeof current !== 'object') continue;
      if (seen.indexOf(current) >= 0) continue;
      seen.push(current);

      if (
        current !== root &&
        typeof current.request === 'function' &&
        current.request !== originalRequest
      ) {
        return current.request.bind(current);
      }

      for (var i = 0; i < keys.length; i += 1) {
        var nested = current[keys[i]];
        if (nested && typeof nested === 'object') queue.push(nested);
      }

      if (typeof current.getProvider === 'function') {
        try {
          var provided = current.getProvider();
          if (provided && typeof provided === 'object') queue.push(provided);
        } catch (error) {}
      }
    }

    return null;
  }

  function connectViaProviderRequest(provider) {
    if (!provider || typeof provider.request !== 'function') {
      return Promise.reject(
        createShimError('Wallet provider does not support request-based connect.', -32601)
      );
    }

    var attempts = [
      'stx_getAddresses',
      'getAddresses',
      'stx_getAccounts',
      'getAccounts',
      'wallet_getAccount',
      'stx_requestAccounts',
      'requestAccounts',
      'stx_connect',
      'connect',
      'wallet_connect'
    ];

    var lastError = null;

    function tryNext(index) {
      if (index >= attempts.length) {
        if (lastError) throw lastError;
        return null;
      }

      var method = attempts[index];
      return Promise.resolve()
        .then(function () {
          return provider.request(method);
        })
        .then(function (payload) {
          var session = resolveSessionFromPayload(payload);
          if (session) {
            writeStoredSession(session);
            return session;
          }
          return tryNext(index + 1);
        })
        .catch(function (error) {
          lastError = error;
          if (isUserCancelledError(error)) {
            return null;
          }
          if (isMethodUnsupportedError(error)) {
            return tryNext(index + 1);
          }
          throw error;
        });
    }

    return tryNext(0);
  }

  function connectViaLegacySdk(provider) {
    if (connectInFlight) return connectInFlight;

    connectInFlight = loadConnectModule()
      .then(function (mod) {
        return new Promise(function (resolve, reject) {
          var settled = false;
          var userSession = createUserSession(mod);
          var showConnectFn =
            mod && typeof mod.showConnect === 'function' ? mod.showConnect : null;
          var authenticateFn =
            mod && typeof mod.authenticate === 'function' ? mod.authenticate : null;

          if (!showConnectFn && !authenticateFn) {
            reject(new Error('Wallet connect SDK missing showConnect/authenticate.'));
            return;
          }

          var timeoutId = setTimeout(function () {
            if (settled) return;
            settled = true;
            reject(new Error('Wallet authentication timed out.'));
          }, 90000);

          function finish(error, payload) {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            if (error) {
              reject(error);
              return;
            }

            var address = extractStacksAddress(payload, 0);
            var network = address
              ? inferNetworkFromAddress(address) || TARGET_NETWORK
              : TARGET_NETWORK;

            if (
              !address &&
              payload &&
              payload.userSession &&
              typeof payload.userSession.loadUserData === 'function'
            ) {
              try {
                var payloadUserData = payload.userSession.loadUserData();
                address = extractStacksAddress(payloadUserData, 0) || address;
                if (address) {
                  network = inferNetworkFromAddress(address) || network;
                }
              } catch (innerError) {}
            }

            if (
              !address &&
              userSession &&
              typeof userSession.isUserSignedIn === 'function' &&
              userSession.isUserSignedIn()
            ) {
              try {
                var signedData = userSession.loadUserData();
                address = extractStacksAddress(signedData, 0) || address;
                if (address) {
                  network = inferNetworkFromAddress(address) || network;
                }
              } catch (innerError2) {}
            }

            if (address) {
              writeStoredSession({ address: address, network: network });
            }
            resolve(readStoredSession());
          }

          var options = {
            appDetails: {
              name: 'Xtrata Runtime',
              icon: window.location.origin + '/favicon.svg'
            },
            manifestPath: '/manifest.json',
            redirectTo: resolveRedirectPath(),
            onFinish: function (payload) {
              finish(null, payload || null);
            },
            onCancel: function () {
              finish(null, null);
            }
          };

          if (userSession) {
            options.userSession = userSession;
          }

          try {
            var invocation;
            if (showConnectFn) {
              invocation = showConnectFn(options);
            } else {
              invocation = authenticateFn(options, provider || undefined);
            }
            Promise.resolve(invocation).catch(function (error) {
              finish(error);
            });
          } catch (error) {
            finish(error);
          }
        });
      })
      .finally(function () {
        connectInFlight = null;
      });

    return connectInFlight;
  }

  function connectViaShim(provider) {
    if (!provider) {
      return connectViaLegacySdk(provider);
    }

    return connectViaProviderRequest(provider).catch(function (error) {
      if (isUserCancelledError(error)) {
        return null;
      }
      if (!isMethodUnsupportedError(error)) {
        throw error;
      }
      return connectViaLegacySdk(provider);
    });
  }

  function shimRequest(method, provider, params) {
    var lower = String(method || '').trim();

    function applySessionFromPayload(payload) {
      var session = resolveSessionFromPayload(payload);
      if (session) {
        writeStoredSession(session);
      }
      return buildSessionResponse(session || readStoredSession());
    }

    if (isDisconnectMethod(lower)) {
      var disconnectAttempt = hasHostBridge()
        ? requestHostBridge(lower, params).catch(function (error) {
            if (!isHostBridgeUnavailableError(error)) {
              throw error;
            }
            return null;
          })
        : Promise.resolve(null);

      return disconnectAttempt.then(function () {
        writeStoredSession(null);
        return { ok: true };
      });
    }

    if (isConnectMethod(lower)) {
      var hostConnectAttempt = hasHostBridge()
        ? requestHostBridge(lower, params).then(function (payload) {
            return applySessionFromPayload(payload);
          })
        : Promise.reject(createShimError('Host wallet bridge unavailable.', -32001));

      return hostConnectAttempt.catch(function (error) {
        if (!isHostBridgeUnavailableError(error)) {
          throw error;
        }
        return connectViaShim(provider).then(function (session) {
          return buildSessionResponse(session);
        });
      });
    }

    if (isReadMethod(lower)) {
      var hostReadAttempt = hasHostBridge()
        ? requestHostBridge(lower, params).then(function (payload) {
            return applySessionFromPayload(payload);
          })
        : Promise.reject(createShimError('Host wallet bridge unavailable.', -32001));

      return hostReadAttempt.catch(function (error) {
        if (!isHostBridgeUnavailableError(error)) {
          throw error;
        }
        var session = readStoredSession();
        if (!session && provider) {
          var direct = null;
          if (looksLikeStacksAddress(provider.selectedAddress)) {
            direct = provider.selectedAddress;
          } else if (looksLikeStacksAddress(provider.address)) {
            direct = provider.address;
          }
          if (direct) {
            session = {
              address: String(direct).trim(),
              network: inferNetworkFromAddress(String(direct).trim()) || TARGET_NETWORK
            };
            writeStoredSession(session);
          }
        }
        return buildSessionResponse(session);
      });
    }

    if (isNetworkMethod(lower)) {
      var hostNetworkAttempt = hasHostBridge()
        ? requestHostBridge(lower, params).then(function (payload) {
            var network = normalizeNetwork(payload && payload.network);
            if (!network) {
              var nested = payload && payload.result ? payload.result : null;
              network = normalizeNetwork(nested && nested.network);
            }
            return {
              network:
                network ||
                (readStoredSession() && readStoredSession().network) ||
                TARGET_NETWORK
            };
          })
        : Promise.reject(createShimError('Host wallet bridge unavailable.', -32001));

      return hostNetworkAttempt.catch(function (error) {
        if (!isHostBridgeUnavailableError(error)) {
          throw error;
        }
        var stored = readStoredSession();
        return {
          network: (stored && stored.network) || TARGET_NETWORK
        };
      });
    }

    if (isContractCallMethod(lower)) {
      if (!hasHostBridge()) {
        return Promise.reject(
          createShimError(
            'Wallet contract call requires host wallet bridge support.',
            -32601
          )
        );
      }
      return requestHostBridge(lower, params);
    }

    var unsupported = createShimError(
      'Wallet method unsupported in runtime shim: ' + lower,
      -32601
    );
    return Promise.reject(unsupported);
  }

  function installProviderShim(provider, label) {
    if (!provider || typeof provider !== 'object') return;
    if (provider.__xtrataRuntimeWalletPatched) return;

    var originalRequest =
      typeof provider.request === 'function' ? provider.request.bind(provider) : null;
    var delegatedRequest = pickDelegatedRequest(provider, originalRequest);

    provider.request = function (methodOrPayload, maybeParams) {
      var parsed = parseRequestArgs(methodOrPayload, maybeParams);
      var method = parsed.method;
      if (!method) {
        var invalid = new Error('Wallet request requires a method.');
        invalid.code = -32600;
        return Promise.reject(invalid);
      }

      if (originalRequest) {
        return Promise.resolve()
          .then(function () {
            return originalRequest(methodOrPayload, maybeParams);
          })
          .catch(function (error) {
            if (SHIM_METHODS.indexOf(method) < 0) {
              throw error;
            }
            var message = error && error.message ? String(error.message).toLowerCase() : '';
            if (message.indexOf('request function is not implemented') < 0) {
              throw error;
            }
            return shimRequest(method, provider, parsed.params);
          });
      }

      if (delegatedRequest) {
        return Promise.resolve()
          .then(function () {
            return delegatedRequest(methodOrPayload, maybeParams);
          })
          .catch(function (error) {
            if (SHIM_METHODS.indexOf(method) < 0) {
              throw error;
            }
            var message = error && error.message ? String(error.message).toLowerCase() : '';
            if (message.indexOf('request function is not implemented') < 0) {
              throw error;
            }
            return shimRequest(method, provider, parsed.params);
          });
      }

      if (SHIM_METHODS.indexOf(method) >= 0) {
        return shimRequest(method, provider, parsed.params);
      }

      var unsupported = new Error('Wallet request unavailable for "' + method + '".');
      unsupported.code = -32601;
      return Promise.reject(unsupported);
    };

    for (var i = 0; i < SHIM_METHODS.length; i += 1) {
      (function (methodName) {
        if (typeof provider[methodName] === 'function') return;
        provider[methodName] = function (params) {
          return provider.request(methodName, params);
        };
      })(SHIM_METHODS[i]);
    }

    provider.__xtrataRuntimeWalletPatched = true;
    debugLog('provider shim installed', { provider: label || 'unknown' });
  }

  function installAllProviderShims() {
    if (!window.StacksProvider || typeof window.StacksProvider !== 'object') {
      window.StacksProvider = {};
      debugLog('created synthetic window.StacksProvider shim target');
    }
    if (!window.stacks || typeof window.stacks !== 'object') {
      window.stacks = window.StacksProvider;
    }

    var candidates = [
      { label: 'window.StacksProvider', provider: window.StacksProvider },
      { label: 'window.LeatherProvider', provider: window.LeatherProvider },
      { label: 'window.stacks', provider: window.stacks },
      {
        label: 'window.XverseProviders.StacksProvider',
        provider: window.XverseProviders && window.XverseProviders.StacksProvider
      },
      {
        label: 'window.xverseProviders.StacksProvider',
        provider: window.xverseProviders && window.xverseProviders.StacksProvider
      }
    ];

    for (var i = 0; i < candidates.length; i += 1) {
      installProviderShim(candidates[i].provider, candidates[i].label);
    }

    if (window.StacksProvider && typeof window.StacksProvider === 'object') {
      try {
        window.StacksProvider.__arcadeWalletLabel =
          window.StacksProvider.__arcadeWalletLabel || 'window.StacksProvider';
      } catch (error) {}
    }
  }

  installAllProviderShims();
  setTimeout(installAllProviderShims, 400);
  setTimeout(installAllProviderShims, 1400);
  setTimeout(installAllProviderShims, 3200);
  window.addEventListener('focus', function () {
    installAllProviderShims();
  });
})();
