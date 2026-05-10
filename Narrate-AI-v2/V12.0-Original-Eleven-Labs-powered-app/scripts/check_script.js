/**
 * AUDIOBOOK GENERATOR v3 (Restored Playback & Fixed Split & Interaction & Regeneration)
 */

// --- 1. STATE & STORAGE ---

const STATE = {
    chapters: [],
    voices: [],
    project: {
        id: 'proj_' + Date.now().toString(36),
        mode: 'single', // 'single' or 'dual'
        voiceIds: [null, null], // [Voice 1, Voice 2]
        voiceNames: ['', ''],
        token: '* * *'
    },
    isProcessing: false,
    isPlaying: false,
    activePlaybackId: null, // Tracks what is currently playing (e.g., 'chapter_0' or 'chunk_xyz')
    halt: false,
    sessionCost: 0,
    api: {
        elevenLabs: { 
            key: '',
            name: '',
            voices: [],
            connected: false
        }
    }
};

// UI Helpers
const LOG = {
    add: (msg, type = 'info') => {
        const panel = document.getElementById('console-panel');
        const div = document.createElement('div');
        div.className = `log-entry log-${type}`;
        div.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
        panel.prepend(div);
        if (type === 'error') console.error(msg);
    }
};

function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.settings-content').forEach(c => c.classList.remove('active'));
    
    const index = tabName === 'project' ? 0 : 1;
    document.querySelectorAll('.tab')[index].classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');
}

// --- TEXT PARSER (Dual Voice & Multi-Language Logic) ---

const LANG_CONFIG = [
  ['en', 'English', ['Chapter'], ['By', 'Written by', 'Narrated by']],
  ['de', 'German', ['Kapitel'], ['Von', 'Geschrieben von']],
  ['es', 'Spanish', ['Capítulo', 'Capitulo'], ['Por', 'Escrito por']],
  ['fr', 'French', ['Chapitre'], ['Par', 'Écrit par']],
  ['it', 'Italian', ['Capitolo'], ['Di', 'Scritto da']],
  ['pt', 'Portuguese', ['Capítulo', 'Capitulo'], ['Por', 'Escrito por']],
  ['nl', 'Dutch', ['Hoofdstuk'], ['Door', 'Geschreven door']],
  ['pl', 'Polish', ['Rozdział'], ['Przez', 'Napisał']],
  ['ru', 'Russian', ['Глава'], ['Автор']],
  ['tr', 'Turkish', ['Bölüm'], ['Yazan']],
  ['fi', 'Finnish', ['Luku'], ['Kirjoittanut']],
  ['hu', 'Hungarian', ['Fejezet'], ['Írta']],
  ['cs', 'Czech', ['Kapitola'], ['Napsal']],
  ['el', 'Greek', ['Κεφάλαιο'], ['Από']],
  ['id', 'Indonesian', ['Bab'], ['Oleh']],
  ['unk', 'Unknown', ['Part', 'Parte', 'Partie', 'Teil', 'Livre', 'Libro', 'Buch'], []]
];

const TextParser = {
    escapeRegex: (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),

    getChapterHeadingRegex: () => {
        const chapterKw = LANG_CONFIG
            .filter(l => l[0] !== 'unk')
            .flatMap(l => l[2])
            .sort((a, b) => b.length - a.length);
        // Keep only part-style generic headers. Exclude book-style labels (e.g. "Buch 1.") that are common title-page metadata.
        const genericKw = (LANG_CONFIG.find(l => l[0] === 'unk')?.[2] || [])
            .filter(v => /^(part|parte|partie|teil)$/i.test(v))
            .sort((a, b) => b.length - a.length);
        const escapeRegex = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const genericNumberToken = [
            '\\d+',
            '[ivxlcdm]+',
            '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)',
            '(?:twenty|thirty|forty|fifty)[-\\s](?:one|two|three|four|five|six|seven|eight|nine)'
        ].join('|');

        const patterns = [
            '#{1,6}\\s+[^\\n#]+',
            '(?:Prologue|Epilogue)(?:\\s*[:\\-–—]\\s*[^\\n]+)?[\\.:]?',
            `(?:${chapterKw.map(escapeRegex).join('|')})(?:\\s+[^\\n]+)?[\\.:]?`
        ];

        if (genericKw.length) {
            // Generic section keywords like "Part" are valid only when followed by a chapter-like number token.
            patterns.push(`(?:${genericKw.map(escapeRegex).join('|')})\\s+(?:${genericNumberToken})(?:\\s*[:\\-–—]\\s*[^\\n]+)?[\\.:]?`);
        }
        // Matches: # Heading, or Keyword (Chapter) followed by something
        // Capturing group keeps delimiters in split().
        return new RegExp(`(^\\s*(?:${patterns.join('|')})\\s*$)`, 'gmi');
    },

    isEpilogueHeading: (title) => {
        const clean = title.replace(/^[#\s]+/, '').trim().replace(/[.:]+$/, '');
        return /^epilogue$/i.test(clean);
    },

    isPrologueHeading: (title) => {
        const clean = title.replace(/^[#\s]+/, '').trim().replace(/[.:]+$/, '');
        return /^prologue$/i.test(clean);
    },

    getVoiceAliases: (voiceNames = []) => {
        return voiceNames.map(raw => {
            const items = String(raw || '')
                .split(/[|,;/]+/)
                .map(v => v.trim())
                .filter(Boolean);
            const uniq = [];
            const seen = new Set();
            items.forEach(v => {
                const key = v.toLowerCase();
                if (seen.has(key)) return;
                seen.add(key);
                uniq.push(v);
            });
            return uniq;
        });
    },

    getVoiceCandidates: (voiceNames = []) => {
        const aliasMap = TextParser.getVoiceAliases(voiceNames);
        const out = [];
        aliasMap.forEach((aliases, index) => {
            aliases.forEach(name => out.push({
                name,
                index,
                variants: TextParser.getVoiceVariants(name)
            }));
        });
        return out;
    },

    normalizeVoiceText: (text = '') => {
        return String(text || '')
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[’'`]/g, '')
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .trim()
            .replace(/\s+/g, ' ');
    },

    getVoiceVariants: (name = '') => {
        const base = TextParser.normalizeVoiceText(name);
        if (!base) return [];

        const out = [];
        const push = (value) => {
            if (value && !out.includes(value)) out.push(value);
        };

        push(base);

        const words = base.split(' ').filter(Boolean);
        if (words.length > 1) {
            if (words[0].length >= 3) push(words[0]);
            if (words[words.length - 1].length >= 3) push(words[words.length - 1]);
        }

        return out.sort((a, b) => b.length - a.length);
    },

    looksLikeCompactLabel: (text = '') => {
        const allowedLowerWords = new Set([
            'and', 'by', 'chapter', 'da', 'de', 'del', 'di', 'du', 'from', 'la', 'le',
            'narration', 'narrator', 'perspective', 'pov', 'scene', 'speaker', 'van',
            'voice', 'von'
        ]);
        const words = String(text || '')
            .trim()
            .replace(/^[\s"'“”‘’\(\[\{–—-]+/, '')
            .replace(/[\s"'“”‘’\)\]\}–—-]+$/, '')
            .split(/\s+/)
            .map(word => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}'’.-]+$/gu, ''))
            .filter(Boolean);

        if (!words.length || words.length > 4) return false;

        return words.every(word => {
            if (/^[\p{Lu}\p{Lt}\d]/u.test(word)) return true;
            return allowedLowerWords.has(TextParser.normalizeVoiceText(word));
        });
    },

    matchesVoiceLabel: (text = '', candidate, options = {}) => {
        const norm = TextParser.normalizeVoiceText(text);
        if (!norm) return false;

        const allowLooseShortMatch = !!options.allowLooseShortMatch && TextParser.looksLikeCompactLabel(text);
        const variants = candidate.variants && candidate.variants.length
            ? candidate.variants
            : TextParser.getVoiceVariants(candidate.name);

        for (const variant of variants) {
            const esc = TextParser.escapeRegex(variant);
            if (norm === variant) return true;
            if (new RegExp(`^${esc}s? (?:pov|voice|narrator|narration|perspective|speaker)$`, 'i').test(norm)) return true;
            if (new RegExp(`^(?:pov|voice|narrator|narration|perspective|speaker|by|from) ${esc}$`, 'i').test(norm)) return true;
            if (new RegExp(`^${esc} (?:chapter|scene)$`, 'i').test(norm)) return true;
            if (new RegExp(`^(?:chapter|scene) (?:voice|speaker) ${esc}$`, 'i').test(norm)) return true;

            if (allowLooseShortMatch) {
                const anywhere = new RegExp(`(?:^| )${esc}(?:$| )`, 'i');
                if (anywhere.test(norm)) return true;
            }
        }

        return false;
    },

    detectVoiceFromTitle: (chapterTitle = '', candidates = []) => {
        const clean = String(chapterTitle || '').trim();
        if (!clean) return null;

        const fragments = clean
            .split(/[:|–—-]+/)
            .map(v => v.trim())
            .filter(Boolean);
        const parenMatches = Array.from(clean.matchAll(/\(([^)]+)\)/g))
            .map(m => (m[1] || '').trim())
            .filter(Boolean);
        const zones = [...fragments.slice().reverse(), ...parenMatches.slice().reverse(), clean];

        for (const zone of zones) {
            for (const candidate of candidates) {
                if (TextParser.matchesVoiceLabel(zone, candidate, { allowLooseShortMatch: true })) {
                    return candidate.index;
                }
            }
        }

        return null;
    },

    detectExplicitStartVoice: (chapterText = '') => {
        const lines = chapterText
            .split('\n')
            .map(l => l.trim())
            .filter(Boolean)
            .slice(0, 15);
        for (const line of lines) {
            const m = line.match(/^\[\[\s*(voice\s*[12]|v[12]|[12])\s*\]\](?:\s+.*)?$/i);
            if (!m) continue;
            const tag = m[1].toLowerCase().replace(/\s+/g, '');
            if (tag === 'voice1' || tag === 'v1' || tag === '1') return 0;
            if (tag === 'voice2' || tag === 'v2' || tag === '2') return 1;
        }
        return null;
    },

    stripStartVoiceMarker: (text = '') => {
        return text
            .replace(/^\s*\[\[\s*(?:voice\s*[12]|v[12]|[12])\s*\]\]\s*/i, '')
            .replace(/^([^\n]+\n\s*\n)\s*\[\[\s*(?:voice\s*[12]|v[12]|[12])\s*\]\]\s*/i, '$1');
    },

    getChapterOpeningLine: (chapterText = '', chapterTitle = '') => {
        const lines = chapterText.split('\n').map(l => l.trim()).filter(Boolean);
        if (!lines.length) return '';

        const normalizeLine = (s) => String(s || '')
            .replace(/^[#\s]+/, '')
            .replace(/[.:\-–—\s]+$/g, '')
            .toLowerCase();

        const titleNorm = normalizeLine(chapterTitle);
        const headingStart = /^(chapter|kapitel|cap[íi]tulo|chapitre|capitolo|hoofdstuk|rozdział|глава|bölüm|luku|fejezet|kapitola|κεφάλαιο|bab|prologue|epilogue)\b/i;

        for (const line of lines) {
            if (!line) continue;
            if (/<w:[a-z]/i.test(line)) continue; // Skip malformed XML residue lines from bad paste/extract
            const lineNorm = normalizeLine(line);
            if (!lineNorm) continue;
            if (titleNorm && lineNorm === titleNorm) continue;
            if (headingStart.test(lineNorm)) continue;
            return line;
        }

        return '';
    },

    normalize: (text) => {
        return TextParser.normalizeVoiceText(text).replace(/\s+/g, '');
    },

    parseDualVoiceSegments: (text, delim = '* * *', initVoiceIndex = 0, voiceNames = []) => {
        const segs = [];
        const token = delim.trim() || '* * *';
        const escToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const aliasMap = TextParser.getVoiceAliases(voiceNames);
        
        // Split by token
        const parts = text.split(new RegExp(escToken, 'g'));
        
        let currentVoice = initVoiceIndex % 2; // 0 or 1
        
        parts.forEach((part, index) => {
            let content = part.trim();
            if (index === 0) {
                content = TextParser.stripStartVoiceMarker(content);
            }
            if(content) {
                // Check if segment starts with the current voice's name (e.g. "Vincent.")
                // to add a dramatic pause: "Vincent... ... ... Por fin..."
                const aliases = aliasMap[currentVoice] || [];
                if (aliases.length) {
                    const aliasPattern = aliases.map(TextParser.escapeRegex).sort((a, b) => b.length - a.length).join('|');
                    // Regex: optional leading punctuation, Name/alias, optional punctuation, whitespace
                    const nameRegex = new RegExp(`^([\\s"'“”‘’\\(\\[\\{\\-–—]*)(${aliasPattern})([:|.]?)(\\s+)`, 'i');
                    
                    if (index === 0 && nameRegex.test(content)) {
                        content = content.replace(nameRegex, '');
                    }
                    else if (nameRegex.test(content)) {
                        // Insert pause
                        content = content.replace(nameRegex, '$1$2... ... ... $4');
                    }
                }

                segs.push({
                    text: content,
                    voiceIndex: currentVoice
                });
            }
            // Toggle voice for next part
            currentVoice = (currentVoice + 1) % 2;
        });

        return segs;
    },

    detectProjectMetadata: (manuscript, preamble) => {
        let lang = 'English';
        let title = 'Untitled Book';
        let author = 'Unknown Author';

        // Detect Language
        for (const l of LANG_CONFIG) {
            if (l[0] === 'unk') continue;
            // Check keywords in first 1000 chars
            const sample = manuscript.substring(0, 1000);
            for (const kw of l[2]) {
                const re = new RegExp(`^\\s*${TextParser.escapeRegex(kw)}\\s+`, 'mi');
                if (re.test(sample)) { lang = l[1]; break; }
            }
            if (lang !== 'English') break;
        }

        // Detect Title/Author in Preamble
        if (preamble && preamble.trim()) {
            const lines = preamble.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length) {
                // Heuristic: First line is often title
                title = lines[0];
                
                // Look for "By [Author]"
                const lc = LANG_CONFIG.find(l => l[1] === lang) || LANG_CONFIG[0];
                const byKw = [...(lc[3] || []), 'By', 'Author', 'Written by'];
                
                for (const line of lines) {
                    for (const bk of byKw) {
                        const m = line.match(new RegExp(`^${TextParser.escapeRegex(bk)}[:\\s]+\\s*(.+)`, 'i'));
                        if (m) { author = m[1].trim(); break; }
                    }
                    if (author !== 'Unknown Author') break;
                }
                
                // Fallback: 2nd line if short
                if (author === 'Unknown Author' && lines.length > 1 && lines[1].length < 50) {
                    author = lines[1];
                }
            }
        }
        
        return { language: lang, title, author };
    },

    getModelCreditMultiplier: (modelId) => {
        switch(modelId) {
            case 'eleven_multilingual_v3':
            case 'eleven_multilingual_v2':
                return 1.0;
            case 'eleven_turbo_v2_5':
            case 'eleven_turbo_v2':
            case 'eleven_flash_v2_5':
            case 'eleven_flash_v2':
            case 'eleven_monolingual_v1':
            case 'eleven_monolingual_v2':
                return 0.5;
            default:
                return 1.0; // Default to highest cost if unknown model
        }
    },

    detectStartingVoice: (chapterText, chapterTitle, voiceNames = []) => {
        const candidates = TextParser.getVoiceCandidates(voiceNames).filter(c => c.name);
        if (!candidates.length) return 0;

        const explicit = TextParser.detectExplicitStartVoice(chapterText);
        if (explicit !== null) return explicit;

        // 1. Prefer title/header labels because they are more reliable for POV books.
        let res = TextParser.detectVoiceFromTitle(chapterTitle, candidates);
        if (res !== null) return res;

        // 2. Fallback to a short, label-like opening line such as "Adrian." or "POV Adrian".
        const openingLine = TextParser.getChapterOpeningLine(chapterText, chapterTitle);
        if (openingLine) {
            for (const c of candidates) {
                if (TextParser.matchesVoiceLabel(openingLine, c, { allowLooseShortMatch: true })) {
                    return c.index;
                }
            }
        }

        return 0; // Default to Voice 1
    }
};

// --- 2. API SERVICE (ElevenLabs) ---

class APIService {
    static async fetchVoices(apiKey) {
        try {
            const response = await fetch('https://api.elevenlabs.io/v1/voices', {
                method: 'GET',
                headers: { 'xi-api-key': apiKey }
            });
            
            if(!response.ok) throw new Error("Invalid API Key");
            
            const data = await response.json();
            return data.voices.map(v => ({
                id: v.voice_id,
                name: v.name,
                labels: v.labels || {}, 
                lang: 'en-US',
                type: 'premium',
                source: 'ElevenLabs',
                preview_url: v.preview_url
            }));
        } catch (e) {
            throw e;
        }
    }

    static async generateAudio(text, voiceId, apiKey, modelId, context = {}) {
        // Updated to use Local Server Proxy
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                voiceId,
                apiKey,
                modelId,
                projectId: context.projectId,
                chapterIndex: context.chapterIndex,
                chunkIndex: context.chunkIndex
            })
        });
        
        if(!response.ok) {
            const message = await response.text();
            console.error("Server Error Response:", message);
            // Try to parse JSON error if possible
            let errorText = message;
            try {
                const jsonErr = JSON.parse(message);
                if(jsonErr.error) errorText = jsonErr.error;
            } catch(e) {}
            
            throw new Error(`Server Generation error: ${errorText}`);
        }

        const data = await response.json();
        if(data.error) throw new Error(data.error);
        
        // Return URL & Filename
        return { 
            duration: Math.ceil(text.length / 15), 
            audioUrl: data.url,
            filename: data.filename
        };
    }

    static async checkCache(projectId, modelId, chunks) {
        const response = await fetch('/api/check-cache', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId, modelId, chunks })
        });
        if(!response.ok) throw new Error("Cache check failed");
        return await response.json();
    }

    static async mergeChapter(projectId, chapterIndex, filenames, isTitle = false) {
        const response = await fetch('/api/merge-chapter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId, chapterIndex, filenames, isTitle })
        });
        
        if(!response.ok) {
            throw new Error("Merge failed: " + await response.text());
        }
        
        return await response.json(); // { url, path }
    }
}

// --- 3. AUDIO ENGINE ---

class AudioEngine {
    constructor() {
        this.synth = ('speechSynthesis' in window) ? window.speechSynthesis : null;
        this.activeAudio = null;
        
        // Visualizer Context
        this.audioCtx = null;
        this.analyser = null;
        this.dataArray = null;
        this.canvas = document.getElementById('audio-visualizer');
        this.canvasCtx = this.canvas ? this.canvas.getContext('2d') : null;
        this.animationId = null;
    }

    initAudioContext() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 64; // Low resolution for retro bars
            const bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(bufferLength);
        }
    }

    drawVisualizer() {
        if (!this.analyser || !this.canvasCtx) return;
        
        this.animationId = requestAnimationFrame(() => this.drawVisualizer());
        this.analyser.getByteFrequencyData(this.dataArray);

        const w = this.canvas.width;
        const h = this.canvas.height;
        this.canvasCtx.fillStyle = '#000';
        this.canvasCtx.fillRect(0, 0, w, h);

        const barWidth = (w / this.analyser.frequencyBinCount) * 2.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < this.analyser.frequencyBinCount; i++) {
            barHeight = this.dataArray[i] / 2; // Scale down
            this.canvasCtx.fillStyle = `rgb(${barHeight + 100}, 92, 231)`; // Purple-ish
            this.canvasCtx.fillRect(x, h - barHeight, barWidth, barHeight);
            x += barWidth + 1;
        }
    }

    async getVoices() {
        // 1. Get Browser Voices
        let browserVoices = [];
        if(this.synth) {
            browserVoices = await new Promise((resolve) => {
                const v = this.synth.getVoices();
                if(v.length) resolve(v);
                else {
                    this.synth.onvoiceschanged = () => resolve(this.synth.getVoices());
                }
            });
        }

        const formattedBrowser = browserVoices.map((v, i) => ({
            id: `sys_${i}`,
            name: v.name,
            lang: v.lang,
            type: 'standard',
            ref: v
        }));

        // 2. Get API Voices (Safe Check)
        const apiVoices = (STATE.api.elevenLabs && STATE.api.elevenLabs.voices) ? STATE.api.elevenLabs.voices : [];

        return [...formattedBrowser, ...apiVoices];
    }

    async generateChunk(text, voiceId, modelId, context) {
        const voice = STATE.voices.find(v => v.id === voiceId);
        if(!voice) throw new Error('Select a voice before generating.');

        if (voice.type === 'premium') {
            if(!STATE.api.elevenLabs.connected || !STATE.api.elevenLabs.key) {
                throw new Error('ElevenLabs is not connected.');
            }
            return await APIService.generateAudio(text, voiceId, STATE.api.elevenLabs.key, modelId, context);
        }

        return new Promise((resolve) => {
            setTimeout(() => resolve({ 
                duration: Math.ceil(text.length / 15)
            }), 200);
        });
    }

    playChunk(chunk, overrideVoiceId = null) {
        const playbackId = `chunk_${chunk.id}`;
        
        // Update manuscript to show current text
        if(dom.manuscript) dom.manuscript.value = chunk.text;
        
        if(chunk.audioUrl) {
            return this.playAudioBuffer(chunk.audioUrl, playbackId);
        }

        // Fallback to Voice 1 if not specified
        const desiredVoiceId = overrideVoiceId || chunk.voiceId || STATE.project.voiceIds[0];
        const voice = STATE.voices.find(v => v.id === desiredVoiceId);

        if(voice && voice.type === 'premium') {
            return Promise.reject(new Error('Premium audio not generated yet for this chunk.'));
        }

        if(voice && voice.ref) {
            if(!this.synth) return Promise.reject(new Error('Browser voice playback is not supported in this browser.'));
            return new Promise((resolve, reject) => {
                this.stopPlayback(true); 
                STATE.activePlaybackId = playbackId;
                STATE.isPlaying = true;
                if(dom.btnPlay) {
                    dom.btnPlay.innerText = "⏹";
                    dom.btnPlay.classList.add('playing');
                }
                renderTimeline();

                const utterance = new SpeechSynthesisUtterance(chunk.text);
                utterance.voice = voice.ref;
                utterance.onend = () => {
                    STATE.activePlaybackId = null;
                    renderTimeline();
                    resolve();
                };
                utterance.onerror = () => {
                    STATE.activePlaybackId = null;
                    renderTimeline();
                    reject(new Error('Playback failed.'));
                };
                this.synth.speak(utterance);
            });
        }

        return Promise.reject(new Error('Selected voice is unavailable.'));
    }

    playAudioBuffer(url, playbackId = null) {
        return new Promise((resolve, reject) => {
            this.initAudioContext();
            this.stopPlayback(true); // Internal stop

            const audio = new Audio(url);
            audio.crossOrigin = "anonymous"; 
            this.activeAudio = audio;
            STATE.activePlaybackId = playbackId;
            STATE.isPlaying = true;
            if(dom.btnPlay) {
                dom.btnPlay.innerText = "⏹";
                dom.btnPlay.classList.add('playing');
            }
            renderTimeline();

            // Connect to Visualizer
            const source = this.audioCtx.createMediaElementSource(audio);
            source.connect(this.analyser);
            this.analyser.connect(this.audioCtx.destination);
            
            this.drawVisualizer();

            audio.onended = () => {
                cancelAnimationFrame(this.animationId);
                this.activeAudio = null;
                STATE.activePlaybackId = null;
                renderTimeline(); // Refresh UI to restore play icons
                resolve();
            };
            audio.onerror = () => {
                cancelAnimationFrame(this.animationId);
                this.activeAudio = null;
                STATE.activePlaybackId = null;
                renderTimeline();
                reject(new Error('Unable to play generated audio.'));
            };
            
            if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
            
            audio.play().catch((err) => {
                this.activeAudio = null;
                STATE.activePlaybackId = null;
                renderTimeline();
                reject(err);
            });
        });
    }

    stopPlayback(isInternal = false) {
        if(this.synth) this.synth.cancel();
        if(this.activeAudio) {
            this.activeAudio.pause();
            this.activeAudio.currentTime = 0;
            this.activeAudio = null;
        }

        if (!isInternal) {
            STATE.activePlaybackId = null;
            STATE.isPlaying = false; // Reset global playing state
            if(dom.btnPlay) {
                dom.btnPlay.innerText = "▶";
                dom.btnPlay.classList.remove('playing');
            }
        }
        
        if(this.animationId) cancelAnimationFrame(this.animationId);
        if(this.canvasCtx && this.canvas) {
            this.canvasCtx.fillStyle = '#000';
            this.canvasCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
        // Force refresh UI icons
        renderTimeline();
    }
    
    highlightText(chunkId) {
        // Simple "Karaoke" - Scroll timeline to view
        // Note: For true rich text karaoke, we'd need a div overlay on the editor.
        // For now, we highlight the TIMELINE item which contains the text.
        const el = document.getElementById(`chunk-${chunkId}`);
        if(el) {
             el.scrollIntoView({ behavior: 'smooth', block: 'center' });
             document.querySelectorAll('.chunk-item').forEach(c => c.style.borderColor = '');
             el.style.borderLeftColor = '#fff'; // Flash white
        }
    }
}

// --- 5. PROJECT MANAGEMENT ---

async function openProjectModal() {
    document.getElementById('project-modal').classList.add('show');
    const listEl = document.getElementById('project-list');
    const inputEl = document.getElementById('project-title-input');
    
    // Pre-fill Title
    let currentTitle = document.getElementById('sum-title').innerText;
    if(currentTitle === '-') currentTitle = "";
    inputEl.value = STATE.project.customTitle || currentTitle || "";

    listEl.innerHTML = '<div style="padding:20px; text-align:center;">Loading...</div>';

    try {
        const res = await fetch('/api/projects');
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Server returned ${res.status}: ${text.substring(0, 100)}`);
        }
        
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            const text = await res.text();
            throw new Error(`Expected JSON but got ${contentType || 'unknown'}: ${text.substring(0, 100)}`);
        }

        const projects = await res.json();
        
        listEl.innerHTML = '';
        if(projects.length === 0) {
            listEl.innerHTML = '<div style="padding:20px; text-align:center;">No saved projects.</div>';
            return;
        }

        projects.forEach(p => {
            const date = p.updatedAt ? new Date(p.updatedAt).toLocaleString() : 'Unknown Date';
            const div = document.createElement('div');
            div.className = 'project-item';
            div.innerHTML = `
                <div>
                    <div style="font-weight:bold; color:var(--text-main)">${p.title || 'Untitled'}</div>
                    <div style="font-size:0.75rem; color:var(--text-dim)">${p.author || 'Unknown'} • ${date}</div>
                </div>
                <button class="sm-btn" onclick="loadProject('${p.id}')">Load</button>
            `;
            listEl.appendChild(div);
        });
    } catch(e) {
        console.error("Failed to load project list:", e);
        listEl.innerHTML = `<div style="padding:20px; color:var(--danger)">Error: ${e.message}</div>`;
    }
}

function closeProjectModal() {
    document.getElementById('project-modal').classList.remove('show');
}

function openHelpModal() {
    document.getElementById('help-modal').classList.add('show');
}

function closeHelpModal() {
    document.getElementById('help-modal').classList.remove('show');
}

async function saveCurrentProject() {
    if(!STATE.chapters.length && !dom.manuscript.value.trim()) {
        alert("Nothing to save!");
        return;
    }

    // Parse metadata if not yet analyzed
    let meta = { title: "Untitled", author: "Unknown" };
    try {
        meta = TextParser.detectProjectMetadata(dom.manuscript.value, "");
    } catch(e) {}

    // Use Custom Title from Input if provided
    const inputTitle = document.getElementById('project-title-input').value.trim();
    if(inputTitle) {
        meta.title = inputTitle;
        STATE.project.customTitle = inputTitle; // Save for later
    }

    const payload = {
        id: STATE.project.id,
        title: meta.title,
        author: meta.author,
        chapters: STATE.chapters,
        manuscript: dom.manuscript.value,
        projectSettings: STATE.project,
        chunks: STATE.chapters.flatMap(c => c.chunks)
    };

    try {
        const res = await fetch('/api/projects', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(errorData.error || "Save failed");
        }

        const data = await res.json();
        if(data.error) throw new Error(data.error);
        
        // Update STATE with generated ID if it was new
        if (data.id) STATE.project.id = data.id;

        // Refresh list to show update
        openProjectModal();
        LOG.add(`Project saved: ${meta.title}`, 'success');
    } catch(e) {
        alert("Save failed: " + e.message);
    }
}

async function loadProject(id) {
    if(!id || id === 'undefined' || id === 'null') {
        alert("Invalid Project ID");
        return;
    }
    if(!confirm("Load project? Unsaved changes will be lost.")) return;

    try {
        const res = await fetch(`/api/projects/${id}`);
        if(!res.ok) {
            const errorData = await res.json().catch(() => ({ error: "Project not found" }));
            throw new Error(errorData.error || "Project not found");
        }
        
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            throw new Error("Server returned non-JSON response");
        }

        const data = await res.json();
        
        // Restore State
        STATE.project = data.projectSettings || STATE.project;
        STATE.chapters = data.chapters || [];
        dom.manuscript.value = data.manuscript || "";
        
        // Update UI
        dom.projectMode.value = STATE.project.mode;
        dom.voiceName1.value = STATE.project.voiceNames ? STATE.project.voiceNames[0] : "";
        dom.voiceName2.value = STATE.project.voiceNames ? STATE.project.voiceNames[1] : "";
        toggleDualMode();
        
        // Restore Voices (try to match IDs)
        STATE.project.voiceIds.forEach((vid, idx) => {
            const btn = idx === 0 ? dom.voiceBtn1 : dom.voiceBtn2;
            const v = STATE.voices.find(vo => vo.id === vid);
            if(v) btn.querySelector('span').innerText = v.name;
        });

        renderTimeline();
        updateReceipt();
        closeProjectModal();
        LOG.add(`Project loaded: ${data.title}`, 'success');

    } catch(e) {
        alert("Load failed: " + e.message);
    }
}

// --- 4. APP LOGIC ---

const engine = new AudioEngine();
const dom = {
    manuscript: document.getElementById('manuscript'),
    timeline: document.getElementById('timeline-container'),
    voiceDropdown: document.getElementById('voice-dropdown'),
    chunkSize: document.getElementById('chunk-size'),
    btnGenerate: document.getElementById('btn-generate'),
    btnPlay: document.getElementById('btn-play-all'),
    masterProgress: document.getElementById('master-progress'),
    elKey: document.getElementById('el-key'),
    elName: document.getElementById('el-name'),
    elDot: document.getElementById('el-status-dot'),
    elStatusText: document.getElementById('el-status-text'),
    receipt: document.getElementById('live-receipt'),
    elModel: document.getElementById('el-model'), // Added
    
    // New UI
    projectMode: document.getElementById('project-mode'),
    voiceBtn1: document.getElementById('voice-select-btn-1'),
    voiceBtn2: document.getElementById('voice-select-btn-2'),
    voiceName1: document.getElementById('voice-name-1'),
    voiceName2: document.getElementById('voice-name-2'),
    groupVoice2: document.getElementById('group-voice-2'),
    groupToken: document.getElementById('group-token'),
    voiceToken: document.getElementById('voice-token')
};

function setElevenLabsStatus(state, label) {
    if(dom.elStatusText) dom.elStatusText.innerText = label;
    if(!dom.elDot) return;
    dom.elDot.className = 'status-dot';
    if(state === 'active') dom.elDot.classList.add('active');
    else if(state === 'error') dom.elDot.classList.add('error');
}

async function init() {
    await refreshVoiceList();

    // Load Saved Keys
    const savedAPI = localStorage.getItem('ab_api_el');
    if(savedAPI) {
        try {
            const parsed = JSON.parse(savedAPI);
            STATE.api.elevenLabs.key = parsed.key;
            STATE.api.elevenLabs.name = parsed.name;
            dom.elKey.value = parsed.key;
            dom.elName.value = parsed.name;
            
            LOG.add(`Found saved key for "${parsed.name}". Connecting...`);
            connectElevenLabs(true); // true = silent mode
        } catch(e) {
            console.error("Error loading saved keys", e);
        }
    }

    const savedText = localStorage.getItem('ab_manuscript');
    if(savedText) dom.manuscript.value = savedText;
    updateReceipt();
}

async function connectElevenLabs(silent = false) {
    const key = dom.elKey.value.trim();
    const name = dom.elName.value.trim() || "My ElevenLabs";
    
    if(!key) return;

    STATE.api.elevenLabs.connected = false;
    setElevenLabsStatus('idle', 'Connecting...');
    if(!silent) document.getElementById('btn-connect-el').innerText = "Connecting...";

    try {
        const voices = await APIService.fetchVoices(key);
        
        STATE.api.elevenLabs.connected = true;
        STATE.api.elevenLabs.key = key;
        STATE.api.elevenLabs.name = name;
        STATE.api.elevenLabs.voices = voices;

        localStorage.setItem('ab_api_el', JSON.stringify({ key, name }));
        
        setElevenLabsStatus('active', 'Connected');
        if(!silent) document.getElementById('btn-connect-el').innerText = "Connected & Saved";
        document.getElementById('btn-disconnect-el').style.display = 'block';
        LOG.add(`Connected to ElevenLabs as "${name}". Loaded ${voices.length} voices.`, 'success');
        
        refreshVoiceList();

    } catch(e) {
        STATE.api.elevenLabs.connected = false;
        STATE.api.elevenLabs.key = '';
        STATE.api.elevenLabs.name = '';
        STATE.api.elevenLabs.voices = [];
        if(silent) localStorage.removeItem('ab_api_el');
        setElevenLabsStatus('error', 'Not Connected');
        LOG.add(`Failed to connect to ElevenLabs. ${e.message || 'Check API Key.'}`, 'error');
        document.getElementById('btn-disconnect-el').style.display = 'none';
        if(!silent) document.getElementById('btn-connect-el').innerText = "Connect & Fetch Voices";
        refreshVoiceList();
    }
}

function disconnectElevenLabs() {
    localStorage.removeItem('ab_api_el');
    STATE.api.elevenLabs = { key: '', name: '', voices: [], connected: false };
    
    dom.elKey.value = '';
    dom.elName.value = '';
    setElevenLabsStatus('idle', 'Not Connected');
    document.getElementById('btn-connect-el').innerText = "Connect & Fetch Voices";
    document.getElementById('btn-disconnect-el').style.display = 'none';
    
    refreshVoiceList();
    LOG.add("Disconnected from ElevenLabs.", 'info');
}

async function playSingleChunk(chunkId) {
    const playbackId = `chunk_${chunkId}`;
    
    if (STATE.activePlaybackId === playbackId) {
        engine.stopPlayback();
        renderTimeline();
        return;
    }

    engine.stopPlayback();

    let chunk = null;
    for(const c of STATE.chapters) {
        const found = c.chunks.find(k => k.id === chunkId);
        if(found) { chunk = found; break; }
    }
    
    if(!chunk) return;

    LOG.add(`Playing clip: "${chunk.text.substring(0,20)}..."`);
    
    const targetVoiceId = chunk.voiceId || STATE.project.voiceIds[0];

    try {
        // We pass the playbackId to playChunk (via playAudioBuffer) or handle it here
        if (chunk.audioUrl) {
            renderTimeline(); // Update icons
            await engine.playAudioBuffer(chunk.audioUrl, playbackId);
        } else {
            // Synth playback
            STATE.activePlaybackId = playbackId;
            renderTimeline();
            await engine.playChunk(chunk, targetVoiceId);
            STATE.activePlaybackId = null;
            renderTimeline();
        }
    } catch (err) {
        LOG.add(err.message, 'error');
        STATE.activePlaybackId = null;
        renderTimeline();
    }
}

// Display entire chapter
function displayChapter(idx) {
    const ch = STATE.chapters[idx];
    if(ch) {
        dom.manuscript.value = ch.chunks.map(c => c.text).join('\n\n');
    }
}

// Play merged chapter
async function playChapter(idx, event) {
    if(event) event.stopPropagation();
    const playbackId = `chapter_${idx}`;
    
    if (STATE.activePlaybackId === playbackId) {
        engine.stopPlayback();
        renderTimeline();
        return;
    }

    const ch = STATE.chapters[idx];
    if(!ch) return;

    LOG.add(`Playing chapter: ${ch.title}`);
    STATE.isPlaying = true; // Use global play state to allow halting
    STATE.activePlaybackId = playbackId;
    renderTimeline();

    try {
        for (const chunk of ch.chunks) {
            if (!STATE.isPlaying || STATE.activePlaybackId !== playbackId) break;
            
            // Text following handled inside playChunk
            await engine.playChunk(chunk);
        }
    } catch(e) {
        LOG.add(`Playback failed: ${e.message}`, 'error');
    } finally {
        // If it was the whole chapter playing and not interrupted by another play action
        if (STATE.activePlaybackId === playbackId) {
            STATE.isPlaying = false;
            STATE.activePlaybackId = null;
            renderTimeline();
        }
    }
}

// --- NEW GENERATION LOGIC (WITH SAFETY) ---

function haltGeneration() {
    STATE.halt = true;
    LOG.add("Halt requested. Processing will stop after current segment.", "warning");
    document.getElementById('btn-halt').innerText = "🛑 HALTING...";
}

function openSafetyModal() {
    document.getElementById('safety-modal').classList.add('show');
}

function closeSafetyModal() {
    document.getElementById('safety-modal').classList.remove('show');
}

async function checkProjectCache() {
    const modelId = dom.elModel.value;
    const allChunks = [];
    STATE.chapters.forEach((ch, chIdx) => {
        ch.chunks.forEach((ck, ckIdx) => {
            allChunks.push({
                id: ck.id,
                text: ck.text,
                voiceId: ck.voiceId || STATE.project.voiceIds[0],
                chapterIndex: chIdx,
                chunkIndex: ckIdx
            });
        });
    });

    try {
        const result = await APIService.checkCache(STATE.project.id, modelId, allChunks);
        let cachedCount = 0;
        let totalChars = 0;
        let missingChars = 0;

        result.chunks.forEach(res => {
            const chunk = allChunks.find(c => c.id === res.id);
            totalChars += chunk.text.length;
            if (res.exists) {
                cachedCount++;
                // Sync state if already done on server
                STATE.chapters[chunk.chapterIndex].chunks[chunk.chunkIndex].audioUrl = res.url;
                STATE.chapters[chunk.chapterIndex].chunks[chunk.chunkIndex].status = 'done';
            } else {
                missingChars += chunk.text.length;
            }
        });

        const creditMultiplier = TextParser.getModelCreditMultiplier(modelId);
        const costPerCharBase = 0.000165;
        const actualCost = missingChars * creditMultiplier * costPerCharBase;

        document.getElementById('confirm-chars').innerText = totalChars.toLocaleString();
        document.getElementById('confirm-new').innerText = (allChunks.length - cachedCount);
        document.getElementById('confirm-cached').innerText = cachedCount;
        document.getElementById('confirm-cost').innerText = `$${actualCost.toFixed(2)}`;
        
        return { actualCost, missingCount: allChunks.length - cachedCount };
    } catch (e) {
        LOG.add("Cache check failed: " + e.message, "error");
        return null;
    }
}

// Shared helper to generate a specific chunk's audio with RETRY logic
async function processChunkGeneration(chunk, chapterIndex, chunkIndex, retryCount = 0) {
    if (STATE.halt) return false;

    // Budget check
    const budgetLimit = parseFloat(document.getElementById('budget-limit').value) || 999;
    if (STATE.sessionCost > budgetLimit) {
        LOG.add("Session budget exceeded. Stopping.", "error");
        alert(`Session budget of $${budgetLimit.toFixed(2)} exceeded!`);
        return false;
    }

    // Check voice connection first
    const v = STATE.voices.find(vo => vo.id === chunk.voiceId);
    if(v && v.type === 'premium' && !STATE.api.elevenLabs.connected) {
        throw new Error("Premium voice requires API connection.");
    }

    chunk.status = 'processing';
    updateChunkUI(chunk.id, 'processing');

    try {
        const modelId = document.getElementById('el-model').value || 'eleven_multilingual_v2';
        const targetVoice = chunk.voiceId || STATE.project.voiceIds[0];
        
        const context = {
            projectId: STATE.project.id,
            chapterIndex: chapterIndex,
            chunkIndex: chunkIndex
        };
        
        const result = await engine.generateChunk(chunk.text, targetVoice, modelId, context);
        
        // Track cost if not cached
        if (!result.cached) {
            const multiplier = TextParser.getModelCreditMultiplier(modelId);
            const cost = chunk.text.length * multiplier * 0.000165;
            STATE.sessionCost += cost;
            updateReceipt();
        }

        chunk.duration = result.duration;
        chunk.audioUrl = result.audioUrl;
        chunk.filename = result.filename;
        chunk.status = 'done';
        updateChunkUI(chunk.id, 'done');
        return true;
    } catch(err) {
        if (retryCount < 3 && !STATE.halt) {
            const delay = Math.pow(2, retryCount) * 1000;
            LOG.add(`Retry ${retryCount + 1}/3 for chunk after ${delay}ms...`, 'warning');
            await new Promise(r => setTimeout(r, delay));
            return await processChunkGeneration(chunk, chapterIndex, chunkIndex, retryCount + 1);
        }
        
        console.error(err);
        chunk.status = 'error';
        updateChunkUI(chunk.id, 'error');
        LOG.add(`Error generating chunk: ${err.message}`, 'error');
        return false;
    }
}

function updateChunkUI(chunkId, status) {
    const el = document.getElementById(`chunk-${chunkId}`);
    if(!el) return;
    el.classList.remove('status-pending', 'status-processing', 'status-done', 'status-error');
    el.classList.add(`status-${status}`);
}

async function generateSingleChunk(chunkId, event) {
    if(event) event.stopPropagation();
    
    let chunk, chIdx, ckIdx;
    STATE.chapters.some((ch, i) => {
        const idx = ch.chunks.findIndex(c => c.id === chunkId);
        if(idx !== -1) {
            chunk = ch.chunks[idx];
            chIdx = i;
            ckIdx = idx;
            return true;
        }
    });
    
    if(!chunk) return;

    // Check cache for this specific chunk
    const modelId = dom.elModel.value;
    const result = await APIService.checkCache(STATE.project.id, modelId, [{
        id: chunk.id,
        text: chunk.text,
        voiceId: chunk.voiceId || STATE.project.voiceIds[0],
        chapterIndex: chIdx,
        chunkIndex: ckIdx
    }]);

    const isCached = result.chunks[0].exists;
    const multiplier = TextParser.getModelCreditMultiplier(modelId);
    const estCost = isCached ? 0 : chunk.text.length * multiplier * 0.000165;

    // Setup Safety Modal
    document.getElementById('safety-message').innerText = `Generate audio for this segment?`;
    document.getElementById('confirm-chars').innerText = chunk.text.length.toLocaleString();
    document.getElementById('confirm-new').innerText = isCached ? "0" : "1";
    document.getElementById('confirm-cached').innerText = isCached ? "1" : "0";
    document.getElementById('confirm-cost').innerText = `$${estCost.toFixed(4)}`;
    
    openSafetyModal();

    // Override confirm button
    document.getElementById('btn-confirm-start').onclick = async () => {
        closeSafetyModal();
        LOG.add(`Generating single segment...`);
        await processChunkGeneration(chunk, chIdx, ckIdx);
        // Restore default full book listener after
        attachDefaultConfirmListener();
    };
}

async function generateChapter(chapterIdx, event) {
    if(event) event.stopPropagation();
    
    const chapter = STATE.chapters[chapterIdx];
    if(!chapter) return;

    const modelId = dom.elModel.value;
    const chunksToCheck = chapter.chunks.map((ck, i) => ({
        id: ck.id,
        text: ck.text,
        voiceId: ck.voiceId || STATE.project.voiceIds[0],
        chapterIndex: chapterIdx,
        chunkIndex: i
    }));

    const result = await APIService.checkCache(STATE.project.id, modelId, chunksToCheck);
    
    let cachedCount = 0;
    let missingChars = 0;
    let totalChars = 0;

    result.chunks.forEach((res, i) => {
        totalChars += chunksToCheck[i].text.length;
        if (res.exists) {
            cachedCount++;
        } else {
            missingChars += chunksToCheck[i].text.length;
        }
    });

    const multiplier = TextParser.getModelCreditMultiplier(modelId);
    const estCost = missingChars * multiplier * 0.000165;

    // Setup Safety Modal
    document.getElementById('safety-message').innerText = `Generate audio for chapter: ${chapter.title}?`;
    document.getElementById('confirm-chars').innerText = totalChars.toLocaleString();
    document.getElementById('confirm-new').innerText = (chunksToCheck.length - cachedCount);
    document.getElementById('confirm-cached').innerText = cachedCount;
    document.getElementById('confirm-cost').innerText = `$${estCost.toFixed(2)}`;
    
    openSafetyModal();

    // Override confirm button
    document.getElementById('btn-confirm-start').onclick = async () => {
        closeSafetyModal();
        STATE.halt = false;
        document.getElementById('btn-halt').style.display = 'inline-block';
        LOG.add(`Generating segments in "${chapter.title}"...`);
        
        let filenames = [];
        let successCount = 0;

        for(let i=0; i < chapter.chunks.length; i++) {
            if (STATE.halt) break;
            const chunk = chapter.chunks[i];
            const ok = await processChunkGeneration(chunk, chapterIdx, i);
            if(ok) {
                successCount++;
                if(chunk.filename) filenames.push(chunk.filename);
            }
        }
        
        document.getElementById('btn-halt').style.display = 'none';

        if(successCount === chapter.chunks.length && filenames.length > 0) {
            try {
                const isTitle = chapter.title === "Titles";
                const mergeResult = await APIService.mergeChapter(STATE.project.id, chapterIdx, filenames, isTitle);
                chapter.audioUrl = mergeResult.url;
                LOG.add(`Chapter merged successfully!`, 'success');
                renderTimeline();
            } catch(e) {
                LOG.add(`Merge failed: ${e.message}`, 'error');
            }
        }
        attachDefaultConfirmListener();
    };
}

function attachDefaultConfirmListener() {
    document.getElementById('btn-confirm-start').onclick = startFullBookGeneration;
}

function renderTimeline() {
    dom.timeline.innerHTML = '';
    
    if(!STATE.chapters.length) {
        dom.timeline.innerHTML = `<div style="padding:20px; text-align:center; color: var(--text-dim); font-style:italic;">
            No chapters detected. <br>Paste text and click "Analyze".
        </div>`;
        return;
    }

    STATE.chapters.forEach((ch, idx) => {
        const uniqueVoices = new Set(ch.chunks.map(c => c.voiceName)).size;
        const segmentCount = ch.chunks.length;
        const isChapterPlaying = STATE.activePlaybackId === `chapter_${idx}`;
        
        const div = document.createElement('div');
        div.className = 'chapter-card';
        
        // Chapter Header with Toggleable Play/Stop
        div.innerHTML = `
        <div class="chapter-header">
            <div onclick="displayChapter(${idx})" style="flex:1; cursor:pointer;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:1rem; font-weight:700; color:var(--accent);">${ch.title}</span>
                    <span style="font-size:0.75rem; background:rgba(255,255,255,0.1); padding:2px 8px; border-radius:12px;">
                        ${segmentCount} Segments
                    </span>
                </div>
                <div style="font-size:0.8rem; color:var(--text-dim); display:flex; gap:10px;">
                    <span>🗣️ ${uniqueVoices} Voices</span>
                    <span>⏱️ Est. ${(segmentCount * 15 / 60).toFixed(1)} min</span>
                </div>
            </div>
            <div style="margin-left:15px; display:flex; align-items:center; gap:8px;">
                ${ch.audioUrl ? `<button class="sm-btn ${isChapterPlaying ? 'playing' : ''}" onclick="playChapter(${idx}, event)">${isChapterPlaying ? '⏹ Stop' : '▶ Play'}</button>` : ''}
                <button class="sm-btn" onclick="generateChapter(${idx}, event)">⚡ ${ch.audioUrl ? 'Regen' : 'Gen Chapter'}</button>
                ${ch.audioUrl ? `<span style="color:var(--success); font-weight:bold; font-size:1.2rem;" title="Chapter Merged">✓</span>` : ''}
            </div>
        </div>`;
        
        // Segments with Toggleable Play/Stop Icons
        ch.chunks.forEach((ck, cIdx) => {
            const vName = ck.voiceName || 'Voice';
            const bgStyle = cIdx % 2 === 0 ? 'background:rgba(255,255,255,0.02);' : '';
            const isChunkPlaying = STATE.activePlaybackId === `chunk_${ck.id}`;
            const statusClass = isChunkPlaying ? 'status-playing' : `status-${ck.status}`;
            
            div.innerHTML += `<div id="chunk-${ck.id}" class="chunk-item ${statusClass}" onclick="playSingleChunk('${ck.id}')" style="${bgStyle}" role="button" tabindex="0" aria-label="Play segment ${cIdx + 1}">
                <div style="display:flex; align-items:center; gap:10px; width:100%;">
                    <span style="font-family:var(--font-mono); font-size:0.8rem; color:${isChunkPlaying ? 'var(--accent)' : 'var(--text-dim)'}; width:20px; text-align:center;">
                        ${isChunkPlaying ? '⏹' : (cIdx + 1)}
                    </span>
                    <span class="voice-tag ${isChunkPlaying ? 'playing' : ''}" style="display:inline-block; margin:0; width:80px; text-align:center;">${vName}</span>
                    <span class="chunk-content" style="flex:1;">${ck.text.substring(0,60)}...</span>
                    
                    <div class="chunk-actions">
                         <button class="action-btn" title="Regenerate Audio" onclick="generateSingleChunk('${ck.id}', event)" aria-label="Regenerate Segment">↺</button>
                         <span class="generated-icon">✓</span>
                    </div>
                </div>
            </div>`;
        });
        dom.timeline.appendChild(div);
    });
}

// --- UI LOGIC ---

function toggleDualMode() {
    const mode = dom.projectMode.value;
    STATE.project.mode = mode;
    
    if(mode === 'dual') {
        dom.groupVoice2.style.display = 'block';
        dom.groupToken.style.display = 'block';
    } else {
        dom.groupVoice2.style.display = 'none';
        dom.groupToken.style.display = 'none';
    }
}

function openVoiceDropdown(slot, event) {
    event.stopPropagation();
    STATE.activeVoiceSlot = slot;
    dom.voiceDropdown.classList.add('show');
    
    // Position
    const btn = slot === 1 ? dom.voiceBtn1 : dom.voiceBtn2;
    const rect = btn.getBoundingClientRect();
    dom.voiceDropdown.style.top = `${rect.bottom + 5}px`;
    
    refreshVoiceList(); // Re-render to show selected
}

async function refreshVoiceList() {
    STATE.voices = await engine.getVoices();
    const dd = dom.voiceDropdown;
    dd.innerHTML = '';

    if(STATE.voices.length === 0) {
        dd.innerHTML = '<div style="padding:15px;color:var(--text-dim)">No voices available.</div>';
        return;
    }

    const getStandardVoiceGender = (name) => {
        name = name.toLowerCase();
        if (name.includes('female') || name.includes('samantha')) return 'female';
        if (name.includes('male') || name.includes('daniel')) return 'male';
        return 'other';
    };

    // Columns
    const cols = {
        stdMale: document.createElement('div'),
        stdFemale: document.createElement('div'),
        stdOther: document.createElement('div'),
        premMale: document.createElement('div'),
        premFemale: document.createElement('div')
    };
    
    Object.keys(cols).forEach(k => {
        cols[k].className = 'voice-col';
        let label = '';
        if(k === 'stdMale') label = '💻 Standard - Male';
        if(k === 'stdFemale') label = '💻 Standard - Female';
        if(k === 'stdOther') label = '💻 Standard - Other';
        if(k === 'premMale') label = '☁️ Premium - Male';
        if(k === 'premFemale') label = '☁️ Premium - Female';
        cols[k].innerHTML = `<div class="voice-col-header">${label}</div>`;
        dd.appendChild(cols[k]);
    });

    const currentSelectedId = STATE.project.voiceIds[STATE.activeVoiceSlot - 1];

    STATE.voices.forEach(v => {
        const el = document.createElement('div');
        el.className = 'voice-option';
        // A11y: Make focusable
        el.setAttribute('tabindex', '0');
        el.setAttribute('role', 'option');
        el.setAttribute('aria-label', v.name);
        
        if(v.id === currentSelectedId) {
            el.classList.add('selected');
            el.setAttribute('aria-selected', 'true');
        }
        
        const handler = (e) => {
             if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
             if (e.type === 'keydown') e.preventDefault();
             selectVoice(v.id);
        };

        el.onclick = handler;
        el.onkeydown = handler;
        
        let meta = v.type === 'premium' ? 
            (v.labels.accent || v.labels.age || 'Premium') : v.lang;
        
        el.innerHTML = `<span>${v.name}</span> <span class="voice-meta">${meta}</span>`;

        if(v.type === 'premium') {
            const g = (v.labels.gender || '').toLowerCase();
            if(g === 'female') cols.premFemale.appendChild(el);
            else cols.premMale.appendChild(el); 
        } else { 
            const g = getStandardVoiceGender(v.name);
            if(g === 'male') cols.stdMale.appendChild(el);
            else if(g === 'female') cols.stdFemale.appendChild(el);
            else cols.stdOther.appendChild(el);
        }
    });
    
    updateDropdownButtons();
}

function selectVoice(id) {
    const slot = STATE.activeVoiceSlot - 1; // 0 or 1
    STATE.project.voiceIds[slot] = id;
    
    // Auto-fill name if empty
    const v = STATE.voices.find(vo => vo.id === id);
    const nameInput = slot === 0 ? dom.voiceName1 : dom.voiceName2;
    if(v && !nameInput.value.trim()) {
        nameInput.value = v.name.split(' ')[0]; // Just first name
    }

    updateDropdownButtons();
    dom.voiceDropdown.classList.remove('show');
    
    updateModelDropdownState();
    updateReceipt();
}

function updateDropdownButtons() {
    [0, 1].forEach(slot => {
        const id = STATE.project.voiceIds[slot];
        const v = STATE.voices.find(vo => vo.id === id);
        const btn = slot === 0 ? dom.voiceBtn1 : dom.voiceBtn2;
        const label = btn.querySelector('span');
        if(v) label.innerText = v.name;
        else label.innerText = "Select Voice...";
    });
}

window.addEventListener('click', (e) => {
    // Close dropdown if clicked outside
    if(!dom.voiceDropdown.contains(e.target) && 
       !dom.voiceBtn1.contains(e.target) && 
       !dom.voiceBtn2.contains(e.target)) {
        dom.voiceDropdown.classList.remove('show');
    }
});

function sanitizeChunkSize(value) {
    const parsed = parseInt(value, 10);
    if(Number.isNaN(parsed)) return 1000;
    const clamped = Math.min(Math.max(parsed, 200), 4000);
    return clamped;
}

function splitTextIntoChunks(text, maxChars) {
    const result = [];
    let remaining = text.trim();
    
    while(remaining.length > 0) {
        if(remaining.length <= maxChars) {
            result.push(remaining);
            break;
        }
        
        let splitIndex = -1;
        
        // 1. Try to split at a sentence terminator within the "safe zone" (last 25% of the limit)
        // We want the cut to be AS CLOSE to maxChars as possible.
        const safeZoneStart = Math.floor(maxChars * 0.75); 
        const searchArea = remaining.substring(safeZoneStart, maxChars);
        
        // Match . ! ? " ” followed by space or end of line
        const sentenceEndings = /[.!?\u201d"]+(?=\s|$)/g;
        let match;
        let lastMatchIndex = -1;
        
        while ((match = sentenceEndings.exec(searchArea)) !== null) {
            lastMatchIndex = match.index + match[0].length;
        }
        
        if (lastMatchIndex !== -1) {
            splitIndex = safeZoneStart + lastMatchIndex;
        } else {
            // 2. Fallback: Split at last whitespace
            const lastSpace = remaining.lastIndexOf(' ', maxChars);
            if (lastSpace > maxChars * 0.3) { // Only if it's not too early
                splitIndex = lastSpace;
            } else {
                // 3. Fallback: Split at newline if available
                const lastNewline = remaining.lastIndexOf('\n', maxChars);
                if (lastNewline > maxChars * 0.3) {
                    splitIndex = lastNewline;
                }
            }
        }
        
        // 4. Hard Cut (if absolutely no good split point found)
        if(splitIndex <= 0) splitIndex = maxChars;

        const chunkText = remaining.slice(0, splitIndex).trim();
        if(chunkText.length) result.push(chunkText);
        remaining = remaining.slice(splitIndex).trimStart();
    }
    return result;
}

// --- EVENT HANDLERS ---


dom.manuscript.addEventListener('input', () => {
    localStorage.setItem('ab_manuscript', dom.manuscript.value);
    updateReceipt();
});

document.getElementById('btn-analyze').addEventListener('click', () => {
    const raw = dom.manuscript.value;
    if(!raw.trim()) return;
    
    // Reset
    STATE.chapters.forEach(ch => {
        ch.chunks.forEach(chunk => {
            if(chunk.audioUrl) URL.revokeObjectURL(chunk.audioUrl);
        });
    });
    STATE.chapters = [];
    
    // Update State from UI
    STATE.project.voiceNames = [dom.voiceName1.value, dom.voiceName2.value];
    STATE.project.token = dom.voiceToken.value;

    const chunkLimit = sanitizeChunkSize(dom.chunkSize.value);
    dom.chunkSize.value = chunkLimit;
    
    // 1. Split Chapters (Improved Regex with Multi-Language Support)
    const chapterRegex = TextParser.getChapterHeadingRegex();
    
    // Split but keep delimiters
    const parts = raw.split(chapterRegex).filter(p => p.trim().length > 0);
    
    let currentTitle = "Start";
    let preamble = "";
    
    // Check for preamble (text before first chapter)
    if(parts.length > 0 && !parts[0].match(chapterRegex)) {
        preamble = parts[0];
    }
    
    const isDual = STATE.project.mode === 'dual';
    let pendingHeader = "";

    // Iterate
    let chapterCounter = 0;
    for(let i=0; i<parts.length; i++) {
        const p = parts[i];
        const pClean = p.trim();
        
        if(pClean.match(chapterRegex)) {
            // Found a header
            currentTitle = pClean.replace(/^[#\s]+/, '').trim();
            chapterCounter++;
            
            // Format header for audio: "Capítulo uno: Piper" -> "Capítulo uno... ... ... Piper... ... ..."
            // We replace colons/dashes with stronger pause indicators
            pendingHeader = currentTitle
                .replace(/[:|–—]\s*/g, '... ... ... ') // 1.5s approx pause
                .trim();
            
            if (!pendingHeader.match(/[.!?]$/)) pendingHeader += '... ... ...';
            pendingHeader += '\n\n';

        } else {
             // Found content
             let fullText = p;
             
             // Prepend the chapter header to the start of the text
             if (pendingHeader) {
                 fullText = pendingHeader + fullText;
                 pendingHeader = "";
             }

             let segments = [];
             
             if(isDual) {
                 // Pass original p (with formatting) or clean? Original is safer for context.
                 const startVoice = TextParser.detectStartingVoice(fullText, currentTitle, STATE.project.voiceNames);
                 segments = TextParser.parseDualVoiceSegments(fullText, STATE.project.token, startVoice, STATE.project.voiceNames);
             } else {
                 segments = [{ text: fullText, voiceIndex: 0 }];
             }

             const chapterChunks = [];
             
             segments.forEach(seg => {
                 const textChunks = splitTextIntoChunks(seg.text, chunkLimit);
                 textChunks.forEach(txt => {
                     const assignedVoiceId = STATE.project.voiceIds[seg.voiceIndex] || STATE.project.voiceIds[0];
                     const assignedName = STATE.project.voiceNames[seg.voiceIndex] || (seg.voiceIndex === 0 ? "Voice 1" : "Voice 2");

                     chapterChunks.push({
                        text: txt,
                        status: 'pending',
                        id: Math.random().toString(36).substr(2,9),
                        audioUrl: null,
                        voiceId: assignedVoiceId,
                        voiceName: assignedName, 
                        voiceIndex: seg.voiceIndex,
                        duration: 0
                     });
                 });
             });

             if(chapterChunks.length > 0) {
                let finalChapterTitle;
                const isEpilogue = TextParser.isEpilogueHeading(currentTitle);
                const isPrologue = TextParser.isPrologueHeading(currentTitle);
                if (chapterCounter === 0) {
                    finalChapterTitle = "Titles";
                } else if (isEpilogue) {
                    finalChapterTitle = "Epilogue";
                } else if (isPrologue) {
                    finalChapterTitle = "Prologue";
                } else {
                    let cleanHeading = currentTitle.replace(/^(Chapter|Part|Book|Kapitel|Prologue|Epilogue)\s+\d*[:\.]?\s*/i, '');
                    if (cleanHeading === "Start") cleanHeading = "";
                    finalChapterTitle = `Chapter ${chapterCounter}${cleanHeading ? ': ' + cleanHeading : ''}`;
                }

                 STATE.chapters.push({
                     title: finalChapterTitle,
                     chunks: chapterChunks
                 });
             }
        }
    }
    
    // --- METADATA & SUMMARY ---
    const meta = TextParser.detectProjectMetadata(raw, preamble);
    
    // Generate Deterministic Project ID
    const safeTitle = (meta.title || 'untitled').toLowerCase().replace(/[^a-z0-9]/g, '');
    const safeAuthor = (meta.author || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '');
    const uniqueString = `${safeTitle}_${safeAuthor}`.substring(0, 30);
    // Simple hash to ensure shortness and uniqueness
    let hash = 0;
    for (let i = 0; i < uniqueString.length; i++) {
        hash = ((hash << 5) - hash) + uniqueString.charCodeAt(i);
        hash |= 0;
    }
    const hashStr = (hash >>> 0).toString(16);
    
    STATE.project.id = `${safeTitle.substring(0,10)}_${hashStr}`;
    LOG.add(`Project ID set to: ${STATE.project.id}`);

    const modelId = dom.elModel.value; // Get model from dom.elModel
    const creditMultiplier = TextParser.getModelCreditMultiplier(modelId);
    
    // The base rate for 1 character is $165 / 1,000,000 = $0.000165
    const costPerCharBase = 0.000165; 

    // Total cost = totalChars * creditMultiplier * costPerCharBase
    const totalChars = STATE.chapters.reduce((acc, ch) => acc + ch.chunks.reduce((c, ck) => c + ck.text.length, 0), 0);
    const estCost = totalChars * creditMultiplier * costPerCharBase;

    // Update UI Summary
    document.getElementById('project-summary').style.display = 'block';
    document.getElementById('sum-title').innerText = meta.title.substring(0,20);
    document.getElementById('sum-author').innerText = meta.author.substring(0,20);
    document.getElementById('sum-lang').innerText = meta.language;
    
    // Accurate Chapter Count
    const hasTitles = STATE.chapters.length > 0 && STATE.chapters[0].title === "Titles";
    const actualChapterCount = hasTitles ? STATE.chapters.length - 1 : STATE.chapters.length;
    const label = hasTitles ? `${actualChapterCount} (+Titles)` : `${actualChapterCount}`;
    
    document.getElementById('sum-chapters').innerText = label;
    document.getElementById('sum-chars').innerText = totalChars.toLocaleString();
    document.getElementById('sum-cost').innerText = `$${estCost.toFixed(2)}`;
    document.getElementById('sum-model').innerText = `Model: ${dom.elModel.options[dom.elModel.selectedIndex].text}`;


    // Render Timeline via helper
    renderTimeline();

    if(!STATE.chapters.length) {
        dom.timeline.innerHTML = `<div style="padding:20px; text-align:center; color: var(--text-dim); font-style:italic;">
            Unable to detect chapters. Ensure your manuscript uses headings (e.g. "Chapter 1", "# Title").
        </div>`;
    }
    
    const hasChunks = STATE.chapters.some(ch => ch.chunks.length > 0);
    dom.btnGenerate.disabled = !hasChunks;
    dom.btnGenerate.innerText = "2. Generate Audio";
    LOG.add(`Analyzed: ${meta.title} by ${meta.author}. ${STATE.chapters.length} chapters.`);
    updateReceipt();
});

document.getElementById('btn-generate').addEventListener('click', async () => {
    // Validate Voices
    if(!STATE.project.voiceIds[0]) {
        alert("Please select at least Voice 1.");
        return;
    }
    
    // Check Connections for Premium Voices
    const usedVoiceIds = new Set();
    STATE.chapters.forEach(ch => ch.chunks.forEach(ck => usedVoiceIds.add(ck.voiceId)));
    let needsAPI = false;
    usedVoiceIds.forEach(id => {
        const v = STATE.voices.find(vo => vo.id === id);
        if(v && v.type === 'premium') needsAPI = true;
    });
    if (needsAPI && !STATE.api.elevenLabs.connected) {
        alert("One or more selected voices are Premium. Please connect ElevenLabs API.");
        return;
    }

    // 1. Dry Run / Cache Check
    dom.btnGenerate.innerText = "🔍 Checking Cache...";
    dom.btnGenerate.disabled = true;
    
    const stats = await checkProjectCache();
    dom.btnGenerate.innerText = "2. Generate Audio";
    dom.btnGenerate.disabled = false;

    if (!stats) return;

    if (stats.missingCount === 0) {
        LOG.add("All segments are already generated and cached.", "success");
        renderTimeline();
        alert("All segments are already generated and cached!");
        return;
    }

    // 2. Setup Safety Modal for Full Book
    document.getElementById('safety-message').innerText = `Generate audio for the entire book?`;
    // Stats are already updated by checkProjectCache() inside the modal elements
    
    attachDefaultConfirmListener(); // Ensure it points to full book logic
    openSafetyModal();
});

async function startFullBookGeneration() {
    closeSafetyModal();
    
    STATE.halt = false;
    dom.btnGenerate.disabled = true;
    dom.btnGenerate.innerText = "⌛ Generating...";
    document.getElementById('btn-halt').style.display = 'inline-block';
    document.getElementById('btn-halt').innerText = "🛑 HALT";

    LOG.add("Starting full book generation...");

    for (let i = 0; i < STATE.chapters.length; i++) {
        if (STATE.halt) break;
        
        const chapter = STATE.chapters[i];
        let filenames = [];
        let successCount = 0;

        LOG.add(`Processing: ${chapter.title}`);

        for (let j = 0; j < chapter.chunks.length; j++) {
            if (STATE.halt) break;
            const chunk = chapter.chunks[j];
            
            // Skip already done
            if (chunk.status === 'done' && chunk.audioUrl) {
                successCount++;
                const fname = chunk.filename || chunk.audioUrl.split('/').pop();
                filenames.push(fname);
                continue;
            }

            const ok = await processChunkGeneration(chunk, i, j);
            if (ok) {
                successCount++;
                if (chunk.filename) filenames.push(chunk.filename);
            }
        }

        // Merge chapter if all chunks present
        if (!STATE.halt && successCount === chapter.chunks.length && filenames.length > 0) {
            try {
                const isTitle = chapter.title === "Titles";
                const mergeResult = await APIService.mergeChapter(STATE.project.id, i, filenames, isTitle);
                chapter.audioUrl = mergeResult.url;
            } catch(e) {
                LOG.add(`Auto-merge failed for ${chapter.title}: ${e.message}`, 'error');
            }
        }
    }

    dom.btnGenerate.disabled = false;
    dom.btnGenerate.innerText = "2. Generate Audio";
    document.getElementById('btn-halt').style.display = 'none';

    if (STATE.halt) {
        LOG.add("Generation halted by user.", "warning");
    } else {
        LOG.add("Full book generation complete!", "success");
    }
    renderTimeline();
}

// --- RESTORED PLAYBACK LOGIC ---

dom.btnPlay.addEventListener('click', async () => {
    if(STATE.isPlaying) {
        // Stop Logic
        engine.stopPlayback();
        STATE.isPlaying = false;
        STATE.activePlaybackId = null;
        dom.btnPlay.innerText = "▶";
        dom.btnPlay.classList.remove('playing');
        LOG.add("Playback stopped.");
        renderTimeline();
        return;
    }

    STATE.isPlaying = true;
    dom.btnPlay.innerText = "⏹"; // Changed from ⬛ to match timeline ⏹
    dom.btnPlay.classList.add('playing');
    dom.masterProgress.value = 0;
    
    // Flatten chunks for easy iteration
    let queue = [];
    STATE.chapters.forEach(ch => queue = [...queue, ...ch.chunks]);
    
    const total = queue.length;

    for(let i=0; i<total; i++) {
        if(!STATE.isPlaying) break; // Exit if stopped

        const chunk = queue[i];
        STATE.activePlaybackId = `chunk_${chunk.id}`;
        renderTimeline();
        
        // Update Progress Bar
        dom.masterProgress.value = ((i + 1) / total) * 100;
        
        // Visual Highlight - already handled by activePlaybackId + renderTimeline
        const el = document.getElementById(`chunk-${chunk.id}`);
        if(el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        LOG.add(`Playing segment ${i+1}/${total}`);
        
        try {
            // engine.playChunk also calls playAudioBuffer if URL exists
            await engine.playChunk(chunk);
        } catch (err) {
            LOG.add(err.message, 'error');
        }
    }

    STATE.isPlaying = false;
    STATE.activePlaybackId = null;
    dom.btnPlay.innerText = "▶";
    dom.btnPlay.classList.remove('playing');
    dom.masterProgress.value = 100;
    LOG.add("Playback Finished.");
    renderTimeline();
});

function updateReceipt() {
    let projectEst = 0;
    const rawLength = dom.manuscript.value.length;
    const modelId = dom.elModel.value; 
    const costPerCharBase = 0.000165; 
    const creditMultiplier = TextParser.getModelCreditMultiplier(modelId);

    if(STATE.chapters.length > 0) {
        STATE.chapters.forEach(ch => {
            ch.chunks.forEach(ck => {
                const vid = ck.voiceId || STATE.project.voiceIds[0];
                const v = STATE.voices.find(vo => vo.id === vid);
                if(v && v.type === 'premium') {
                    projectEst += ck.text.length * creditMultiplier * costPerCharBase;
                }
            });
        });
    } else {
        projectEst = rawLength * creditMultiplier * costPerCharBase;
    }
    
    dom.receipt.innerText = `$${STATE.sessionCost.toFixed(2)} spent / $${projectEst.toFixed(2)} total`;
}

function updateModelDropdownState() {
    const v1 = STATE.voices.find(v => v.id === STATE.project.voiceIds[0]);
    const v2 = STATE.project.mode === 'dual' ? STATE.voices.find(v => v.id === STATE.project.voiceIds[1]) : null;
    
    const hasPremium = (v1 && v1.type === 'premium') || (v2 && v2.type === 'premium');
    
    dom.elModel.disabled = !hasPremium;
    dom.elModel.style.opacity = hasPremium ? '1' : '0.5';
}

// Run
init();
