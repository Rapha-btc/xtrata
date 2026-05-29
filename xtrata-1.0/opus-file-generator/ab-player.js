// ab-player.js

window.AB_PLAYER_VERSION = '1.05';

console.log('[A/B Player] Loading AB Player Version 1.05');

const formatABSize = (blob) =>
    blob && typeof blob.size === 'number' && typeof window.formatBytes === 'function'
        ? window.formatBytes(blob.size)
        : 'size unavailable';

const getABSizeComparisonText = (originalBlob, convertedBlob) => {
    if (typeof window.getSizeComparison === 'function') {
        return window.getSizeComparison(originalBlob?.size, convertedBlob?.size).text;
    }
    return 'Size comparison unavailable';
};

const createABPlayerUI = (originalBlob, originalMimeType, convertedBlob, convertedMimeType) => {
    const abContainer = document.createElement('div');
    abContainer.className = 'ab-player-container';
    const sizeComparison = getABSizeComparisonText(originalBlob, convertedBlob);
  
    abContainer.innerHTML = `
      <div class="ab-player-header">
        <div>
          <h4>A/B Comparison Player</h4>
          <p>Compare the source and converted Opus output in sync.</p>
        </div>
        <div id="ab-size-summary" class="ab-size-summary">
          <span>Size change</span>
          <strong>${sizeComparison}</strong>
        </div>
      </div>

      <div class="ab-controls" aria-label="A/B playback controls">
        <button id="ab-play" class="button-small ab-control-button" type="button">Play A/B</button>
        <button id="ab-switch" class="button-small ab-control-button" type="button" data-listening-to="original">Listen to B</button>
        <button id="ab-loop" class="button-small ab-control-button" type="button" title="Enable looping. Minimum useful duration is 1 second.">Loop Off</button>
        <label class="ab-offset-field" for="ab-offset">
          <span>B offset</span>
          <input type="number" id="ab-offset" value="50" min="0" max="2000" step="5">
          <small>ms</small>
        </label>
      </div>

      <div class="ab-track-list">
        <section class="ab-track is-active" data-ab-track="a">
          <div class="ab-track-header">
            <p id="labelA" class="ab-track-title"><span>A</span> Original audio</p>
            <p class="ab-track-meta">${formatABSize(originalBlob)}</p>
          </div>
          <audio id="audioA" controls preload="metadata"></audio>
        </section>

        <section class="ab-track" data-ab-track="b">
          <div class="ab-track-header">
            <p id="labelB" class="ab-track-title"><span>B</span> Converted audio</p>
            <p class="ab-track-meta">WebM Audio/Opus, ${formatABSize(convertedBlob)}</p>
          </div>
          <audio id="audioB" controls preload="metadata"></audio>
        </section>
      </div>
    `;
  
    // --- Elements ---
    const audioA = abContainer.querySelector('#audioA');
    const audioB = abContainer.querySelector('#audioB');
    const playBtn = abContainer.querySelector('#ab-play');
    const switchBtn = abContainer.querySelector('#ab-switch');
    const loopBtn = abContainer.querySelector('#ab-loop');
    const offsetInput = abContainer.querySelector('#ab-offset');
    const trackA = abContainer.querySelector('[data-ab-track="a"]');
    const trackB = abContainer.querySelector('[data-ab-track="b"]');
  
    // --- Setup sources and types ---
    const urlA = URL.createObjectURL(originalBlob);
    const urlB = URL.createObjectURL(convertedBlob);
    audioA.src = urlA;
    audioA.type = originalMimeType;
    audioB.src = urlB;
    audioB.type = convertedMimeType;
  
    // --- State ---
    let isLoop = false, isSeeking = false;
    // Use localStorage to persist last-used offset
    offsetInput.value = localStorage.getItem('ab_player_offset_ms') || '50';
    offsetInput.onchange = () => {
      let v = Math.max(0, Math.min(2000, parseInt(offsetInput.value) || 0));
      offsetInput.value = v;
      localStorage.setItem('ab_player_offset_ms', v);
    };
  
    // --- Helper: get offset in seconds ---
    const getOffset = () => Math.max(0, Math.min(2, parseInt(offsetInput.value) / 1000));
  
    // --- Mute state: A active, B muted at first ---
    audioA.muted = false; audioB.muted = true;
    switchBtn.dataset.listeningTo = 'original';
    switchBtn.textContent = 'Listen to B';

    const setPlayButtonState = (isPlaying) => {
      playBtn.textContent = isPlaying ? 'Pause A/B' : 'Play A/B';
      playBtn.classList.toggle('is-active', isPlaying);
    };

    const setActiveTrack = (listeningTo) => {
      const isOriginal = listeningTo === 'original';
      trackA.classList.toggle('is-active', isOriginal);
      trackB.classList.toggle('is-active', !isOriginal);
      switchBtn.textContent = isOriginal ? 'Listen to B' : 'Listen to A';
      switchBtn.dataset.listeningTo = listeningTo;
    };


    // --- Main Controls ---
    playBtn.onclick = () => {
      const offset = getOffset();
      // If either player is running, pause both
      if (!audioA.paused || !audioB.paused) {
        audioA.pause();
        audioB.pause();
        setPlayButtonState(false);
        return;
      }
      // Otherwise, start both in sync
      // (If ended, always restart from 0)
      if (audioA.ended || audioB.ended || audioA.currentTime >= audioA.duration || audioB.currentTime >= audioB.duration) {
        audioA.currentTime = 0;
        audioB.currentTime = offset;
      } else {
        audioA.currentTime = Math.max(0, audioA.currentTime);
        audioB.currentTime = Math.max(0, audioA.currentTime + offset);
      }
      Promise.all([audioA.play(), audioB.play()])
        .then(() => { setPlayButtonState(true); })
        .catch(() => { playBtn.textContent = 'Error'; });
    };
    
  
    switchBtn.onclick = () => {
      const isOriginal = switchBtn.dataset.listeningTo === 'original';
      const offset = getOffset();
      audioA.muted = isOriginal;
      audioB.muted = !isOriginal;
      setActiveTrack(isOriginal ? 'converted' : 'original');
    
      if (!audioA.paused && !audioB.paused) {
        if (!isOriginal) {
          audioB.currentTime = Math.max(0, audioA.currentTime + offset);
        } else {
          audioA.currentTime = audioB.currentTime - offset;
          if (audioA.currentTime < 0) audioA.currentTime = 0;
        }
      }
    };
    
    
  
    loopBtn.onclick = () => {
      isLoop = !isLoop;
      audioA.loop = audioB.loop = isLoop;
      loopBtn.textContent = isLoop ? 'Loop On' : 'Loop Off';
      loopBtn.classList.toggle('is-active', isLoop);
      if (isLoop && !playBtn.classList.contains('is-active') && (audioA.ended || audioB.ended)) {
        const offset = getOffset();
        audioA.currentTime = 0; audioB.currentTime = offset;
      }
    };
  
    // --- Play/Pause/Ended Sync ---
    const syncBtn = () => setPlayButtonState(!(audioA.paused && audioB.paused));
  
    [audioA, audioB].forEach(audio => {
      audio.onplay = () => {
        const other = audio === audioA ? audioB : audioA;
        const offset = getOffset();
        if (other.paused) {
          if (audio === audioA) other.currentTime = Math.max(0, audio.currentTime + offset);
          else other.currentTime = Math.max(0, audio.currentTime - offset);
          other.play().catch(() => {});
        }
        syncBtn();
      };
      audio.onpause = () => {
        const other = audio === audioA ? audioB : audioA;
        if (!other.paused) other.pause();
        syncBtn();
      };
      audio.onended = () => {
        const other = audio === audioA ? audioB : audioA;
        if (!audio.paused) audio.pause();
        if (!other.paused && other.duration - other.currentTime < 0.5) other.pause();
        syncBtn();
        if (isLoop) {
          const offset = getOffset();
          const d = Math.min(audioA.duration, audioB.duration);
          if (d >= 1.0) {
            audioA.currentTime = 0;
            audioB.currentTime = offset;
            setTimeout(() => {
              if (!playBtn.classList.contains('is-active'))
                Promise.all([audioA.play(), audioB.play()]).catch(() => {});
            }, 50);
          } else {
            audioA.currentTime = 0;
            audioB.currentTime = offset;
          }
        } else {
          audioA.currentTime = 0;
          audioB.currentTime = getOffset();
        }
      };
    });
  
    // --- Seek sync with offset ---
    const syncSeek = (src, tgt, srcIsA) => {
      const offset = getOffset();
      if (!isSeeking && Math.abs((src.currentTime + (srcIsA ? offset : -offset)) - tgt.currentTime) > 0.15) {
        isSeeking = true;
        if (srcIsA) tgt.currentTime = Math.max(0, src.currentTime + offset);
        else tgt.currentTime = Math.max(0, src.currentTime - offset);
        setTimeout(() => {
          isSeeking = false;
          if (playBtn.classList.contains('is-active')) {
            if (src.paused) src.play().catch(()=>{});
            if (tgt.paused) tgt.play().catch(()=>{});
          }
        }, 50);
      } else if (isSeeking) {
        setTimeout(() => isSeeking = false, 100);
      }
    };
    audioA.addEventListener('seeked', () => syncSeek(audioA, audioB, true));
    audioB.addEventListener('seeked', () => syncSeek(audioB, audioA, false));
  
    // --- Cleanup ---
    const observer = new MutationObserver(list =>
      list.forEach(m =>
        m.removedNodes && m.removedNodes.forEach(n => {
          if (n === abContainer) {
            URL.revokeObjectURL(urlA);
            URL.revokeObjectURL(urlB);
            observer.disconnect();
          }
        })
      )
    );
    observer.observe(document.body, { childList: true, subtree: true });
  
    abContainer.revokeUrls = () => {
      URL.revokeObjectURL(urlA);
      URL.revokeObjectURL(urlB);
      audioA.src = '';
      audioB.src = '';
      observer.disconnect();
    };
  
    return abContainer;
  };
  
