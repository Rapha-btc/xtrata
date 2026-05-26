document.addEventListener('DOMContentLoaded', () => {
    // Check required elements exist before proceeding
    const loopCheckbox = document.getElementById('loopCheckbox');
    const bpmGroup = document.getElementById('bpmGroup');
    const bpmInput = document.getElementById('bpmInput');
    const noteInput = document.getElementById('noteInput');
    const frequencyInput = document.getElementById('frequencyInput');
    const noteList = document.getElementById('noteList');
    const cancelBtn = document.getElementById('cancelMetadataBtn');
    const form = document.getElementById('metadataForm');
    const modal = document.getElementById('metadataModal');
  
    if (!loopCheckbox || !bpmGroup || !bpmInput || !noteInput || !frequencyInput || !noteList || !cancelBtn || !form || !modal) {
        console.error("Metadata modal script: One or more required elements not found. Frequency calculation might fail.");
        return; // Stop execution if elements are missing
    }
  
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const noteOffsets = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11};
  
    function generateNoteOptions() {
       if (!noteList) return;
       noteList.innerHTML = ''; // Clear existing options first
       for (let octave = 0; octave <= 8; octave++) {
         for (let i = 0; i < notes.length; i++) {
           const noteName = notes[i];
           if (octave === 8 && i > notes.indexOf('A')) { break; }
           const fullNote = `${noteName}${octave}`;
           const option = document.createElement('option');
           option.value = fullNote;
           noteList.appendChild(option);
         }
       }
    }
  
    function noteToFrequency(note) {
      const noteRegex = /^([A-G])(#|b)?([0-8])$/i;
      const match = note.match(noteRegex);
      if (!match) { return null; }
      let noteName = match[1].toUpperCase(); const accidental = match[2]; const octave = parseInt(match[3], 10);
      if (accidental === 'b') { const originalOffset = noteOffsets[noteName]; const sharpOffset = (originalOffset - 1 + 12) % 12; noteName = Object.keys(noteOffsets).find(key => noteOffsets[key] === sharpOffset && !key.includes('b')) || noteName; } else if (accidental === '#') { noteName += '#'; }
      if (!(noteName in noteOffsets)) { console.warn(`Could not map note: ${noteName}`); return null; }
      const noteOffset = noteOffsets[noteName];
      const midiNum = noteOffset + (octave * 12) + 12;
      if (midiNum < 12 || midiNum > 117) { console.warn(`Calculated MIDI number ${midiNum} out of expected range for ${note}`); }
      const frequency = 440 * Math.pow(2, (midiNum - 69) / 12);
      return frequency;
    }
  
    function updateFrequencyDisplay() {
       if (!noteInput || !frequencyInput) return;
       const noteValue = noteInput.value.trim();
       const frequency = noteToFrequency(noteValue);
       if (frequency !== null) { frequencyInput.value = `${frequency.toFixed(2)} Hz`; }
       else { frequencyInput.value = ''; }
    }
  
    function toggleBpmField() {
      if (!loopCheckbox || !bpmGroup || !bpmInput) return;
      if (loopCheckbox.checked) { bpmGroup.classList.remove('hidden'); bpmInput.required = true; }
      else { bpmGroup.classList.add('hidden'); bpmInput.required = false; bpmInput.value = ''; }
    }
  
    // Initialize
    generateNoteOptions();
    toggleBpmField(); // Set initial state based on checkbox default
  
    // Event Listeners
    noteInput.addEventListener('input', updateFrequencyDisplay);
    loopCheckbox.addEventListener('change', toggleBpmField);
    cancelBtn.addEventListener('click', () => {
        form.reset(); // Resets form fields
        updateFrequencyDisplay(); // Clear calculated frequency
        toggleBpmField(); // Ensure BPM field visibility matches reset checkbox
        modal.classList.add('hidden'); // Hide the modal
    });
    form.addEventListener('submit', (event) => {
        // Handle form submission logic here (likely in ob1-generator.js now?)
        // You might prevent default if handling via JS only: event.preventDefault();
        console.log("Metadata Form submitted");
        // Access values via form.elements or getElementById if needed
        // const title = form.elements.title.value;
    });
  });