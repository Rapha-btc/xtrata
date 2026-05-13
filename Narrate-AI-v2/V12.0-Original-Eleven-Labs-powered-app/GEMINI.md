# Audiobook Studio // Gen-3

## Project Overview

**Audiobook Studio // Gen-3** is a robust, web-based application designed to assist in the creation of professional-grade audiobooks using AI-generated voices (specifically ElevenLabs). It features a sophisticated "Studio" interface for parsing manuscripts, assigning dual voices, generating audio segments with caching, and merging them into chapter and full-book files.

### Key Features
*   **Smart Manuscript Parsing:**
    *   Automatically detects chapters in multiple languages (English, German, Spanish, French, etc.).
    *   Intelligent text splitting (sentence-aware) to fit API limits.
    *   **Dual Voice Mode:** Assigns different voices to characters using configurable delimiters (default `* * *`).
    *   **Dramatic Pauses:** Auto-detects character names at the start of segments to insert dramatic timing.
*   **Voice Management:**
    *   Seamless integration with **ElevenLabs API** (Premium voices).
    *   Fallback support for browser-native synthesis (`window.speechSynthesis`).
    *   Visual "Voice Dropdown" with standard vs. premium categorization.
*   **Project Management:**
    *   **Save/Load:** Persist projects as JSON files on the server.
    *   **Ghost Recovery:** Automatically discovers and recovers projects from "orphaned" audio chunks on the server.
    *   **Context Menu:** Right-click projects to Open, Rename, or Safely Delete.
*   **Audio Engine & Playback:**
    *   **Hybrid Engine:** Plays generated MP3s (server) or synthesis (browser).
    *   **Visualizer:** Real-time canvas-based frequency bar visualizer.
    *   **Karaoke Timeline:** Highlights the active text segment during playback.
    *   **Full Book Merge:** Concatenates all chapters into a single `_full_book.mp3`.
*   **Safety & Optimization:**
    *   **Protective Queuing:** Server-side `AsyncQueue` throttles API requests (Limit 2) and FFmpeg merges (Limit 1).
    *   **Smart Caching:** Checks server for existing chunks before generating (`/api/check-cache`) to save costs.
    *   **Budget Safety:** User-defined session budget warnings.
    *   **Confirmation Modals:** Estimates costs and character counts before bulk generation.

## Architecture

The project follows a client-server architecture with a Node.js backend and a vanilla JavaScript SPA (Single Page Application) frontend.

### Backend (`src/backend/server.js`)
*   **Server:** Native Node.js `http` server (No Express dependency).
*   **Concurrency Control:** Custom `AsyncQueue` class to manage resource usage.
*   **API Endpoints:**
    *   `GET /`: Serves the frontend application.
    *   `GET /output/...`: Serves generated audio files (chunks, chapters, books).
    *   `GET /api/projects`: Lists saved projects (and recovered "ghost" projects).
    *   `POST /api/projects`: Saves a project state.
    *   `GET/PATCH/DELETE /api/projects/:id`: CRUD operations for specific projects.
    *   `POST /api/generate`: Proxies text-to-speech requests to ElevenLabs (Queued).
    *   `POST /api/check-cache`: Batch checks file existence for a list of segments.
    *   `POST /api/merge-chapter`: FFmpeg concatenation of chunks into a chapter file.
    *   `POST /api/merge-book`: FFmpeg concatenation of all chapters into a full book.
*   **File System:**
    *   `output/projects/`: JSON state files.
    *   `output/chunks/`: Individual audio segments (cached by content hash).
    *   `output/chapters/`: Merged chapter MP3s.
    *   `output/titles/`: Special chapter files for titles.
    *   `output/book/`: Final merged audiobook files.

### Frontend (`src/frontend/`)
*   **UI (`index.html`, `css/style.css`):**
    *   Dark mode "Studio" aesthetic.
    *   Responsive CSS Grid layout.
    *   Interactive Timeline with collapse/expand chapters.
    *   Safety Modals for cost estimation.
*   **Logic (`js/script.js`):**
    *   **State Management:** Global `STATE` object tracks chapters, voices, and playback status.
    *   **TextParser:** Regex-based engine for multi-language chapter detection and dual-voice splitting.
    *   **AudioEngine:** Handles `AudioContext`, visualizer drawing, and playback orchestration.
    *   **APIService:** Static class for all fetch communications with the backend.

## Usage

### Prerequisites
*   **Node.js**: Required to run the server.
*   **FFmpeg**: Must be installed and accessible in the system PATH.
*   **ElevenLabs API Key**: Required for high-quality audio generation.

### Running the Application
1.  **Start the Server:**
    ```bash
    node src/backend/server.js
    ```
    The server will start on `http://localhost:3000`.

2.  **Open the Interface:**
    Navigate to `http://localhost:3000`.

3.  **Workflow:**
    *   **Connect:** Enter API Key in the "Connections" tab.
    *   **Draft:** Paste text. Use `# Chapter` or standard headers.
    *   **Config:** Select Voices (Single or Dual). Set Delimiters (e.g., `* * *`).
    *   **Analyze:** Click "1. Analyze & Parse" to break text into chunks.
    *   **Generate:** Click "2. Generate Audio". Review cost estimate. Confirm.
    *   **Export:** Upon completion, download the full book file.

## File Structure

*   `src/backend/server.js`: Main server entry point.
*   `src/frontend/`:
    *   `index.html`: Main UI.
    *   `css/style.css`: Styles.
    *   `js/script.js`: Core application logic.
*   `output/`: Generated content (Auto-created).
    *   `projects/`: Saved states.
    *   `chunks/`: Audio segments.
    *   `chapters/`: Chapter files.
    *   `book/`: Full book files.
    *   `titles/`: Title files.