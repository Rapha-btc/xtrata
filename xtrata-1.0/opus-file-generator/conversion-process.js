// conversion-process.js

/**
 * Handles the main audio conversion workflow, ensuring robust A/B UI display.
 */
const runConversion = async () => {
    // --- Initial Checks ---
    if (!ffmpeg || !selectedFile) {
        updateStatus('Error: FFmpeg not loaded or no file selected.', true);
        // Still display A/B UI with only the original file (disabled B)
        showABComparisonPlayer(selectedFile, selectedFile.type, null, null, false, "No file or FFmpeg not loaded.");
        return;
    }
    if (!fileDuration) {
        updateStatus('Error: File duration not available. Cannot estimate or convert.', true);
        showABComparisonPlayer(selectedFile, selectedFile.type, null, null, false, "File duration not available.");
        return;
    }

    // --- UI Setup ---
    if (convertBtn) convertBtn.disabled = true;
    if (playSampleBtn) playSampleBtn.disabled = true;
    resetConversionOutputUI();
    convertedAudioBlob = null;
    base64String = null;

    updateStatus('Preparing file for FFmpeg...');

    // --- Determine Output Format and Filenames ---
    const inputFilename = "input_audio_file";
    const selectedFormatRadio = document.querySelector('input[name="format"]:checked');
    const outputFormat = selectedFormatRadio ? selectedFormatRadio.value : 'weba';
    const outputConfig = getAudioOutputConfig(outputFormat);
    const outputFilename = `output.${outputConfig.extension}`;
    const originalNameBase = getBaseFilename(selectedFile.name);

    // --- Filesystem Cleanup ---
    cleanupFFmpegFS([inputFilename, outputFilename]);

    let conversionSucceeded = false;
    let conversionError = null;

    try {
        // --- Load Input File ---
        updateStatus('Loading file into FFmpeg memory...');
        const fileData = await fetchFile(selectedFile);
        ffmpeg.FS('writeFile', inputFilename, fileData);

        // --- Run FFmpeg Conversion ---
        const outputData = await runFFmpegConversion(inputFilename, outputFilename, outputFormat);

        updateStatus('Conversion complete! Processing output...');

        // --- Process Output Data ---
        const mimeType = outputConfig.mimeType;

        // Create Blob from the converted data
        convertedAudioBlob = new Blob([outputData.buffer], { type: mimeType });

        // Defensive: ensure blob is non-empty
        if (!convertedAudioBlob || convertedAudioBlob.size === 0) {
            throw new Error("Converted audio file is empty or invalid.");
        }

        // --- Display Results (Standard Audio Player + Download Link) ---
        if (resultEl) {
            resultEl.innerHTML = '';
            const resultTitle = document.createElement('h3');
            resultTitle.textContent = 'Conversion Result';
            resultTitle.style.margin = '15px 0 10px 0';
            const downloadUrl = URL.createObjectURL(convertedAudioBlob);
            const dlLink = Object.assign(document.createElement('a'), {
                href: downloadUrl,
                download: `${originalNameBase}.${outputConfig.extension}`,
                textContent: `Download ${originalNameBase}.${outputConfig.extension} (${formatBytes(convertedAudioBlob.size)})`,
                style: 'display: block; margin-bottom: 10px;'
            });

            const audioPlayerContainer = createAudioPlayer(
                convertedAudioBlob,
                mimeType,
                `Converted Audio (${outputConfig.label})`
            );

            resultEl.append(resultTitle, dlLink, audioPlayerContainer);

            dlLink.addEventListener('click', () => {
                // Optional: setTimeout(() => URL.revokeObjectURL(downloadUrl), 1500);
            });
        }

        conversionSucceeded = true;
        updateStatus('Conversion successful! Output ready.');
    } catch (e) {
        updateStatus(`Conversion process failed: ${e.message || 'Unknown error'}`, true);
        console.error("Conversion Process Error:", e);
        conversionError = e;
        convertedAudioBlob = null;
        base64String = null;
    } finally {
        // --- Final Cleanup ---
        cleanupFFmpegFS([inputFilename, outputFilename]);
        enableConvertButtonIfNeeded();
        if (playSampleBtn) playSampleBtn.disabled = !selectedFile;
    }

    // --- ALWAYS Display A/B Player (Original vs. Converted or fallback) ---
    // Use a helper for clarity
    showABComparisonPlayer(
        selectedFile,
        selectedFile.type,
        convertedAudioBlob,
        convertedAudioBlob ? convertedAudioBlob.type : null,
        conversionSucceeded,
        conversionError
    );

    // --- Base64 Handling (after UI/players are built) ---
    if (convertedAudioBlob) {
        await setupBase64DisplayAndActions(convertedAudioBlob, outputFormat, originalNameBase);
    }
};


const runBatchConversion = async () => {
    successfulBatchFiles = []; // Clear for a new batch

    if (!ffmpeg || !selectedFiles || selectedFiles.length === 0) {
        updateStatus('Error: FFmpeg not loaded or no files selected for batch.', true);
        return;
    }
    if (selectedFiles.length <= 1 && batchConvertBtn) {
        // If only one file, could call runConversion or just disable batch button
        updateStatus('Batch conversion requires more than one file. Use single convert instead.', false);
        return;
    }

    if (convertBtn) convertBtn.disabled = true;
    if (batchConvertBtn) batchConvertBtn.disabled = true;
    if (playSampleBtn) playSampleBtn.disabled = true;
    if (resultEl) resultEl.innerHTML = ''; // Clear single result area
    if (base64Container) base64Container.style.display = 'none'; // Hide single base64 area
    if (batchResultEl) batchResultEl.innerHTML = '<h3>Batch Conversion Results:</h3>';

    const outputFormat = document.querySelector('input[name="format"]:checked')?.value || 'weba';
    const outputConfig = getAudioOutputConfig(outputFormat);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < selectedFiles.length; i++) {
        const currentFile = selectedFiles[i];
        const originalNameBase = getBaseFilename(currentFile.name);
        const progressId = `file-progress-${i}`;

        updateStatus(`Batch: Processing ${i + 1}/${selectedFiles.length}: ${currentFile.name}`);
        
        const fileResultContainer = document.createElement('div');
        fileResultContainer.className = 'batch-file-result';
        fileResultContainer.style.borderBottom = '1px solid #eee';
        fileResultContainer.style.padding = '10px 0';
        fileResultContainer.style.marginBottom = '10px';
        
        const title = document.createElement('h4');
        title.textContent = `${i+1}. ${currentFile.name}`;
        fileResultContainer.appendChild(title);

        const currentProgressEl = document.createElement('progress');
        currentProgressEl.id = progressId;
        currentProgressEl.value = 0;
        currentProgressEl.max = 100;
        currentProgressEl.style.width = '100%';
        currentProgressEl.style.display = 'none'; // Show when processing starts
        fileResultContainer.appendChild(currentProgressEl);
        
        batchResultEl.appendChild(fileResultContainer);


        const inputFilename = `input_batch_${Date.now()}_${i}`; // Unique input name
        const outputFilename = `output_batch_${Date.now()}_${i}.${outputConfig.extension}`;
        cleanupFFmpegFS([inputFilename, outputFilename]);
        const restoreProgress = () => {
            ffmpeg.setProgress(({ ratio }) => {
                updateProgress(ratio);
            });
        };

        try {
            const fileData = await fetchFile(currentFile);
            ffmpeg.FS('writeFile', inputFilename, fileData);

            // Temporarily override global progress update for this file
            ffmpeg.setProgress(({ ratio }) => {
                 currentProgressEl.style.display = 'block';
                 const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));
                 currentProgressEl.value = percent;
                 if (statusEl) statusEl.textContent = `Status: Converting ${currentFile.name}... (${percent}%)`;
            });

            const outputData = await runFFmpegConversion(inputFilename, outputFilename, outputFormat);
            restoreProgress();

            const mimeType = outputConfig.mimeType;

            const convertedBlob = new Blob([outputData.buffer], { type: mimeType });

            if (!convertedBlob || convertedBlob.size === 0) {
                throw new Error("Converted audio file is empty or invalid.");
            }
            currentProgressEl.style.display = 'none'; // Hide progress after completion

            const successInfo = document.createElement('p');
            successInfo.textContent = `Converted to ${outputConfig.label}: ${formatBytes(convertedBlob.size)}`;
            successInfo.style.color = 'green';
            fileResultContainer.appendChild(successInfo);

            // Simple Player for this file
            const audioPlayer = createAudioPlayer(convertedBlob, mimeType, `Play ${originalNameBase}`);
            fileResultContainer.appendChild(audioPlayer);

            // Download Link for Converted File
            const dlUrl = URL.createObjectURL(convertedBlob);
            const dlLink = Object.assign(document.createElement('a'), {
                href: dlUrl, download: `${originalNameBase}.${outputConfig.extension}`,
                textContent: `Download Converted File`, className: 'button-small',
                style: 'margin: 5px 5px 5px 0;'
            });
            fileResultContainer.appendChild(dlLink);
            // Optional: dlLink.onclick = () => setTimeout(() => URL.revokeObjectURL(dlUrl), 100);
            
            // Store successful file for ZIP download
            successfulBatchFiles.push({
                filename: `${originalNameBase}.${outputConfig.extension}`,
                blob: convertedBlob
            });

            // Base64 TXT Download Link for this file
            try {
                updateStatus(`Generating Base64 for ${originalNameBase}...`);
                // convertBlobToBase64 is async, ensure it's available and awaited
                const base64Str = await convertBlobToBase64(convertedBlob);
                const txtBlob = new Blob([base64Str], { type: 'text/plain;charset=utf-8' });
                const b64DlUrl = URL.createObjectURL(txtBlob);
                const base64DlLink = Object.assign(document.createElement('a'), {
                    href: b64DlUrl, download: `${originalNameBase}.${outputConfig.extension}.base64.txt`,
                    textContent: `Download Base64 TXT (${formatBytes(base64Str.length)})`, className: 'button-small'
                });
                fileResultContainer.appendChild(base64DlLink);
                // Optional: base64DlLink.onclick = () => setTimeout(() => URL.revokeObjectURL(b64DlUrl), 100);
            } catch (b64Err) {
                const b64ErrorP = document.createElement('p');
                b64ErrorP.textContent = `Could not generate Base64: ${b64Err.message}`;
                b64ErrorP.style.color = 'red';
                fileResultContainer.appendChild(b64ErrorP);
            }
            successCount++;
        } catch (e) {
            failCount++;
            restoreProgress();
            currentProgressEl.style.display = 'none';
            const errorP = document.createElement('p');
            errorP.textContent = `Failed to convert ${currentFile.name}: ${e.message}`;
            errorP.style.color = 'red';
            fileResultContainer.appendChild(errorP);
            console.error(`Error converting ${currentFile.name}:`, e);
        } finally {
            cleanupFFmpegFS([inputFilename, outputFilename]);
        }
         // Small delay between files if desired, or for UI to update
         // await new Promise(resolve => setTimeout(resolve, 50));
    } // End of loop

    updateStatus(`Batch conversion finished. ${successCount} successful, ${failCount} failed.`);
    enableConvertButtonIfNeeded();
    if (playSampleBtn) playSampleBtn.disabled = !(selectedFiles && selectedFiles.length > 0);
};
/**
 * Shows the A/B Quality Comparison player robustly. Handles async or sync A/B modules.
 * If conversion failed, disables B or shows error message in UI.
 */
function showABComparisonPlayer(originalBlob, originalMimeType, convertedBlob, convertedMimeType, conversionSucceeded, conversionError) {
    if (!resultEl) return;
    // Remove previous A/B player if present
    const prevAB = resultEl.querySelector('.ab-player-container');
    if (prevAB && typeof prevAB.revokeUrls === 'function') prevAB.revokeUrls();

    const abPlayerTitle = document.createElement('h3');
    abPlayerTitle.textContent = 'A/B Quality Comparison';
    abPlayerTitle.style.margin = '25px 0 10px 0';
    abPlayerTitle.style.borderTop = '1px dashed var(--border-color)';
    abPlayerTitle.style.paddingTop = '15px';

    // Remove old AB player(s) before appending
    // (Some browsers won't garbage collect otherwise.)
    const oldAB = resultEl.querySelector('.ab-player-container');
    if (oldAB) oldAB.remove();

    // Defensive: never append null or Promise
    let abPlayerElement;
    try {
        // If using a sync ab-player.js (returns HTMLElement)
        abPlayerElement = createABPlayerUI(
            originalBlob,
            originalMimeType,
            convertedBlob,
            convertedMimeType,
            conversionSucceeded,
            conversionError
        );

        // If it's a Promise (async Web Audio version), handle as Promise
        if (abPlayerElement && typeof abPlayerElement.then === 'function') {
            abPlayerElement.then(element => {
                insertABSection(resultEl, abPlayerTitle, element, conversionSucceeded, conversionError);
            }).catch(e => {
                // fallback UI
                const fallback = document.createElement('div');
                fallback.textContent = "Failed to load A/B player.";
                resultEl.append(abPlayerTitle, fallback);
            });
        } else {
            insertABSection(resultEl, abPlayerTitle, abPlayerElement, conversionSucceeded, conversionError);
        }
    } catch (err) {
        const fallback = document.createElement('div');
        fallback.textContent = "Could not display A/B player.";
        resultEl.append(abPlayerTitle, fallback);
    }
}

/**
 * Actually insert the AB player and display error if B is missing.
 */
function insertABSection(container, titleNode, abPlayerElement, conversionSucceeded, conversionError) {
    if (!abPlayerElement) {
        const fallback = document.createElement('div');
        fallback.textContent = "Failed to create A/B comparison UI.";
        container.append(titleNode, fallback);
        return;
    }
    container.append(titleNode, abPlayerElement);
    // If B (converted) is missing, visually indicate
    if (!conversionSucceeded) {
        // If your ab-player.js supports disabling B, do it here
        const warning = document.createElement('div');
        warning.textContent = "Note: Only the original audio is available for A/B comparison. (Conversion failed or output missing.)";
        warning.style.color = 'orange';
        warning.style.fontSize = '1em';
        warning.style.margin = '10px 0 0 0';
        abPlayerElement.appendChild(warning);
        // Optionally, if using custom ab-player.js, call abPlayerElement.disableB();
    }
}
