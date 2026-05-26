// config-state.js

// State variables - these will be accessed and modified globally by other modules
let ffmpeg = null;
let selectedFile = null;
let selectedFiles = []; // New: To store all selected files
let successfulBatchFiles = []; // NEW: To store { filename: 'name.ext', blob: Blob }
let fileDuration = null;
let convertedAudioBlob = null;
let base64String = null;
let originalAudioUrl = null;
let originalAudioElement = null; // Reference to the <audio> element for the original file

// Initial quality/bitrate values (could be considered config)
const initialMp3Quality = 4; // VBR quality setting (0-9, FFmpeg -q:a maps 9=worst to 0=best)
const initialOpusBitrate = 96; // kbps (Used for Opus and WebM output)

// New Opus-specific settings
const initialOpusVbrMode = 'on'; // 'on', 'off', 'constrained'
const initialOpusCompressionLevel = 10; // 0-10
const initialOpusApplication = 'audio'; // 'audio', 'voip', 'lowdelay'

// --- NEW: Audio Profiles ---
const audioProfiles = {
    'manual': {
        displayName: "Custom / Manual Settings",
        description: "Manually configure all Opus settings below. Your current manual settings are active.",
        // No specific opus settings, uses current UI values or initial defaults
    },
    'voice_clear': {
        displayName: "Voice (Clear Speech)",
        description: "Optimized for clear spoken word, low bitrate. (e.g., 32kbps, VoIP, High Compression)",
        opus: {
            bitrate: 32,
            vbr: 'on',
            compressionLevel: 10,
            application: 'voip'
        }
    },
    'voice_rich': {
        displayName: "Voice (Rich Podcast)",
        description: "Good quality for voice recordings, retaining more character. (e.g., 48kbps, Audio, High Comp.)",
        opus: {
            bitrate: 48,
            vbr: 'on',
            compressionLevel: 9,
            application: 'audio' // 'voip' can sometimes be too aggressive for rich voice
        }
    },
    'music_general': {
        displayName: "Music (General Purpose)",
        description: "Good balance for general music. (e.g., 64kbps, Audio, Balanced Compression)",
        opus: {
            bitrate: 64,
            vbr: 'on',
            compressionLevel: 8,
            application: 'audio'
        }
    },
    'music_high_quality': {
        displayName: "Music (High Quality)",
        description: "Higher quality for music, less aggressive compression. (e.g., 96kbps, Audio, Good Compression)",
        opus: {
            bitrate: 96,
            vbr: 'on',
            compressionLevel: 7, // Lower compression for better quality preservation
            application: 'audio'
        }
    },
    'percussion_loop': {
        displayName: "Percussion / Rhythmic Loop",
        description: "Optimized for rhythmic content, preserving transients. (e.g., 48-64kbps, Low Latency or Audio)",
        opus: {
            bitrate: 56, // Opus is efficient with transients
            vbr: 'on',
            compressionLevel: 9,
            application: 'lowdelay' // 'lowdelay' can sometimes be better for sharp transients
        }
    }
};
const initialAudioProfile = 'manual'; // Default to manual settings
// --- END NEW: Audio Profiles ---

// Removed initialCafBitrate
// const initialCafBitrate = 128;