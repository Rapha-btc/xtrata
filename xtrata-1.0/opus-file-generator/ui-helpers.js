// ui-helpers.js

/**
 * Updates the status message display.
 * @param {string} msg - The message to display.
 * @param {boolean} [err=false] - Whether the message represents an error.
 */
const updateStatus = (msg, err = false) => {
    // Assumes statusEl is globally available or imported from dom-elements.js
    console.log(`Status Update: ${msg}${err ? ' (Error)' : ''}`);
    if (statusEl) {
      statusEl.textContent = `Status: ${msg}`;
      statusEl.className = err ? 'error' : '';
      statusEl.setAttribute('aria-hidden', 'false');
    }
    if (progressEl && !msg.includes('%')) {
      progressEl.style.display = 'none';
      progressEl.setAttribute('aria-hidden', 'true');
    }
  };
  
  /**
   * Updates the FFmpeg conversion progress bar.
   * @param {number} ratio - The progress ratio (0 to 1).
   */
  const updateProgress = (ratio) => {
      if (progressEl && statusEl) {
          progressEl.style.display = 'block';
          progressEl.setAttribute('aria-hidden', 'false');
          const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));
          progressEl.value = percent;
          updateStatus(`Converting... (${percent}%)`);
      }
  };
  
 /**
 * Enables or disables the Convert, Batch Convert, Batch ZIP Download, and Play Sample buttons based on state.
 * Also updates the text of the main convert button.
 */
const enableConvertButtonIfNeeded = () => {
    // --- Check prerequisites ---
    const ffmpegReady = typeof ffmpeg !== 'undefined' && ffmpeg !== null;
    const anyFileSelected = selectedFiles && selectedFiles.length > 0;
    const multipleFilesSelected = selectedFiles && selectedFiles.length > 1;
    const batchFilesReadyForZip = successfulBatchFiles && successfulBatchFiles.length > 0; // NEW
    const batchZipAvailable =
      typeof handleDownloadBatchZip === 'function' &&
      typeof JSZip !== 'undefined';
  
    // --- Determine button states ---
    const playSampleEnabled = anyFileSelected;
    const singleConvertEnabled = ffmpegReady && anyFileSelected;
    const batchConvertEnabled = ffmpegReady && multipleFilesSelected;
    const downloadBatchZipEnabled = batchFilesReadyForZip && batchZipAvailable; // NEW
  
    // --- Get current output format for button text ---
    const selectedFormatRadio = document.querySelector('input[name="format"]:checked');
    const outputConfig = getAudioOutputConfig(selectedFormatRadio ? selectedFormatRadio.value : 'weba');
  
    // --- Update "Play Original" button ---
    if (playSampleBtn) {
      playSampleBtn.disabled = !playSampleEnabled;
    }
  
    // --- Update "Convert to X" (single file) button ---
    if (convertBtn) {
      convertBtn.disabled = !singleConvertEnabled;
      if (multipleFilesSelected) {
        convertBtn.textContent = `3. Convert First to ${outputConfig.label}`;
      } else {
        convertBtn.textContent = `3. Convert to ${outputConfig.label}`;
      }
    }
  
    // --- Update "Batch Convert All" button ---
    if (batchConvertBtn) {
      batchConvertBtn.disabled = !batchConvertEnabled;
    }
  
    // --- Update "Download Batch ZIP" button --- NEW ---
    if (downloadBatchZipBtn) {
      downloadBatchZipBtn.disabled = !downloadBatchZipEnabled;
    }
    // --- END NEW ---
  
    return !singleConvertEnabled;
  };
  
  /**
   * Updates the displayed original file information.
   * @param {File|null} file - The selected file object, or null to clear.
   */
  function updateOriginalFileInfoDisplay(file) {
      if (originalFileInfoEl) { // Assumes originalFileInfoEl is from dom-elements.js
          if (file && typeof window.formatBytes === 'function') {
              const type = file.type ? (file.type.split('/')[1] || file.name.split('.').pop()) : (file.name.split('.').pop() || 'unknown');
              originalFileInfoEl.textContent = `${type.toUpperCase()}, ${window.formatBytes(file.size)}`;
          } else {
              originalFileInfoEl.textContent = 'N/A';
          }
      }
  }

  function getSizeComparison(originalBytes, convertedBytes) {
      const original = Number(originalBytes);
      const converted = Number(convertedBytes);
      if (
          !Number.isFinite(original) ||
          !Number.isFinite(converted) ||
          original <= 0 ||
          converted < 0 ||
          typeof window.formatBytes !== 'function'
      ) {
          return {
              text: 'N/A',
              detailText: 'Size comparison unavailable.',
              className: ''
          };
      }

      const delta = original - converted;
      const percent = Math.abs(delta / original) * 100;
      if (delta > 0) {
          return {
              text: `${window.formatBytes(delta)} saved (${percent.toFixed(1)}% smaller)`,
              detailText: `A original: ${window.formatBytes(original)}. B converted: ${window.formatBytes(converted)}. Saving: ${window.formatBytes(delta)} (${percent.toFixed(1)}% smaller).`,
              className: 'size-saving-positive'
          };
      }
      if (delta < 0) {
          return {
              text: `${window.formatBytes(Math.abs(delta))} larger (${percent.toFixed(1)}% increase)`,
              detailText: `A original: ${window.formatBytes(original)}. B converted: ${window.formatBytes(converted)}. Output is ${window.formatBytes(Math.abs(delta))} larger (${percent.toFixed(1)}% increase).`,
              className: 'size-saving-negative'
          };
      }
      return {
          text: 'No size change',
          detailText: `A original and B converted are both ${window.formatBytes(original)}.`,
          className: ''
      };
  }

  function updateActualSizeInfoDisplay(originalBlob, convertedBlob) {
      if (actualOutputFileInfoEl) {
          actualOutputFileInfoEl.textContent =
              convertedBlob && typeof window.formatBytes === 'function'
                  ? window.formatBytes(convertedBlob.size)
                  : 'Not converted';
      }

      if (!sizeSavingsInfoEl) return;
      sizeSavingsInfoEl.classList.remove('size-saving-positive', 'size-saving-negative');

      if (!originalBlob || !convertedBlob) {
          sizeSavingsInfoEl.textContent = 'Convert to compare';
          return;
      }

      const comparison = getSizeComparison(originalBlob.size, convertedBlob.size);
      sizeSavingsInfoEl.textContent = comparison.text;
      if (comparison.className) {
          sizeSavingsInfoEl.classList.add(comparison.className);
      }
  }

  window.getSizeComparison = getSizeComparison;
  window.updateActualSizeInfoDisplay = updateActualSizeInfoDisplay;
  
  /**
   * Updates the estimated output file size display based on current settings.
   * This function now updates the consolidated 'currentEstimatedOutputSizeEl'.
   */
  const updateEstimatedSize = () => {
      // Assumes currentEstimatedOutputSizeEl is from dom-elements.js
      if (!currentEstimatedOutputSizeEl) {
          return;
      }
  
      if (typeof fileDuration === 'undefined' || fileDuration === null || !selectedFile) {
          currentEstimatedOutputSizeEl.textContent = 'N/A (No file loaded or duration unknown)';
          // Ensure original file info is also appropriate if fileDuration is missing
          if (!selectedFile && originalFileInfoEl) {
               updateOriginalFileInfoDisplay(null);
          }
          return;
      }
  
      const selectedFormatRadio = document.querySelector('input[name="format"]:checked');
      if (!selectedFormatRadio) {
          currentEstimatedOutputSizeEl.textContent = 'N/A (No format selected)';
          return;
      }
      const selectedFormat = selectedFormatRadio.value;
      let estimateValue = 'Calculating...';
      let estimatedSizeBytes = 0;
  
      if (typeof window.formatBytes !== 'function') {
          currentEstimatedOutputSizeEl.textContent = 'Error: Sizing function unavailable.';
          console.error("formatBytes function is not defined on window.");
          return;
      }
  
      if (selectedFormat === 'mp3' && mp3QualitySlider) {
          const visualQuality = parseInt(mp3QualitySlider.value, 10);
          const approxBitrates = [245, 225, 190, 175, 165, 130, 115, 100, 85, 65];
          const bitrateKbps = approxBitrates[visualQuality] || 165; 
          estimatedSizeBytes = (bitrateKbps * 1000 * fileDuration) / 8;
          estimateValue = `~${window.formatBytes(estimatedSizeBytes)} (MP3 VBR q:${visualQuality})`;
  
      } else if ((selectedFormat === 'opus' || selectedFormat === 'weba') && opusBitrateSlider) {
          const bitrateKbps = parseInt(opusBitrateSlider.value, 10);
          estimatedSizeBytes = (bitrateKbps * 1000 * fileDuration) / 8;
          const formatName = selectedFormat === 'opus' ? 'Opus' : 'WebM Audio (.weba)';
          estimateValue = `~${window.formatBytes(estimatedSizeBytes)} (${formatName} @${bitrateKbps}kbps)`;
      } else {
          estimateValue = 'N/A (Settings incomplete)';
      }
  
      currentEstimatedOutputSizeEl.textContent = estimateValue;
  };
  
  
  /**
   * Shows/hides the relevant quality settings groups based on the selected format.
   */
  const updateQualityDisplays = () => {
    if (!formatRadios || !mp3SettingsDiv || !opusSettingsDiv) {
        console.warn("Quality display elements not found, cannot update.");
        return;
    }
    const selectedFormatRadio = document.querySelector('input[name="format"]:checked');
    if (!selectedFormatRadio) return;
  
    const fmt = selectedFormatRadio.value;
  
    opusSettingsDiv.style.display = (fmt === 'opus' || fmt === 'weba') ? 'block' : 'none';
    mp3SettingsDiv.style.display = fmt === 'mp3' ? 'block' : 'none';
  
    updateEstimatedSize(); 
  };
  
  /**
   * Populates the audio profile selector dropdown.
   */
  const populateAudioProfileSelector = () => {
      console.log("[ui-helpers.js] populateAudioProfileSelector called.");
      if (!audioProfileSelect || typeof audioProfiles === 'undefined') {
          console.error("[ui-helpers.js] Audio profile select element or profiles data not found.");
          return;
      }
      audioProfileSelect.innerHTML = '';
      console.log("[ui-helpers.js] audioProfiles data:", audioProfiles);
  
      let optionCount = 0;
      for (const profileKey in audioProfiles) {
          if (Object.hasOwnProperty.call(audioProfiles, profileKey)) {
              const option = document.createElement('option');
              option.value = profileKey;
              option.textContent = audioProfiles[profileKey].displayName;
              audioProfileSelect.appendChild(option);
              optionCount++;
          }
      }
      console.log(`[ui-helpers.js] Added ${optionCount} options to audioProfileSelect.`);
      if (optionCount === 0) {
          console.warn("[ui-helpers.js] No options were added to the audio profile selector.");
      }
  };
  
  /**
   * Updates the displayed description for the currently selected audio profile.
   * @param {string} profileKey - The key of the selected profile.
   */
  const updateAudioProfileDescription = (profileKey) => {
      if (!audioProfileDescriptionEl || typeof audioProfiles === 'undefined' || !audioProfiles[profileKey]) {
          if(audioProfileDescriptionEl) audioProfileDescriptionEl.textContent = 'Profile description not available.';
          return;
      }
      audioProfileDescriptionEl.textContent = audioProfiles[profileKey].description || '';
  };
  
  /**
   * Applies the settings of a selected audio profile to the Opus UI controls.
   * @param {string} profileKey - The key of the selected profile.
   */
  const applyAudioProfileSettings = (profileKey) => {
      if (typeof audioProfiles === 'undefined' || !audioProfiles[profileKey]) {
          console.warn(`Audio profile "${profileKey}" not found. No settings applied.`);
          updateAudioProfileDescription(profileKey);
          return;
      }
  
      const profile = audioProfiles[profileKey];
      updateAudioProfileDescription(profileKey);
  
      if (profileKey !== 'manual' && profile.opus) {
          if (opusBitrateSlider) opusBitrateSlider.value = profile.opus.bitrate;
          if (opusBitrateValueSpan) opusBitrateValueSpan.textContent = `${profile.opus.bitrate} kbps`;
          if (opusVbrModeSelect) opusVbrModeSelect.value = profile.opus.vbr;
          if (opusCompressionLevelSlider) opusCompressionLevelSlider.value = profile.opus.compressionLevel;
          if (opusCompressionLevelValueSpan) opusCompressionLevelValueSpan.textContent = profile.opus.compressionLevel.toString();
          if (opusApplicationSelect) opusApplicationSelect.value = profile.opus.application;
      }
      updateEstimatedSize();
  };
  
  
  /**
   * Resets UI elements related to conversion results and file selection.
   */
  const resetUIForNewFile = () => {
      console.log("Resetting UI for new file...");
      // --- Audio Section Resets ---
      if (resultEl) resultEl.innerHTML = '';
      if (base64Container) base64Container.style.display = 'none';
      if (base64Result) base64Result.innerHTML = '';
      if (base64Output) base64Output.textContent = '';
      if (copyBase64Btn) copyBase64Btn.disabled = true;
      if (downloadBase64Btn) {
          downloadBase64Btn.disabled = true;
          downloadBase64Btn.textContent = 'Download Audio Base64 as TXT';
      }
      if (originalAudioContainer) {
          originalAudioContainer.style.display = 'none';
          originalAudioContainer.innerHTML = '';
      }
      if (playSampleBtn) {
          playSampleBtn.textContent = 'Play Original';
          playSampleBtn.disabled = true;
      }
  
      if (typeof updateOriginalFileInfoDisplay === 'function') {
          updateOriginalFileInfoDisplay(null);
      }
      if (typeof updateActualSizeInfoDisplay === 'function') {
          updateActualSizeInfoDisplay(null, null);
      }
      if (typeof updateEstimatedSize === 'function') {
          updateEstimatedSize();
      }
  
      if (progressEl) {
           progressEl.style.display = 'none';
           progressEl.value = 0;
           progressEl.removeAttribute('aria-valuenow');
           progressEl.setAttribute('aria-hidden', 'true');
      }
      if (convertBtn) convertBtn.disabled = true;
      successfulBatchFiles = []; // Clear stored batch files
      if (downloadBatchZipBtn) downloadBatchZipBtn.disabled = true;

  
      // --- Info Popup Resets ---
      if (audioInfoContainer) audioInfoContainer.style.display = 'none';
      if (audionalInfoContainer) audionalInfoContainer.style.display = 'none';
  
      // --- Image Section Resets ---
      if (imageFileInput) imageFileInput.value = '';
      if (imagePreview) {
          imagePreview.style.display = 'none';
          imagePreview.src = '#'; 
      }
      if (fileSizeInfo) fileSizeInfo.textContent = '';
      if (convertImageButton) {
          convertImageButton.disabled = true;
          convertImageButton.textContent = 'Convert to Base64';
      }

      // ** CORRECTED VARIABLE NAMES FOR IMAGE SECTION **
      if (imageBase64Output) { // Use the name from dom-elements.js
          const detailsParent = imageBase64Output.closest('details');
          if(detailsParent) detailsParent.open = false;
          // imageBase64Output.style.display = 'none'; // This is handled by image-to-base64.js on file input change
          imageBase64Output.value = '';
      }
      if (copyImageBase64Button) { // Use the name from dom-elements.js
          copyImageBase64Button.disabled = true;
          copyImageBase64Button.textContent = 'Copy Image Base64';
      }
      if (downloadImageBase64Button) { // Use the name from dom-elements.js
          downloadImageBase64Button.disabled = true;
          downloadImageBase64Button.textContent = 'Download Image Base64 as TXT';
      }
      // ** END CORRECTIONS **
  
      // --- Reset HTML Generator State ---
      // Assuming these are the correct function names exposed by html-generator.js for state updates
      if (typeof window.updateAudioBase64 === 'function') window.updateAudioBase64(null);
      if (typeof window.updateImageBase64 === 'function') window.updateImageBase64(null);
      // The checkGenerateButtonState in html-generator.js should handle its button state.
  
      // --- Clean up Blob URLs ---
      if (originalAudioUrl) {
          URL.revokeObjectURL(originalAudioUrl);
          originalAudioUrl = null; 
      }
  };
  
  /**
   * Resets UI elements specific to the *result* of a conversion.
   */
  const resetConversionOutputUI = () => {
      console.log("Resetting conversion output UI...");

    if (resultEl) {
            // Before clearing innerHTML, check for and call manual cleanup on A/B player
            const abPlayer = resultEl.querySelector('.ab-player-container');
            if (abPlayer && typeof abPlayer.revokeUrls === 'function') {
                abPlayer.revokeUrls();
            }
            resultEl.innerHTML = ''; // Clear previous player and download link
        }
      if (base64Container) base64Container.style.display = 'none'; 
      if (base64Result) base64Result.innerHTML = ''; 
      if (base64Output) base64Output.textContent = ''; 
      if (copyBase64Btn) copyBase64Btn.disabled = true;
      if (downloadBase64Btn) {
          downloadBase64Btn.disabled = true;
          downloadBase64Btn.textContent = 'Download Audio Base64 as TXT';
      }
      if (typeof updateActualSizeInfoDisplay === 'function') {
          updateActualSizeInfoDisplay(selectedFile, null);
      }
      if (progressEl) {
          progressEl.style.display = 'none';
          progressEl.value = 0;
          progressEl.setAttribute('aria-hidden', 'true');
      }
      // Reset HTML generator's audio state
      // ** CORRECTED FUNCTION NAME FOR HTML GENERATOR AUDIO RESET **
      if (typeof window.updateAudioBase64 === 'function') window.updateAudioBase64(null);
  };
  
  // --- Audio Format Info Popup ---
  const displayAudioFormatInfo = () => {
    if (typeof audioFormatInfo === 'undefined') {
        console.error("Audio format info data (audioFormatInfo) not found.");
        if (audioInfoContent) audioInfoContent.innerHTML = "<p>Error: Could not load format information.</p>";
        if (audioInfoContainer) audioInfoContainer.style.display = 'block';
        return;
    }
    if (!audioInfoContainer || !audioInfoContent) {
        console.error("Audio info container elements not found in the DOM.");
        return;
    }
    let infoHTML = '';
    infoHTML += audioFormatInfo.conceptsTitle || '';
    infoHTML += audioFormatInfo.losslessVsLossy || '';
    infoHTML += audioFormatInfo.bitrate || '';
    infoHTML += audioFormatInfo.formatsTitle || '';
    infoHTML += audioFormatInfo.wav || '';
    infoHTML += audioFormatInfo.weba || '';
    infoHTML += audioFormatInfo.opus || '';
    infoHTML += audioFormatInfo.mp3 || '';
    infoHTML += audioFormatInfo.opusRecommendationsTitle || '';
    infoHTML += audioFormatInfo.opusDetails || '';
    audioInfoContent.innerHTML = infoHTML;
    audioInfoContent.scrollTop = 0;
    audioInfoContainer.style.display = 'block';
    if (audionalInfoContainer) {
        audionalInfoContainer.style.display = 'none';
    }
  };
  
  const hideAudioFormatInfo = () => {
    if (audioInfoContainer) {
        audioInfoContainer.style.display = 'none';
    }
  };
  
  // --- Audional Instructions Info Popup ---
  const displayAudionalInfo = () => {
    if (typeof audioFormatInfo === 'undefined' || typeof audioFormatInfo.audionalInstructions === 'undefined') {
        console.error("Audional instructions data (audioFormatInfo.audionalInstructions) not found.");
        if (audionalInfoContent) audionalInfoContent.innerHTML = "<p>Error: Could not load Audional instructions.</p>";
        if (audionalInfoContainer) audionalInfoContainer.style.display = 'block';
        return;
    }
    if (!audionalInfoContainer || !audionalInfoContent) {
        console.error("Audional info container elements not found in the DOM.");
        return;
    }
    audionalInfoContent.innerHTML = audioFormatInfo.audionalInstructions;
    audionalInfoContainer.style.display = 'block';
    if (audioInfoContainer) {
        audioInfoContainer.style.display = 'none';
    }
    audionalInfoContent.scrollTop = 0;
  };
  
  const hideAudionalInfo = () => {
      if (audionalInfoContainer) {
          audionalInfoContainer.style.display = 'none';
      }
  };

// NOTE: The image-to-base64.js content you provided seems to be appended to ui-helpers.js.
// It should be in its own file (`image-to-base64.js`) and imported/called as a module.
// I'm assuming this was an accidental concatenation in the prompt.
// The corrections above focus only on the `audionalVisualBase64Output` ReferenceError within the `ui-helpers.js` part.
