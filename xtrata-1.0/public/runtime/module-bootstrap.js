(function () {
  if (typeof window === 'undefined') {
    return;
  }
  if (window.__xtrataRuntimeModuleBootstrap) {
    return;
  }

  var state = {
    replayed: false
  };
  window.__xtrataRuntimeModuleBootstrap = state;

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

  function toArray(list) {
    return Array.prototype.slice.call(list || []);
  }

  function getInlineModuleScripts() {
    return toArray(document.querySelectorAll('script[type="module"]')).filter(function (node) {
      return (
        !!node &&
        !node.src &&
        !node.hasAttribute('data-xtrata-runtime-replayed')
      );
    });
  }

  function readScriptInventory() {
    return getInlineModuleScripts().map(function (node, index) {
      var text = '';
      try {
        text = (node.textContent || '').trim().slice(0, 180);
      } catch (error) {}
      return {
        index: index,
        textPreview: text
      };
    });
  }

  function hasModuleResourceActivity() {
    if (
      typeof performance === 'undefined' ||
      !performance ||
      typeof performance.getEntriesByType !== 'function'
    ) {
      return false;
    }
    try {
      var entries = performance.getEntriesByType('resource') || [];
      for (var index = 0; index < entries.length; index += 1) {
        var entry = entries[index];
        var name = entry && entry.name ? String(entry.name) : '';
        if (!name) {
          continue;
        }
        if (name.indexOf('/runtime/modules/') !== -1) {
          return true;
        }
      }
    } catch (error) {}
    return false;
  }

  function readContainerState() {
    var container = document.getElementById('app-container');
    if (!container) {
      return {
        found: false
      };
    }
    return {
      found: true,
      childCount:
        typeof container.childElementCount === 'number'
          ? container.childElementCount
          : 0,
      textLength:
        typeof container.textContent === 'string'
          ? container.textContent.trim().length
          : 0
    };
  }

  function shouldReplayInlineModules() {
    if (state.replayed) {
      return false;
    }
    if (hasModuleResourceActivity()) {
      return false;
    }
    var container = readContainerState();
    if (container.found && (container.childCount > 0 || container.textLength > 0)) {
      return false;
    }
    return getInlineModuleScripts().length > 0;
  }

  function replayInlineModules(reason) {
    if (!shouldReplayInlineModules()) {
      return;
    }
    state.replayed = true;
    var scripts = getInlineModuleScripts();
    log('warn', 'Replaying inline module bootstrap scripts', {
      reason: reason,
      count: scripts.length,
      scripts: readScriptInventory()
    });
    scripts.forEach(function (node) {
      var clone = document.createElement('script');
      clone.type = 'module';
      clone.setAttribute('data-xtrata-runtime-replayed', 'true');
      clone.textContent = node.textContent || '';
      if (node.parentNode) {
        node.parentNode.insertBefore(clone, node.nextSibling);
      } else if (document.body) {
        document.body.appendChild(clone);
      } else if (document.head) {
        document.head.appendChild(clone);
      }
    });
  }

  function inspect(reason) {
    log('debug', 'Inline module bootstrap inventory', {
      reason: reason,
      scripts: readScriptInventory(),
      container: readContainerState(),
      hasModuleResourceActivity: hasModuleResourceActivity()
    });
  }

  log('debug', 'Runtime module bootstrap installed');
  inspect('install');
  window.addEventListener('load', function () {
    inspect('window-load');
    window.setTimeout(function () {
      replayInlineModules('window-load');
    }, 250);
  });
  window.setTimeout(function () {
    inspect('t+1500ms');
    replayInlineModules('t+1500ms');
  }, 1500);
})();
