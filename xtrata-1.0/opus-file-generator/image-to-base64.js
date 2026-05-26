/**
 * Handles the conversion of image files to base64 strings
 */

// Assuming utility functions like formatBytes are globally available (window.formatBytes)
// Assuming html-generator functions like updateaudionalVisualBase64 are globally available (window.updateaudionalVisualBase64)

/**
 * Converts an image file to a base64 string (Data URL).
 * @param {File} imageFile - The image file to convert
 * @returns {Promise<string>} A promise that resolves with the base64 Data URL string.
 */
export function imageToBase64(imageFile) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const base64String = event.target.result; // This IS the Data URL (e.g., "data:image/png;base64,...")
      resolve(base64String);
    };

    reader.onerror = (error) => {
      reject(new Error('Error converting image to base64: ' + error));
    };

    reader.readAsDataURL(imageFile);
  });
}

/**
* Creates parameters for a downloadable text file from a base64 string.
* @param {string} base64Data - The PURE base64 data string (no prefix).
* @param {string} originalFileName - Original file name to derive the text file name.
* @returns {{url: string, fileName: string}} Object with blob URL and filename.
*/
export function createDownloadableTextFile(base64Data, originalFileName) {
  // Create a text file with the PURE base64 content
  const blob = new Blob([base64Data], { type: 'text/plain;charset=utf-8' });

  // Generate filename by replacing the original extension with .base64.txt
  const baseName = originalFileName.replace(/\.[^/.]+$/, ''); // Remove extension
  const fileName = `${baseName}.base64.txt`;

  return {
    url: URL.createObjectURL(blob),
    fileName: fileName
  };
}

/**
* Initialize the image converter section and its event listeners.
*/
export function initializeImageConverter() {
  // Get elements using their specific IDs
  const fileInput = document.getElementById('image-file-input');
  const convertButton = document.getElementById('convert-image-button');
  const imagePreview = document.getElementById('image-preview');
  const base64OutputTextarea = document.getElementById('image-base64-output'); // <-- USE NEW ID
  const downloadButton = document.getElementById('download-image-base64-button'); // <-- USE NEW ID
  const copyButton = document.getElementById('copy-image-base64-button'); // <-- USE NEW ID
  const fileSizeInfo = document.getElementById('file-size-info');

  // Check if all essential elements were found
  if (!fileInput || !convertButton || !imagePreview || !base64OutputTextarea || !downloadButton || !copyButton || !fileSizeInfo) {
      console.error("One or more elements for the Image Converter section were not found. Check IDs in HTML and JS.");
      return; // Stop initialization if elements are missing
  }

  let selectedFile = null;
  let currentPureBase64Data = null; // Store the pure base64 data

  // --- Event Listeners ---

  // File Input Change
  fileInput.addEventListener('change', (event) => {
      selectedFile = event.target.files[0];
      currentPureBase64Data = null; // Reset previous data

      if (selectedFile) {
          // Display file info
          fileSizeInfo.textContent = `File: ${selectedFile.name} (${window.formatBytes(selectedFile.size)})`;

          // Preview image
          const reader = new FileReader();
          reader.onload = (e) => {
              imagePreview.src = e.target.result;
              imagePreview.style.display = 'block';
          };
          reader.readAsDataURL(selectedFile);

          // Reset UI states
          convertButton.disabled = false;
          downloadButton.disabled = true; // Disable until conversion
          copyButton.disabled = true;     // Disable until conversion
          base64OutputTextarea.value = '';
          base64OutputTextarea.style.display = 'none'; // Hide output initially
           // Reset corresponding HTML generator state if needed
           if (typeof window.updateaudionalVisualBase64 === 'function') {
               window.updateaudionalVisualBase64(null); // Signal no image data ready
           }

      } else {
          // No file selected or selection cancelled
          fileSizeInfo.textContent = '';
          imagePreview.style.display = 'none';
          imagePreview.src = '';
          convertButton.disabled = true;
          downloadButton.disabled = true;
          copyButton.disabled = true;
          base64OutputTextarea.value = '';
          base64OutputTextarea.style.display = 'none';
          if (typeof window.updateaudionalVisualBase64 === 'function') {
               window.updateaudionalVisualBase64(null);
           }
      }
  });

  // Convert Button Click
  convertButton.addEventListener('click', async () => {
      if (selectedFile) {
          convertButton.disabled = true; // Disable during conversion
          convertButton.textContent = 'Converting...';
          currentPureBase64Data = null; // Reset

          try {
              const base64DataUrl = await imageToBase64(selectedFile);
              const commaIndex = base64DataUrl.indexOf(',');

              if (commaIndex !== -1 && commaIndex < base64DataUrl.length - 1) {
                 currentPureBase64Data = base64DataUrl.substring(commaIndex + 1); // Store pure base64
              } else {
                 throw new Error("Invalid Data URL format received from conversion.");
              }


              // Display base64 output (pure data)
              base64OutputTextarea.value = currentPureBase64Data;
              base64OutputTextarea.style.display = 'block'; // Show the textarea
              base64OutputTextarea.parentNode.parentNode.open = true; // Open the <details> tag

              // Enable download and copy buttons
              downloadButton.disabled = false;
              copyButton.disabled = false;

              // Update HTML generator with the pure base64 image data
              if (typeof window.updateaudionalVisualBase64 === 'function') {
                  window.updateaudionalVisualBase64(currentPureBase64Data);
                  console.log('Image base64 data sent to HTML generator after conversion');
              } else {
                  console.warn('updateaudionalVisualBase64 function not found on window object');
              }

          } catch (error) {
              console.error('Error converting image:', error);
              alert(`Failed to convert image to base64. ${error.message}`);
              // Reset UI elements on error
              downloadButton.disabled = true;
              copyButton.disabled = true;
              base64OutputTextarea.value = '';
              base64OutputTextarea.style.display = 'none';
              if (typeof window.updateaudionalVisualBase64 === 'function') {
                   window.updateaudionalVisualBase64(null); // Signal error/no data
               }

          } finally {
               convertButton.disabled = false; // Re-enable convert button
               convertButton.textContent = 'Convert to Base64';
          }
      }
  });

  // Download Button Click
  downloadButton.addEventListener('click', () => {
      if (currentPureBase64Data && selectedFile) {
          try {
              const downloadInfo = createDownloadableTextFile(currentPureBase64Data, selectedFile.name);

              const link = document.createElement('a');
              link.href = downloadInfo.url;
              link.download = downloadInfo.fileName;
              document.body.appendChild(link); // Append for Firefox
              link.click();
              document.body.removeChild(link); // Clean up
              URL.revokeObjectURL(downloadInfo.url); // Release blob URL memory
           } catch (dlError) {
                console.error("Error creating/downloading image base64 txt file:", dlError);
                alert("Failed to prepare image base64 text file for download.");
           }
      } else {
           console.warn("Download clicked but no base64 data or filename available.");
           alert("Please convert an image first to download the Base64 text.");
           downloadButton.disabled = true; // Disable if state is somehow wrong
      }
  });

   // Copy Button Click
   copyButton.addEventListener('click', () => {
       if (!currentPureBase64Data) {
           alert("No Base64 data to copy. Please convert an image first.");
           copyButton.disabled = true;
           return;
       }
       if (!navigator.clipboard) {
           alert('Clipboard API not available. Try copying manually from the text area.');
           return;
       }

       navigator.clipboard.writeText(currentPureBase64Data)
         .then(() => {
           const origText = copyButton.textContent;
           copyButton.textContent = 'Copied!';
           copyButton.disabled = true;
           setTimeout(() => {
               copyButton.textContent = origText;
               copyButton.disabled = false; // Re-enable
           }, 2000);
         })
         .catch(err => {
           console.error('Failed to copy image base64:', err);
           alert('Failed to copy to clipboard. Check browser permissions (requires HTTPS or localhost).');
         });
   });

  // Initial state
  convertButton.disabled = true;
  downloadButton.disabled = true;
  copyButton.disabled = true;
  imagePreview.style.display = 'none';
  base64OutputTextarea.style.display = 'none';

  console.log("Image to Base64 converter initialized.");
}

// Note: This script uses module export. The HTML loads it with type="module".
// The initializeImageConverter function needs to be called, usually via DOMContentLoaded listener in the main HTML or main.js.
// Example HTML load:
// <script type="module">
//   import { initializeImageConverter } from './image-to-base64.js';
//   document.addEventListener('DOMContentLoaded', initializeImageConverter);
// </script>