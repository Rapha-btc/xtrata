const STYLE_ID = 'reactor-warden-cartridge-style-v1';

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .rw-shell {
      display: grid;
      grid-template-columns: minmax(280px, 1fr) 260px;
      gap: 12px;
      align-items: start;
    }
    .rw-grid {
      border: 1px solid #3b4f66;
      border-radius: 10px;
      background: #0c131b;
      padding: 10px;
    }
    .rw-title {
      margin: 0 0 6px;
      font-size: 1rem;
      letter-spacing: 0.03em;
      color: #c8e6ff;
    }
    .rw-message {
      margin: 0 0 10px;
      min-height: 20px;
      color: #9eb9d3;
      font-size: 0.85rem;
    }
    .rw-core {
      border: 1px solid #32475c;
      border-radius: 8px;
      background: #101a25;
      padding: 9px;
      margin-bottom: 8px;
    }
    .rw-core:last-child {
      margin-bottom: 0;
    }
    .rw-core-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
      font-size: 0.82rem;
      color: #c6ddf5;
    }
    .rw-bar {
      height: 14px;
      border-radius: 999px;
      border: 1px solid #2c3f53;
      background: #111e2b;
      overflow: hidden;
    }
    .rw-fill {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #2f7a4f 0%, #3d9f5f 100%);
      transition: width 120ms ease;
    }
    .rw-fill.warn {
      background: linear-gradient(90deg, #8c6b28 0%, #b08636 100%);
    }
    .rw-fill.danger {
      background: linear-gradient(90deg, #8d3a2a 0%, #ba4f38 100%);
    }
    .rw-fill.critical {
      background: linear-gradient(90deg, #77202a 0%, #9f2634 100%);
    }
    .rw-side {
      border: 1px solid #3b4f66;
      border-radius: 10px;
      background: #101925;
      padding: 10px;
      color: #aabfd8;
      font-size: 0.84rem;
    }
    .rw-side h4 {
      margin: 0 0 8px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-size: 0.74rem;
      color: #cbdef1;
    }
    .rw-side p {
      margin: 0 0 8px;
      line-height: 1.42;
    }
    .rw-actions {
      display: grid;
      gap: 6px;
      margin: 8px 0;
    }
    .rw-actions button {
      border: 1px solid #40617f;
      border-radius: 8px;
      background: #17324f;
      color: #dcecff;
      padding: 8px;
      font-size: 0.8rem;
      cursor: pointer;
      text-align: left;
    }
    .rw-actions button:hover {
      background: #21466a;
    }
    .rw-log {
      border: 1px solid #2f4257;
      border-radius: 8px;
      background: #0d1621;
      max-height: 160px;
      overflow: auto;
      padding: 8px;
      font-family: "IBM Plex Mono", "Menlo", monospace;
      font-size: 0.72rem;
      line-height: 1.42;
      color: #aac2da;
      white-space: pre-wrap;
      word-break: break-word;
    }

    @media (max-width: 880px) {
      .rw-shell {
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

function toNonNegativeInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

function toFiniteNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function randomInt(min, max) {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

function parseConfig(assets) {
  const payload = assets && typeof assets === 'object' ? assets : {};

  const coresSource = Array.isArray(payload.cores) && payload.cores.length
    ? payload.cores
    : [
      { id: 'alpha', label: 'Alpha' },
      { id: 'beta', label: 'Beta' },
      { id: 'gamma', label: 'Gamma' }
    ];

  const cores = coresSource.map((entry, index) => ({
    id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : `core-${index + 1}`,
    label: typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : `Core ${index + 1}`
  }));

  const startingHeatRaw = Array.isArray(payload.startingHeat)
    ? payload.startingHeat
    : [];
  const startingHeat = cores.map((_, index) => {
    const rawValue = startingHeatRaw[index];
    const value = Number(rawValue);
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 36 + index * 2;
  });

  const passiveRiseRaw = Array.isArray(payload.passiveRise) ? payload.passiveRise : [6, 13];
  const passiveRiseMin = toPositiveInt(passiveRiseRaw[0], 6);
  const passiveRiseMax = toPositiveInt(passiveRiseRaw[1], 13);

  const eventsSource = Array.isArray(payload.events) && payload.events.length
    ? payload.events
    : [
      { name: 'Solar Flare', description: 'Starburst pressure wave.', heat: [6, 12, 9] },
      { name: 'Coolant Cavitation', description: 'Uneven feed in lower manifold.', heat: [10, 5, 8] },
      { name: 'Magnetic Shear', description: 'Containment jitter across beta ring.', heat: [5, 11, 6] }
    ];

  const events = eventsSource.map((entry, index) => {
    const heatRaw = Array.isArray(entry.heat) ? entry.heat : [];
    const heat = cores.map((_, coreIndex) => {
      const value = Number(heatRaw[coreIndex]);
      return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
    });

    return {
      name: typeof entry.name === 'string' && entry.name.trim()
        ? entry.name.trim()
        : `Event ${index + 1}`,
      description: typeof entry.description === 'string' ? entry.description : 'No additional telemetry.',
      heat
    };
  });

  return {
    title: typeof payload.title === 'string' ? payload.title : 'Reactor Warden',
    objective: typeof payload.objective === 'string'
      ? payload.objective
      : 'Survive every cycle without any core reaching meltdown.',
    cores,
    startingHeat,
    meltdownHeat: Math.max(60, toPositiveInt(payload.meltdownHeat, 100)),
    targetCycles: Math.max(6, toPositiveInt(payload.targetCycles, 14)),
    focusCool: Math.max(5, toPositiveInt(payload.focusCool, 20)),
    ventCool: Math.max(4, toPositiveInt(payload.ventCool, 12)),
    ventCharges: Math.min(8, Math.max(0, toNonNegativeInt(payload.ventCharges, 3))),
    shieldCharges: Math.min(8, Math.max(0, toNonNegativeInt(payload.shieldCharges, 2))),
    passiveRiseMin,
    passiveRiseMax,
    shieldMultiplier: Math.max(0.2, Math.min(1, toFiniteNumber(payload.shieldMultiplier, 0.5))),
    events
  };
}

function clampHeat(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.max(0, Math.round(n));
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
    cycle: 1,
    heats: config.startingHeat.slice(),
    ventCharges: config.ventCharges,
    shieldCharges: config.shieldCharges,
    actions: 0,
    peakHeat: Math.max(...config.startingHeat),
    finished: false,
    score: 0,
    logLines: []
  };

  root.innerHTML = '';

  const shell = document.createElement('section');
  shell.className = 'rw-shell';

  const grid = document.createElement('article');
  grid.className = 'rw-grid';

  const heading = document.createElement('h3');
  heading.className = 'rw-title';
  heading.textContent = title;

  const message = document.createElement('p');
  message.className = 'rw-message';

  const coresWrap = document.createElement('div');

  const coreRows = config.cores.map((core) => {
    const row = document.createElement('section');
    row.className = 'rw-core';

    const head = document.createElement('div');
    head.className = 'rw-core-head';

    const label = document.createElement('span');
    label.textContent = core.label;

    const value = document.createElement('strong');
    value.textContent = '0';

    head.appendChild(label);
    head.appendChild(value);

    const bar = document.createElement('div');
    bar.className = 'rw-bar';

    const fill = document.createElement('div');
    fill.className = 'rw-fill';
    bar.appendChild(fill);

    row.appendChild(head);
    row.appendChild(bar);

    coresWrap.appendChild(row);

    return { value, fill };
  });

  grid.appendChild(heading);
  grid.appendChild(message);
  grid.appendChild(coresWrap);

  const side = document.createElement('aside');
  side.className = 'rw-side';

  const missionTitle = document.createElement('h4');
  missionTitle.textContent = 'Objective';
  const missionText = document.createElement('p');
  missionText.textContent = config.objective;

  const controlsTitle = document.createElement('h4');
  controlsTitle.textContent = 'Actions';
  const controlsHint = document.createElement('p');
  controlsHint.textContent = 'Each action advances one cycle. Keys 1-3 cool cores, V vents, S shields, Space holds.';

  const actions = document.createElement('div');
  actions.className = 'rw-actions';

  const coolButtons = config.cores.map((core, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `Cool ${core.label} (-${config.focusCool})`;
    button.dataset.action = 'cool';
    button.dataset.index = String(index);
    actions.appendChild(button);
    return button;
  });

  const ventButton = document.createElement('button');
  ventButton.type = 'button';
  ventButton.dataset.action = 'vent';
  ventButton.textContent = `Wide Vent (-${config.ventCool} all, ${run.ventCharges} left)`;

  const shieldButton = document.createElement('button');
  shieldButton.type = 'button';
  shieldButton.dataset.action = 'shield';
  shieldButton.textContent = `Raise Shield (${run.shieldCharges} left)`;

  const holdButton = document.createElement('button');
  holdButton.type = 'button';
  holdButton.dataset.action = 'hold';
  holdButton.textContent = 'Hold Pattern';

  const restartButton = document.createElement('button');
  restartButton.type = 'button';
  restartButton.dataset.action = 'restart';
  restartButton.textContent = 'Restart Mission';

  actions.appendChild(ventButton);
  actions.appendChild(shieldButton);
  actions.appendChild(holdButton);
  actions.appendChild(restartButton);

  const logTitle = document.createElement('h4');
  logTitle.textContent = 'Telemetry';
  const logEl = document.createElement('pre');
  logEl.className = 'rw-log';

  side.appendChild(missionTitle);
  side.appendChild(missionText);
  side.appendChild(controlsTitle);
  side.appendChild(controlsHint);
  side.appendChild(actions);
  side.appendChild(logTitle);
  side.appendChild(logEl);

  shell.appendChild(grid);
  shell.appendChild(side);
  root.appendChild(shell);

  function addLog(line) {
    run.logLines.unshift(`[C${run.cycle}] ${line}`);
    if (run.logLines.length > 8) {
      run.logLines.length = 8;
    }
    logEl.textContent = run.logLines.join('\n');

    if (api && typeof api.log === 'function') {
      api.log(line);
    }
  }

  function setMessage(text, kind = 'info') {
    message.textContent = text;
    if (api && typeof api.setStatus === 'function') {
      api.setStatus(text, kind);
    }
  }

  function pushStats() {
    if (api && typeof api.setStats === 'function') {
      api.setStats({
        Cartridge: title,
        Cycle: `${Math.min(run.cycle, config.targetCycles)}/${config.targetCycles}`,
        Vents: run.ventCharges,
        Shields: run.shieldCharges,
        Peak: run.peakHeat,
        Best: bestScore === null ? 'none' : bestScore
      });
    }
  }

  function updateActionLabels() {
    ventButton.textContent = `Wide Vent (-${config.ventCool} all, ${run.ventCharges} left)`;
    shieldButton.textContent = `Raise Shield (${run.shieldCharges} left)`;
  }

  function renderCore(coreIndex) {
    const heat = run.heats[coreIndex];
    const row = coreRows[coreIndex];
    const ratio = Math.min(1, heat / config.meltdownHeat);
    const percent = Math.round(ratio * 100);

    row.value.textContent = `${heat}/${config.meltdownHeat}`;
    row.fill.style.width = `${percent}%`;

    let className = 'rw-fill';
    if (ratio >= 0.9) {
      className += ' critical';
    } else if (ratio >= 0.75) {
      className += ' danger';
    } else if (ratio >= 0.55) {
      className += ' warn';
    }
    row.fill.className = className;
  }

  function render() {
    config.cores.forEach((_, index) => {
      renderCore(index);
    });
    updateActionLabels();
    pushStats();
  }

  function resetMission() {
    run.cycle = 1;
    run.heats = config.startingHeat.slice();
    run.ventCharges = config.ventCharges;
    run.shieldCharges = config.shieldCharges;
    run.actions = 0;
    run.peakHeat = Math.max(...run.heats);
    run.finished = false;
    run.score = 0;
    run.logLines = [];

    setMessage(`Mission initialized. Survive ${config.targetCycles} cycles.`, 'ok');
    addLog('Reactor telemetry reset.');
    render();
  }

  function randomEvent() {
    const index = Math.floor(Math.random() * config.events.length);
    return config.events[index];
  }

  function computeScore() {
    const averageHeat = Math.round(
      run.heats.reduce((sum, value) => sum + value, 0) / run.heats.length
    );
    return (
      config.targetCycles * 100
      - run.actions * 6
      - run.peakHeat
      - averageHeat
      + run.ventCharges * 20
      + run.shieldCharges * 24
    );
  }

  function finishMission(won, reason) {
    run.finished = true;

    if (won) {
      run.score = computeScore();
      if (bestScore === null || run.score > bestScore) {
        bestScore = run.score;
        if (api && typeof api.saveProgress === 'function') {
          api.saveProgress({ bestScore });
        }
      }
      setMessage(`${reason} Final score ${run.score}.`, 'ok');
      addLog(`Mission cleared with score ${run.score}.`);
    } else {
      setMessage(reason, 'error');
      addLog('Containment failure. Mission lost.');
    }

    render();
  }

  function applyAction(actionType, actionIndex) {
    if (actionType === 'cool') {
      const idx = Number(actionIndex);
      if (!Number.isInteger(idx) || idx < 0 || idx >= run.heats.length) {
        return false;
      }
      run.heats[idx] = clampHeat(run.heats[idx] - config.focusCool);
      addLog(`Focused coolant routed to ${config.cores[idx].label}.`);
      return { shielded: false };
    }

    if (actionType === 'vent') {
      if (run.ventCharges <= 0) {
        setMessage('No vent charges remaining.');
        return false;
      }
      run.ventCharges -= 1;
      run.heats = run.heats.map((heat) => clampHeat(heat - config.ventCool));
      addLog('Wide vent purge executed.');
      return { shielded: false };
    }

    if (actionType === 'shield') {
      if (run.shieldCharges <= 0) {
        setMessage('No shield charges remaining.');
        return false;
      }
      run.shieldCharges -= 1;
      run.heats = run.heats.map((heat) => clampHeat(heat - 4));
      addLog('Containment shields raised.');
      return { shielded: true };
    }

    if (actionType === 'hold') {
      addLog('Hold pattern. No active cooling command.');
      return { shielded: false };
    }

    return false;
  }

  function executeTurn(actionType, actionIndex) {
    if (run.finished) {
      return;
    }

    const actionResult = applyAction(actionType, actionIndex);
    if (!actionResult) {
      render();
      return;
    }

    run.actions += 1;

    const event = randomEvent();
    const shieldFactor = actionResult.shielded ? config.shieldMultiplier : 1;

    run.heats = run.heats.map((heat, index) => {
      const passive = randomInt(config.passiveRiseMin, config.passiveRiseMax);
      const eventHeat = event.heat[index] || 0;
      const incoming = Math.round((passive + eventHeat) * shieldFactor);
      return clampHeat(heat + incoming);
    });

    run.peakHeat = Math.max(run.peakHeat, ...run.heats);

    addLog(`${event.name}: ${event.description}`);

    const meltdownIndex = run.heats.findIndex((heat) => heat >= config.meltdownHeat);
    if (meltdownIndex >= 0) {
      finishMission(false, `${config.cores[meltdownIndex].label} core reached meltdown.`);
      return;
    }

    if (run.cycle >= config.targetCycles) {
      finishMission(true, 'All cycles stabilized.');
      return;
    }

    run.cycle += 1;
    setMessage(`Cycle ${run.cycle}. Keep every core below ${config.meltdownHeat}.`);
    render();
  }

  function onActionClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest('button[data-action]');
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const action = button.dataset.action;
    if (action === 'restart') {
      resetMission();
      return;
    }

    executeTurn(action, button.dataset.index);
  }

  function onKeyDown(event) {
    const raw = typeof event.key === 'string' ? event.key : '';
    const key = raw.toLowerCase();

    if (key === '1') {
      event.preventDefault();
      executeTurn('cool', 0);
    } else if (key === '2') {
      event.preventDefault();
      executeTurn('cool', 1);
    } else if (key === '3') {
      event.preventDefault();
      executeTurn('cool', 2);
    } else if (key === 'v') {
      event.preventDefault();
      executeTurn('vent');
    } else if (key === 's') {
      event.preventDefault();
      executeTurn('shield');
    } else if (raw === ' ') {
      event.preventDefault();
      executeTurn('hold');
    } else if (key === 'r') {
      event.preventDefault();
      resetMission();
    }
  }

  actions.addEventListener('click', onActionClick);
  window.addEventListener('keydown', onKeyDown);

  resetMission();

  return {
    destroy() {
      actions.removeEventListener('click', onActionClick);
      window.removeEventListener('keydown', onKeyDown);
      root.innerHTML = '';
    }
  };
}
