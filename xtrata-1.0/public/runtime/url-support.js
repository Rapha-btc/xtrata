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

  function rewriteRuntimeAssetUrl(value) {
    if (typeof value !== 'string' || !value.trim()) {
      return value;
    }
    var baseUrl = document.baseURI || window.location.href;
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
        to: rewritten
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
      var rewrittenUrl = rewriteRuntimeAssetUrl(moduleUrl);
      return originalAddModule.call(this, rewrittenUrl, options);
    };
    wrappedAddModule.__xtrataRuntimeUrlWrapped = true;
    ctor.prototype.addModule = wrappedAddModule;
  }

  function patchWorkerConstructor(name) {
    var Original = window[name];
    if (typeof Original !== 'function' || Original.__xtrataRuntimeUrlWrapped) {
      return;
    }
    var Wrapped = function (url, options) {
      return new Original(rewriteRuntimeAssetUrl(url), options);
    };
    Wrapped.prototype = Original.prototype;
    try {
      Object.setPrototypeOf(Wrapped, Original);
    } catch (error) {}
    Wrapped.__xtrataRuntimeUrlWrapped = true;
    window[name] = Wrapped;
  }

  patchAudioWorklet();
  patchAudioContextConstructor('AudioContext');
  patchAudioContextConstructor('webkitAudioContext');
  attachAudioResumeListeners();
  patchWorkerConstructor('Worker');
  patchWorkerConstructor('SharedWorker');
  log('debug', 'Runtime URL support installed');
})();
