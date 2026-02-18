/* Shared High Scores Module */
var HighScores = (function(){
  var STORAGE_KEY = 'retro_arcade_scores';
  var MAX_ENTRIES = 10;

  function _load(){
    try{
      var d = localStorage.getItem(STORAGE_KEY);
      return d ? JSON.parse(d) : {};
    }catch(e){ return {}; }
  }
  function _save(data){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }catch(e){}
  }

  function _key(gameId, mode){ return gameId + '_' + (mode||'score'); }

  function getTop10(gameId, mode){
    var data = _load();
    var k = _key(gameId, mode);
    return (data[k] || []).slice(0, MAX_ENTRIES);
  }

  function _qualifies(gameId, mode, value){
    var list = getTop10(gameId, mode);
    if(list.length < MAX_ENTRIES) return true;
    if(mode === 'time'){
      return value < list[list.length-1].score;
    }
    return value > list[list.length-1].score;
  }

  function _addEntry(gameId, mode, name, value){
    var data = _load();
    var k = _key(gameId, mode);
    if(!data[k]) data[k] = [];
    var entry = { name: name, score: value, date: new Date().toISOString() };
    data[k].push(entry);
    if(mode === 'time'){
      data[k].sort(function(a,b){ return a.score - b.score; });
    } else {
      data[k].sort(function(a,b){ return b.score - a.score; });
    }
    data[k] = data[k].slice(0, MAX_ENTRIES);
    _save(data);
    return data[k].indexOf(entry);
  }

  function getBest(gameId, mode){
    var list = getTop10(gameId, mode);
    if(list.length === 0) return null;
    return list[0].score;
  }

  /* Name entry + overlay */
  function _createOverlayEl(){
    var ov = document.createElement('div');
    ov.className = 'hs-overlay';
    return ov;
  }

  function _promptName(resolve){
    var ov = _createOverlayEl();
    var modal = document.createElement('div');
    modal.className = 'hs-modal';
    modal.innerHTML = '<h2>NEW HIGH SCORE!</h2>' +
      '<div class="hs-new">Congratulations!</div>' +
      '<div class="hs-name-entry">' +
      '<label>Enter your name (3-12 chars)</label>' +
      '<input type="text" id="hs-name-input" maxlength="12" placeholder="AAA">' +
      '<button id="hs-name-ok">OK</button>' +
      '</div>';
    ov.appendChild(modal);
    document.body.appendChild(ov);
    var inp = document.getElementById('hs-name-input');
    var btn = document.getElementById('hs-name-ok');
    inp.focus();
    function submit(){
      var n = inp.value.trim();
      if(n.length < 3) n = n + 'AAA'.substring(0, 3 - n.length);
      if(n.length > 12) n = n.substring(0,12);
      document.body.removeChild(ov);
      resolve(n);
    }
    btn.onclick = submit;
    inp.onkeydown = function(e){ if(e.key==='Enter') submit(); };
  }

  function renderOverlay(opts){
    var gameId = opts.gameId;
    var mode = opts.mode || 'score';
    var highlightIdx = opts.highlightIdx != null ? opts.highlightIdx : -1;
    var list = getTop10(gameId, mode);

    var ov = _createOverlayEl();
    var modal = document.createElement('div');
    modal.className = 'hs-modal';
    var isTime = mode === 'time';
    var h = '<h2>Top 10 — ' + (opts.title || gameId) + '</h2>';
    if(highlightIdx >= 0) h += '<div class="hs-new">★ NEW HIGH SCORE ★</div>';
    h += '<table class="hs-table"><tr><th>#</th><th>Name</th><th>' + (isTime?'Time':'Score') + '</th></tr>';
    for(var i=0;i<list.length;i++){
      var cls = i===highlightIdx ? ' class="hs-highlight"' : '';
      var val = isTime ? ArcadeUtils.formatTime(list[i].score) : ArcadeUtils.formatScore(list[i].score);
      h += '<tr'+cls+'><td class="rank">'+(i+1)+'</td><td class="name">'+list[i].name+'</td><td class="score-col">'+val+'</td></tr>';
    }
    if(list.length===0) h += '<tr><td colspan="3" style="color:#555">No scores yet</td></tr>';
    h += '</table>';
    h += '<button class="hs-close-btn" id="hs-close">Close</button>';
    modal.innerHTML = h;
    ov.appendChild(modal);
    document.body.appendChild(ov);
    document.getElementById('hs-close').onclick = function(){ hideOverlay(); };
    ov.onclick = function(e){ if(e.target===ov) hideOverlay(); };
    return ov;
  }

  function hideOverlay(){
    var ovs = document.querySelectorAll('.hs-overlay');
    ovs.forEach(function(o){ try{document.body.removeChild(o);}catch(e){} });
  }

  function maybeSubmit(opts){
    var gameId = opts.gameId;
    var score = opts.score;
    var mode = opts.mode || 'score';
    var title = opts.title || gameId;

    return new Promise(function(resolve){
      if(_qualifies(gameId, mode, score)){
        _promptName(function(name){
          var idx = _addEntry(gameId, mode, name, score);
          renderOverlay({ gameId:gameId, mode:mode, title:title, highlightIdx:idx });
          resolve({ submitted:true, rank:idx+1 });
        });
      } else {
        renderOverlay({ gameId:gameId, mode:mode, title:title, highlightIdx:-1 });
        resolve({ submitted:false });
      }
    });
  }

  function clearAll(){
    try{ localStorage.removeItem(STORAGE_KEY); }catch(e){}
  }

  return {
    getTop10: getTop10,
    getBest: getBest,
    maybeSubmit: maybeSubmit,
    renderOverlay: renderOverlay,
    hideOverlay: hideOverlay,
    clearAll: clearAll,
    _qualifies: _qualifies,
    _addEntry: _addEntry
  };
})();
