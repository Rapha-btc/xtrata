(function () {
  if (typeof window === 'undefined') {
    return;
  }
  if (window.__xtrataRuntimeUrlSupport) {
    return;
  }

  window.__xtrataRuntimeUrlSupport = true;

  var WORKSPACE_PREFIX = '/on-chain-modules/workspace/';
  var RUNTIME_MODULES_PREFIX = '/runtime/modules/';
  var ABSOLUTE_WORKSPACE_ROOTS = [
    '/System/',
    '/Plugins/',
    '/Samples/',
    '/Presets/',
    '/Assets/',
    '/Themes/',
    '/Skins/',
    '/Modules/',
    '/Instruments/',
    '/Effects/'
  ];
  var trackedAudioContexts = [];
  var audioResumeListenersAttached = false;
  var trackedAudioWorkletNodes = [];
  var MAX_PORT_LOGS_PER_NODE = 12;

  function log(level, message, detail) {
    try {
      var logger =
        console && typeof console[level] === 'function'
          ? console[level].bind(console)
          : console.log.bind(console);
      if (detail !== undefined) {
        logger('[xtrata:runtime] ' + message, detail);
      } else {
        logger('[xtrata:runtime] ' + message);
      }
    } catch (error) {}
  }

  function safeUrl(value, base) {
    try {
      return new URL(value, base);
    } catch (error) {
      return null;
    }
  }

  function extractCallerModuleBaseUrl() {
    try {
      var stack = new Error().stack || '';
      var match = stack.match(/https?:\/\/[^\s)]+\/runtime\/modules\/[^\s):]+(?:\?[^\s):]+)?/);
      if (!match || !match[0]) {
        return null;
      }
      return match[0];
    } catch (error) {
      return null;
    }
  }

  function deriveWorkspaceBase(value) {
    var url = safeUrl(value, window.location.origin || 'https://xtrata.local');
    if (!url) {
      return null;
    }
    var markerIndex = url.pathname.indexOf(WORKSPACE_PREFIX);
    if (markerIndex === -1) {
      return null;
    }
    return url.origin + url.pathname.slice(0, markerIndex + WORKSPACE_PREFIX.length);
  }

  function isLikelyWorkspaceAbsolutePath(pathname) {
    if (typeof pathname !== 'string' || !pathname) {
      return false;
    }
    if (pathname.indexOf(WORKSPACE_PREFIX) === 0) {
      return true;
    }
    for (var index = 0; index < ABSOLUTE_WORKSPACE_ROOTS.length; index += 1) {
      if (pathname.indexOf(ABSOLUTE_WORKSPACE_ROOTS[index]) === 0) {
        return true;
      }
    }
    return false;
  }

  function rewriteRuntimeAssetUrl(value, baseOverride) {
    if (typeof value !== 'string' || !value.trim()) {
      return value;
    }
    var baseUrl = baseOverride || document.baseURI || window.location.href;
    var resolved = safeUrl(value, baseUrl);
    if (!resolved) {
      return value;
    }
    if (resolved.pathname.indexOf(RUNTIME_MODULES_PREFIX) === 0) {
      return resolved.toString();
    }
    if (resolved.origin !== window.location.origin) {
      return value;
    }
    if (!isLikelyWorkspaceAbsolutePath(resolved.pathname)) {
      return value;
    }
    var workspaceBase = deriveWorkspaceBase(baseUrl);
    if (!workspaceBase) {
      return value;
    }
    var target = safeUrl(workspaceBase, window.location.origin);
    if (!target) {
      return value;
    }
    if (resolved.pathname.indexOf(WORKSPACE_PREFIX) === 0) {
      target.pathname = target.pathname + resolved.pathname.slice(WORKSPACE_PREFIX.length);
    } else {
      target.pathname = target.pathname + resolved.pathname.slice(1);
    }
    target.search = resolved.search;
    target.hash = resolved.hash;
    var rewritten = target.toString();
    if (rewritten !== value) {
      log('debug', 'Remapped runtime asset URL', {
        from: value,
        to: rewritten,
        baseUrl: baseUrl
      });
    }
    return rewritten;
  }

  window.__xtrataResolveRuntimeAssetUrl = rewriteRuntimeAssetUrl;

  function trackAudioContext(instance, label) {
    if (!instance || trackedAudioContexts.indexOf(instance) !== -1) {
      return instance;
    }
    trackedAudioContexts.push(instance);
    try {
      if (typeof instance.addEventListener === 'function') {
        instance.addEventListener('statechange', function () {
          log('debug', 'AudioContext state changed', {
            label: label,
            state: instance.state || ''
          });
        });
      }
    } catch (error) {}
    log('debug', 'AudioContext created', {
      label: label,
      state: instance.state || ''
    });
    return instance;
  }

  function patchAudioContextConstructor(name) {
    var Original = window[name];
    if (typeof Original !== 'function' || Original.__xtrataRuntimeAudioWrapped) {
      return;
    }
    var Wrapped = function () {
      var args = Array.prototype.slice.call(arguments);
      var instance = new (Function.prototype.bind.apply(Original, [null].concat(args)))();
      return trackAudioContext(instance, name);
    };
    Wrapped.prototype = Original.prototype;
    try {
      Object.setPrototypeOf(Wrapped, Original);
    } catch (error) {}
    Wrapped.__xtrataRuntimeAudioWrapped = true;
    window[name] = Wrapped;
  }

  function resumeTrackedAudioContexts(reason) {
    trackedAudioContexts.forEach(function (context) {
      if (!context || typeof context.resume !== 'function') {
        return;
      }
      if (context.state !== 'suspended') {
        return;
      }
      log('debug', 'Attempting AudioContext resume', {
        reason: reason,
        state: context.state || ''
      });
      try {
        var result = context.resume();
        if (result && typeof result.then === 'function') {
          result
            .then(function () {
              log('debug', 'AudioContext resume resolved', {
                reason: reason,
                state: context.state || ''
              });
            })
            .catch(function (error) {
              log('warn', 'AudioContext resume failed', {
                reason: reason,
                error:
                  error && typeof error.message === 'string'
                    ? error.message
                    : String(error || '')
              });
            });
        }
      } catch (error) {
        log('warn', 'AudioContext resume threw', {
          reason: reason,
          error:
            error && typeof error.message === 'string'
              ? error.message
              : String(error || '')
        });
      }
    });
  }

  function attachAudioResumeListeners() {
    if (audioResumeListenersAttached) {
      return;
    }
    audioResumeListenersAttached = true;
    ['pointerdown', 'mousedown', 'touchstart', 'keydown'].forEach(function (eventName) {
      window.addEventListener(
        eventName,
        function () {
          resumeTrackedAudioContexts(eventName);
        },
        { passive: true }
      );
    });
  }

  function summarizePayload(value) {
    if (value == null) {
      return value;
    }
    if (typeof value === 'string') {
      return value.length > 180 ? value.slice(0, 180) + '...' : value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (Array.isArray(value)) {
      return {
        type: 'array',
        length: value.length
      };
    }
    if (typeof value === 'object') {
      var keys = [];
      try {
        keys = Object.keys(value).slice(0, 8);
      } catch (error) {}
      return {
        type:
          value && value.constructor && value.constructor.name
            ? value.constructor.name
            : 'object',
        keys: keys
      };
    }
    return String(value);
  }

  function attachAudioWorkletNodeDiagnostics(node, name) {
    if (!node || trackedAudioWorkletNodes.indexOf(node) !== -1) {
      return node;
    }
    trackedAudioWorkletNodes.push(node);
    var postCount = 0;
    var messageCount = 0;
    log('debug', 'AudioWorkletNode created', {
      name: name || '',
      contextState:
        node.context && typeof node.context.state === 'string'
          ? node.context.state
          : '',
      inputs:
        typeof node.numberOfInputs === 'number' ? node.numberOfInputs : null,
      outputs:
        typeof node.numberOfOutputs === 'number' ? node.numberOfOutputs : null
    });
    try {
      if (typeof node.addEventListener === 'function') {
        node.addEventListener('processorerror', function () {
          log('warn', 'AudioWorkletNode processorerror', {
            name: name || ''
          });
        });
      }
    } catch (error) {}
    try {
      if (node.port && typeof node.port.addEventListener === 'function') {
        node.port.addEventListener('message', function (event) {
          if (messageCount >= MAX_PORT_LOGS_PER_NODE) {
            return;
          }
          messageCount += 1;
          log('debug', 'AudioWorkletNode port message', {
            name: name || '',
            index: messageCount,
            payload: summarizePayload(event ? event.data : null)
          });
        });
        if (typeof node.port.start === 'function') {
          node.port.start();
        }
      }
      if (node.port && typeof node.port.postMessage === 'function') {
        var originalPostMessage = node.port.postMessage.bind(node.port);
        node.port.postMessage = function (value, transfer) {
          if (postCount < MAX_PORT_LOGS_PER_NODE) {
            postCount += 1;
            log('debug', 'AudioWorkletNode port postMessage', {
              name: name || '',
              index: postCount,
              payload: summarizePayload(value)
            });
          }
          return originalPostMessage(value, transfer);
        };
      }
    } catch (error) {}
    return node;
  }

  function patchAudioWorklet() {
    var ctor = typeof window.AudioWorklet === 'function' ? window.AudioWorklet : null;
    if (!ctor || !ctor.prototype || typeof ctor.prototype.addModule !== 'function') {
      return;
    }
    var originalAddModule = ctor.prototype.addModule;
    if (originalAddModule.__xtrataRuntimeUrlWrapped) {
      return;
    }
    var wrappedAddModule = function (moduleUrl, options) {
      var callerBaseUrl = extractCallerModuleBaseUrl();
      var rewrittenUrl = rewriteRuntimeAssetUrl(moduleUrl, callerBaseUrl);
      return originalAddModule.call(this, rewrittenUrl, options);
    };
    wrappedAddModule.__xtrataRuntimeUrlWrapped = true;
    ctor.prototype.addModule = wrappedAddModule;
  }

  function patchAudioWorkletNodeConstructor() {
    var Original = window.AudioWorkletNode;
    if (typeof Original !== 'function' || Original.__xtrataRuntimeNodeWrapped) {
      return;
    }
    var Wrapped = function (context, name, options) {
      var node = new Original(context, name, options);
      return attachAudioWorkletNodeDiagnostics(node, name);
    };
    Wrapped.prototype = Original.prototype;
    try {
      Object.setPrototypeOf(Wrapped, Original);
    } catch (error) {}
    Wrapped.__xtrataRuntimeNodeWrapped = true;
    window.AudioWorkletNode = Wrapped;
  }

  function patchAudioNodeConnect() {
    var ctor = window.AudioNode;
    if (!ctor || !ctor.prototype || typeof ctor.prototype.connect !== 'function') {
      return;
    }
    var originalConnect = ctor.prototype.connect;
    if (originalConnect.__xtrataRuntimeConnectWrapped) {
      return;
    }
    var wrappedConnect = function (destination) {
      var sourceName =
        this && this.constructor && this.constructor.name ? this.constructor.name : 'AudioNode';
      var destinationName =
        destination && destination.constructor && destination.constructor.name
          ? destination.constructor.name
          : destination && destination.name
            ? destination.name
            : typeof destination;
      if (
        sourceName === 'AudioWorkletNode' ||
        destinationName === 'AudioWorkletNode' ||
        destinationName === 'AudioDestinationNode' ||
        destinationName === 'GainNode'
      ) {
        log('debug', 'AudioNode connect', {
          source: sourceName,
          destination: destinationName
        });
      }
      return originalConnect.apply(this, arguments);
    };
    wrappedConnect.__xtrataRuntimeConnectWrapped = true;
    ctor.prototype.connect = wrappedConnect;
  }

  function patchWorkerConstructor(name) {
    var Original = window[name];
    if (typeof Original !== 'function' || Original.__xtrataRuntimeUrlWrapped) {
      return;
    }
    var Wrapped = function (url, options) {
      var callerBaseUrl = extractCallerModuleBaseUrl();
      return new Original(rewriteRuntimeAssetUrl(url, callerBaseUrl), options);
    };
    Wrapped.prototype = Original.prototype;
    try {
      Object.setPrototypeOf(Wrapped, Original);
    } catch (error) {}
    Wrapped.__xtrataRuntimeUrlWrapped = true;
    window[name] = Wrapped;
  }

  patchAudioWorklet();
  patchAudioWorkletNodeConstructor();
  patchAudioNodeConnect();
  patchAudioContextConstructor('AudioContext');
  patchAudioContextConstructor('webkitAudioContext');
  attachAudioResumeListeners();
  patchWorkerConstructor('Worker');
  patchWorkerConstructor('SharedWorker');
  log('debug', 'Runtime URL support installed');
})();
