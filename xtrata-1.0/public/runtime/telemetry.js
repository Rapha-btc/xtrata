(function () {
  if (typeof window === 'undefined') {
    return;
  }
  if (window.__xtrataRuntimeReportDiagnostic) {
    return;
  }

  var MAX_EVENTS = 400;
  var telemetry = window.__xtrataRuntimeTelemetry || {
    version: 'v1',
    events: []
  };
  window.__xtrataRuntimeTelemetry = telemetry;

  function trimEvents() {
    while (telemetry.events.length > MAX_EVENTS) {
      telemetry.events.shift();
    }
  }

  function dispatchToParent(entry) {
    try {
      if (!window.parent || window.parent === window) {
        return;
      }
      window.parent.postMessage(
        {
          type: 'xtrata:runtime:diag',
          entry: entry
        },
        '*'
      );
    } catch (error) {}
  }

  function dispatchDomEvent(entry) {
    try {
      window.dispatchEvent(
        new CustomEvent('xtrata:runtime:diag', {
          detail: entry
        })
      );
    } catch (error) {}
  }

  window.__xtrataRuntimeReportDiagnostic = function (entry) {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    telemetry.events.push(entry);
    trimEvents();
    dispatchToParent(entry);
    dispatchDomEvent(entry);
  };
})();
