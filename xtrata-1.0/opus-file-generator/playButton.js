// playButton.js
// This script runs inside the generated HTML file.
// It creates a standalone play button if audio data is present but no image is provided.

document.addEventListener('DOMContentLoaded', () => {
    const appContainer = document.getElementById('app');
    if (!appContainer) {
        console.error('playButton.js: CRITICAL - #app container not found in generated HTML. Cannot initialize player.');
        return;
    }

    // Check for expected global variables *after* DOM is ready
    // These variables (audioBase64_Opus, imageBase64) are expected to be defined by an inline script
    // in the generated HTML (from OB1_Template2.js).

    const hasAudioData = typeof audioBase64_Opus !== 'undefined' && audioBase64_Opus && audioBase64_Opus.trim() !== '';
    const hasImageData = typeof imageBase64 !== 'undefined' && imageBase64 && imageBase64.trim() !== '';

    if (hasAudioData) {
        if (!hasImageData) {
            // SCENARIO 1: Audio data exists, and image data is missing or empty.
            // Create the standalone play button.
            console.log('playButton.js: Audio data found, no image data. Creating standalone play button.');

            // Retrieve metadata from the DOM elements (already placed by OB1_Template2.js)
            const instrument = document.getElementById('audio-meta-instrument')?.textContent || 'N/A';
            const note = document.getElementById('audio-meta-note')?.textContent || 'N/A';
            const frequency = document.getElementById('audio-meta-frequency')?.textContent || 'N/A';
            const title = document.getElementById('audio-meta-title')?.textContent || 'Untitled'; // Assuming title might be there
            const metadata = { title, instrument, note, frequency };

            createAndSetupStandaloneButton(appContainer, audioBase64_Opus, metadata);
        } else {
            // SCENARIO 2: Both audio data AND image data exist.
            // This script (playButton.js) should not create its standalone button.
            // It's assumed that other scripts (e.g., app.js/main.js from the OB1 standard)
            // will handle the combined audio-visual player.
            console.log('playButton.js: Both audio and image data found. Standalone button not needed. Player should be handled by main OB1 scripts.');
        }
    } else {
        // SCENARIO 3: audioBase64_Opus is not defined or is empty.
        // This indicates a problem with how the Audional HTML was generated.
        // Display an error message to the user within the Audional itself.
        console.error('playButton.js: CRITICAL - audioBase64_Opus data not found or is empty in this Audional. Cannot create player.');
        if (appContainer) {
            // Clear any potential partial content
            const existingMetadataDiv = appContainer.querySelector('.audio-metadata');
            appContainer.innerHTML = '';
            if (existingMetadataDiv) { // Re-add metadata if it was there for context
                appContainer.appendChild(existingMetadataDiv);
            }
            const errorDiv = document.createElement('div');
            errorDiv.style.padding = '20px';
            errorDiv.style.textAlign = 'center';
            errorDiv.style.color = 'red';
            errorDiv.style.border = '1px solid red';
            errorDiv.style.backgroundColor = '#ffe0e0';
            errorDiv.style.marginTop = '20px';
            errorDiv.innerHTML = `
                <p><strong>Playback Error</strong></p>
                <p>The required audio data seems to be missing or corrupted in this Audional.</p>
            `;
            appContainer.appendChild(errorDiv);
        }
    }
});

/**
 * Creates the actual button, audio element, and wires up event handlers.
 * This function is called internally after checks are passed.
 * @param {HTMLElement} appContainer - The main #app div to append the button to.
 * @param {string} audioBase64Data - The Opus Base64 audio data.
 * @param {object} metadata - Extracted metadata (currently just for console logging or future use).
 */
function createAndSetupStandaloneButton(appContainer, audioBase64Data, metadata) {
    // Preserve existing metadata div if present, clear other content from #app
    const existingMetadataDiv = appContainer.querySelector('.audio-metadata');
    appContainer.innerHTML = ''; // Clear #app
    if (existingMetadataDiv) {
        appContainer.appendChild(existingMetadataDiv); // Re-add metadata if it was there
    }

    const audioSrc = `data:audio/opus;base64,${audioBase64Data}`;
    const audio = new Audio(); // Create audio element programmatically

    const button = document.createElement('button');
    button.id = 'programmaticPlayButton';
    button.textContent = '▶️ Play Audio';
    // Basic styling (can be enhanced via style.css in the generated HTML's context)
    button.style.padding = '20px 30px';
    button.style.fontSize = '2em';
    button.style.fontWeight = 'bold';
    button.style.cursor = 'pointer';
    button.style.border = '2px solid #333'; // Example border
    button.style.borderRadius = '10px';
    button.style.backgroundColor = '#f0f0f0'; // Light grey
    button.style.color = '#333'; // Dark text
    button.style.display = 'block';
    button.style.margin = '50px auto'; // Center it with some top/bottom margin

    let hasPlayedOnce = false; // To handle browser autoplay policies

    button.onclick = () => {
        if (!hasPlayedOnce) {
            audio.src = audioSrc; // Set src only on first user interaction
            hasPlayedOnce = true;
        }
        if (audio.paused) {
            audio.play().catch(e => {
                console.error("Error trying to play audio:", e);
                button.textContent = '⚠️ Playback Error';
                button.disabled = true; // Disable button on critical playback error
                button.style.backgroundColor = '#ffdddd'; // Error indication
                button.style.color = '#aa0000';
            });
        } else {
            audio.pause();
        }
    };

    audio.onplay = () => {
        button.textContent = '⏸️ Pause';
        button.style.backgroundColor = '#e0e0e0'; // Slightly different shade when playing
    };
    audio.onpause = () => {
        button.textContent = '▶️ Play Audio';
        button.style.backgroundColor = '#f0f0f0';
    };
    audio.onended = () => {
        button.textContent = '▶️ Play Again'; // Changed from "Play Audio (Ended)"
        button.style.backgroundColor = '#f0f0f0';
        audio.currentTime = 0; // Reset for replaying
    };
    audio.onerror = (e) => {
        console.error('Audio element error event:', e);
        // The error might have already been caught by audio.play().catch()
        // but this handles other potential audio element errors.
        if (!button.disabled) { // Avoid overriding a more specific error message from play().catch()
            button.textContent = '⚠️ Audio Error';
            button.disabled = true;
            button.style.backgroundColor = '#ffdddd';
            button.style.color = '#aa0000';
        }
    };

    appContainer.appendChild(button);
    console.log('Standalone play button created successfully. Metadata:', metadata);
}