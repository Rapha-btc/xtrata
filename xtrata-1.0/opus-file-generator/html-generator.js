// html-generator.js - Handles Xtrata HTML audio player generation.
(function () {

let audionalBase64 = null;
let audionalVisualBase64 = null;
let audionalMimeType = 'audio/webm; codecs=opus';
let audionalVisualMimeType = 'image/png';
let audionalVisualName = '';
let livePreviewTimer = 0;

const SUPPORTED_VISUAL_PREFIXES = ['image/', 'video/'];

function stripDataURIPrefix(dataString) {
  if (typeof dataString !== 'string') return '';
  const commaIndex = dataString.indexOf(',');
  return commaIndex !== -1 ? dataString.substring(commaIndex + 1) : dataString;
}

function getElement(id) {
  return document.getElementById(id);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target.result);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function isSupportedVisualFile(file) {
  return Boolean(
    file &&
      SUPPORTED_VISUAL_PREFIXES.some((prefix) =>
        String(file.type || '').startsWith(prefix)
      )
  );
}

function getVisualKind(mimeType) {
  const type = String(mimeType || '').toLowerCase();
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('image/')) return 'image';
  return '';
}

function getPlayerMode() {
  return document.querySelector('input[name="htmlPlayerMode"]:checked')?.value ===
    'recursive'
    ? 'recursive'
    : 'embedded';
}

function getVisualSourceMode() {
  return document.querySelector('input[name="visualSourceMode"]:checked')?.value ===
    'recursive'
    ? 'recursive'
    : 'embedded';
}

function getRecursiveConfig() {
  return {
    audioTokenId: getElement('recursiveAudioTokenId')?.value.trim() || '',
    audioUrl: getElement('recursiveAudioUrl')?.value.trim() || '',
    contractId: getElement('recursiveContractId')?.value.trim() || '',
    network: getElement('recursiveNetwork')?.value || 'mainnet',
    coverTokenId: getElement('recursiveCoverTokenId')?.value.trim() || '',
    coverUrl: getElement('recursiveCoverUrl')?.value.trim() || '',
    coverKind: getElement('recursiveCoverKind')?.value || 'image'
  };
}

function sanitizeTokenId(value) {
  const text = String(value || '').trim().replace(/^#/, '');
  return /^\d+$/.test(text) ? text : '';
}

function buildDefaultRecursiveUrl(config) {
  const tokenId = sanitizeTokenId(config.audioTokenId);
  if (!tokenId) return '';
  if ((config.network || 'mainnet') === 'mainnet') {
    return `https://xtrata.xyz/inscription/${tokenId}`;
  }
  if (config.contractId) {
    const params = new URLSearchParams({
      contractId: config.contractId,
      tokenId,
      network: config.network || 'mainnet'
    });
    return `https://xtrata.xyz/runtime/content?${params.toString()}`;
  }
  return `https://xtrata.xyz/inscription/${tokenId}`;
}

function buildDefaultRecursiveCoverUrl(config) {
  const tokenId = sanitizeTokenId(config.coverTokenId);
  if (!tokenId) return '';
  if ((config.network || 'mainnet') === 'mainnet') {
    return `https://xtrata.xyz/inscription/${tokenId}`;
  }
  if (config.contractId) {
    const params = new URLSearchParams({
      contractId: config.contractId,
      tokenId,
      network: config.network || 'mainnet'
    });
    return `https://xtrata.xyz/runtime/content?${params.toString()}`;
  }
  return `https://xtrata.xyz/inscription/${tokenId}`;
}

function getRecursiveDependencies(config) {
  return Array.from(
    new Set([
      getPlayerMode() === 'recursive' ? sanitizeTokenId(config.audioTokenId) : '',
      getVisualSourceMode() === 'recursive' ? sanitizeTokenId(config.coverTokenId) : ''
    ].filter(Boolean))
  );
}

function setHtmlExportStatus(message, isError = false) {
  const status = getElement('htmlExportStatus');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('error', Boolean(isError));
}

function hasEmbeddedAudio() {
  return typeof audionalBase64 === 'string' && audionalBase64.trim() !== '';
}

function hasRecursiveAudioSource() {
  const config = getRecursiveConfig();
  return Boolean(config.audioUrl || sanitizeTokenId(config.audioTokenId));
}

function isHtmlGenerationReady() {
  return getPlayerMode() === 'recursive' ? hasRecursiveAudioSource() : hasEmbeddedAudio();
}

function updateRecursiveUrlPreview() {
  const preview = getElement('recursiveUrlPreview');
  const config = getRecursiveConfig();
  if (preview) {
    const url = config.audioUrl || buildDefaultRecursiveUrl(config);
    preview.textContent = url || 'Enter an audio token ID or audio URL.';
  }

  const coverPreview = getElement('recursiveCoverUrlPreview');
  if (coverPreview) {
    const coverUrl = config.coverUrl || buildDefaultRecursiveCoverUrl(config);
    coverPreview.textContent =
      coverUrl || 'Upload embedded artwork or enter a cover token ID/URL.';
  }
}

function updateDependencyPreview() {
  const preview = getElement('recursiveDependencyPreview');
  if (!preview) return;
  const deps = getRecursiveDependencies(getRecursiveConfig());
  preview.textContent = deps.length ? deps.join(', ') : 'None yet';
}

function updateHtmlModeUI() {
  const mode = getPlayerMode();
  const visualMode = getVisualSourceMode();
  const embeddedPanel = getElement('embeddedPlayerOptions');
  const recursivePanel = getElement('recursivePlayerOptions');
  const embeddedVisualPanel = getElement('embeddedVisualOptions');
  const recursiveVisualPanel = getElement('recursiveVisualOptions');
  if (embeddedPanel) embeddedPanel.classList.toggle('hidden', mode !== 'embedded');
  if (recursivePanel) recursivePanel.classList.toggle('hidden', mode !== 'recursive');
  if (embeddedVisualPanel) {
    embeddedVisualPanel.classList.toggle('hidden', visualMode !== 'embedded');
  }
  if (recursiveVisualPanel) {
    recursiveVisualPanel.classList.toggle('hidden', visualMode !== 'recursive');
  }
  updateRecursiveUrlPreview();
  updateDependencyPreview();
  checkGenerateButtonState();
  scheduleLivePreviewUpdate();
}

function checkGenerateButtonState() {
  const ready = isHtmlGenerationReady();
  if (window.generateHtmlButton) {
    window.generateHtmlButton.disabled = !ready;
  }
  if (window.previewHtmlButton) {
    window.previewHtmlButton.disabled = !ready;
  }

  const mode = getPlayerMode();
  if (ready) {
    setHtmlExportStatus(
      mode === 'recursive'
        ? 'Recursive player ready. Add metadata, then preview or download.'
        : 'Embedded player ready. Add artwork and metadata, then preview or download.'
    );
    return;
  }
  setHtmlExportStatus(
    mode === 'recursive'
      ? 'Enter the audio inscription token ID or a direct audio URL.'
      : 'Convert an audio file first to generate embedded audio data.'
  );
}

function showMetadataModal() {
  if (!isHtmlGenerationReady()) {
    alert(
      getPlayerMode() === 'recursive'
        ? 'Enter an audio inscription token ID or direct audio URL first.'
        : 'Convert an audio file first so the player can embed the audio data.'
    );
    checkGenerateButtonState();
    return;
  }
  if (window.metadataModal) window.metadataModal.classList.remove('hidden');
  scheduleLivePreviewUpdate();
}

function hideMetadataModal() {
  if (window.metadataModal) window.metadataModal.classList.add('hidden');
}

function collectMetadataFromForm(options = {}) {
  const previewMode = Boolean(options.preview);
  const title = window.titleInput?.value.trim() || '';
  return {
    assetType: getElement('assetTypeInput')?.value || 'song',
    title: title || (previewMode ? 'Untitled audio' : ''),
    artist: getElement('artistInput')?.value.trim() || '',
    album: getElement('albumInput')?.value.trim() || '',
    stemRole: getElement('stemRoleInput')?.value.trim() || '',
    instrument: window.instrumentInput?.value.trim() || '',
    note: window.noteInput?.value.trim() || '',
    frequency: window.frequencyInput?.value.trim() || '',
    description: getElement('descriptionInput')?.value.trim() || '',
    license: getElement('licenseInput')?.value.trim() || '',
    isLoop: Boolean(window.loopCheckbox?.checked),
    bpm: window.loopCheckbox?.checked ? window.bpmInput?.value.trim() || '' : ''
  };
}

function buildTemplateConfig(metadata) {
  const mode = getPlayerMode();
  const visualMode = getVisualSourceMode();
  return {
    mode,
    audioSourceMode: mode,
    visualSourceMode: visualMode,
    metadata,
    audioBase64: mode === 'embedded' ? stripDataURIPrefix(audionalBase64) : '',
    audioMimeType: audionalMimeType,
    visualBase64: visualMode === 'embedded' && audionalVisualBase64
      ? stripDataURIPrefix(audionalVisualBase64)
      : '',
    visualMimeType: audionalVisualMimeType,
    visualName: audionalVisualName,
    imageBase64: visualMode === 'embedded' && audionalVisualBase64
      ? stripDataURIPrefix(audionalVisualBase64)
      : '',
    imageMimeType: audionalVisualMimeType,
    recursive: getRecursiveConfig()
  };
}

function buildGeneratedHtml(metadata) {
  if (!metadata.title) {
    throw new Error('Title is required.');
  }
  if (!isHtmlGenerationReady()) {
    throw new Error('The selected player mode is missing its audio source.');
  }
  if (typeof window.HTML_Template !== 'function') {
    throw new Error('HTML template generation function is missing.');
  }

  const config = buildTemplateConfig(metadata);
  const htmlContent = window.HTML_Template(config);
  if (htmlContent.includes('Error generating Xtrata audio player')) {
    throw new Error('The template could not generate a valid player.');
  }
  return {
    htmlContent,
    config
  };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function buildPreviewPlaceholder(message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #10120f;
      color: #f8f3e7;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 18px;
      text-align: center;
    }
    .preview-shell {
      width: min(86vmin, 420px);
      aspect-ratio: 1 / 1;
      display: grid;
      place-items: center;
      border: 1px dashed rgba(248, 243, 231, 0.28);
      border-radius: 8px;
      background: rgba(248, 243, 231, 0.06);
      padding: 18px;
    }
    p {
      max-width: 26ch;
      margin: 0;
      color: rgba(248, 243, 231, 0.72);
      font-weight: 800;
      line-height: 1.35;
    }
  </style>
</head>
<body>
  <div class="preview-shell"><p>${escapeHtml(message)}</p></div>
</body>
</html>`;
}

function setLivePreviewStatus(message, isError = false) {
  const status = getElement('htmlLivePreviewStatus');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('error', Boolean(isError));
}

function updateLivePreview() {
  const frame = getElement('htmlPlayerLivePreview');
  if (!frame) return;

  if (!isHtmlGenerationReady()) {
    frame.srcdoc = buildPreviewPlaceholder(
      getPlayerMode() === 'recursive'
        ? 'Enter a recursive audio token ID or URL to preview the player.'
        : 'Convert audio first to preview the standalone player.'
    );
    setLivePreviewStatus('Waiting for an audio source.');
    return;
  }

  if (typeof window.HTML_Template !== 'function') {
    frame.srcdoc = buildPreviewPlaceholder('The player template is still loading.');
    setLivePreviewStatus('Template loading.');
    return;
  }

  try {
    const metadata = collectMetadataFromForm({ preview: true });
    const config = buildTemplateConfig(metadata);
    const htmlContent = window.HTML_Template(config);
    frame.srcdoc = htmlContent;
    setLivePreviewStatus(
      `${config.audioSourceMode === 'recursive' ? 'Recursive audio' : 'Embedded audio'} with ${
        config.visualSourceMode === 'recursive' ? 'recursive visual' : 'embedded visual'
      } preview.`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    frame.srcdoc = buildPreviewPlaceholder(message);
    setLivePreviewStatus(`Preview failed: ${message}`, true);
  }
}

function scheduleLivePreviewUpdate() {
  if (livePreviewTimer) window.clearTimeout(livePreviewTimer);
  livePreviewTimer = window.setTimeout(() => {
    livePreviewTimer = 0;
    updateLivePreview();
  }, 180);
}

function buildGeneratedFilename(title, mode) {
  const safeTitle = title.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `Xtrata_Audio_Player_${safeTitle || 'Song'}_${mode}_${timestamp}.html`;
}

function openHtmlPreview(htmlContent) {
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  return blob.size;
}

function downloadHtmlFile(htmlContent, filename) {
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
  return blob.size;
}

function finishGeneration(action) {
  try {
    const metadata = collectMetadataFromForm();
    const { htmlContent, config } = buildGeneratedHtml(metadata);
    const filename = buildGeneratedFilename(metadata.title, config.mode);
    const size =
      action === 'preview'
        ? openHtmlPreview(htmlContent)
        : downloadHtmlFile(htmlContent, filename);
    const deps = getRecursiveDependencies(config.recursive).join(', ') || 'none';
    setHtmlExportStatus(
      `${action === 'preview' ? 'Preview opened' : 'Downloaded'} ${filename} (${formatBytes(
        size
      )}). Dependencies: ${deps}.`
    );
    hideMetadataModal();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('HTML generation failed:', error);
    setHtmlExportStatus(`HTML generation failed: ${message}`, true);
    alert(`HTML generation failed: ${message}`);
  }
}

function handleMetadataSubmit(event) {
  event.preventDefault();
  finishGeneration('download');
}

function handlePreviewClick() {
  if (window.metadataForm && !window.metadataForm.reportValidity()) {
    return;
  }
  finishGeneration('preview');
}

function updateaudionalBase64(base64Data, mimeType) {
  audionalBase64 = base64Data;
  if (mimeType) audionalMimeType = mimeType;
  checkGenerateButtonState();
  scheduleLivePreviewUpdate();
}

function setStandaloneArtworkStatus(message, isError = false) {
  const status = getElement('standaloneArtworkStatus');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('error', Boolean(isError));
}

function resetStandaloneArtworkPreview(message = 'No artwork selected.', isError = false) {
  const preview = getElement('standaloneArtworkPreview');
  const clearButton = getElement('clearStandaloneArtworkButton');
  const output = getElement('standaloneArtworkBase64Output');
  if (preview) {
    preview.innerHTML = '<span>No visual selected</span>';
  }
  if (output) output.value = '';
  if (clearButton) clearButton.disabled = true;
  setStandaloneArtworkStatus(message, isError);
}

function renderStandaloneArtworkPreview(dataUrl, fileInfo = {}) {
  const preview = getElement('standaloneArtworkPreview');
  const clearButton = getElement('clearStandaloneArtworkButton');
  if (!preview) return;

  preview.innerHTML = '';
  const kind = getVisualKind(fileInfo.mimeType || audionalVisualMimeType);
  const media = document.createElement(kind === 'video' ? 'video' : 'img');
  media.src = dataUrl;
  if (kind === 'video') {
    media.controls = true;
    media.muted = true;
    media.loop = true;
    media.playsInline = true;
    media.preload = 'metadata';
  } else {
    media.alt = fileInfo.name || 'Player artwork';
  }
  preview.appendChild(media);
  if (clearButton) clearButton.disabled = false;

  const sizeText =
    typeof fileInfo.size === 'number' && typeof window.formatBytes === 'function'
      ? ` (${window.formatBytes(fileInfo.size)})`
      : '';
  setStandaloneArtworkStatus(
    `${fileInfo.name || 'Visual media'}${sizeText} embedded as ${
      fileInfo.mimeType || audionalVisualMimeType
    }.`
  );
}

function updateaudionalVisualBase64(base64Data, mimeType, fileName = '', options = {}) {
  const output = getElement('standaloneArtworkBase64Output');
  audionalVisualBase64 = base64Data;
  if (mimeType) audionalVisualMimeType = mimeType;
  audionalVisualName = fileName || '';
  if (output) output.value = base64Data ? stripDataURIPrefix(base64Data) : '';
  if (!base64Data) {
    audionalVisualName = '';
    if (options.renderPreview !== false) resetStandaloneArtworkPreview();
  } else if (options.renderPreview !== false) {
    const dataUrl = String(base64Data).startsWith('data:')
      ? base64Data
      : `data:${audionalVisualMimeType};base64,${stripDataURIPrefix(base64Data)}`;
    renderStandaloneArtworkPreview(dataUrl, {
      name: audionalVisualName || 'Visual media',
      mimeType: audionalVisualMimeType
    });
  }
  checkGenerateButtonState();
  scheduleLivePreviewUpdate();
}

async function handleStandaloneArtworkChange(event) {
  const input = event.currentTarget;
  const file = input.files?.[0] || null;
  if (!file) {
    updateaudionalVisualBase64(null);
    return;
  }

  if (!isSupportedVisualFile(file)) {
    input.value = '';
    updateaudionalVisualBase64(null, '', '', { renderPreview: false });
    resetStandaloneArtworkPreview('Use an image, GIF, or video file.', true);
    return;
  }

  setStandaloneArtworkStatus(`Reading ${file.name}...`);
  try {
    const dataUrl = await readFileAsDataUrl(file);
    updateaudionalVisualBase64(dataUrl, file.type, file.name, {
      renderPreview: false
    });
    renderStandaloneArtworkPreview(dataUrl, {
      name: file.name,
      size: file.size,
      mimeType: file.type
    });
  } catch (error) {
    console.error('Artwork conversion failed:', error);
    input.value = '';
    updateaudionalVisualBase64(null, '', '', { renderPreview: false });
    resetStandaloneArtworkPreview(
      error instanceof Error ? error.message : 'Artwork conversion failed.',
      true
    );
  }
}

function clearStandaloneArtwork() {
  const input = getElement('standaloneArtworkInput');
  if (input) input.value = '';
  updateaudionalVisualBase64(null);
}

function inithtmlGenerator() {
  if (
    !window.generateHtmlButton ||
    !window.metadataModal ||
    !window.metadataForm ||
    !window.cancelMetadataBtn ||
    !window.titleInput ||
    !window.loopCheckbox ||
    !window.bpmInput
  ) {
    console.error('HTML generator elements not found. Check HTML IDs.');
    if (window.generateHtmlButton) window.generateHtmlButton.disabled = true;
    return;
  }

  window.generateHtmlButton.addEventListener('click', showMetadataModal);
  window.metadataForm.addEventListener('submit', handleMetadataSubmit);
  window.cancelMetadataBtn.addEventListener('click', hideMetadataModal);
  if (window.previewHtmlButton) {
    window.previewHtmlButton.addEventListener('click', handlePreviewClick);
  }

  document.querySelectorAll('input[name="htmlPlayerMode"]').forEach((radio) => {
    radio.addEventListener('change', updateHtmlModeUI);
  });

  document.querySelectorAll('input[name="visualSourceMode"]').forEach((radio) => {
    radio.addEventListener('change', updateHtmlModeUI);
  });

  window.metadataForm.addEventListener('input', scheduleLivePreviewUpdate);
  window.metadataForm.addEventListener('change', scheduleLivePreviewUpdate);

  const standaloneArtworkInput = getElement('standaloneArtworkInput');
  if (standaloneArtworkInput) {
    standaloneArtworkInput.addEventListener('change', handleStandaloneArtworkChange);
  }

  const clearStandaloneArtworkButton = getElement('clearStandaloneArtworkButton');
  if (clearStandaloneArtworkButton) {
    clearStandaloneArtworkButton.addEventListener('click', clearStandaloneArtwork);
  }

  [
    'recursiveAudioTokenId',
    'recursiveAudioUrl',
    'recursiveContractId',
    'recursiveNetwork',
    'recursiveCoverTokenId',
    'recursiveCoverUrl',
    'recursiveCoverKind'
  ].forEach((id) => {
    const input = getElement(id);
    if (input) input.addEventListener('input', updateHtmlModeUI);
    if (input && input.tagName === 'SELECT') {
      input.addEventListener('change', updateHtmlModeUI);
    }
  });

  document.addEventListener('audionalBase64Generated', function (event) {
    updateaudionalBase64(event.detail.base64Data, event.detail.mimeType);
  });

  document.addEventListener('audionalVisualBase64Generated', function (event) {
    updateaudionalVisualBase64(event.detail.base64Data, event.detail.mimeType);
  });

  updateHtmlModeUI();
  scheduleLivePreviewUpdate();
  console.log('HTML Generator initialized.');
}

document.addEventListener('DOMContentLoaded', inithtmlGenerator);

window.updateaudionalBase64 = updateaudionalBase64;
window.updateaudionalVisualBase64 = updateaudionalVisualBase64;
window.updateHtmlGenerateButtonState = function () {
  checkGenerateButtonState();
  scheduleLivePreviewUpdate();
};
window.updateHtmlLivePreview = scheduleLivePreviewUpdate;
})();
