/**
 * @file informationButtons.js
 * @description Exports structured text explaining audio formats and Audional instructions.
 */

// Define the object containing the informational text using standard JavaScript syntax.
const audioFormatInfo = {

    // --- Core Concepts ---
    conceptsTitle: `<h2>Core Concepts: Containers, Codecs, Lossless vs. Lossy & Bitrate</h2>`,

    losslessVsLossy: `
        <p><strong>Containers (e.g., WebM Audio, MP4, WAV):</strong> Think of these like boxes or file wrappers. They hold the actual audio (and sometimes video) data inside but don't necessarily define its quality. The same container (like WebM) can hold audio encoded in different ways.</p>
        <p><strong>Codecs (e.g., Opus, AAC, MP3, PCM):</strong> These are the specific methods (coder-decoders) used to compress and decompress the audio data *inside* the container. The codec is the primary factor determining quality and file size.</p>
        <p><strong>Lossless Codec/Format (e.g., PCM in WAV, FLAC):</strong> Stores audio data without discarding information. Quality is identical to the original source, resulting in the largest file sizes. Ideal for archiving and professional editing.</p>
        <p><strong>Lossy Codec/Format (e.g., Opus, MP3, AAC):</strong> Achieves smaller sizes by permanently discarding audio data deemed less audible to humans (using complex algorithms called "psychoacoustic models"). Some quality loss is inherent but can be virtually undetectable at high settings. Great for streaming and portable devices. <em>Re-encoding lossy files generally causes further quality loss.</em></p>
    `,

    bitrate: `
        <p><strong>Bitrate (kbps - kilobits per second):</strong> Represents the amount of data the *codec* uses per second of audio.</p>
        <ul>
            <li><strong>Higher Bitrate:</strong> Generally = More data allowed, closer to original quality, larger file size.</li>
            <li><strong>Lower Bitrate:</strong> Generally = Less data allowed, more compression artifacts (potential quality loss), smaller file size.</li>
        </ul>
        <p><em>Codec efficiency matters!</em> A modern, efficient codec like Opus usually sounds much better than an older one like MP3 at the same bitrate.</p>
        <p><strong>VBR (Variable Bitrate):</strong> Used by Opus and our MP3 VBR setting (-q:a). Allocates more data to complex audio sections and less to simple ones, generally offering better quality for a given average size than CBR (Constant Bitrate).</p>
        <p><strong>File Size Estimation (Approx.):</strong> Size (KB) ≈ (Bitrate (kbps) * Duration (s)) / 8. (Container overhead adds a tiny bit more).</p>
    `,

    // --- Audio Format Details ---
    formatsTitle: `<h2>Format Details & The Conversion Process</h2>`,

    wav: `
        <h3>Input: Your Audio File</h3>
        <ul>
            <li><strong>Accepted Formats:</strong> The tool accepts a variety of common audio formats, including <strong>WAV, MP3, FLAC, OGG, AAC,</strong> and others supported by your browser and FFmpeg for decoding.</li>
            <li><strong>Quality Considerations:</strong> The quality of the final Opus/WebM Audio file heavily depends on the quality of your source audio and the encoding settings you choose. Starting with a high-quality, uncompressed (like WAV or FLAC) or high-bitrate compressed source will generally yield the best results.</li>
            <li><strong>The Process:</strong> Your selected audio file is first decoded by FFmpeg. This internal, high-fidelity representation is then used as the source for the Opus encoding process.</li>
            <li><strong>Use Case Here:</strong> The audio file you wish to convert to the highly efficient WebM Audio (.weba) format.</li>
        </ul>
    `,

    weba: `
        <h3>Output: WebM Audio (.weba with Opus)</h3>
        <ul>
            <li><strong>Type:</strong> Modern, open Container format (like a box).</li>
            <li><strong>Audio Codec Used Here:</strong> Opus (highly efficient, lossy compression).</li>
            <li><strong>The Process:</strong>
                <ol>
                    <li>Your selected audio file (e.g., WAV, MP3, FLAC) is read and decoded by FFmpeg.</li>
                    <li>The intelligent <strong>Opus encoder</strong> analyzes this decoded audio. Based on the bitrate and other settings you select, it compresses the audio by cleverly removing sounds humans are unlikely to notice.</li>
                    <li>This Opus encoding results in high-quality audio data that takes up much less space than many original formats, especially uncompressed ones like WAV.</li>
                    <li>The compressed Opus audio data is then packaged (muxed) into the <strong>WebM Audio (.weba) container</strong>. This packaging step itself is <strong>lossless</strong> – it just organizes the Opus data into the WebM file structure.</li>
                </ol>
            </li>
            <li><strong>Quality:</strong> Determined by the Opus encoder and the chosen bitrate. Can range from acceptable for speech at low bitrates to virtually indistinguishable from a high-quality original ("transparent") at higher bitrates (see recommendations below). State-of-the-art quality for its file size.</li>
            <li><strong>File Size:</strong> Excellent compression thanks to Opus. Size directly controlled by the bitrate slider and other Opus settings.</li>
            <li><strong>Compatibility:</strong> Excellent. Natively supported in most modern web browsers (Chrome, Firefox, Edge, Opera, Safari 14.1+) and widely on Android. It's an open and royalty-free standard ideal for the web.</li>
            <li><strong>Pros:</strong> Fantastic balance of high quality, small file size, and great compatibility. Open standard.</li>
            <li><strong>Cons:</strong> Not supported by very old browsers or some legacy hardware players (less of an issue now).</li>
        </ul>
    `,

    opus: `
        <h3>The Opus Codec (The Engine Inside WebM Audio)</h3>
        <ul>
            <li><strong>Type:</strong> Lossy audio compression Codec.</li>
            <li><strong>Role Here:</strong> The "engine" that does the smart compression of your audio data (from whatever source format you provided) before it's put into the WebM Audio container.</li>
            <li><strong>Efficiency:</strong> State-of-the-art. It consistently provides better audio quality than MP3 or AAC at the same bitrate, especially at lower bitrates.</li>
            <li><strong>Technology:</strong> Combines technologies (SILK for speech, CELT for music) to adapt efficiently to any type of audio content. Supports variable bitrate (VBR) inherently and offers fine-grained control over compression.</li>
            <li><strong>Key Benefit:</strong> Enables the creation of high-quality, small WebM audio files suitable for web use and inscriptions.</li>
        </ul>
    `,

    mp3: `
        <h3>Comparison: MP3 (MPEG-1 Audio Layer III)</h3>
        <ul>
            <li><strong>Type:</strong> Older Lossy Codec/Format.</li>
            <li><strong>Quality:</strong> Acceptable at mid-to-high bitrates (e.g., 192-320kbps LAME VBR), but generally outperformed by Opus at equivalent or lower bitrates.</li>
            <li><strong>File Size:</strong> Good reduction, but less efficient than Opus.</li>
            <li><strong>Compatibility:</strong> Still the most universally compatible format, especially on older devices.</li>
            <li><strong>Use Case Here:</strong> Provided as a familiar alternative format if WebM Audio/Opus is not suitable for a specific legacy target. However, WebM Audio (Opus) generally offers better quality for the size for modern applications.</li>
        </ul>
    `,

    // --- Opus Bitrate Recommendations ---
    opusRecommendationsTitle: `<h2>Opus Bitrate Recommendations (for WebM Audio Output Quality vs. Size)</h2>`,

    opusDetails: `
        <p>These recommendations apply to the Opus audio <em>stream</em> encoded within your WebM Audio file. The chosen bitrate (along with VBR mode, compression level, and application type) directly impacts the quality and size of the final WebM Audio:</p>
        <ul>
            <li><strong>~128 kbps+:</strong> Often achieves <strong>perceptual transparency</strong> (indistinguishable from the original high-quality source for most listeners in typical conditions). Excellent quality for critical listening. Higher rates offer diminishing returns for file size increase.</li>
            <li><strong>~96 kbps:</strong> A common "sweet spot" for high-quality stereo music streaming. Excellent quality, significant size savings compared to uncompressed audio or high-bitrate MP3.</li>
            <li><strong>~64 kbps:</strong> Surprisingly good stereo music quality (often better than MP3 @ 128kbps). A great target for general web/mobile audio where bandwidth/storage is a concern. Very good for high-quality stereo speech.</li>
            <li><strong>~48 kbps:</strong> Excellent for mono speech (podcasts). Usable for less critical stereo music or background audio.</li>
            <li><strong>~32 kbps:</strong> Primarily for speech intelligibility (like VoIP calls). Music will sound noticeably compressed.</li>
            <li><strong>Below 32 kbps:</strong> Highly compressed speech for very low bandwidth situations.</li>
        </ul>
        <p><strong>Note on other Opus settings:</strong>
           <ul>
             <li><strong>VBR (Variable Bitrate):</strong> Generally recommended ('on' or 'constrained') as it optimizes bitrate allocation for better quality per bit. 'constrained' can be useful for more predictable file sizes than 'on'. 'off' (CBR) is rarely needed for Opus.</li>
             <li><strong>Compression Level (0-10):</strong> Higher levels (e.g., 9-10) mean more encoding effort for potentially better quality at a given bitrate, but also slower encoding. Lower levels are faster. The default of 10 is usually good for final encoding.</li>
             <li><strong>Application ('audio', 'voip', 'lowdelay'):</strong> Hints to the encoder. 'audio' is best for music and general content. 'voip' for speech. 'lowdelay' for applications needing minimal latency (might slightly trade off quality).</li>
           </ul>
        </p>
        <p><strong>Conclusion:</strong> For WebM Audio files aiming for near-original quality, try <strong>96-128 kbps</strong> with VBR 'on' and 'audio' application. For excellent general-purpose web/mobile music, <strong>64-96 kbps</strong> is a strong choice. For high-quality speech, <strong>32-64 kbps</strong> with 'voip' or 'audio' application often suffices.</p>
        <p><em>Always consider: The complexity of the source audio, the listening environment (headphones vs. speakers), listener sensitivity, and any bandwidth/storage limits. Listening tests are recommended!</em></p>
    `,

    // --- Audional Instructions Content ---
    audionalInstructions: `
         <h2 id="audional-info-title">Generating Audional Art</h2>
         <p>Welcome to the cutting edge where audio meets visual art on the Bitcoin blockchain!</p>
         <p><strong>Audionals</strong> are a unique type of Bitcoin Ordinal that embed audio data directly into the inscription, often paired with a visual element. They represent a historical moment in digital art and music technology.</p>
         <p><strong>Using this Tool for Generating Audional Artworks:</strong></p>
         <ol>
           <li><strong>Prepare Your Audio:</strong> Start with your audio file (e.g., <code>.wav</code>, <code>.mp3</code>, <code>.flac</code>, <code>.ogg</code>). For the best Audional quality, use a high-quality source file. The tool will convert it to the required format.</li>
           <li><strong>Convert to WebM Audio (Opus):</strong> Use the "Opus Encoding for Audional Inscriptions" section (the main audio converter on this page) to transform your audio file into a <strong>WebM Audio (.weba)</strong> file using the efficient <strong>Opus</strong> codec.
             <ul>
                 <li>Choose a bitrate and other Opus settings that balance quality and file size. Lower bitrates (~32-64kbps) are often sufficient for loops and keep inscription costs down, but experiment with the various settings to get the best size/cost outcome for your project!</li>
                 <li>The tool will generate the required <strong>Base64 string</strong> for the WebM Audio (.weba/Opus) audio in the "Audio Base64 Conversion" fieldset.</li>
             </ul>
           </li>
           <li><strong>Prepare Your Visual (Optional):</strong> Use the "Image to Base64 Converter" section to generate a Base64 string for your cover image (e.g., PNG, JPG, GIF, WEBP). Small dimensions and optimized images are recommended. 
           <li>You can also add the URL of an existing image inscription to create a recursive audional HTML file with embedded audio but an inscribed image, loaded recursively.</li>
           <li><strong>Generate the Audional HTML:</strong> Once you have the audio Base64 (and optionally the image Base64):
               <ul>
                 <li>Click the "Generate Clickable HTML Player" button (currently marked as 'coming soon', but this describes the intended flow).</li>
                 <li>Fill in the metadata (Title, Instrument, Note, etc.) in the popup modal. This information helps categorize and describe your Audional.</li>
                 <li>The tool will combine the audio, image (if provided), and metadata into a single HTML file ready for download.</li>
               </ul>
           </li>
           <li><strong>Inscribe Your Audional:</strong> This generated HTML file is what you will inscribe as a Bitcoin Ordinal using an inscription service (like OrdinalsBot, UniSat, Xverse, Ordinals Wallet, etc.). Choose "HTML" or "Text" (and paste the full HTML content) as the inscription type.</li>
         </ol>
         <p><strong>Why WebM Audio (.weba/Opus)?</strong> It offers excellent audio quality at very small file sizes compared to MP3 or uncompressed WAV, making it ideal for blockchain inscriptions where data size directly impacts cost and feasibility.</p>
         <p><em>You are participating in a groundbreaking fusion of music, art, and technology. Happy inscribing!</em></p>
    `
};

// The 'audioFormatInfo' object will be globally available in the browser scope
// if this file is loaded via a standard <script> tag.