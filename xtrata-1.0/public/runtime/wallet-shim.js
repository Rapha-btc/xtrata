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
    'stx_disconnect',
    'wallet_disconnect',
    'disconnect',
    'deactivate'
  ];

  var connectModulePromise = null;
  var connectInFlight = null;

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

  function connectViaShim(provider) {
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
              icon: window.location.origin + '/favicon.ico'
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

  function shimRequest(method, provider) {
    var lower = String(method || '').trim();

    if (isDisconnectMethod(lower)) {
      writeStoredSession(null);
      return Promise.resolve({ ok: true });
    }

    if (isConnectMethod(lower)) {
      return connectViaShim(provider).then(function (session) {
        return buildSessionResponse(session);
      });
    }

    if (isReadMethod(lower)) {
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
      return Promise.resolve(buildSessionResponse(session));
    }

    if (isNetworkMethod(lower)) {
      var stored = readStoredSession();
      return Promise.resolve({
        network: (stored && stored.network) || TARGET_NETWORK
      });
    }

    var unsupported = new Error('Wallet method unsupported in runtime shim: ' + lower);
    unsupported.code = -32601;
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
            return shimRequest(method, provider);
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
            return shimRequest(method, provider);
          });
      }

      if (SHIM_METHODS.indexOf(method) >= 0) {
        return shimRequest(method, provider);
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
