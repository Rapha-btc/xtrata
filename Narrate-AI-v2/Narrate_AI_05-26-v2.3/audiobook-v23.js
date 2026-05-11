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
    author: 'Unknown Author',
    language: 'English',
    settings: null,
    manuscript: '',
    chapters: [],
    roles: [],
    anomalies: [],
    outputs: { wav: '', mp3: '', zip: '' },
    generating: false,
    cancelRequested: false
  };

  let savedVoicesCache = [];

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

  function cleanChapterTitle(title, index) {
    const trimmed = normalizeRoleLabel(title.replace(/^[#\s]+/, '').replace(/[.:]+$/, ''));
    if (!trimmed) return index === 0 ? 'Titles' : 'Chapter ' + index;
    if (/^prologue$/i.test(trimmed)) return 'Prologue';
    if (/^epilogue$/i.test(trimmed)) return 'Epilogue';
    return trimmed;
  }

  function detectMetadata(manuscript, preamble) {
    const lines = normalizeNewlines(preamble || manuscript).split('\n').map((line) => line.trim()).filter(Boolean);
    let title = lines[0] || 'Untitled Book';
    let author = 'Unknown Author';
    if (lines.length > 1) {
      const authorLine = lines.find((line) => /^(by|author|written by)\b/i.test(line));
      if (authorLine) author = authorLine.replace(/^(by|author|written by)[:\s]+/i, '').trim() || author;
      else if (lines[1].length < 80) author = lines[1];
    }
    let language = 'English';
    if (typeof guessLanguage === 'function') {
      language = guessLanguage(manuscript) || language;
    }
    return { title, author, language };
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

  function buildChapters(manuscript, settings) {
    const text = normalizeNewlines(manuscript).trim();
    if (!text) return { chapters: [], anomalies: [], preamble: '' };

    const chapterRegex = getChapterHeadingRegex();
    const parts = text.split(chapterRegex).filter((part) => part.trim().length > 0);
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
            charCount: chunkText.length
          });
          chunkIndex += 1;
        });
      });
      chapters.push({
        index: chapters.length,
        title,
        kind: isTitle ? 'titles' : 'chapter',
        audioUrls: { wav: '', mp3: '' },
        chunks
      });
    }

    if (parts.length && !chapterRegex.test(parts[0].trim())) {
      preamble = parts[0];
      if (preamble.trim()) {
        createChapter('Titles', preamble, true);
      }
    }

    if (!parts.some((part) => chapterRegex.test(part.trim()))) {
      chapters.length = 0;
      createChapter('Book', text, false);
      return { chapters, anomalies, preamble };
    }

    parts.forEach((part) => {
      const trimmed = part.trim();
      if (!trimmed) return;
      if (chapterRegex.test(trimmed)) {
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
    summaryBox.innerHTML = '' +
      '<strong>' + escapeHtml(bookState.title) + '</strong>' +
      ' by ' + escapeHtml(bookState.author) +
      '<br><span style="font-size:0.8rem;color:var(--muted)">' +
      bookState.chapters.length + ' chapters · ' +
      bookState.roles.length + ' roles · ' +
      totalChunks + ' chunks · ' +
      totalChars.toLocaleString() + ' chars · ' +
      escapeHtml(bookState.language) +
      '</span>';

    if (bookState.anomalies.length) {
      anomalyBox.style.display = 'block';
      anomalyBox.innerHTML = '<strong>Parser notes:</strong><br>' + bookState.anomalies.map(escapeHtml).join('<br>');
    } else {
      anomalyBox.style.display = 'none';
      anomalyBox.innerHTML = '';
    }
  }

  function renderBookChapterList() {
    const list = document.getElementById('bookChapterList');
    if (!list) return;
    if (!bookState.chapters.length) {
      list.innerHTML = '<div style="font-size:0.82rem;color:var(--muted)">No chapters analysed yet.</div>';
      return;
    }
    list.innerHTML = bookState.chapters.map((chapter) => {
      const doneCount = chapter.chunks.filter((chunk) => chunk.status === 'done').length;
      const roleCount = new Set(chapter.chunks.map((chunk) => chunk.roleLabel)).size;
      const percent = chapter.chunks.length ? Math.round((doneCount / chapter.chunks.length) * 100) : 0;
      return '' +
        '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:10px">' +
          '<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">' +
            '<div>' +
              '<div style="font-weight:700;color:var(--text)">' + escapeHtml(chapter.title) + '</div>' +
              '<div style="font-size:0.75rem;color:var(--muted)">' +
                chapter.chunks.length + ' chunks · ' + roleCount + ' roles · ' + percent + '% done' +
              '</div>' +
            '</div>' +
            '<div style="font-size:0.75rem;color:' + (doneCount === chapter.chunks.length ? 'var(--success)' : 'var(--muted)') + '">' +
              doneCount + '/' + chapter.chunks.length +
            '</div>' +
          '</div>' +
        '</div>';
    }).join('');
  }

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
      author: bookState.author,
      language: bookState.language,
      manuscript: bookState.manuscript,
      updatedAt: new Date().toISOString(),
      projectSettings: bookState.settings,
      roles: bookState.roles,
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
    bookState.author = meta.author;
    bookState.language = meta.language;
    bookState.chapters = parsed.chapters;
    bookState.anomalies = parsed.anomalies;
    bookState.roles = buildRoleInventory(parsed.chapters);
    syncRoleVoiceAssignments();

    renderBookAssignments();
    renderBookSummary();
    renderBookChapterList();
    updateBookEstimate();

    analysisPanel.classList.add('show');
    document.getElementById('bookGenPanel').classList.remove('show');
    dlPanel.classList.remove('show');
    document.getElementById('bookGenerateBtn').disabled = bookState.chapters.length === 0;

    statusEl.textContent = 'Detected ' + bookState.chapters.length + ' chapters and ' + bookState.roles.length + ' roles.';
    addLog('Analysis complete: ' + bookState.chapters.length + ' chapters, ' + bookState.roles.length + ' roles.', 'success');
    await saveBookProject('analysis');
  };

  async function generateBookChunk(chunk, modelId, apiKey) {
    const payload = {
      text: chunk.text,
      voiceId: chunk.voiceId,
      apiKey,
      modelId,
      projectId: bookState.projectId,
      chapterIndex: chunk.chapterIndex,
      chunkIndex: chunk.chunkIndex,
      language: bookState.language,
      instructions: ''
    };
    return postJson(BOOK_API.generateChunk, payload);
  }

  window.bookGenerate = async function bookGenerate() {
    const apiKey = document.getElementById('apiKey').value.trim();
    if (!apiKey) {
      addLog('Book generation aborted: DashScope API key is missing.', 'error');
      return;
    }
    if (!bookState.chapters.length) {
      addLog('Book generation aborted: analyse the manuscript first.', 'warn');
      return;
    }

    const modelId = document.getElementById('bookModelSelect').value;
    syncRoleVoiceAssignments();

    try {
      ensureRoleAssignmentsValid(modelId);
    } catch (error) {
      addLog(error.message, 'error');
      return;
    }

    bookState.generating = true;
    bookState.cancelRequested = false;
    document.getElementById('bookGenPanel').classList.add('show');
    document.getElementById('bookDlPanel').classList.remove('show');
    document.getElementById('bookCancelBtn').classList.add('show');
    document.getElementById('bookGenerateBtn').disabled = true;

    const totalChunks = bookState.chapters.reduce((sum, chapter) => sum + chapter.chunks.length, 0);
    let completedChunks = 0;

    addLog('Starting audiobook generation for ' + totalChunks + ' chunks.', 'info');
    updateBookProgress(0, totalChunks, 'Preparing generation...');

    for (let chapterIndex = 0; chapterIndex < bookState.chapters.length; chapterIndex += 1) {
      const chapter = bookState.chapters[chapterIndex];
      const filenames = [];
      for (let i = 0; i < chapter.chunks.length; i += 1) {
        if (bookState.cancelRequested) break;
        const chunk = chapter.chunks[i];
        updateBookProgress(completedChunks, totalChunks, 'Generating ' + chapter.title + ' · chunk ' + (i + 1) + ' of ' + chapter.chunks.length + '...');
        chunk.status = 'processing';
        renderBookChapterList();
        try {
          const result = await generateBookChunk(chunk, modelId, apiKey);
          chunk.status = 'done';
          chunk.filename = result.filename;
          chunk.audioUrl = result.url;
          filenames.push(result.filename);
          completedChunks += 1;
          renderBookChapterList();
        } catch (error) {
          chunk.status = 'error';
          renderBookChapterList();
          addLog('Chunk generation failed in ' + chapter.title + ': ' + error.message, 'error');
          document.getElementById('bookGenerateBtn').disabled = false;
          document.getElementById('bookCancelBtn').classList.remove('show');
          bookState.generating = false;
          await saveBookProject('generation-error');
          return;
        }
      }

      if (bookState.cancelRequested) break;

      try {
        const merged = await postJson(BOOK_API.mergeChapter, {
          projectId: bookState.projectId,
          chapterIndex,
          filenames,
          isTitle: chapter.kind === 'titles',
          silence: sanitizeSilence(document.getElementById('bookChunkSilence').value, 5),
          format: 'wav'
        });
        chapter.audioUrls.wav = merged.url;
        addLog('Merged chapter audio for ' + chapter.title + '.', 'debug');
      } catch (error) {
        addLog('Chapter merge failed for ' + chapter.title + ': ' + error.message, 'error');
        document.getElementById('bookGenerateBtn').disabled = false;
        document.getElementById('bookCancelBtn').classList.remove('show');
        bookState.generating = false;
        await saveBookProject('merge-error');
        return;
      }

      await saveBookProject('chapter-' + (chapterIndex + 1));
      renderBookChapterList();
    }

    if (bookState.cancelRequested) {
      addLog('Audiobook generation cancelled by user.', 'warn');
      updateBookProgress(completedChunks, totalChunks, 'Cancelled');
    } else {
      updateBookProgress(totalChunks, totalChunks, 'Generation complete. Building full-book WAV...');
      try {
        const result = await postJson(BOOK_API.mergeBook, {
          projectId: bookState.projectId,
          silence: sanitizeSilence(document.getElementById('bookChapterSilence').value, 10),
          format: 'wav'
        });
        bookState.outputs.wav = result.url;
        addLog('Full-book WAV ready.', 'success');
      } catch (error) {
        addLog('Full-book merge failed: ' + error.message, 'error');
      }
      document.getElementById('bookDlPanel').classList.add('show');
      await saveBookProject('book-complete');
    }

    document.getElementById('bookGenerateBtn').disabled = false;
    document.getElementById('bookCancelBtn').classList.remove('show');
    bookState.generating = false;
    renderBookChapterList();
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
