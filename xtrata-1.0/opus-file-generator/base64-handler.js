// base64-handler.js

// Assuming DOM elements are defined globally or imported (e.g., from dom-elements.js)
// const base64Container = document.getElementById('base64Container');
// const base64Output = document.getElementById('base64Output'); // Assumed textarea or pre
// const base64Result = document.getElementById('base64Result'); // Assumed div for player
// const copyBase64Btn = document.getElementById('copyBase64Btn');
// const downloadBase64Btn = document.getElementById('downloadBase64Btn');

// Assuming utility functions are defined globally or imported (e.g., from utils.js)
// const formatBytes = (bytes, decimals = 2) => { ... };

// Assuming UI update functions are defined globally or imported (e.g., from ui-helpers.js)
// const updateStatus = (msg, err = false) => { ... };

// Assuming audio player creation function is defined globally or imported (e.g., from audio-player.js)
// const createAudioPlayer = (blob, mimeType, title) => { ... };


/**
 * Converts a Blob to a Base64 encoded string (without the data URI prefix).
 * @param {Blob} blob - The blob to convert.
 * @returns {Promise<string>} A promise resolving with the PURE Base64 string.
 */
const convertBlobToBase64 = blob => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    // Find the comma and take the part after it
    const commaIndex = dataUrl.indexOf(',');
    if (commaIndex !== -1 && commaIndex < dataUrl.length - 1) {
      resolve(dataUrl.substring(commaIndex + 1)); // Return only Base64 part
    } else {
      // Handle cases where it might already be base64 or invalid format
       console.warn('Could not find data URI prefix, returning original string for validation downstream.');
       resolve(dataUrl); // Pass it on, let downstream handle if it's invalid
       // Or reject: reject(new Error('Invalid Data URL format during Base64 conversion.'));
    }
  };
  reader.onerror = (e) => reject(new Error(`Error reading blob as Data URL: ${e.message || 'Unknown error'}`));
  reader.onabort = () => reject(new Error('Blob reading for Base64 conversion was aborted.'));

  try {
      reader.readAsDataURL(blob);
  } catch(err) {
      reject(new Error(`Failed to initiate Blob reading: ${err.message}`));
  }
});

/**
 * Sets up the Base64 output section with the converted audio and dispatches the event.
 * @param {Blob} audioBlob - The converted audio blob.
 * @param {string} outputFormat - 'mp3' or 'opus'.
 * @param {string} originalNameBase - The base filename of the original input.
 */
const setupBase64DisplayAndActions = async (audioBlob, outputFormat, originalNameBase) => {
  // Ensure necessary DOM elements are available
  // (Replace with proper checks if using imports/modules)
  const elementsExist = base64Container && base64Output && base64Result && copyBase64Btn && downloadBase64Btn;
  if (!elementsExist) {
      console.error("Base64 UI elements not found. Cannot proceed.");
      updateStatus("Error: Base64 UI components missing.", true);
      return;
  }

  let generatedBase64String = null; // Use a local variable

  try {
    updateStatus('Converting audio to Base64...');
    generatedBase64String = await convertBlobToBase64(audioBlob);

    // --- *** DISPATCH THE EVENT FOR HTML GENERATOR *** ---
    console.log("Dispatching audionalBase64Generated event...");
    document.dispatchEvent(new CustomEvent('audionalBase64Generated', {
        detail: { base64Data: generatedBase64String } // Send the pure base64 string
    }));
    // --- *** END OF EVENT DISPATCH *** ---

    // --- Proceed with UI setup ---
    base64Container.style.display = 'block';
    // Use textContent for <pre> or <textarea>, value for <textarea> if editable needed
    if (base64Output.tagName === 'TEXTAREA') {
       base64Output.value = generatedBase64String;
    } else {
       base64Output.textContent = generatedBase64String; // Display the string
    }


    // Clear previous player and create a new one for the Base64 audio (optional but good for verification)
    base64Result.innerHTML = ''; // Clear previous results
    let mimeType;
    if (outputFormat === 'mp3') mimeType = 'audio/mpeg';
    else if (outputFormat === 'weba') mimeType = 'audio/webm; codecs=opus';
    else mimeType = 'audio/opus';
    
    // Create player using the original blob, as converting Base64 back to blob just for player is inefficient
    const base64PlayerContainer = createAudioPlayer(audioBlob, mimeType, 'Converted Audio (Preview)');
    base64Result.appendChild(base64PlayerContainer);
    // If using observer in createAudioPlayer: base64PlayerContainer.startObserving(base64Result);

    // Setup Copy Button
    copyBase64Btn.onclick = () => {
      if (!navigator.clipboard) {
          alert('Clipboard API not available. Try copying manually.');
          return;
      }
      // Copy the *pure* base64 string
      navigator.clipboard.writeText(generatedBase64String)
        .then(() => {
          const origText = copyBase64Btn.textContent;
          copyBase64Btn.textContent = 'Copied!';
          copyBase64Btn.disabled = true;
          setTimeout(() => {
              copyBase64Btn.textContent = origText;
              copyBase64Btn.disabled = false;
          }, 2000);
        })
        .catch(err => {
          console.error('Failed to copy base64:', err);
          alert('Failed to copy to clipboard. Check browser permissions (requires HTTPS or localhost).');
        });
    };
    copyBase64Btn.disabled = false; // Ensure enabled

    // Setup Download Button
    downloadBase64Btn.onclick = () => {
      try {
        // Download the *pure* base64 string
        const txtBlob = new Blob([generatedBase64String], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(txtBlob);
        const a = Object.assign(document.createElement('a'), {
          href: url,
          download: `${originalNameBase}.${outputFormat}.base64.txt` // e.g., myaudio.mp3.base64.txt
        });
        document.body.appendChild(a); // Required for Firefox
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url); // Clean up URL
      } catch (dlError) {
          console.error("Error creating/downloading base64 txt file:", dlError);
          alert("Failed to prepare base64 text file for download.");
      }
    };
    downloadBase64Btn.disabled = false; // Ensure enabled

    // Update download button text with size
    // Note: string.length gives number of characters, which is roughly bytes for ASCII/Latin1subset
    // For full UTF-8 it's more complex, but base64 uses a limited charset, so length is a good approx.
    const base64TextSizeBytes = generatedBase64String.length;
    downloadBase64Btn.textContent = `Download as TXT (${formatBytes(base64TextSizeBytes)})`;

    updateStatus('Base64 conversion complete!');

  } catch (e) {
    updateStatus(`Base64 processing failed: ${e.message || 'Unknown error'}`, true);
    console.error("Base64 Processing Error:", e);
    base64Container.style.display = 'none'; // Hide section on error
    base64Result.innerHTML = ''; // Clear any partial results
    copyBase64Btn.disabled = true;
    downloadBase64Btn.disabled = true;
    // Ensure HTML generator knows data is invalid/missing if needed (though it relies on events)
  }
};

// Ensure this script doesn't overwrite functions if loaded multiple times (less likely with defer)
// No explicit exports needed if functions are called from other scripts loaded globally or via events.