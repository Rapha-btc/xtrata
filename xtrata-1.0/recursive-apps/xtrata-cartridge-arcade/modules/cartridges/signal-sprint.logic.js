const STYLE_ID = 'signal-sprint-cartridge-style-v1';

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .ss-shell {
      display: grid;
      grid-template-columns: minmax(280px, 1fr) 240px;
      gap: 12px;
      align-items: start;
    }
    .ss-board-wrap {
      border: 1px solid #334a63;
      border-radius: 10px;
      background: #0a1119;
      padding: 10px;
    }
    .ss-title {
      margin: 0 0 6px;
      font-size: 1rem;
      letter-spacing: 0.03em;
      color: #bfe2ff;
    }
    .ss-message {
      margin: 0 0 10px;
      min-height: 20px;
      color: #99bddd;
      font-size: 0.85rem;
    }
    .ss-track {
      display: grid;
      gap: 3px;
      justify-content: start;
      align-content: start;
      border: 1px solid #27435e;
      border-radius: 8px;
      background: #111d2a;
      padding: 7px;
    }
    .ss-cell {
      width: 24px;
      height: 24px;
      border-radius: 5px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font: 700 0.75rem "IBM Plex Mono", "Menlo", monospace;
      user-select: none;
      border: 1px solid transparent;
    }
    .ss-empty {
      background: #132131;
      color: #132131;
      border-color: #1b2e41;
    }
    .ss-obstacle {
      background: #5a2528;
      color: #ffc7c7;
      border-color: #7d3439;
    }
    .ss-packet {
      background: #274e3e;
      color: #c8f8dd;
      border-color: #3a725a;
    }
    .ss-repair {
      background: #4f3f1f;
      color: #ffe8b3;
      border-color: #7f6630;
    }
    .ss-player {
      background: #1d5f89;
      color: #d4f1ff;
      border-color: #2f87be;
    }
    .ss-panel {
      border: 1px solid #334a63;
      border-radius: 10px;
      background: #101a27;
      padding: 10px;
      color: #a9c1db;
      font-size: 0.84rem;
    }
    .ss-panel h4 {
      margin: 0 0 8px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-size: 0.74rem;
      color: #c6dcf4;
    }
    .ss-panel p {
      margin: 0 0 8px;
      line-height: 1.42;
    }
    .ss-controls {
      display: grid;
      gap: 6px;
      margin: 8px 0 0;
    }
    .ss-controls button {
      border: 1px solid #3d5e81;
      border-radius: 8px;
      background: #173350;
      color: #d9ecff;
      padding: 8px;
      font-size: 0.8rem;
      cursor: pointer;
      text-align: left;
    }
    .ss-controls button:hover {
      background: #214669;
    }
    .ss-legend {
      margin-top: 10px;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
      font-size: 0.76rem;
      color: #90aac6;
    }
    .ss-legend span {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .ss-dot {
      width: 12px;
      height: 12px;
      border-radius: 3px;
      display: inline-block;
      border: 1px solid transparent;
    }
    .ss-dot.player { background: #1d5f89; border-color: #2f87be; }
    .ss-dot.packet { background: #274e3e; border-color: #3a725a; }
    .ss-dot.firewall { background: #5a2528; border-color: #7d3439; }
    .ss-dot.repair { background: #4f3f1f; border-color: #7f6630; }

    @media (max-width: 860px) {
      .ss-shell {
        grid-template-columns: 1fr;
      }
    }
  `;

  document.head.appendChild(style);
}

function toPositiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function toProbability(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  if (n < 0) {
    return 0;
  }
  if (n > 1) {
    return 1;
  }
  return n;
}

function parseConfig(assets) {
  const payload = assets && typeof assets === 'object' ? assets : {};

  const defaultPhases = [
    {
      name: 'Boot Sector',
      untilScore: 40,
      tickMs: 320,
      obstacleChance: 0.22,
      packetChance: 0.23,
      repairChance: 0.04
    },
    {
      name: 'Relay Core',
      untilScore: 90,
      tickMs: 250,
      obstacleChance: 0.3,
      packetChance: 0.2,
      repairChance: 0.03
    },
    {
      name: 'Black Ice',
      untilScore: 9999,
      tickMs: 190,
      obstacleChance: 0.36,
      packetChance: 0.18,
      repairChance: 0.02
    }
  ];

  const phaseSource = Array.isArray(payload.phases) && payload.phases.length
    ? payload.phases
    : defaultPhases;

  const phases = phaseSource
    .map((entry, index) => ({
      name: typeof entry.name === 'string' && entry.name.trim()
        ? entry.name.trim()
        : `Phase ${index + 1}`,
      untilScore: toPositiveInt(entry.untilScore, 9999),
      tickMs: toPositiveInt(entry.tickMs, 250),
      obstacleChance: toProbability(entry.obstacleChance, 0.28),
      packetChance: toProbability(entry.packetChance, 0.2),
      repairChance: toProbability(entry.repairChance, 0.03)
    }))
    .sort((a, b) => a.untilScore - b.untilScore);

  return {
    title: typeof payload.title === 'string' ? payload.title : 'Signal Sprint',
    objective: typeof payload.objective === 'string'
      ? payload.objective
      : 'Collect packets and dodge firewall strikes.',
    lanes: Math.min(8, Math.max(3, toPositiveInt(payload.lanes, 5))),
    trackLength: Math.min(18, Math.max(8, toPositiveInt(payload.trackLength, 12))),
    targetScore: toPositiveInt(payload.targetScore, 140),
    startingIntegrity: Math.min(8, Math.max(1, toPositiveInt(payload.startingIntegrity, 4))),
    packetScore: toPositiveInt(payload.packetScore, 6),
    repairValue: Math.min(3, Math.max(1, toPositiveInt(payload.repairValue, 1))),
    phases
  };
}

function createTrack(lanes, trackLength) {
  return Array.from({ length: lanes }, () => Array(trackLength).fill(''));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export async function mountCartridge(root, api) {
  if (!root || !(root instanceof HTMLElement)) {
    throw new Error('mountCartridge requires a valid root element');
  }

  ensureStyles();

  const config = parseConfig(api ? api.assets : null);
  const title = api && api.cartridge && typeof api.cartridge.title === 'string'
    ? api.cartridge.title
    : config.title;

  const saved = api && typeof api.loadProgress === 'function'
    ? api.loadProgress()
    : null;

  let bestScore = saved && Number.isInteger(saved.bestScore)
    ? saved.bestScore
    : null;

  const run = {
    playerLane: Math.floor(config.lanes / 2),
    playerCol: 1,
    score: 0,
    integrity: config.startingIntegrity,
    ticks: 0,
    running: true,
    finished: false,
    track: createTrack(config.lanes, config.trackLength)
  };

  let tickTimer = null;

  root.innerHTML = '';

  const shell = document.createElement('section');
  shell.className = 'ss-shell';

  const boardWrap = document.createElement('article');
  boardWrap.className = 'ss-board-wrap';

  const heading = document.createElement('h3');
  heading.className = 'ss-title';
  heading.textContent = title;

  const message = document.createElement('p');
  message.className = 'ss-message';

  const track = document.createElement('div');
  track.className = 'ss-track';

  boardWrap.appendChild(heading);
  boardWrap.appendChild(message);
  boardWrap.appendChild(track);

  const panel = document.createElement('aside');
  panel.className = 'ss-panel';

  const missionTitle = document.createElement('h4');
  missionTitle.textContent = 'Mission';
  const missionText = document.createElement('p');
  missionText.textContent = config.objective;

  const controlsTitle = document.createElement('h4');
  controlsTitle.textContent = 'Controls';
  const controlsHint = document.createElement('p');
  controlsHint.textContent = 'Arrow Up/Down or W/S move lanes. Space toggles pause.';

  const controls = document.createElement('div');
  controls.className = 'ss-controls';

  const upButton = document.createElement('button');
  upButton.type = 'button';
  upButton.textContent = 'Move Up';

  const downButton = document.createElement('button');
  downButton.type = 'button';
  downButton.textContent = 'Move Down';

  const pauseButton = document.createElement('button');
  pauseButton.type = 'button';
  pauseButton.textContent = 'Pause';

  const restartButton = document.createElement('button');
  restartButton.type = 'button';
  restartButton.textContent = 'Restart Mission';

  controls.appendChild(upButton);
  controls.appendChild(downButton);
  controls.appendChild(pauseButton);
  controls.appendChild(restartButton);

  const legend = document.createElement('div');
  legend.className = 'ss-legend';
  legend.innerHTML = [
    '<span><i class="ss-dot player"></i> Runner</span>',
    '<span><i class="ss-dot packet"></i> Packet</span>',
    '<span><i class="ss-dot firewall"></i> Firewall</span>',
    '<span><i class="ss-dot repair"></i> Repair</span>'
  ].join('');

  panel.appendChild(missionTitle);
  panel.appendChild(missionText);
  panel.appendChild(controlsTitle);
  panel.appendChild(controlsHint);
  panel.appendChild(controls);
  panel.appendChild(legend);

  shell.appendChild(boardWrap);
  shell.appendChild(panel);
  root.appendChild(shell);

  function currentPhase() {
    for (let i = 0; i < config.phases.length; i += 1) {
      if (run.score <= config.phases[i].untilScore) {
        return config.phases[i];
      }
    }
    return config.phases[config.phases.length - 1];
  }

  function clearTickTimer() {
    if (tickTimer !== null) {
      window.clearTimeout(tickTimer);
      tickTimer = null;
    }
  }

  function totalPhaseLabel() {
    const phase = currentPhase();
    return phase && phase.name ? phase.name : 'Unknown';
  }

  function pushStats() {
    if (api && typeof api.setStats === 'function') {
      api.setStats({
        Cartridge: title,
        Score: run.score,
        Integrity: run.integrity,
        Phase: totalPhaseLabel(),
        Best: bestScore === null ? 'none' : bestScore
      });
    }
  }

  function setMessage(text, kind = 'info') {
    message.textContent = text;
    if (api && typeof api.setStatus === 'function') {
      api.setStatus(text, kind);
    }
  }

  function render() {
    track.style.gridTemplateColumns = `repeat(${config.trackLength}, 24px)`;
    track.innerHTML = '';

    for (let lane = 0; lane < config.lanes; lane += 1) {
      for (let col = 0; col < config.trackLength; col += 1) {
        const cell = document.createElement('div');
        cell.className = 'ss-cell ss-empty';

        const isPlayer = lane === run.playerLane && col === run.playerCol;
        const tile = run.track[lane][col];

        if (isPlayer) {
          cell.className = 'ss-cell ss-player';
          cell.textContent = '@';
        } else if (tile === '#') {
          cell.className = 'ss-cell ss-obstacle';
          cell.textContent = '#';
        } else if (tile === '*') {
          cell.className = 'ss-cell ss-packet';
          cell.textContent = '*';
        } else if (tile === '+') {
          cell.className = 'ss-cell ss-repair';
          cell.textContent = '+';
        }

        track.appendChild(cell);
      }
    }

    pushStats();
  }

  function spawnColumn() {
    const phase = currentPhase();
    const tokens = new Array(config.lanes).fill('');
    const obstacleLimit = Math.max(1, config.lanes - 1);
    let obstacleCount = 0;

    for (let lane = 0; lane < config.lanes; lane += 1) {
      if (Math.random() < phase.obstacleChance && obstacleCount < obstacleLimit) {
        tokens[lane] = '#';
        obstacleCount += 1;
      }
    }

    for (let lane = 0; lane < config.lanes; lane += 1) {
      if (tokens[lane] !== '') {
        continue;
      }

      const roll = Math.random();
      if (roll < phase.packetChance) {
        tokens[lane] = '*';
      } else if (roll < phase.packetChance + phase.repairChance) {
        tokens[lane] = '+';
      }
    }

    return tokens;
  }

  function finishRun(won) {
    run.running = false;
    run.finished = true;
    clearTickTimer();

    if (won) {
      if (bestScore === null || run.score > bestScore) {
        bestScore = run.score;
        if (api && typeof api.saveProgress === 'function') {
          api.saveProgress({ bestScore });
        }
      }
      setMessage(`Mission complete with ${run.score} points.`, 'ok');
      if (api && typeof api.log === 'function') {
        api.log(`Signal Sprint complete. Score ${run.score}.`);
      }
    } else {
      setMessage('Integrity collapsed. Mission failed.', 'error');
      if (api && typeof api.log === 'function') {
        api.log(`Signal Sprint failed at score ${run.score}.`);
      }
    }

    pauseButton.textContent = 'Resume';
    render();
  }

  function tick() {
    if (!run.running || run.finished) {
      return;
    }

    run.ticks += 1;

    const incoming = spawnColumn();
    for (let lane = 0; lane < config.lanes; lane += 1) {
      const row = run.track[lane];
      row.shift();
      row.push(incoming[lane]);
    }

    const tile = run.track[run.playerLane][run.playerCol];

    if (tile === '#') {
      run.track[run.playerLane][run.playerCol] = '';
      run.integrity -= 1;
      setMessage(`Firewall impact. Integrity ${run.integrity}.`, 'error');
    } else if (tile === '*') {
      run.track[run.playerLane][run.playerCol] = '';
      run.score += config.packetScore;
      setMessage(`Packet secured. Score ${run.score}.`);
    } else if (tile === '+') {
      run.track[run.playerLane][run.playerCol] = '';
      run.integrity = clamp(
        run.integrity + config.repairValue,
        1,
        config.startingIntegrity + 2
      );
      setMessage(`Repair patch applied. Integrity ${run.integrity}.`, 'ok');
    }

    if (run.integrity <= 0) {
      finishRun(false);
      return;
    }

    if (run.score >= config.targetScore) {
      finishRun(true);
      return;
    }

    if (run.ticks % 5 === 0) {
      setMessage(`Phase ${totalPhaseLabel()}. Target ${config.targetScore}.`);
    }

    render();
  }

  function scheduleTick() {
    clearTickTimer();
    if (!run.running || run.finished) {
      return;
    }
    const delay = currentPhase().tickMs;
    tickTimer = window.setTimeout(() => {
      tickTimer = null;
      tick();
      scheduleTick();
    }, delay);
  }

  function moveLane(delta) {
    if (run.finished) {
      return;
    }

    const nextLane = clamp(run.playerLane + delta, 0, config.lanes - 1);
    if (nextLane === run.playerLane) {
      return;
    }

    run.playerLane = nextLane;
    render();
  }

  function togglePause() {
    if (run.finished) {
      run.finished = false;
      run.running = true;
      run.track = createTrack(config.lanes, config.trackLength);
      run.playerLane = Math.floor(config.lanes / 2);
      run.score = 0;
      run.integrity = config.startingIntegrity;
      run.ticks = 0;
      setMessage('Mission restarted.');
      pauseButton.textContent = 'Pause';
      render();
      scheduleTick();
      return;
    }

    run.running = !run.running;
    if (run.running) {
      pauseButton.textContent = 'Pause';
      setMessage('Mission resumed.');
      scheduleTick();
    } else {
      pauseButton.textContent = 'Resume';
      clearTickTimer();
      setMessage('Mission paused.');
    }
    render();
  }

  function restartMission() {
    run.playerLane = Math.floor(config.lanes / 2);
    run.score = 0;
    run.integrity = config.startingIntegrity;
    run.ticks = 0;
    run.running = true;
    run.finished = false;
    run.track = createTrack(config.lanes, config.trackLength);
    pauseButton.textContent = 'Pause';

    if (api && typeof api.log === 'function') {
      api.log('Signal Sprint mission reset by player.');
    }

    setMessage(`Mission live. Reach ${config.targetScore} score.`, 'ok');
    render();
    scheduleTick();
  }

  function onKeyDown(event) {
    const raw = typeof event.key === 'string' ? event.key : '';
    const key = raw.toLowerCase();

    if (raw === 'ArrowUp' || key === 'w') {
      event.preventDefault();
      moveLane(-1);
      return;
    }

    if (raw === 'ArrowDown' || key === 's') {
      event.preventDefault();
      moveLane(1);
      return;
    }

    if (raw === ' ' || key === 'p') {
      event.preventDefault();
      togglePause();
      return;
    }

    if (key === 'r') {
      event.preventDefault();
      restartMission();
    }
  }

  const handleUp = () => moveLane(-1);
  const handleDown = () => moveLane(1);
  const handlePause = () => togglePause();
  const handleRestart = () => restartMission();

  window.addEventListener('keydown', onKeyDown);
  upButton.addEventListener('click', handleUp);
  downButton.addEventListener('click', handleDown);
  pauseButton.addEventListener('click', handlePause);
  restartButton.addEventListener('click', handleRestart);

  restartMission();

  return {
    destroy() {
      clearTickTimer();
      window.removeEventListener('keydown', onKeyDown);
      upButton.removeEventListener('click', handleUp);
      downButton.removeEventListener('click', handleDown);
      pauseButton.removeEventListener('click', handlePause);
      restartButton.removeEventListener('click', handleRestart);
      root.innerHTML = '';
    }
  };
}
