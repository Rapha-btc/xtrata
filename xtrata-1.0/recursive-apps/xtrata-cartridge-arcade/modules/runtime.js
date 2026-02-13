const RUNTIME_VERSION = '1.0.0';
const STYLE_ID = 'xtrata-arcade-runtime-style';

function ensureRuntimeStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .xa-shell {
      font-family: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
      border: 1px solid #2c3542;
      border-radius: 14px;
      background: linear-gradient(160deg, #101720 0%, #0b1119 100%);
      color: #e8eef6;
      padding: 16px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
    }
    .xa-header h2 {
      margin: 0;
      font-size: 1.2rem;
      letter-spacing: 0.03em;
    }
    .xa-header p {
      margin: 6px 0 0;
      color: #a6b2c2;
      font-size: 0.92rem;
    }
    .xa-toolbar {
      margin-top: 12px;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
    }
    .xa-toolbar select,
    .xa-toolbar button {
      border-radius: 8px;
      border: 1px solid #3a4454;
      background: #161f2a;
      color: #e8eef6;
      padding: 8px 10px;
      font-size: 0.9rem;
    }
    .xa-toolbar button {
      cursor: pointer;
      background: #1f2d3f;
      font-weight: 600;
    }
    .xa-toolbar button:hover {
      background: #27415e;
    }
    .xa-status {
      margin-top: 10px;
      border-radius: 8px;
      background: #0f1620;
      border: 1px solid #2a3443;
      padding: 8px 10px;
      font-size: 0.9rem;
      color: #9db2c8;
      min-height: 20px;
    }
    .xa-status.ok {
      color: #8fe2ac;
      border-color: #24543a;
      background: #102419;
    }
    .xa-status.error {
      color: #f3a7a7;
      border-color: #5a2d2d;
      background: #241010;
    }
    .xa-stats {
      margin-top: 10px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 8px;
    }
    .xa-stat {
      border: 1px solid #2a3443;
      border-radius: 8px;
      background: #0f1620;
      padding: 8px;
    }
    .xa-stat-label {
      display: block;
      font-size: 0.72rem;
      color: #8f9db0;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .xa-stat-value {
      display: block;
      margin-top: 4px;
      font-size: 0.96rem;
      font-weight: 600;
      color: #d9e5f5;
    }
    .xa-stage {
      margin-top: 12px;
      border-radius: 12px;
      border: 1px solid #2a3443;
      background: radial-gradient(circle at 30% 20%, #15202f 0%, #0f1620 75%);
      padding: 12px;
      min-height: 320px;
    }
    .xa-provenance {
      margin-top: 12px;
      border-radius: 8px;
      border: 1px solid #2a3443;
      background: #0f1620;
      padding: 10px;
    }
    .xa-provenance h3 {
      margin: 0 0 8px;
      font-size: 0.9rem;
      color: #9db2c8;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .xa-provenance table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.82rem;
    }
    .xa-provenance th,
    .xa-provenance td {
      border-top: 1px solid #233041;
      padding: 6px 4px;
      text-align: left;
      vertical-align: top;
    }
    .xa-provenance th {
      width: 26%;
      color: #90a2b7;
      font-weight: 600;
    }
    .xa-provenance td {
      color: #cad9eb;
      word-break: break-word;
    }
    .xa-stage__notice {
      border: 1px dashed #3e4c60;
      border-radius: 8px;
      background: #121c2b;
      color: #93a6be;
      font-size: 0.9rem;
      padding: 10px;
    }
  `;
  document.head.appendChild(style);
}

function importModuleFromSource(source, label) {
  const blob = new Blob([source], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  return import(url)
    .catch((error) => {
      throw new Error(`Failed to import ${label}: ${error.message || String(error)}`);
    })
    .finally(() => {
      URL.revokeObjectURL(url);
    });
}

function toText(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function toPositiveInt(value, fieldName) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return n;
}

function normalizeManifest(rawManifest) {
  if (!rawManifest || typeof rawManifest !== 'object') {
    throw new Error('Manifest is missing or invalid');
  }

  const cartridgesRaw = Array.isArray(rawManifest.cartridges)
    ? rawManifest.cartridges
    : [];

  if (!cartridgesRaw.length) {
    throw new Error('Manifest must include at least one cartridge');
  }

  const cartridges = cartridgesRaw.map((entry, index) => {
    const id = toText(entry.id).trim();
    if (!id) {
      throw new Error(`cartridges[${index}].id is required`);
    }

    return {
      id,
      title: toText(entry.title, id),
      description: toText(entry.description, 'No description provided.'),
      version: toText(entry.version, '0.0.0'),
      logicModuleId: toPositiveInt(entry.logicModuleId, `cartridges[${index}].logicModuleId`),
      assetsModuleId: toPositiveInt(entry.assetsModuleId, `cartridges[${index}].assetsModuleId`)
    };
  });

  const byId = new Map();
  cartridges.forEach((cartridge) => {
    if (byId.has(cartridge.id)) {
      throw new Error(`Duplicate cartridge id in manifest: ${cartridge.id}`);
    }
    byId.set(cartridge.id, cartridge);
  });

  const defaultCartridge = toText(rawManifest.defaultCartridge).trim();
  const resolvedDefault = defaultCartridge && byId.has(defaultCartridge)
    ? defaultCartridge
    : cartridges[0].id;

  return {
    schema: toText(rawManifest.schema, 'xtrata-cartridge-manifest@1'),
    arcadeId: toText(rawManifest.arcadeId, 'xtrata-cartridge-arcade'),
    arcadeTitle: toText(rawManifest.arcadeTitle, 'Xtrata Cartridge Arcade'),
    arcadeSubtitle: toText(
      rawManifest.arcadeSubtitle,
      'Recursive, modular, and fully on-chain game cartridges.'
    ),
    defaultCartridge: resolvedDefault,
    cartridges,
    cartridgesById: byId
  };
}

function tableRow(label, value) {
  const tr = document.createElement('tr');
  const th = document.createElement('th');
  th.textContent = label;
  const td = document.createElement('td');
  td.textContent = String(value);
  tr.appendChild(th);
  tr.appendChild(td);
  return tr;
}

export async function bootArcade(options) {
  const root = options && options.root;
  if (!root || !(root instanceof HTMLElement)) {
    throw new Error('bootArcade requires a root HTMLElement');
  }

  const resolveModuleSource = options && options.resolveModuleSource;
  if (typeof resolveModuleSource !== 'function') {
    throw new Error('bootArcade requires resolveModuleSource(moduleId, label)');
  }

  const logger = options && typeof options.log === 'function'
    ? options.log
    : (line) => {
      console.log(`[runtime] ${line}`);
    };

  const manifest = normalizeManifest(options ? options.manifest : null);
  const provenance = options && options.provenance ? options.provenance : {};

  ensureRuntimeStyles();
  root.innerHTML = '';

  const shell = document.createElement('section');
  shell.className = 'xa-shell';

  const header = document.createElement('header');
  header.className = 'xa-header';
  const title = document.createElement('h2');
  title.textContent = manifest.arcadeTitle;
  const subtitle = document.createElement('p');
  subtitle.textContent = manifest.arcadeSubtitle;
  header.appendChild(title);
  header.appendChild(subtitle);

  const toolbar = document.createElement('div');
  toolbar.className = 'xa-toolbar';

  const select = document.createElement('select');
  manifest.cartridges.forEach((cartridge) => {
    const option = document.createElement('option');
    option.value = cartridge.id;
    option.textContent = `${cartridge.title} (${cartridge.version})`;
    select.appendChild(option);
  });

  const reloadButton = document.createElement('button');
  reloadButton.type = 'button';
  reloadButton.textContent = 'Reload Cartridge';

  toolbar.appendChild(select);
  toolbar.appendChild(reloadButton);

  const status = document.createElement('div');
  status.className = 'xa-status';

  const stats = document.createElement('div');
  stats.className = 'xa-stats';

  const stage = document.createElement('div');
  stage.className = 'xa-stage';

  const provenancePanel = document.createElement('section');
  provenancePanel.className = 'xa-provenance';
  const provenanceTitle = document.createElement('h3');
  provenanceTitle.textContent = 'On-Chain Module Provenance';
  const provenanceTable = document.createElement('table');
  const provenanceBody = document.createElement('tbody');
  provenanceTable.appendChild(provenanceBody);
  provenancePanel.appendChild(provenanceTitle);
  provenancePanel.appendChild(provenanceTable);

  shell.appendChild(header);
  shell.appendChild(toolbar);
  shell.appendChild(status);
  shell.appendChild(stats);
  shell.appendChild(stage);
  shell.appendChild(provenancePanel);

  root.appendChild(shell);

  function setStatus(message, kind = 'info') {
    status.className = kind === 'ok'
      ? 'xa-status ok'
      : kind === 'error'
        ? 'xa-status error'
        : 'xa-status';
    status.textContent = message;
  }

  function setStats(values) {
    stats.innerHTML = '';
    const entries = Object.entries(values || {});
    if (!entries.length) {
      return;
    }

    entries.forEach(([label, value]) => {
      const card = document.createElement('article');
      card.className = 'xa-stat';

      const labelEl = document.createElement('span');
      labelEl.className = 'xa-stat-label';
      labelEl.textContent = label;

      const valueEl = document.createElement('span');
      valueEl.className = 'xa-stat-value';
      valueEl.textContent = String(value);

      card.appendChild(labelEl);
      card.appendChild(valueEl);
      stats.appendChild(card);
    });
  }

  const seenProvenanceKeys = new Set();
  function appendProvenance(label, value) {
    const key = `${label}::${String(value)}`;
    if (seenProvenanceKeys.has(key)) {
      return;
    }
    seenProvenanceKeys.add(key);
    provenanceBody.appendChild(tableRow(label, value));
  }

  appendProvenance('Runtime Version', RUNTIME_VERSION);
  appendProvenance('Manifest Schema', manifest.schema);
  appendProvenance('Arcade ID', manifest.arcadeId);
  appendProvenance('Contract', provenance.contractId || 'unknown');
  appendProvenance('Runtime Module ID', provenance.runtimeModuleId || 'unknown');
  appendProvenance('Manifest Module ID', provenance.manifestModuleId || 'unknown');
  appendProvenance(
    'Declared Dependencies',
    Array.isArray(provenance.declaredDependencyIds) && provenance.declaredDependencyIds.length
      ? provenance.declaredDependencyIds.join(', ')
      : 'none'
  );

  setStatus('Arcade runtime initialized.', 'ok');
  setStats({ Cartridge: manifest.defaultCartridge, State: 'Idle' });

  let activeCleanup = null;
  let loadSequence = 0;

  function clearStageNotice(message) {
    stage.innerHTML = '';
    const notice = document.createElement('div');
    notice.className = 'xa-stage__notice';
    notice.textContent = message;
    stage.appendChild(notice);
  }

  function saveProgress(cartridgeId, payload) {
    const storageKey = `xtrata:arcade:${manifest.arcadeId}:${cartridgeId}`;
    try {
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch (error) {
      logger(`Progress save failed for ${cartridgeId}: ${error.message || String(error)}`);
    }
  }

  function loadProgress(cartridgeId) {
    const storageKey = `xtrata:arcade:${manifest.arcadeId}:${cartridgeId}`;
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      logger(`Progress load failed for ${cartridgeId}: ${error.message || String(error)}`);
      return null;
    }
  }

  async function loadCartridge(cartridgeId) {
    loadSequence += 1;
    const currentSequence = loadSequence;

    const cartridge = manifest.cartridgesById.get(cartridgeId);
    if (!cartridge) {
      throw new Error(`Unknown cartridge: ${cartridgeId}`);
    }

    if (typeof activeCleanup === 'function') {
      try {
        activeCleanup();
      } catch (error) {
        logger(`Previous cartridge cleanup failed: ${error.message || String(error)}`);
      }
      activeCleanup = null;
    }

    clearStageNotice(`Loading ${cartridge.title}...`);
    setStatus(`Loading cartridge ${cartridge.id}...`);
    setStats({ Cartridge: cartridge.title, Version: cartridge.version, State: 'Loading' });

    logger(`Resolving logic module ${cartridge.logicModuleId}`);
    logger(`Resolving assets module ${cartridge.assetsModuleId}`);

    const [logicSource, assetsSource] = await Promise.all([
      resolveModuleSource(cartridge.logicModuleId, `${cartridge.id}:logic`),
      resolveModuleSource(cartridge.assetsModuleId, `${cartridge.id}:assets`)
    ]);

    if (currentSequence !== loadSequence) {
      return;
    }

    appendProvenance(`Logic ${cartridge.id}`, `${cartridge.logicModuleId} (${logicSource.bytes} bytes)`);
    appendProvenance(`Assets ${cartridge.id}`, `${cartridge.assetsModuleId} (${assetsSource.bytes} bytes)`);

    let logicModule;
    try {
      logicModule = await importModuleFromSource(
        logicSource.text,
        `${cartridge.id} logic module`
      );
    } catch (error) {
      throw new Error(`Unable to import logic module: ${error.message || String(error)}`);
    }

    let assets;
    try {
      assets = JSON.parse(assetsSource.text);
    } catch (error) {
      throw new Error(`Assets module is not valid JSON: ${error.message || String(error)}`);
    }

    if (typeof logicModule.mountCartridge !== 'function') {
      throw new Error('Logic module must export mountCartridge(root, api)');
    }

    stage.innerHTML = '';

    const cartridgeApi = {
      runtimeVersion: RUNTIME_VERSION,
      manifest,
      cartridge,
      assets,
      setStatus,
      setStats,
      log: (line) => logger(`[${cartridge.id}] ${line}`),
      saveProgress: (payload) => saveProgress(cartridge.id, payload),
      loadProgress: () => loadProgress(cartridge.id)
    };

    const mounted = await logicModule.mountCartridge(stage, cartridgeApi);
    if (currentSequence !== loadSequence) {
      if (mounted && typeof mounted.destroy === 'function') {
        mounted.destroy();
      }
      return;
    }

    activeCleanup = mounted && typeof mounted.destroy === 'function'
      ? mounted.destroy
      : null;

    setStatus(`Loaded ${cartridge.title}.`, 'ok');
    logger(`Cartridge ready: ${cartridge.title}`);
  }

  reloadButton.addEventListener('click', () => {
    loadCartridge(select.value).catch((error) => {
      clearStageNotice(error.message || String(error));
      setStatus(error.message || String(error), 'error');
      logger(`Reload failed: ${error.message || String(error)}`);
    });
  });

  select.addEventListener('change', () => {
    loadCartridge(select.value).catch((error) => {
      clearStageNotice(error.message || String(error));
      setStatus(error.message || String(error), 'error');
      logger(`Cartridge switch failed: ${error.message || String(error)}`);
    });
  });

  select.value = manifest.defaultCartridge;
  await loadCartridge(manifest.defaultCartridge);

  return {
    destroy() {
      if (typeof activeCleanup === 'function') {
        activeCleanup();
        activeCleanup = null;
      }
      root.innerHTML = '';
    }
  };
}
