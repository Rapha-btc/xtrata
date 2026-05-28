// HTML_Template.js
(function () {

const XTRATA_PLAYER_TEMPLATE_VERSION = 'xtrata-opus-player-v2';

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

const sanitizeTokenId = (value) => {
  const text = String(value ?? '').trim().replace(/^#/, '');
  return /^\d+$/.test(text) ? text : '';
};

const sanitizeNetwork = (value) =>
  String(value || 'mainnet').trim().toLowerCase() === 'testnet'
    ? 'testnet'
    : 'mainnet';

const dedupe = (values) => Array.from(new Set(values.filter(Boolean)));

const buildRuntimeAudioUrl = ({ tokenId, contractId, network }) => {
  const safeTokenId = sanitizeTokenId(tokenId);
  const safeContractId = String(contractId || '').trim();
  const safeNetwork = sanitizeNetwork(network);
  if (!safeTokenId) {
    return '';
  }
  if (safeContractId) {
    const params = new URLSearchParams({
      contractId: safeContractId,
      tokenId: safeTokenId,
      network: safeNetwork
    });
    return `/runtime/content?${params.toString()}`;
  }
  return `https://xtrata.xyz/inscription/${safeTokenId}`;
};

const buildPlayerSource = (config) => {
  const mode = config.mode === 'recursive' ? 'recursive' : 'embedded';
  const audioMimeType = sanitizeAudioMimeType(config.audioMimeType);
  if (mode === 'recursive') {
    const recursive = config.recursive || {};
    const explicitUrl = String(recursive.audioUrl || '').trim();
    const generatedUrl = buildRuntimeAudioUrl({
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
    sanitizeTokenId(recursive.audioTokenId || recursive.tokenId),
    sanitizeTokenId(recursive.coverTokenId)
  ]);
};

const buildCoverMarkup = (config, title) => {
  const visualBase64 = normalizeBase64(config.visualBase64 || config.imageBase64);
  if (!visualBase64) {
    return `<div class="cover-placeholder" aria-hidden="true">${escapeHtml(
      title.slice(0, 1).toUpperCase() || 'X'
    )}</div>`;
  }
  const visualMimeType = sanitizeVisualMimeType(
    config.visualMimeType || config.imageMimeType
  );
  const visualSrc = `data:${normalizeMimeForDataUri(
    visualMimeType,
    'image/png'
  )};base64,${visualBase64}`;
  if (visualMimeType.startsWith('video/')) {
    return `<video muted loop playsinline autoplay preload="metadata" aria-label="${escapeAttr(
      title
    )} visual"><source src="${escapeAttr(visualSrc)}" type="${escapeAttr(
      visualMimeType
    )}">This browser cannot play the embedded visual.</video>`;
  }
  return `<img src="${escapeAttr(visualSrc)}" alt="${escapeAttr(title)} cover art">`;
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: dark;
      --page: #111412;
      --panel: #f7f2e8;
      --ink: #121714;
      --muted: #637167;
      --line: rgba(18, 23, 20, 0.18);
      --accent: #245f45;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-width: 320px;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: var(--page);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
      padding: 20px;
    }

    .player {
      width: min(760px, 100%);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.38);
      overflow: hidden;
    }

    .cover {
      display: grid;
      place-items: center;
      width: 100%;
      aspect-ratio: 1 / 1;
      background: #dfe8df;
      border-bottom: 1px solid var(--line);
      overflow: hidden;
      cursor: pointer;
      user-select: none;
      touch-action: manipulation;
    }

    .cover:focus-visible {
      outline: 3px solid var(--accent);
      outline-offset: -6px;
    }

    .cover img,
    .cover video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      pointer-events: none;
    }

    .cover-placeholder {
      width: min(42vw, 220px);
      aspect-ratio: 1 / 1;
      display: grid;
      place-items: center;
      border: 2px solid rgba(36, 95, 69, 0.4);
      border-radius: 50%;
      color: var(--accent);
      font-size: clamp(4rem, 12vw, 8rem);
      font-weight: 900;
      background: rgba(36, 95, 69, 0.08);
    }

    .content { padding: 18px; }

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
      font-size: clamp(1.6rem, 7vw, 3rem);
      line-height: 1.05;
      letter-spacing: 0;
    }

    .artist {
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 1rem;
      font-weight: 700;
    }

    audio {
      width: 100%;
      margin-top: 18px;
      display: block;
    }

    .status {
      min-height: 24px;
      margin: 12px 0 0;
      color: var(--muted);
      font-size: 0.88rem;
      font-weight: 700;
    }

    .status.error { color: #9e2f40; }

    .description {
      margin: 14px 0 0;
      color: #303a33;
    }

    dl {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin: 16px 0 0;
    }

    dl div {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
      background: rgba(255, 255, 255, 0.48);
      min-width: 0;
    }

    dt {
      color: var(--muted);
      font-size: 0.72rem;
      font-weight: 900;
      text-transform: uppercase;
    }

    dd {
      margin: 3px 0 0;
      overflow-wrap: anywhere;
      font-weight: 800;
    }

    .source-link {
      display: inline-flex;
      align-items: center;
      min-height: 38px;
      margin-top: 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      color: var(--accent);
      padding: 0 12px;
      font-weight: 900;
      text-decoration: none;
    }

    @media (max-width: 560px) {
      body { padding: 10px; }
      .content { padding: 14px; }
      dl { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="player" data-xtrata-player-mode="${escapeAttr(
    source.mode
  )}" data-xtrata-dependencies="${escapeAttr(dependencies.join(','))}">
    <section id="xtrataCover" class="cover" role="button" tabindex="0" aria-label="Play or pause audio. Double click to stop and reset." title="Click to play or pause. Double click to stop and reset.">
      ${buildCoverMarkup(config, title)}
    </section>
    <section class="content">
      <p class="eyebrow">${escapeHtml(modeLabel)}</p>
      <h1>${escapeHtml(title)}</h1>
      ${artist ? `<p class="artist">${escapeHtml(artist)}</p>` : ''}
      <audio id="xtrataAudio" controls preload="metadata"${
        isLoop ? ' loop' : ''
      }>
        <source src="${escapeAttr(source.source)}" type="${escapeAttr(
          source.audioMimeType
        )}">
        This browser cannot play the embedded audio.
      </audio>
      <p id="playerStatus" class="status">Ready.</p>
      ${description ? `<p class="description">${escapeHtml(description)}</p>` : ''}
      ${detailRows ? `<dl>${detailRows}</dl>` : ''}
      ${externalLink}
    </section>
  </main>
  <script type="application/json" id="xtrataPlayerManifest">${escapeJsonForScript(
    manifest
  )}<\/script>
  <script>
    (function () {
      const audio = document.getElementById('xtrataAudio');
      const cover = document.getElementById('xtrataCover');
      const status = document.getElementById('playerStatus');
      const manifestNode = document.getElementById('xtrataPlayerManifest');
      let coverClickTimer = 0;
      let manifest = {};
      try {
        manifest = JSON.parse(manifestNode.textContent || '{}');
      } catch (_error) {
        manifest = {};
      }

      const setStatus = (message, isError) => {
        if (!status) return;
        status.textContent = message;
        status.classList.toggle('error', Boolean(isError));
      };

      if (!audio) return;

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

      if (cover) {
        cover.addEventListener('click', (event) => {
          event.preventDefault();
          clearCoverClickTimer();
          coverClickTimer = window.setTimeout(toggleAudioPlayback, 300);
        });

        cover.addEventListener('dblclick', (event) => {
          event.preventDefault();
          resetAudioToStart();
        });

        cover.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleAudioPlayback();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            resetAudioToStart();
          }
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
      });

      audio.addEventListener('canplay', () => {
        setStatus('Ready to play.');
      });

      audio.addEventListener('error', () => {
        const code = audio.error ? audio.error.code : 'unknown';
        setStatus('Playback failed in this browser. Media error code: ' + code + '.', true);
      });
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
