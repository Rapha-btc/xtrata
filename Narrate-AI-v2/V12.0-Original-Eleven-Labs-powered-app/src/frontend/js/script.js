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
        token: '* * *',
        silenceChunk: 0.0,
        silenceChapter: 1.0,
        notes: ''
    },
    projectMeta: {
        title: 'Untitled',
        author: 'Unknown',
        series: '',
        seriesVolume: '',
        displayTitle: 'Untitled',
        language: 'English'
    },
    isProcessing: false,
    isPlaying: false,
    activePlaybackId: null, 
    editingChunkId: null, // Track which chunk is in the editor
    activeVoiceSlot: null,
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

const API_BASE = (() => {
    if (window.API_BASE) return window.API_BASE.replace(/\/$/, '');
    if (location.protocol === 'file:') return 'http://localhost:3000';
    return location.origin;
})();

function resolveApiUrl(url) {
    if (/^https?:\/\//i.test(url)) return url;
    const base = API_BASE || '';
    return base ? `${base}${url}` : url;
}

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

const ChapterVerifier = {
    wordMap: {
        // English
        'one':1,'two':2,'three':3,'four':4,'five':5,'six':6,'seven':7,'eight':8,'nine':9,'ten':10,
        'eleven':11,'twelve':12,'thirteen':13,'fourteen':14,'fifteen':15,'sixteen':16,'seventeen':17,'eighteen':18,'nineteen':19,'twenty':20,
        'twenty-one':21,'twenty-two':22,'thirty':30,'forty':40,'fifty':50,
        // Spanish
        'uno':1,'dos':2,'tres':3,'cuatro':4,'cinco':5,'seis':6,'siete':7,'ocho':8,'nueve':9,'diez':10,
        'once':11,'doce':12,'trece':13,'catorce':14,'quince':15,'dieciseis':16,'dieciséis':16,'diecisiete':17,'dieciocho':18,'diecinueve':19,'veinte':20,
        'veintiuno':21,'veintidos':22,'veintidós':22,'treinta':30,'cuarenta':40,'cincuenta':50,
        // Spanish Compound (31-39)
        'treinta y uno':31,'treinta y dos':32,'treinta y tres':33,'treinta y cuatro':34,'treinta y cinco':35,
        'treinta y seis':36,'treinta y siete':37,'treinta y ocho':38,'treinta y nueve':39,
        // German
        'eins':1,'zwei':2,'drei':3,'vier':4,'fünf':5,'sechs':6,'sieben':7,'acht':8,'neun':9,'zehn':10,
        'elf':11,'zwölf':12,'dreizehn':13,'vierzehn':14,'fünfzehn':15,'sechzehn':16,'siebzehn':17,'achtzehn':18,'neunzehn':19,'zwanzig':20,
        // French
        'un':1,'deux':2,'trois':3,'quatre':4,'cinq':5,'six':6,'sept':7,'huit':8,'neuf':9,'dix':10,
        'onze':11,'douze':12,'treize':13,'quatorze':14,'quinze':15,'seize':16,'dix-sept':17,'dix-huit':18,'dix-neuf':19,'vingt':20
    },
    romanMap: {
        'i':1,'ii':2,'iii':3,'iv':4,'v':5,'vi':6,'vii':7,'viii':8,'ix':9,'x':10,
        'xi':11,'xii':12,'xiii':13,'xiv':14,'xv':15,'xvi':16,'xvii':17,'xviii':18,'xix':19,'xx':20,
        'xxi':21,'xxii':22,'xxiii':23,'xxiv':24,'xxv':25,'xxvi':26,'xxvii':27,'xxviii':28,'xxix':29,'xxx':30,
        'xxxi':31,'xxxii':32,'xxxiii':33,'xxxiv':34,'xxxv':35
    },
    parseEnglishCompound(clean) {
        const m = clean.match(/^(twenty|thirty|forty|fifty)[-\s]+(one|two|three|four|five|six|seven|eight|nine)(?=$|[\s:.!?;,])/i);
        if (!m) return null;
        const tens = this.wordMap[m[1].toLowerCase()];
        const ones = this.wordMap[m[2].toLowerCase()];
        if (!tens || !ones) return null;
        return tens + ones;
    },
    parse(title) {
        const titleClean = title.replace(/^[#\s]+/, '').trim();
        if (/^(prologue|epilogue)\b/i.test(titleClean)) return null;

        // Normalize: remove "Chapter", "Capítulo", etc.
        const clean = titleClean
            .replace(/^(Chapter|Capítulo|Capitulo|Chapitre|Kapitel|Part|Parte|Capitolo|Hoofdstuk|Rozdział|Глава|Bölüm|Luku|Fejezet|Kapitola|Κεφάλαιο|Bab)\s+/i, '')
            .trim()
            .toLowerCase()
            .replace(/[–—]/g, '-')
            .replace(/\s+/g, ' ');
        
        // 1. Try Digits
        const digitMatch = clean.match(/^(\d+)/);
        if (digitMatch) return parseInt(digitMatch[1], 10);

        // 2. Try Roman Numerals (must be standalone word)
        const firstWord = clean.split(/[\s:.]/)[0];
        if (this.romanMap[firstWord]) return this.romanMap[firstWord];

        // 3. Try common English compounds first (e.g., "twenty-six")
        const compound = this.parseEnglishCompound(clean);
        if (compound !== null) return compound;

        // 4. Try Word Map (Longest match first, with strict boundary)
        const sortedKeys = Object.keys(this.wordMap).sort((a, b) => b.length - a.length);
        for (const word of sortedKeys) {
            const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(`^${escapedWord}(?=$|[\\s:.!?;,])`, 'i');
            if (re.test(clean)) return this.wordMap[word];
        }
        
        return null;
    }
};

const TextParser = {
    escapeRegex: (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),

    cleanMetadataLine: function(line = '') {
        return String(line || '')
            .replace(/^[\uFEFF#*\s]+/, '')
            .replace(/\s+/g, ' ')
            .trim();
    },

    stripTrailingPunctuation: function(line = '') {
        return String(line || '').replace(/[\s.·•:;!?]+$/g, '').trim();
    },

    isVolumeLine: function(line = '') {
        const clean = TextParser.stripTrailingPunctuation(TextParser.cleanMetadataLine(line));
        return /^(book|livre|volume|vol\.?|tome|part|parte|teil|libro|buch)\s+([0-9ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)$/i.test(clean);
    },

    extractAuthorFromLine: function(line = '', lang = 'English') {
        const clean = TextParser.stripTrailingPunctuation(TextParser.cleanMetadataLine(line));
        if (!clean) return '';
        const explicit = clean.match(/^(?:by|written by|author|narrated by|par|écrit par|de|von|por|di|da|door)\s+(.+)$/i);
        if (explicit) return explicit[1].trim();
        if (lang === 'French' && /^de\s+/i.test(clean)) return clean.replace(/^de\s+/i, '').trim();
        return '';
    },

    looksLikeSeriesLine: function(line = '') {
        const clean = TextParser.stripTrailingPunctuation(TextParser.cleanMetadataLine(line));
        if (!clean || clean.length < 4) return false;
        if (TextParser.isVolumeLine(clean)) return false;
        if (TextParser.extractAuthorFromLine(clean)) return false;
        if (/^(chapter|chapitre|cap[ií]tulo|kapitel|part|prologue|epilogue)\b/i.test(clean)) return false;
        const words = clean.split(/\s+/).filter(Boolean);
        if (words.length < 2 || words.length > 8) return false;
        return /^[\p{L}\p{N}'’()\-.,&\s]+$/u.test(clean);
    },

    formatProjectTitle: function(meta = {}) {
        const baseTitle = TextParser.stripTrailingPunctuation(meta.title || '') || 'Untitled';
        const extras = [meta.series, meta.seriesVolume]
            .map(v => TextParser.stripTrailingPunctuation(v || ''))
            .filter(Boolean);
        return extras.length ? `${baseTitle} — ${extras.join(' • ')}` : baseTitle;
    },

    formatSeriesLabel: function(meta = {}) {
        const extras = [meta.series, meta.seriesVolume]
            .map(v => TextParser.stripTrailingPunctuation(v || ''))
            .filter(Boolean);
        return extras.length ? extras.join(' • ') : '-';
    },

    getMetadataPreviewLines: function(manuscript = '', preamble = '') {
        const source = String(preamble || '').trim() || String(manuscript || '').split(/\n\s*\n/)[0] || '';
        return source
            .split('\n')
            .map(line => TextParser.cleanMetadataLine(line))
            .filter(Boolean)
            .slice(0, 8);
    },

    _chReg: null,
    getChapterHeadingRegex: function() {
        if(this._chReg) return this._chReg;
        const chapterKw = LANG_CONFIG
            .filter(l => l[0] !== 'unk')
            .flatMap(l => l[2])
            .sort((a, b) => b.length - a.length);
        // Keep only part-style generic headers. Exclude book-style labels (e.g. "Buch 1.") that are common title-page metadata.
        const genericKw = (LANG_CONFIG.find(l => l[0] === 'unk')?.[2] || [])
            .filter(v => /^(part|parte|partie|teil)$/i.test(v))
            .sort((a, b) => b.length - a.length);
        const numberWords = Object.keys(ChapterVerifier.wordMap).sort((a, b) => b.length - a.length);
        const numberToken = [
            '\\d+',
            '[ivxlcdm]+',
            '(?:twenty|thirty|forty|fifty)[-\\s](?:one|two|three|four|five|six|seven|eight|nine)',
            numberWords.map(this.escapeRegex).join('|')
        ].filter(Boolean).join('|');

        const patterns = [
            '#{1,6}\\s+[^\\n#]+',
            '(?:Prologue|Epilogue)(?:\\s*[:\\-–—]\\s*[^\\n]+)?[\\.:]?',
            `(?:${chapterKw.map(this.escapeRegex).join('|')})(?:\\s+[^\\n]+)?[\\.:]?`
        ];

        if (genericKw.length) {
            // Generic section keywords like "Part" are valid only when followed by a chapter-like number token.
            patterns.push(`(?:${genericKw.map(this.escapeRegex).join('|')})\\s+(?:${numberToken})(?:\\s*[:\\-–—]\\s*[^\\n]+)?[\\.:]?`);
        }
        // Matches: # Heading, or Keyword (Chapter) followed by something
        // Capturing group keeps delimiters in split().
        return this._chReg = new RegExp(`(^\\s*(?:${patterns.join('|')})\\s*$)`, 'gmi');
    },

    isEpilogueHeading: function(title) {
        const clean = title.replace(/^[#\s]+/, '').trim().replace(/[.:]+$/, '');
        return /^epilogue$/i.test(clean);
    },

    isPrologueHeading: function(title) {
        const clean = title.replace(/^[#\s]+/, '').trim().replace(/[.:]+$/, '');
        return /^prologue$/i.test(clean);
    },

    getVoiceAliases: function(voiceNames = []) {
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

    getVoiceCandidates: function(voiceNames = []) {
        const aliasMap = this.getVoiceAliases(voiceNames);
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

    normalizeVoiceText: function(str = '') {
        return String(str || '')
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[’'`]/g, '')
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .trim()
            .replace(/\s+/g, ' ');
    },

    getVoiceVariants: function(name = '') {
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

    looksLikeCompactLabel: function(text = '') {
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

    matchesVoiceLabel: function(text = '', candidate, options = {}) {
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

    detectVoiceFromTitle: function(chapterTitle = '', candidates = []) {
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

    detectExplicitStartVoice: function(chapterText = '') {
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

    stripStartVoiceMarker: function(text = '') {
        return text
            .replace(/^\s*\[\[\s*(?:voice\s*[12]|v[12]|[12])\s*\]\]\s*/i, '')
            .replace(/^([^\n]+\n\s*\n)\s*\[\[\s*(?:voice\s*[12]|v[12]|[12])\s*\]\]\s*/i, '$1');
    },

    getChapterOpeningLine: function(chapterText = '', chapterTitle = '') {
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

    detectLeadingVoiceCue: function(text = '', candidates = []) {
        const raw = String(text || '');
        if (!raw.trim() || !candidates.length) return null;

        const lines = raw.split('\n');
        const headingStart = /^(chapter|chapitre|cap[íi]tulo|kapitel|capitolo|hoofdstuk|rozdział|глава|bölüm|luku|fejezet|kapitola|κεφάλαιο|bab|prologue|epilogue)\b/i;
        for (let i = 0; i < Math.min(lines.length, 4); i++) {
            const line = (lines[i] || '').trim();
            if (!line) continue;
            const normalized = line
                .replace(/^[#\s]+/, '')
                .replace(/[.:\-–—\s]+$/g, '')
                .toLowerCase();
            if (!normalized) continue;
            if (headingStart.test(normalized)) continue;
            if (line.length > 60) break;

            for (const candidate of candidates) {
                if (!this.matchesVoiceLabel(line, candidate, { allowLooseShortMatch: true })) continue;
                const remainder = lines.slice(i + 1).join('\n').trim();
                return {
                    index: candidate.index,
                    label: line,
                    text: remainder || raw.trim()
                };
            }

            // If the first non-heading meaningful line is not a compact cue, don't keep scanning deep into prose.
            break;
        }

        return null;
    },

    extractStandaloneVoiceCueLabel: function(text = '') {
        const raw = String(text || '');
        if (!raw.trim()) return '';
        const lines = raw.split('\n');
        const headingStart = /^(chapter|chapitre|cap[íi]tulo|kapitel|capitolo|hoofdstuk|rozdział|глава|bölüm|luku|fejezet|kapitola|κεφάλαιο|bab|prologue|epilogue)\b/i;
        for (let i = 0; i < Math.min(lines.length, 4); i++) {
            const line = (lines[i] || '').trim();
            if (!line) continue;
            const normalized = line
                .replace(/^[#\s]+/, '')
                .replace(/[.:\-–—\s]+$/g, '')
                .toLowerCase();
            if (!normalized) continue;
            if (headingStart.test(normalized)) continue;
            if (line.length > 60) return '';
            if (!TextParser.looksLikeCompactLabel(line)) return '';
            return line.replace(/[.:\-–—\s]+$/g, '').trim();
        }
        return '';
    },

    parseDualVoiceSegments: function(text, delim = '* * *', initVoiceIndex = 0, voiceNames = []) {
        const segs = [];
        const token = delim.trim() || '* * *';
        const escToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const aliasMap = TextParser.getVoiceAliases(voiceNames);
        const candidates = TextParser.getVoiceCandidates(voiceNames).filter(c => c.name);
        
        // Split by token
        const parts = text.split(new RegExp(escToken, 'g'));
        
        let currentVoice = initVoiceIndex % 2; // 0 or 1
        
        parts.forEach((part, index) => {
            let content = part.trim();
            if (index === 0) {
                content = TextParser.stripStartVoiceMarker(content);
            }
            const cue = TextParser.detectLeadingVoiceCue(content, candidates);
            if (cue) {
                currentVoice = cue.index;
                content = cue.text;
            }
            if(content) {
                // Check if segment starts with the current voice's name (e.g. "Vincent.")
                // to add a dramatic pause: "Vincent... ... ... Por fin..."
                const aliases = aliasMap[currentVoice] || [];
                if (aliases.length) {
                    const aliasPattern = aliases.map(TextParser.escapeRegex).sort((a, b) => b.length - a.length).join('|');
                    // Regex: optional leading punctuation, Name/alias, optional punctuation, whitespace
                    const nameRegex = new RegExp(`^([\\s"'“”‘’\\(\\[\\{\\-–—]*)(${aliasPattern})([:|.]?)(\\s+)`, 'i');
                    
                    // NEW: Strip the name if it is the very first segment (Label)
                    if (index === 0 && nameRegex.test(content)) {
                        content = content.replace(nameRegex, '');
                    }
                    else if (nameRegex.test(content)) {
                        // Insert pause for subsequent occurrences
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

    detectProjectMetadata: function(manuscript, preamble) {
        let lang = 'English';
        let title = 'Untitled Book';
        let author = 'Unknown Author';
        let series = '';
        let seriesVolume = '';

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

        const lines = TextParser.getMetadataPreviewLines(manuscript, preamble);
        if (lines.length) {
            const used = new Set();

            for (let i = 0; i < lines.length; i++) {
                const extractedAuthor = TextParser.extractAuthorFromLine(lines[i], lang);
                if (extractedAuthor) {
                    author = extractedAuthor;
                    used.add(i);
                    break;
                }
            }

            for (let i = 0; i < lines.length; i++) {
                if (used.has(i)) continue;
                const line = TextParser.stripTrailingPunctuation(lines[i]);
                if (!line || TextParser.isVolumeLine(line)) continue;
                title = line;
                used.add(i);
                break;
            }

            for (let i = 0; i < lines.length; i++) {
                if (used.has(i)) continue;
                const line = TextParser.stripTrailingPunctuation(lines[i]);
                if (!line) continue;
                if (!seriesVolume && TextParser.isVolumeLine(line)) {
                    seriesVolume = line;
                    used.add(i);
                    continue;
                }
                if (!series && TextParser.looksLikeSeriesLine(line)) {
                    series = line;
                    used.add(i);
                }
            }

            if (author === 'Unknown Author') {
                const fallbackAuthor = lines.find((line, index) => !used.has(index) && line.length <= 60 && !TextParser.isVolumeLine(line) && !TextParser.looksLikeSeriesLine(line));
                if (fallbackAuthor) author = TextParser.stripTrailingPunctuation(fallbackAuthor);
            }
        }
        
        return {
            language: lang,
            title,
            author,
            series,
            seriesVolume,
            displayTitle: TextParser.formatProjectTitle({ title, series, seriesVolume })
        };
    },

    getModelCreditMultiplier: function(modelId) {
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
    
    normalize: function(str) {
        return TextParser.normalizeVoiceText(str).replace(/\s+/g, '');
    },

    detectStartingVoice: function(chapterText, chapterTitle, voiceNames = []) {
        const candidates = this.getVoiceCandidates(voiceNames).filter(c => c.name);
        if (!candidates.length) return 0;

        const explicit = this.detectExplicitStartVoice(chapterText);
        if (explicit !== null) return explicit;

        const cue = this.detectLeadingVoiceCue(chapterText, candidates);
        if (cue) return cue.index;

        // 1. Prefer title/header labels because they are more reliable for POV books.
        let res = this.detectVoiceFromTitle(chapterTitle, candidates);
        if (res !== null) return res;

        // 2. Fallback to a short, label-like opening line such as "Adrian." or "POV Adrian".
        const openingLine = this.getChapterOpeningLine(chapterText, chapterTitle);
        if (openingLine) {
            for (const c of candidates) {
                if (this.matchesVoiceLabel(openingLine, c, { allowLooseShortMatch: true })) {
                    return c.index;
                }
            }
        }

        return 0; // Default to Voice 1
    }
};

// --- 2. API SERVICE (ElevenLabs) ---

class APIService {
    static async req(url,opts={}){
        const target = resolveApiUrl(url);
        const controller = new AbortController();
        const timeoutMs = opts.timeoutMs || 120000;
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let res;
        try {
            res = await fetch(target, { ...opts, signal: controller.signal });
        } catch (err) {
            clearTimeout(timer);
            if (err && err.name === 'AbortError') {
                throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s while calling ${target}`);
            }
            const hint = location.protocol === 'file:'
                ? 'Open the app via http://localhost:3000 (run `node src/backend/server.js`).'
                : `Check the server is running at ${API_BASE}.`;
            throw new Error(`Network error while calling ${target}. ${hint}`);
        }
        clearTimeout(timer);
        if(!res.ok) throw new Error((await res.json().catch(()=>({error:res.statusText}))).error||"Request failed");
        return res.json();
    }
    static async fetchVoices(key){
        const d=await this.req('https://api.elevenlabs.io/v1/voices',{headers:{'xi-api-key':key}});
        return d.voices.map(v=>({id:v.voice_id,name:v.name,labels:v.labels||{},lang:'en-US',type:'premium',source:'ElevenLabs'}));
    }
    static async generateAudio(text,voiceId,apiKey,modelId,ctx,force=false){
        const d=await this.req('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,voiceId,apiKey,modelId,projectId:ctx.projectId,chapterIndex:ctx.chapterIndex,chunkIndex:ctx.chunkIndex,force})});
        return {duration:Math.ceil(text.length/15),audioUrl:d.url,filename:d.filename};
    }
    static async checkCache(pid,mid,chunks){return this.req('/api/check-cache',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:pid,modelId:mid,chunks})})}
    static async mergeChapter(pid,idx,files,isTitle,silence=0){return this.req('/api/merge-chapter',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:pid,chapterIndex:idx,filenames:files,isTitle,silence})})}
    static async mergeBook(pid,silence=0){return this.req('/api/merge-book',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:pid,silence})})}
    static async deleteProject(id){return this.req(`/api/projects/${id}`,{method:'DELETE'})}
    static async renameProject(id, title){return this.req(`/api/projects/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title})})}
}

function syncChunkVoiceAssignments({ pendingOnly = true, persistReason = '' } = {}) {
    if (!STATE.chapters.length) return 0;
    const voiceLocks = getGeneratedVoiceLocks();
    let changed = 0;
    STATE.chapters.forEach(ch => {
        (ch.chunks || []).forEach(chunk => {
            if (pendingOnly && chunk.status === 'done') return;
            const idx = typeof chunk.voiceIndex === 'number' ? chunk.voiceIndex : 0;
            const lockedVoiceId = voiceLocks.byIndex[idx] || voiceLocks.byName[normalizeLockKey(chunk.voiceName)] || null;
            const nextVoiceId = lockedVoiceId || STATE.project.voiceIds[idx] || STATE.project.voiceIds[0] || chunk.voiceId;
            const nextVoiceName = STATE.project.voiceNames[idx] || chunk.voiceName || (idx === 0 ? 'Voice 1' : 'Voice 2');
            if (chunk.voiceId !== nextVoiceId || chunk.voiceName !== nextVoiceName) {
                chunk.voiceId = nextVoiceId;
                chunk.voiceName = nextVoiceName;
                changed++;
            }
        });
    });
    if (changed && persistReason) queueAutoSave(persistReason);
    return changed;
}

function normalizeLockKey(value=''){
    return String(value || '').trim().toLowerCase();
}

function getGeneratedVoiceLocks(){
    const byIndex = {};
    const byName = {};
    STATE.chapters.forEach(ch => {
        (ch.chunks || []).forEach(chunk => {
            if (chunk.status !== 'done' || !chunk.voiceId) return;
            const idx = typeof chunk.voiceIndex === 'number' ? chunk.voiceIndex : 0;
            if (!byIndex[idx]) byIndex[idx] = chunk.voiceId;
            const key = normalizeLockKey(chunk.voiceName);
            if (key && !byName[key]) byName[key] = chunk.voiceId;
        });
    });
    return { byIndex, byName };
}

function enforceGeneratedVoiceLocks({ persistReason = '' } = {}) {
    const voiceLocks = getGeneratedVoiceLocks();
    let changed = 0;
    Object.keys(voiceLocks.byIndex).forEach(key => {
        const idx = Number(key);
        const lockedVoiceId = voiceLocks.byIndex[key];
        if (STATE.project.voiceIds[idx] !== lockedVoiceId) {
            STATE.project.voiceIds[idx] = lockedVoiceId;
            changed++;
        }
    });
    if (changed && persistReason) queueAutoSave(persistReason);
    return { changed, voiceLocks };
}

class AudioEngine{
    constructor(){this.synth=window.speechSynthesis;this.activeAudio=null;
        this.ctx=null;this.analyser=null;this.dataArray=null;this.canvas=document.getElementById('audio-visualizer');this.cCtx=this.canvas?this.canvas.getContext('2d'):null;this.animId=null;}
    initCtx(){if(!this.ctx){this.ctx=new(window.AudioContext||window.webkitAudioContext)();this.analyser=this.ctx.createAnalyser();this.analyser.fftSize=64;this.dataArray=new Uint8Array(this.analyser.frequencyBinCount)}}
    draw(){if(!this.analyser||!this.cCtx)return;this.animId=requestAnimationFrame(()=>this.draw());this.analyser.getByteFrequencyData(this.dataArray);const w=this.canvas.width,h=this.canvas.height;this.cCtx.fillStyle='#000';this.cCtx.fillRect(0,0,w,h);const bw=(w/this.analyser.frequencyBinCount)*2.5;let x=0;
        for(let i=0;i<this.analyser.frequencyBinCount;i++){const bh=this.dataArray[i]/2;this.cCtx.fillStyle=`rgb(${bh+100},92,231)`;this.cCtx.fillRect(x,h-bh,bw,bh);x+=bw+1;}}
    async getVoices(){let bv=[];if(this.synth) bv=await new Promise(r=>{const v=this.synth.getVoices();v.length?r(v):this.synth.onvoiceschanged=()=>r(this.synth.getVoices())});const fmtBv=bv.map((v,i)=>({id:`sys_${i}`,name:v.name,lang:v.lang,type:'standard',ref:v}));return [...fmtBv,...(STATE.api.elevenLabs.voices||[])]}
    async generateChunk(text,vid,mid,ctx,force=false){const v=STATE.voices.find(vo=>vo.id===vid);if(!v)throw new Error('Select voice');if(v.type==='premium'){if(!STATE.api.elevenLabs.connected)throw new Error('API not connected');return APIService.generateAudio(text,vid,STATE.api.elevenLabs.key,mid,ctx,force)}return new Promise(r=>setTimeout(()=>r({duration:Math.ceil(text.length/15)}),200))}
    playChunk(chunk,overrideVid=null){const pid=`chunk_${chunk.id}`;if(dom.manuscript){dom.manuscript.value=chunk.text;dom.manuscript.scrollTop=0}if(chunk.audioUrl) return this.playAudioBuffer(chunk.audioUrl,pid);const vid=overrideVid||chunk.voiceId||STATE.project.voiceIds[0];const v=STATE.voices.find(vo=>vo.id===vid);if(v&&v.type==='premium')return Promise.reject(new Error('Audio not generated'));if(v&&v.ref){if(!this.synth)return Promise.reject(new Error('No TTS'));return new Promise((res,rej)=>{this.stop(true);STATE.activePlaybackId=pid;STATE.isPlaying=true;this.updateBtn(true);renderTimeline();const ut=new SpeechSynthesisUtterance(chunk.text);ut.voice=v.ref;
    this.cancelCurrent=()=>{this.cancelCurrent=null;res()};
    ut.onend=()=>{this.cancelCurrent=null;STATE.activePlaybackId=null;renderTimeline();res()};ut.onerror=()=>{this.cancelCurrent=null;STATE.activePlaybackId=null;renderTimeline();rej(new Error('Playback failed'))};this.synth.speak(ut)})}return Promise.reject(new Error('Voice unavailable'))}
    playAudioBuffer(url,pid){return new Promise((res,rej)=>{this.initCtx();this.stop(true);const aud=new Audio(url);aud.crossOrigin="anonymous";this.activeAudio=aud;STATE.activePlaybackId=pid;STATE.isPlaying=true;this.updateBtn(true);renderTimeline();const src=this.ctx.createMediaElementSource(aud);src.connect(this.analyser);this.analyser.connect(this.ctx.destination);this.draw();
    this.cancelCurrent=()=>{this.cancelCurrent=null;res()};
    aud.onended=()=>{this.cancelCurrent=null;cancelAnimationFrame(this.animId);this.activeAudio=null;STATE.activePlaybackId=null;renderTimeline();res()};aud.onerror=()=>{this.cancelCurrent=null;cancelAnimationFrame(this.animId);this.activeAudio=null;STATE.activePlaybackId=null;renderTimeline();rej(new Error('Play failed'))};if(this.ctx.state==='suspended')this.ctx.resume();aud.play().catch(rej)})}
    stop(int=false){if(this.synth)this.synth.cancel();if(this.activeAudio){this.activeAudio.pause();this.activeAudio.currentTime=0;this.activeAudio=null}
    if(this.cancelCurrent)this.cancelCurrent();
    if(!int){STATE.activePlaybackId=null;STATE.isPlaying=false;this.updateBtn(false)}if(this.animId)cancelAnimationFrame(this.animId);if(this.cCtx)this.cCtx.clearRect(0,0,this.canvas.width,this.canvas.height);renderTimeline()}
    updateBtn(p){if(dom.btnPlay){dom.btnPlay.innerText=p?"⏹":"▶";p?dom.btnPlay.classList.add('playing'):dom.btnPlay.classList.remove('playing')}}}

const engine=new AudioEngine();
const dom={manuscript:document.getElementById('manuscript'),timeline:document.getElementById('timeline-container'),voiceDropdown:document.getElementById('voice-dropdown'),chunkSize:document.getElementById('chunk-size'),btnGenerate:document.getElementById('btn-generate'),btnGenerateTimeline:document.getElementById('btn-generate-all-timeline'),btnRebuildBook:document.getElementById('btn-rebuild-book'),btnPlay:document.getElementById('btn-play-all'),masterProgress:document.getElementById('master-progress'),elKey:document.getElementById('el-key'),elName:document.getElementById('el-name'),elDot:document.getElementById('el-status-dot'),elStatusText:document.getElementById('el-status-text'),receipt:document.getElementById('live-receipt'),elModel:document.getElementById('el-model'),projectMode:document.getElementById('project-mode'),voiceBtn1:document.getElementById('voice-select-btn-1'),voiceBtn2:document.getElementById('voice-select-btn-2'),voiceName1:document.getElementById('voice-name-1'),voiceName2:document.getElementById('voice-name-2'),groupVoice2:document.getElementById('group-voice-2'),groupToken:document.getElementById('group-token'),voiceToken:document.getElementById('voice-token'),silenceChunk:document.getElementById('silence-chunk'),silenceChapter:document.getElementById('silence-chapter'),projectNotes:document.getElementById('project-notes'),forceMerge:document.getElementById('force-merge-check'),forceRegen:document.getElementById('force-regen-check'),btnSaveText:document.getElementById('btn-save-text')};

const AUTO_SAVE = {
    inFlight: false,
    pending: false,
    pendingReason: '',
    hasSavedSnapshot: false,
    lastErrorAt: 0
};

function resetAutoSaveTracker(savedSnapshot=false){
    AUTO_SAVE.inFlight = false;
    AUTO_SAVE.pending = false;
    AUTO_SAVE.pendingReason = '';
    AUTO_SAVE.hasSavedSnapshot = savedSnapshot;
}

function buildProjectPayload(){
    let meta = {
        title: STATE.projectMeta.title || "Untitled",
        author: STATE.projectMeta.author || "Unknown",
        series: STATE.projectMeta.series || "",
        seriesVolume: STATE.projectMeta.seriesVolume || "",
        language: STATE.projectMeta.language || "English"
    };
    if((!meta.title||meta.title==="Untitled")&&dom.manuscript.value.trim()){
        try{
            const m=TextParser.detectProjectMetadata(dom.manuscript.value,"");
            meta = {
                title: m.title || meta.title,
                author: m.author || meta.author,
                series: m.series || meta.series,
                seriesVolume: m.seriesVolume || meta.seriesVolume,
                language: m.language || meta.language
            };
        }catch(e){}
    }
    const titleInput=document.getElementById('project-title-input');
    const customTitle=titleInput?titleInput.value.trim():'';
    const displayTitle = customTitle || TextParser.formatProjectTitle(meta);
    STATE.projectMeta={...meta, displayTitle};

    STATE.project.voiceNames=[dom.voiceName1.value,dom.voiceName2.value];
    STATE.project.token=dom.voiceToken.value;
    STATE.project.modelId=dom.elModel.value;
    STATE.project.silenceChunk=parseFloat(dom.silenceChunk.value)||0;
    STATE.project.silenceChapter=parseFloat(dom.silenceChapter.value)||0;
    STATE.project.notes=dom.projectNotes.value;

    return {
        id: STATE.project.id,
        title: displayTitle,
        baseTitle: meta.title,
        displayTitle,
        author: meta.author,
        series: meta.series,
        seriesVolume: meta.seriesVolume,
        language: meta.language,
        chapters: STATE.chapters,
        manuscript: dom.manuscript.value,
        projectSettings: STATE.project
    };
}

async function saveProjectSnapshot(reason='autosave',showSuccess=false){
    if(!STATE.chapters.length&&!dom.manuscript.value.trim())return false;
    try{
        const payload=buildProjectPayload();
        const r=await APIService.req('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        if(r.id)STATE.project.id=r.id;
        AUTO_SAVE.hasSavedSnapshot = true;
        if(showSuccess)LOG.add(`Auto-save checkpoint created (${reason}).`,'success');
        return true;
    }catch(e){
        const now=Date.now();
        if(now-AUTO_SAVE.lastErrorAt>15000){
            LOG.add(`Auto-save failed (${reason}): ${e.message}`,'warning');
            AUTO_SAVE.lastErrorAt=now;
        }
        return false;
    }
}

async function ensureAutoSaveSeed(){
    if(AUTO_SAVE.hasSavedSnapshot)return true;
    return saveProjectSnapshot('generation-start',true);
}

function queueAutoSave(reason='progress'){
    if(AUTO_SAVE.inFlight){
        AUTO_SAVE.pending = true;
        AUTO_SAVE.pendingReason = reason;
        return;
    }
    AUTO_SAVE.inFlight = true;
    saveProjectSnapshot(reason,false).finally(() => {
        AUTO_SAVE.inFlight = false;
        if(AUTO_SAVE.pending){
            const nextReason = AUTO_SAVE.pendingReason || 'progress';
            AUTO_SAVE.pending = false;
            AUTO_SAVE.pendingReason = '';
            queueAutoSave(nextReason);
        }
    });
}

function setElStatus(s,t){if(dom.elStatusText)dom.elStatusText.innerText=t;if(dom.elDot){dom.elDot.className='status-dot';if(s==='active')dom.elDot.classList.add('active');if(s==='error')dom.elDot.classList.add('error')}}
async function init(){await refreshVoiceList();const k=localStorage.getItem('ab_api_el');if(k){try{const p=JSON.parse(k);dom.elKey.value=p.key;dom.elName.value=p.name;connectElevenLabs(true)}catch(e){}}const t=localStorage.getItem('ab_manuscript');if(t)dom.manuscript.value=t;updateReceipt()}
async function connectElevenLabs(silent=false){
    const key=dom.elKey.value.trim(),name=dom.elName.value.trim()||"My ElevenLabs";if(!key)return;
    setElStatus('idle','Connecting...');
    try{
        const v=await APIService.fetchVoices(key);
        STATE.api.elevenLabs={connected:true,key,name,voices:v};
        localStorage.setItem('ab_api_el',JSON.stringify({key,name}));
        setElStatus('active','Connected');
        document.getElementById('btn-connect-el').innerText="Connected";document.getElementById('btn-disconnect-el').style.display='block';
        refreshVoiceList();LOG.add('Connected','success');
    }catch(e){
        STATE.api.elevenLabs={key:'',name:'',voices:[],connected:false};
        setElStatus('error','Error');LOG.add('Connection failed','error');
    }
}
function disconnectElevenLabs(){localStorage.removeItem('ab_api_el');STATE.api.elevenLabs={key:'',name:'',voices:[],connected:false};dom.elKey.value='';dom.elName.value='';setElStatus('idle','Not Connected');document.getElementById('btn-connect-el').innerText="Connect";document.getElementById('btn-disconnect-el').style.display='none';refreshVoiceList();LOG.add('Disconnected')}

async function playSingleChunk(id){
    STATE.editingChunkId=id; // Set active chunk for editing
    dom.btnSaveText.style.display='inline-block'; // Show save button
    const pid=`chunk_${id}`;if(STATE.activePlaybackId===pid){engine.stop();return}engine.stop();let chunk; STATE.chapters.some(c=>{chunk=c.chunks.find(k=>k.id===id);return !!chunk});if(chunk) engine.playChunk(chunk).catch(e=>LOG.add(e.message,'error'))}
function displayChapter(idx){const ch=STATE.chapters[idx];if(ch)dom.manuscript.value=ch.chunks.map(c=>c.text).join('\n\n')}
async function playChapter(idx,e){
    if(e)e.stopPropagation();
    const pid=`chapter_${idx}`;
    if(STATE.activePlaybackId===pid){engine.stop();return}
    const ch=STATE.chapters[idx];if(!ch)return;
    engine.stop(); // Stop any previous playback properly
    STATE.isPlaying=true;STATE.activePlaybackId=pid;renderTimeline();
    
    // Play chunks in sequence
    try{
        for(const ck of ch.chunks){
            // Check if user stopped playback
            if(!STATE.isPlaying) break;
            
            // If another chapter started, activePlaybackId would be different (but handled by stop() breaking isPlaying?)
            // Actually, if we click another chapter, stop() sets isPlaying=false.
            
            await engine.playChunk(ck);
        }
    }catch(e){
        console.error(e);
    }
    
    // Only reset if we are still the "active" playback logic
    if(STATE.isPlaying && (STATE.activePlaybackId===pid || STATE.activePlaybackId===null)){
        STATE.isPlaying=false;STATE.activePlaybackId=null;renderTimeline();
        engine.stop(); // Ensure cleanup
    }
}
function haltGeneration(){STATE.halt=true;LOG.add("Stopping...",'warning');document.getElementById('btn-halt').innerText="Stopping..."}
function openSafetyModal(){document.getElementById('safety-modal').classList.add('show')}
function closeSafetyModal(){document.getElementById('safety-modal').classList.remove('show')}

async function checkProjectCache(){
    const mid=dom.elModel.value,all=[],flat=[];
    STATE.chapters.forEach((ch,i)=>ch.chunks.forEach((ck,j)=>{all.push({id:ck.id,text:ck.text,voiceId:ck.voiceId||STATE.project.voiceIds[0],chapterIndex:i,chunkIndex:j});flat.push(ck)}));
    try{
        const res=await APIService.checkCache(STATE.project.id,mid,all);
        let cached=0,miss=0;
        res.chunks.forEach(r=>{const c=all.find(x=>x.id===r.id);if(r.exists){cached++;STATE.chapters[c.chapterIndex].chunks[c.chunkIndex].audioUrl=r.url;STATE.chapters[c.chapterIndex].chunks[c.chunkIndex].status='done'}else{miss+=c.text.length;const t=STATE.chapters[c.chapterIndex].title;LOG.add(`Missing: "${c.text.substring(0,30)}..." (${t})`,'warning')}});
        const cost=miss*TextParser.getModelCreditMultiplier(mid)*0.000165;
        document.getElementById('confirm-chars').innerText=flat.reduce((a,b)=>a+b.text.length,0).toLocaleString();
        document.getElementById('confirm-new').innerText=all.length-cached;
        document.getElementById('confirm-cached').innerText=cached;
        document.getElementById('confirm-cost').innerText=`$${cost.toFixed(2)}`;
        return {cost,missingCount:all.length-cached};
    }catch(e){LOG.add(`Cache check error: ${e.message||e}`,'error');return null}
}

async function processChunkGeneration(chunk,chIdx,ckIdx,retry=0,force=false){
    if(STATE.halt)return false;
    const limit=parseFloat(document.getElementById('budget-limit').value)||999;
    if(STATE.sessionCost>limit){alert('Budget Exceeded');return false}
    if (typeof chunk.voiceIndex === 'number') {
        const voiceLocks = getGeneratedVoiceLocks();
        const lockedVoiceId = voiceLocks.byIndex[chunk.voiceIndex] || voiceLocks.byName[normalizeLockKey(chunk.voiceName)] || null;
        chunk.voiceId = lockedVoiceId || STATE.project.voiceIds[chunk.voiceIndex] || STATE.project.voiceIds[0] || chunk.voiceId;
        chunk.voiceName = STATE.project.voiceNames[chunk.voiceIndex] || chunk.voiceName;
    }
    updateChunkUI(chunk.id,'processing');
    try{
        await ensureAutoSaveSeed();
        const mid=dom.elModel.value,vid=chunk.voiceId||STATE.project.voiceIds[0];
        const res=await engine.generateChunk(chunk.text,vid,mid,{projectId:STATE.project.id,chapterIndex:chIdx,chunkIndex:ckIdx},force);
        if(!res.cached){STATE.sessionCost+=chunk.text.length*TextParser.getModelCreditMultiplier(mid)*0.000165;updateReceipt()}
        chunk.duration=res.duration;chunk.audioUrl=res.audioUrl;chunk.filename=res.filename;chunk.status='done';updateChunkUI(chunk.id,'done');
        queueAutoSave(`chunk-${chIdx+1}-${ckIdx+1}`);
        return true;
    }catch(e){
        if(retry<3&&!STATE.halt){await new Promise(r=>setTimeout(r,Math.pow(2,retry)*1000));return processChunkGeneration(chunk,chIdx,ckIdx,retry+1,force)}
        chunk.status='error';updateChunkUI(chunk.id,'error');LOG.add(e.message,'error');return false;
    }
}
function updateChunkUI(id,st){const el=document.getElementById(`chunk-${id}`);if(el){el.className=`chunk-item status-${st}`}}

async function generateSingleChunk(id,e){
    if(e)e.stopPropagation();
    let chunk,chIdx,ckIdx; STATE.chapters.some((ch,i)=>{const x=ch.chunks.findIndex(c=>c.id===id);if(x!==-1){chunk=ch.chunks[x];chIdx=i;ckIdx=x;return true}});
    if(!chunk)return;
    let res;
    const mid=dom.elModel.value;
    try {
        res=await APIService.checkCache(STATE.project.id,mid,[{id:chunk.id,text:chunk.text,voiceId:chunk.voiceId||STATE.project.voiceIds[0],chapterIndex:chIdx,chunkIndex:ckIdx}]);
    } catch (e) {
        LOG.add(`Cache check error: ${e.message||e}`,'error');
        return;
    }
    const isCached=res.chunks[0].exists,cost=isCached?0:chunk.text.length*TextParser.getModelCreditMultiplier(mid)*0.000165;
    
    // UI Setup
    document.getElementById('safety-message').innerText="Generate segment?";
    document.getElementById('confirm-chars').innerText=chunk.text.length;
    document.getElementById('confirm-new').innerText=isCached?0:1;
    document.getElementById('confirm-cached').innerText=isCached?1:0;
    document.getElementById('confirm-cost').innerText=`$${cost.toFixed(4)}`;
    
    // Show/Reset Checkboxes
    dom.forceMerge.parentElement.style.display = 'none'; // Hide Force Merge
    dom.forceRegen.parentElement.style.display = 'flex'; // Show Force Regen
    dom.forceRegen.checked = false; // Reset

    openSafetyModal();
    
    document.getElementById('btn-confirm-start').onclick=async()=>{
        closeSafetyModal();
        const force = dom.forceRegen.checked;
        const success = await processChunkGeneration(chunk,chIdx,ckIdx,0,force);
        
        // Auto-merge chapter if successful
        if(success){
             try {
                const ch = STATE.chapters[chIdx];
                const silenceChunk = parseFloat(dom.silenceChunk.value) || 0;
                // Collect files for this chapter
                const files = ch.chunks.filter(c => c.status === 'done' && c.filename).map(c => c.filename);
                if(files.length === ch.chunks.length) {
                    LOG.add(`Updating Chapter ${chIdx+1}...`);
                    const r = await APIService.mergeChapter(STATE.project.id, chIdx, files, ch.title === "Titles", silenceChunk);
                    ch.audioUrl = r.url;
                    queueAutoSave(`chapter-merge-${chIdx+1}`);
                    renderTimeline();
                }
             } catch(err) {
                 LOG.add("Chapter update failed: " + err.message, 'error');
             }
        }
        
        // Reset UI state
        dom.forceMerge.parentElement.style.display = 'flex';
        dom.forceRegen.parentElement.style.display = 'flex';
        attachDefaultConfirmListener();
    };
}

async function generateChapter(idx,e){
    if(e)e.stopPropagation();
    const ch=STATE.chapters[idx];if(!ch)return;
    const mid=dom.elModel.value,checks=ch.chunks.map((k,i)=>({id:k.id,text:k.text,voiceId:k.voiceId||STATE.project.voiceIds[0],chapterIndex:idx,chunkIndex:i}));
    let res;
    try {
        res=await APIService.checkCache(STATE.project.id,mid,checks);
    } catch (e) {
        LOG.add(`Cache check error: ${e.message||e}`,'error');
        return;
    }
    let miss=0,total=0,cached=0;
    res.chunks.forEach((r,i)=>{total+=checks[i].text.length;if(r.exists)cached++;else miss+=checks[i].text.length});
    document.getElementById('safety-message').innerText=`Generate ${ch.title}?`;document.getElementById('confirm-chars').innerText=total;document.getElementById('confirm-new').innerText=checks.length-cached;document.getElementById('confirm-cached').innerText=cached;document.getElementById('confirm-cost').innerText=`$${(miss*TextParser.getModelCreditMultiplier(mid)*0.000165).toFixed(2)}`;
    openSafetyModal();
    document.getElementById('btn-confirm-start').onclick=async()=>{closeSafetyModal();STATE.halt=false;document.getElementById('btn-halt').style.display='inline-block';
        let files=[],ok=0;
        for(let i=0;i<ch.chunks.length;i++){if(STATE.halt)break;if(await processChunkGeneration(ch.chunks[i],idx,i)){ok++;if(ch.chunks[i].filename)files.push(ch.chunks[i].filename)}}
        document.getElementById('btn-halt').style.display='none';
        if(ok===ch.chunks.length&&files.length){try{const silence=parseFloat(dom.silenceChunk.value)||0;const r=await APIService.mergeChapter(STATE.project.id,idx,files,ch.title==="Titles",silence);ch.audioUrl=r.url;queueAutoSave(`chapter-merge-${idx+1}`);renderTimeline()}catch(e){LOG.add(e.message,'error')}}
        attachDefaultConfirmListener();
    }
}
function attachDefaultConfirmListener(){document.getElementById('btn-confirm-start').onclick=startFullBookGeneration}

function renderTimeline() {
    if (!STATE.chapters.length) {
        dom.timeline.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-dim);font-style:italic">No chapters. Paste text & "Analyze".</div>';
        return;
    }
    dom.timeline.innerHTML = STATE.chapters.map((ch, idx) => {
        const uniqueVoices = new Set(ch.chunks.map(c => c.voiceName)).size;
        const allDone = ch.chunks.every(ck => ck.status === 'done');
        const playing = STATE.activePlaybackId === `chapter_${idx}`;
        const collapsed = ch.collapsed;
        
        const chunksHtml = !collapsed ? ch.chunks.map((ck, cIdx) => {
            const isPlaying = STATE.activePlaybackId === `chunk_${ck.id}`;
            const st = isPlaying ? 'status-playing' : `status-${ck.status}`;
            const bg = cIdx % 2 === 0 ? 'background:rgba(255,255,255,0.02);' : '';
            const chunkVoice = STATE.voices.find(v => v.id === (ck.voiceId || STATE.project.voiceIds[ck.voiceIndex] || STATE.project.voiceIds[0]));
            const vClass = getVoiceColorClassByVoice(chunkVoice);
            
            return `<div id="chunk-${ck.id}" class="chunk-item ${st}" onclick="playSingleChunk('${ck.id}')" style="${bg}" role="button">
                <div style="display:flex;align-items:center;gap:10px;width:100%">
                    <span style="font-family:var(--font-mono);font-size:0.8rem;color:${isPlaying?'var(--accent)':'var(--text-dim)'};width:20px;text-align:center">${isPlaying?'⏹':(cIdx+1)}</span>
                    <span class="voice-tag ${vClass} ${isPlaying?'playing':''}" style="margin:0;width:80px;text-align:center">${ck.voiceName||'Voice'}</span>
                    <span class="chunk-content" style="flex:1">${ck.text.substring(0,60)}...</span>
                    <div class="chunk-actions"><button class="action-btn" onclick="generateSingleChunk('${ck.id}',event)">↺</button><span class="generated-icon" style="opacity:${ck.status==='done'?1:0}">✓</span></div>
                </div></div>`;
        }).join('') : '';

        return `<div class="chapter-card">
            <div class="chapter-header">
                <div class="ch-row">
                    <div style="display:flex;align-items:center;gap:6px;flex:1;overflow:hidden">
                        <button class="sm-btn" onclick="toggleChapterCollapse(${idx},event)" style="width:20px;padding:0;height:20px;line-height:18px">${collapsed?'+':'−'}</button>
                        <span class="ch-title" title="${ch.title}" onclick="displayChapter(${idx})" style="cursor:pointer">${ch.title}</span>
                    </div>
                    <div class="ch-meta">
                        <span>${ch.chunks.length} Segs</span>
                        <span>${(ch.chunks.length*15/60).toFixed(1)}m</span>
                    </div>
                </div>
                <div class="ch-row" style="margin-top:6px;">
                    <div style="display:flex;gap:5px;align-items:center">
                        <span class="ch-meta" style="margin:0">${uniqueVoices} Voice${uniqueVoices>1?'s':''}</span>
                        ${allDone ? '<span style="color:var(--success);font-size:0.8rem">✓</span>' : ''}
                    </div>
                    <div style="display:flex;gap:5px;">
                        ${ch.chunks.length ? `<button class="sm-btn ${playing?'playing':''}" onclick="playChapter(${idx},event)">${playing?'⏹':'▶'}</button>` : ''}
                        <button class="sm-btn" onclick="generateChapter(${idx},event)">${ch.audioUrl?'⚡ Regen':'⚡ Gen'}</button>
                    </div>
                </div>
            </div>${chunksHtml}</div>`;
    }).join('');
}

function toggleChapterCollapse(i,e){if(e)e.stopPropagation();STATE.chapters[i].collapsed=!STATE.chapters[i].collapsed;renderTimeline()}
function toggleDualMode(){const m=dom.projectMode.value;STATE.project.mode=m;dom.groupVoice2.style.display=m==='dual'?'block':'none';dom.groupToken.style.display=m==='dual'?'block':'none'}
function openVoiceDropdown(s,e){e.stopPropagation();STATE.activeVoiceSlot=s;dom.voiceDropdown.classList.add('show');const r=(s===1?dom.voiceBtn1:dom.voiceBtn2).getBoundingClientRect();dom.voiceDropdown.style.top=`${r.bottom+5}px`;refreshVoiceList()}

function getVoiceGender(voice){
    if(!voice) return 'other';
    if(voice.type==='premium'){
        const premiumGender=(voice.labels&&voice.labels.gender?String(voice.labels.gender):'').toLowerCase();
        if(premiumGender.includes('female')) return 'female';
        if(premiumGender.includes('male')) return 'male';
    }
    const name=String(voice.name||'').toLowerCase();
    if(name.includes('female')||name.includes('woman')||name.includes('girl')||name.includes('samantha')||name.includes('jessica')) return 'female';
    if(name.includes('male')||name.includes('man')||name.includes('boy')||name.includes('daniel')||name.includes('craig')) return 'male';
    return 'other';
}

function getVoiceColorClassByVoice(voice){
    const gender=getVoiceGender(voice);
    return gender==='male' ? 'voice-male' : gender==='female' ? 'voice-female' : 'voice-other';
}

async function refreshVoiceList(){
    STATE.voices=await engine.getVoices();const dd=dom.voiceDropdown;dd.innerHTML='';
    if(!STATE.voices.length){dd.innerHTML='<div style="padding:15px;color:var(--text-dim)">No voices.</div>';return}
    const cols={sm:document.createElement('div'),sf:document.createElement('div'),so:document.createElement('div'),pm:document.createElement('div'),pf:document.createElement('div')};
    const labels={sm:'💻 Std-Male',sf:'💻 Std-Female',so:'💻 Std-Other',pm:'☁️ Pre-Male',pf:'☁️ Pre-Female'};
    Object.keys(cols).forEach(k=>{cols[k].className='voice-col';cols[k].innerHTML=`<div class="voice-col-header">${labels[k]}</div>`;dd.appendChild(cols[k])});
    const cur=STATE.project.voiceIds[STATE.activeVoiceSlot-1];
    STATE.voices.forEach(v=>{
        const gender=getVoiceGender(v);
        const el=document.createElement('div');el.className=`voice-option ${getVoiceColorClassByVoice(v)} ${v.id===cur?'selected':''}`.trim();el.innerText=v.name;
        el.onclick=()=>selectVoice(v.id);
        if(v.type==='premium'){gender==='female'?cols.pf.appendChild(el):gender==='male'?cols.pm.appendChild(el):cols.pm.appendChild(el)}
        else{gender==='female'?cols.sf.appendChild(el):gender==='male'?cols.sm.appendChild(el):cols.so.appendChild(el)}
    });
    updateDropdownButtons();
}

function selectVoice(id){
    const s=STATE.activeVoiceSlot-1;
    const voiceLocks=getGeneratedVoiceLocks();
    const lockedVoiceId=voiceLocks.byIndex[s]||null;
    if(lockedVoiceId&&lockedVoiceId!==id){
        const lockedVoice=STATE.voices.find(x=>x.id===lockedVoiceId);
        alert(`Voice ${s+1} is locked because generation has already started for this character. Current locked voice: ${lockedVoice?lockedVoice.name:lockedVoiceId}`);
        STATE.project.voiceIds[s]=lockedVoiceId;
        updateDropdownButtons();
        updateModelDropdownState();
        updateReceipt();
        renderTimeline();
        return;
    }
    STATE.project.voiceIds[s]=id;
    const v=STATE.voices.find(x=>x.id===id),ni=s===0?dom.voiceName1:dom.voiceName2;
    if(v&&!ni.value.trim())ni.value=v.name.split(' ')[0];
    STATE.project.voiceNames=[dom.voiceName1.value,dom.voiceName2.value];
    const changed=syncChunkVoiceAssignments({pendingOnly:true,persistReason:'voice-reassign'});
    if(changed)LOG.add(`Updated ${changed} pending chunk voice assignment${changed===1?'':'s'} to match the current selected voices.`,'info');
    updateDropdownButtons();
    updateModelDropdownState();
    updateReceipt();
    renderTimeline()
}

function updateDropdownButtons(){[0,1].forEach(s=>{const v=STATE.voices.find(x=>x.id===STATE.project.voiceIds[s]),b=s===0?dom.voiceBtn1:dom.voiceBtn2;b.querySelector('span').innerText=v?v.name:"Select Voice...";b.classList.remove('voice-male','voice-female','voice-other');if(v)b.classList.add(getVoiceColorClassByVoice(v))})}
window.addEventListener('click',e=>{if(!dom.voiceDropdown.contains(e.target)&&!dom.voiceBtn1.contains(e.target)&&!dom.voiceBtn2.contains(e.target))dom.voiceDropdown.classList.remove('show')});
function sanitizeChunkSize(v){const p=parseInt(v,10);return isNaN(p)?1000:Math.min(Math.max(p,200),4000)}

function splitTextIntoChunks(txt,max){
    const res=[];let rem=txt.trim();
    while(rem.length>0){if(rem.length<=max){res.push(rem);break}
        const safe=Math.floor(max*0.75),area=rem.substring(safe,max);
        let split=safe,match,last=-1;
        const re = /[.!?\u201d"]+(?=\s|$)/g;
        while((match=re.exec(area))!==null)last=match.index+match[0].length;
        if(last!==-1)split+=last;else{const sp=rem.lastIndexOf(' ',max);split=(sp>max*0.3)?sp:(rem.lastIndexOf('\n',max)>max*0.3?rem.lastIndexOf('\n',max):max)}
        res.push(rem.slice(0,split).trim());rem=rem.slice(split).trimStart();
    }return res
}

dom.manuscript.addEventListener('input', () => {
    localStorage.setItem('ab_manuscript', dom.manuscript.value);
    updateReceipt();
    // Debounce log to avoid spamming while typing
    if(this._inputLogTimer) clearTimeout(this._inputLogTimer);
    this._inputLogTimer = setTimeout(() => {
        LOG.add(`Manuscript updated: ${dom.manuscript.value.length.toLocaleString()} characters.`);
    }, 1000);
});

document.getElementById('btn-analyze').addEventListener('click', () => {
    const raw = dom.manuscript.value;
    if(!raw.trim()) {
        LOG.add("Analysis aborted: Manuscript is empty.", "warning");
        return;
    }
    
    const startTime = performance.now();
    LOG.add(`Starting Analysis of ${raw.length.toLocaleString()} characters...`);

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
    LOG.add(`Chunk strategy: Max ${chunkLimit} chars per segment.`);
    
    // 1. Split Chapters (Improved Regex with Multi-Language Support)
    const chapterRegex = TextParser.getChapterHeadingRegex();
    
    // Split but keep delimiters
    const parts = raw.split(chapterRegex).filter(p => p.trim().length > 0);
    LOG.add(`Regex split found ${parts.length} text segments.`);
    
    let currentTitle = "Start";
    let preamble = "";
    
    // Check for preamble (text before first chapter)
    if(parts.length > 0 && !parts[0].match(chapterRegex)) {
        preamble = parts[0];
        LOG.add(`Detected Preamble/Prologue (${preamble.length} chars).`);
    }
    
    const isDual = STATE.project.mode === 'dual';
    let pendingHeader = "";

    const summary = [];
    const anomalies = [];

    const detectedDualCueNames = [];
    if (isDual) {
        parts.forEach(part => {
            const trimmed = String(part || '').trim();
            if (!trimmed || trimmed.match(chapterRegex)) return;
            const cue = TextParser.extractStandaloneVoiceCueLabel(trimmed);
            if (!cue) return;
            const cueNorm = TextParser.normalizeVoiceText(cue);
            if (cueNorm && !detectedDualCueNames.some(name => TextParser.normalizeVoiceText(name) === cueNorm)) {
                detectedDualCueNames.push(cue);
            }
        });

        if (detectedDualCueNames.length >= 2) {
            const voice1Norm = TextParser.normalizeVoiceText(dom.voiceName1.value);
            const voice2Norm = TextParser.normalizeVoiceText(dom.voiceName2.value);
            const cue1Norm = TextParser.normalizeVoiceText(detectedDualCueNames[0]);
            const cue2Norm = TextParser.normalizeVoiceText(detectedDualCueNames[1]);
            const voiceNamesLookLikeCharacterCues =
                (voice1Norm && voice1Norm === cue1Norm) ||
                (voice2Norm && voice2Norm === cue2Norm) ||
                (voice1Norm && voice1Norm === cue2Norm) ||
                (voice2Norm && voice2Norm === cue1Norm);

            if (!voiceNamesLookLikeCharacterCues) {
                dom.voiceName1.value = detectedDualCueNames[0];
                dom.voiceName2.value = detectedDualCueNames[1];
                STATE.project.voiceNames = [dom.voiceName1.value, dom.voiceName2.value];
                LOG.add(`Detected dual POV cues: Voice 1 → ${detectedDualCueNames[0]}, Voice 2 → ${detectedDualCueNames[1]}.`, 'success');
            }
        }
    }

    // Iterate
    let chapterCounter = 0;
    for(let i=0; i<parts.length; i++) {
        const p = parts[i];
        const pClean = p.trim();
        
        if(pClean.match(chapterRegex)) {
            // Found a header
            currentTitle = pClean.replace(/^[#\s]+/, '').trim();
            chapterCounter++;
            
            const detectedNum = ChapterVerifier.parse(currentTitle);
            if (detectedNum !== null && detectedNum !== chapterCounter) {
                const msg = `Mismatch: Chapter ${chapterCounter} titled "${currentTitle}" (Parsed: ${detectedNum})`;
                anomalies.push(msg);
            }
            
            // Format header for audio
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
                 const startVoice = TextParser.detectStartingVoice(fullText, currentTitle, STATE.project.voiceNames);
                 const startName = STATE.project.voiceNames[startVoice] || (startVoice === 0 ? "Voice 1" : "Voice 2");
                 
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
                     chunks: chapterChunks,
                     collapsed: true
                 });
                 
                 summary.push({
                     index: chapterCounter,
                     title: finalChapterTitle,
                     chunks: chapterChunks.length,
                     voiceSwitches: segments.length - 1
                 });
             }
        }
    }

    const lockResult = enforceGeneratedVoiceLocks({ persistReason: 'post-analyze-voice-lock' });
    if (lockResult.changed) LOG.add(`Preserved ${lockResult.changed} locked generated voice selection${lockResult.changed===1?'':'s'} after analysis.`, 'info');
    const reassigned = syncChunkVoiceAssignments({ pendingOnly: true, persistReason: 'post-analyze-voice-sync' });
    if (reassigned) LOG.add(`Rebound ${reassigned} pending chunk voice assignment${reassigned===1?'':'s'} to the current project voices after analysis.`, 'info');

    // --- METADATA & SUMMARY ---
    const meta = TextParser.detectProjectMetadata(raw, preamble);
    STATE.projectMeta = {
        title: meta.title || 'Untitled',
        author: meta.author || 'Unknown',
        series: meta.series || '',
        seriesVolume: meta.seriesVolume || '',
        displayTitle: meta.displayTitle || TextParser.formatProjectTitle(meta),
        language: meta.language || 'English'
    };
    const projectTitleInput = document.getElementById('project-title-input');
    if (projectTitleInput) projectTitleInput.placeholder = STATE.projectMeta.displayTitle || 'Project Name (optional)';
    LOG.add(`Metadata detected: "${STATE.projectMeta.displayTitle}" (${meta.language})`);
    
    // Generate Deterministic Project ID
    const safeTitle = (STATE.projectMeta.displayTitle || meta.title || 'untitled').toLowerCase().replace(/[^a-z0-9]/g, '');
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
    resetAutoSaveTracker(false);

    const modelId = dom.elModel.value; 
    const creditMultiplier = TextParser.getModelCreditMultiplier(modelId);
    
    const costPerCharBase = 0.000165; 

    const totalChars = STATE.chapters.reduce((acc, ch) => acc + ch.chunks.reduce((c, ck) => c + ck.text.length, 0), 0);
    const estCost = totalChars * creditMultiplier * costPerCharBase;

    // Update UI Summary
    document.getElementById('project-summary').style.display = 'block';
    document.getElementById('sum-title').innerText = (STATE.projectMeta.title || '-').substring(0,24);
    document.getElementById('sum-series').innerText = TextParser.formatSeriesLabel(STATE.projectMeta).substring(0,32);
    document.getElementById('sum-author').innerText = meta.author.substring(0,24);
    document.getElementById('sum-lang').innerText = STATE.projectMeta.language;
    
    const hasTitles = STATE.chapters.length > 0 && STATE.chapters[0].title === "Titles";
    const actualChapterCount = hasTitles ? STATE.chapters.length - 1 : STATE.chapters.length;
    const label = hasTitles ? `${actualChapterCount} (+Titles)` : `${actualChapterCount}`;
    
    document.getElementById('sum-chapters').innerText = label;
    document.getElementById('sum-chars').innerText = totalChars.toLocaleString();
    document.getElementById('sum-cost').innerText = `$${estCost.toFixed(2)}`;
    document.getElementById('sum-model').innerText = dom.elModel.options[dom.elModel.selectedIndex].text;

    // Render Timeline via helper
    renderTimeline();

    const endTime = performance.now();
    
    if (anomalies.length > 0) {
        LOG.add(`⚠️ Found ${anomalies.length} potential issues:`, 'warning');
        anomalies.forEach(a => LOG.add(`   - ${a}`, 'warning'));
    }
    
    console.table(summary);
    LOG.add(`Analysis Complete in ${(endTime - startTime).toFixed(2)}ms. Processed ${summary.length} chapters.`);

    if(!STATE.chapters.length) {
        dom.timeline.innerHTML = `<div style="padding:20px; text-align:center; color: var(--text-dim); font-style:italic;">
            Unable to detect chapters. Ensure your manuscript uses headings (e.g. "Chapter 1", "# Title").
        </div>`;
    }
    
    const hasChunks = STATE.chapters.some(ch => ch.chunks.length > 0);
    dom.btnGenerate.disabled = !hasChunks;
    dom.btnGenerateTimeline.disabled = !hasChunks;
    if(dom.btnRebuildBook) dom.btnRebuildBook.disabled = !hasChunks;
    dom.btnGenerate.innerText = "2. Generate Audio";
    updateReceipt();
});

async function initiateGeneration(){
    if(!STATE.project.voiceIds[0]){alert("Select Voice 1");return}
    dom.btnGenerate.innerText="Checking...";dom.btnGenerate.disabled=true;
    dom.btnGenerateTimeline.innerText="Checking...";dom.btnGenerateTimeline.disabled=true;
    if(dom.btnRebuildBook){dom.btnRebuildBook.disabled=true;dom.btnRebuildBook.innerText="Checking...";}
    const st=await checkProjectCache();
    dom.btnGenerate.innerText="2. Generate Audio";dom.btnGenerate.disabled=false;
    dom.btnGenerateTimeline.innerText="⚡ Generate All";dom.btnGenerateTimeline.disabled=false;
    if(dom.btnRebuildBook){dom.btnRebuildBook.disabled=false;dom.btnRebuildBook.innerText="🔁 Rebuild Book";}
    if(!st)return;
    if(st.missingCount===0){
        document.getElementById('safety-message').innerText="All segments cached. Merge chapters & book?";
    } else {
        document.getElementById('safety-message').innerText="Generate full book?";
    }
    attachDefaultConfirmListener();openSafetyModal();
}

function getChunkFileName(chunk){
    if(chunk.filename) return chunk.filename;
    if(typeof chunk.audioUrl === 'string' && chunk.audioUrl.includes('/output/chunks/')){
        const raw = chunk.audioUrl.split('/').pop() || '';
        return raw.split('?')[0];
    }
    return null;
}

async function rebuildBookFromExistingAudio(){
    if(!STATE.chapters.length){alert("No chapters loaded.");return}
    if(!confirm("Rebuild chapter files and full book from existing chunk audio only?")) return;

    dom.btnGenerate.disabled = true; dom.btnGenerate.innerText = "Rebuilding...";
    dom.btnGenerateTimeline.disabled = true; dom.btnGenerateTimeline.innerText = "Rebuilding...";
    if(dom.btnRebuildBook){dom.btnRebuildBook.disabled = true; dom.btnRebuildBook.innerText = "Rebuilding...";}

    try{
        await ensureAutoSaveSeed();
        const silenceChunk = parseFloat(dom.silenceChunk.value) || 0;
        const silenceChapter = parseFloat(dom.silenceChapter.value) || 0;
        let rebuiltChapters = 0;
        const skipped = [];

        for(let i=0;i<STATE.chapters.length;i++){
            const ch = STATE.chapters[i];
            const files = (ch.chunks||[]).map(getChunkFileName).filter(Boolean);
            if(files.length !== (ch.chunks||[]).length){
                skipped.push(`${ch.title} (${files.length}/${(ch.chunks||[]).length} chunks ready)`);
                continue;
            }
            try{
                const r = await APIService.mergeChapter(STATE.project.id,i,files,ch.title==="Titles",silenceChunk);
                ch.audioUrl = r.url;
                rebuiltChapters++;
                queueAutoSave(`chapter-rebuild-${i+1}`);
            }catch(e){
                skipped.push(`${ch.title} (merge failed: ${e.message})`);
            }
        }

        if(rebuiltChapters===0){
            throw new Error("No chapters were rebuilt. Generate missing chunks first.");
        }

        const res = await APIService.mergeBook(STATE.project.id, silenceChapter);
        queueAutoSave('book-rebuild');
        renderTimeline();
        LOG.add(`Book rebuilt from existing audio (${rebuiltChapters} chapters). Output: ${res.url}`,'success');

        if(skipped.length){
            LOG.add(`Skipped ${skipped.length} chapters during rebuild.`,'warning');
            skipped.slice(0,5).forEach(s=>LOG.add(` - ${s}`,'warning'));
            if(skipped.length>5) LOG.add(` - ...and ${skipped.length-5} more`,'warning');
        }
    }catch(e){
        LOG.add(`Rebuild failed: ${e.message}`,'error');
    }finally{
        dom.btnGenerate.disabled = false; dom.btnGenerate.innerText = "2. Generate Audio";
        dom.btnGenerateTimeline.disabled = false; dom.btnGenerateTimeline.innerText = "⚡ Generate All";
        if(dom.btnRebuildBook){dom.btnRebuildBook.disabled = false; dom.btnRebuildBook.innerText = "🔁 Rebuild Book";}
    }
}

dom.btnSaveText.addEventListener('click', () => {
    if(!STATE.editingChunkId) return;
    const newText = dom.manuscript.value;
    let found = false;
    
    // Find and update chunk
    STATE.chapters.some(ch => {
        const chunk = ch.chunks.find(c => c.id === STATE.editingChunkId);
        if(chunk) {
            chunk.text = newText;
            chunk.status = 'pending'; // Reset status to force attention
            chunk.audioUrl = null; // Clear old audio
            found = true;
            return true;
        }
    });

    if(found) {
        LOG.add("Text updated. Please regenerate the segment.", "success");
        renderTimeline();
    } else {
        LOG.add("Error: Could not find segment to update.", "error");
    }
});

dom.btnGenerate.addEventListener('click',initiateGeneration);
dom.btnGenerateTimeline.addEventListener('click',initiateGeneration);
if(dom.btnRebuildBook) dom.btnRebuildBook.addEventListener('click',rebuildBookFromExistingAudio);

async function startFullBookGeneration(){
    closeSafetyModal();STATE.halt=false;
    dom.btnGenerate.disabled=true;dom.btnGenerate.innerText="Generating...";
    dom.btnGenerateTimeline.disabled=true;dom.btnGenerateTimeline.innerText="Generating...";
    if(dom.btnRebuildBook){dom.btnRebuildBook.disabled=true;dom.btnRebuildBook.innerText="Generating...";}
    document.getElementById('btn-halt').style.display='inline-block';
    await ensureAutoSaveSeed();
    
    const silenceChunk = parseFloat(dom.silenceChunk.value) || 0;
    const forceMerge = dom.forceMerge.checked;

    for(let i=0;i<STATE.chapters.length;i++){
        if(STATE.halt)break;const ch=STATE.chapters[i];let files=[],ok=0;
        for(let j=0;j<ch.chunks.length;j++){
            if(STATE.halt)break;const ck=ch.chunks[j];
            if(ck.status==='done'&&ck.audioUrl){ok++;files.push(ck.filename||ck.audioUrl.split('/').pop());continue}
            if(await processChunkGeneration(ck,i,j)){ok++;if(ck.filename)files.push(ck.filename)}
        }
        // Merge if all chunks ok OR if Force Merge is on (and we have at least one file)
        if(!STATE.halt && (ok===ch.chunks.length || (forceMerge && files.length > 0)) && files.length){
            try{
                const r=await APIService.mergeChapter(STATE.project.id,i,files,ch.title==="Titles",silenceChunk);
                ch.audioUrl=r.url;queueAutoSave(`chapter-merge-${i+1}`);renderTimeline();
            }catch(e){LOG.add(e.message,'error')}
        }
    }

    if(!STATE.halt){
        try{
            dom.btnGenerate.innerText="Merging Book...";
            const silenceChapter=parseFloat(dom.silenceChapter.value)||0;
            const res=await APIService.mergeBook(STATE.project.id, silenceChapter);
            LOG.add(`Full Book Generated! <a href="${res.url}" target="_blank" style="color:#fff;text-decoration:underline">Download</a>`,'success');
        }catch(e){LOG.add("Book Merge failed: "+e.message,'error')}
    }

    dom.btnGenerate.disabled=false;dom.btnGenerate.innerText="2. Generate Audio";
    dom.btnGenerateTimeline.disabled=false;dom.btnGenerateTimeline.innerText="⚡ Generate All";
    if(dom.btnRebuildBook){dom.btnRebuildBook.disabled=false;dom.btnRebuildBook.innerText="🔁 Rebuild Book";}
    document.getElementById('btn-halt').style.display='none';renderTimeline();
}

dom.btnPlay.addEventListener('click',async()=>{if(STATE.isPlaying){engine.stop();return}
    STATE.isPlaying=true;engine.updateBtn(true);dom.masterProgress.value=0;
    const q=STATE.chapters.flatMap(c=>c.chunks),tot=q.length;
    for(let i=0;i<tot;i++){
        if(!STATE.isPlaying)break;const c=q[i];STATE.activePlaybackId=`chunk_${c.id}`;renderTimeline();dom.masterProgress.value=((i+1)/tot)*100;
        document.getElementById(`chunk-${c.id}`)?.scrollIntoView({behavior:'smooth',block:'center'});
        try{await engine.playChunk(c)}catch(e){}
    }
    engine.stop();dom.masterProgress.value=100;
});

function updateReceipt(){
    let est=0,raw=dom.manuscript.value.length,mul=TextParser.getModelCreditMultiplier(dom.elModel.value);
    if(STATE.chapters.length)STATE.chapters.forEach(c=>c.chunks.forEach(k=>{const v=STATE.voices.find(x=>x.id==(k.voiceId||STATE.project.voiceIds[0]));if(v&&v.type==='premium')est+=k.text.length}));else est=raw;
    dom.receipt.innerText=`$${STATE.sessionCost.toFixed(2)} / $${(est*mul*0.000165).toFixed(2)}`;
}

function updateModelDropdownState(){const v1=STATE.voices.find(v=>v.id===STATE.project.voiceIds[0]),v2=STATE.project.mode==='dual'?STATE.voices.find(v=>v.id===STATE.project.voiceIds[1]):null;const p=(v1&&v1.type==='premium')||(v2&&v2.type==='premium');dom.elModel.disabled=!p;dom.elModel.style.opacity=p?'1':'0.5'}

function createProjectFromSettings() {
    if(!confirm("Create new empty project with current settings? Unsaved text will be lost.")) return;
    
    // 1. Reset Content
    STATE.chapters = [];
    dom.manuscript.value = "";
    localStorage.removeItem('ab_manuscript'); // Clear autosave for text
    
    // 2. Generate New ID & Reset Meta
    STATE.project.id = 'proj_' + Date.now().toString(36);
    resetAutoSaveTracker(false);
    STATE.projectMeta = { title: 'Untitled', author: 'Unknown', series: '', seriesVolume: '', displayTitle: 'Untitled', language: 'English' };
    STATE.project.customTitle = "";
    STATE.project.notes = "";
    dom.projectNotes.value = "";
    
    // 3. Keep Settings (Voices, Model, Tokens are already in DOM/STATE, so we leave them)
    // Just ensure UI reflects "New" state
    document.getElementById('project-title-input').value = "";
    document.getElementById('project-title-input').placeholder = "Project Name (optional)";
    document.getElementById('sum-title').innerText = "-";
    document.getElementById('sum-series').innerText = "-";
    document.getElementById('sum-author').innerText = "-";
    document.getElementById('sum-lang').innerText = "-";
    document.getElementById('sum-chapters').innerText = "0";
    document.getElementById('sum-chars').innerText = "0";
    document.getElementById('sum-cost').innerText = "$0.00";
    document.getElementById('project-summary').style.display = 'none';
    
    // 4. Finalize
    renderTimeline();
    updateReceipt();
    closeProjectModal();
    
    // Disable generation buttons
    dom.btnGenerate.disabled = true;
    dom.btnGenerateTimeline.disabled = true;
    if(dom.btnRebuildBook) dom.btnRebuildBook.disabled = true;
    
    LOG.add("Created new blank project with preserved settings.", "success");
}

async function saveCurrentProject(){
    if(!STATE.chapters.length&&!dom.manuscript.value.trim()){alert("Empty");return}
    try{
        const payload=buildProjectPayload();
        const r=await APIService.req('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        if(r.id)STATE.project.id=r.id;
        AUTO_SAVE.hasSavedSnapshot=true;
        const titleInput=document.getElementById('project-title-input');
        if(titleInput){
            titleInput.value='';
            titleInput.placeholder=payload.displayTitle||payload.title||'Project Name (optional)';
        }
        if(document.getElementById('project-modal').classList.contains('show')) openProjectModal();
        LOG.add(`Saved project: ${payload.displayTitle||payload.title}`,'success');
    }catch(e){alert("Save failed: "+e.message)}
}

async function openProjectModal(){
    document.getElementById('project-modal').classList.add('show');const lst=document.getElementById('project-list');lst.innerHTML='Loading...';
    const titleInput=document.getElementById('project-title-input');
    if(titleInput && !titleInput.value.trim()) titleInput.placeholder=STATE.projectMeta.displayTitle||TextParser.formatProjectTitle(STATE.projectMeta)||'Project Name (optional)';
    try{
        const p=await APIService.req('/api/projects');
        lst.innerHTML=p.length?p.map(x=>`
            <div class="project-item" oncontextmenu="showProjectContextMenu(event, '${x.id}', '${x.title.replace(/'/g, "\\'")}')">
                <div style="flex:1" onclick="loadProject('${x.id}')">
                    <strong>${x.title||'Unt'}</strong>
                    <br><small style="color:var(--text-dim)">${x.author} • ${new Date(x.updatedAt).toLocaleDateString()}</small>
                </div>
                <div class="project-actions">
                    <button class="sm-btn" onclick="loadProject('${x.id}')">Load</button>
                    ${x.type!=='ghost' ? `
                        <button class="sm-btn" onclick="renameProject('${x.id}', '${x.title.replace(/'/g, "\\'")}', event)" title="Rename Project">✏️</button>
                    ` : ''}
                </div>
            </div>`).join(''):'<div style="padding:20px;text-align:center;color:var(--text-dim)">No saved projects found.</div>';
    }catch(e){lst.innerHTML='Error loading projects'}
}

async function renameProject(id, oldTitle, e){
    if(e) e.stopPropagation();
    const newTitle = prompt("Enter new project name:", oldTitle);
    if(newTitle && newTitle.trim() !== "" && newTitle !== oldTitle) {
        try {
            await APIService.renameProject(id, newTitle.trim());
            openProjectModal(); // Refresh list
            LOG.add('Project renamed', 'success');
        } catch(err) {
            alert("Rename failed: " + err.message);
        }
    }
}

async function deleteProject(id, e){
    if(e) e.stopPropagation();
    if(!confirm("Are you sure you want to delete this project? This cannot be undone.")) return;
    try {
        await APIService.deleteProject(id);
        openProjectModal(); // Refresh list
        LOG.add('Project deleted', 'success');
    } catch(err) {
        alert("Delete failed: " + err.message);
    }
}

function closeProjectModal(){document.getElementById('project-modal').classList.remove('show')}
function openHelpModal(){document.getElementById('help-modal').classList.add('show')}
function closeHelpModal(){document.getElementById('help-modal').classList.remove('show')}

async function loadProject(id){
    if(!confirm("Load? Unsaved lost."))return;
    try{
        const d=await APIService.req(`/api/projects/${id}`);
        STATE.project=d.projectSettings||STATE.project;STATE.chapters=d.chapters||[];dom.manuscript.value=d.manuscript||"";
        STATE.projectMeta={
            title:d.baseTitle||d.title||'Untitled',
            author:d.author||'Unknown',
            series:d.series||'',
            seriesVolume:d.seriesVolume||'',
            displayTitle:d.displayTitle||d.title||'Untitled',
            language:d.language||'English'
        };
        resetAutoSaveTracker(Boolean(d.updatedAt));
        
        // Restore UI Elements
        dom.projectMode.value = STATE.project.mode;
        dom.voiceName1.value = STATE.project.voiceNames ? STATE.project.voiceNames[0] : "";
        dom.voiceName2.value = STATE.project.voiceNames ? STATE.project.voiceNames[1] : "";
        if(STATE.project.token) dom.voiceToken.value = STATE.project.token;
        if(STATE.project.modelId) dom.elModel.value = STATE.project.modelId;
        dom.silenceChunk.value = STATE.project.silenceChunk !== undefined ? STATE.project.silenceChunk : 0.0;
        dom.silenceChapter.value = STATE.project.silenceChapter !== undefined ? STATE.project.silenceChapter : 1.0;
        dom.projectNotes.value = STATE.project.notes || '';
        const projectTitleInput = document.getElementById('project-title-input');
        if (projectTitleInput) {
            projectTitleInput.value = '';
            projectTitleInput.placeholder = STATE.projectMeta.displayTitle || 'Project Name (optional)';
        }
        const lockResult = enforceGeneratedVoiceLocks({ persistReason: 'load-project-voice-lock' });
        if (lockResult.changed) {
            LOG.add(`Restored ${lockResult.changed} locked voice selection${lockResult.changed===1?'':'s'} from previously generated chunks.`, 'info');
        }
        const syncedPendingVoices = syncChunkVoiceAssignments({ pendingOnly: true, persistReason: 'load-project-voice-sync' });
        if (syncedPendingVoices) {
            LOG.add(`Updated ${syncedPendingVoices} pending chunk voice assignment${syncedPendingVoices===1?'':'s'} to match the current saved voice selection.`, 'info');
        }

        // Collapse all chapters by default
        STATE.chapters.forEach(ch => {
            ch.collapsed = true;
        });

        // Refresh State
        updateDropdownButtons();
        updateModelDropdownState();
        toggleDualMode();
        renderTimeline();
        const hasChunks = STATE.chapters.some(ch => ch.chunks.length > 0);
        dom.btnGenerate.disabled = !hasChunks;
        dom.btnGenerateTimeline.disabled = !hasChunks;
        if(dom.btnRebuildBook) dom.btnRebuildBook.disabled = !hasChunks;
        updateReceipt();
        document.getElementById('project-summary').style.display = 'block';
        document.getElementById('sum-title').innerText = (STATE.projectMeta.title || '-').substring(0,24);
        document.getElementById('sum-series').innerText = TextParser.formatSeriesLabel(STATE.projectMeta).substring(0,32);
        document.getElementById('sum-author').innerText = (STATE.projectMeta.author || '-').substring(0,24);
        document.getElementById('sum-lang').innerText = STATE.projectMeta.language || '-';
        const totalChars = STATE.chapters.reduce((acc, ch) => acc + (ch.chunks || []).reduce((sum, ck) => sum + (ck.text || '').length, 0), 0);
        const hasTitles = STATE.chapters.length > 0 && STATE.chapters[0].title === "Titles";
        const actualChapterCount = hasTitles ? STATE.chapters.length - 1 : STATE.chapters.length;
        document.getElementById('sum-chapters').innerText = hasTitles ? `${actualChapterCount} (+Titles)` : `${actualChapterCount}`;
        document.getElementById('sum-chars').innerText = totalChars.toLocaleString();
        document.getElementById('sum-cost').innerText = `$${(totalChars * TextParser.getModelCreditMultiplier(dom.elModel.value) * 0.000165).toFixed(2)}`;
        document.getElementById('sum-model').innerText = dom.elModel.options[dom.elModel.selectedIndex].text;
        closeProjectModal();
        LOG.add('Loaded','success');
    }catch(e){console.error(e);alert("Load failed")}
}

// --- Context Menu & Safe Delete Logic ---
let ctxMenuTarget = null;
let pendingDeleteId = null;

function showProjectContextMenu(e, id, title){
    e.preventDefault();
    ctxMenuTarget = { id, title };
    const menu = document.getElementById('context-menu');
    // Adjust position to stay on screen
    const x = Math.min(e.clientX, window.innerWidth - 160);
    const y = Math.min(e.clientY, window.innerHeight - 150);
    menu.style.top = `${y}px`;
    menu.style.left = `${x}px`;
    menu.classList.add('show');
}

function hideContextMenu(){
    document.getElementById('context-menu').classList.remove('show');
    // Don't null target immediately if clicking menu item
}

window.addEventListener('click', () => {
    document.getElementById('context-menu').classList.remove('show');
});

// Bind Context Menu Actions
document.getElementById('ctx-open').onclick = () => { if(ctxMenuTarget) loadProject(ctxMenuTarget.id); };
document.getElementById('ctx-rename').onclick = () => { if(ctxMenuTarget) renameProject(ctxMenuTarget.id, ctxMenuTarget.title); };
document.getElementById('ctx-delete').onclick = () => { if(ctxMenuTarget) initDeleteProcess(ctxMenuTarget.id, ctxMenuTarget.title); };

function initDeleteProcess(id, title){
    pendingDeleteId = id;
    document.getElementById('del-project-name').innerText = title;
    document.getElementById('delete-confirm-input').value = '';
    document.getElementById('btn-final-delete').disabled = true;
    document.getElementById('delete-confirm-modal').classList.add('show');
}

function closeDeleteModal(){
    document.getElementById('delete-confirm-modal').classList.remove('show');
    pendingDeleteId = null;
}

document.getElementById('delete-confirm-input').addEventListener('input', (e)=>{
    const val = e.target.value.trim().toLowerCase();
    const btn = document.getElementById('btn-final-delete');
    if(val === 'delete') {
        btn.disabled = false;
    } else {
        btn.disabled = true;
    }
});

document.getElementById('btn-final-delete').onclick = async () => {
    if(!pendingDeleteId) return;
    const btn = document.getElementById('btn-final-delete');
    btn.innerText = "Deleting...";
    try {
        await APIService.deleteProject(pendingDeleteId);
        LOG.add('Project deleted', 'success');
        closeDeleteModal();
        openProjectModal(); // Refresh list
    } catch(e) {
        alert("Delete failed: " + e.message);
    } finally {
        btn.innerText = "Delete Forever";
    }
};

init();
