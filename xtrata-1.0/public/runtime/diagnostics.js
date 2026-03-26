(function () {
  if (typeof window === 'undefined') {
    return;
  }
  if (window.__xtrataRuntimeDiagnostics) {
    return;
  }

  var MAX_EVENTS = 200;
  var state = {
    version: 'v2',
    events: []
  };
  window.__xtrataRuntimeDiagnostics = state;
  var seenResourceKeys = Object.create(null);
  var containerObserver = null;
  var bodyObserver = null;

  function trimEvents() {
    while (state.events.length > MAX_EVENTS) {
      state.events.shift();
    }
  }

  function record(level, message, detail) {
    var entry = {
      at: Date.now(),
      level: level,
      message: message,
      detail: detail || null
    };
    state.events.push(entry);
    trimEvents();
    try {
      if (typeof window.__xtrataRuntimeReportDiagnostic === 'function') {
        window.__xtrataRuntimeReportDiagnostic(entry);
      }
    } catch (error) {}
  }

  function log(level, message, detail) {
    record(level, message, detail);
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

  function formatError(value) {
    if (!value) {
      return '';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (value && typeof value.message === 'string') {
      return value.message;
    }
    try {
      return String(value);
    } catch (error) {
      return 'Unknown error';
    }
  }

  function shouldTrace(url) {
    if (!url) {
      return false;
    }
    var normalized = String(url).toLowerCase();
    return (
      normalized.indexOf('/runtime/modules/') !== -1 ||
      normalized.indexOf('/runtime/content') !== -1 ||
      /\.(js|mjs|cjs|json|wasm)([?#]|$)/.test(normalized)
    );
  }

  function compactUrl(url) {
    var value = String(url || '');
    if (value.length <= 180) {
      return value;
    }
    return value.slice(0, 120) + '...' + value.slice(-40);
  }

  function summarizeResourceEntry(entry) {
    if (!entry || !entry.name || !shouldTrace(entry.name)) {
      return null;
    }
    return {
      name: compactUrl(entry.name),
      initiatorType: entry.initiatorType || '',
      durationMs:
        typeof entry.duration === 'number' ? Math.round(entry.duration) : 0,
      transferSize:
        typeof entry.transferSize === 'number' ? entry.transferSize : 0,
      encodedBodySize:
        typeof entry.encodedBodySize === 'number' ? entry.encodedBodySize : 0,
      decodedBodySize:
        typeof entry.decodedBodySize === 'number' ? entry.decodedBodySize : 0,
      responseStatus:
        typeof entry.responseStatus === 'number' ? entry.responseStatus : 0
    };
  }

  function logResourceEntries(entries, reason) {
    for (var index = 0; index < entries.length; index += 1) {
      var summary = summarizeResourceEntry(entries[index]);
      if (!summary) {
        continue;
      }
      var key =
        summary.name +
        '|' +
        summary.initiatorType +
        '|' +
        String(summary.transferSize) +
        '|' +
        String(summary.durationMs);
      if (seenResourceKeys[key]) {
        continue;
      }
      seenResourceKeys[key] = true;
      log('debug', 'Resource timing observed', {
        reason: reason,
        resource: summary
      });
    }
  }

  function scanExistingResources(reason) {
    if (
      typeof performance === 'undefined' ||
      !performance ||
      typeof performance.getEntriesByType !== 'function'
    ) {
      return;
    }
    try {
      logResourceEntries(performance.getEntriesByType('resource') || [], reason);
    } catch (error) {}
  }

  function extractTargetSource(target) {
    if (!target || typeof target !== 'object') {
      return '';
    }
    return (
      target.currentSrc ||
      target.src ||
      target.href ||
      target.data ||
      ''
    );
  }

  function readContainerSnapshot() {
    var container =
      document.getElementById('app-container') ||
      document.querySelector('[data-app-container]') ||
      null;
    if (!container) {
      return {
        found: false,
        readyState: document.readyState || '',
        bodyChildren:
          document.body && typeof document.body.childElementCount === 'number'
            ? document.body.childElementCount
            : 0
      };
    }
    var childTags = [];
    if (container.children && container.children.length) {
      for (var index = 0; index < container.children.length && index < 8; index += 1) {
        var child = container.children[index];
        childTags.push(String(child.tagName || child.localName || '').toLowerCase());
      }
    }
    var text = '';
    try {
      text = (container.textContent || '').trim().slice(0, 180);
    } catch (error) {}
    return {
      found: true,
      readyState: document.readyState || '',
      childCount:
        typeof container.childElementCount === 'number'
          ? container.childElementCount
          : 0,
      childTags: childTags,
      htmlLength:
        typeof container.innerHTML === 'string' ? container.innerHTML.length : 0,
      textPreview: text
    };
  }

  function logContainerSnapshot(reason) {
    log('debug', 'Container snapshot', {
      reason: reason,
      snapshot: readContainerSnapshot()
    });
  }

  function observeContainer() {
    if (containerObserver || typeof MutationObserver !== 'function') {
      return;
    }
    var container = document.getElementById('app-container');
    if (!container) {
      return;
    }
    containerObserver = new MutationObserver(function () {
      logContainerSnapshot('container-mutation');
    });
    containerObserver.observe(container, {
      childList: true,
      subtree: true,
      attributes: false
    });
    logContainerSnapshot('container-observer-attached');
  }

  function observeBodyForContainer() {
    if (bodyObserver || typeof MutationObserver !== 'function') {
      return;
    }
    var root = document.documentElement || document.body;
    if (!root) {
      return;
    }
    bodyObserver = new MutationObserver(function () {
      if (document.getElementById('app-container')) {
        observeContainer();
        if (bodyObserver) {
          bodyObserver.disconnect();
          bodyObserver = null;
        }
      }
    });
    bodyObserver.observe(root, {
      childList: true,
      subtree: true
    });
  }

  window.addEventListener(
    'error',
    function (event) {
      var target = event && event.target;
      if (target && target !== window) {
        var source = extractTargetSource(target);
        var tag = target.tagName || target.localName || '';
        log('warn', 'Resource load failed', {
          tag: tag,
          source: source || '',
          href: window.location.href
        });
        return;
      }
      log('warn', 'Unhandled runtime error', {
        message: (event && event.message) || '',
        source: (event && event.filename) || '',
        line: (event && event.lineno) || 0,
        column: (event && event.colno) || 0
      });
    },
    true
  );

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event ? event.reason : null;
    log('warn', 'Unhandled runtime rejection', {
      message: formatError(reason),
      stack: reason && reason.stack ? String(reason.stack) : ''
    });
  });

  if (typeof PerformanceObserver === 'function') {
    try {
      var observer = new PerformanceObserver(function (list) {
        if (!list || typeof list.getEntries !== 'function') {
          return;
        }
        logResourceEntries(list.getEntries(), 'observer');
      });
      observer.observe({ type: 'resource', buffered: true });
    } catch (error) {}
  }

  var originalFetch =
    typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
  if (originalFetch) {
    window.fetch = function (input, init) {
      var requestedUrl =
        typeof input === 'string'
          ? input
          : input && typeof input.url === 'string'
            ? input.url
            : String(input || '');
      var method =
        init && typeof init.method === 'string'
          ? init.method.toUpperCase()
          : 'GET';
      var startedAt = Date.now();
      return originalFetch(input, init)
        .then(function (response) {
          var responseUrl =
            response && typeof response.url === 'string'
              ? response.url
              : requestedUrl;
          if (shouldTrace(requestedUrl) || shouldTrace(responseUrl)) {
            var detail = {
              url: requestedUrl,
              responseUrl: responseUrl,
              method: method,
              status: response.status,
              ok: response.ok,
              redirected: !!response.redirected,
              durationMs: Date.now() - startedAt,
              contentType:
                response.headers && typeof response.headers.get === 'function'
                  ? response.headers.get('content-type') || ''
                  : ''
            };
            if (response.ok) {
              log('debug', 'Tracked fetch completed', detail);
            } else {
              log('warn', 'Tracked fetch failed', detail);
            }
          }
          return response;
        })
        .catch(function (error) {
          if (shouldTrace(requestedUrl)) {
            log('warn', 'Tracked fetch threw', {
              url: requestedUrl,
              method: method,
              durationMs: Date.now() - startedAt,
              error: formatError(error)
            });
          }
          throw error;
        });
    };
  }

  var patchAudioWorkletDiagnostics = function () {
    var ctor = typeof window.AudioWorklet === 'function' ? window.AudioWorklet : null;
    if (!ctor || !ctor.prototype || typeof ctor.prototype.addModule !== 'function') {
      return;
    }
    var originalAddModule = ctor.prototype.addModule;
    if (originalAddModule.__xtrataWrapped) {
      return;
    }
    var wrappedAddModule = function (moduleUrl, options) {
      var startedAt = Date.now();
      log('debug', 'AudioWorklet.addModule called', {
        url:
          typeof moduleUrl === 'string'
            ? moduleUrl
            : moduleUrl && typeof moduleUrl.toString === 'function'
              ? moduleUrl.toString()
              : String(moduleUrl || ''),
        relative:
          typeof moduleUrl === 'string' &&
          /^(?:\.{1,2}\/)/.test(moduleUrl),
        baseHref:
          document && document.baseURI ? document.baseURI : window.location.href
      });
      return originalAddModule.call(this, moduleUrl, options)
        .then(function (result) {
          log('debug', 'AudioWorklet.addModule resolved', {
            url:
              typeof moduleUrl === 'string'
                ? moduleUrl
                : moduleUrl && typeof moduleUrl.toString === 'function'
                  ? moduleUrl.toString()
                  : String(moduleUrl || ''),
            durationMs: Date.now() - startedAt
          });
          return result;
        })
        .catch(function (error) {
          log('warn', 'AudioWorklet.addModule failed', {
            url:
              typeof moduleUrl === 'string'
                ? moduleUrl
                : moduleUrl && typeof moduleUrl.toString === 'function'
                  ? moduleUrl.toString()
                  : String(moduleUrl || ''),
            durationMs: Date.now() - startedAt,
            error: formatError(error)
          });
          throw error;
        });
    };
    wrappedAddModule.__xtrataWrapped = true;
    ctor.prototype.addModule = wrappedAddModule;
  };

  var patchWorkerDiagnostics = function () {
    var patchConstructor = function (name) {
      var Original = window[name];
      if (typeof Original !== 'function') {
        return;
      }
      if (Original.__xtrataWrapped) {
        return;
      }
      var Wrapped = function (url, options) {
        var resolvedUrl =
          typeof url === 'string'
            ? url
            : url && typeof url.toString === 'function'
              ? url.toString()
              : String(url || '');
        log('debug', name + ' constructed', {
          url: resolvedUrl,
          relative: typeof url === 'string' && /^(?:\.{1,2}\/)/.test(url),
          baseHref:
            document && document.baseURI ? document.baseURI : window.location.href
        });
        var worker = new Original(url, options);
        if (worker && typeof worker.addEventListener === 'function') {
          worker.addEventListener('error', function (event) {
            log('warn', name + ' error event', {
              url: resolvedUrl,
              message: event && event.message ? event.message : ''
            });
          });
          worker.addEventListener('messageerror', function () {
            log('warn', name + ' messageerror event', {
              url: resolvedUrl
            });
          });
        }
        return worker;
      };
      Wrapped.prototype = Original.prototype;
      try {
        Object.setPrototypeOf(Wrapped, Original);
      } catch (error) {}
      Wrapped.__xtrataWrapped = true;
      window[name] = Wrapped;
    };

    patchConstructor('Worker');
    patchConstructor('SharedWorker');
  };

  if (typeof WebAssembly === 'object' && WebAssembly) {
    if (typeof WebAssembly.instantiateStreaming === 'function') {
      var originalInstantiateStreaming =
        WebAssembly.instantiateStreaming.bind(WebAssembly);
      WebAssembly.instantiateStreaming = function (source, imports) {
        return originalInstantiateStreaming(source, imports).catch(function (error) {
          log('warn', 'WebAssembly.instantiateStreaming failed', {
            error: formatError(error)
          });
          throw error;
        });
      };
    }
    if (typeof WebAssembly.instantiate === 'function') {
      var originalInstantiate = WebAssembly.instantiate.bind(WebAssembly);
      WebAssembly.instantiate = function (source, imports) {
        try {
          var result = originalInstantiate(source, imports);
          if (result && typeof result.then === 'function') {
            return result.catch(function (error) {
              log('warn', 'WebAssembly.instantiate failed', {
                error: formatError(error)
              });
              throw error;
            });
          }
          return result;
        } catch (error) {
          log('warn', 'WebAssembly.instantiate threw', {
            error: formatError(error)
          });
          throw error;
        }
      };
    }
  }

  log('debug', 'Runtime diagnostics installed', {
    href: window.location.href,
    referrer: document.referrer || ''
  });
  patchAudioWorkletDiagnostics();
  patchWorkerDiagnostics();
  scanExistingResources('install');
  logContainerSnapshot('install');
  observeContainer();
  observeBodyForContainer();
  window.addEventListener('load', function () {
    scanExistingResources('window-load');
    logContainerSnapshot('window-load');
    observeContainer();
  });
  setTimeout(function () {
    scanExistingResources('t+1500ms');
    logContainerSnapshot('t+1500ms');
    observeContainer();
  }, 1500);
  setTimeout(function () {
    scanExistingResources('t+4000ms');
    logContainerSnapshot('t+4000ms');
    observeContainer();
  }, 4000);
})();
