// utils.js - Make utilities available globally

/**
 * Formats bytes into a human-readable string (KB, MB, etc.).
 * @param {number} bytes - The number of bytes.
 * @param {number} [dec=2] - The number of decimal places.
 * @returns {string} The formatted string.
 */
function formatBytes(bytes, dec = 2) {
  return bytes <= 0 ? '0 Bytes' : (bytes / Math.pow(1024, Math.floor(Math.log(bytes) / Math.log(1024)))).toFixed(dec) +
  ' ' + ['Bytes', 'KB', 'MB', 'GB', 'TB'][Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 4)];
}

/**
 * Formats a file size in bytes to a human-readable string
 * @param {number} bytes - The size in bytes
 * @returns {string} The formatted size string
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Extracts the filename without the extension.
 * @param {string} fullFilename - The full filename (e.g., "audio.wav").
 * @returns {string} The base name (e.g., "audio").
 */
function getBaseFilename(fullFilename) {
  const parts = fullFilename.split('.');
  if (parts.length > 1) {
    parts.pop(); // Remove the last part (extension)
    return parts.join('.'); // Join the remaining parts
  }
  return fullFilename; // Return original if no extension found
}

/**
 * Calculates the size of a base64 string as it would be in a text file
 * @param {string} base64String - The base64 string
 * @returns {number} The size in bytes
 */
function calculateBase64Size(base64String) {
  // In a text file, each character is 1 byte
  // So the text file size is simply the length of the string in bytes
  return new Blob([base64String], {type: 'text/plain'}).size;
}

// Attach to window to make globally available
window.formatBytes = formatBytes;
window.formatFileSize = formatFileSize;
window.getBaseFilename = getBaseFilename;
window.calculateBase64Size = calculateBase64Size;