(function () {
  if (typeof window === 'undefined') {
    return;
  }

  var runtimeUrlInput = document.getElementById('runtime-url');
  var loadButton = document.getElementById('load-button');
  var inspectButton = document.getElementById('inspect-button');
  var initButton = document.getElementById('init-button');
  var copyButton = document.getElementById('copy-button');
  var resetButton = document.getElementById('reset-button');
  var actionStatusEl = document.getElementById('action-status');
  var runtimeFrame = document.getElementById('runtime-frame');
  var statusEl = document.getElementById('status');
  var countsEl = document.getElementById('counts');
  var failureEl = document.getElementById('failure');
  var milestonesEl = document.getElementById('milestones');
  var eventsEl = document.getElementById('events');

  var MAX_EVENTS = 30;
  var events = [];
  var seenEventKeys = Object.create(null);

  function getString(value) {
    return typeof value === 'string' ? value : '';
  }

  function toArray(value) {
    return Array.prototype.slice.call(value || []);
  }

  function normalizeText(value) {
    return getString(value)
      .replace(/\s+/g, ' ')
      .trim();
  }

  function setActionStatus(message, tone) {
    if (!actionStatusEl) {
      return;
    }
    actionStatusEl.textContent = message || '';
    actionStatusEl.className =
      'action-status' + (tone ? ' action-status-' + tone : '');
  }

  function summarizePayload(value) {
    try {
      return JSON.stringify(value, null, 2);
    } catch (error) {
      return String(value || '');
    }
  }

  function buildEventKey(entry) {
    return [
      String(entry && entry.at ? entry.at : ''),
      getString(entry && entry.level),
      getString(entry && entry.message),
      summarizePayload(entry && entry.detail)
    ].join('|');
  }

  function appendEvent(entry) {
    if (!entry || typeof entry !== 'object') {
      return false;
    }
    var key = buildEventKey(entry);
    if (seenEventKeys[key]) {
      return false;
    }
    seenEventKeys[key] = true;
    events.push(entry);
    return true;
  }

  function recordHarnessEvent(message, detail, level) {
    appendEvent({
      at: Date.now(),
      level: level || 'info',
      message: message,
      detail: detail || null
    });
    syncUi();
  }

  function getDetailUrl(detail) {
    if (!detail || typeof detail !== 'object') {
      return '';
    }
    return getString(detail.responseUrl) || getString(detail.url);
  }

  function includesPath(detail, pathFragment) {
    return getDetailUrl(detail).indexOf(pathFragment) !== -1;
  }

  function summarize() {
    var milestones = {
      diagnosticsInstalled: false,
      bootstrapInstalled: false,
      patchLoaded: false,
      manifestLoaded: false,
      audioContextRunning: false,
      workletRequested: false,
      workletLoaded: false,
      workletNodeCreated: false,
      destinationConnected: false
    };
    var primaryFailure = null;

    for (var index = 0; index < events.length; index += 1) {
      var event = events[index] || {};
      var message = getString(event.message);
      var detail = event.detail || null;
      if (message === 'Runtime diagnostics installed') {
        milestones.diagnosticsInstalled = true;
      }
      if (message === 'Runtime module bootstrap installed') {
        milestones.bootstrapInstalled = true;
      }
      if (message === 'Tracked fetch completed' && includesPath(detail, '/patch.json')) {
        milestones.patchLoaded = true;
      }
      if (message === 'Tracked fetch completed' && includesPath(detail, '/manifest.json')) {
        milestones.manifestLoaded = true;
      }
      if (
        (message === 'AudioContext created' ||
          message === 'AudioContext state changed' ||
          message === 'AudioContext resume resolved') &&
        getString(detail && detail.state) === 'running'
      ) {
        milestones.audioContextRunning = true;
      }
      if (message === 'AudioWorklet.addModule called') {
        milestones.workletRequested = true;
      }
      if (message === 'AudioWorklet.addModule resolved') {
        milestones.workletLoaded = true;
      }
      if (message === 'AudioWorkletNode created') {
        milestones.workletNodeCreated = true;
      }
      if (
        message === 'AudioNode connect' &&
        (getString(detail && detail.destination) === 'AudioDestinationNode' ||
          getString(detail && detail.destination) === 'GainNode')
      ) {
        milestones.destinationConnected = true;
      }
      if (
        !primaryFailure &&
        (message === 'AudioWorklet.addModule failed' ||
          message === 'AudioWorkletNode processorerror' ||
          message === 'Unhandled runtime rejection' ||
          message === 'Tracked fetch failed')
      ) {
        primaryFailure =
          getString(detail && detail.error) ||
          getString(detail && detail.message) ||
          message;
      }
    }

    var passed = Object.keys(milestones).filter(function (key) {
      return milestones[key];
    }).length;
    var total = Object.keys(milestones).length;
    var status = 'pending';
    if (primaryFailure) {
      status = 'fail';
    } else if (
      milestones.diagnosticsInstalled &&
      milestones.patchLoaded &&
      milestones.manifestLoaded &&
      milestones.audioContextRunning &&
      milestones.workletRequested &&
      milestones.workletLoaded &&
      milestones.workletNodeCreated
    ) {
      status = 'pass';
    }

    return {
      status: status,
      primaryFailure: primaryFailure,
      milestones: milestones,
      milestoneCounts: {
        passed: passed,
        total: total
      }
    };
  }

  function renderSummary() {
    var summary = summarize();
    statusEl.textContent =
      summary.status === 'pass'
        ? 'Pass'
        : summary.status === 'fail'
          ? 'Fail'
          : 'Pending';
    statusEl.className = 'status status-' + summary.status;
    countsEl.textContent =
      summary.milestoneCounts.passed + ' / ' + summary.milestoneCounts.total + ' milestones';
    failureEl.textContent = summary.primaryFailure || 'None';
    milestonesEl.innerHTML = '';
    Object.keys(summary.milestones).forEach(function (key) {
      var row = document.createElement('div');
      row.className = 'milestone';
      var label = document.createElement('strong');
      label.textContent = key;
      var badge = document.createElement('span');
      badge.className =
        'badge ' + (summary.milestones[key] ? 'badge-pass' : 'badge-pending');
      badge.textContent = summary.milestones[key] ? 'Pass' : 'Pending';
      row.appendChild(label);
      row.appendChild(badge);
      milestonesEl.appendChild(row);
    });
  }

  function renderEvents() {
    eventsEl.innerHTML = '';
    var visibleEvents = events.slice(-MAX_EVENTS).reverse();
    visibleEvents.forEach(function (entry) {
      var node = document.createElement('div');
      node.className = 'event';
      var header = document.createElement('div');
      header.className = 'event-header';
      var title = document.createElement('strong');
      title.textContent = getString(entry.message) || 'Runtime event';
      var meta = document.createElement('small');
      meta.textContent =
        getString(entry.level || 'debug').toUpperCase() +
        ' • ' +
        new Date(entry.at || Date.now()).toLocaleTimeString();
      header.appendChild(title);
      header.appendChild(meta);
      node.appendChild(header);
      if (entry.detail != null) {
        var detail = document.createElement('pre');
        detail.textContent = summarizePayload(entry.detail);
        node.appendChild(detail);
      }
      eventsEl.appendChild(node);
    });
  }

  function syncUi() {
    renderSummary();
    renderEvents();
  }

  function resetEvents() {
    events = [];
    seenEventKeys = Object.create(null);
    syncUi();
  }

  function getRuntimeWindow() {
    return runtimeFrame && runtimeFrame.contentWindow
      ? runtimeFrame.contentWindow
      : null;
  }

  function getRuntimeDocument() {
    var runtimeWindow = getRuntimeWindow();
    return runtimeWindow && runtimeWindow.document ? runtimeWindow.document : null;
  }

  function pullRuntimeTelemetrySnapshot(reason) {
    try {
      var runtimeWindow = getRuntimeWindow();
      var telemetry =
        runtimeWindow &&
        runtimeWindow.__xtrataRuntimeTelemetry &&
        runtimeWindow.__xtrataRuntimeTelemetry.events;
      if (!telemetry || typeof telemetry.length !== 'number') {
        return 0;
      }
      var added = 0;
      for (var index = 0; index < telemetry.length; index += 1) {
        if (appendEvent(telemetry[index])) {
          added += 1;
        }
      }
      if (added > 0) {
        recordHarnessEvent('Smoke harness pulled runtime telemetry', {
          reason: reason,
          count: added
        }, 'debug');
      } else {
        syncUi();
      }
      return added;
    } catch (error) {
      setActionStatus(
        'Unable to read runtime telemetry snapshot: ' + getString(error && error.message),
        'fail'
      );
      return 0;
    }
  }

  function readSelectControls(doc) {
    return toArray(doc.querySelectorAll('select')).map(function (node, index) {
      var options = toArray(node.options || []).map(function (option, optionIndex) {
        return {
          optionIndex: optionIndex,
          text: normalizeText(option.textContent || option.label || ''),
          value: getString(option.value),
          disabled: !!option.disabled,
          selected: !!option.selected
        };
      });
      return {
        kind: 'select',
        index: index,
        selectedIndex:
          typeof node.selectedIndex === 'number' ? node.selectedIndex : -1,
        selectedText:
          normalizeText(
            node.options &&
              node.selectedIndex >= 0 &&
              node.options[node.selectedIndex]
              ? node.options[node.selectedIndex].textContent
              : ''
          ),
        optionCount: options.length,
        options: options.slice(0, 12)
      };
    });
  }

  function readClickableControls(doc) {
    var selector = [
      'button',
      '[role="button"]',
      '[role="option"]',
      '[role="tab"]',
      '[data-value]',
      '[data-preset]'
    ].join(',');
    return toArray(doc.querySelectorAll(selector))
      .map(function (node, index) {
        var text = normalizeText(
          node.textContent || node.getAttribute('aria-label') || ''
        );
        if (!text) {
          return null;
        }
        return {
          kind: 'clickable',
          index: index,
          text: text,
          disabled:
            !!node.disabled ||
            node.getAttribute('aria-disabled') === 'true'
        };
      })
      .filter(Boolean)
      .slice(0, 20);
  }

  function inspectControls() {
    var doc = getRuntimeDocument();
    if (!doc) {
      var missing = {
        status: 'runtime document unavailable'
      };
      recordHarnessEvent('Smoke harness inspected controls', missing, 'warn');
      setActionStatus('Runtime document unavailable.', 'fail');
      return missing;
    }
    var payload = {
      selects: readSelectControls(doc),
      clickables: readClickableControls(doc)
    };
    recordHarnessEvent('Smoke harness inspected controls', payload, 'debug');
    setActionStatus(
      'Inspected ' +
        String(payload.selects.length) +
        ' select(s) and ' +
        String(payload.clickables.length) +
        ' clickable control(s).',
      'okay'
    );
    return payload;
  }

  function dispatchSelectEvents(node) {
    try {
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (error) {}
  }

  function scheduleTelemetryPulls(reason) {
    pullRuntimeTelemetrySnapshot(reason + '-immediate');
    window.setTimeout(function () {
      pullRuntimeTelemetrySnapshot(reason + '+100ms');
    }, 100);
    window.setTimeout(function () {
      pullRuntimeTelemetrySnapshot(reason + '+750ms');
    }, 750);
    window.setTimeout(function () {
      pullRuntimeTelemetrySnapshot(reason + '+2000ms');
    }, 2000);
  }

  function applySelectOption(selectNode, optionIndex) {
    if (!selectNode || typeof optionIndex !== 'number' || optionIndex < 0) {
      return null;
    }
    var optionNode =
      selectNode.options && selectNode.options[optionIndex]
        ? selectNode.options[optionIndex]
        : null;
    if (!optionNode) {
      return null;
    }
    selectNode.selectedIndex = optionIndex;
    selectNode.value = optionNode.value;
    dispatchSelectEvents(selectNode);
    return {
      optionIndex: optionIndex,
      optionText: normalizeText(
        optionNode.textContent || optionNode.label || optionNode.value || ''
      ),
      value: getString(optionNode.value)
    };
  }

  function triggerInit() {
    var doc = getRuntimeDocument();
    if (!doc) {
      setActionStatus('Runtime document unavailable.', 'fail');
      recordHarnessEvent('Smoke harness trigger init failed', {
        reason: 'runtime document unavailable'
      }, 'warn');
      return {
        ok: false,
        reason: 'runtime document unavailable'
      };
    }

    var selects = toArray(doc.querySelectorAll('select'));
    for (var selectIndex = 0; selectIndex < selects.length; selectIndex += 1) {
      var selectNode = selects[selectIndex];
      var options = toArray(selectNode.options || []);
      for (var optionIndex = 0; optionIndex < options.length; optionIndex += 1) {
        var optionNode = options[optionIndex];
        var optionText = normalizeText(
          optionNode.textContent || optionNode.label || ''
        );
        if (!optionText || optionNode.disabled) {
          continue;
        }
        if (/(\binit\b|^init$)/i.test(optionText)) {
          var wasAlreadySelected =
            typeof selectNode.selectedIndex === 'number' &&
            selectNode.selectedIndex === optionIndex;
          var toggledFrom = null;
          if (wasAlreadySelected) {
            for (
              var fallbackIndex = 0;
              fallbackIndex < options.length;
              fallbackIndex += 1
            ) {
              var fallbackOption = options[fallbackIndex];
              var fallbackText = normalizeText(
                fallbackOption &&
                  (fallbackOption.textContent ||
                    fallbackOption.label ||
                    fallbackOption.value ||
                    '')
              );
              if (
                fallbackIndex !== optionIndex &&
                fallbackOption &&
                !fallbackOption.disabled &&
                fallbackText
              ) {
                toggledFrom = applySelectOption(selectNode, fallbackIndex);
                break;
              }
            }
          }
          var applied = applySelectOption(selectNode, optionIndex);
          var selectResult = {
            ok: true,
            action: wasAlreadySelected
              ? 'toggle-then-select-option'
              : 'select-option',
            optionText: applied ? applied.optionText : optionText,
            selectIndex: selectIndex,
            optionIndex: optionIndex,
            reselected: wasAlreadySelected,
            toggledFrom: toggledFrom
          };
          recordHarnessEvent('Smoke harness triggered init', selectResult, 'info');
          setActionStatus(
            wasAlreadySelected
              ? 'Retoggled preset select and returned to Init.'
              : 'Triggered init via preset select: ' + optionText,
            'okay'
          );
          scheduleTelemetryPulls('trigger-init-select');
          return selectResult;
        }
      }
    }

    var clickableSelector = [
      'button',
      '[role="button"]',
      '[role="option"]',
      '[role="tab"]',
      '[data-value]',
      '[data-preset]'
    ].join(',');
    var clickables = toArray(doc.querySelectorAll(clickableSelector));
    for (var clickableIndex = 0; clickableIndex < clickables.length; clickableIndex += 1) {
      var clickable = clickables[clickableIndex];
      var clickableText = normalizeText(
        clickable.textContent || clickable.getAttribute('aria-label') || ''
      );
      if (!clickableText) {
        continue;
      }
      if (/(\binit\b|^init$)/i.test(clickableText)) {
        clickable.click();
        var clickResult = {
          ok: true,
          action: 'click-control',
          text: clickableText,
          controlIndex: clickableIndex
        };
        recordHarnessEvent('Smoke harness triggered init', clickResult, 'info');
        setActionStatus('Triggered init via clickable control: ' + clickableText, 'okay');
        scheduleTelemetryPulls('trigger-init-click');
        return clickResult;
      }
    }

    var miss = {
      ok: false,
      reason: 'init control not found',
      controls: inspectControls()
    };
    recordHarnessEvent('Smoke harness trigger init failed', miss, 'warn');
    setActionStatus('No init control found. Use Inspect Controls.', 'warn');
    return miss;
  }

  function loadRuntime(url) {
    if (!url) {
      return;
    }
    resetEvents();
    setActionStatus('Loading runtime...', '');
    runtimeFrame.src = url;
    var search = new URLSearchParams(window.location.search);
    search.set('runtimeUrl', url);
    history.replaceState(null, '', window.location.pathname + '?' + search.toString());
  }

  function copySummary() {
    var payload = {
      runtimeUrl: runtimeFrame.src || '',
      summary: summarize(),
      recentEvents: events.slice(-20)
    };
    var text = JSON.stringify(payload, null, 2);
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).catch(function () {});
    }
  }

  window.addEventListener('message', function (event) {
    if (!event || !event.data || event.data.type !== 'xtrata:runtime:diag') {
      return;
    }
    if (runtimeFrame && runtimeFrame.contentWindow && event.source !== runtimeFrame.contentWindow) {
      return;
    }
    if (event.origin !== window.location.origin) {
      return;
    }
    appendEvent(event.data.entry || {});
    syncUi();
  });

  runtimeFrame.addEventListener('load', function () {
    setActionStatus('Runtime loaded. Inspect controls or trigger init.', '');
    pullRuntimeTelemetrySnapshot('iframe-load');
    window.setTimeout(function () {
      pullRuntimeTelemetrySnapshot('iframe-load+750ms');
    }, 750);
    window.setTimeout(function () {
      pullRuntimeTelemetrySnapshot('iframe-load+2000ms');
    }, 2000);
  });

  loadButton.addEventListener('click', function () {
    loadRuntime(runtimeUrlInput.value.trim());
  });
  inspectButton.addEventListener('click', function () {
    inspectControls();
  });
  initButton.addEventListener('click', function () {
    triggerInit();
  });
  copyButton.addEventListener('click', function () {
    copySummary();
  });
  resetButton.addEventListener('click', function () {
    resetEvents();
  });

  window.__xtrataRuntimeSmoke = {
    load: loadRuntime,
    getEvents: function () {
      return events.slice();
    },
    getSummary: summarize,
    inspectControls: inspectControls,
    triggerInit: triggerInit,
    pullRuntimeTelemetrySnapshot: pullRuntimeTelemetrySnapshot
  };

  var query = new URLSearchParams(window.location.search || '');
  var initialRuntimeUrl = query.get('runtimeUrl') || '';
  if (initialRuntimeUrl) {
    runtimeUrlInput.value = initialRuntimeUrl;
    loadRuntime(initialRuntimeUrl);
  } else {
    syncUi();
  }
})();
