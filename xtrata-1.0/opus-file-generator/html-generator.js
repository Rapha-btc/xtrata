// html-generator.js - Handles Xtrata HTML audio player generation.
(function () {

let audionalBase64 = null;
let audionalVisualBase64 = null;
let audionalMimeType = 'audio/webm; codecs=opus';
let audionalVisualMimeType = 'image/png';

function stripDataURIPrefix(dataString) {
  if (typeof dataString !== 'string') return '';
  const commaIndex = dataString.indexOf(',');
  return commaIndex !== -1 ? dataString.substring(commaIndex + 1) : dataString;
}

function getElement(id) {
  return document.getElementById(id);
}

function getPlayerMode() {
  return document.querySelector('input[name="htmlPlayerMode"]:checked')?.value ===
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
    coverTokenId: getElement('recursiveCoverTokenId')?.value.trim() || ''
  };
}

function sanitizeTokenId(value) {
  const text = String(value || '').trim().replace(/^#/, '');
  return /^\d+$/.test(text) ? text : '';
}

function buildDefaultRecursiveUrl(config) {
  const tokenId = sanitizeTokenId(config.audioTokenId);
  if (!tokenId) return '';
  if (config.contractId) {
    const params = new URLSearchParams({
      contractId: config.contractId,
      tokenId,
      network: config.network || 'mainnet'
    });
    return `/runtime/content?${params.toString()}`;
  }
  return `https://xtrata.xyz/inscription/${tokenId}`;
}

function getRecursiveDependencies(config) {
  return Array.from(
    new Set([
      sanitizeTokenId(config.audioTokenId),
      sanitizeTokenId(config.coverTokenId)
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
  if (!preview) return;
  const config = getRecursiveConfig();
  const url = config.audioUrl || buildDefaultRecursiveUrl(config);
  preview.textContent = url || 'Enter an audio token ID or audio URL.';
}

function updateDependencyPreview() {
  const preview = getElement('recursiveDependencyPreview');
  if (!preview) return;
  const deps = getRecursiveDependencies(getRecursiveConfig());
  preview.textContent = deps.length ? deps.join(', ') : 'None yet';
}

function updateHtmlModeUI() {
  const mode = getPlayerMode();
  const embeddedPanel = getElement('embeddedPlayerOptions');
  const recursivePanel = getElement('recursivePlayerOptions');
  if (embeddedPanel) embeddedPanel.classList.toggle('hidden', mode !== 'embedded');
  if (recursivePanel) recursivePanel.classList.toggle('hidden', mode !== 'recursive');
  updateRecursiveUrlPreview();
  updateDependencyPreview();
  checkGenerateButtonState();
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
        : 'Embedded player ready. Add metadata, then preview or download.'
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
}

function hideMetadataModal() {
  if (window.metadataModal) window.metadataModal.classList.add('hidden');
}

function collectMetadataFromForm() {
  return {
    title: window.titleInput?.value.trim() || '',
    artist: getElement('artistInput')?.value.trim() || '',
    album: getElement('albumInput')?.value.trim() || '',
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
  return {
    mode,
    metadata,
    audioBase64: mode === 'embedded' ? stripDataURIPrefix(audionalBase64) : '',
    audioMimeType: audionalMimeType,
    imageBase64: audionalVisualBase64
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
    const deps =
      config.mode === 'recursive'
        ? getRecursiveDependencies(config.recursive).join(', ') || 'none'
        : 'none';
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
}

function updateaudionalVisualBase64(base64Data, mimeType) {
  audionalVisualBase64 = base64Data;
  if (mimeType) audionalVisualMimeType = mimeType;
  checkGenerateButtonState();
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

  [
    'recursiveAudioTokenId',
    'recursiveAudioUrl',
    'recursiveContractId',
    'recursiveNetwork',
    'recursiveCoverTokenId'
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
  console.log('HTML Generator initialized.');
}

document.addEventListener('DOMContentLoaded', inithtmlGenerator);

window.updateaudionalBase64 = updateaudionalBase64;
window.updateaudionalVisualBase64 = updateaudionalVisualBase64;
window.updateHtmlGenerateButtonState = checkGenerateButtonState;
})();
