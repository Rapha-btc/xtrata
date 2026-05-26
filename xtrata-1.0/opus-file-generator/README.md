Use npx serve -l 3000 in the root directory to run the code

Audional Art Tools: WAV to WebM Audio (.weba) & Image to Base64 Converter
Overview

This web-based application provides a suite of tools for artists and creators working with Audionals (audio-based Bitcoin Ordinals). It allows users to:

*   Convert WAV audio files to web-friendly formats like WebM Audio (using the Opus codec), MP3, or raw Opus, with options to control quality and file size.
*   Generate Base64 representations of these converted audio files.
*   Convert image files (e.g., PNG, JPG, GIF, WebP) into Base64 strings.
*   Combine the Base64 audio and image data with user-provided metadata to generate a clickable HTML file ready for inscription on the Bitcoin blockchain.

The entire process runs in the user's browser, ensuring privacy and speed, thanks to WebAssembly-powered FFmpeg.

Features

*   **Audio Conversion (WAV input):**
    *   Output formats: WebM Audio (.weba with Opus codec - recommended), MP3 (LAME encoder), Opus.
    *   Adjustable Opus settings: Bitrate, VBR mode (On, Off, Constrained), Compression Level, Application type (Audio, VoIP, Low Delay).
    *   Adjustable MP3 quality (VBR -q:a setting).
    *   Real-time estimated output file size.
    *   Original audio playback.
    *   Converted audio playback.
    *   Download link for the converted audio file.
    *   Progress bar for conversion.
*   **Audio Base64 Generation:**
    *   Convert the processed audio into a pure Base64 string.
    *   Display Base64 string (collapsible section).
    *   Copy Base64 string to clipboard.
    *   Download Base64 string as a .txt file.
*   **Image to Base64 Conversion:**
    *   Supports common image formats.
    *   Image preview.
    *   Displays original file size.
    *   Convert image to a pure Base64 string.
    *   Display Base64 string (collapsible section).
    *   Copy Base64 string to clipboard.
    *   Download Base64 string as a .txt file.
*   **Audional HTML Generation:**
    *   Modal for inputting metadata: Title, Instrument, Note (with frequency auto-calculation), Is Loop?, BPM (if loop).
    *   Combines audio Base64, image Base64, and metadata into a single HTML file.
    *   Download the generated .html file.
*   **Informational Popups:**
    *   Detailed explanations of audio formats (containers, codecs, lossless/lossy, bitrate, WAV, WebM Audio, Opus, MP3).
    *   Opus bitrate recommendations.
    *   Step-by-step instructions for generating Audional art using the tool.
*   **Client-Side Processing:** All file processing and conversions happen directly in the browser. No files are uploaded to a server.

Running the Application

Prerequisites
*   Node.js and npm (or npx) installed on your system (primarily to use npx serve).

Steps to Run
1.  Clone or download this repository to your local machine.
2.  Open your terminal or command prompt.
3.  Navigate to the root directory of the project (where index.html and serve.json are located).
4.  Run the following command:
    ```bash
    npx serve -l 3000
    ```
5.  This will start a local development server, typically at http://localhost:3000.
6.  Open your web browser and go to http://localhost:3000.

Important: COOP/COEP Headers
The application uses FFmpeg.wasm, which relies on SharedArrayBuffer. For SharedArrayBuffer to work, specific HTTP headers must be set:
*   `Cross-Origin-Opener-Policy: same-origin`
*   `Cross-Origin-Embedder-Policy: require-corp`

The provided `serve.json` file configures `npx serve` to send these headers for .html files. If you deploy this tool to a different static hosting provider (like Vercel, Netlify, GitHub Pages), you will need to ensure these headers are correctly configured for your deployment. The `cors-config.json` file provides an example of how this might be configured for a platform like Vercel.

How to Use

The application is divided into sections: Audio Conversion, Image Conversion, and Audional Generation.

1. Audio Conversion (WAV to WebM Audio/Opus/MP3)
*   **Select WAV File:** Click "Select WAV File" and choose your .wav audio.
*   The tool will display the file name and duration.
*   You can click "Play Original" to listen to it.
*   **Choose Output Quality:**
    *   By default, **WebM Audio (.weba)** is selected, which is highly recommended for Audionals due to its excellent quality-to-size ratio.
    *   Adjust the Opus Bitrate slider (e.g., 64-96 kbps is often a good balance).
    *   Optionally, adjust advanced Opus settings: VBR Mode, Compression Level, Application.
    *   The estimated output file size will update as you change settings.
    *   (Alternatively, you can select MP3 and adjust its quality slider, though WebM Audio/Opus is preferred for Audionals).
*   **Convert:** Click the **"3. Convert to WebM Audio (.weba)"** button.
*   A progress bar will show the conversion status.
*   **Results:**
    *   A download link for the converted file will appear (e.g., "Download myaudio.weba").
    *   An audio player for the converted file will appear.
*   **Audio Base64 Conversion:**
    *   The converted audio is automatically processed into a Base64 string.
    *   You can expand "Show Audio Base64 Output" to view it.
    *   Use the "Copy Audio Base64" or "Download Audio Base64 as TXT" buttons as needed.

2. Image to Base64 Conversion
*   **Select Image File:** Click "Select Image File" and choose your image (e.g., PNG, JPG, GIF, WebP).
*   A preview of the image and its file size will be displayed.
*   **Convert to Base64:** Click the "Convert to Base64" button.
*   **Results:**
    *   The Base64 string of the image will appear in the "Image Base64 Output" textarea.
    *   Use the "Copy Image Base64" or "Download Image Base64 as TXT" buttons.

3. Generating Audional HTML
*   Once you have successfully generated both the Audio Base64 (from a WebM Audio/Opus conversion) and the Image Base64:
*   **Enable Button:** The "Generate Clickable HTML Player" button at the bottom of the page will become enabled.
*   **Open Metadata Modal:** Click the "Generate Clickable HTML Player" button. A modal dialog will appear.
*   **Enter Metadata:**
    *   Title/Name: A title for your Audional.
    *   Instrument: The instrument or sound source.
    *   Note: The musical note (e.g., C#4). The frequency will be auto-calculated.
    *   Is this a loop?: Check this box if your audio is a seamless loop.
    *   BPM/Tempo: If it's a loop, enter the Beats Per Minute (BPM).
*   **Generate HTML:** Click "Generate HTML" in the modal.
*   **Download:** Your browser will download an .html file.

Development

This project is built using vanilla HTML, CSS, and JavaScript, with FFmpeg.wasm for client-side media processing.

Project Structure
*   `index.html`: The main HTML file for the application.
*   `*.js`: Various JavaScript files handling specific functionalities.
*   `serve.json`: Configuration for npx serve to apply necessary COOP/COEP headers.
*   `cors-config.json`: Example header configuration (e.g., for Vercel-like deployments).
*   `README.md`: This file.
*   `/css3/`: Main stylesheets for the application.

Core Technologies & Libraries
*   HTML5, CSS3, JavaScript (ES6+): Standard web technologies.
*   FFmpeg.wasm (@ffmpeg/ffmpeg, @ffmpeg/core): Enables client-side audio conversion.
*   Web APIs: File API, Blob API, URL API, Web Audio API, DOM Manipulation, CustomEvent, ES Modules.

Developer Resources & References
*   FFmpeg.wasm: https://ffmpegwasm.netlify.app/
*   Opus Codec: https://opus-codec.org/
*   WebM Project: https://www.webmproject.org/
*   WebM Audio (.weba) in WebM: https://www.webmproject.org/docs/container/
*   Ordinals Handbook: https://docs.ordinals.com/

Developer Info
*   Author: [Audionals](https://github.com/Audionals)
*   License: MIT License
*   Version: 1.1.0
