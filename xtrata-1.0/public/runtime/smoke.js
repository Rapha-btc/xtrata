(function () {
  if (typeof window === 'undefined') {
    return;
  }

  var runtimeUrlInput = document.getElementById('runtime-url');
  var loadButton = document.getElementById('load-button');
  var copyButton = document.getElementById('copy-button');
  var resetButton = document.getElementById('reset-button');
  var runtimeFrame = document.getElementById('runtime-frame');
  var statusEl = document.getElementById('status');
  var countsEl = document.getElementById('counts');
  var failureEl = document.getElementById('failure');
  var milestonesEl = document.getElementById('milestones');
  var eventsEl = document.getElementById('events');

  var MAX_EVENTS = 30;
  var events = [];

  function getString(value) {
    return typeof value === 'string' ? value : '';
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

  function summarizePayload(value) {
    try {
      return JSON.stringify(value, null, 2);
    } catch (error) {
      return String(value || '');
    }
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
    syncUi();
  }

  function loadRuntime(url) {
    if (!url) {
      return;
    }
    resetEvents();
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
    events.push(event.data.entry || {});
    syncUi();
  });

  loadButton.addEventListener('click', function () {
    loadRuntime(runtimeUrlInput.value.trim());
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
    getSummary: summarize
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
