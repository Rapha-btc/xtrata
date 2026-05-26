// audio-player.js

/**
 * Creates a container with a play/pause button and an HTML5 audio element.
 * Automatically revokes the Blob URL when the element is removed from the DOM.
 * @param {Blob} blob - The audio data blob.
 * @param {string} mimeType - The MIME type of the audio (e.g., 'audio/mpeg', 'audio/opus').
 * @param {string} label - A label for the play button (e.g., 'Converted Audio').
 * @returns {HTMLElement} A div container with the player controls.
 */
const createAudioPlayer = (blob, mimeType, label) => {
    const url = URL.createObjectURL(blob);
    const container = document.createElement('div');
    container.style.marginTop = '15px'; // Add some spacing
  
    const audio = Object.assign(document.createElement('audio'), {
      controls: true, // Show native controls
      style: 'width:100%; display: block;', // Ensure controls are visible
      src: url,
      preload: 'metadata' // Load enough to get duration etc.
    });
    audio.type = mimeType; // Good practice to set type
  
    const playButton = Object.assign(document.createElement('button'), {
      className: 'play-button button-small', // Add classes for styling
      textContent: `Play ${label}`,
      style: 'margin-bottom: 5px;' // Space between button and controls
    });
  
    playButton.onclick = () => {
      if (audio.paused) {
        audio.play();
      } else {
        audio.pause();
      }
    };
  
    // Update button text based on audio state
    audio.onplay = () => playButton.textContent = `Pause ${label}`;
    audio.onpause = () => playButton.textContent = `Play ${label}`;
    audio.onended = () => playButton.textContent = `Play ${label}`; // Reset on end
  
    // Cleanup blob URL when the container is removed from the DOM
    const observer = new MutationObserver((mutationsList, obs) => {
      for (const mutation of mutationsList) {
        if (mutation.removedNodes) {
          mutation.removedNodes.forEach(node => {
            if (node === container) {
              URL.revokeObjectURL(url);
              // console.log(`Revoked Blob URL for ${label}`); // Debug log
              obs.disconnect(); // Stop observing once removed
            }
          });
        }
      }
    });
  
    // We need to observe the PARENT node to detect when the container is removed.
    // This assumes the container will be appended to something (like resultEl).
    // We start observing *after* appending it. It's slightly tricky.
    // An alternative is manual cleanup when replacing content. Let's rely on manual cleanup
    // by clearing resultEl/base64Result innerHTML for simplicity here, but keep the observer code
    // commented as a reference for a more robust approach.
    /*
    // To make observer work: Call this *after* appending the container to its parent
    const startObserving = (parentElement) => {
        observer.observe(parentElement || document.body, { childList: true });
    }
    // Attach the function to the container for later use
    container.startObserving = startObserving;
    */
  
    // Add a function to manually revoke the URL if needed
    container.revokeUrl = () => {
        URL.revokeObjectURL(url);
        // console.log(`Manually revoked Blob URL for ${label}`); // Debug log
        observer.disconnect(); // Stop observer if it was started
    }
  
    container.append(playButton, audio);
    return container;
  };
  
  
  /**
   * Sets up the audio player for the original selected WAV file.
   */
  const setupOriginalAudioPlayer = () => {
      if (!selectedFile || !originalAudioContainer || !playSampleBtn) return;
  
      // Ensure previous player is fully cleaned up
      if (originalAudioElement) {
          originalAudioElement.pause(); // Stop playback
          originalAudioElement.removeAttribute('src'); // Remove source
          originalAudioElement.load(); // Attempt to reset state
      }
      if (originalAudioUrl) {
          URL.revokeObjectURL(originalAudioUrl);
      }
      originalAudioContainer.innerHTML = ''; // Clear previous player elements
      originalAudioContainer.style.display = 'none';
  
      try {
          originalAudioUrl = URL.createObjectURL(selectedFile);
          originalAudioElement = Object.assign(document.createElement('audio'), {
              controls: true,
              style: 'width:100%;',
              src: originalAudioUrl,
              preload: 'metadata' // Load enough to get duration
          });
          originalAudioElement.type = selectedFile.type; // Set MIME type
  
          const audioTitle = document.createElement('h3');
          audioTitle.textContent = 'Original File';
          audioTitle.style.margin = '0 0 10px 0';
  
          originalAudioContainer.appendChild(audioTitle);
          originalAudioContainer.appendChild(originalAudioElement);
          originalAudioContainer.style.display = 'block'; // Show the container
  
          // Update the separate "Play Original" button text when audio state changes
          originalAudioElement.onplay = () => playSampleBtn.textContent = 'Pause Original';
          originalAudioElement.onpause = () => playSampleBtn.textContent = 'Play Original';
          originalAudioElement.onended = () => playSampleBtn.textContent = 'Play Original';
  
      } catch (error) {
          console.error("Error creating original audio player:", error);
          updateStatus("Could not create player for original file.", true);
          originalAudioContainer.style.display = 'none';
          originalAudioUrl = null;
          originalAudioElement = null;
      }
  };
  
  /**
   * Handles the click event for the "Play Original" button.
   */
  const handlePlayOriginalClick = () => {
      if (!selectedFile) {
          updateStatus('No file selected!', true);
          return;
      }
  
      // Ensure the player exists if a file is selected
      if (!originalAudioElement && originalAudioContainer) {
          setupOriginalAudioPlayer(); // Attempt to set it up
      }
  
      // Toggle play/pause if the element was successfully created
      if (originalAudioElement) {
          if (originalAudioElement.paused) {
              originalAudioElement.play().catch(e => {
                  console.error("Error playing original audio:", e);
                  updateStatus("Could not play original audio.", true);
              });
          } else {
              originalAudioElement.pause();
          }
      } else if (originalAudioContainer.style.display !== 'none') {
          // Player setup failed previously, but container might be visible
          updateStatus('Could not create audio player for original file.', true);
      }
  };