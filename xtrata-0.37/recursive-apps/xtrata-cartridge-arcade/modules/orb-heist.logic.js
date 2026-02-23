const STYLE_ID = 'orb-heist-cartridge-style-v1';

const MOVE_BY_KEY = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  w: [0, -1],
  a: [-1, 0],
  s: [0, 1],
  d: [1, 0]
};

const GUARD_DIRECTIONS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1]
];

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .oh-shell {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) 210px;
      gap: 12px;
      align-items: start;
    }
    .oh-board-wrap {
      border: 1px solid #32475f;
      border-radius: 10px;
      background: #0a1017;
      padding: 10px;
    }
    .oh-title {
      margin: 0 0 6px;
      font-size: 1rem;
      color: #bfe0ff;
      letter-spacing: 0.03em;
    }
    .oh-message {
      margin: 0 0 10px;
      min-height: 20px;
      color: #96b8db;
      font-size: 0.85rem;
    }
    .oh-board {
      display: grid;
      gap: 2px;
      justify-content: start;
      align-content: start;
      background: #132131;
      border: 1px solid #2f4762;
      border-radius: 8px;
      padding: 6px;
      width: fit-content;
    }
    .oh-cell {
      width: 28px;
      height: 28px;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-family: "IBM Plex Mono", "Menlo", monospace;
      font-size: 0.83rem;
      user-select: none;
    }
    .oh-floor { background: #182433; color: #182433; }
    .oh-wall { background: #325374; color: #d8ecff; }
    .oh-exit { background: #284f36; color: #c3f7cf; }
    .oh-orb { background: #4f3d1f; color: #ffd78f; }
    .oh-guard { background: #572225; color: #ffbcbc; }
    .oh-player { background: #1a5a76; color: #d2f5ff; font-weight: 700; }

    .oh-panel {
      border: 1px solid #32475f;
      border-radius: 10px;
      background: #0f1824;
      padding: 10px;
      font-size: 0.83rem;
      color: #a6bed9;
    }
    .oh-panel h4 {
      margin: 0 0 8px;
      color: #c5dcf4;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      font-size: 0.74rem;
    }
    .oh-panel p {
      margin: 0 0 8px;
      line-height: 1.4;
    }
    .oh-controls {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
      margin: 8px 0 10px;
    }
    .oh-controls button,
    .oh-actions button {
      border: 1px solid #3d5a7a;
      border-radius: 8px;
      background: #17304a;
      color: #d9ecff;
      font-size: 0.76rem;
      padding: 7px;
      cursor: pointer;
    }
    .oh-controls button:hover,
    .oh-actions button:hover {
      background: #1f4061;
    }
    .oh-actions {
      display: grid;
      gap: 6px;
    }
    @media (max-width: 780px) {
      .oh-shell {
        grid-template-columns: 1fr;
      }
      .oh-panel {
        order: -1;
      }
    }
  `;

  document.head.appendChild(style);
}

function keyOf(x, y) {
  return `${x},${y}`;
}

function parseLevels(assets) {
  if (!assets || typeof assets !== 'object') {
    throw new Error('Assets payload is invalid');
  }

  const levels = Array.isArray(assets.levels) ? assets.levels : [];
  if (!levels.length) {
    throw new Error('Assets must include levels[]');
  }

  return levels.map((entry, index) => {
    const rows = Array.isArray(entry.map) ? entry.map.slice() : [];
    if (!rows.length) {
      throw new Error(`levels[${index}] has no map rows`);
    }

    const width = rows[0].length;
    if (!width) {
      throw new Error(`levels[${index}] map rows are empty`);
    }

    rows.forEach((row, rowIndex) => {
      if (typeof row !== 'string' || row.length !== width) {
        throw new Error(`levels[${index}] row ${rowIndex} must be a ${width}-char string`);
      }
    });

    const walls = new Set();
    const orbs = new Set();
    const exits = new Set();
    const guards = [];
    let player = null;

    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x += 1) {
        const char = row[x];
        const key = keyOf(x, y);
        if (char === '#') {
          walls.add(key);
        } else if (char === 'P') {
          player = { x, y };
        } else if (char === 'O') {
          orbs.add(key);
        } else if (char === 'E') {
          exits.add(key);
        } else if (char === 'G') {
          guards.push({ x, y, dir: 0 });
        }
      }
    });

    if (!player) {
      throw new Error(`levels[${index}] is missing player start (P)`);
    }
    if (!exits.size) {
      throw new Error(`levels[${index}] is missing at least one exit (E)`);
    }

    return {
      id: typeof entry.id === 'string' ? entry.id : `level-${index + 1}`,
      name: typeof entry.name === 'string' ? entry.name : `Vault ${index + 1}`,
      width,
      height: rows.length,
      walls,
      initialOrbs: orbs,
      exits,
      guardStarts: guards,
      playerStart: player
    };
  });
}

function cloneLevelState(level) {
  return {
    player: { x: level.playerStart.x, y: level.playerStart.y },
    guards: level.guardStarts.map((guard) => ({ x: guard.x, y: guard.y, dir: guard.dir })),
    orbs: new Set(level.initialOrbs)
  };
}

function isWall(level, x, y) {
  if (x < 0 || x >= level.width || y < 0 || y >= level.height) {
    return true;
  }
  return level.walls.has(keyOf(x, y));
}

function guardHitsPlayer(levelState) {
  return levelState.guards.some(
    (guard) => guard.x === levelState.player.x && guard.y === levelState.player.y
  );
}

function moveGuards(level, levelState) {
  levelState.guards.forEach((guard) => {
    for (let i = 0; i < GUARD_DIRECTIONS.length; i += 1) {
      const directionIndex = (guard.dir + i) % GUARD_DIRECTIONS.length;
      const [dx, dy] = GUARD_DIRECTIONS[directionIndex];
      const nextX = guard.x + dx;
      const nextY = guard.y + dy;
      if (isWall(level, nextX, nextY)) {
        continue;
      }
      guard.x = nextX;
      guard.y = nextY;
      guard.dir = (directionIndex + 1) % GUARD_DIRECTIONS.length;
      return;
    }
  });
}

export async function mountCartridge(root, api) {
  if (!root || !(root instanceof HTMLElement)) {
    throw new Error('mountCartridge requires a valid root element');
  }

  ensureStyles();

  const title = api && api.cartridge && api.cartridge.title
    ? api.cartridge.title
    : 'Orb Heist';
  const description = api && api.assets && typeof api.assets.goal === 'string'
    ? api.assets.goal
    : 'Collect all orbs, avoid sentries, and reach the exit.';

  const levels = parseLevels(api ? api.assets : null);
  const totalOrbs = levels.reduce((sum, level) => sum + level.initialOrbs.size, 0);

  const saved = api && typeof api.loadProgress === 'function'
    ? api.loadProgress()
    : null;
  let bestMoves = saved && Number.isInteger(saved.bestMoves) ? saved.bestMoves : null;

  const run = {
    levelIndex: 0,
    moves: 0,
    resets: 0,
    wins: 0,
    finished: false,
    collectedByLevel: new Array(levels.length).fill(0)
  };

  let levelState = cloneLevelState(levels[run.levelIndex]);

  root.innerHTML = '';

  const shell = document.createElement('section');
  shell.className = 'oh-shell';

  const boardWrap = document.createElement('article');
  boardWrap.className = 'oh-board-wrap';

  const heading = document.createElement('h3');
  heading.className = 'oh-title';
  heading.textContent = title;

  const message = document.createElement('p');
  message.className = 'oh-message';

  const board = document.createElement('div');
  board.className = 'oh-board';

  boardWrap.appendChild(heading);
  boardWrap.appendChild(message);
  boardWrap.appendChild(board);

  const panel = document.createElement('aside');
  panel.className = 'oh-panel';

  const panelTitle = document.createElement('h4');
  panelTitle.textContent = 'Mission';
  const panelDescription = document.createElement('p');
  panelDescription.textContent = description;

  const controlsTitle = document.createElement('h4');
  controlsTitle.textContent = 'Controls';
  const controlsHint = document.createElement('p');
  controlsHint.textContent = 'Arrow keys or WASD. Collect all O cells before exiting.';

  const controls = document.createElement('div');
  controls.className = 'oh-controls';

  const upButton = document.createElement('button');
  upButton.type = 'button';
  upButton.textContent = 'Up';
  const leftButton = document.createElement('button');
  leftButton.type = 'button';
  leftButton.textContent = 'Left';
  const rightButton = document.createElement('button');
  rightButton.type = 'button';
  rightButton.textContent = 'Right';
  const downButton = document.createElement('button');
  downButton.type = 'button';
  downButton.textContent = 'Down';

  const blankA = document.createElement('div');
  const blankB = document.createElement('div');

  controls.appendChild(blankA);
  controls.appendChild(upButton);
  controls.appendChild(blankB);
  controls.appendChild(leftButton);
  controls.appendChild(downButton);
  controls.appendChild(rightButton);

  const actions = document.createElement('div');
  actions.className = 'oh-actions';

  const restartLevelButton = document.createElement('button');
  restartLevelButton.type = 'button';
  restartLevelButton.textContent = 'Restart Current Vault';

  const restartRunButton = document.createElement('button');
  restartRunButton.type = 'button';
  restartRunButton.textContent = 'Reset Full Run';

  actions.appendChild(restartLevelButton);
  actions.appendChild(restartRunButton);

  panel.appendChild(panelTitle);
  panel.appendChild(panelDescription);
  panel.appendChild(controlsTitle);
  panel.appendChild(controlsHint);
  panel.appendChild(controls);
  panel.appendChild(actions);

  shell.appendChild(boardWrap);
  shell.appendChild(panel);
  root.appendChild(shell);

  function totalCollected() {
    return run.collectedByLevel.reduce((sum, count) => sum + count, 0);
  }

  function pushStats() {
    if (api && typeof api.setStats === 'function') {
      api.setStats({
        Cartridge: title,
        Vault: `${run.levelIndex + 1}/${levels.length}`,
        Moves: run.moves,
        Resets: run.resets,
        Collected: `${totalCollected()}/${totalOrbs}`,
        Best: bestMoves === null ? 'none' : bestMoves
      });
    }
  }

  function setMessage(text, statusKind = 'info') {
    message.textContent = text;
    if (api && typeof api.setStatus === 'function') {
      api.setStatus(text, statusKind);
    }
  }

  function resetCurrentLevel(reason, countReset) {
    if (countReset) {
      run.resets += 1;
    }

    run.collectedByLevel[run.levelIndex] = 0;
    levelState = cloneLevelState(levels[run.levelIndex]);

    if (api && typeof api.log === 'function') {
      api.log(`Vault reset (${levels[run.levelIndex].name}): ${reason}`);
    }

    setMessage(reason);
    render();
  }

  function resetFullRun() {
    run.levelIndex = 0;
    run.moves = 0;
    run.resets += 1;
    run.wins = 0;
    run.finished = false;
    run.collectedByLevel = new Array(levels.length).fill(0);
    levelState = cloneLevelState(levels[0]);

    if (api && typeof api.log === 'function') {
      api.log('Full run reset by player.');
    }

    setMessage('Run reset. Vault 1 re-armed.');
    render();
  }

  function completeLevel() {
    run.wins += 1;

    const isFinalLevel = run.levelIndex === levels.length - 1;
    if (isFinalLevel) {
      run.finished = true;

      if (bestMoves === null || run.moves < bestMoves) {
        bestMoves = run.moves;
        if (api && typeof api.saveProgress === 'function') {
          api.saveProgress({ bestMoves });
        }
      }

      const victoryMessage = `All vaults cleared in ${run.moves} moves.`;
      if (api && typeof api.log === 'function') {
        api.log(victoryMessage);
      }

      setMessage(victoryMessage, 'ok');
      render();
      return;
    }

    run.levelIndex += 1;
    levelState = cloneLevelState(levels[run.levelIndex]);
    const nextMessage = `Vault unlocked: ${levels[run.levelIndex].name}`;

    if (api && typeof api.log === 'function') {
      api.log(nextMessage);
    }

    setMessage(nextMessage, 'ok');
    render();
  }

  function render() {
    const level = levels[run.levelIndex];
    board.style.gridTemplateColumns = `repeat(${level.width}, 28px)`;

    board.innerHTML = '';

    for (let y = 0; y < level.height; y += 1) {
      for (let x = 0; x < level.width; x += 1) {
        const cell = document.createElement('div');
        cell.className = 'oh-cell oh-floor';

        const id = keyOf(x, y);
        const isPlayer = levelState.player.x === x && levelState.player.y === y;
        const isGuard = levelState.guards.some((guard) => guard.x === x && guard.y === y);
        const isWallCell = level.walls.has(id);
        const isExitCell = level.exits.has(id);
        const isOrbCell = levelState.orbs.has(id);

        if (isWallCell) {
          cell.className = 'oh-cell oh-wall';
          cell.textContent = '#';
        } else if (isPlayer) {
          cell.className = 'oh-cell oh-player';
          cell.textContent = '@';
        } else if (isGuard) {
          cell.className = 'oh-cell oh-guard';
          cell.textContent = 'G';
        } else if (isOrbCell) {
          cell.className = 'oh-cell oh-orb';
          cell.textContent = 'O';
        } else if (isExitCell) {
          cell.className = 'oh-cell oh-exit';
          cell.textContent = 'E';
        }

        board.appendChild(cell);
      }
    }

    pushStats();
  }

  function tryMove(dx, dy) {
    if (run.finished) {
      setMessage('Run already complete. Use Reset Full Run to play again.', 'ok');
      return;
    }

    const level = levels[run.levelIndex];
    const nextX = levelState.player.x + dx;
    const nextY = levelState.player.y + dy;

    if (isWall(level, nextX, nextY)) {
      setMessage('Blocked by a wall.');
      return;
    }

    levelState.player.x = nextX;
    levelState.player.y = nextY;
    run.moves += 1;

    const playerCell = keyOf(levelState.player.x, levelState.player.y);
    if (levelState.orbs.delete(playerCell)) {
      run.collectedByLevel[run.levelIndex] += 1;
      if (api && typeof api.log === 'function') {
        api.log(`Orb recovered at ${playerCell}`);
      }
    }

    if (guardHitsPlayer(levelState)) {
      resetCurrentLevel('Caught by a sentry. Vault reset.', true);
      return;
    }

    moveGuards(level, levelState);

    if (guardHitsPlayer(levelState)) {
      resetCurrentLevel('A sentry intercepted your route. Vault reset.', true);
      return;
    }

    const onExit = level.exits.has(playerCell);
    if (onExit && levelState.orbs.size > 0) {
      setMessage(`Exit locked. ${levelState.orbs.size} orb(s) still missing.`);
      render();
      return;
    }

    if (onExit && levelState.orbs.size === 0) {
      completeLevel();
      return;
    }

    setMessage(`${level.name}: ${levelState.orbs.size} orb(s) remaining.`);
    render();
  }

  function moveFromKey(event) {
    const rawKey = typeof event.key === 'string' ? event.key : '';
    const move = MOVE_BY_KEY[rawKey] || MOVE_BY_KEY[rawKey.toLowerCase()];
    if (!move) {
      return;
    }

    event.preventDefault();
    tryMove(move[0], move[1]);
  }

  function onDirectionalButton(dx, dy) {
    return () => {
      tryMove(dx, dy);
    };
  }

  const handleUp = onDirectionalButton(0, -1);
  const handleLeft = onDirectionalButton(-1, 0);
  const handleRight = onDirectionalButton(1, 0);
  const handleDown = onDirectionalButton(0, 1);

  window.addEventListener('keydown', moveFromKey);
  upButton.addEventListener('click', handleUp);
  leftButton.addEventListener('click', handleLeft);
  rightButton.addEventListener('click', handleRight);
  downButton.addEventListener('click', handleDown);

  restartLevelButton.addEventListener('click', () => {
    resetCurrentLevel('Vault manually restarted.', true);
  });

  restartRunButton.addEventListener('click', () => {
    resetFullRun();
  });

  setMessage(`${levels[0].name}: collect every orb and reach the exit.`);
  render();

  return {
    destroy() {
      window.removeEventListener('keydown', moveFromKey);
      upButton.removeEventListener('click', handleUp);
      leftButton.removeEventListener('click', handleLeft);
      rightButton.removeEventListener('click', handleRight);
      downButton.removeEventListener('click', handleDown);
      root.innerHTML = '';
    }
  };
}
