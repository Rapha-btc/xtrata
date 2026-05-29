// HTML_Template.js
(function () {

const XTRATA_PLAYER_TEMPLATE_VERSION = 'xtrata-opus-player-v5.1';

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);

const escapeAttr = escapeHtml;

const escapeJsonForScript = (value) =>
  JSON.stringify(value, null, 2).replace(/</g, '\\u003c');

const stripDataUriPrefix = (value) => {
  const text = String(value ?? '').trim();
  const commaIndex = text.indexOf(',');
  return commaIndex >= 0 ? text.slice(commaIndex + 1) : text;
};

const normalizeBase64 = (value) => stripDataUriPrefix(value).replace(/\s+/g, '');

const normalizeMimeForDataUri = (mimeType, fallback) => {
  const raw = String(mimeType || fallback || '').trim();
  return (raw || fallback).replace(/\s*;\s*/g, ';');
};

const sanitizeAudioMimeType = (mimeType) => {
  const raw = String(mimeType || '').trim();
  return raw.startsWith('audio/') ? raw : 'audio/webm; codecs=opus';
};

const sanitizeVisualMimeType = (mimeType) => {
  const raw = String(mimeType || '').trim();
  return raw.startsWith('image/') || raw.startsWith('video/') ? raw : 'image/png';
};

const sanitizeImageMimeType = sanitizeVisualMimeType;

const AUDIO_ASSET_TYPE_LABELS = {
  song: 'Song',
  sample: 'Sample',
  stem: 'Stem',
  loop: 'Loop',
  voice: 'Voice',
  other: 'Audio'
};

const normalizeAssetType = (value) => {
  const key = String(value || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(AUDIO_ASSET_TYPE_LABELS, key)
    ? key
    : 'song';
};

const buildInitials = (value) => {
  const words = String(value || 'X')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length > 1) {
    return words.slice(0, 2).map((word) => word.slice(0, 1)).join('').toUpperCase();
  }
  return (words[0] || 'X').slice(0, 2).toUpperCase();
};

const sanitizeTokenId = (value) => {
  const text = String(value ?? '').trim().replace(/^#/, '');
  return /^\d+$/.test(text) ? text : '';
};

const sanitizeNetwork = (value) =>
  String(value || 'mainnet').trim().toLowerCase() === 'testnet'
    ? 'testnet'
    : 'mainnet';

const dedupe = (values) => Array.from(new Set(values.filter(Boolean)));

const getVisualSourceMode = (config) => {
  if (config.visualSourceMode === 'recursive') return 'recursive';
  if (config.visualSourceMode === 'embedded') return 'embedded';
  const recursive = config.recursive || {};
  return sanitizeTokenId(recursive.coverTokenId) || String(recursive.coverUrl || '').trim()
    ? 'recursive'
    : 'embedded';
};

const buildRuntimeContentUrl = ({ tokenId, contractId, network }) => {
  const safeTokenId = sanitizeTokenId(tokenId);
  const safeContractId = String(contractId || '').trim();
  const safeNetwork = sanitizeNetwork(network);
  if (!safeTokenId) {
    return '';
  }
  if (safeNetwork === 'mainnet') {
    return `https://xtrata.xyz/inscription/${safeTokenId}`;
  }
  if (safeContractId) {
    const params = new URLSearchParams({
      contractId: safeContractId,
      tokenId: safeTokenId,
      network: safeNetwork
    });
    return `https://xtrata.xyz/runtime/content?${params.toString()}`;
  }
  return `https://xtrata.xyz/inscription/${safeTokenId}`;
};

const buildPlayerSource = (config) => {
  const mode =
    config.audioSourceMode === 'recursive' || config.mode === 'recursive'
      ? 'recursive'
      : 'embedded';
  const audioMimeType = sanitizeAudioMimeType(config.audioMimeType);
  if (mode === 'recursive') {
    const recursive = config.recursive || {};
    const explicitUrl = String(recursive.audioUrl || '').trim();
    const generatedUrl = buildRuntimeContentUrl({
      tokenId: recursive.audioTokenId || recursive.tokenId,
      contractId: recursive.contractId,
      network: recursive.network
    });
    return {
      mode,
      audioMimeType,
      source: explicitUrl || generatedUrl,
      sourceKind: explicitUrl ? 'custom-url' : generatedUrl ? 'xtrata-runtime' : ''
    };
  }

  const audioBase64 = normalizeBase64(config.audioBase64);
  return {
    mode,
    audioMimeType,
    source: audioBase64
      ? `data:${normalizeMimeForDataUri(audioMimeType, 'audio/webm;codecs=opus')};base64,${audioBase64}`
      : '',
    sourceKind: 'embedded-base64'
  };
};

const buildDependencies = (config) => {
  const recursive = config.recursive || {};
  return dedupe([
    config.audioSourceMode === 'recursive' || config.mode === 'recursive'
      ? sanitizeTokenId(recursive.audioTokenId || recursive.tokenId)
      : '',
    getVisualSourceMode(config) === 'recursive'
      ? sanitizeTokenId(recursive.coverTokenId)
      : ''
  ]);
};

const getRecursiveCoverKind = (config) => {
  const kind = String(config.recursive?.coverKind || '').trim().toLowerCase();
  return kind === 'video' ? 'video' : 'image';
};

const buildRecursiveCoverSource = (config) => {
  const recursive = config.recursive || {};
  const explicitUrl = String(recursive.coverUrl || '').trim();
  if (explicitUrl) {
    return {
      source: explicitUrl,
      kind: getRecursiveCoverKind(config),
      sourceKind: 'custom-url'
    };
  }
  const generatedUrl = buildRuntimeContentUrl({
    tokenId: recursive.coverTokenId,
    contractId: recursive.coverContractId || recursive.contractId,
    network: recursive.coverNetwork || recursive.network
  });
  return {
    source: generatedUrl,
    kind: getRecursiveCoverKind(config),
    sourceKind: generatedUrl ? 'xtrata-runtime' : ''
  };
};

const buildVisualSource = (config) => {
  const sourceMode = getVisualSourceMode(config);
  if (sourceMode === 'recursive') {
    return buildRecursiveCoverSource(config);
  }

  const visualBase64 = normalizeBase64(config.visualBase64 || config.imageBase64);
  if (!visualBase64) {
    return { source: '', kind: 'placeholder', sourceKind: '' };
  }
  const visualMimeType = sanitizeVisualMimeType(
    config.visualMimeType || config.imageMimeType
  );
  return {
    source: `data:${normalizeMimeForDataUri(
      visualMimeType,
      'image/png'
    )};base64,${visualBase64}`,
    kind: visualMimeType.startsWith('video/') ? 'video' : 'image',
    sourceKind: 'embedded-base64'
  };
};

const buildCoverMarkup = (config, title) => {
  const visual = buildVisualSource(config);
  if (!visual.source) {
    return `<div class="cover-placeholder" aria-hidden="true">${escapeHtml(
      buildInitials(title)
    )}</div>`;
  }
  if (visual.kind === 'video') {
    const typeAttribute =
      visual.source.startsWith('data:') && config.visualMimeType
        ? ` type="${escapeAttr(sanitizeVisualMimeType(config.visualMimeType))}"`
        : '';
    return `<video muted loop playsinline autoplay preload="metadata" aria-label="${escapeAttr(
      title
    )} visual"><source src="${escapeAttr(
      visual.source
    )}"${typeAttribute}>This browser cannot play the visual.</video>`;
  }
  return `<img src="${escapeAttr(visual.source)}" alt="${escapeAttr(title)} cover art">`;
};

const buildXtrataAudioPlayerHtml = (config) => {
  const metadata = config.metadata || {};
  const title = String(metadata.title || 'Xtrata Audio Player').trim();
  const assetType = normalizeAssetType(metadata.assetType);
  const assetTypeLabel = AUDIO_ASSET_TYPE_LABELS[assetType];
  const artist = String(metadata.artist || '').trim();
  const album = String(metadata.album || '').trim();
  const stemRole = String(metadata.stemRole || '').trim();
  const instrument = String(metadata.instrument || '').trim();
  const note = String(metadata.note || '').trim();
  const frequency = String(metadata.frequency || '').trim();
  const description = String(metadata.description || '').trim();
  const license = String(metadata.license || '').trim();
  const isLoop = Boolean(metadata.isLoop);
  const bpm = String(metadata.bpm || '').trim();
  const source = buildPlayerSource(config);
  const visual = buildVisualSource(config);
  const dependencies = buildDependencies(config);

  if (!source.source) {
    return `<!DOCTYPE html><html><head><title>Error</title></head><body><h1>Error generating Xtrata audio player: missing audio source.</h1></body></html>`;
  }

  const modeLabel =
    source.mode === 'recursive'
      ? 'Recursive Xtrata audio player'
      : 'Standalone embedded audio player';
  const manifest = {
    template: XTRATA_PLAYER_TEMPLATE_VERSION,
    mode: source.mode,
    sourceKind: source.sourceKind,
    audioMimeType: source.audioMimeType,
    visualSourceMode: getVisualSourceMode(config),
    visualSourceKind: visual.sourceKind,
    visualMimeType: sanitizeVisualMimeType(config.visualMimeType || config.imageMimeType),
    dependencies,
    metadata: {
      assetType,
      title,
      artist,
      album,
      stemRole,
      instrument,
      note,
      frequency,
      description,
      license,
      isLoop,
      bpm
    }
  };

  const detailRows = [
    ['Type', assetTypeLabel],
    ['Artist', artist],
    ['Album', album],
    ['Stem', stemRole],
    ['Instrument', instrument],
    ['Note', note],
    ['Frequency', frequency],
    ['Loop', isLoop ? 'Yes' : 'No'],
    ['BPM', isLoop ? bpm : ''],
    ['License', license],
    ['Dependencies', dependencies.join(', ')]
  ]
    .filter(([, value]) => String(value || '').trim())
    .map(
      ([label, value]) =>
        `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`
    )
    .join('\n');

  const externalLink =
    source.mode === 'recursive' && /^https?:\/\//i.test(source.source)
      ? `<a class="source-link" href="${escapeAttr(
          source.source
        )}" target="_blank" rel="noopener noreferrer">Open audio source</a>`
      : '';
  const subtitle = [artist, album].filter(Boolean).join(' - ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: dark;
      --page: #10120f;
      --ink: #f8f3e7;
      --muted: rgba(248, 243, 231, 0.72);
      --line: rgba(248, 243, 231, 0.18);
      --panel: rgba(16, 18, 15, 0.78);
      --panel-strong: rgba(16, 18, 15, 0.92);
      --accent: #b8e08d;
      --accent-strong: #f1c75b;
      --error: #f09aaa;
    }

    * { box-sizing: border-box; }

    html {
      width: 100%;
      height: 100%;
    }

    body {
      margin: 0;
      min-width: 0;
      min-height: 100vh;
      min-height: 100dvh;
      width: 100%;
      display: grid;
      place-items: center;
      background: var(--page);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
      padding: 0;
      overflow: hidden;
    }

    .player {
      position: relative;
      width: min(100vmin, 760px);
      max-width: 100%;
      max-height: 100%;
      aspect-ratio: 1 / 1;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 8px;
      background: #151812;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.38);
      overflow: hidden;
    }

    .stage {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      background: #dfe8df;
      overflow: hidden;
      cursor: pointer;
      user-select: none;
      touch-action: manipulation;
    }

    .stage:focus-visible {
      outline: 3px solid var(--accent);
      outline-offset: -6px;
    }

    .cover-media {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      background: #dfe8df;
    }

    .cover-media img,
    .cover-media video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      pointer-events: none;
    }

    .cover-placeholder {
      width: min(40%, 220px);
      aspect-ratio: 1 / 1;
      display: grid;
      place-items: center;
      border: 2px solid rgba(36, 95, 69, 0.4);
      border-radius: 50%;
      color: #245f45;
      font-size: clamp(3rem, 13vmin, 7rem);
      font-weight: 900;
      background: rgba(36, 95, 69, 0.08);
    }

    .stage-scrim {
      position: absolute;
      inset: 0;
      pointer-events: none;
      background:
        linear-gradient(180deg, rgba(0, 0, 0, 0.62), transparent 24%),
        linear-gradient(0deg, rgba(0, 0, 0, 0.7), transparent 44%);
      opacity: 1;
      transition: opacity 0.28s ease;
    }

    .top-bar {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      z-index: 3;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      align-items: start;
      padding: 12px;
      pointer-events: none;
      opacity: 1;
      transform: translateY(0);
      transition: opacity 0.28s ease, transform 0.28s ease;
    }

    .track-copy {
      min-width: 0;
      color: var(--ink);
      text-shadow: 0 2px 18px rgba(0, 0, 0, 0.42);
      transition: opacity 0.18s ease, transform 0.18s ease;
    }

    .eyebrow {
      margin: 0 0 6px;
      color: var(--accent);
      font-size: 0.78rem;
      font-weight: 900;
      letter-spacing: 0;
      text-transform: uppercase;
    }

    h1 {
      margin: 0;
      font-size: clamp(1.15rem, 5.6vmin, 2.35rem);
      line-height: 1.05;
      letter-spacing: 0;
      max-width: 16ch;
      overflow-wrap: anywhere;
    }

    .artist {
      margin: 6px 0 0;
      color: rgba(248, 243, 231, 0.82);
      font-size: clamp(0.82rem, 2vmin, 1rem);
      font-weight: 700;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .top-actions,
    .transport-row,
    .drawer-tabs {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .top-actions {
      pointer-events: auto;
      transition: opacity 0.18s ease;
    }

    button {
      min-height: 34px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(16, 18, 15, 0.62);
      color: var(--ink);
      font: inherit;
      font-weight: 900;
      cursor: pointer;
    }

    button:hover,
    button:focus-visible {
      border-color: rgba(248, 243, 231, 0.42);
      background: rgba(248, 243, 231, 0.16);
    }

    button:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    .icon-button {
      width: 38px;
      padding: 0;
      display: inline-grid;
      place-items: center;
    }

    .eye-icon {
      position: relative;
      width: 18px;
      height: 12px;
      border: 2px solid currentColor;
      border-radius: 50%;
    }

    .eye-icon::after {
      content: "";
      position: absolute;
      top: 50%;
      left: 50%;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: currentColor;
      transform: translate(-50%, -50%);
    }

    .dots-icon {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: currentColor;
      box-shadow: -7px 0 0 currentColor, 7px 0 0 currentColor;
    }

    .click-hint {
      position: absolute;
      z-index: 2;
      left: 50%;
      bottom: 54px;
      max-width: calc(100% - 32px);
      transform: translateX(-50%);
      border: 1px solid rgba(248, 243, 231, 0.22);
      border-radius: 8px;
      background: rgba(16, 18, 15, 0.6);
      color: var(--ink);
      padding: 6px 10px;
      font-size: clamp(0.74rem, 2vmin, 0.9rem);
      font-weight: 900;
      text-align: center;
      pointer-events: none;
      transition: opacity 0.18s ease;
    }

    .player[data-panel]:not([data-panel="closed"]) .click-hint {
      opacity: 0;
    }

    .audio-native {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
    }

    .status {
      min-height: 24px;
      margin: 0;
      color: var(--muted);
      font-size: 0.88rem;
      font-weight: 700;
    }

    .status.error { color: var(--error); }

    .drawer {
      position: absolute;
      z-index: 4;
      left: 0;
      right: 0;
      bottom: 0;
      height: 49%;
      display: grid;
      grid-template-rows: 44px minmax(0, 1fr);
      border-top: 1px solid rgba(248, 243, 231, 0.16);
      background: linear-gradient(180deg, rgba(16, 18, 15, 0.72), rgba(16, 18, 15, 0.96));
      color: var(--ink);
      backdrop-filter: blur(16px);
      transform: translateY(calc(100% - 44px));
      opacity: 1;
      transition: transform 0.2s ease, opacity 0.28s ease;
      pointer-events: auto;
    }

    .player[data-chrome="hidden"][data-panel="closed"] .stage-scrim,
    .player[data-chrome="hidden"][data-panel="closed"] .top-bar,
    .player[data-chrome="hidden"][data-panel="closed"] .click-hint,
    .player[data-chrome="hidden"][data-panel="closed"] .drawer {
      opacity: 0;
      pointer-events: none;
    }

    .player[data-chrome="hidden"][data-panel="closed"] .top-bar {
      transform: translateY(-8px);
    }

    .player[data-chrome="hidden"][data-panel="closed"] .drawer {
      transform: translateY(100%);
    }

    .player[data-panel="controls"] .drawer,
    .player[data-panel="info"] .drawer,
    .player[data-panel="metadata"] .drawer {
      transform: translateY(0);
    }

    .drawer-peek {
      width: 100%;
      min-height: 44px;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      border: 0;
      border-radius: 0;
      background: transparent;
      color: var(--ink);
      padding: 7px 12px;
      text-align: left;
    }

    .mini-track {
      position: relative;
      height: 6px;
      border-radius: 999px;
      background: rgba(248, 243, 231, 0.22);
      overflow: hidden;
    }

    .mini-track span {
      position: absolute;
      inset: 0 auto 0 0;
      width: 0%;
      border-radius: inherit;
      background: var(--accent);
    }

    .mini-label,
    .mini-time {
      font-size: 0.8rem;
      font-weight: 900;
      white-space: nowrap;
    }

    .drawer-body {
      min-height: 0;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 10px;
      padding: 0 12px 12px;
    }

    .drawer-tabs {
      min-width: 0;
    }

    .drawer-tabs button {
      flex: 1 1 0;
      min-width: 0;
      min-height: 32px;
      padding: 0 8px;
      font-size: 0.78rem;
    }

    .drawer-tabs button.is-active {
      border-color: var(--accent);
      background: rgba(184, 224, 141, 0.18);
      color: var(--accent);
    }

    .panel-view {
      min-height: 0;
      display: grid;
      align-content: start;
      gap: 10px;
      overflow: hidden;
    }

    .panel-view[hidden] {
      display: none;
    }

    .transport-row {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }

    .transport-row button {
      min-width: 0;
      min-height: 36px;
      padding: 0 8px;
      font-size: 0.78rem;
    }

    .play-toggle {
      background: var(--accent);
      border-color: var(--accent);
      color: #10120f;
    }

    .time-row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      color: var(--muted);
      font-size: 0.78rem;
      font-weight: 900;
    }

    .waveform {
      position: relative;
      min-height: 58px;
      border: 1px solid rgba(248, 243, 231, 0.14);
      border-radius: 8px;
      background: rgba(248, 243, 231, 0.08);
      overflow: hidden;
    }

    .waveform-bars {
      position: absolute;
      inset: 8px;
      display: grid;
      grid-template-columns: repeat(64, minmax(1px, 1fr));
      gap: 2px;
      align-items: center;
      pointer-events: none;
    }

    .waveform-bars span {
      display: block;
      height: var(--bar-height, 44%);
      min-height: 6px;
      border-radius: 999px;
      background: rgba(248, 243, 231, 0.28);
    }

    .waveform-bars span.is-played {
      background: var(--accent-strong);
    }

    .waveform-range {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      margin: 0;
      cursor: pointer;
      opacity: 0;
    }

    .description {
      margin: 0;
      color: var(--muted);
      font-size: 0.84rem;
      font-weight: 700;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .metadata-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
      margin: 0;
    }

    .metadata-grid div {
      border: 1px solid rgba(248, 243, 231, 0.12);
      border-radius: 8px;
      padding: 6px 8px;
      background: rgba(248, 243, 231, 0.08);
      min-width: 0;
    }

    dt {
      color: var(--muted);
      font-size: 0.62rem;
      font-weight: 900;
      text-transform: uppercase;
    }

    dd {
      margin: 3px 0 0;
      overflow-wrap: anywhere;
      font-weight: 800;
      font-size: 0.78rem;
    }

    .source-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 34px;
      border: 1px solid var(--line);
      border-radius: 8px;
      color: var(--accent);
      padding: 0 10px;
      font-weight: 900;
      text-decoration: none;
      font-size: 0.78rem;
    }

    @media (max-width: 560px) {
      .player { width: min(100vmin, 100%); }
      .drawer { height: 54%; }
      .metadata-grid { grid-template-columns: 1fr; }
      .top-bar { padding: 10px; }
      .transport-row button { font-size: 0.72rem; }
    }
  </style>
</head>
<body>
  <main id="xtrataPlayer" class="player" data-panel="closed" data-playback="idle" data-chrome="visible" data-xtrata-player-mode="${escapeAttr(
    source.mode
  )}" data-xtrata-dependencies="${escapeAttr(dependencies.join(','))}">
    <section id="xtrataCover" class="stage" role="button" tabindex="0" aria-label="Click artwork to play or pause. Double click to stop and reset." title="Click to play or pause. Double click to stop and reset.">
      <div class="cover-media" aria-hidden="true">${buildCoverMarkup(config, title)}</div>
      <div class="stage-scrim" aria-hidden="true"></div>
      <header class="top-bar">
        <div class="track-copy">
          <p class="eyebrow">${escapeHtml(modeLabel)}</p>
          <h1>${escapeHtml(title)}</h1>
          ${subtitle ? `<p class="artist">${escapeHtml(subtitle)}</p>` : ''}
        </div>
        <div class="top-actions" data-player-control>
          <button id="infoToggle" class="icon-button" type="button" aria-expanded="false" aria-controls="playerDrawer" title="Show player info" aria-label="Show player info"><span class="eye-icon" aria-hidden="true"></span></button>
          <button id="controlsToggle" class="icon-button" type="button" aria-expanded="false" aria-controls="playerDrawer" title="Show controls" aria-label="Show controls"><span class="dots-icon" aria-hidden="true"></span></button>
        </div>
      </header>
      <div id="clickHint" class="click-hint" aria-hidden="true">Click artwork to play</div>
      <section id="playerDrawer" class="drawer" data-player-control aria-label="Player controls and information">
        <button id="drawerToggle" class="drawer-peek" type="button" aria-expanded="false" aria-controls="drawerBody">
          <span id="miniLabel" class="mini-label">Controls</span>
          <span class="mini-track" aria-hidden="true"><span id="miniProgress"></span></span>
          <span id="miniTime" class="mini-time">0:00</span>
        </button>
        <div id="drawerBody" class="drawer-body">
          <div class="drawer-tabs" role="tablist" aria-label="Player panel">
            <button type="button" role="tab" data-panel-target="controls" aria-selected="false">Controls</button>
            <button type="button" role="tab" data-panel-target="info" aria-selected="false">Info</button>
            <button type="button" role="tab" data-panel-target="metadata" aria-selected="false">Metadata</button>
          </div>

          <section class="panel-view" data-panel-view="controls" role="tabpanel" hidden>
            <div class="transport-row">
              <button id="restartButton" type="button">Restart</button>
              <button id="backButton" type="button">-15</button>
              <button id="playToggleButton" class="play-toggle" type="button">Play</button>
              <button id="forwardButton" type="button">+15</button>
              <button id="muteButton" type="button">Mute</button>
            </div>
            <div class="time-row">
              <span id="currentTime">0:00</span>
              <div id="waveform" class="waveform">
                <div id="waveformBars" class="waveform-bars" aria-hidden="true"></div>
                <input id="seekRange" class="waveform-range" type="range" min="0" max="1000" value="0" aria-label="Seek playback position">
              </div>
              <span id="durationTime">0:00</span>
            </div>
            <p id="playerStatus" class="status">Ready.</p>
          </section>

          <section class="panel-view" data-panel-view="info" role="tabpanel" hidden>
            <p class="description">Click the artwork to play or pause. Double click it to stop and reset to the beginning. Open controls for seek, restart, mute, and waveform-style scrubbing.</p>
            <p class="description">Keyboard: Enter or Space toggles playback. Escape stops and resets.</p>
          </section>

          <section class="panel-view" data-panel-view="metadata" role="tabpanel" hidden>
            ${description ? `<p class="description">${escapeHtml(description)}</p>` : ''}
            ${detailRows ? `<dl class="metadata-grid">${detailRows}</dl>` : '<p class="description">No extra metadata supplied.</p>'}
            ${externalLink}
          </section>
        </div>
      </section>
    </section>
    <audio id="xtrataAudio" class="audio-native" preload="metadata"${
      isLoop ? ' loop' : ''
    }>
      <source src="${escapeAttr(source.source)}" type="${escapeAttr(
        source.audioMimeType
      )}">
    </audio>
  </main>
  <script type="application/json" id="xtrataPlayerManifest">${escapeJsonForScript(
    manifest
  )}<\/script>
  <script>
    (function () {
      const player = document.getElementById('xtrataPlayer');
      const audio = document.getElementById('xtrataAudio');
      const cover = document.getElementById('xtrataCover');
      const status = document.getElementById('playerStatus');
      const drawerToggle = document.getElementById('drawerToggle');
      const infoToggle = document.getElementById('infoToggle');
      const controlsToggle = document.getElementById('controlsToggle');
      const playToggleButton = document.getElementById('playToggleButton');
      const restartButton = document.getElementById('restartButton');
      const backButton = document.getElementById('backButton');
      const forwardButton = document.getElementById('forwardButton');
      const muteButton = document.getElementById('muteButton');
      const seekRange = document.getElementById('seekRange');
      const currentTimeLabel = document.getElementById('currentTime');
      const durationTimeLabel = document.getElementById('durationTime');
      const miniProgress = document.getElementById('miniProgress');
      const miniTime = document.getElementById('miniTime');
      const miniLabel = document.getElementById('miniLabel');
      const clickHint = document.getElementById('clickHint');
      const waveformBars = document.getElementById('waveformBars');
      const panelButtons = Array.from(document.querySelectorAll('[data-panel-target]'));
      const panelViews = Array.from(document.querySelectorAll('[data-panel-view]'));
      const manifestNode = document.getElementById('xtrataPlayerManifest');
      let coverClickTimer = 0;
      let chromeTimer = 0;
      let activePanel = 'closed';
      let manifest = {};
      const CHROME_IDLE_DELAY_MS = 2800;
      try {
        manifest = JSON.parse(manifestNode.textContent || '{}');
      } catch (_error) {
        manifest = {};
      }

      const formatTime = (seconds) => {
        if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
        const minutes = Math.floor(seconds / 60);
        const wholeSeconds = Math.floor(seconds % 60);
        return minutes + ':' + String(wholeSeconds).padStart(2, '0');
      };

      const setStatus = (message, isError) => {
        if (!status) return;
        status.textContent = message;
        status.classList.toggle('error', Boolean(isError));
      };

      if (!audio) return;

      const renderWaveform = () => {
        if (!waveformBars) return;
        waveformBars.innerHTML = '';
        const title = (manifest.metadata && manifest.metadata.title) || document.title || 'xtrata';
        const seed = title.split('').reduce((total, char) => total + char.charCodeAt(0), 0) || 42;
        for (let index = 0; index < 64; index += 1) {
          const bar = document.createElement('span');
          const wave = Math.abs(Math.sin((index + 1) * (seed % 17 + 5)) * Math.cos((index + 3) * 0.37));
          const height = Math.round(20 + wave * 76);
          bar.style.setProperty('--bar-height', height + '%');
          waveformBars.appendChild(bar);
        }
      };

      const waveformBarNodes = () =>
        waveformBars ? Array.from(waveformBars.children) : [];

      const getDuration = () =>
        Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;

      const clearChromeTimer = () => {
        if (!chromeTimer) return;
        window.clearTimeout(chromeTimer);
        chromeTimer = 0;
      };

      const setChromeVisible = (visible) => {
        if (player) player.dataset.chrome = visible ? 'visible' : 'hidden';
      };

      const scheduleChromeHide = () => {
        clearChromeTimer();
        if (activePanel !== 'closed') {
          setChromeVisible(true);
          return;
        }
        chromeTimer = window.setTimeout(() => {
          if (activePanel === 'closed') {
            setChromeVisible(false);
          }
        }, CHROME_IDLE_DELAY_MS);
      };

      const revealChrome = () => {
        setChromeVisible(true);
        scheduleChromeHide();
      };

      const setPanel = (panelName) => {
        activePanel = panelName;
        if (player) player.dataset.panel = panelName;
        const isOpen = panelName !== 'closed';
        [drawerToggle, infoToggle, controlsToggle].forEach((button) => {
          if (button) button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });
        panelButtons.forEach((button) => {
          const selected = button.dataset.panelTarget === panelName;
          button.classList.toggle('is-active', selected);
          button.setAttribute('aria-selected', selected ? 'true' : 'false');
        });
        panelViews.forEach((view) => {
          view.hidden = view.dataset.panelView !== panelName;
        });
        if (miniLabel) {
          miniLabel.textContent = panelName === 'closed' ? 'Controls' : panelName.slice(0, 1).toUpperCase() + panelName.slice(1);
        }
        if (isOpen) {
          clearChromeTimer();
          setChromeVisible(true);
        } else {
          revealChrome();
        }
      };

      const togglePanel = (panelName) => {
        setPanel(activePanel === panelName ? 'closed' : panelName);
      };

      const clearCoverClickTimer = () => {
        if (!coverClickTimer) return;
        window.clearTimeout(coverClickTimer);
        coverClickTimer = 0;
      };

      const resetAudioToStart = () => {
        clearCoverClickTimer();
        audio.pause();
        try {
          audio.currentTime = 0;
        } catch (_error) {
          // Some browsers reject seeking before media metadata is available.
        }
        setStatus('Stopped. Ready from beginning.');
        updateProgress();
        updatePlaybackUi();
      };

      const toggleAudioPlayback = () => {
        clearCoverClickTimer();
        if (!audio.paused && !audio.ended) {
          audio.pause();
          setStatus('Paused.');
          return;
        }

        if (audio.ended) {
          try {
            audio.currentTime = 0;
          } catch (_error) {}
        }

        const playResult = audio.play();
        if (playResult && typeof playResult.catch === 'function') {
          playResult
            .then(() => setStatus('Playing.'))
            .catch(() => {
              setStatus('Playback was blocked. Use the audio controls to start playback.', true);
            });
        } else {
          setStatus('Playing.');
        }
      };

      const seekBy = (seconds) => {
        const duration = getDuration();
        const next = Math.max(0, Math.min(duration || audio.currentTime + seconds, audio.currentTime + seconds));
        try {
          audio.currentTime = next;
        } catch (_error) {}
        updateProgress();
      };

      const updatePlaybackUi = () => {
        const isPlaying = !audio.paused && !audio.ended;
        if (player) {
          player.dataset.playback = isPlaying ? 'playing' : audio.currentTime > 0 ? 'paused' : 'idle';
        }
        if (playToggleButton) playToggleButton.textContent = isPlaying ? 'Pause' : 'Play';
        if (clickHint) {
          clickHint.textContent = isPlaying
            ? 'Click artwork to pause'
            : audio.currentTime > 0
              ? 'Click artwork to play'
              : 'Click artwork to play';
        }
        if (muteButton) muteButton.textContent = audio.muted ? 'Unmute' : 'Mute';
      };

      const updateProgress = () => {
        const duration = getDuration();
        const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
        const fraction = duration ? Math.max(0, Math.min(1, current / duration)) : 0;
        if (currentTimeLabel) currentTimeLabel.textContent = formatTime(current);
        if (durationTimeLabel) durationTimeLabel.textContent = formatTime(duration);
        if (miniTime) miniTime.textContent = formatTime(current);
        if (miniProgress) miniProgress.style.width = Math.round(fraction * 100) + '%';
        if (seekRange && document.activeElement !== seekRange) {
          seekRange.value = Math.round(fraction * 1000);
          seekRange.setAttribute('aria-valuetext', formatTime(current) + ' of ' + formatTime(duration));
        }
        const bars = waveformBarNodes();
        bars.forEach((bar, index) => {
          bar.classList.toggle('is-played', bars.length ? index / bars.length <= fraction : false);
        });
      };

      const isPlayerControlTarget = (event) =>
        Boolean(event.target.closest('button, input, a, [data-player-control]'));

      if (cover) {
        ['pointermove', 'pointerenter', 'touchstart', 'focusin'].forEach((eventName) => {
          cover.addEventListener(eventName, revealChrome, { passive: true });
        });

        cover.addEventListener('click', (event) => {
          revealChrome();
          if (isPlayerControlTarget(event)) return;
          event.preventDefault();
          clearCoverClickTimer();
          coverClickTimer = window.setTimeout(toggleAudioPlayback, 300);
        });

        cover.addEventListener('dblclick', (event) => {
          revealChrome();
          if (isPlayerControlTarget(event)) return;
          event.preventDefault();
          resetAudioToStart();
        });

        cover.addEventListener('keydown', (event) => {
          revealChrome();
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleAudioPlayback();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            resetAudioToStart();
          }
        });
      }

      if (drawerToggle) drawerToggle.addEventListener('click', () => togglePanel('controls'));
      if (infoToggle) infoToggle.addEventListener('click', () => togglePanel('info'));
      if (controlsToggle) controlsToggle.addEventListener('click', () => togglePanel('controls'));
      panelButtons.forEach((button) => {
        button.addEventListener('click', () => setPanel(button.dataset.panelTarget || 'controls'));
      });
      if (playToggleButton) playToggleButton.addEventListener('click', toggleAudioPlayback);
      if (restartButton) restartButton.addEventListener('click', resetAudioToStart);
      if (backButton) backButton.addEventListener('click', () => seekBy(-15));
      if (forwardButton) forwardButton.addEventListener('click', () => seekBy(15));
      if (muteButton) {
        muteButton.addEventListener('click', () => {
          audio.muted = !audio.muted;
          updatePlaybackUi();
        });
      }
      if (seekRange) {
        seekRange.addEventListener('input', () => {
          revealChrome();
          const duration = getDuration();
          if (!duration) return;
          audio.currentTime = duration * (Number(seekRange.value) / 1000);
          updateProgress();
        });
      }

      const support = audio.canPlayType(manifest.audioMimeType || '');
      if (!support) {
        setStatus('This browser may not support this audio type. Try a newer Safari, Chrome, Firefox, or an MP3 fallback.', true);
      }

      audio.addEventListener('loadedmetadata', () => {
        const duration = Number.isFinite(audio.duration)
          ? Math.round(audio.duration)
          : null;
        setStatus(duration ? 'Loaded. Duration: ' + duration + ' seconds.' : 'Loaded.');
        updateProgress();
      });

      audio.addEventListener('canplay', () => {
        setStatus('Ready to play.');
        updateProgress();
      });

      audio.addEventListener('timeupdate', updateProgress);
      audio.addEventListener('durationchange', updateProgress);
      audio.addEventListener('play', updatePlaybackUi);
      audio.addEventListener('pause', updatePlaybackUi);
      audio.addEventListener('ended', () => {
        setStatus('Finished. Click artwork to play from the beginning.');
        updatePlaybackUi();
        updateProgress();
      });

      audio.addEventListener('error', () => {
        const code = audio.error ? audio.error.code : 'unknown';
        setStatus('Playback failed in this browser. Media error code: ' + code + '.', true);
      });

      if ('mediaSession' in navigator) {
        try {
          const metadata = manifest.metadata || {};
          navigator.mediaSession.metadata = new MediaMetadata({
            title: metadata.title || document.title,
            artist: metadata.artist || '',
            album: metadata.album || ''
          });
          navigator.mediaSession.setActionHandler('play', toggleAudioPlayback);
          navigator.mediaSession.setActionHandler('pause', toggleAudioPlayback);
          navigator.mediaSession.setActionHandler('stop', resetAudioToStart);
          navigator.mediaSession.setActionHandler('seekbackward', () => seekBy(-15));
          navigator.mediaSession.setActionHandler('seekforward', () => seekBy(15));
        } catch (_error) {}
      }

      renderWaveform();
      setPanel('closed');
      updatePlaybackUi();
      updateProgress();
      revealChrome();
    })();
  <\/script>
</body>
</html>`;
};

function HTML_Template(
  titleOrConfig,
  instrument,
  note,
  frequency,
  isLoop,
  bpm,
  audionalBase64Data,
  audionalVisualBase64Data,
  audionalMimeType = 'audio/webm; codecs=opus',
  options = {}
) {
  if (
    titleOrConfig &&
    typeof titleOrConfig === 'object' &&
    !Array.isArray(titleOrConfig)
  ) {
    return buildXtrataAudioPlayerHtml(titleOrConfig);
  }

  return buildXtrataAudioPlayerHtml({
    mode: options.mode || 'embedded',
    metadata: {
      title: titleOrConfig,
      instrument,
      note,
      frequency,
      isLoop,
      bpm
    },
    audioBase64: audionalBase64Data,
    imageBase64: audionalVisualBase64Data,
    audioMimeType: audionalMimeType,
    imageMimeType: options.imageMimeType,
    recursive: options.recursive
  });
}

window.HTML_Template = HTML_Template;
window.buildXtrataAudioPlayerHtml = buildXtrataAudioPlayerHtml;
})();
