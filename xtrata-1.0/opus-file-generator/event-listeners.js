// event-listeners.js

/**
 * Sets up all event listeners for the application.
 */
const setupEventListeners = () => {
    console.log("Setting up event listeners...");

    if (fileInput) {
        fileInput.addEventListener('change', handleFileChange);
    } else {
        console.error("Audio File input element not found.");
    }

    if (playSampleBtn) {
        playSampleBtn.addEventListener('click', handlePlayOriginalClick);
    } else {
        console.error("Play sample button not found.");
    }

    if (formatRadios && formatRadios.length > 0) {
        formatRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                if (typeof updateQualityDisplays === 'function') updateQualityDisplays();
                if (typeof updateEstimatedSize === 'function') updateEstimatedSize();
                const selectedFormatRadio = document.querySelector('input[name="format"]:checked');
                if (selectedFormatRadio && convertBtn) {
                     convertBtn.textContent = `3. Convert to ${selectedFormatRadio.value.toUpperCase()} (Opus)`;
                }
            });
        });
    } else {
        console.error("Format radio buttons not found.");
    }

    if (audioProfileSelect) {
        audioProfileSelect.addEventListener('change', (e) => {
            const selectedProfileKey = e.target.value;
            if (typeof applyAudioProfileSettings === 'function') applyAudioProfileSettings(selectedProfileKey);
        });
    } else {
        console.error("Audio Profile select element not found.");
    }

    if (mp3QualitySlider && mp3QualityValueSpan) {
        mp3QualitySlider.addEventListener('input', (e) => {
            mp3QualityValueSpan.textContent = e.target.value;
            if (typeof updateEstimatedSize === 'function') updateEstimatedSize();
        });
    }

    if (opusBitrateSlider && opusBitrateValueSpan) {
        opusBitrateSlider.addEventListener('input', (e) => {
            opusBitrateValueSpan.textContent = `${e.target.value} kbps`;
            if (typeof updateEstimatedSize === 'function') updateEstimatedSize();
            if (audioProfileSelect && audioProfileSelect.value !== 'manual') {
                audioProfileSelect.value = 'manual';
                if (typeof updateAudioProfileDescription === 'function') updateAudioProfileDescription('manual');
            }
        });
    } else {
        console.error("Opus/WebM Audio bitrate slider or value span not found.");
    }

    // Add updateEstimatedSize() to other Opus control listeners
    if (opusVbrModeSelect) {
        opusVbrModeSelect.addEventListener('change', () => {
            if (typeof updateEstimatedSize === 'function') updateEstimatedSize(); // Added
            if (audioProfileSelect && audioProfileSelect.value !== 'manual') {
                audioProfileSelect.value = 'manual';
                if (typeof updateAudioProfileDescription === 'function') updateAudioProfileDescription('manual');
            }
        });
    } else {
        console.warn("Opus VBR Mode select element (opusVbrMode) not found.");
    }

    if (opusCompressionLevelSlider && opusCompressionLevelValueSpan) {
        opusCompressionLevelSlider.addEventListener('input', (e) => {
            opusCompressionLevelValueSpan.textContent = e.target.value;
            if (typeof updateEstimatedSize === 'function') updateEstimatedSize(); // Added
            if (audioProfileSelect && audioProfileSelect.value !== 'manual') {
                audioProfileSelect.value = 'manual';
                if (typeof updateAudioProfileDescription === 'function') updateAudioProfileDescription('manual');
            }
        });
    } else {
        console.warn("Opus Compression Level slider or value span not found.");
    }

    if (opusApplicationSelect) {
        opusApplicationSelect.addEventListener('change', () => {
            if (typeof updateEstimatedSize === 'function') updateEstimatedSize(); // Added
            if (audioProfileSelect && audioProfileSelect.value !== 'manual') {
                audioProfileSelect.value = 'manual';
                if (typeof updateAudioProfileDescription === 'function') updateAudioProfileDescription('manual');
            }
        });
    } else {
        console.warn("Opus Application select element not found.");
    }

    if (convertBtn) {
        convertBtn.addEventListener('click', runConversion);
    } else {
        console.error("Convert button not found.");
    }

    if (batchConvertBtn) {
        batchConvertBtn.addEventListener('click', runBatchConversion); // runBatchConversion will be in conversion-process.js
    }

    if (showAudioInfoBtn) {
        showAudioInfoBtn.addEventListener('click', () => {
            if (typeof displayAudioFormatInfo === 'function') displayAudioFormatInfo();
        });
    } else {
        console.error("Show Audio Info button (showAudioInfoBtn) not found.");
    }

    if (closeAudioInfoBtn) {
        closeAudioInfoBtn.addEventListener('click', () => {
            if (typeof hideAudioFormatInfo === 'function') hideAudioFormatInfo();
        });
    } else {
        console.error("Close Audio Info button (closeAudioInfoBtn) not found.");
    }

    if (showAudionalInfoBtn) {
        showAudionalInfoBtn.addEventListener('click', () => {
             if (typeof displayAudionalInfo === 'function') displayAudionalInfo();
        });
    } else {
        console.error("Show Audional Info button (showAudionalInfoBtn) not found.");
    }

    if (closeAudionalInfoBtn) {
        closeAudionalInfoBtn.addEventListener('click', () => {
            if (typeof hideAudionalInfo === 'function') hideAudionalInfo();
        });
    } else {
        console.error("Close Audional Info button (closeAudionalInfoBtn) not found.");
    }
    console.log("Event listeners setup complete.");
};

/**
 * Sets the initial state of UI elements like sliders and displays.
 */
const initializeUIState = () => {
    console.log("[event-listeners.js] initializeUIState called.");
    if (mp3QualitySlider && mp3QualityValueSpan) {
        mp3QualitySlider.value = initialMp3Quality;
        mp3QualityValueSpan.textContent = mp3QualitySlider.value;
    }
    if (opusBitrateSlider && opusBitrateValueSpan) {
         opusBitrateSlider.value = initialOpusBitrate;
         opusBitrateValueSpan.textContent = `${initialOpusBitrate} kbps`;
    }
    if (opusVbrModeSelect) {
        opusVbrModeSelect.value = initialOpusVbrMode;
    }
    if (opusCompressionLevelSlider && opusCompressionLevelValueSpan) {
        opusCompressionLevelSlider.value = initialOpusCompressionLevel;
        opusCompressionLevelValueSpan.textContent = initialOpusCompressionLevel.toString();
    }
    if (opusApplicationSelect) {
        opusApplicationSelect.value = initialOpusApplication;
    }

    console.log("[event-listeners.js] Attempting to initialize audio profile system...");
    if (typeof populateAudioProfileSelector === 'function') {
        populateAudioProfileSelector();
    } else {
        console.error("[event-listeners.js] populateAudioProfileSelector function is not defined!");
    }

    if (audioProfileSelect && typeof initialAudioProfile !== 'undefined') {
        if (audioProfileSelect.options.length > 0) {
            audioProfileSelect.value = initialAudioProfile;
        } else {
            console.warn("[event-listeners.js] Cannot set initial audio profile value, selector has no options.");
        }
    }

    console.log("[event-listeners.js] Attempting to apply initial audio profile settings...");
    if (typeof applyAudioProfileSettings === 'function' && typeof initialAudioProfile !== 'undefined') {
        applyAudioProfileSettings(initialAudioProfile); // This will also call updateEstimatedSize
    } else {
        if(typeof applyAudioProfileSettings !== 'function') console.error("[event-listeners.js] applyAudioProfileSettings function is not defined!");
    }

    if (formatRadios) {
        const webaRadio = document.querySelector('input[name="format"][value="weba"]');
        const checkedRadio = document.querySelector('input[name="format"]:checked');
        if (webaRadio && !checkedRadio) {
             webaRadio.checked = true;
        } else if (!checkedRadio && formatRadios.length > 0) {
             formatRadios[0].checked = true;
        }
        const currentChecked = document.querySelector('input[name="format"]:checked');
        if (currentChecked && convertBtn) {
            convertBtn.textContent = `3. Convert to ${currentChecked.value.toUpperCase()} (Opus)`;
        }
    }

    // Initialize the new info section display
    if (typeof updateOriginalFileInfoDisplay === 'function') {
        updateOriginalFileInfoDisplay(null); // Set original file info to N/A
    }
    // updateEstimatedSize will be called by applyAudioProfileSettings or updateQualityDisplays

    if (typeof updateQualityDisplays === 'function') {
        updateQualityDisplays(); // This will set initial visibility and call updateEstimatedSize
    } else { // Fallback if updateQualityDisplays is not available for some reason
        if (typeof updateEstimatedSize === 'function') {
            updateEstimatedSize();
        }
    }
    
    if (typeof enableConvertButtonIfNeeded === 'function') {
        enableConvertButtonIfNeeded();
    }

    if (downloadBatchZipBtn) {
        downloadBatchZipBtn.addEventListener('click', handleDownloadBatchZip); // New handler function
    }

    if (audioInfoContainer) audioInfoContainer.style.display = 'none';
    if (audionalInfoContainer) audionalInfoContainer.style.display = 'none';
    if (metadataModal) metadataModal.classList.add('hidden');
    if (progressEl) progressEl.style.display = 'none';
    if (copyBase64Btn) copyBase64Btn.disabled = true;
    if (downloadBase64Btn) downloadBase64Btn.disabled = true;
    if (batchConvertBtn) batchConvertBtn.disabled = true;
    if (downloadBatchZipBtn) downloadBatchZipBtn.disabled = true;



    const convertImageBtn = document.getElementById('convert-image-button');
    const copyImageBtn = document.getElementById('copy-image-base64-button');
    const downloadImageBtn = document.getElementById('download-image-base64-button');
    if (convertImageBtn) convertImageBtn.disabled = true;
    if (copyImageBtn) copyImageBtn.disabled = true;
    if (downloadImageBtn) downloadImageBtn.disabled = true;

    const generateHtmlBtn = document.getElementById('generateHtmlButton');
    if(generateHtmlBtn) generateHtmlBtn.disabled = false; 

    console.log("UI state initialized.");
};