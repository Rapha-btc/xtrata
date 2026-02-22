/* Shared utilities */
var ArcadeUtils = (function(){
  function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
  function randInt(min, max){ return Math.floor(Math.random()*(max-min+1))+min; }
  function randFloat(min, max){ return Math.random()*(max-min)+min; }

  /* Seeded RNG (mulberry32) */
  function SeededRNG(seed){
    var s = seed|0;
    this.next = function(){
      s |= 0; s = s + 0x6D2B79F5 | 0;
      var t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    this.nextInt = function(min, max){ return Math.floor(this.next()*(max-min+1))+min; };
  }

  function formatScore(n){
    if(n==null) return '--';
    return n.toLocaleString();
  }
  function formatTime(ms){
    if(ms==null) return '--';
    var s = Math.floor(ms/1000);
    var m = Math.floor(s/60);
    s = s%60;
    var cs = Math.floor((ms%1000)/10);
    return (m<10?'0':'')+m+':'+(s<10?'0':'')+s+'.'+(cs<10?'0':'')+cs;
  }

  /* Simple WebAudio beep */
  var audioCtx = null;
  var soundEnabled = true;
  function initAudio(){
    if(!audioCtx){
      try{ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){}
    }
  }
  function beep(freq, dur, type, vol){
    if(!soundEnabled || !audioCtx) return;
    try{
      var o = audioCtx.createOscillator();
      var g = audioCtx.createGain();
      o.type = type||'square';
      o.frequency.value = freq||440;
      g.gain.value = vol||0.08;
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime+(dur||0.1));
    }catch(e){}
  }
  function setSoundEnabled(v){ soundEnabled = !!v; }
  function isSoundEnabled(){ return soundEnabled; }

  /* Collision helpers */
  function rectsOverlap(a,b){
    return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y;
  }
  function dist(x1,y1,x2,y2){
    var dx=x2-x1, dy=y2-y1;
    return Math.sqrt(dx*dx+dy*dy);
  }

  return {
    clamp:clamp, randInt:randInt, randFloat:randFloat,
    SeededRNG:SeededRNG, formatScore:formatScore, formatTime:formatTime,
    initAudio:initAudio, beep:beep, setSoundEnabled:setSoundEnabled, isSoundEnabled:isSoundEnabled,
    rectsOverlap:rectsOverlap, dist:dist
  };
})();
