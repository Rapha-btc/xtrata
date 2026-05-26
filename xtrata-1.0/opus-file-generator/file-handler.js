// file-handler.js

/**
 * Gets the duration of an audio file using the Web Audio API.
 * @param {File} file - The audio file object.
 * @returns {Promise<number>} A promise that resolves with the duration in seconds.
 */
const getAudioDuration = file => new Promise((resolve, reject) => {
  if (!file || !(file instanceof File) || !file.type.startsWith('audio/')) { // Added instanceof File check
      return reject("Invalid file object or type provided for duration check.");
  }
  
    const reader = new FileReader();
  
    reader.onload = e => {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContext.decodeAudioData(e.target.result)
        .then(buffer => {
            resolve(buffer.duration);
        })
        .catch(err => {
            console.error("Error decoding audio data:", err);
            let userMessage = "Could not decode audio data. The file might be corrupt or in an unsupported format.";
            if (err.name === 'EncodingError') {
                userMessage = "Audio encoding format not supported by browser.";
            }
            reject(userMessage);
        })
        .finally(() => {
            if (audioContext.state !== 'closed') {
                audioContext.close().catch(e => console.warn("Error closing AudioContext:", e));
            }
        });
    };
  
    reader.onerror = (e) => {
        console.error("File reading error:", e);
        reject("Error reading the file.");
    };
  
    reader.onabort = () => {
        reject("File reading was aborted.");
    }
  
    try {
        reader.readAsArrayBuffer(file);
    } catch(err) {
        console.error("Error calling readAsArrayBuffer:", err);
        reject("Failed to initiate file reading.");
    }
  });
  
  
/**
 * Handles the file input change event.
 * @param {Event} e - The change event object.
 */
const handleFileChange = async (e) => {
    const files = e.target.files; // This is a FileList

    resetUIForNewFile(); // This should clear selectedFiles, batchResultEl etc.

    selectedFiles = []; // Clear the array
    selectedFile = null; // Clear single file reference
    fileDuration = null; // Clear duration (for the first file)

    if (files && files.length > 0) {
        selectedFiles = Array.from(files); // Convert FileList to Array
        selectedFile = selectedFiles[0]; // Set the first file for single-file UI operations

        if (selectedFiles.length > 1) {
            updateStatus(`${selectedFiles.length} files selected. First: ${selectedFile.name}. Ready for batch or single (first file) conversion.`);
        } else {
            updateStatus(`File selected: ${selectedFile.name}. Reading duration...`);
        }
        
        updateOriginalFileInfoDisplay(selectedFile); // Display info for the first file
        
        if (typeof setupOriginalAudioPlayer === 'function') {
            // Pass the specific file to setupOriginalAudioPlayer
            setupOriginalAudioPlayer(selectedFile);
        }

        try {
            // Get duration for the first file for UI estimates
            fileDuration = await getAudioDuration(selectedFile);
            if (selectedFiles.length > 1) {
                updateStatus(`${selectedFiles.length} files selected. First: ${selectedFile.name} (${fileDuration.toFixed(1)}s).`);
            } else {
                updateStatus(`File ready: ${selectedFile.name} (${fileDuration.toFixed(1)}s)`);
            }
            if (typeof updateEstimatedSize === 'function') updateEstimatedSize();
        } catch (err) {
            updateStatus(`Error reading first file: ${err}`, true);
            fileDuration = null; // Reset duration if first file fails
            // selectedFile and selectedFiles might still be set, allowing batch for others.
            // Or clear all:
            // selectedFile = null; selectedFiles = []; if (fileInput) fileInput.value = '';
        }
    } else {
        updateStatus('No file selected.');
    }
    enableConvertButtonIfNeeded(); // This function now considers selectedFiles.length
};