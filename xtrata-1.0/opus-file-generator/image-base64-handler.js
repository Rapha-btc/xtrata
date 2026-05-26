/**
 * Handles the conversion of image files to base64 strings
 */

/**
 * Converts an image file to a base64 string
 * @param {File} imageFile - The image file to convert
 * @returns {Promise<string>} A promise that resolves with the base64 string
 */
export function imageToBase64(imageFile) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (event) => {
        const base64String = event.target.result;
        resolve(base64String);
      };
      
      reader.onerror = (error) => {
        reject(new Error('Error converting image to base64: ' + error));
      };
      
      reader.readAsDataURL(imageFile);
    });
  }
  
  /**
   * Creates a downloadable text file from a base64 string
   * @param {string} base64String - The base64 string
   * @param {string} originalFileName - Original file name to derive the text file name
   * @returns {string} The URL for downloading the text file
   */
  export function createDownloadableTextFile(base64String, originalFileName) {
    // Create a text file with the base64 content
    const blob = new Blob([base64String], { type: 'text/plain' });
    
    // Generate filename by replacing the original extension with .txt
    const fileName = originalFileName.replace(/\.[^/.]+$/, '') + '_base64.txt';
    
    return {
      url: URL.createObjectURL(blob),
      fileName: fileName
    };
  }