/* Test Utilities */
var TestUtils = (function(){
  /* Async wait helper */
  function wait(ms){
    return new Promise(function(resolve){ setTimeout(resolve, ms); });
  }

  /* Track rAF calls */
  var originalRAF = window.requestAnimationFrame;
  var originalCAF = window.cancelAnimationFrame;
  var originalSetInterval = window.setInterval;
  var originalClearInterval = window.clearInterval;
  var originalSetTimeout = window.setTimeout;
  var originalClearTimeout = window.clearTimeout;
  var originalAddEvent = document.addEventListener.bind(document);
  var originalRemoveEvent = document.removeEventListener.bind(document);

  var activeRAFs = 0;
  var activeIntervals = new Set();
  var activeTimeouts = new Set();
  var activeListeners = 0;
  var instrumenting = false;

  function startInstrumentation(){
    activeRAFs = 0;
    activeIntervals.clear();
    activeTimeouts.clear();
    activeListeners = 0;
    instrumenting = true;

    window.requestAnimationFrame = function(cb){
      activeRAFs++;
      return originalRAF(function(t){
        activeRAFs--;
        cb(t);
      });
    };
    window.cancelAnimationFrame = function(id){
      if(id) activeRAFs = Math.max(0, activeRAFs - 1);
      return originalCAF(id);
    };

    window.setInterval = function(fn, ms){
      var id = originalSetInterval(fn, ms);
      activeIntervals.add(id);
      return id;
    };
    window.clearInterval = function(id){
      activeIntervals.delete(id);
      return originalClearInterval(id);
    };

    window.setTimeout = function(fn, ms){
      var id = originalSetTimeout(function(){
        activeTimeouts.delete(id);
        fn();
      }, ms);
      activeTimeouts.add(id);
      return id;
    };
    window.clearTimeout = function(id){
      activeTimeouts.delete(id);
      return originalClearTimeout(id);
    };
  }

  function stopInstrumentation(){
    instrumenting = false;
    window.requestAnimationFrame = originalRAF;
    window.cancelAnimationFrame = originalCAF;
    window.setInterval = originalSetInterval;
    window.clearInterval = originalClearInterval;
    window.setTimeout = originalSetTimeout;
    window.clearTimeout = originalClearTimeout;
  }

  function getActiveCount(){
    return {
      rafs: activeRAFs,
      intervals: activeIntervals.size,
      timeouts: activeTimeouts.size
    };
  }

  /* Simple assertion helpers */
  function assert(cond, msg){
    if(!cond) throw new Error('Assertion failed: ' + (msg || ''));
  }
  function assertEqual(a, b, msg){
    if(a !== b) throw new Error('Expected ' + JSON.stringify(a) + ' === ' + JSON.stringify(b) + (msg ? ' : '+msg : ''));
  }
  function assertTrue(v, msg){ assert(!!v, msg); }
  function assertFalse(v, msg){ assert(!v, msg); }

  return {
    wait: wait,
    startInstrumentation: startInstrumentation,
    stopInstrumentation: stopInstrumentation,
    getActiveCount: getActiveCount,
    assert: assert,
    assertEqual: assertEqual,
    assertTrue: assertTrue,
    assertFalse: assertFalse
  };
})();
