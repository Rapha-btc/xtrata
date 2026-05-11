(function () {
  'use strict';

  const APP_BOOK_VERSION = '2.3';
  const CLONED_MODEL_ID = 'qwen3-tts-vc-2026-01-22';
  const BOOK_API = {
    projects: '/api/projects',
    checkCache: '/api/check-cache',
    generateChunk: '/api/generate-chunk',
    mergeChapter: '/api/merge-chapter',
    mergeBook: '/api/merge-book',
    zipBook: '/api/book-zip'
  };

  const LANG_CONFIG = [
    ['en', 'English', ['Chapter']],
    ['de', 'German', ['Kapitel']],
    ['es', 'Spanish', ['Capitulo', 'Capítulo']],
    ['fr', 'French', ['Chapitre']],
    ['it', 'Italian', ['Capitolo']],
    ['pt', 'Portuguese', ['Capitulo', 'Capítulo']],
    ['nl', 'Dutch', ['Hoofdstuk']],
    ['pl', 'Polish', ['Rozdzial', 'Rozdział']],
    ['ru', 'Russian', ['Глава']],
    ['tr', 'Turkish', ['Bolum', 'Bölüm']],
    ['fi', 'Finnish', ['Luku']],
    ['hu', 'Hungarian', ['Fejezet']],
    ['cs', 'Czech', ['Kapitola']],
    ['el', 'Greek', ['Κεφάλαιο']],
    ['id', 'Indonesian', ['Bab']],
    ['unk', 'Unknown', ['Part', 'Parte', 'Partie', 'Teil']]
  ];

  const logEntries = [];
  const bookState = {
    projectId: '',
    title: 'Untitled Book',
    series: '',
    seriesVolume: '',
    author: 'Unknown Author',
    language: 'English',
    settings: null,
    manuscript: '',
    chapters: [],
    roles: [],
    characters: [],
    anomalies: [],
    outputs: { wav: '', mp3: '', zip: '' },
    generating: false,
    cancelRequested: false
  };

  let savedVoicesCache = [];
  const bookPlayback = {
    audio: null,
    activeType: '',
    activeId: '',
    chapterIndex: -1
  };

  if (typeof PRICING !== 'undefined' && !PRICING[CLONED_MODEL_ID]) {
    PRICING[CLONED_MODEL_ID] = { rate: 0.115 / 10000, label: '$0.115/10K chars' };
  }
  if (typeof freeUsed !== 'undefined' && freeUsed[CLONED_MODEL_ID] === undefined) {
    freeUsed[CLONED_MODEL_ID] = 0;
  }
  try {
    if (typeof syncFreeUsed === 'function') syncFreeUsed();
    if (typeof updatePricingNote === 'function') updatePricingNote();
  } catch (_) {}

  if (typeof renderSavedVoices === 'function') {
    const originalRenderSavedVoices = renderSavedVoices;
    renderSavedVoices = function patchedRenderSavedVoices(voices) {
      savedVoicesCache = Array.isArray(voices) ? voices.slice() : [];
      return originalRenderSavedVoices(voices);
    };
  }

  function nowTime() {
    return new Date().toLocaleTimeString();
  }

  function addLog(message, level) {
    const entry = {
      time: nowTime(),
      level: level || 'info',
      message: String(message || '')
    };
    logEntries.unshift(entry);
    if (logEntries.length > 300) logEntries.length = 300;
    renderLog();
    if (entry.level === 'error') console.error(entry.message);
    else if (entry.level === 'warn') console.warn(entry.message);
    else console.log(entry.message);
  }

  window.renderLog = function renderLog() {
    const panel = document.getElementById('logPanel');
    const filter = document.getElementById('logFilter') ? document.getElementById('logFilter').value : 'all';
    if (!panel) return;
    const visible = logEntries.filter((entry) => filter === 'all' || entry.level === filter);
    if (!visible.length) {
      panel.innerHTML = '<div class="log-empty">No events yet.</div>';
      return;
    }
    panel.innerHTML = visible.map((entry) => {
      const safe = escapeHtml(entry.message).replace(/\n/g, '<br>');
      return '<div class="log-entry log-' + entry.level + '"><span style="opacity:0.75">[' + entry.time + ']</span> ' + safe + '</div>';
    }).join('');
  };

  window.clearLog = function clearLog() {
    logEntries.length = 0;
    renderLog();
  };

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function slugify(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'book';
  }

  function normalizeNewlines(value) {
    return String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  function sanitizeChunkSize(value) {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed)) return 1000;
    return Math.min(Math.max(parsed, 200), 4000);
  }

  function sanitizeSilence(value, max) {
    const parsed = parseFloat(value);
    if (Number.isNaN(parsed)) return 0;
    return Math.min(Math.max(parsed, 0), max);
  }

  function normalizeRoleLabel(value) {
    return String(value || '')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function normalizeLoose(value) {
    return normalizeRoleLabel(value)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[’'`]/g, '')
      .toLowerCase();
  }

  const CHARACTER_DIALOGUE_VERBS = [
    'said', 'asked', 'replied', 'whispered', 'shouted', 'cried', 'called', 'answered',
    'murmured', 'snapped', 'laughed', 'sighed', 'added', 'continued', 'ordered',
    'insisted', 'warned', 'told', 'thought', 'wondered', 'screamed', 'hissed',
    'breathed', 'groaned', 'muttered', 'yelled', 'observed', 'remarked', 'announced',
    'promised', 'pleaded', 'admitted', 'grinned', 'smiled', 'snarled', 'sobbed',
    'began', 'agreed', 'nodded', 'called out'
  ];
  const CHARACTER_HONORIFICS = [
    'Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Professor', 'Sir', 'Lady', 'Lord', 'Captain',
    'Detective', 'Agent', 'King', 'Queen', 'Prince', 'Princess', 'Father', 'Mother',
    'Aunt', 'Uncle', 'Saint', 'St'
  ];
  const CHARACTER_STOP_WORDS = new Set([
    'book', 'books', 'chapter', 'chapters', 'part', 'parts', 'prologue', 'epilogue',
    'narrator', 'narration', 'voice', 'voices', 'title', 'titles', 'scene', 'act',
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
    'september', 'october', 'november', 'december', 'yes', 'no', 'hello', 'goodbye',
    'then', 'there', 'later', 'after', 'before', 'suddenly', 'finally', 'perhaps',
    'meanwhile', 'morning', 'evening', 'night', 'today', 'tomorrow', 'yesterday',
    'what', 'when', 'where', 'why', 'how', 'this', 'that', 'these', 'those',
    'his', 'her', 'their', 'our', 'your', 'my',
    'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles',
    'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'ce', 'cet', 'cette', 'ces',
    'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'notre', 'nos',
    'votre', 'vos', 'leur', 'leurs', 'et', 'mais', 'ou', 'donc', 'or', 'ni', 'car',
    'oui', 'non', 'merci', 'tout', 'tous', 'toute', 'toutes', 'si', 'ah', 'oh',
    'alors', 'cest', 'cetait', 'jetais', 'javais', 'jai', 'questce', 'tes', 'tas'
  ].map(normalizeLoose));

  function sentenceSplit(text) {
    const matches = String(text || '').match(/[^.!?\n]+(?:[.!?]+["”'’)]*)?|[^.!?\n]+$/g);
    return (matches || [text]).map((part) => part.trim()).filter(Boolean);
  }

  function splitTextIntoChunks(text, maxChars) {
    const normalized = normalizeNewlines(text).trim();
    if (!normalized) return [];
    const paragraphs = normalized.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    const chunks = [];
    let current = '';

    function pushCurrent() {
      const trimmed = current.trim();
      if (trimmed) chunks.push(trimmed);
      current = '';
    }

    function appendPiece(piece) {
      const trimmed = piece.trim();
      if (!trimmed) return;
      if (!current) {
        current = trimmed;
        return;
      }
      const candidate = current + '\n\n' + trimmed;
      if (candidate.length <= maxChars) {
        current = candidate;
      } else {
        pushCurrent();
        current = trimmed;
      }
    }

    function splitParagraph(paragraph) {
      if (paragraph.length <= maxChars) {
        appendPiece(paragraph);
        return;
      }
      const sentences = sentenceSplit(paragraph);
      let sentenceGroup = '';
      sentences.forEach((sentence) => {
        if (!sentenceGroup) {
          if (sentence.length <= maxChars) {
            sentenceGroup = sentence;
          } else {
            let remaining = sentence;
            while (remaining.length > maxChars) {
              const safe = Math.floor(maxChars * 0.75);
              const region = remaining.slice(safe, maxChars);
              const punctMatch = region.match(/[,:;](?=\s|$)/g);
              let splitAt = maxChars;
              if (punctMatch && punctMatch.length) {
                const lastChar = punctMatch[punctMatch.length - 1];
                splitAt = safe + region.lastIndexOf(lastChar) + 1;
              } else {
                const lastSpace = remaining.lastIndexOf(' ', maxChars);
                if (lastSpace > Math.floor(maxChars * 0.4)) splitAt = lastSpace;
              }
              appendPiece(remaining.slice(0, splitAt));
              remaining = remaining.slice(splitAt).trim();
            }
            sentenceGroup = remaining;
          }
          return;
        }
        const candidate = sentenceGroup + ' ' + sentence;
        if (candidate.length <= maxChars) {
          sentenceGroup = candidate;
        } else {
          appendPiece(sentenceGroup);
          sentenceGroup = sentence;
        }
      });
      appendPiece(sentenceGroup);
    }

    paragraphs.forEach(splitParagraph);
    pushCurrent();
    return chunks;
  }

  function getChapterHeadingRegex() {
    const chapterKeywords = LANG_CONFIG
      .filter((entry) => entry[0] !== 'unk')
      .flatMap((entry) => entry[2])
      .sort((a, b) => b.length - a.length)
      .map(escapeRegex);
    const genericKeywords = (LANG_CONFIG.find((entry) => entry[0] === 'unk') || [null, null, []])[2]
      .sort((a, b) => b.length - a.length)
      .map(escapeRegex);
    const patterns = [
      '#{1,6}\\s+[^\\n#]+',
      '(?:Prologue|Epilogue)(?:\\s*[:\\-–—]\\s*[^\\n]+)?[\\.:]?',
      '(?:' + chapterKeywords.join('|') + ')(?:\\s+[^\\n]+)?[\\.:]?'
    ];
    if (genericKeywords.length) {
      patterns.push('(?:' + genericKeywords.join('|') + ')\\s+(?:\\d+|[IVXLCDMivxlcdm]+)(?:\\s*[:\\-–—]\\s*[^\\n]+)?[\\.:]?');
    }
    return new RegExp('(^\\s*(?:' + patterns.join('|') + ')\\s*$)', 'gmi');
  }

  function getChapterHeadingTestRegex() {
    const regex = getChapterHeadingRegex();
    return new RegExp(regex.source, regex.flags.replace(/g/g, ''));
  }

  function cleanChapterTitle(title, index) {
    const trimmed = normalizeRoleLabel(title.replace(/^[#\s]+/, '').replace(/[.:]+$/, ''));
    if (!trimmed) return index === 0 ? 'Titles' : 'Chapter ' + index;
    if (/^prologue$/i.test(trimmed)) return 'Prologue';
    if (/^epilogue$/i.test(trimmed)) return 'Epilogue';
    return trimmed;
  }

  const AUTHOR_PREFIXES = [
    'by', 'author', 'written by',
    'de', 'par', 'écrit par', 'écrite par', 'auteur',
    'por', 'escrito por', 'autora', 'autor',
    'von', 'geschrieben von',
    'di', 'scritto da',
    'door', 'geschreven door',
    'przez', 'napisal', 'napisał'
  ].sort((a, b) => b.length - a.length);

  const VOLUME_PREFIXES = [
    'book', 'livre', 'volume', 'vol', 'tome', 'part', 'partie', 'libro', 'livro', 'buch', 'band'
  ].sort((a, b) => b.length - a.length);

  function cleanMetadataLine(value) {
    return normalizeRoleLabel(String(value || '').replace(/^[\s"'“”‘’]+/, '').replace(/[\s"'“”‘’]+$/, '').replace(/[.。:;]+$/, ''));
  }

  function stripAuthorPrefix(line) {
    const clean = normalizeRoleLabel(line);
    for (const prefix of AUTHOR_PREFIXES) {
      const match = clean.match(new RegExp('^' + escapeRegex(prefix) + '[\\s:.-]+(.+)$', 'i'));
      if (match) return cleanMetadataLine(match[1]);
    }
    return '';
  }

  function isVolumeLine(line) {
    const clean = cleanMetadataLine(line);
    if (!clean) return false;
    const prefixGroup = VOLUME_PREFIXES.map(escapeRegex).join('|');
    return new RegExp('^(?:' + prefixGroup + ')(?:\\s+|\\s*[#:.-]\\s*)(?:\\d+|[IVXLCDMivxlcdm]+)\\b', 'i').test(clean);
  }

  function looksLikeSeriesLine(line) {
    const clean = cleanMetadataLine(line);
    if (!clean) return false;
    if (isVolumeLine(clean)) return false;
    if (stripAuthorPrefix(clean)) return false;
    if (clean.length > 90) return false;
    const words = clean.split(/\s+/).filter(Boolean);
    if (!words.length || words.length > 8) return false;
    return /[\p{L}]/u.test(clean);
  }

  function detectMetadata(manuscript, preamble) {
    const lines = normalizeNewlines(preamble || manuscript).split('\n').map((line) => line.trim()).filter(Boolean);
    let language = 'English';
    if (typeof guessLanguage === 'function') {
      language = guessLanguage(manuscript) || language;
    }

    const cleanedLines = lines.map(cleanMetadataLine).filter(Boolean);
    let title = cleanedLines[0] || 'Untitled Book';
    let series = '';
    let seriesVolume = '';
    let author = 'Unknown Author';

    const authorCandidate = cleanedLines.map((line) => stripAuthorPrefix(line)).find(Boolean);
    if (authorCandidate) author = authorCandidate;

    const nonAuthorLines = cleanedLines.filter((line) => !stripAuthorPrefix(line));
    if (nonAuthorLines.length) title = nonAuthorLines[0];

    const remaining = nonAuthorLines.slice(1);
    const volumeLine = remaining.find((line) => isVolumeLine(line));
    if (volumeLine) seriesVolume = volumeLine;

    const seriesCandidate = remaining.find((line) => line !== seriesVolume && looksLikeSeriesLine(line));
    if (seriesCandidate) series = seriesCandidate;

    if (author === 'Unknown Author') {
      const fallbackAuthorLine = cleanedLines.slice().reverse().find((line) => line !== title && line !== series && line !== seriesVolume && line.split(/\s+/).length <= 5);
      if (fallbackAuthorLine) author = fallbackAuthorLine;
    }

    return { title, series, seriesVolume, author, language };
  }

  function buildRoleId(label) {
    return 'role_' + slugify(label);
  }

  function resolveMarkerRole(rawRole) {
    const compact = normalizeLoose(rawRole).replace(/\s+/g, '');
    if (compact === 'voice1' || compact === 'v1' || compact === '1') return 'Voice 1';
    if (compact === 'voice2' || compact === 'v2' || compact === '2') return 'Voice 2';
    return normalizeRoleLabel(rawRole) || 'Narrator';
  }

  function looksLikeSpeakerLabel(label) {
    const normalized = normalizeRoleLabel(label);
    if (!normalized) return false;
    if (normalized.length > 40) return false;
    if (/^(chapter|part|prologue|epilogue)\b/i.test(normalized)) return false;
    const words = normalized.split(/\s+/);
    if (words.length > 5) return false;
    return /^[A-Z][A-Za-z0-9'’ .-]*$/.test(normalized);
  }

  function parseDualPovSegments(text, delimiter) {
    let currentRole = 'Voice 1';
    let working = normalizeNewlines(text).trim();
    const explicitStart = working.match(/^\s*\[\[\s*(voice\s*[12]|v[12]|[12])\s*\]\]\s*/i);
    if (explicitStart) {
      currentRole = resolveMarkerRole(explicitStart[1]);
      working = working.replace(/^\s*\[\[\s*(voice\s*[12]|v[12]|[12])\s*\]\]\s*/i, '');
    }
    const token = normalizeRoleLabel(delimiter) || '* * *';
    const splitRegex = new RegExp('\\n\\s*' + escapeRegex(token) + '\\s*\\n', 'g');
    const parts = working.split(splitRegex).map((part) => part.trim()).filter(Boolean);
    const segments = [];
    parts.forEach((part) => {
      segments.push({ roleLabel: currentRole, text: part, sourceType: 'dialogue' });
      currentRole = currentRole === 'Voice 1' ? 'Voice 2' : 'Voice 1';
    });
    return segments.length ? segments : [{ roleLabel: 'Voice 1', text: working, sourceType: 'narration' }];
  }

  function parseMarkedParagraphSegments(text) {
    const paragraphs = normalizeNewlines(text).split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    const segments = [];
    let currentRole = 'Narrator';
    paragraphs.forEach((paragraph) => {
      let content = paragraph;
      let sourceType = 'narration';
      const markerMatch = content.match(/^\[\[\s*([^\]]+?)\s*\]\]\s*([\s\S]*)$/);
      if (markerMatch) {
        currentRole = resolveMarkerRole(markerMatch[1]);
        content = markerMatch[2].trim();
        sourceType = currentRole === 'Narrator' ? 'narration' : 'dialogue';
      } else {
        const colonMatch = content.match(/^([A-Z][A-Za-z0-9'’ .-]{1,40}):\s*([\s\S]+)$/);
        if (colonMatch && looksLikeSpeakerLabel(colonMatch[1])) {
          currentRole = normalizeRoleLabel(colonMatch[1]);
          content = colonMatch[2].trim();
          sourceType = 'dialogue';
        }
      }
      if (!content) return;
      segments.push({ roleLabel: currentRole, text: content, sourceType });
    });
    return segments.length ? segments : [{ roleLabel: 'Narrator', text: normalizeNewlines(text).trim(), sourceType: 'narration' }];
  }

  function parseScriptSegments(text) {
    const lines = normalizeNewlines(text).split('\n');
    const segments = [];
    let currentRole = 'Narrator';
    let buffer = [];

    function flushBuffer() {
      const content = buffer.join(' ').replace(/\s+/g, ' ').trim();
      if (content) {
        segments.push({
          roleLabel: currentRole,
          text: content,
          sourceType: currentRole === 'Narrator' ? 'narration' : 'dialogue'
        });
      }
      buffer = [];
    }

    function isScriptSpeakerLine(line) {
      const clean = normalizeRoleLabel(line);
      if (!clean || clean.length > 40) return false;
      if (clean.split(/\s+/).length > 5) return false;
      return /^[A-Z0-9][A-Z0-9'’ .-]+$/.test(clean) && clean === clean.toUpperCase();
    }

    lines.forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) {
        flushBuffer();
        currentRole = 'Narrator';
        return;
      }

      const markerMatch = line.match(/^\[\[\s*([^\]]+?)\s*\]\]\s*([\s\S]*)$/);
      if (markerMatch) {
        flushBuffer();
        currentRole = resolveMarkerRole(markerMatch[1]);
        if (markerMatch[2].trim()) buffer.push(markerMatch[2].trim());
        return;
      }

      const colonMatch = line.match(/^([A-Z][A-Za-z0-9'’ .-]{1,40}):\s*(.+)$/);
      if (colonMatch && looksLikeSpeakerLabel(colonMatch[1])) {
        flushBuffer();
        currentRole = normalizeRoleLabel(colonMatch[1]);
        buffer.push(colonMatch[2].trim());
        return;
      }

      if (isScriptSpeakerLine(line)) {
        flushBuffer();
        currentRole = normalizeRoleLabel(line);
        return;
      }

      buffer.push(line);
    });
    flushBuffer();
    return segments.length ? segments : [{ roleLabel: 'Narrator', text: normalizeNewlines(text).trim(), sourceType: 'narration' }];
  }

  function parseChapterSegments(text, mode, delimiter) {
    if (mode === 'dual_pov') return parseDualPovSegments(text, delimiter);
    if (mode === 'script') return parseScriptSegments(text);
    return parseMarkedParagraphSegments(text);
  }

  function isGenericRoleLabel(label) {
    const normalized = normalizeLoose(label);
    return normalized === 'narrator' || normalized === 'voice 1' || normalized === 'voice 2' || normalized === 'voice1' || normalized === 'voice2';
  }

  function formatDisplayName(label) {
    const trimmed = normalizeRoleLabel(label);
    if (!trimmed) return '';
    if (trimmed === trimmed.toUpperCase()) {
      return trimmed.split(/\s+/).map((word) => word.charAt(0) + word.slice(1).toLowerCase()).join(' ');
    }
    return trimmed;
  }

  function normalizeCharacterCandidate(label) {
    return formatDisplayName(
      String(label || '')
        .replace(/^[^\p{L}\p{N}]+/gu, '')
        .replace(/[^\p{L}\p{N}.'’ -]+$/gu, '')
    );
  }

  function stripHonorific(label) {
    return normalizeRoleLabel(String(label || '').replace(new RegExp('^(?:' + CHARACTER_HONORIFICS.map(escapeRegex).join('|') + ')\\.?\\s+', 'i'), ''));
  }

  function isValidCharacterCandidate(label) {
    const clean = normalizeCharacterCandidate(label);
    if (!clean) return false;
    if (clean.length > 48) return false;
    if (isGenericRoleLabel(clean)) return false;
    if (/^(chapter|part|prologue|epilogue|scene|act|book|titles?)\b/i.test(clean)) return false;
    const words = clean.split(/\s+/).filter(Boolean);
    if (!words.length || words.length > 3) return false;
    if (CHARACTER_STOP_WORDS.has(normalizeLoose(clean))) return false;
    if (words.every((word) => /^[IVXLCDM]+$/i.test(word))) return false;
    return words.every((word) => {
      const bare = word.replace(/[.'’-]+$/g, '');
      if (!bare) return false;
      if (CHARACTER_HONORIFICS.some((title) => normalizeLoose(title) === normalizeLoose(bare))) return true;
      return /^[\p{Lu}\d][\p{L}\p{N}'’.-]*$/u.test(bare);
    });
  }

  function getCharacterMatchPhrases(label) {
    const phrases = [];
    const push = (value) => {
      const normalized = normalizeLoose(value);
      if (normalized && !phrases.includes(normalized)) phrases.push(normalized);
    };
    push(label);
    push(stripHonorific(label));
    return phrases.sort((a, b) => b.length - a.length);
  }

  function bumpCharacterCandidate(map, rawLabel, weight, chapterIndex, source) {
    const label = normalizeCharacterCandidate(rawLabel);
    if (!isValidCharacterCandidate(label)) return;
    const phrases = getCharacterMatchPhrases(label);
    let entry = null;
    phrases.some((phrase) => {
      if (map.has(phrase)) {
        entry = map.get(phrase);
        return true;
      }
      return false;
    });
    if (!entry) {
      entry = {
        id: 'char_' + slugify(label),
        label,
        score: 0,
        hits: 0,
        chapters: new Set(),
        sources: new Set(),
        matchPhrases: phrases.slice()
      };
      entry.matchPhrases.forEach((phrase) => map.set(phrase, entry));
    }
    if (label.length > entry.label.length) entry.label = label;
    entry.score += weight;
    entry.hits += 1;
    entry.chapters.add(chapterIndex);
    entry.sources.add(source);
  }

  function extractDetectedCharacters(chapters) {
    const candidateMap = new Map();
    const honorificPattern = '(?:' + CHARACTER_HONORIFICS.map(escapeRegex).join('|') + ')\\.?' ;
    const baseNamePattern = '(?:' + honorificPattern + '\\s+)?[\\p{Lu}][\\p{L}\'’.-]+(?:\\s+[\\p{Lu}][\\p{L}\'’.-]+){0,2}';
    const escapedVerbs = CHARACTER_DIALOGUE_VERBS.map((verb) => verb.trim().split(/\s+/).map(escapeRegex).join('\\s+'));
    const verbPattern = '(?:' + escapedVerbs.join('|') + ')';
    const forwardPattern = new RegExp('\\b(' + baseNamePattern + ')\\s+' + verbPattern + '\\b', 'gu');
    const backwardPattern = new RegExp('\\b' + verbPattern + '\\s+(' + baseNamePattern + ')\\b', 'gu');
    const properNamePattern = new RegExp('\\b(' + baseNamePattern + ')\\b', 'gu');

    chapters.forEach((chapter, chapterIndex) => {
      const chapterText = chapter.chunks.map((chunk) => chunk.text).join('\n\n');

      chapter.chunks.forEach((chunk) => {
        if (!isGenericRoleLabel(chunk.roleLabel)) {
          bumpCharacterCandidate(candidateMap, chunk.roleLabel, 4, chapterIndex, 'role');
        }
      });

      Array.from(chapterText.matchAll(forwardPattern)).forEach((match) => {
        bumpCharacterCandidate(candidateMap, match[1], 2.5, chapterIndex, 'attribution');
      });
      Array.from(chapterText.matchAll(backwardPattern)).forEach((match) => {
        bumpCharacterCandidate(candidateMap, match[1], 2.5, chapterIndex, 'attribution');
      });
      Array.from(chapterText.matchAll(properNamePattern)).forEach((match) => {
        bumpCharacterCandidate(candidateMap, match[1], 0.35, chapterIndex, 'mention');
      });
    });

    return Array.from(new Set(candidateMap.values()))
      .filter((entry) => {
        if (entry.sources.has('role')) return true;
        const label = entry.label;
        const wordCount = label.split(/\s+/).filter(Boolean).length;
        const hasHonorific = normalizeLoose(stripHonorific(label)) !== normalizeLoose(label);
        const hasAttribution = entry.sources.has('attribution');
        if (hasHonorific || wordCount > 1) return hasAttribution || entry.score >= 2 || entry.hits >= 2;
        return hasAttribution;
      })
      .sort((a, b) => (b.score - a.score) || (b.hits - a.hits) || a.label.localeCompare(b.label))
      .slice(0, 40)
      .map((entry) => ({
        id: entry.id,
        label: entry.label,
        score: Number(entry.score.toFixed(2)),
        mentions: entry.hits,
        chapterCount: entry.chapters.size,
        matchPhrases: entry.matchPhrases.slice()
      }));
  }

  function countPhraseMentions(text, phrase) {
    if (!phrase) return 0;
    const regex = new RegExp('(?:^| )' + escapeRegex(phrase) + '(?=$| )', 'g');
    return (text.match(regex) || []).length;
  }

  function annotateCharacterMentions(chapters, characters) {
    const activeCharacters = Array.isArray(characters) ? characters.slice(0, 40) : [];
    chapters.forEach((chapter) => {
      const chapterCounts = new Map();
      chapter.chunks.forEach((chunk) => {
        const mentions = [];
        const normalizedText = normalizeLoose(chunk.text);

        activeCharacters.forEach((character) => {
          const count = Math.max.apply(null, character.matchPhrases.map((phrase) => countPhraseMentions(normalizedText, phrase)).concat(0));
          if (count > 0) {
            mentions.push({ label: character.label, count });
            chapterCounts.set(character.label, (chapterCounts.get(character.label) || 0) + count);
          }
        });

        if (!isGenericRoleLabel(chunk.roleLabel)) {
          const explicit = mentions.find((entry) => normalizeLoose(entry.label) === normalizeLoose(chunk.roleLabel));
          if (explicit) explicit.count += 1000;
          else mentions.push({ label: chunk.roleLabel, count: 1000 });
          chapterCounts.set(chunk.roleLabel, (chapterCounts.get(chunk.roleLabel) || 0) + 1000);
        }

        mentions.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
        chunk.detectedCharacters = mentions.slice(0, 3).map((entry) => entry.label);
        chunk.primaryCharacter = chunk.detectedCharacters[0] || '';
      });

      chapter.characters = Array.from(chapterCounts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 5)
        .map((entry) => entry[0]);
    });
  }

  function getAllChapterKeywords() {
    return LANG_CONFIG.flatMap((entry) => entry[2] || []).filter(Boolean).sort((a, b) => b.length - a.length);
  }

  function extractDualPovNameFromChapterTitle(title) {
    const clean = normalizeRoleLabel(String(title || '').replace(/^[#\s]+/, '').replace(/[.:]+$/, ''));
    if (!clean) return '';
    const fragments = clean.split(/[:|–—-]+/).map((part) => normalizeRoleLabel(part)).filter(Boolean);
    const candidates = [];
    if (fragments.length > 1) candidates.push(fragments[fragments.length - 1]);

    const chapterKeywords = getAllChapterKeywords().map(escapeRegex).join('|');
    if (chapterKeywords) {
      const stripped = clean.replace(new RegExp('^(?:' + chapterKeywords + ')\\s+[^:|–—-]+(?:\\s*[:|–—-]\\s*)?', 'i'), '').trim();
      if (stripped) candidates.push(stripped);
    }

    candidates.push(clean);

    for (const candidate of candidates) {
      const normalized = normalizeCharacterCandidate(candidate);
      if (isValidCharacterCandidate(normalized)) return normalized;
    }
    return '';
  }

  function extractDualPovNameFromCue(text) {
    const lines = normalizeNewlines(text).split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 3);
    for (const line of lines) {
      const directMatch = line.match(/^([A-ZÀ-ÖØ-Ý][\p{L}'’.-]{1,24}(?:\s+[A-ZÀ-ÖØ-Ý][\p{L}'’.-]{1,24}){0,1})(?:\s*[:.\-–—]\s*|\s*$)/u);
      if (directMatch) {
        const candidate = normalizeCharacterCandidate(directMatch[1]);
        if (isValidCharacterCandidate(candidate)) return candidate;
      }
    }
    return '';
  }

  function collectDualPovRoleNames(chapters) {
    const names = [];
    const seen = new Set();
    const narrativeChapters = (chapters || []).filter((chapter) => chapter.kind !== 'titles');

    function push(rawName) {
      const name = normalizeCharacterCandidate(rawName);
      if (!name || !isValidCharacterCandidate(name)) return;
      const key = normalizeLoose(name);
      if (seen.has(key)) return;
      seen.add(key);
      names.push(name);
    }

    narrativeChapters.forEach((chapter) => {
      push(extractDualPovNameFromChapterTitle(chapter.title));
      if (names.length >= 2) return;
      const firstBySegment = new Map();
      chapter.chunks.forEach((chunk) => {
        if (!firstBySegment.has(chunk.segmentIndex)) firstBySegment.set(chunk.segmentIndex, chunk);
      });
      Array.from(firstBySegment.values()).forEach((chunk) => {
        if (names.length < 2) push(extractDualPovNameFromCue(chunk.text));
      });
    });

    return names.slice(0, 2);
  }

  function detectDualPovStartIndex(chapter, roleNames, lastStartIndex) {
    const titleName = extractDualPovNameFromChapterTitle(chapter.title);
    if (titleName) {
      const titleIndex = roleNames.findIndex((name) => normalizeLoose(name) === normalizeLoose(titleName));
      if (titleIndex !== -1) return titleIndex;
    }

    const firstSegment = chapter.chunks.find((chunk) => chunk.segmentIndex === 0);
    if (firstSegment) {
      const cueName = extractDualPovNameFromCue(firstSegment.text);
      if (cueName) {
        const cueIndex = roleNames.findIndex((name) => normalizeLoose(name) === normalizeLoose(cueName));
        if (cueIndex !== -1) return cueIndex;
      }
    }

    return lastStartIndex || 0;
  }

  function applyDualPovRoleNames(chapters, roleNames) {
    if (!Array.isArray(roleNames) || !roleNames.length) return;
    let lastStartIndex = 0;
    chapters.forEach((chapter) => {
      const startIndex = detectDualPovStartIndex(chapter, roleNames, lastStartIndex);
      lastStartIndex = startIndex;
      chapter.chunks.forEach((chunk) => {
        const resolvedName = roleNames[(startIndex + chunk.segmentIndex) % roleNames.length] || roleNames[0];
        chunk.roleLabel = resolvedName;
        chunk.roleId = buildRoleId(resolvedName);
      });
      chapter.characters = roleNames.filter((name) => chapter.chunks.some((chunk) => normalizeLoose(chunk.roleLabel) === normalizeLoose(name)));
    });
  }

  function buildDualPovCharacterList(chapters, roleNames) {
    return roleNames.map((name) => {
      const matchingChapters = chapters.filter((chapter) => chapter.chunks.some((chunk) => normalizeLoose(chunk.roleLabel) === normalizeLoose(name)));
      return {
        id: 'char_' + slugify(name),
        label: name,
        score: matchingChapters.length,
        mentions: matchingChapters.reduce((sum, chapter) => sum + chapter.chunks.filter((chunk) => normalizeLoose(chunk.roleLabel) === normalizeLoose(name)).length, 0),
        chapterCount: matchingChapters.length,
        matchPhrases: getCharacterMatchPhrases(name)
      };
    });
  }

  function defaultVoiceForRole(roleLabel, roleIndex) {
    const normalizedRole = normalizeLoose(roleLabel);
    if (typeof selectedVoice !== 'undefined' && selectedVoice && normalizedRole === 'narrator') return selectedVoice;
    const voiceMatch = VOICES.find((voice) => normalizeLoose(voice.id) === normalizedRole);
    if (voiceMatch) return voiceMatch.id;
    const clones = savedVoicesCache || [];
    const cloneMatch = clones.find((voice) => normalizeLoose(voice.preferred_name || voice.voice) === normalizedRole);
    if (cloneMatch) return cloneMatch.voice;
    const fallback = VOICES[(roleIndex + 1) % VOICES.length];
    return fallback ? fallback.id : 'Cherry';
  }

  function buildRoleInventory(chapters) {
    const roleMap = new Map();
    chapters.forEach((chapter) => {
      chapter.chunks.forEach((chunk) => {
        const key = chunk.roleId;
        if (!roleMap.has(key)) {
          roleMap.set(key, {
            id: chunk.roleId,
            label: chunk.roleLabel,
            chunkCount: 0,
            charCount: 0,
            voiceId: ''
          });
        }
        const role = roleMap.get(key);
        role.chunkCount += 1;
        role.charCount += chunk.text.length;
      });
    });
    return Array.from(roleMap.values()).map((role, index) => {
      role.voiceId = defaultVoiceForRole(role.label, index);
      return role;
    });
  }

  function getNarrativeChapterCount(chapters) {
    return (chapters || []).filter((chapter) => chapter.kind !== 'titles').length;
  }

  function buildChapters(manuscript, settings) {
    const text = normalizeNewlines(manuscript).trim();
    if (!text) return { chapters: [], anomalies: [], preamble: '' };

    const chapterSplitRegex = getChapterHeadingRegex();
    const chapterTestRegex = getChapterHeadingTestRegex();
    const parts = text.split(chapterSplitRegex).filter((part) => part.trim().length > 0);
    const chapters = [];
    const anomalies = [];
    let preamble = '';
    let currentHeading = '';
    let chapterCounter = 0;

    function createChapter(title, content, isTitle) {
      const spokenHeader = isTitle ? '' : title;
      const fullText = spokenHeader ? spokenHeader + '\n\n' + content.trim() : content.trim();
      const segments = parseChapterSegments(fullText, settings.mode, settings.delimiter);
      const chunks = [];
      let chunkIndex = 0;
      segments.forEach((segment, segmentIndex) => {
        splitTextIntoChunks(segment.text, settings.chunkMaxChars).forEach((chunkText) => {
          const roleLabel = normalizeRoleLabel(segment.roleLabel) || 'Narrator';
          chunks.push({
            id: 'bk_' + chapters.length + '_' + chunkIndex + '_' + Math.random().toString(36).slice(2, 8),
            chapterIndex: chapters.length,
            chunkIndex,
            segmentIndex,
            roleLabel,
            roleId: buildRoleId(roleLabel),
            sourceType: segment.sourceType || 'narration',
            text: chunkText,
            status: 'pending',
            filename: '',
            audioUrl: '',
            voiceId: '',
            charCount: chunkText.length,
            detectedCharacters: [],
            primaryCharacter: '',
            audioVersion: 0
          });
          chunkIndex += 1;
        });
      });
      chapters.push({
        index: chapters.length,
        title,
        kind: isTitle ? 'titles' : 'chapter',
        audioUrls: { wav: '', mp3: '' },
        chunks,
        collapsed: true,
        characters: []
      });
    }

    let contentStartIndex = 0;
    if (parts.length && !chapterTestRegex.test(parts[0].trim())) {
      preamble = parts[0];
      if (preamble.trim()) {
        createChapter('Titles', preamble, true);
      }
      contentStartIndex = 1;
    }

    if (!parts.some((part) => chapterTestRegex.test(part.trim()))) {
      chapters.length = 0;
      createChapter('Book', text, false);
      return { chapters, anomalies, preamble };
    }

    parts.slice(contentStartIndex).forEach((part) => {
      const trimmed = part.trim();
      if (!trimmed) return;
      if (chapterTestRegex.test(trimmed)) {
        chapterCounter += 1;
        currentHeading = cleanChapterTitle(trimmed, chapterCounter);
      } else {
        const title = currentHeading || (chapters.length === 0 ? 'Book' : 'Chapter ' + chapterCounter);
        createChapter(title, trimmed, false);
      }
    });

    if (!chapters.length) createChapter('Book', text, false);
    return { chapters, anomalies, preamble };
  }

  function getAvailableBookVoices() {
    const voices = [];
    const seen = new Set();
    VOICES.forEach((voice) => {
      voices.push({
        id: voice.id,
        label: voice.id + ' — Built-in',
        type: 'builtin'
      });
      seen.add(voice.id);
    });
    savedVoicesCache.forEach((voice) => {
      if (seen.has(voice.voice)) return;
      voices.push({
        id: voice.voice,
        label: (voice.preferred_name || voice.voice) + ' — Cloned',
        type: 'clone'
      });
      seen.add(voice.voice);
    });
    return voices;
  }

  function renderBookAssignments() {
    const container = document.getElementById('bookAssignRows');
    if (!container) return;
    const options = getAvailableBookVoices();
    container.innerHTML = bookState.roles.map((role) => {
      const selectOptions = options.map((voice) => {
        const selected = voice.id === role.voiceId ? ' selected' : '';
        return '<option value="' + escapeHtml(voice.id) + '"' + selected + '>' + escapeHtml(voice.label) + '</option>';
      }).join('');
      return '' +
        '<div class="book-assign-row">' +
          '<div style="flex:1;min-width:180px">' +
            '<div style="font-weight:700;color:var(--text)">' + escapeHtml(role.label) + '</div>' +
            '<div style="font-size:0.75rem;color:var(--muted)">' + role.chunkCount + ' chunks · ' + role.charCount.toLocaleString() + ' chars</div>' +
          '</div>' +
          '<select class="book-role-select" data-role-id="' + escapeHtml(role.id) + '" style="flex:1;min-width:220px" onchange="bookSetRoleVoice(this.dataset.roleId, this.value)">' +
            selectOptions +
          '</select>' +
        '</div>';
    }).join('');
  }

  window.bookSetRoleVoice = function bookSetRoleVoice(roleId, voiceId) {
    const role = bookState.roles.find((entry) => entry.id === roleId);
    if (!role) return;
    role.voiceId = voiceId;
    bookState.chapters.forEach((chapter) => {
      chapter.chunks.forEach((chunk) => {
        if (chunk.roleId === roleId) chunk.voiceId = voiceId;
      });
    });
    updateBookEstimate();
    addLog('Assigned "' + role.label + '" to voice ' + voiceId + '.', 'debug');
  };

  function renderBookSummary() {
    const summaryBox = document.getElementById('bookSummaryBox');
    const anomalyBox = document.getElementById('bookAnomalyBox');
    if (!summaryBox || !anomalyBox) return;
    const totalChunks = bookState.chapters.reduce((sum, chapter) => sum + chapter.chunks.length, 0);
    const totalChars = bookState.chapters.reduce((sum, chapter) => sum + chapter.chunks.reduce((inner, chunk) => inner + chunk.charCount, 0), 0);
    const chapterCount = getNarrativeChapterCount(bookState.chapters);
    summaryBox.innerHTML = '' +
      '<div class="sum-row">' +
        '<div class="sum-item"><span class="sum-label">Title</span><span class="sum-val">' + escapeHtml(bookState.title) + '</span></div>' +
        '<div class="sum-item"><span class="sum-label">Series</span><span class="sum-val">' + escapeHtml(bookState.series || '—') + '</span></div>' +
        '<div class="sum-item"><span class="sum-label">Volume</span><span class="sum-val">' + escapeHtml(bookState.seriesVolume || '—') + '</span></div>' +
        '<div class="sum-item"><span class="sum-label">Author</span><span class="sum-val">' + escapeHtml(bookState.author) + '</span></div>' +
        '<div class="sum-item"><span class="sum-label">Language</span><span class="sum-val">' + escapeHtml(bookState.language) + '</span></div>' +
      '</div>' +
      '<div class="sum-row">' +
        '<div class="sum-item"><span class="sum-label">Chapters</span><span class="sum-val">' + chapterCount + '</span></div>' +
        '<div class="sum-item"><span class="sum-label">Speaking Roles</span><span class="sum-val">' + bookState.roles.length + '</span></div>' +
        '<div class="sum-item"><span class="sum-label">Detected Characters</span><span class="sum-val">' + bookState.characters.length + '</span></div>' +
        '<div class="sum-item"><span class="sum-label">Chunks</span><span class="sum-val">' + totalChunks + '</span></div>' +
        '<div class="sum-item"><span class="sum-label">Characters</span><span class="sum-val">' + totalChars.toLocaleString() + '</span></div>' +
      '</div>';

    if (bookState.anomalies.length) {
      anomalyBox.style.display = 'block';
      anomalyBox.innerHTML = '<strong>Parser notes:</strong><br>' + bookState.anomalies.map(escapeHtml).join('<br>');
    } else {
      anomalyBox.style.display = 'none';
      anomalyBox.innerHTML = '';
    }
  }

  function renderBookCharacters() {
    const panel = document.getElementById('bookCharacterPanel');
    if (!panel) return;
    const mode = bookState.settings && bookState.settings.mode ? bookState.settings.mode : 'single';
    if (!bookState.characters.length) {
      panel.innerHTML = '' +
        '<div class="book-character-note">' + (mode === 'dual_pov'
          ? 'Dual POV mode could not resolve two clean names from chapter titles or separator cues. Use chapter headings like <code>Chapter 1: Piper</code> and optional cue lines like <code>Vincent.</code> after <code>* * *</code>.'
          : 'No confident character names were extracted. For named character automation, use <code>[[Role]]</code>, <code>Role:</code>, or script-style speaker labels.') + '</div>' +
        '<div class="book-character-empty">Detected names are heuristic in ordinary prose and are shown separately from speaking-role assignment.</div>';
      return;
    }
    const chips = bookState.characters.map((character) => {
      return '<span class="book-character-chip">' +
        '<span>' + escapeHtml(character.label) + '</span>' +
        '<span class="count">' + character.chapterCount + ' ch</span>' +
      '</span>';
    }).join('');
    panel.innerHTML = '' +
      '<div class="book-character-note">' + (mode === 'dual_pov'
        ? 'Dual POV mode uses chapter-title names and separator-start cues only, so the list stays constrained to the two structural POV names.'
        : 'These names were detected from the manuscript text. They are informational unless the manuscript explicitly marks speakers or uses script formatting.') + '</div>' +
      '<div class="book-character-grid">' + chips + '</div>';
  }

  function getChapterDoneCount(chapter) {
    return chapter.chunks.filter((chunk) => chunk.status === 'done').length;
  }

  function getChapterStatus(chapter) {
    if (chapter.chunks.some((chunk) => chunk.status === 'processing')) return 'generating';
    if (chapter.chunks.some((chunk) => chunk.status === 'error')) return 'error';
    if (chapter.chunks.length && chapter.chunks.every((chunk) => chunk.status === 'done')) return 'done';
    return 'pending';
  }

  function getRoleColorClass(label) {
    const normalized = normalizeLoose(label);
    if (normalized === 'narrator') return 'v0';
    if (normalized === 'voice 1' || normalized === 'voice1') return 'v1';
    if (normalized === 'voice 2' || normalized === 'voice2') return 'v2';
    const paletteIndex = slugify(label).length % 5;
    return ['v0', 'v1', 'v2', 'v3', 'v4'][paletteIndex];
  }

  function truncatePreview(text, maxChars) {
    const compact = normalizeNewlines(text).replace(/\s+/g, ' ').trim();
    if (compact.length <= maxChars) return compact;
    return compact.slice(0, Math.max(0, maxChars - 1)).trim() + '…';
  }

  function getChunkMetaText(chunk) {
    const parts = [];
    parts.push(chunk.sourceType === 'dialogue' ? 'Dialogue' : 'Narration');
    if (chunk.detectedCharacters.length) parts.push('Names: ' + chunk.detectedCharacters.join(', '));
    parts.push(chunk.charCount.toLocaleString() + ' chars');
    return parts.join(' · ');
  }

  function updateBookTreeStatus() {
    const target = document.getElementById('bookTreeStatus');
    if (!target) return;
    if (!bookState.chapters.length) {
      target.textContent = 'Analyse a manuscript to build the chapter browser.';
      return;
    }
    const chapterCount = getNarrativeChapterCount(bookState.chapters);
    const totalChunks = bookState.chapters.reduce((sum, chapter) => sum + chapter.chunks.length, 0);
    const doneChunks = bookState.chapters.reduce((sum, chapter) => sum + getChapterDoneCount(chapter), 0);
    target.textContent = chapterCount + ' chapters · ' + totalChunks + ' chunks · ' + doneChunks + ' generated';
  }

  function renderBookChapterList() {
    const list = document.getElementById('bookChapterList');
    if (!list) return;
    if (!bookState.chapters.length) {
      list.innerHTML = '<div class="book-empty-state">No chapters analysed yet.</div>';
      updateBookTreeStatus();
      return;
    }
    list.innerHTML = bookState.chapters.map((chapter, chapterIndex) => {
      const doneCount = getChapterDoneCount(chapter);
      const roleCount = new Set(chapter.chunks.map((chunk) => chunk.roleLabel)).size;
      const percent = chapter.chunks.length ? Math.round((doneCount / chapter.chunks.length) * 100) : 0;
      const status = getChapterStatus(chapter);
      const playingChapter = isChapterPlaying(chapterIndex);
      const chapterCharacters = chapter.characters && chapter.characters.length ? chapter.characters.slice(0, 4).map((character) => {
        return '<span class="book-mini-chip"><strong>' + escapeHtml(character) + '</strong></span>';
      }).join('') : '<span class="book-mini-chip">No strong names in this chapter</span>';
      const chunkHtml = chapter.collapsed ? '' : '<div class="book-segments">' + chapter.chunks.map((chunk, chunkIndex) => {
        const isChunkPlayingNow = isChunkPlaying(chunk);
        const rowClasses = ['book-seg-row', chunk.status];
        if (isChunkPlayingNow) rowClasses.push('active');
        const roleClass = getRoleColorClass(chunk.roleLabel);
        return '' +
          '<div class="' + rowClasses.join(' ') + '">' +
            '<div class="book-seg-num">' + (chunkIndex + 1) + '</div>' +
            '<div class="book-seg-voice ' + roleClass + '">' + escapeHtml(chunk.roleLabel) + '</div>' +
            '<div class="book-seg-body">' +
              '<div class="book-seg-text">' + escapeHtml(truncatePreview(chunk.text, 130)) + '</div>' +
              '<div class="book-seg-meta">' + escapeHtml(getChunkMetaText(chunk)) + '</div>' +
            '</div>' +
            '<div class="book-seg-status ' + chunk.status + '">' + escapeHtml(chunk.status) + '</div>' +
            '<div class="book-seg-actions">' +
              '<button class="book-seg-action-btn' + (isChunkPlayingNow ? ' playing' : '') + '"' +
                (chunk.audioUrl ? '' : ' disabled') +
                ' onclick="bookPlayChunk(' + chapterIndex + ',' + chunkIndex + ', event)">' + (isChunkPlayingNow ? '⏹' : '▶') + '</button>' +
              '<button class="book-seg-action-btn" onclick="bookRegenerateChunk(' + chapterIndex + ',' + chunkIndex + ', event)">↺</button>' +
            '</div>' +
          '</div>';
      }).join('') + '</div>';
      return '' +
        '<div class="book-chapter-card' + (playingChapter ? ' playing' : '') + '">' +
          '<div class="book-chapter-header" onclick="bookToggleChapter(' + chapterIndex + ', event)">' +
            '<div class="book-chapter-main">' +
              '<div class="book-chapter-toggle">' + (chapter.collapsed ? '+' : '−') + '</div>' +
              '<div class="book-chapter-main-text">' +
                '<div class="book-chapter-title">' + escapeHtml(chapter.title) + '</div>' +
                '<div class="book-chapter-meta">' +
                  '<span>' + chapter.chunks.length + ' chunks</span>' +
                  '<span>' + roleCount + ' roles</span>' +
                  '<span>' + percent + '% done</span>' +
                '</div>' +
                '<div class="book-chip-row">' + chapterCharacters + '</div>' +
              '</div>' +
            '</div>' +
            '<div class="book-chapter-actions">' +
              '<span class="book-chapter-status ' + status + '">' + escapeHtml(status) + '</span>' +
              '<button class="book-inline-btn' + (playingChapter ? ' playing' : '') + '"' +
                (chapter.audioUrls.wav ? '' : ' disabled') +
                ' onclick="bookPlayChapter(' + chapterIndex + ', event)">' + (playingChapter ? '⏹ Stop' : '▶ Play') + '</button>' +
              '<button class="book-inline-btn" onclick="bookGenerateChapter(' + chapterIndex + ', event)">' + (doneCount ? '⚡ Refresh' : '⚡ Generate') + '</button>' +
            '</div>' +
          '</div>' +
          chunkHtml +
        '</div>';
    }).join('');
    updateBookTreeStatus();
  }

  window.bookToggleChapter = function bookToggleChapter(chapterIndex, event) {
    if (event) event.stopPropagation();
    const chapter = bookState.chapters[chapterIndex];
    if (!chapter) return;
    chapter.collapsed = !chapter.collapsed;
    renderBookChapterList();
  };

  window.bookExpandAll = function bookExpandAll() {
    bookState.chapters.forEach((chapter) => { chapter.collapsed = false; });
    renderBookChapterList();
  };

  window.bookCollapseAll = function bookCollapseAll() {
    bookState.chapters.forEach((chapter) => { chapter.collapsed = true; });
    renderBookChapterList();
  };

  function getModelPricing(modelId) {
    if (typeof PRICING !== 'undefined' && PRICING[modelId]) return PRICING[modelId];
    return { rate: 0.10 / 10000, label: '$0.10/10K chars' };
  }

  function updateBookEstimate() {
    const modelId = document.getElementById('bookModelSelect') ? document.getElementById('bookModelSelect').value : 'qwen3-tts-flash';
    const pricing = getModelPricing(modelId);
    const totalChars = bookState.chapters.reduce((sum, chapter) => sum + chapter.chunks.reduce((inner, chunk) => inner + chunk.charCount, 0), 0);
    const totalSegments = bookState.chapters.reduce((sum, chapter) => sum + chapter.chunks.length, 0);
    const gross = totalChars * pricing.rate;
    const used = typeof freeUsed !== 'undefined' ? (freeUsed[modelId] || 0) : 0;
    const freeLeft = typeof FREE_QUOTA !== 'undefined' ? Math.max(0, FREE_QUOTA - used) : 0;
    const billable = Math.max(0, totalChars - freeLeft);
    const net = billable * pricing.rate;
    document.getElementById('bcTotalChars').textContent = totalChars.toLocaleString();
    document.getElementById('bcSegments').textContent = totalSegments.toLocaleString();
    document.getElementById('bcGross').textContent = '$' + gross.toFixed(4);
    document.getElementById('bcFreeLeft').textContent = freeLeft.toLocaleString();
    document.getElementById('bcNetCost').textContent = '$' + net.toFixed(4);

    const warning = document.getElementById('bookLargeWarn');
    if (!warning) return;
    const notices = [];
    if (totalChars > 250000) notices.push('Large manuscript: generation may take a while. The workflow will process and merge chapter by chapter.');
    if (totalSegments > 500) notices.push('High segment count: consider increasing the max chunk size if you want fewer generation calls.');
    if (modelId === CLONED_MODEL_ID && !savedVoicesCache.length) notices.push('Cloned-voice model selected, but no saved cloned voices are currently loaded.');
    if (notices.length) {
      warning.style.display = 'block';
      warning.innerHTML = notices.map(escapeHtml).join('<br>');
    } else {
      warning.style.display = 'none';
      warning.innerHTML = '';
    }
  }

  function collectBookSettings() {
    return {
      mode: document.getElementById('bookModeSelect').value,
      delimiter: document.getElementById('bookSepInput').value.trim() || '* * *',
      chunkMaxChars: sanitizeChunkSize(document.getElementById('bookChunkSize').value),
      model: document.getElementById('bookModelSelect').value,
      chunkSilence: sanitizeSilence(document.getElementById('bookChunkSilence').value, 5),
      chapterSilence: sanitizeSilence(document.getElementById('bookChapterSilence').value, 10)
    };
  }

  function buildBookProjectPayload() {
    return {
      id: bookState.projectId,
      title: bookState.title,
      series: bookState.series,
      seriesVolume: bookState.seriesVolume,
      author: bookState.author,
      language: bookState.language,
      manuscript: bookState.manuscript,
      updatedAt: new Date().toISOString(),
      projectSettings: bookState.settings,
      roles: bookState.roles,
      characters: bookState.characters,
      chapters: bookState.chapters,
      outputs: bookState.outputs
    };
  }

  async function postJson(url, payload) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || ('Request failed: ' + response.status));
    return data;
  }

  async function saveBookProject(reason) {
    if (!bookState.projectId) return null;
    try {
      const payload = buildBookProjectPayload();
      const result = await postJson(BOOK_API.projects, payload);
      addLog('Saved audiobook project (' + reason + ').', 'debug');
      return result;
    } catch (error) {
      addLog('Project save failed: ' + error.message, 'warn');
      return null;
    }
  }

  function triggerBrowserDownload(url) {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function ensureRoleAssignmentsValid(modelId) {
    const cloneIds = new Set(savedVoicesCache.map((voice) => voice.voice));
    for (const role of bookState.roles) {
      if (!role.voiceId) throw new Error('Role "' + role.label + '" is missing a voice assignment.');
      if (modelId === CLONED_MODEL_ID && !cloneIds.has(role.voiceId)) {
        throw new Error('Role "' + role.label + '" must use a cloned voice when the cloned-voice model is selected.');
      }
    }
  }

  function syncRoleVoiceAssignments() {
    const selects = document.querySelectorAll('.book-role-select');
    selects.forEach((select) => {
      const roleId = select.dataset.roleId;
      const role = bookState.roles.find((entry) => entry.id === roleId);
      if (role && select.value) role.voiceId = select.value;
    });
    bookState.chapters.forEach((chapter) => {
      chapter.chunks.forEach((chunk) => {
        const role = bookState.roles.find((entry) => entry.id === chunk.roleId);
        if (role) chunk.voiceId = role.voiceId;
      });
    });
  }

  function updateBookProgress(done, total, label) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    document.getElementById('bookGenLabel').textContent = label;
    document.getElementById('bookGenPct').textContent = pct + '%';
    document.getElementById('bookGenFill').style.width = pct + '%';
  }

  function cacheBustUrl(url, seed) {
    if (!url) return '';
    return url + (url.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(String(seed || Date.now()));
  }

  function invalidateBookOutputs() {
    bookState.outputs = { wav: '', mp3: '', zip: '' };
    const panel = document.getElementById('bookDlPanel');
    if (panel) panel.classList.remove('show');
  }

  function setBookOperationUi(active) {
    if (active) document.getElementById('bookGenPanel').classList.add('show');
    document.getElementById('bookCancelBtn').classList.toggle('show', !!active);
    document.getElementById('bookGenerateBtn').disabled = !!active || bookState.chapters.length === 0;
  }

  function clearPlaybackState() {
    bookPlayback.activeType = '';
    bookPlayback.activeId = '';
    bookPlayback.chapterIndex = -1;
  }

  function stopBookPlayback() {
    if (bookPlayback.audio) {
      bookPlayback.audio.pause();
      bookPlayback.audio.currentTime = 0;
      bookPlayback.audio = null;
    }
    clearPlaybackState();
    renderBookChapterList();
  }

  function isChunkPlaying(chunk) {
    return bookPlayback.activeType === 'chunk' && bookPlayback.activeId === chunk.id;
  }

  function isChapterPlaying(chapterIndex) {
    return bookPlayback.activeType === 'chapter' && bookPlayback.chapterIndex === chapterIndex;
  }

  function playBookUrl(url, meta) {
    return new Promise((resolve, reject) => {
      if (!url) {
        reject(new Error('Audio file is not available yet.'));
        return;
      }
      if (bookPlayback.audio) {
        bookPlayback.audio.pause();
        bookPlayback.audio.currentTime = 0;
      }
      const audio = new Audio(url);
      bookPlayback.audio = audio;
      bookPlayback.activeType = meta.type;
      bookPlayback.activeId = meta.id;
      bookPlayback.chapterIndex = meta.chapterIndex;
      renderBookChapterList();
      audio.onended = function onEnded() {
        if (bookPlayback.audio === audio) {
          bookPlayback.audio = null;
          clearPlaybackState();
          renderBookChapterList();
        }
        resolve();
      };
      audio.onerror = function onError() {
        if (bookPlayback.audio === audio) {
          bookPlayback.audio = null;
          clearPlaybackState();
          renderBookChapterList();
        }
        reject(new Error('Playback failed for ' + meta.label + '.'));
      };
      audio.play().catch((error) => {
        if (bookPlayback.audio === audio) {
          bookPlayback.audio = null;
          clearPlaybackState();
          renderBookChapterList();
        }
        reject(error);
      });
    });
  }

  function getGenerationContext() {
    const apiKey = document.getElementById('apiKey').value.trim();
    if (!apiKey) throw new Error('DashScope API key is missing.');
    if (!bookState.chapters.length) throw new Error('Analyse the manuscript first.');
    const modelId = document.getElementById('bookModelSelect').value;
    syncRoleVoiceAssignments();
    ensureRoleAssignmentsValid(modelId);
    return { apiKey, modelId };
  }

  function markChunkGenerated(chunk, result, forceRegenerated) {
    chunk.status = 'done';
    chunk.filename = result.filename;
    chunk.audioVersion = (chunk.audioVersion || 0) + 1;
    chunk.audioUrl = cacheBustUrl(result.url, (forceRegenerated ? 'regen_' : 'gen_') + chunk.audioVersion + '_' + Date.now());
  }

  async function generateBookChunk(chunk, modelId, apiKey, force) {
    const payload = {
      text: chunk.text,
      voiceId: chunk.voiceId,
      apiKey,
      modelId,
      projectId: bookState.projectId,
      chapterIndex: chunk.chapterIndex,
      chunkIndex: chunk.chunkIndex,
      language: bookState.language,
      instructions: '',
      force: !!force
    };
    return postJson(BOOK_API.generateChunk, payload);
  }

  async function mergeGeneratedChapter(chapterIndex) {
    const chapter = bookState.chapters[chapterIndex];
    if (!chapter) return null;
    const filenames = chapter.chunks.map((chunk) => chunk.filename).filter(Boolean);
    if (filenames.length !== chapter.chunks.length) {
      chapter.audioUrls.wav = '';
      chapter.audioUrls.mp3 = '';
      return null;
    }
    const merged = await postJson(BOOK_API.mergeChapter, {
      projectId: bookState.projectId,
      chapterIndex,
      filenames,
      isTitle: chapter.kind === 'titles',
      silence: sanitizeSilence(document.getElementById('bookChunkSilence').value, 5),
      format: 'wav'
    });
    chapter.audioUrls.wav = cacheBustUrl(merged.url, 'chapter_' + chapterIndex + '_' + Date.now());
    chapter.audioUrls.mp3 = '';
    return merged;
  }

  async function generateChapterChunks(chapterIndex, context, options) {
    const chapter = bookState.chapters[chapterIndex];
    if (!chapter) throw new Error('Chapter not found.');
    const onlyChunkIndex = options && Number.isInteger(options.onlyChunkIndex) ? options.onlyChunkIndex : null;
    const force = !!(options && options.force);
    const progress = options && options.progress ? options.progress : null;
    const indices = onlyChunkIndex === null ? chapter.chunks.map((_, index) => index) : [onlyChunkIndex];

    for (let i = 0; i < indices.length; i += 1) {
      if (bookState.cancelRequested) break;
      const chunkIndex = indices[i];
      const chunk = chapter.chunks[chunkIndex];
      const currentDone = progress ? progress.done : i;
      const total = progress ? progress.total : indices.length;
      updateBookProgress(currentDone, total, 'Generating ' + chapter.title + ' · chunk ' + (chunkIndex + 1) + ' of ' + chapter.chunks.length + '...');
      chunk.status = 'processing';
      renderBookChapterList();
      try {
        const result = await generateBookChunk(chunk, context.modelId, context.apiKey, force && (onlyChunkIndex === null || onlyChunkIndex === chunkIndex));
        markChunkGenerated(chunk, result, force);
        if (progress) progress.done += 1;
        renderBookChapterList();
      } catch (error) {
        chunk.status = 'error';
        renderBookChapterList();
        throw new Error('Chunk ' + (chunkIndex + 1) + ' failed in ' + chapter.title + ': ' + error.message);
      }
    }

    if (bookState.cancelRequested) return false;
    if (onlyChunkIndex === null || chapter.chunks.every((chunk) => chunk.status === 'done' && chunk.filename)) {
      await mergeGeneratedChapter(chapterIndex);
    }
    renderBookChapterList();
    return true;
  }

  window.bookAnalyse = async function bookAnalyse() {
    const raw = document.getElementById('bookText').value.trim();
    const statusEl = document.getElementById('bookAnalyseStatus');
    const analysisPanel = document.getElementById('bookAnalysisPanel');
    const dlPanel = document.getElementById('bookDlPanel');
    if (!raw) {
      statusEl.textContent = 'Paste a manuscript first.';
      addLog('Book analysis aborted: manuscript is empty.', 'warn');
      return;
    }

    const settings = collectBookSettings();
    stopBookPlayback();
    bookState.projectId = 'book_' + slugify(raw.split('\n')[0].slice(0, 48)) + '_' + Date.now().toString(36);
    bookState.manuscript = normalizeNewlines(raw);
    bookState.settings = settings;
    bookState.outputs = { wav: '', mp3: '', zip: '' };
    bookState.cancelRequested = false;

    statusEl.textContent = 'Analysing manuscript...';
    addLog('Starting audiobook analysis (' + raw.length.toLocaleString() + ' chars).', 'info');

    const parsed = buildChapters(raw, settings);
    const meta = detectMetadata(raw, parsed.preamble);
    bookState.title = meta.title;
    bookState.series = meta.series || '';
    bookState.seriesVolume = meta.seriesVolume || '';
    bookState.author = meta.author;
    bookState.language = meta.language;
    bookState.chapters = parsed.chapters;
    bookState.anomalies = parsed.anomalies;

    if (settings.mode === 'dual_pov') {
      const dualRoleNames = collectDualPovRoleNames(parsed.chapters);
      if (dualRoleNames.length === 2) {
        applyDualPovRoleNames(parsed.chapters, dualRoleNames);
        bookState.characters = buildDualPovCharacterList(parsed.chapters, dualRoleNames);
      } else {
        bookState.characters = [];
        bookState.anomalies.push('Dual POV mode could not confidently resolve exactly two character names from chapter headings or separator cues.');
      }
    } else {
      bookState.characters = extractDetectedCharacters(parsed.chapters);
    }

    annotateCharacterMentions(bookState.chapters, bookState.characters);
    bookState.roles = buildRoleInventory(parsed.chapters);
    bookState.chapters.forEach((chapter, index) => {
      chapter.collapsed = index !== 0;
    });
    syncRoleVoiceAssignments();

    renderBookAssignments();
    renderBookCharacters();
    renderBookSummary();
    renderBookChapterList();
    updateBookEstimate();

    analysisPanel.classList.add('show');
    document.getElementById('bookGenPanel').classList.remove('show');
    dlPanel.classList.remove('show');
    document.getElementById('bookGenerateBtn').disabled = bookState.chapters.length === 0;

    statusEl.textContent = 'Detected ' + getNarrativeChapterCount(bookState.chapters) + ' chapters, ' + bookState.roles.length + ' speaking roles, and ' + bookState.characters.length + ' character names.';
    addLog('Analysis complete: ' + getNarrativeChapterCount(bookState.chapters) + ' chapters, ' + bookState.roles.length + ' roles, ' + bookState.characters.length + ' detected names.', 'success');
    await saveBookProject('analysis');
  };

  window.bookPlayChunk = async function bookPlayChunk(chapterIndex, chunkIndex, event) {
    if (event) event.stopPropagation();
    const chapter = bookState.chapters[chapterIndex];
    const chunk = chapter && chapter.chunks[chunkIndex];
    if (!chunk) return;
    if (!chunk.audioUrl) {
      addLog('Generate this chunk before playback.', 'warn');
      return;
    }
    if (isChunkPlaying(chunk)) {
      stopBookPlayback();
      return;
    }
    try {
      await playBookUrl(chunk.audioUrl, {
        type: 'chunk',
        id: chunk.id,
        chapterIndex,
        label: chapter.title + ' chunk ' + (chunkIndex + 1)
      });
    } catch (error) {
      addLog(error.message, 'error');
    }
  };

  window.bookPlayChapter = async function bookPlayChapter(chapterIndex, event) {
    if (event) event.stopPropagation();
    const chapter = bookState.chapters[chapterIndex];
    if (!chapter) return;
    if (isChapterPlaying(chapterIndex)) {
      stopBookPlayback();
      return;
    }
    if (!chapter.audioUrls.wav) {
      addLog('Generate or rebuild this chapter before playing it.', 'warn');
      return;
    }
    try {
      await playBookUrl(chapter.audioUrls.wav, {
        type: 'chapter',
        id: 'chapter_' + chapterIndex,
        chapterIndex,
        label: chapter.title
      });
    } catch (error) {
      addLog(error.message, 'error');
    }
  };

  window.bookGenerateChapter = async function bookGenerateChapter(chapterIndex, event) {
    if (event) event.stopPropagation();
    if (bookState.generating) {
      addLog('Another generation task is already running.', 'warn');
      return;
    }
    let context;
    try {
      context = getGenerationContext();
    } catch (error) {
      addLog('Chapter generation aborted: ' + error.message, 'error');
      return;
    }

    const chapter = bookState.chapters[chapterIndex];
    if (!chapter) return;

    bookState.generating = true;
    bookState.cancelRequested = false;
    setBookOperationUi(true);
    invalidateBookOutputs();
    chapter.audioUrls.wav = '';
    chapter.audioUrls.mp3 = '';

    const progress = { done: 0, total: chapter.chunks.length };
    addLog('Generating chapter audio for "' + chapter.title + '".', 'info');
    updateBookProgress(0, progress.total, 'Preparing ' + chapter.title + '...');

    try {
      const completed = await generateChapterChunks(chapterIndex, context, { progress });
      if (bookState.cancelRequested || !completed) {
        addLog('Chapter generation cancelled for "' + chapter.title + '".', 'warn');
        updateBookProgress(progress.done, progress.total, 'Cancelled');
      } else {
        addLog('Chapter ready: ' + chapter.title + '.', 'success');
      }
      await saveBookProject('chapter-' + (chapterIndex + 1));
    } catch (error) {
      addLog(error.message, 'error');
      await saveBookProject('chapter-error-' + (chapterIndex + 1));
    } finally {
      bookState.generating = false;
      setBookOperationUi(false);
      renderBookChapterList();
    }
  };

  window.bookRegenerateChunk = async function bookRegenerateChunk(chapterIndex, chunkIndex, event) {
    if (event) event.stopPropagation();
    if (bookState.generating) {
      addLog('Another generation task is already running.', 'warn');
      return;
    }
    let context;
    try {
      context = getGenerationContext();
    } catch (error) {
      addLog('Chunk regeneration aborted: ' + error.message, 'error');
      return;
    }

    const chapter = bookState.chapters[chapterIndex];
    const chunk = chapter && chapter.chunks[chunkIndex];
    if (!chapter || !chunk) return;

    if (isChunkPlaying(chunk) || isChapterPlaying(chapterIndex)) stopBookPlayback();

    bookState.generating = true;
    bookState.cancelRequested = false;
    setBookOperationUi(true);
    invalidateBookOutputs();
    chapter.audioUrls.wav = '';
    chapter.audioUrls.mp3 = '';

    const progress = { done: 0, total: 1 };
    addLog('Regenerating chunk ' + (chunkIndex + 1) + ' in "' + chapter.title + '".', 'info');
    updateBookProgress(0, 1, 'Regenerating ' + chapter.title + ' · chunk ' + (chunkIndex + 1) + '...');

    try {
      await generateChapterChunks(chapterIndex, context, {
        progress,
        onlyChunkIndex: chunkIndex,
        force: true
      });
      if (chapter.audioUrls.wav) addLog('Chunk replaced and chapter audio rebuilt for ' + chapter.title + '.', 'success');
      else addLog('Chunk replaced. Chapter audio will rebuild once all chunks are available.', 'success');
      await saveBookProject('chunk-regen-' + (chapterIndex + 1) + '-' + (chunkIndex + 1));
    } catch (error) {
      addLog(error.message, 'error');
      await saveBookProject('chunk-regen-error-' + (chapterIndex + 1) + '-' + (chunkIndex + 1));
    } finally {
      bookState.generating = false;
      setBookOperationUi(false);
      renderBookChapterList();
    }
  };

  window.bookGenerate = async function bookGenerate() {
    if (bookState.generating) {
      addLog('Another generation task is already running.', 'warn');
      return;
    }
    let context;
    try {
      context = getGenerationContext();
    } catch (error) {
      addLog('Book generation aborted: ' + error.message, 'error');
      return;
    }

    bookState.generating = true;
    bookState.cancelRequested = false;
    setBookOperationUi(true);
    invalidateBookOutputs();

    const totalChunks = bookState.chapters.reduce((sum, chapter) => sum + chapter.chunks.length, 0);
    const progress = { done: 0, total: totalChunks };

    addLog('Starting audiobook generation for ' + totalChunks + ' chunks.', 'info');
    updateBookProgress(0, totalChunks, 'Preparing generation...');

    try {
      for (let chapterIndex = 0; chapterIndex < bookState.chapters.length; chapterIndex += 1) {
        const chapter = bookState.chapters[chapterIndex];
        const completed = await generateChapterChunks(chapterIndex, context, { progress });
        if (!completed || bookState.cancelRequested) break;
        addLog('Merged chapter audio for ' + chapter.title + '.', 'debug');
        await saveBookProject('chapter-' + (chapterIndex + 1));
      }

      if (bookState.cancelRequested) {
        addLog('Audiobook generation cancelled by user.', 'warn');
        updateBookProgress(progress.done, progress.total, 'Cancelled');
      } else {
        updateBookProgress(totalChunks, totalChunks, 'Generation complete. Building full-book WAV...');
        const result = await postJson(BOOK_API.mergeBook, {
          projectId: bookState.projectId,
          silence: sanitizeSilence(document.getElementById('bookChapterSilence').value, 10),
          format: 'wav'
        });
        bookState.outputs.wav = result.url;
        document.getElementById('bookDlPanel').classList.add('show');
        addLog('Full-book WAV ready.', 'success');
        await saveBookProject('book-complete');
      }
    } catch (error) {
      addLog(error.message, 'error');
      await saveBookProject('generation-error');
    } finally {
      bookState.generating = false;
      setBookOperationUi(false);
      renderBookChapterList();
    }
  };

  window.bookCancel = function bookCancel() {
    if (!bookState.generating) return;
    bookState.cancelRequested = true;
    addLog('Cancellation requested for audiobook generation.', 'warn');
    updateBookProgress(0, 1, 'Stopping after the current request...');
  };

  window.bookDownloadCombined = async function bookDownloadCombined(format) {
    if (!bookState.projectId) {
      addLog('No audiobook project is loaded.', 'warn');
      return;
    }
    if (bookState.outputs[format]) {
      triggerBrowserDownload(bookState.outputs[format]);
      return;
    }
    addLog('Building full-book ' + format.toUpperCase() + ' file...', 'info');
    try {
      const result = await postJson(BOOK_API.mergeBook, {
        projectId: bookState.projectId,
        silence: sanitizeSilence(document.getElementById('bookChapterSilence').value, 10),
        format
      });
      bookState.outputs[format] = result.url;
      triggerBrowserDownload(result.url);
      addLog('Full-book ' + format.toUpperCase() + ' ready.', 'success');
      await saveBookProject('download-' + format);
    } catch (error) {
      addLog('Combined download failed: ' + error.message, 'error');
    }
  };

  window.bookDownloadZip = async function bookDownloadZip() {
    if (!bookState.projectId) {
      addLog('No audiobook project is loaded.', 'warn');
      return;
    }
    addLog('Building ZIP package of generated audiobook files...', 'info');
    try {
      const result = await postJson(BOOK_API.zipBook, { projectId: bookState.projectId });
      bookState.outputs.zip = result.url;
      triggerBrowserDownload(result.url);
      addLog('ZIP package ready.', 'success');
      await saveBookProject('download-zip');
    } catch (error) {
      addLog('ZIP build failed: ' + error.message, 'error');
    }
  };

  function wireBookInputs() {
    ['bookText', 'bookModeSelect', 'bookSepInput', 'bookChunkSize', 'bookModelSelect', 'bookChunkSilence', 'bookChapterSilence'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        if (!bookState.chapters.length) return;
        if (id === 'bookModelSelect') updateBookEstimate();
      });
      el.addEventListener('change', () => {
        if (!bookState.chapters.length) return;
        if (id === 'bookModelSelect') updateBookEstimate();
      });
    });
  }

  function initBookModule() {
    if (typeof onModelChange === 'function') {
      const bookModel = document.getElementById('bookModelSelect');
      if (bookModel && document.getElementById('modelSelect')) {
        bookModel.value = document.getElementById('modelSelect').value;
      }
    }
    const cancelBtn = document.getElementById('bookCancelBtn');
    if (cancelBtn) cancelBtn.classList.remove('show');
    renderLog();
    wireBookInputs();
    addLog('Narrate-AI audiobook workflow v' + APP_BOOK_VERSION + ' loaded.', 'success');
  }

  initBookModule();
})();
