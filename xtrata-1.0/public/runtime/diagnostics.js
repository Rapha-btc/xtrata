(function () {
  if (typeof window === 'undefined') {
    return;
  }
  if (window.__xtrataRuntimeDiagnostics) {
    return;
  }

  var MAX_EVENTS = 200;
  var state = {
    version: 'v1',
    events: []
  };
  window.__xtrataRuntimeDiagnostics = state;

  function trimEvents() {
    while (state.events.length > MAX_EVENTS) {
      state.events.shift();
    }
  }

  function record(level, message, detail) {
    state.events.push({
      at: Date.now(),
      level: level,
      message: message,
      detail: detail || null
    });
    trimEvents();
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
})();
