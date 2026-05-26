// html-generator.js - Handles html generation using the HTML_Template function

// State variables to track the base64 data
let audionalBase64 = null;
let audionalVisualBase64 = null;

// DOM element references for the modal (assuming these are correctly fetched at the top of your actual file)
// const instrumentInput = document.getElementById('instrumentInput');
// const noteInput = document.getElementById('noteInput');
// const frequencyInput = document.getElementById('frequencyInput');
// const titleInput = document.getElementById('titleInput');
// const loopCheckbox = document.getElementById('loopCheckbox');
// const bpmInput = document.getElementById('bpmInput');
// const generateHtmlButton = document.getElementById('generateHtmlButton'); // Ensure this ID matches your HTML
// const metadataModal = document.getElementById('metadataModal');
// const metadataForm = document.getElementById('metadataForm');
// const cancelMetadataBtn = document.getElementById('cancelMetadataBtn');


/**
 * Helper function to strip the data URI prefix
 */
function stripDataURIPrefix(dataString) {
  if (typeof dataString !== 'string') return '';
  const commaIndex = dataString.indexOf(',');
  if (commaIndex !== -1) {
    return dataString.substring(commaIndex + 1);
  }
  return dataString;
}

/**
 * Initialize the html generator
 */
function inithtmlGenerator() {
  // Make sure all DOM elements are correctly referenced here
  // Using the globally defined DOM elements from dom-elements.js is better
  if (!window.generateHtmlButton || !window.metadataModal || !window.metadataForm || !window.cancelMetadataBtn ||
      !window.instrumentInput || !window.noteInput || !window.frequencyInput || !window.titleInput ||
      !window.loopCheckbox || !window.bpmInput) {
    console.error("html Generator or Modal elements not found! Check HTML IDs and dom-elements.js.");
    if (window.generateHtmlButton) window.generateHtmlButton.disabled = true;
    return;
  }

  // --- Event Listeners ---
  window.generateHtmlButton.addEventListener('click', showMetadataModal);
  window.metadataForm.addEventListener('submit', handleMetadataSubmit);
  window.cancelMetadataBtn.addEventListener('click', hideMetadataModal);

  document.addEventListener('audionalBase64Generated', function(e) {
    console.log("Received audionalBase64Generated event");
    updateaudionalBase64(e.detail.base64Data);
  });
  document.addEventListener('audionalVisualBase64Generated', function(e) {
    console.log("Received audionalVisualBase64Generated event");
    updateaudionalVisualBase64(e.detail.base64Data);
  });

  checkGenerateButtonState();
  console.log("html Generator Initialized with Modal Logic");
}

/**
 * Shows the metadata input modal.
 */
function showMetadataModal() {
    if (window.metadataModal) window.metadataModal.classList.remove('hidden');
}

/**
 * Hides the metadata input modal.
 */
function hideMetadataModal() {
    if (window.metadataModal) window.metadataModal.classList.add('hidden');
}

/**
 * Handles the submission of the metadata form.
 * @param {Event} event - The form submission event.
 */
function handleMetadataSubmit(event) {
    event.preventDefault();
    console.log("Metadata form submitted.");

    // Get values from the modal form using DOM elements from dom-elements.js
    const title = window.titleInput.value.trim();
    const instrument = window.instrumentInput.value.trim();
    const note = window.noteInput.value.trim();
    const frequency = window.frequencyInput.value.trim(); // Should be auto-calculated
    const isLoop = window.loopCheckbox.checked;
    const bpm = isLoop ? window.bpmInput.value.trim() : '';

    if (!title || !instrument || !note || !frequency) { // BPM is optional
        alert("Please fill in all required metadata fields (Title, Instrument, Note, Frequency).");
        return;
    }

    hideMetadataModal();

    // Call the orchestrator function with the collected metadata
    generateAndDownloadhtmlFile(title, instrument, note, frequency, isLoop, bpm);
}


/**
 * Updates the internal audio base64 data state.
 */
function updateaudionalBase64(base64Data) {
  audionalBase64 = base64Data; // This is a global variable in this script's scope
  console.log("Audio Base64 state updated.");
  checkGenerateButtonState();
}

/**
 * Updates the internal image base64 data state.
 */
function updateaudionalVisualBase64(base64Data) {
  audionalVisualBase64 = base64Data; // This is a global variable in this script's scope
  console.log("Image Base64 state updated.");
  checkGenerateButtonState();
}

/**
 * Checks if audio and image data are available and enables/disables the generate button.
 */
function checkGenerateButtonState() {
    const audioReady = typeof audionalBase64 === 'string' && audionalBase64.trim() !== '';
    // Image is optional for html, so we only strictly require audio for the button
    // However, your current check requires both. Let's adjust based on your intent.
    // If image is truly optional, the condition should primarily depend on audio.
    // For now, keeping your original logic that requires both (audioReady && imageReady).
    const imageActuallyReady = typeof audionalVisualBase64 === 'string' && audionalVisualBase64.trim() !== '';


    // The generateHtmlButton (now window.generateHtmlButton) should be enabled if EITHER:
    // 1. Audio is ready AND Image is ready
    // OR
    // 2. Audio is ready AND Image is NOT required (i.e., audionalVisualBase64 can be null/empty string for HTML_Template)
    // For simplicity, if your template *always* expects an image string (even if empty),
    // then audionalVisualBase64 can just be an empty string if no image is selected.
    // The event listener for 'audionalVisualBase64Generated' will set audionalVisualBase64.
    // If no image is converted, audionalVisualBase64 remains null or its initial value.
    // Let's assume the HTML_Template can handle an empty string for audionalVisualBase64Data.
    // So the button should be enabled if audio is ready. Image is a "nice to have".

    if (audioReady) { // Primary condition: Audio must be ready
        if (window.generateHtmlButton) {
            window.generateHtmlButton.disabled = false;
            console.log("html Generate button ENABLED (Audio ready).");
        }
    } else {
        if (window.generateHtmlButton) {
            window.generateHtmlButton.disabled = true;
            // console.log("html Generate button remains disabled (Audio not ready).");
        }
    }
}

/**
 * Orchestrates html HTML file generation and triggers download.
 * @param {string} title
 * @param {string} instrument
 * @param {string} note
 * @param {string} frequency
 * @param {boolean} isLoop
 * @param {string} bpm
 */
function generateAndDownloadhtmlFile(title, instrument, note, frequency, isLoop, bpm) {
  console.log("Starting html file generation with metadata:", { title, instrument, note, frequency, isLoop, bpm });

  if (!audionalBase64) { // Check for audionalBase64 (the global in this script)
    console.error("Cannot generate html: Missing audio Base64 data.");
    alert("Error: Missing audio Base64 data. Please ensure audio has been converted.");
    return;
  }

  // Ensure the HTML_Template function (from HTML_Template.js) is available
  if (typeof window.HTML_Template !== 'function') {
      console.error("CRITICAL ERROR: HTML_Template function not found. Make sure HTML_Template.js loaded correctly.");
      alert("Error: HTML template generation function is missing. Cannot create file.");
      return;
  }

  const pureaudionalBase64 = stripDataURIPrefix(audionalBase64);
  // audionalVisualBase64 can be null or empty if no image was processed. The template should handle this.
  const pureaudionalVisualBase64 = audionalVisualBase64 ? stripDataURIPrefix(audionalVisualBase64) : '';

  if (!pureaudionalBase64) { // Audio is essential
    console.error("Error extracting pure Base64 data for audio.");
    alert("Error: Could not prepare audio Base64 data. Please check the console.");
    return;
  }

  console.log("Calling HTML_Template with data and metadata...");

  // Call the imported HTML_Template function WITH ALL METADATA
  const htmlContent = window.HTML_Template(
      title,
      instrument,
      note,
      frequency,
      isLoop,
      bpm,
      pureaudionalBase64,    // Audio data
      pureaudionalVisualBase64     // Image data (can be empty string)
  );

  if (htmlContent.includes("Error generating Audional")) { // Check for error string from template
      console.error("HTML_Template function reported an error during HTML generation.");
      // Alert might have been shown by HTML_Template, or add one here
      alert("An error occurred while generating the HTML content for the Audional file.");
      return;
  }

  try {
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `Audional_HTML_${title.replace(/[^a-z0-9]/gi, '_') || 'Player'}_${timestamp}.html`;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      console.log(`Successfully generated and triggered download for: ${filename}`);
  } catch (error) {
      console.error("Error during Blob creation or download:", error);
      alert("An error occurred while trying to create or download the HTML file.");
  }
}

// Initialize the html generator when the DOM is loaded
document.addEventListener('DOMContentLoaded', inithtmlGenerator);

// Make functions available on window if called from other modules (optional, but can be helpful)
window.updateaudionalBase64 = updateaudionalBase64;
window.updateaudionalVisualBase64 = updateaudionalVisualBase64;