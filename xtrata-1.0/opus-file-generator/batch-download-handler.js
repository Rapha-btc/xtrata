// batch-download-handler.js

const handleDownloadBatchZip = async () => {
    if (!successfulBatchFiles || successfulBatchFiles.length === 0) {
        updateStatus('No successful batch conversions available to download.', true);
        return;
    }

    if (typeof JSZip === 'undefined') {
        updateStatus('Error: JSZip library not loaded. Cannot create ZIP.', true);
        console.error("JSZip is not defined. Make sure the library is included.");
        return;
    }

    updateStatus('Preparing ZIP file for download...');
    if (downloadBatchZipBtn) downloadBatchZipBtn.disabled = true; // Disable while zipping

    try {
        const zip = new JSZip();
        const selectedOutputFormat = document.querySelector('input[name="format"]:checked')?.value || 'converted_files';

        // Add each successful file to the zip
        successfulBatchFiles.forEach(fileData => {
            // fileData is { filename: 'name.ext', blob: Blob }
            zip.file(fileData.filename, fileData.blob);
        });

        // Generate the ZIP file
        const zipBlob = await zip.generateAsync({
            type: 'blob',
            compression: "DEFLATE", // Optional: "STORE" for no compression
            compressionOptions: {   // Optional
                level: 6            // Compression level (1-9)
            }
        });

        // Create a download link for the ZIP
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `batch_converted_${selectedOutputFormat}_${new Date().toISOString().slice(0,10)}.zip`; // e.g., batch_converted_weba_2023-10-27.zip
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        updateStatus(`ZIP file download initiated for ${successfulBatchFiles.length} files.`);

    } catch (error) {
        updateStatus(`Error creating ZIP file: ${error.message}`, true);
        console.error('ZIP creation error:', error);
    } finally {
        if (downloadBatchZipBtn) downloadBatchZipBtn.disabled = !(successfulBatchFiles && successfulBatchFiles.length > 0); // Re-enable if still files
    }
};

// If you want to make this function globally available (not strictly necessary if only called by event listener)
// window.handleDownloadBatchZip = handleDownloadBatchZip;