// main.js - Application Entry Point

// Check if the core FFmpeg library object exists (loaded from CDN)
if (typeof FFmpeg === 'undefined' || typeof FFmpeg.createFFmpeg === 'undefined') {
    console.error("FFmpeg library (FFmpeg.js) not loaded correctly. Check the script tag in the HTML.");
    const statusElement = document.getElementById('status'); 
    if (statusElement) {
        statusElement.textContent = 'Error: Could not load required FFmpeg library. Please refresh.';
        statusElement.className = 'error';
    }
    const mainInterface = document.querySelector('main'); 
    if (mainInterface) {
       mainInterface.style.opacity = '0.5';
       mainInterface.style.pointerEvents = 'none';
    }

} else {
    // FFmpeg object exists, proceed with application setup
    const initializeApp = () => {
        if (typeof updateStatus === 'function') updateStatus('Initializing application...');
        else console.log('Initializing application...');

        if (typeof initializeUIState === 'function') initializeUIState(); 
        else console.error('initializeUIState function not found!');

        if (typeof loadFFmpeg === 'function') loadFFmpeg(); 
        else console.error('loadFFmpeg function not found!');
        
        if (typeof setupEventListeners === 'function') setupEventListeners();
        else console.error('setupEventListeners function not found!');
        
        if (typeof updateStatus === 'function') updateStatus('Ready. Select an audio file.');
        else console.log('Ready. Select an audio file.');
    };

    window.addEventListener('load', initializeApp);
}