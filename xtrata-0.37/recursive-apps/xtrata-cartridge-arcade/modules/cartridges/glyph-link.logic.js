const STYLE_ID = 'glyph-link-cartridge-style-v1';
const FALLBACK_SYMBOLS = [
  'A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7', 'H8', 'J9', 'K0',
  'L1', 'M2', 'N3', 'P4', 'Q5', 'R6', 'S7', 'T8', 'U9', 'V0',
  'W1', 'X2', 'Y3', 'Z4'
];

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .gl-shell {
      display: grid;
      grid-template-columns: minmax(280px, 1fr) 240px;
      gap: 12px;
      align-items: start;
    }
    .gl-board-wrap {
      border: 1px solid #35506a;
      border-radius: 10px;
      background: #0c131d;
      padding: 10px;
    }
    .gl-title {
      margin: 0 0 6px;
      font-size: 1rem;
      color: #c7e4ff;
      letter-spacing: 0.03em;
    }
    .gl-message {
      margin: 0 0 10px;
      min-height: 20px;
      color: #9bb8d3;
      font-size: 0.85rem;
    }
    .gl-board {
      display: grid;
      gap: 6px;
      align-content: start;
    }
    .gl-card {
      border: 1px solid #3a5673;
      border-radius: 9px;
      background: #17324c;
      color: #d6ecff;
      min-height: 46px;
      font: 700 0.88rem "IBM Plex Mono", "Menlo", monospace;
      letter-spacing: 0.02em;
      cursor: pointer;
      transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
    }
    .gl-card:hover {
      background: #1e3f60;
    }
    .gl-card:active {
      transform: translateY(1px);
    }
    .gl-card.is-hidden {
      background: #132131;
      color: #88a2bf;
    }
    .gl-card.is-revealed {
      background: #244d35;
      color: #d6ffe3;
      border-color: #3a7a56;
    }
    .gl-card.is-matched {
      background: #42351d;
      color: #ffe7b4;
      border-color: #7a6330;
      cursor: default;
    }
    .gl-panel {
      border: 1px solid #35506a;
      border-radius: 10px;
      background: #101a28;
      padding: 10px;
      color: #a9c0da;
      font-size: 0.84rem;
    }
    .gl-panel h4 {
      margin: 0 0 8px;
      color: #cbdef1;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-size: 0.74rem;
    }
    .gl-panel p {
      margin: 0 0 8px;
      line-height: 1.43;
    }
    .gl-controls {
      display: grid;
      gap: 6px;
      margin-top: 8px;
    }
    .gl-controls button {
      border: 1px solid #406182;
      border-radius: 8px;
      background: #183654;
      color: #deefff;
      padding: 8px;
      font-size: 0.8rem;
      cursor: pointer;
      text-align: left;
    }
    .gl-controls button:hover {
      background: #21486e;
    }

    @media (max-width: 860px) {
      .gl-shell {
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

function shuffle(list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

function normalizeLevel(entry, index) {
  const rows = Math.min(5, Math.max(2, toPositiveInt(entry && entry.rows, 4)));
  const cols = Math.min(6, Math.max(2, toPositiveInt(entry && entry.cols, 4)));
  const cells = rows * cols;
  const evenCells = cells % 2 === 0 ? cells : cells - 1;
  const pairCount = evenCells / 2;

  const rawSymbols = Array.isArray(entry && entry.symbols)
    ? entry.symbols.filter((item) => typeof item === 'string' && item.trim())
    : [];

  const uniqueSymbols = [];
  rawSymbols.forEach((symbol) => {
    const cleaned = symbol.trim().slice(0, 3);
    if (!cleaned || uniqueSymbols.includes(cleaned)) {
      return;
    }
    uniqueSymbols.push(cleaned);
  });

  for (let i = 0; uniqueSymbols.length < pairCount && i < FALLBACK_SYMBOLS.length; i += 1) {
    const symbol = FALLBACK_SYMBOLS[i];
    if (!uniqueSymbols.includes(symbol)) {
      uniqueSymbols.push(symbol);
    }
  }

  while (uniqueSymbols.length < pairCount) {
    uniqueSymbols.push(`G${uniqueSymbols.length + 1}`);
  }

  return {
    id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : `deck-${index + 1}`,
    name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : `Deck ${index + 1}`,
    rows,
    cols,
    pairCount,
    symbols: uniqueSymbols.slice(0, pairCount)
  };
}

function parseConfig(assets) {
  const payload = assets && typeof assets === 'object' ? assets : {};

  const levelsSource = Array.isArray(payload.levels) && payload.levels.length
    ? payload.levels
    : [
      { id: 'relay', name: 'Relay Deck', rows: 3, cols: 4, symbols: ['A1', 'B2', 'C3', 'D4', 'E5', 'F6'] },
      { id: 'cipher', name: 'Cipher Deck', rows: 4, cols: 4, symbols: ['G7', 'H8', 'J9', 'K0', 'L1', 'M2', 'N3', 'P4'] },
      { id: 'quantum', name: 'Quantum Deck', rows: 4, cols: 5, symbols: ['Q5', 'R6', 'S7', 'T8', 'U9', 'V0', 'W1', 'X2', 'Y3', 'Z4'] }
    ];

  const levels = levelsSource.map((entry, index) => normalizeLevel(entry, index));

  return {
    title: typeof payload.title === 'string' ? payload.title : 'Glyph Link',
    objective: typeof payload.objective === 'string'
      ? payload.objective
      : 'Reveal and match every pair before moving to the next deck.',
    mismatchDelayMs: Math.min(1500, Math.max(300, toPositiveInt(payload.mismatchDelayMs, 720))),
    levels
  };
}

function buildCards(level) {
  const symbols = level.symbols.slice(0, level.pairCount);
  const cardPool = [];

  symbols.forEach((symbol, symbolIndex) => {
    cardPool.push({
      id: `${symbolIndex}-a`,
      symbol,
      revealed: false,
      matched: false
    });
    cardPool.push({
      id: `${symbolIndex}-b`,
      symbol,
      revealed: false,
      matched: false
    });
  });

  return shuffle(cardPool);
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

  let bestSeconds = saved && Number.isInteger(saved.bestSeconds)
    ? saved.bestSeconds
    : null;

  const run = {
    levelIndex: 0,
    moves: 0,
    elapsedSec: 0,
    finished: false,
    matchedByLevel: new Array(config.levels.length).fill(0)
  };

  let currentLevel = config.levels[0];
  let cards = buildCards(currentLevel);
  let revealed = [];
  let levelMatches = 0;
  let lockBoard = false;
  let clockInterval = null;
  const pendingTimeouts = new Set();

  root.innerHTML = '';

  const shell = document.createElement('section');
  shell.className = 'gl-shell';

  const boardWrap = document.createElement('article');
  boardWrap.className = 'gl-board-wrap';

  const heading = document.createElement('h3');
  heading.className = 'gl-title';
  heading.textContent = title;

  const message = document.createElement('p');
  message.className = 'gl-message';

  const board = document.createElement('div');
  board.className = 'gl-board';

  boardWrap.appendChild(heading);
  boardWrap.appendChild(message);
  boardWrap.appendChild(board);

  const panel = document.createElement('aside');
  panel.className = 'gl-panel';

  const missionTitle = document.createElement('h4');
  missionTitle.textContent = 'Goal';
  const missionText = document.createElement('p');
  missionText.textContent = config.objective;

  const controlsTitle = document.createElement('h4');
  controlsTitle.textContent = 'Controls';
  const controlsHint = document.createElement('p');
  controlsHint.textContent = 'Click two cards to reveal a pair. R resets run, L resets current deck.';

  const controls = document.createElement('div');
  controls.className = 'gl-controls';

  const restartDeckButton = document.createElement('button');
  restartDeckButton.type = 'button';
  restartDeckButton.textContent = 'Restart Current Deck';

  const restartRunButton = document.createElement('button');
  restartRunButton.type = 'button';
  restartRunButton.textContent = 'Restart Full Run';

  controls.appendChild(restartDeckButton);
  controls.appendChild(restartRunButton);

  panel.appendChild(missionTitle);
  panel.appendChild(missionText);
  panel.appendChild(controlsTitle);
  panel.appendChild(controlsHint);
  panel.appendChild(controls);

  shell.appendChild(boardWrap);
  shell.appendChild(panel);
  root.appendChild(shell);

  function queueTimeout(fn, delayMs) {
    const id = window.setTimeout(() => {
      pendingTimeouts.delete(id);
      fn();
    }, delayMs);
    pendingTimeouts.add(id);
  }

  function clearTimeouts() {
    pendingTimeouts.forEach((id) => {
      window.clearTimeout(id);
    });
    pendingTimeouts.clear();
  }

  function totalPairs() {
    return config.levels.reduce((sum, level) => sum + level.pairCount, 0);
  }

  function totalMatched() {
    return run.matchedByLevel.reduce((sum, count) => sum + count, 0);
  }

  function clearClock() {
    if (clockInterval !== null) {
      window.clearInterval(clockInterval);
      clockInterval = null;
    }
  }

  function startClock() {
    clearClock();
    clockInterval = window.setInterval(() => {
      if (run.finished) {
        return;
      }
      run.elapsedSec += 1;
      pushStats();
    }, 1000);
  }

  function pushStats() {
    if (api && typeof api.setStats === 'function') {
      api.setStats({
        Cartridge: title,
        Level: `${run.levelIndex + 1}/${config.levels.length}`,
        Moves: run.moves,
        Matched: `${totalMatched()}/${totalPairs()}`,
        Time: `${run.elapsedSec}s`,
        Best: bestSeconds === null ? 'none' : `${bestSeconds}s`
      });
    }
  }

  function setMessage(text, kind = 'info') {
    message.textContent = text;
    if (api && typeof api.setStatus === 'function') {
      api.setStatus(text, kind);
    }
  }

  function renderBoard() {
    board.style.gridTemplateColumns = `repeat(${currentLevel.cols}, minmax(48px, 1fr))`;
    board.innerHTML = '';

    cards.forEach((card, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'gl-card is-hidden';
      button.dataset.index = String(index);

      if (card.matched) {
        button.className = 'gl-card is-matched';
        button.textContent = card.symbol;
        button.disabled = true;
      } else if (card.revealed) {
        button.className = 'gl-card is-revealed';
        button.textContent = card.symbol;
      } else {
        button.textContent = '?';
      }

      if (run.finished || lockBoard) {
        button.disabled = button.disabled || !card.revealed;
      }

      board.appendChild(button);
    });

    pushStats();
  }

  function loadLevel(levelIndex, reason) {
    currentLevel = config.levels[levelIndex];
    cards = buildCards(currentLevel);
    revealed = [];
    levelMatches = run.matchedByLevel[levelIndex] || 0;
    run.levelIndex = levelIndex;
    lockBoard = false;

    setMessage(reason || `Deck loaded: ${currentLevel.name}.`);
    renderBoard();
  }

  function completeRun() {
    run.finished = true;
    clearClock();

    if (bestSeconds === null || run.elapsedSec < bestSeconds) {
      bestSeconds = run.elapsedSec;
      if (api && typeof api.saveProgress === 'function') {
        api.saveProgress({ bestSeconds });
      }
    }

    const summary = `Run complete in ${run.elapsedSec}s with ${run.moves} moves.`;
    setMessage(summary, 'ok');
    if (api && typeof api.log === 'function') {
      api.log(summary);
    }
    renderBoard();
  }

  function advanceLevel() {
    const isLast = run.levelIndex >= config.levels.length - 1;
    if (isLast) {
      completeRun();
      return;
    }

    const nextIndex = run.levelIndex + 1;
    queueTimeout(() => {
      loadLevel(nextIndex, `Deck clear. Proceeding to ${config.levels[nextIndex].name}.`);
    }, 420);
  }

  function onCardPick(index) {
    if (run.finished || lockBoard) {
      return;
    }

    const card = cards[index];
    if (!card || card.revealed || card.matched) {
      return;
    }

    card.revealed = true;
    revealed.push(index);
    renderBoard();

    if (revealed.length < 2) {
      return;
    }

    run.moves += 1;

    const first = cards[revealed[0]];
    const second = cards[revealed[1]];

    if (first.symbol === second.symbol) {
      first.matched = true;
      second.matched = true;
      revealed = [];
      levelMatches += 1;
      run.matchedByLevel[run.levelIndex] = levelMatches;

      const pairMessage = `Pair matched (${first.symbol}).`;
      setMessage(pairMessage, 'ok');
      if (api && typeof api.log === 'function') {
        api.log(pairMessage);
      }

      if (levelMatches >= currentLevel.pairCount) {
        setMessage(`Deck ${currentLevel.name} completed.`, 'ok');
        advanceLevel();
      }

      renderBoard();
      return;
    }

    lockBoard = true;
    setMessage('Mismatch. Synchronizing...');

    queueTimeout(() => {
      const firstCard = cards[revealed[0]];
      const secondCard = cards[revealed[1]];
      if (firstCard) {
        firstCard.revealed = false;
      }
      if (secondCard) {
        secondCard.revealed = false;
      }
      revealed = [];
      lockBoard = false;
      renderBoard();
    }, config.mismatchDelayMs);
  }

  function restartCurrentDeck() {
    run.matchedByLevel[run.levelIndex] = 0;
    levelMatches = 0;
    cards = buildCards(currentLevel);
    revealed = [];
    lockBoard = false;
    setMessage(`Deck restarted: ${currentLevel.name}.`);
    renderBoard();
  }

  function restartRun() {
    run.levelIndex = 0;
    run.moves = 0;
    run.elapsedSec = 0;
    run.finished = false;
    run.matchedByLevel = new Array(config.levels.length).fill(0);

    clearTimeouts();
    loadLevel(0, `Run reset. Starting at ${config.levels[0].name}.`);
    startClock();

    if (api && typeof api.log === 'function') {
      api.log('Glyph Link run reset by player.');
    }
  }

  function onBoardClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const cardButton = target.closest('button[data-index]');
    if (!(cardButton instanceof HTMLButtonElement)) {
      return;
    }

    const index = Number(cardButton.dataset.index);
    if (!Number.isInteger(index)) {
      return;
    }

    onCardPick(index);
  }

  function onKeyDown(event) {
    const raw = typeof event.key === 'string' ? event.key : '';
    const key = raw.toLowerCase();

    if (key === 'r') {
      event.preventDefault();
      restartRun();
    } else if (key === 'l') {
      event.preventDefault();
      restartCurrentDeck();
    }
  }

  const handleRestartDeck = () => restartCurrentDeck();
  const handleRestartRun = () => restartRun();

  board.addEventListener('click', onBoardClick);
  restartDeckButton.addEventListener('click', handleRestartDeck);
  restartRunButton.addEventListener('click', handleRestartRun);
  window.addEventListener('keydown', onKeyDown);

  loadLevel(0, `Memory link established: ${config.levels[0].name}.`);
  startClock();

  return {
    destroy() {
      clearClock();
      clearTimeouts();
      board.removeEventListener('click', onBoardClick);
      restartDeckButton.removeEventListener('click', handleRestartDeck);
      restartRunButton.removeEventListener('click', handleRestartRun);
      window.removeEventListener('keydown', onKeyDown);
      root.innerHTML = '';
    }
  };
}
