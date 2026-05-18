(function () {
  'use strict';

  const APP_BOOK_VERSION = '2.4';
  const CLONED_MODEL_ID = 'qwen3-tts-vc-2026-01-22';
  const DESIGNED_MODEL_ID = 'qwen3-tts-vd-2026-01-26';
  const BOOK_API = {
    projects: '/api/projects',
    checkCache: '/api/check-cache',
    generateChunk: '/api/generate-chunk',
    mergeChapter: '/api/merge-chapter',
    mergeBook: '/api/merge-book',
    zipBook: '/api/book-zip'
  };
  const VOICE_PROFILE_STORAGE_KEY = 'narrate_ai_audiobook_voice_profiles_v1';
  const DEFAULT_LAB_VOICE_PROFILES = [
    {
      match: ['american midnight bourbon', 'midnight bourbon', 'usmidbour01'],
      voiceName: 'American Midnight Bourbon',
      voiceType: 'labDesigned',
      identityPrompt: 'Low, smoky American male audiobook narrator. Warm, intimate, slightly rough-edged, late-night confidence. Controlled emotion, not theatrical.',
      defaultSceneDirection: 'Read with a slow-medium audiobook pace, natural pauses, intimate proximity, and restrained emotional weight. Keep the voice consistent across chapters.',
      sceneDirectionPresets: {
        neutral: 'Read in a natural audiobook style with a slow-medium pace and clear articulation.',
        intimate: 'Read slightly slower, quieter, and more intimately, as if speaking close to the listener.',
        tense: 'Read with quiet tension, controlled urgency, and slightly tighter pacing.',
        sad: 'Read with restrained sadness and emotional weight, using natural pauses but avoiding melodrama.',
        angry: 'Read with controlled anger under the surface, clipped but not shouted.',
        romantic: 'Read with warmth, intimacy, and softness, while keeping the delivery masculine and grounded.'
      }
    },
    {
      match: ['american baseline protector', 'american bassline protector', 'baseline protector', 'bassline protector', 'usbassprot01'],
      voiceName: 'American Baseline Protector',
      voiceType: 'labDesigned',
      identityPrompt: 'Grounded American male audiobook narrator. Protective, steady, calm under pressure, emotionally contained. Clear, reliable, sincere.',
      defaultSceneDirection: 'Read with calm authority, even pacing, clear articulation, and restrained warmth. Maintain a consistent protective presence.',
      sceneDirectionPresets: {
        neutral: 'Read in a steady, clear, natural audiobook style.',
        protective: 'Read with quiet reassurance, warmth, and firm protective calm.',
        tense: 'Read with controlled urgency, alertness, and emotional restraint.',
        sad: 'Read with heaviness and restraint, using pauses before difficult lines.',
        angry: 'Read with controlled anger, firm and clipped, but not shouted.',
        romantic: 'Read softer and warmer, more intimate, but still grounded and masculine.'
      }
    }
  ];

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
    directionPlan: null,
    outputs: { wav: '', mp3: '', zip: '' },
    needsBookMerge: false,
    voiceProfiles: {},
    generating: false,
    cancelRequested: false
  };

  let savedVoicesCache = [];
  let designedVoicesCache = Array.isArray(window.__lastDesignedVoices) ? window.__lastDesignedVoices.slice() : [];
  const bookPlayback = {
    audio: null,
    activeType: '',
    activeId: '',
    chapterIndex: -1
  };

  if (typeof PRICING !== 'undefined' && !PRICING[CLONED_MODEL_ID]) {
    PRICING[CLONED_MODEL_ID] = { rate: 0.115 / 10000, label: '$0.115/10K chars' };
  }
  if (typeof PRICING !== 'undefined' && !PRICING[DESIGNED_MODEL_ID]) {
    PRICING[DESIGNED_MODEL_ID] = { rate: 0.115 / 10000, label: '$0.115/10K chars' };
  }
  if (typeof freeUsed !== 'undefined' && freeUsed[CLONED_MODEL_ID] === undefined) {
    freeUsed[CLONED_MODEL_ID] = 0;
  }
  if (typeof freeUsed !== 'undefined' && freeUsed[DESIGNED_MODEL_ID] === undefined) {
    freeUsed[DESIGNED_MODEL_ID] = 0;
  }
  try {
    if (typeof syncFreeUsed === 'function') syncFreeUsed();
    if (typeof updatePricingNote === 'function') updatePricingNote();
  } catch (_) {}

  if (typeof renderSavedVoices === 'function') {
    const originalRenderSavedVoices = renderSavedVoices;
    renderSavedVoices = function patchedRenderSavedVoices(voices) {
      savedVoicesCache = Array.isArray(voices) ? voices.slice() : [];
      const result = originalRenderSavedVoices(voices);
      if (bookState.roles.length) {
        renderBookDirectionPanel();
        renderBookAssignments();
        updateBookEstimate();
      }
      return result;
    };
  }

  if (typeof renderDesignedVoices === 'function') {
    const originalRenderDesignedVoices = renderDesignedVoices;
    renderDesignedVoices = function patchedRenderDesignedVoices(voices) {
      designedVoicesCache = Array.isArray(voices) ? voices.slice() : [];
      const result = originalRenderDesignedVoices(voices);
      if (bookState.roles.length) {
        renderBookDirectionPanel();
        renderBookAssignments();
        updateBookEstimate();
      }
      return result;
    };
  }

  function getBookModelFamily(modelId) {
    if (typeof getModelFamily === 'function') return getModelFamily(modelId);
    return modelId || 'qwen3-tts-flash';
  }

  function displayBookModelName(modelId) {
    if (typeof displayModelName === 'function') return displayModelName(modelId);
    return modelId || 'Narrate:AI';
  }

  function isBookFlashModel(modelId) {
    return getBookModelFamily(modelId) === 'qwen3-tts-flash';
  }

  function isBookDirectorModel(modelId) {
    return getBookModelFamily(modelId) === 'qwen3-tts-instruct-flash';
  }

  function isBookCustomVoiceModel(modelId) {
    const family = getBookModelFamily(modelId);
    return family === CLONED_MODEL_ID || family === DESIGNED_MODEL_ID;
  }

  function getDirectorCompanionModel(modelId) {
    if (isBookDirectorModel(modelId)) return modelId;
    const current = modelId || 'qwen3-tts-flash';
    if (current === 'qwen3-tts-flash-2025-11-27' || current === 'qwen3-tts-flash-2025-09-18') {
      return 'qwen3-tts-instruct-flash-2026-01-26';
    }
    return 'qwen3-tts-instruct-flash';
  }

  function shouldUseSelectiveDirectorPass(modelId) {
    const toggle = document.getElementById('bookSelectiveDirector');
    return !!(toggle && toggle.checked && isBookFlashModel(modelId || getBookModelId()));
  }

  function chunkDirectionMode(chunk) {
    return chunk && chunk.directionMode === 'director' ? 'director' : 'auto';
  }

  function countMatches(text, regex) {
    const matches = String(text || '').match(regex);
    return matches ? matches.length : 0;
  }

  function uniqueStrings(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
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

  window.addLog = addLog;
  if (Array.isArray(window.__narratePendingLogs) && window.__narratePendingLogs.length) {
    window.__narratePendingLogs.splice(0).forEach((entry) => {
      addLog(entry.message, entry.level);
    });
  }

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

  function sanitizeEmotionalMax(value, target) {
    const parsed = parseInt(value, 10);
    const safeTarget = Number.isFinite(target) ? target : 1000;
    if (!Number.isFinite(parsed)) return Math.min(4000, Math.max(safeTarget, 1500));
    return Math.min(Math.max(parsed, safeTarget, 500), 4000);
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

  function readStoredVoiceProfiles() {
    try {
      const raw = localStorage.getItem(VOICE_PROFILE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function writeStoredVoiceProfiles(profiles) {
    try {
      localStorage.setItem(VOICE_PROFILE_STORAGE_KEY, JSON.stringify(profiles || {}));
    } catch (_) {}
  }

  function voiceProfileKey(voiceId) {
    return String(voiceId || '').trim();
  }

  function getDefaultVoiceProfile(record, type) {
    const labels = [
      record && record.display_name,
      record && record.preferred_name,
      record && record.voice,
      record && record.voiceId
    ].map(normalizeLoose).filter(Boolean);
    const matched = DEFAULT_LAB_VOICE_PROFILES.find((profile) => (
      profile.match.some((candidate) => labels.includes(normalizeLoose(candidate)))
    ));
    const voiceName = (record && (record.display_name || record.preferred_name || record.voice)) || 'Custom Voice';
    if (matched) {
      return {
        voiceName: matched.voiceName || voiceName,
        voiceType: matched.voiceType || type,
        identityPrompt: matched.identityPrompt || '',
        sceneDirection: matched.defaultSceneDirection || '',
        defaultSceneDirection: matched.defaultSceneDirection || '',
        sceneDirectionPresets: Object.assign({}, matched.sceneDirectionPresets || {})
      };
    }
    return {
      voiceName,
      voiceType: type,
      identityPrompt: '',
      sceneDirection: '',
      defaultSceneDirection: '',
      sceneDirectionPresets: {}
    };
  }

  function getVoiceRecordForProfile(voiceId) {
    const clone = getCloneRecordByVoiceId(voiceId);
    if (clone) return { record: clone, type: 'cloned' };
    const designed = getDesignedRecordByVoiceId(voiceId);
    if (designed) return { record: designed, type: 'labDesigned' };
    return null;
  }

  function getVoiceProfile(voiceId) {
    const key = voiceProfileKey(voiceId);
    if (!key) return null;
    const voiceRecord = getVoiceRecordForProfile(voiceId);
    if (!voiceRecord) return null;
    if (!bookState.voiceProfiles) bookState.voiceProfiles = {};
    const stored = readStoredVoiceProfiles();
    const defaults = getDefaultVoiceProfile(voiceRecord.record, voiceRecord.type);
    const current = Object.assign({}, defaults, stored[key] || {}, bookState.voiceProfiles[key] || {});
    current.voiceId = voiceId;
    current.voiceName = current.voiceName || defaults.voiceName;
    current.voiceType = current.voiceType || defaults.voiceType;
    current.provider = 'qwen';
    current.model = voiceRecord.record.target_model || (voiceRecord.type === 'labDesigned' ? DESIGNED_MODEL_ID : CLONED_MODEL_ID);
    current.voiceValue = voiceRecord.record.voice || voiceId;
    current.source = voiceRecord.record.source || '';
    current.sceneDirectionPresets = Object.assign({}, defaults.sceneDirectionPresets || {}, current.sceneDirectionPresets || {});
    bookState.voiceProfiles[key] = current;
    return current;
  }

  function persistVoiceProfile(voiceId, patch) {
    const key = voiceProfileKey(voiceId);
    if (!key) return;
    const current = getVoiceProfile(voiceId) || {};
    const next = Object.assign({}, current, patch || {});
    if (!bookState.voiceProfiles) bookState.voiceProfiles = {};
    bookState.voiceProfiles[key] = next;
    const stored = readStoredVoiceProfiles();
    stored[key] = {
      voiceName: next.voiceName,
      voiceType: next.voiceType,
      identityPrompt: next.identityPrompt || '',
      sceneDirection: next.sceneDirection || '',
      defaultSceneDirection: next.defaultSceneDirection || '',
      sceneDirectionPresets: next.sceneDirectionPresets || {}
    };
    writeStoredVoiceProfiles(stored);
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
  const CHARACTER_SINGLE_WORD_BLOCKLIST = new Set([
    'he', 'she', 'they', 'them', 'their', 'theirs', 'you', 'your', 'yours', 'we', 'our',
    'ours', 'i', 'me', 'my', 'mine', 'it', 'its', 'this', 'that', 'these', 'those',
    'there', 'here', 'who', 'whom', 'whose', 'what', 'when', 'where', 'why', 'how',
    'yes', 'no', 'and', 'but', 'or', 'if', 'as', 'after', 'before', 'while', 'then',
    'now', 'later', 'finally', 'perhaps', 'meanwhile', 'today', 'tomorrow', 'yesterday',
    'hello', 'goodbye', 'morning', 'evening', 'night',
    'all', 'since', 'once', 'someone', 'damn', 'thank', 'thanks', 'child', 'god', 'get',
    'like', 'take', 'come', 'just', 'sorry', 'maybe', 'can', 'not', 'was', 'are', 'is',
    'do', 'one', 'two', 'da', 'jag', 'seal', 'cps', 'caf',
    'id', 'ill', 'im', 'ive', 'youd', 'youll', 'youre', 'youve', 'hed', 'hell', 'hes',
    'shed', 'shell', 'shes', 'theyd', 'theyll', 'theyre', 'theyve', 'wed', 'well',
    'were', 'weve', 'itd', 'itll', 'its'
  ].map(normalizeLoose));
  const CHARACTER_CONNECTOR_WORDS = new Set([
    'a', 'an', 'the', 'and', 'but', 'or', 'if', 'as', 'after', 'before', 'when', 'while',
    'then', 'so', 'because', 'though', 'although', 'however', 'meanwhile', 'with', 'without',
    'from', 'into', 'onto', 'upon', 'through', 'across', 'around', 'toward', 'towards', 'for',
    'by', 'at', 'in', 'on', 'of', 'to'
  ].map(normalizeLoose));
  const CHARACTER_LOCATION_ORG_WORDS = new Set([
    'services', 'service', 'department', 'office', 'bureau', 'agency', 'school', 'elementary',
    'academy', 'university', 'college', 'tavern', 'inn', 'hotel', 'cafe', 'café', 'restaurant',
    'street', 'road', 'avenue', 'lane', 'court', 'county', 'city', 'town', 'village', 'police',
    'sheriff', 'church', 'hospital', 'clinic', 'center', 'centre', 'building', 'hall'
  ].map(normalizeLoose));

  function sentenceSplit(text) {
    const matches = String(text || '').match(/[^.!?\n]+(?:[.!?]+["”'’)]*)?|[^.!?\n]+$/g);
    return (matches || [text]).map((part) => part.trim()).filter(Boolean);
  }

  function isShortImpactLine(text) {
    const clean = String(text || '').trim();
    return clean.length > 0 && clean.length <= 90 && /[.!?…]$/.test(clean);
  }

  function hasEmotionalCue(text) {
    return /\b(shouted|whispered|cried|snapped|sobbed|murmured|hissed|laughed|gasped|pleaded|roared|sighed|yelled|barked|trembled|stared|froze|wait|stop|please|no|run|look)\b/i.test(text || '');
  }

  function pauseAfterForText(text, mode) {
    const clean = String(text || '').trim();
    if (!clean) return 0;
    const dramatic = mode === 'dramatic';
    if (/^(?:[*\-–—]\s*){3,}$/.test(clean)) return 1.2;
    if (/(?:\.\.\.|…)$/.test(clean)) return dramatic ? 0.9 : 0.6;
    if (isShortImpactLine(clean) && /[.!?]$/.test(clean)) return dramatic ? 0.8 : 0.45;
    if (hasEmotionalCue(clean) && /[.!?]$/.test(clean)) return dramatic ? 0.65 : 0.35;
    return 0;
  }

  function chunkPlanForText(text, reason, mode) {
    const clean = String(text || '').trim();
    return {
      text: clean,
      pauseAfterSeconds: pauseAfterForText(clean, mode),
      splitReason: reason || 'natural boundary'
    };
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

  function splitTextIntoChunkPlans(text, settings) {
    const normalized = normalizeNewlines(text).trim();
    if (!normalized) return [];
    const mode = (settings && settings.chunkingMode) || 'balanced';
    if (mode === 'compact') {
      return splitTextIntoChunks(normalized, settings.chunkMaxChars).map((chunk) => chunkPlanForText(chunk, 'compact size boundary', mode));
    }

    const target = sanitizeChunkSize(settings && settings.chunkMaxChars);
    const hardMax = sanitizeEmotionalMax(settings && settings.emotionalMaxChars, target);
    const minSize = Math.max(220, Math.floor(target * 0.45));
    const paragraphs = normalized.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    const units = [];

    paragraphs.forEach((paragraph) => {
      if (paragraph.length <= hardMax) {
        units.push({
          text: paragraph,
          pause: pauseAfterForText(paragraph, mode),
          reason: isShortImpactLine(paragraph) ? 'short impact line' : (hasEmotionalCue(paragraph) ? 'emotional beat' : 'paragraph boundary')
        });
        return;
      }
      sentenceSplit(paragraph).forEach((sentence) => {
        if (sentence.length <= hardMax) {
          units.push({
            text: sentence,
            pause: pauseAfterForText(sentence, mode),
            reason: hasEmotionalCue(sentence) ? 'emotional sentence' : 'sentence boundary'
          });
          return;
        }
        splitTextIntoChunks(sentence, target).forEach((piece) => {
          units.push({ text: piece, pause: 0, reason: 'long sentence safe split' });
        });
      });
    });

    const plans = [];
    let current = '';
    let currentReasons = [];
    let lastPause = 0;

    function flush(reason) {
      const clean = current.trim();
      if (!clean) return;
      plans.push({
        text: clean,
        pauseAfterSeconds: lastPause,
        splitReason: reason || uniqueStrings(currentReasons).slice(0, 2).join(', ') || 'beat boundary'
      });
      current = '';
      currentReasons = [];
      lastPause = 0;
    }

    units.forEach((unit) => {
      const candidate = current ? current + '\n\n' + unit.text : unit.text;
      const highPause = unit.pause >= (mode === 'dramatic' ? 0.45 : 0.6);
      const shouldBreakForPause = highPause && current.length >= minSize;
      if (current && (candidate.length > hardMax || (candidate.length > target && (mode !== 'continuity' || shouldBreakForPause)) || shouldBreakForPause)) {
        flush(shouldBreakForPause ? 'pause cut: ' + unit.reason : 'size boundary preserving beat');
      }
      current = current ? current + '\n\n' + unit.text : unit.text;
      currentReasons.push(unit.reason);
      lastPause = unit.pause;
      if (mode === 'dramatic' && unit.pause >= 0.8) flush('dramatic pause after ' + unit.reason);
    });
    flush();
    return plans.length ? plans : splitTextIntoChunks(normalized, target).map((chunk) => chunkPlanForText(chunk, 'fallback boundary', mode));
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

  function getMetadataPreviewLines(manuscript, preamble) {
    const source = normalizeNewlines(preamble || manuscript);
    return source
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 12)
      .map(cleanMetadataLine)
      .filter(Boolean);
  }

  function detectMetadata(manuscript, preamble) {
    const lines = getMetadataPreviewLines(manuscript, preamble);
    let language = 'English';
    if (typeof guessLanguage === 'function') {
      language = guessLanguage(manuscript) || language;
    }

    let title = lines[0] || 'Untitled Book';
    let series = '';
    let seriesVolume = '';
    let author = 'Unknown Author';
    const used = new Set();

    for (let index = 0; index < lines.length; index += 1) {
      const authorCandidate = stripAuthorPrefix(lines[index]);
      if (!authorCandidate) continue;
      author = authorCandidate;
      used.add(index);
      break;
    }

    for (let index = 0; index < lines.length; index += 1) {
      if (used.has(index)) continue;
      const line = lines[index];
      if (!line || isVolumeLine(line)) continue;
      title = line;
      used.add(index);
      break;
    }

    for (let index = 0; index < lines.length; index += 1) {
      if (used.has(index)) continue;
      const line = lines[index];
      if (!line) continue;
      if (!seriesVolume && isVolumeLine(line)) {
        seriesVolume = line;
        used.add(index);
        continue;
      }
      if (!series && looksLikeSeriesLine(line)) {
        series = line;
        used.add(index);
      }
    }

    if (author === 'Unknown Author') {
      const fallbackAuthorLine = lines.find((line, index) => {
        if (used.has(index)) return false;
        if (!line || isVolumeLine(line) || looksLikeSeriesLine(line)) return false;
        return line.split(/\s+/).length <= 5;
      });
      if (fallbackAuthorLine) author = fallbackAuthorLine;
    }

    return { title, series, seriesVolume, author, language };
  }

  function buildRoleId(label) {
    return 'role_' + slugify(label);
  }

  function buildTitleTrackEntries(meta) {
    const entries = [];
    const seen = new Set();

    function push(value) {
      const clean = cleanMetadataLine(value);
      if (!clean) return;
      const key = normalizeLoose(clean);
      if (!key || seen.has(key)) return;
      seen.add(key);
      entries.push(clean);
    }

    push(meta && meta.title);
    push(meta && meta.series);
    push(meta && meta.seriesVolume);
    if (meta && meta.author && meta.author !== 'Unknown Author') push(meta.author);
    return entries;
  }

  function formatTitleTrackEntry(entry) {
    const clean = cleanMetadataLine(entry);
    if (!clean) return '';
    if (/[.!?…।。]$/.test(clean)) return clean;
    return clean + '.';
  }

  function sanitizeTitlePauseMarker(value) {
    const compact = String(value || '').replace(/\s+/g, ' ').trim();
    if (!compact) return ' .. ';
    return ' ' + compact.slice(0, 16) + ' ';
  }

  function buildTitleTrackText(meta, pauseMarker) {
    return buildTitleTrackEntries(meta)
      .map(formatTitleTrackEntry)
      .filter(Boolean)
      .join(sanitizeTitlePauseMarker(pauseMarker))
      .trim();
  }

  function createMetadataTitleChapter(meta, existingChapter, settings) {
    const fullText = buildTitleTrackText(meta, settings && settings.titlePauseMarker);
    if (!fullText) return existingChapter || null;

    const roleLabel = 'Narrator';
    const roleId = buildRoleId(roleLabel);
    const chapterIndex = existingChapter && Number.isInteger(existingChapter.index) ? existingChapter.index : 0;
    const chunks = [{
      id: 'bk_title_0_' + Math.random().toString(36).slice(2, 8),
      chapterIndex,
      chunkIndex: 0,
      segmentIndex: 0,
      roleLabel,
      roleId,
      sourceType: 'narration',
      text: fullText,
      status: 'pending',
      filename: '',
      audioUrl: '',
      voiceId: '',
      charCount: fullText.length,
      detectedCharacters: [],
      primaryCharacter: '',
      audioVersion: 0,
      directionMode: existingChapter && existingChapter.chunks && existingChapter.chunks[0] && existingChapter.chunks[0].directionMode === 'director' ? 'director' : 'auto'
    }];

    return {
      index: chapterIndex,
      title: 'Titles',
      kind: 'titles',
      audioUrls: { wav: '', mp3: '' },
      needsMerge: false,
      chunks,
      collapsed: existingChapter ? !!existingChapter.collapsed : false,
      characters: []
    };
  }

  function reindexChapters(chapters) {
    return (chapters || []).map((chapter, chapterIndex) => ({
      ...chapter,
      index: chapterIndex,
      chunks: (chapter.chunks || []).map((chunk, chunkIndex) => ({
        ...chunk,
        chapterIndex,
        chunkIndex,
        directionMode: chunk && chunk.directionMode === 'director' ? 'director' : 'auto'
      }))
    }));
  }

  function rebuildTitleChapterFromMetadata(chapters, meta, preamble, settings) {
    const existingChapters = Array.isArray(chapters) ? chapters.slice() : [];
    const titleIndex = existingChapters.findIndex((chapter) => chapter.kind === 'titles');
    if (!String(preamble || '').trim() && titleIndex === -1) return existingChapters;

    const titleChapter = createMetadataTitleChapter(meta, titleIndex === -1 ? null : existingChapters[titleIndex], settings);
    if (!titleChapter) return existingChapters;

    if (titleIndex === -1) existingChapters.unshift(titleChapter);
    else existingChapters[titleIndex] = titleChapter;
    return reindexChapters(existingChapters);
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
        .replace(/([\p{L}\p{N}])[’']s\b/gu, '$1')
        .replace(/\s+/g, ' ')
        .trim()
    );
  }

  function stripHonorific(label) {
    return normalizeRoleLabel(String(label || '').replace(new RegExp('^(?:' + CHARACTER_HONORIFICS.map(escapeRegex).join('|') + ')\\.?\\s+', 'i'), ''));
  }

  function getCharacterCandidateProfile(label) {
    const clean = normalizeCharacterCandidate(label);
    const words = clean.split(/\s+/).filter(Boolean);
    const normalizedWords = words.map((word) => normalizeLoose(word.replace(/[.'’-]+$/g, '')));
    const bareWords = words.map((word) => word.replace(/[.'’-]+$/g, ''));
    const lowerHonorifics = new Set(CHARACTER_HONORIFICS.map((title) => normalizeLoose(title)));
    const hasHonorific = normalizedWords.length > 0 && lowerHonorifics.has(normalizedWords[0]);
    const coreWords = hasHonorific ? normalizedWords.slice(1) : normalizedWords.slice();
    const trailingBoundaryPunctuation = words.some((word, index) => {
      if (!/[.:;!?]$/.test(word)) return false;
      const bare = normalizeLoose(word.replace(/[.:;!?]+$/g, ''));
      if (index === 0 && lowerHonorifics.has(bare)) return false;
      return true;
    });
    const hasOrgWord = coreWords.some((word) => CHARACTER_LOCATION_ORG_WORDS.has(word));
    const hasConnectorWord = coreWords.some((word, index) => {
      if (!word) return false;
      if (index === 0 || index === coreWords.length - 1) return CHARACTER_CONNECTOR_WORDS.has(word);
      return CHARACTER_CONNECTOR_WORDS.has(word) && !lowerHonorifics.has(word);
    });
    const hasBlockedSingleWord = coreWords.length === 1 && CHARACTER_SINGLE_WORD_BLOCKLIST.has(coreWords[0]);
    const hasBlockedCoreWord = coreWords.some((word) => CHARACTER_SINGLE_WORD_BLOCKLIST.has(word) || CHARACTER_STOP_WORDS.has(word));
    const hasShortInitialTail = bareWords.some((word, index) => {
      if (index === 0 && hasHonorific) return false;
      return normalizeLoose(word).length <= 1;
    });
    return {
      clean,
      words,
      coreWords,
      hasHonorific,
      trailingBoundaryPunctuation,
      hasOrgWord,
      hasConnectorWord,
      hasBlockedSingleWord,
      hasBlockedCoreWord,
      hasShortInitialTail
    };
  }

  function isValidCharacterCandidate(label) {
    const profile = getCharacterCandidateProfile(label);
    const clean = profile.clean;
    if (!clean) return false;
    if (clean.length > 48) return false;
    if (isGenericRoleLabel(clean)) return false;
    if (/^(chapter|part|prologue|epilogue|scene|act|book|titles?)\b/i.test(clean)) return false;
    const words = profile.words;
    if (!words.length || words.length > 3) return false;
    if (CHARACTER_STOP_WORDS.has(normalizeLoose(clean))) return false;
    if (profile.trailingBoundaryPunctuation) return false;
    if (profile.hasBlockedSingleWord) return false;
    if (profile.hasShortInitialTail) return false;
    if (profile.hasConnectorWord) return false;
    if (profile.hasOrgWord) return false;
    if (!profile.hasHonorific && profile.hasBlockedCoreWord) return false;
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

  function collectAllowedSingleWordNames(entries) {
    const allowed = new Set();

    function push(value, force) {
      const candidate = normalizeCharacterCandidate(value);
      if (!candidate) return;
      const profile = getCharacterCandidateProfile(candidate);
      if (profile.words.length !== 1) return;
      const key = normalizeLoose(candidate);
      if (!key || CHARACTER_SINGLE_WORD_BLOCKLIST.has(key) || CHARACTER_STOP_WORDS.has(key)) return;
      if (!force) return;
      allowed.add(key);
    }

    (entries || []).forEach((entry) => {
      if (!entry || !entry.label) return;
      const profile = getCharacterCandidateProfile(entry.label);
      const fromStrongEvidence = entry.attributionHits > 0 || profile.hasHonorific;
      push(entry.label, fromStrongEvidence);
      push(stripHonorific(entry.label), fromStrongEvidence);
      if (fromStrongEvidence && profile.words.length > 1) {
        const coreWords = profile.hasHonorific ? profile.words.slice(1) : profile.words.slice();
        if (coreWords.length) {
          push(coreWords[0], true);
          push(coreWords[coreWords.length - 1], true);
        }
      }
    });

    return allowed;
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
        attributionHits: 0,
        mentionHits: 0,
        roleHits: 0,
        chapters: new Set(),
        sources: new Set(),
        matchPhrases: phrases.slice()
      };
      entry.matchPhrases.forEach((phrase) => map.set(phrase, entry));
    }
    if (label.length > entry.label.length) entry.label = label;
    entry.score += weight;
    entry.hits += 1;
    if (source === 'attribution') entry.attributionHits += 1;
    if (source === 'mention') entry.mentionHits += 1;
    if (source === 'role') entry.roleHits += 1;
    entry.chapters.add(chapterIndex);
    entry.sources.add(source);
  }

  function extractDetectedCharacters(chapters) {
    const candidateMap = new Map();
    const honorificPattern = '(?:' + CHARACTER_HONORIFICS.map(escapeRegex).join('|') + ')\\.?' ;
    const baseNamePattern = '(?:' + honorificPattern + '\\s+)?[\\p{Lu}][\\p{L}\'’.-]+(?:\\s+[\\p{Lu}][\\p{L}\'’.-]+){0,2}';
    const seededNamePattern = '(?:' + honorificPattern + '\\s+[\\p{Lu}][\\p{L}\'’.-]+(?:\\s+[\\p{Lu}][\\p{L}\'’.-]+){0,1}|[\\p{Lu}][\\p{L}\'’.-]+\\s+[\\p{Lu}][\\p{L}\'’.-]+(?:\\s+[\\p{Lu}][\\p{L}\'’.-]+){0,1})';
    const escapedVerbs = CHARACTER_DIALOGUE_VERBS.map((verb) => verb.trim().split(/\s+/).map(escapeRegex).join('\\s+'));
    const verbPattern = '(?:' + escapedVerbs.join('|') + ')';
    const forwardPattern = new RegExp('\\b(' + baseNamePattern + ')\\s+' + verbPattern + '\\b', 'gu');
    const backwardPattern = new RegExp('\\b' + verbPattern + '\\s+(' + baseNamePattern + ')\\b', 'gu');
    const seededMentionPattern = new RegExp('\\b(' + seededNamePattern + ')\\b', 'gu');
    const singleNamePattern = /\b([A-ZÀ-ÖØ-Ý][\p{L}'’.-]{1,24}(?:[’']s)?)\b/gu;

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
      Array.from(chapterText.matchAll(seededMentionPattern)).forEach((match) => {
        bumpCharacterCandidate(candidateMap, match[1], 0.35, chapterIndex, 'mention');
      });
    });

    const allowedSingleWordNames = collectAllowedSingleWordNames(Array.from(new Set(candidateMap.values())));
    if (allowedSingleWordNames.size) {
      chapters.forEach((chapter, chapterIndex) => {
        const chapterText = chapter.chunks.map((chunk) => chunk.text).join('\n\n');
        Array.from(chapterText.matchAll(singleNamePattern)).forEach((match) => {
          const candidate = normalizeCharacterCandidate(match[1]);
          if (!candidate) return;
          const key = normalizeLoose(candidate);
          if (!allowedSingleWordNames.has(key)) return;
          bumpCharacterCandidate(candidateMap, candidate, 0.15, chapterIndex, 'mention');
        });
      });
    }

    return Array.from(new Set(candidateMap.values()))
      .filter((entry) => {
        if (entry.sources.has('role')) return true;
        const label = entry.label;
        const profile = getCharacterCandidateProfile(label);
        const wordCount = profile.words.length;
        const hasHonorific = profile.hasHonorific;
        const hasAttribution = entry.attributionHits > 0;
        const normalizedLabel = normalizeLoose(label);
        if (profile.hasOrgWord || profile.hasConnectorWord || profile.hasBlockedSingleWord) return false;
        if (wordCount === 1) {
          return allowedSingleWordNames.has(normalizedLabel) && (hasAttribution || entry.score >= 2.5 || entry.chapters.size >= 2);
        }
        if (hasHonorific) {
          return hasAttribution || entry.hits >= 2;
        }
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
    const designs = Array.isArray(window.__lastDesignedVoices) ? window.__lastDesignedVoices : designedVoicesCache;
    const designMatch = designs.find((voice) => normalizeLoose(voice.display_name || voice.preferred_name || voice.voice) === normalizedRole);
    if (designMatch) return designMatch.voice;
    const fallback = VOICES[(roleIndex + 1) % VOICES.length];
    return fallback ? fallback.id : 'Cherry';
  }

  function getBookModelId() {
    const select = document.getElementById('bookModelSelect');
    return select ? select.value : 'qwen3-tts-flash';
  }

  function getCloneRecordByVoiceId(voiceId) {
    return savedVoicesCache.find((voice) => voice.voice === voiceId) || null;
  }

  function getDesignedRecordByVoiceId(voiceId) {
    const latest = Array.isArray(window.__lastDesignedVoices) ? window.__lastDesignedVoices : designedVoicesCache;
    return latest.find((voice) => voice.voice === voiceId) || null;
  }

  function getCompatibleCloneVoices(modelId) {
    return savedVoicesCache.filter((voice) => (voice.target_model || '') === modelId);
  }

  function getCompatibleDesignedVoices(modelId) {
    const latest = Array.isArray(window.__lastDesignedVoices) ? window.__lastDesignedVoices : designedVoicesCache;
    designedVoicesCache = latest.slice();
    return designedVoicesCache.filter((voice) => (voice.target_model || DESIGNED_MODEL_ID) === modelId);
  }

  function getCompatibleBookVoices(modelId) {
    if (modelId === CLONED_MODEL_ID) {
      return getCompatibleCloneVoices(modelId).map((voice) => ({
        id: voice.voice,
        label: (voice.preferred_name || voice.voice) + ' — Cloned',
        type: 'clone'
      }));
    }
    if (modelId === DESIGNED_MODEL_ID) {
      return getCompatibleDesignedVoices(modelId).map((voice) => ({
        id: voice.voice,
        label: (voice.display_name || voice.preferred_name || voice.voice) + ' — Designed',
        type: 'design'
      }));
    }
    const effectiveModelId = shouldUseSelectiveDirectorPass(modelId)
      ? getDirectorCompanionModel(modelId)
      : modelId;
    const builtinVoices = typeof getCompatibleSystemVoices === 'function'
      ? getCompatibleSystemVoices(effectiveModelId)
      : VOICES;
    return builtinVoices.map((voice) => ({
      id: voice.id,
      label: voice.id + ' — Built-in',
      type: 'builtin'
    }));
  }

  function getBookVoiceDisplayLabel(voiceId) {
    if (!voiceId) return 'Voice';
    const clone = getCloneRecordByVoiceId(voiceId);
    if (clone) return clone.display_name || clone.preferred_name || clone.voice || voiceId;
    const designed = getDesignedRecordByVoiceId(voiceId);
    if (designed) return designed.display_name || designed.preferred_name || designed.voice || voiceId;
    const builtin = VOICES.find((voice) => voice.id === voiceId);
    return builtin ? (builtin.label || builtin.name || builtin.id) : voiceId;
  }

  function getBookVoiceFileLabel(voiceId) {
    if (!voiceId) return 'voice';
    const clone = getCloneRecordByVoiceId(voiceId);
    if (clone) return clone.preferred_name || clone.display_name || clone.voice || voiceId;
    const designed = getDesignedRecordByVoiceId(voiceId);
    if (designed) return designed.preferred_name || designed.display_name || designed.voice || voiceId;
    return voiceId;
  }

  function getBookVoiceSummaryLabel() {
    const labels = [];
    bookState.roles.forEach((role) => {
      const label = getBookVoiceFileLabel(role.voiceId);
      if (label && !labels.includes(label)) labels.push(label);
    });
    if (!labels.length) return 'unassigned_voice';
    if (labels.length === 1) return labels[0];
    return labels.slice(0, 3).join('_and_') + (labels.length > 3 ? '_plus_' + (labels.length - 3) + '_more' : '');
  }

  function getBookFilenameSettings(extra) {
    const modelId = getBookModelId();
    const plan = getBookDirectionPlan();
    const chunkSilence = sanitizeSilence(document.getElementById('bookChunkSilence').value, 5);
    const chapterSilence = sanitizeSilence(document.getElementById('bookChapterSilence').value, 10);
    return Object.assign({
      mode: (bookState.settings && bookState.settings.mode) || document.getElementById('bookModeSelect').value,
      voiceSummary: getBookVoiceSummaryLabel(),
      chunkSilence,
      chapterSilence,
      settingsTag: plan.mode === 'adaptive'
        ? 'flash_director_mix'
        : plan.mode === 'director_all'
          ? 'director_all'
          : plan.mode === 'clone'
            ? 'clone_voice'
            : modelId === DESIGNED_MODEL_ID
              ? 'designed_voice'
              : 'flash_default'
    }, extra || {});
  }

  function getDefaultCompatibleVoice(roleLabel, roleIndex, modelId) {
    const options = getCompatibleBookVoices(modelId);
    if (!options.length) return '';
    if (modelId === CLONED_MODEL_ID) {
      const normalizedRole = normalizeLoose(roleLabel);
      const cloneMatch = getCompatibleCloneVoices(modelId).find((voice) => normalizeLoose(voice.preferred_name || voice.voice) === normalizedRole);
      return cloneMatch ? cloneMatch.voice : options[0].id;
    }
    if (modelId === DESIGNED_MODEL_ID) {
      const normalizedRole = normalizeLoose(roleLabel);
      const designedMatch = getCompatibleDesignedVoices(modelId).find((voice) => normalizeLoose(voice.display_name || voice.preferred_name || voice.voice) === normalizedRole);
      return designedMatch ? designedMatch.voice : options[0].id;
    }
    const preferred = defaultVoiceForRole(roleLabel, roleIndex);
    return options.some((voice) => voice.id === preferred) ? preferred : options[0].id;
  }

  function normalizeRoleAssignmentsForModel(modelId) {
    const validVoiceIds = new Set(getCompatibleBookVoices(modelId).map((voice) => voice.id));
    bookState.roles.forEach((role, index) => {
      if (!validVoiceIds.has(role.voiceId)) {
        role.voiceId = getDefaultCompatibleVoice(role.label, index, modelId);
      }
    });
    bookState.chapters.forEach((chapter) => {
      chapter.chunks.forEach((chunk) => {
        const role = bookState.roles.find((entry) => entry.id === chunk.roleId);
        if (role) chunk.voiceId = role.voiceId;
      });
    });
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

  function scoreChunkForDirector(chunk, chapter) {
    const text = String(chunk && chunk.text || '');
    if (chapter && chapter.kind === 'titles') {
      return { score: 999, reasons: ['title cadence'], guaranteed: true };
    }

    const reasons = [];
    let score = 0;
    const emphasisPunctuation = countMatches(text, /!/g) + countMatches(text, /\?/g);

    if (chunk && chunk.sourceType === 'dialogue') {
      score += 2;
      reasons.push('dialogue scene');
    }
    if (countMatches(text, /["“”]/g) >= 2) {
      score += 2;
      reasons.push('spoken line shape');
    }
    if (emphasisPunctuation >= 2) {
      score += 2;
      reasons.push('heightened punctuation');
    }
    if (countMatches(text, /(?:\.\.\.|…)/g) >= 2) {
      score += 1;
      reasons.push('pause shaping');
    }
    if (chunk && Array.isArray(chunk.detectedCharacters) && chunk.detectedCharacters.length >= 2) {
      score += 1;
      reasons.push('multi-character beat');
    }
    if (chunk && chunk.charCount <= 340) {
      score += 1;
      reasons.push('short dramatic beat');
    }
    if (chapter && Array.isArray(chapter.chunks) && (chunk.chunkIndex === 0 || chunk.chunkIndex === chapter.chunks.length - 1) && chunk.charCount <= 850) {
      score += 1;
      reasons.push('chapter edge');
    }
    if (/\b(shouted|whispered|cried|snapped|sobbed|murmured|hissed|laughed|gasped|pleaded|roared|sighed|yelled|barked)\b/i.test(text)) {
      score += 2;
      reasons.push('emotional cue verb');
    }
    if (/\b(wait|stop|please|no|yes|listen|run|look)\b/i.test(text) && emphasisPunctuation > 0) {
      score += 1;
      reasons.push('performance emphasis');
    }

    return {
      score,
      reasons: uniqueStrings(reasons),
      guaranteed: false
    };
  }

  function buildUniformDirectionPlan(mode, modelId, label, reasonText) {
    const allChunks = bookState.chapters.flatMap((chapter) => chapter.chunks.map((chunk) => ({ chapter, chunk })));
    const byChunkId = {};
    allChunks.forEach(({ chunk }) => {
      byChunkId[chunk.id] = {
        modelId,
        label,
        source: mode,
        reasonText,
        reasons: reasonText ? [reasonText] : []
      };
    });
    return {
      mode,
      modelId,
      byChunkId,
      totalChunks: allChunks.length,
      totalChars: allChunks.reduce((sum, entry) => sum + entry.chunk.charCount, 0),
      directorChunkCount: mode === 'director_all' ? allChunks.length : 0,
      directorChars: mode === 'director_all' ? allChunks.reduce((sum, entry) => sum + entry.chunk.charCount, 0) : 0,
      directorChapterCount: mode === 'director_all' ? getNarrativeChapterCount(bookState.chapters) : 0,
      flashChunkCount: mode === 'flash_only' ? allChunks.length : 0,
      flashChars: mode === 'flash_only' ? allChunks.reduce((sum, entry) => sum + entry.chunk.charCount, 0) : 0,
      topReasons: reasonText ? [reasonText] : []
    };
  }

  function buildBookDirectionPlan(modelId) {
    const currentModelId = modelId || getBookModelId();
    const allChunks = bookState.chapters.flatMap((chapter) => chapter.chunks.map((chunk) => ({ chapter, chunk })));
    if (!allChunks.length) {
      return {
        mode: 'empty',
        modelId: currentModelId,
        byChunkId: {},
        totalChunks: 0,
        totalChars: 0,
        directorChunkCount: 0,
        directorChars: 0,
        directorChapterCount: 0,
        flashChunkCount: 0,
        flashChars: 0,
        topReasons: []
      };
    }

    if (isBookCustomVoiceModel(currentModelId)) {
      return buildUniformDirectionPlan(
        currentModelId === DESIGNED_MODEL_ID ? 'design' : 'clone',
        currentModelId,
        currentModelId === DESIGNED_MODEL_ID ? 'Design' : 'Clone',
        currentModelId === DESIGNED_MODEL_ID ? 'designed voice render' : 'custom voice render'
      );
    }
    if (isBookDirectorModel(currentModelId)) {
      return buildUniformDirectionPlan('director_all', currentModelId, 'Director', 'full book direction');
    }
    if (!shouldUseSelectiveDirectorPass(currentModelId)) {
      return buildUniformDirectionPlan('flash_only', currentModelId, 'Flash', 'one-click flash render');
    }

    const directorModelId = getDirectorCompanionModel(currentModelId);
    const byChunkId = {};
    const scoreByChunkId = {};
    const narrativeCandidates = [];
    const selectedIds = new Set();
    const totalChars = allChunks.reduce((sum, entry) => sum + entry.chunk.charCount, 0);
    const narrativeChunks = allChunks.filter((entry) => entry.chapter.kind !== 'titles');
    const autoSelectionLimit = Math.max(2, Math.ceil(narrativeChunks.length * 0.18));
    const directorCharBudget = Math.max(4500, Math.floor(totalChars * 0.28));
    let selectedAutoChars = 0;
    let selectedAutoCount = 0;

    allChunks.forEach(({ chapter, chunk }) => {
      const score = scoreChunkForDirector(chunk, chapter);
      scoreByChunkId[chunk.id] = score;
      if (chunkDirectionMode(chunk) === 'director' || score.guaranteed) {
        selectedIds.add(chunk.id);
        return;
      }
      if (score.score >= 4) {
        narrativeCandidates.push({ chapter, chunk, score });
      }
    });

    narrativeCandidates.sort((a, b) => {
      if (b.score.score !== a.score.score) return b.score.score - a.score.score;
      return a.chunk.charCount - b.chunk.charCount;
    });

    narrativeCandidates.forEach((candidate) => {
      if (selectedIds.has(candidate.chunk.id)) return;
      if (selectedAutoCount >= autoSelectionLimit && candidate.score.score < 6) return;
      if ((selectedAutoChars + candidate.chunk.charCount) > directorCharBudget && candidate.score.score < 6) return;
      selectedIds.add(candidate.chunk.id);
      selectedAutoCount += 1;
      selectedAutoChars += candidate.chunk.charCount;
    });

    let directorChunkCount = 0;
    let directorChars = 0;
    const directorChapterIds = new Set();
    const reasonCounts = {};

    allChunks.forEach(({ chapter, chunk }) => {
      const manualSelected = chunkDirectionMode(chunk) === 'director';
      const score = scoreByChunkId[chunk.id] || scoreChunkForDirector(chunk, chapter);
      const useDirector = selectedIds.has(chunk.id);
      const reasons = useDirector
        ? uniqueStrings((manualSelected ? ['manual director polish'] : []).concat(score.reasons || []))
        : ['one-click flash render'];
      byChunkId[chunk.id] = {
        modelId: useDirector ? directorModelId : currentModelId,
        label: useDirector ? 'Director' : 'Flash',
        source: useDirector ? (manualSelected ? 'manual' : (score.guaranteed ? 'structural' : 'adaptive')) : 'base',
        reasonText: reasons.slice(0, 3).join(', '),
        reasons
      };
      if (useDirector) {
        directorChunkCount += 1;
        directorChars += chunk.charCount;
        if (chapter.kind !== 'titles') directorChapterIds.add(chapter.index);
        reasons.filter((reason) => reason !== 'manual director polish').forEach((reason) => {
          reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
        });
      }
    });

    const topReasons = Object.keys(reasonCounts)
      .sort((a, b) => {
        if (reasonCounts[b] !== reasonCounts[a]) return reasonCounts[b] - reasonCounts[a];
        return a.localeCompare(b);
      })
      .slice(0, 3);

    return {
      mode: 'adaptive',
      modelId: currentModelId,
      directorModelId,
      byChunkId,
      totalChunks: allChunks.length,
      totalChars,
      directorChunkCount,
      directorChars,
      directorChapterCount: directorChapterIds.size,
      flashChunkCount: allChunks.length - directorChunkCount,
      flashChars: Math.max(0, totalChars - directorChars),
      topReasons
    };
  }

  function refreshBookDirectionPlan() {
    bookState.directionPlan = buildBookDirectionPlan(getBookModelId());
    return bookState.directionPlan;
  }

  function getBookDirectionPlan() {
    return bookState.directionPlan || refreshBookDirectionPlan();
  }

  function getChunkDirectionPlan(chunk) {
    const plan = getBookDirectionPlan();
    return plan && plan.byChunkId ? plan.byChunkId[chunk.id] : null;
  }

  function renderBookDirectionPanel() {
    const panel = document.getElementById('bookDirectionPanel');
    const note = document.getElementById('bookSelectiveDirectorNote');
    const btn = document.getElementById('bookGenerateBtn');
    if (!panel || !note || !btn) return;
    if (!bookState.chapters.length) {
      panel.style.display = 'none';
      note.textContent = 'Recommended for the main Narrate:AI flow. Director polish only applies when the primary engine is Narrate:AI Flash, and it uses the Director-compatible built-in voice set.';
      btn.textContent = '⚡ Generate Book Audio';
      return;
    }

    const modelId = getBookModelId();
    const plan = refreshBookDirectionPlan();
    let title = '';
    let summary = '';
    const chips = [];

    if (plan.mode === 'clone') {
      title = 'Custom cloned voice render';
      summary = 'Narrate:AI Clone will render every chunk. Selective Director polish is unavailable in cloned-voice mode.';
      note.textContent = 'Selective Director polish only applies when the primary engine is Narrate:AI Flash.';
      btn.textContent = '⚡ Generate Clone Book Audio';
    } else if (plan.mode === 'director_all') {
      title = 'Premium full-book direction';
      summary = 'Narrate:AI Director is the main engine for every chunk. Use this when you want an intentionally directed performance across the whole manuscript.';
      note.textContent = 'Director is acting as the primary engine here, so selective Flash-first polish is not used.';
      btn.textContent = '⚡ Generate Director Book Audio';
    } else if (plan.mode === 'adaptive') {
      title = 'Flash-first with selective Director polish';
      summary = 'Narrate:AI Flash remains the main engine. Director is planned for ' + plan.directorChunkCount + ' of ' + plan.totalChunks + ' chunks (' + plan.directorChars.toLocaleString() + ' chars) across ' + plan.directorChapterCount + ' chapters where the manuscript appears to need a more intentional performance.';
      note.textContent = 'Adaptive polish is active. Built-in voice choices are limited to the Director-compatible set so promoted chunks can be rerendered safely.';
      btn.textContent = '⚡ Generate Flash + Director Book Audio';
      chips.push('<span class="book-strategy-chip"><strong>Director pass</strong> ' + plan.directorChunkCount + ' chunks</span>');
      chips.push('<span class="book-strategy-chip"><strong>Director chars</strong> ' + plan.directorChars.toLocaleString() + '</span>');
      if (plan.topReasons.length) {
        chips.push('<span class="book-strategy-chip"><strong>Common triggers</strong> ' + escapeHtml(plan.topReasons.join(', ')) + '</span>');
      }
    } else {
      title = 'One-click Flash generation';
      summary = 'Narrate:AI Flash is the main engine for every chunk. Turn on selective Director polish when you want the app to promote selected passages for more intentional performance.';
      note.textContent = 'Flash is acting as the one-click audiobook engine. Turn this back on if you want Flash-first generation plus selective Director polish.';
      btn.textContent = '⚡ Generate Flash Book Audio';
    }

    panel.style.display = 'block';
    panel.innerHTML = '' +
      '<div class="book-strategy-head">' +
        '<div class="book-strategy-title">' + escapeHtml(title) + '</div>' +
        '<span class="book-mini-chip"><strong>' + escapeHtml(displayBookModelName(modelId)) + '</strong></span>' +
      '</div>' +
      '<div class="book-strategy-summary">' + escapeHtml(summary) + '</div>' +
      (chips.length ? '<div class="book-strategy-chip-row">' + chips.join('') + '</div>' : '');
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
        splitTextIntoChunkPlans(segment.text, settings).forEach((chunkPlan) => {
          const chunkText = chunkPlan.text;
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
            audioVersion: 0,
            directionMode: 'auto',
            pauseAfterSeconds: chunkPlan.pauseAfterSeconds || 0,
            splitReason: chunkPlan.splitReason || ''
          });
          chunkIndex += 1;
        });
      });
      chapters.push({
        index: chapters.length,
        title,
        kind: isTitle ? 'titles' : 'chapter',
        audioUrls: { wav: '', mp3: '' },
        needsMerge: false,
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

  function renderBookAssignments() {
    const container = document.getElementById('bookAssignRows');
    if (!container) return;
    const modelId = getBookModelId();
    const options = getCompatibleBookVoices(modelId);
    normalizeRoleAssignmentsForModel(modelId);
    if (!options.length) {
      const emptyMessage = modelId === CLONED_MODEL_ID
        ? 'No cloned voices are loaded for Narrate:AI Clone. Refresh the Voice Cloning library first.'
        : modelId === DESIGNED_MODEL_ID
          ? 'No designed voices are loaded for Narrate:AI Design. Create or refresh voices in the Voice Design Lab first.'
          : 'No compatible voices are available for the selected audiobook engine.';
      container.innerHTML = '<div class="book-empty-state">' + escapeHtml(emptyMessage) + '</div>';
      renderBookVoiceProfilePanel();
      return;
    }
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
    renderBookVoiceProfilePanel();
  }

  function getSelectedCustomVoiceProfiles() {
    const byVoice = new Map();
    bookState.roles.forEach((role) => {
      const profile = getVoiceProfile(role.voiceId);
      if (!profile) return;
      if (!byVoice.has(role.voiceId)) byVoice.set(role.voiceId, { profile, roles: [] });
      byVoice.get(role.voiceId).roles.push(role.label);
    });
    return Array.from(byVoice.values());
  }

  function renderBookVoiceProfilePanel() {
    const panel = document.getElementById('bookVoiceProfilePanel');
    if (!panel) return;
    const entries = getSelectedCustomVoiceProfiles();
    if (!entries.length) {
      panel.innerHTML = '';
      panel.style.display = 'none';
      return;
    }
    panel.style.display = 'block';
    const directionWarning = getBookProfileDirectionWarning(bookState.chapters);
    const warningHtml = directionWarning
      ? '<div style="margin-top:12px;background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.3);border-radius:10px;padding:10px 12px;color:var(--warn);font-size:0.78rem;line-height:1.45">' + escapeHtml(directionWarning) + '</div>'
      : '';
    panel.innerHTML = warningHtml + entries.map((entry) => {
      const profile = entry.profile;
      const presets = Object.keys(profile.sceneDirectionPresets || {});
      const presetButtons = presets.length
        ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">' + presets.map((key) => (
            '<button type="button" class="book-seg-action-btn" onclick="bookApplyVoiceScenePreset(\'' + escapeHtml(profile.voiceId) + '\',\'' + escapeHtml(key) + '\')">' + escapeHtml(key) + '</button>'
          )).join('') + '</div>'
        : '';
      return '' +
        '<div class="book-strategy-panel" style="display:block;margin-top:12px">' +
          '<div class="book-strategy-head">' +
            '<div>' +
              '<div class="book-strategy-title">Selected ' + escapeHtml(profile.voiceType === 'labDesigned' ? 'lab-designed' : 'custom') + ' voice: ' + escapeHtml(profile.voiceName) + '</div>' +
              '<div class="book-strategy-summary">Roles using this voice: ' + escapeHtml(entry.roles.join(', ')) + '</div>' +
            '</div>' +
            '<span class="book-mini-chip"><strong>' + escapeHtml(profile.provider || 'qwen') + '</strong></span>' +
          '</div>' +
          '<div class="book-strategy-chip-row">' +
            '<span class="book-strategy-chip"><strong>Voice ID</strong> ' + escapeHtml(profile.voiceValue || profile.voiceId) + '</span>' +
            '<span class="book-strategy-chip"><strong>Model</strong> ' + escapeHtml(profile.model || '') + '</span>' +
            '<span class="book-strategy-chip"><strong>Type</strong> ' + escapeHtml(profile.voiceType || 'custom') + '</span>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-top:12px">' +
            '<label style="display:flex;flex-direction:column;gap:6px;font-size:0.78rem;color:var(--muted);font-weight:700">Identity Prompt' +
              '<textarea data-voice-profile-field="identityPrompt" data-voice-id="' + escapeHtml(profile.voiceId) + '" oninput="bookUpdateVoiceProfileField(this)" style="min-height:104px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;color:var(--text);padding:10px;font:inherit;font-weight:500;line-height:1.45">' + escapeHtml(profile.identityPrompt || '') + '</textarea>' +
            '</label>' +
            '<label style="display:flex;flex-direction:column;gap:6px;font-size:0.78rem;color:var(--muted);font-weight:700">Scene Direction' +
              '<textarea data-voice-profile-field="sceneDirection" data-voice-id="' + escapeHtml(profile.voiceId) + '" oninput="bookUpdateVoiceProfileField(this)" style="min-height:104px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;color:var(--text);padding:10px;font:inherit;font-weight:500;line-height:1.45">' + escapeHtml(profile.sceneDirection || '') + '</textarea>' +
            '</label>' +
          '</div>' +
          presetButtons +
          '<div style="margin-top:10px;font-size:0.74rem;color:var(--muted);line-height:1.45">The voice ID and model are read-only. These notes are saved per voice and added to audiobook chunk metadata; they are only sent as provider instructions on compatible instruct-capable model paths.</div>' +
        '</div>';
    }).join('');
  }

  window.bookUpdateVoiceProfileField = function bookUpdateVoiceProfileField(input) {
    if (!input) return;
    persistVoiceProfile(input.dataset.voiceId, { [input.dataset.voiceProfileField]: input.value });
  };

  window.bookApplyVoiceScenePreset = function bookApplyVoiceScenePreset(voiceId, presetKey) {
    const profile = getVoiceProfile(voiceId);
    const value = profile && profile.sceneDirectionPresets ? profile.sceneDirectionPresets[presetKey] : '';
    if (!value) return;
    persistVoiceProfile(voiceId, { sceneDirection: value });
    renderBookVoiceProfilePanel();
  };

  window.bookSetRoleVoice = function bookSetRoleVoice(roleId, voiceId) {
    const role = bookState.roles.find((entry) => entry.id === roleId);
    if (!role) return;
    role.voiceId = voiceId;
    bookState.chapters.forEach((chapter) => {
      chapter.chunks.forEach((chunk) => {
        if (chunk.roleId === roleId) chunk.voiceId = voiceId;
      });
    });
    renderBookVoiceProfilePanel();
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

  function isChapterSelected(chapter) {
    if (!chapter) return false;
    if (chapter.kind === 'titles') {
      const includeTitles = document.getElementById('bookIncludeTitles');
      if (includeTitles && !includeTitles.checked) return false;
    }
    return chapter.includeInBook !== false;
  }

  function isChunkSelected(chunk) {
    return !!chunk && chunk.includeInBook !== false;
  }

  function getSelectedChapterEntries() {
    return bookState.chapters
      .map((chapter, index) => ({ chapter, index }))
      .filter((entry) => isChapterSelected(entry.chapter));
  }

  function getChapterStatus(chapter) {
    if (chapter.chunks.some((chunk) => chunk.status === 'processing')) return 'generating';
    if (chapter.chunks.some((chunk) => chunk.status === 'error')) return 'error';
    if (chapter.needsMerge) return 'stale';
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
    const plan = getChunkDirectionPlan(chunk);
    if (plan && plan.label) parts.push(plan.label);
    parts.push(chunk.sourceType === 'dialogue' ? 'Dialogue' : 'Narration');
    if (chunk.detectedCharacters.length) parts.push('Names: ' + chunk.detectedCharacters.join(', '));
    parts.push(chunk.charCount.toLocaleString() + ' chars');
    if (chunk.splitReason) parts.push('Split: ' + chunk.splitReason);
    if (Number(chunk.pauseAfterSeconds) > 0) parts.push('Pause +' + Number(chunk.pauseAfterSeconds).toFixed(1) + 's');
    if (plan && plan.label === 'Director' && plan.reasonText) parts.push(plan.reasonText);
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
    const staleChapters = bookState.chapters.filter((chapter) => chapter.needsMerge).length;
    target.textContent = chapterCount + ' chapters · ' + totalChunks + ' chunks · ' + doneChunks + ' generated' +
      (staleChapters ? ' · ' + staleChapters + ' chapter' + (staleChapters === 1 ? '' : 's') + ' need rebuild' : '') +
      (bookState.needsBookMerge ? ' · full book needs rebuild' : '');
  }

  function renderBookChapterList() {
    const list = document.getElementById('bookChapterList');
    if (!list) return;
    const plan = refreshBookDirectionPlan();
    const canPolishChunks = plan.mode === 'adaptive';
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
      const selectedChunksForChapter = chapter.chunks.filter(isChunkSelected);
      const canRebuildChapter = selectedChunksForChapter.length && selectedChunksForChapter.every((chunk) => chunk.status === 'done' && chunk.filename);
      const chapterSelected = isChapterSelected(chapter);
      const chapterDirectorCount = chapter.chunks.reduce((sum, chunk) => {
        const chunkPlan = plan.byChunkId ? plan.byChunkId[chunk.id] : null;
        return sum + (chunkPlan && chunkPlan.label === 'Director' ? 1 : 0);
      }, 0);
      const chapterCharacters = chapter.characters && chapter.characters.length ? chapter.characters.slice(0, 4).map((character) => {
        return '<span class="book-mini-chip"><strong>' + escapeHtml(character) + '</strong></span>';
      }).join('') : '<span class="book-mini-chip">No strong names in this chapter</span>';
      const chunkHtml = chapter.collapsed ? '' : '<div class="book-segments">' + chapter.chunks.map((chunk, chunkIndex) => {
        const isChunkPlayingNow = isChunkPlaying(chunk);
        const chunkPlan = plan.byChunkId ? plan.byChunkId[chunk.id] : null;
        const manualDirector = chunkDirectionMode(chunk) === 'director';
        const isDirectorChunk = !!(chunkPlan && chunkPlan.label === 'Director');
        const directorBtnLabel = manualDirector ? 'Dir ✓' : (isDirectorChunk ? 'Auto Dir' : '+ Dir');
        const rowClasses = ['book-seg-row', chunk.status];
        if (isChunkPlayingNow) rowClasses.push('active');
        const roleClass = getRoleColorClass(chunk.roleLabel);
        return '' +
          '<div class="' + rowClasses.join(' ') + '">' +
            '<div class="book-seg-num">' + (chunkIndex + 1) + '</div>' +
            '<input type="checkbox" ' + (isChunkSelected(chunk) ? 'checked' : '') + ' title="Include this chunk in chapter/book rebuilds" onclick="bookSetChunkIncluded(' + chapterIndex + ',' + chunkIndex + ', this.checked, event)" />' +
            '<div class="book-seg-voice ' + roleClass + '">' + escapeHtml(chunk.roleLabel) + '</div>' +
            '<div class="book-seg-body">' +
              '<div class="book-seg-text">' + escapeHtml(truncatePreview(chunk.text, 130)) + '</div>' +
              '<div class="book-seg-meta">' + escapeHtml(getChunkMetaText(chunk)) + '</div>' +
            '</div>' +
            '<div class="book-seg-status ' + chunk.status + '">' + escapeHtml(chunk.status) + '</div>' +
            '<div class="book-seg-actions">' +
              (canPolishChunks
                ? '<button class="book-seg-action-btn' + (isDirectorChunk ? ' director' : '') + '"' +
                  ' onclick="bookToggleChunkDirector(' + chapterIndex + ',' + chunkIndex + ', event)">' + directorBtnLabel + '</button>'
                : '') +
              '<button class="book-seg-action-btn' + (isChunkPlayingNow ? ' playing' : '') + '"' +
                (chunk.audioUrl ? '' : ' disabled') +
                ' onclick="bookPlayChunk(' + chapterIndex + ',' + chunkIndex + ', event)">' + (isChunkPlayingNow ? '⏹' : '▶') + '</button>' +
              '<input class="book-chunk-input" type="number" min="0" max="5" step="0.1" value="' + escapeHtml(String(Number(chunk.pauseAfterSeconds || 0).toFixed(1))) + '"' +
                ' title="Pause after this chunk in seconds" style="width:58px;padding:5px 6px;font-size:0.72rem" onchange="bookSetChunkPause(' + chapterIndex + ',' + chunkIndex + ', this.value, event)" />' +
              '<button class="book-seg-action-btn" onclick="bookRegenerateChunk(' + chapterIndex + ',' + chunkIndex + ', event)">↺</button>' +
            '</div>' +
          '</div>';
      }).join('') + '</div>';
      return '' +
        '<div class="book-chapter-card' + (playingChapter ? ' playing' : '') + '">' +
          '<div class="book-chapter-header" onclick="bookToggleChapter(' + chapterIndex + ', event)">' +
            '<div class="book-chapter-main">' +
              '<input type="checkbox" ' + (chapterSelected ? 'checked' : '') + ' title="Include this chapter in rebuilds/downloads" onclick="bookSetChapterIncluded(' + chapterIndex + ', this.checked, event)" />' +
              '<div class="book-chapter-toggle">' + (chapter.collapsed ? '+' : '−') + '</div>' +
              '<div class="book-chapter-main-text">' +
                '<div class="book-chapter-title">' + escapeHtml(chapter.title) + '</div>' +
                '<div class="book-chapter-meta">' +
                  '<span>' + chapter.chunks.length + ' chunks</span>' +
                  '<span>' + roleCount + ' roles</span>' +
                  (chapterDirectorCount ? '<span>' + chapterDirectorCount + ' Director</span>' : '') +
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
              '<button class="book-inline-btn" ' + (canRebuildChapter ? '' : 'disabled') + ' onclick="bookRebuildChapter(' + chapterIndex + ', event)">🔧 Rebuild</button>' +
              '<button class="book-inline-btn" onclick="bookGenerateChapter(' + chapterIndex + ', event)">' + (doneCount ? '⚡ Refresh' : '⚡ Generate') + '</button>' +
            '</div>' +
          '</div>' +
          chunkHtml +
        '</div>';
    }).join('');
    updateBookTreeStatus();
    syncRecoverableBookDownloads();
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

  window.bookSetChunkPause = function bookSetChunkPause(chapterIndex, chunkIndex, value, event) {
    if (event) event.stopPropagation();
    const chapter = bookState.chapters[chapterIndex];
    const chunk = chapter && chapter.chunks[chunkIndex];
    if (!chunk) return;
    chunk.pauseAfterSeconds = sanitizeSilence(value, 5);
    markChapterMergeStale(chapter);
    renderBookChapterList();
    addLog('Set pause after ' + chapter.title + ' chunk ' + (chunkIndex + 1) + ' to ' + chunk.pauseAfterSeconds.toFixed(1) + 's. Regenerate or refresh the chapter to rebuild merged audio.', 'info');
    void saveBookProject('chunk-pause-' + (chapterIndex + 1) + '-' + (chunkIndex + 1));
  };

  window.bookSetChapterIncluded = function bookSetChapterIncluded(chapterIndex, checked, event) {
    if (event) event.stopPropagation();
    const chapter = bookState.chapters[chapterIndex];
    if (!chapter) return;
    chapter.includeInBook = !!checked;
    bookState.needsBookMerge = true;
    bookState.outputs = { wav: '', mp3: '', zip: '' };
    renderBookChapterList();
    void saveBookProject('chapter-include-' + (chapterIndex + 1));
  };

  window.bookSetChunkIncluded = function bookSetChunkIncluded(chapterIndex, chunkIndex, checked, event) {
    if (event) event.stopPropagation();
    const chapter = bookState.chapters[chapterIndex];
    const chunk = chapter && chapter.chunks[chunkIndex];
    if (!chunk) return;
    chunk.includeInBook = !!checked;
    markChapterMergeStale(chapter);
    renderBookChapterList();
    void saveBookProject('chunk-include-' + (chapterIndex + 1) + '-' + (chunkIndex + 1));
  };

  window.bookToggleTitlesSelection = function bookToggleTitlesSelection(checked) {
    bookState.chapters.forEach((chapter) => {
      if (chapter.kind === 'titles') chapter.includeInBook = !!checked;
    });
    bookState.needsBookMerge = true;
    bookState.outputs = { wav: '', mp3: '', zip: '' };
    renderBookChapterList();
    void saveBookProject('titles-include');
  };

  function getModelPricing(modelId) {
    if (typeof PRICING !== 'undefined' && PRICING[modelId]) return PRICING[modelId];
    return { rate: 0.10 / 10000, label: '$0.10/10K chars' };
  }

  function updateBookEstimate() {
    const modelId = document.getElementById('bookModelSelect') ? document.getElementById('bookModelSelect').value : 'qwen3-tts-flash';
    const plan = refreshBookDirectionPlan();
    const totalChars = plan.totalChars;
    const totalSegments = plan.totalChunks;
    const directionPlanEl = document.getElementById('bcDirectionPlan');
    let gross = 0;
    let net = 0;
    let freeLeftLabel = '—';

    if (plan.mode === 'adaptive') {
      const flashPricing = getModelPricing(modelId);
      const directorPricing = getModelPricing(plan.directorModelId);
      const flashFamily = getBookModelFamily(modelId);
      const directorFamily = getBookModelFamily(plan.directorModelId);
      const flashUsed = typeof freeUsed !== 'undefined' ? (freeUsed[flashFamily] || 0) : 0;
      const directorUsed = typeof freeUsed !== 'undefined' ? (freeUsed[directorFamily] || 0) : 0;
      const flashFreeLeft = typeof FREE_QUOTA !== 'undefined' ? Math.max(0, FREE_QUOTA - flashUsed) : 0;
      const directorFreeLeft = typeof FREE_QUOTA !== 'undefined' ? Math.max(0, FREE_QUOTA - directorUsed) : 0;
      const flashBillable = Math.max(0, plan.flashChars - flashFreeLeft);
      const directorBillable = Math.max(0, plan.directorChars - directorFreeLeft);
      gross = (plan.flashChars * flashPricing.rate) + (plan.directorChars * directorPricing.rate);
      net = (flashBillable * flashPricing.rate) + (directorBillable * directorPricing.rate);
      freeLeftLabel = 'Flash ' + flashFreeLeft.toLocaleString() + ' / Director ' + directorFreeLeft.toLocaleString();
      if (directionPlanEl) directionPlanEl.textContent = plan.flashChunkCount + ' F / ' + plan.directorChunkCount + ' D';
    } else {
      const pricing = getModelPricing(modelId);
      const family = getBookModelFamily(modelId);
      const used = typeof freeUsed !== 'undefined' ? (freeUsed[family] || 0) : 0;
      const freeLeft = typeof FREE_QUOTA !== 'undefined' ? Math.max(0, FREE_QUOTA - used) : 0;
      const billable = Math.max(0, totalChars - freeLeft);
      gross = totalChars * pricing.rate;
      net = billable * pricing.rate;
      freeLeftLabel = freeLeft.toLocaleString();
      if (directionPlanEl) {
        directionPlanEl.textContent = plan.mode === 'director_all'
          ? 'All Director'
          : plan.mode === 'clone'
            ? 'All Clone'
            : plan.mode === 'design'
              ? 'All Design'
              : 'All Flash';
      }
    }

    document.getElementById('bcTotalChars').textContent = totalChars.toLocaleString();
    document.getElementById('bcSegments').textContent = totalSegments.toLocaleString();
    document.getElementById('bcGross').textContent = '$' + gross.toFixed(4);
    document.getElementById('bcFreeLeft').textContent = freeLeftLabel;
    document.getElementById('bcNetCost').textContent = '$' + net.toFixed(4);

    const warning = document.getElementById('bookLargeWarn');
    if (!warning) return;
    const notices = [];
    if (totalChars > 250000) notices.push('Large manuscript: generation may take a while. The workflow will process and merge chapter by chapter.');
    if (totalSegments > 500) notices.push('High segment count: consider increasing the max chunk size if you want fewer generation calls.');
    if (modelId === CLONED_MODEL_ID && !savedVoicesCache.length) notices.push('Cloned-voice model selected, but no saved cloned voices are currently loaded.');
    if (modelId === DESIGNED_MODEL_ID && !getCompatibleDesignedVoices(modelId).length) notices.push('Designed-voice model selected, but no saved designed voices are currently loaded. Create or refresh voices in the Voice Design Lab.');
    if (plan.mode === 'adaptive' && plan.directorChunkCount === 0) notices.push('Selective Director polish is on, but no chunks currently qualify. Use the + Dir button on a chunk if you want to force Director on a passage.');
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
      chunkingMode: document.getElementById('bookChunkingMode') ? document.getElementById('bookChunkingMode').value : 'balanced',
      emotionalMaxChars: sanitizeEmotionalMax(
        document.getElementById('bookEmotionalMax') ? document.getElementById('bookEmotionalMax').value : 1500,
        sanitizeChunkSize(document.getElementById('bookChunkSize').value)
      ),
      model: document.getElementById('bookModelSelect').value,
      selectiveDirector: !!(document.getElementById('bookSelectiveDirector') && document.getElementById('bookSelectiveDirector').checked),
      chunkSilence: sanitizeSilence(document.getElementById('bookChunkSilence').value, 5),
      titlePauseMarker: sanitizeTitlePauseMarker(document.getElementById('bookTitlePauseMarker').value),
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
      needsBookMerge: !!bookState.needsBookMerge,
      roles: bookState.roles,
      characters: bookState.characters,
      chapters: bookState.chapters,
      voiceProfiles: bookState.voiceProfiles || {},
      outputs: bookState.outputs
    };
  }

  async function postJson(url, payload) {
    const response = await (window.NarrateAPI && typeof window.NarrateAPI.fetch === 'function'
      ? window.NarrateAPI.fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
      : fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }));
    const data = await response.json().catch(() => ({}));
    if (window.NarrateAPI && typeof window.NarrateAPI.resolveUrl === 'function' && data && typeof data.url === 'string') {
      data.url = window.NarrateAPI.resolveUrl(data.url);
    }
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

  function basenameFromUrl(url) {
    if (!url) return '';
    try {
      const absolute = new URL(url, window.location.href);
      return decodeURIComponent(absolute.pathname.split('/').pop() || '');
    } catch (_) {
      return String(url).split('?')[0].split('/').pop() || '';
    }
  }

  function triggerBrowserDownload(url, filename) {
    const link = document.createElement('a');
    link.href = window.NarrateAPI && typeof window.NarrateAPI.resolveUrl === 'function'
      ? window.NarrateAPI.resolveUrl(url)
      : url;
    link.download = filename || basenameFromUrl(link.href) || '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function collectBookChapterFilenames() {
    return bookState.chapters
      .filter(isChapterSelected)
      .map((chapter) => basenameFromUrl(chapter.audioUrls && chapter.audioUrls.wav))
      .filter(Boolean);
  }

  function collectBookChunkFilenames() {
    return bookState.chapters.filter(isChapterSelected).flatMap((chapter) => (
      chapter.chunks.filter(isChunkSelected).map((chunk) => chunk.filename).filter(Boolean)
    ));
  }

  function collectBookOutputFilenames() {
    return [bookState.outputs.wav, bookState.outputs.mp3].map(basenameFromUrl).filter(Boolean);
  }

  function collectChapterSilenceAfter(chapter) {
    if (!chapter || !Array.isArray(chapter.chunks)) return [];
    const globalSilence = sanitizeSilence(document.getElementById('bookChunkSilence').value, 5);
    const selectedChunks = chapter.chunks.filter(isChunkSelected);
    return selectedChunks.slice(0, -1).map((chunk) => {
      const recommended = sanitizeSilence(chunk.pauseAfterSeconds || 0, 5);
      return Math.max(globalSilence, recommended);
    });
  }

  function ensureRoleAssignmentsValid(modelId) {
    const cloneIds = new Set(savedVoicesCache.map((voice) => voice.voice));
    const designIds = new Set(getCompatibleDesignedVoices(DESIGNED_MODEL_ID).map((voice) => voice.voice));
    for (const role of bookState.roles) {
      if (!role.voiceId) throw new Error('Role "' + role.label + '" is missing a voice assignment.');
      const cloneRecord = getCloneRecordByVoiceId(role.voiceId);
      const designedRecord = getDesignedRecordByVoiceId(role.voiceId);
      if (modelId === CLONED_MODEL_ID) {
        if (!cloneIds.has(role.voiceId)) {
          throw new Error('Role "' + role.label + '" must use a cloned voice when the cloned-voice model is selected.');
        }
        if (cloneRecord && cloneRecord.target_model !== CLONED_MODEL_ID) {
          throw new Error('Role "' + role.label + '" uses cloned voice "' + (cloneRecord.preferred_name || cloneRecord.voice) + '" with target model ' + cloneRecord.target_model + '. Re-clone it for ' + CLONED_MODEL_ID + ' before generating.');
        }
      } else if (cloneRecord) {
        throw new Error('Role "' + role.label + '" is assigned to cloned voice "' + (cloneRecord.preferred_name || cloneRecord.voice) + '" but the selected model is ' + modelId + '. Switch the book model to ' + CLONED_MODEL_ID + ' or assign a built-in voice.');
      } else if (modelId === DESIGNED_MODEL_ID) {
        if (!designIds.has(role.voiceId)) {
          throw new Error('Role "' + role.label + '" must use a designed voice when the designed-voice model is selected.');
        }
        if (designedRecord && (designedRecord.target_model || DESIGNED_MODEL_ID) !== DESIGNED_MODEL_ID) {
          throw new Error('Role "' + role.label + '" uses designed voice "' + (designedRecord.display_name || designedRecord.preferred_name || designedRecord.voice) + '" with target model ' + designedRecord.target_model + '. Recreate it for ' + DESIGNED_MODEL_ID + ' before generating.');
        }
      } else if (designedRecord) {
        throw new Error('Role "' + role.label + '" is assigned to designed voice "' + (designedRecord.display_name || designedRecord.preferred_name || designedRecord.voice) + '" but the selected model is ' + modelId + '. Switch the book model to ' + DESIGNED_MODEL_ID + ' or assign a built-in voice.');
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
    bookState.needsBookMerge = true;
    const panel = document.getElementById('bookDlPanel');
    if (panel) panel.classList.remove('show');
  }

  function markChapterMergeStale(chapter) {
    if (!chapter) return;
    chapter.needsMerge = true;
    chapter.audioUrls.wav = '';
    chapter.audioUrls.mp3 = '';
    invalidateBookOutputs();
  }

  function allBookChaptersHaveAudio() {
    return !!bookState.chapters.length && bookState.chapters.every((chapter) => (
      chapter.audioUrls && chapter.audioUrls.wav && chapter.chunks.every((chunk) => chunk.status === 'done' && chunk.filename)
    ));
  }

  function revealBookDownloadPanel(label, title) {
    const genPanel = document.getElementById('bookGenPanel');
    const dlPanel = document.getElementById('bookDlPanel');
    const dlTitle = document.getElementById('bookDlTitle');
    if (genPanel) genPanel.classList.add('show');
    if (dlPanel) dlPanel.classList.add('show');
    if (dlTitle) dlTitle.textContent = title || '✓ Generation complete! Download your audio:';
    if (label) updateBookProgress(1, 1, label);
  }

  function syncRecoverableBookDownloads() {
    if (bookState.generating || !allBookChaptersHaveAudio()) return false;
    if (bookState.outputs.wav || bookState.outputs.mp3) {
      revealBookDownloadPanel('Download files are ready.', '✓ Generation complete! Download your audio:');
      return true;
    }
    revealBookDownloadPanel(
      'Chapter audio is complete. Use a download button to rebuild the combined file.',
      '✓ Chapter audio complete. Final downloads can be rebuilt:'
    );
    return true;
  }

  function setBookOperationUi(active) {
    if (active) document.getElementById('bookGenPanel').classList.add('show');
    document.getElementById('bookCancelBtn').classList.toggle('show', !!active);
    document.getElementById('bookGenerateBtn').disabled = !!active || bookState.chapters.length === 0;
    const rebuildBtn = document.getElementById('bookRebuildBtn');
    if (rebuildBtn) rebuildBtn.disabled = !!active || bookState.chapters.length === 0;
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
    refreshBookDirectionPlan();
    syncRoleVoiceAssignments();
    ensureRoleAssignmentsValid(modelId);
    return { apiKey, modelId };
  }

  function markChunkGenerated(chunk, result, forceRegenerated) {
    const plan = getChunkDirectionPlan(chunk);
    chunk.status = 'done';
    chunk.filename = result.filename;
    chunk.audioVersion = (chunk.audioVersion || 0) + 1;
    chunk.lastModelId = plan ? plan.modelId : '';
    chunk.lastDirectionLabel = plan ? plan.label : '';
    chunk.audioUrl = cacheBustUrl(result.url, (forceRegenerated ? 'regen_' : 'gen_') + chunk.audioVersion + '_' + Date.now());
  }

  function confirmTtsSpend(scopeLabel, chunkCount, forceOverwrite) {
    const lines = [
      'This action will call TTS for ' + chunkCount + ' chunk' + (chunkCount === 1 ? '' : 's') + '.',
      forceOverwrite ? 'It will replace this project’s references to existing generated audio for ' + scopeLabel + '.' : 'It will create new generated audio for ' + scopeLabel + '.',
      'Provider charges may apply.',
      '',
      'Continue?'
    ];
    return window.confirm(lines.join('\n'));
  }

  function getBookMergeModelId() {
    const plan = getBookDirectionPlan();
    if (plan.mode === 'adaptive') return 'narrate_ai_flash_director_mix';
    return getBookModelId();
  }

  function getChunkGenerationInstructions(chunk) {
    const chapter = bookState.chapters[chunk.chapterIndex];
    const plan = getChunkDirectionPlan(chunk);
    const instructions = [];
    if (chapter && chapter.kind === 'titles') {
      instructions.push(
        'Maintain one continuous narrator identity for this entire title sequence.',
        'Speak slowly, clearly, and deliberately with a calm, polished audiobook tone.',
        'Use noticeably longer natural pauses where the pause markers appear between the title, series, volume, and author.',
        'Keep the mood and vocal texture consistent from start to finish, without resetting between sections.'
      );
    }
    if (plan && plan.label === 'Director' && (!chapter || chapter.kind !== 'titles')) {
      instructions.push(
        'Treat this passage as a premium audiobook performance beat.',
        'Keep the same narrator identity, but shape pacing, emphasis, and emotional contour more intentionally than a neutral read.',
        'Stay controlled and natural rather than theatrical.'
      );
      if (plan.reasonText) instructions.push('Focus on: ' + plan.reasonText + '.');
    }
    return instructions.join(' ');
  }

  function getChunkVoiceProfile(chunk) {
    const profile = getVoiceProfile(chunk && chunk.voiceId);
    if (!profile) return null;
    return {
      voiceName: profile.voiceName,
      voiceType: profile.voiceType,
      voiceId: profile.voiceValue || profile.voiceId,
      model: profile.model,
      provider: profile.provider || 'qwen',
      identityPrompt: profile.identityPrompt || '',
      sceneDirection: profile.sceneDirection || ''
    };
  }

  function buildProfileInstruction(profile) {
    if (!profile) return '';
    const parts = [];
    if (profile.identityPrompt) parts.push('VOICE IDENTITY:\n' + profile.identityPrompt);
    if (profile.sceneDirection) parts.push('SCENE DIRECTION:\n' + profile.sceneDirection);
    return parts.join('\n\n');
  }

  function getEffectiveChunkInstructions(chunk) {
    const plan = getChunkDirectionPlan(chunk);
    const base = getChunkGenerationInstructions(chunk);
    const profileInstruction = buildProfileInstruction(getChunkVoiceProfile(chunk));
    const supportsInstructions = plan && isBookDirectorModel(plan.modelId);
    return [base, supportsInstructions ? profileInstruction : ''].filter(Boolean).join('\n\n');
  }

  function chunkProfileDirectionHasEffect(chunk) {
    const profile = getChunkVoiceProfile(chunk);
    if (!profile || (!profile.identityPrompt && !profile.sceneDirection)) return true;
    const plan = getChunkDirectionPlan(chunk);
    return !!(plan && isBookDirectorModel(plan.modelId));
  }

  function getBookProfileDirectionWarning(chapters) {
    const targetChapters = chapters && chapters.length ? chapters : bookState.chapters;
    const profiledChunks = targetChapters.flatMap((chapter) => chapter.chunks).filter((chunk) => {
      const profile = getChunkVoiceProfile(chunk);
      return profile && (profile.identityPrompt || profile.sceneDirection);
    });
    if (!profiledChunks.length) return '';
    const effectiveCount = profiledChunks.filter(chunkProfileDirectionHasEffect).length;
    if (effectiveCount === profiledChunks.length) return '';
    if (effectiveCount > 0) {
      return 'Some selected chunks use custom voice profile notes, but only the Director-compatible chunks can apply those notes as provider instructions. Other clone/design/plain Flash chunks will keep the same voice ID/model and may not react to the scene direction.';
    }
    return 'The selected custom voice profile notes are saved as metadata, but the current engine does not support provider instructions for these chunks. Changing “angry”, “tense”, or similar scene direction text may not change the audio unless you use a Director-compatible path.';
  }

  function confirmBookOverwrite(scopeLabel, chapters) {
    const targetChapters = chapters && chapters.length ? chapters : bookState.chapters;
    const doneCount = targetChapters.reduce((sum, chapter) => (
      sum + chapter.chunks.filter((chunk) => chunk.status === 'done' && chunk.filename).length
    ), 0);
    if (!doneCount) return true;
    const warning = getBookProfileDirectionWarning(targetChapters);
    const message = [
      'Regenerate ' + scopeLabel + ' with the current settings?',
      '',
      'This will replace the project references for ' + doneCount + ' generated chunk' + (doneCount === 1 ? '' : 's') + ' and rebuild the chapter/book audio. Existing files may remain on disk, but this project will point to the new/overwritten output.',
      warning ? '\nNote: ' + warning : '',
      '',
      'Continue?'
    ].filter(Boolean).join('\n');
    return window.confirm(message);
  }

  async function generateBookChunk(chunk, modelId, apiKey, force) {
    const chapter = bookState.chapters[chunk.chapterIndex];
    const plan = getChunkDirectionPlan(chunk);
    const instructions = getEffectiveChunkInstructions(chunk);
    const voiceProfile = getChunkVoiceProfile(chunk);
    const filenameSettings = getBookFilenameSettings({
      voiceLabel: getBookVoiceFileLabel(chunk.voiceId),
      voiceSummary: getBookVoiceFileLabel(chunk.voiceId),
      settingsTag: instructions
        ? (chunk.sourceType === 'titles' ? 'title_sequence' : (plan && plan.label === 'Director' ? 'director_prompt' : 'custom_prompt'))
        : 'default_prompt'
    });
    const payload = {
      text: chunk.text,
      voiceId: chunk.voiceId,
      voiceLabel: filenameSettings.voiceLabel,
      apiKey,
      modelId: plan ? plan.modelId : modelId,
      projectId: bookState.projectId,
      projectTitle: bookState.title,
      chapterIndex: chunk.chapterIndex,
      chunkIndex: chunk.chunkIndex,
      chapterTitle: chapter ? chapter.title : '',
      roleLabel: chunk.roleLabel || '',
      sourceType: chunk.sourceType || '',
      language: bookState.language,
      instructions,
      voiceProfile,
      force: !!force,
      mode: filenameSettings.mode,
      voiceSummary: filenameSettings.voiceSummary,
      chunkSilence: filenameSettings.chunkSilence,
      chapterSilence: filenameSettings.chapterSilence,
      settingsTag: filenameSettings.settingsTag
    };
    return postJson(BOOK_API.generateChunk, payload);
  }

  async function mergeGeneratedChapter(chapterIndex) {
    const chapter = bookState.chapters[chapterIndex];
    if (!chapter) return null;
    const selectedChunks = chapter.chunks.filter(isChunkSelected);
    const filenames = selectedChunks.map((chunk) => chunk.filename).filter(Boolean);
    if (!selectedChunks.length || filenames.length !== selectedChunks.length) {
      chapter.audioUrls.wav = '';
      chapter.audioUrls.mp3 = '';
      return null;
    }
    const merged = await postJson(BOOK_API.mergeChapter, {
      projectId: bookState.projectId,
      projectTitle: bookState.title,
      chapterIndex,
      chapterTitle: chapter.title,
      filenames,
      isTitle: chapter.kind === 'titles',
      modelId: getBookMergeModelId(),
      language: bookState.language,
      silence: sanitizeSilence(document.getElementById('bookChunkSilence').value, 5),
      silence_after: collectChapterSilenceAfter(chapter),
      format: 'wav',
      ...getBookFilenameSettings()
    });
    chapter.audioUrls.wav = cacheBustUrl(merged.url, 'chapter_' + chapterIndex + '_' + Date.now());
    chapter.audioUrls.mp3 = '';
    chapter.needsMerge = false;
    bookState.needsBookMerge = true;
    bookState.outputs = { wav: '', mp3: '', zip: '' };
    return merged;
  }

  async function generateChapterChunks(chapterIndex, context, options) {
    const chapter = bookState.chapters[chapterIndex];
    if (!chapter) throw new Error('Chapter not found.');
    const onlyChunkIndex = options && Number.isInteger(options.onlyChunkIndex) ? options.onlyChunkIndex : null;
    const force = !!(options && options.force);
    const progress = options && options.progress ? options.progress : null;
    const indices = onlyChunkIndex === null
      ? chapter.chunks.map((chunk, index) => (isChunkSelected(chunk) ? index : -1)).filter((index) => index >= 0)
      : [onlyChunkIndex];

    for (let i = 0; i < indices.length; i += 1) {
      if (bookState.cancelRequested) break;
      const chunkIndex = indices[i];
      const chunk = chapter.chunks[chunkIndex];
      const chunkPlan = getChunkDirectionPlan(chunk);
      const currentDone = progress ? progress.done : i;
      const total = progress ? progress.total : indices.length;
      updateBookProgress(currentDone, total, 'Generating ' + chapter.title + ' · chunk ' + (chunkIndex + 1) + ' of ' + chapter.chunks.length + ' with ' + (chunkPlan ? chunkPlan.label : displayBookModelName(context.modelId)) + '...');
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
    if (onlyChunkIndex === null || chapter.chunks.filter(isChunkSelected).every((chunk) => chunk.status === 'done' && chunk.filename)) {
      await mergeGeneratedChapter(chapterIndex);
    } else {
      markChapterMergeStale(chapter);
    }
    renderBookChapterList();
    return true;
  }

  async function mergeFullBookOutput(format) {
    const result = await postJson(BOOK_API.mergeBook, {
      projectId: bookState.projectId,
      title: bookState.title,
      language: bookState.language,
      modelId: getBookMergeModelId(),
      chapter_filenames: collectBookChapterFilenames(),
      silence: sanitizeSilence(document.getElementById('bookChapterSilence').value, 10),
      format,
      ...getBookFilenameSettings()
    });
    bookState.outputs[format] = result.url;
    if (format === 'wav') bookState.needsBookMerge = false;
    revealBookDownloadPanel('Full-book ' + format.toUpperCase() + ' ready.', '✓ Generation complete! Download your audio:');
    return result;
  }

  window.bookRebuildChapter = async function bookRebuildChapter(chapterIndex, event) {
    if (event) event.stopPropagation();
    if (bookState.generating) {
      addLog('Another generation task is already running.', 'warn');
      return;
    }
    const chapter = bookState.chapters[chapterIndex];
    if (!chapter) return;
    const selectedChunks = chapter.chunks.filter(isChunkSelected);
    if (!selectedChunks.length || !selectedChunks.every((chunk) => chunk.status === 'done' && chunk.filename)) {
      addLog('Cannot rebuild chapter until every chunk has generated audio.', 'warn');
      return;
    }
    bookState.generating = true;
    setBookOperationUi(true);
    updateBookProgress(0, 1, 'Rebuilding ' + chapter.title + ' without TTS...');
    try {
      await mergeGeneratedChapter(chapterIndex);
      updateBookProgress(1, 1, 'Chapter rebuilt. Full book needs rebuild.');
      addLog('Rebuilt chapter audio for "' + chapter.title + '" without calling TTS.', 'success');
      await saveBookProject('chapter-rebuild-' + (chapterIndex + 1));
    } catch (error) {
      addLog('Chapter rebuild failed: ' + error.message, 'error');
    } finally {
      bookState.generating = false;
      setBookOperationUi(false);
      renderBookChapterList();
    }
  };

  window.bookRebuildFull = async function bookRebuildFull(format) {
    if (bookState.generating) {
      addLog('Another generation task is already running.', 'warn');
      return;
    }
    if (!bookState.projectId) {
      addLog('No audiobook project is loaded.', 'warn');
      return;
    }
    const staleChapters = bookState.chapters
      .map((chapter, index) => ({ chapter, index }))
      .filter((entry) => entry.chapter.needsMerge);
    const selectedEntries = getSelectedChapterEntries();
    if (!selectedEntries.length) {
      addLog('No chapters are selected for rebuild.', 'warn');
      return;
    }
    const unbuilt = selectedEntries.map((entry) => entry.chapter).filter((chapter) => !chapter.audioUrls || !chapter.audioUrls.wav);
    if (unbuilt.length && !unbuilt.every((chapter) => chapter.chunks.every((chunk) => chunk.status === 'done' && chunk.filename))) {
      addLog('Cannot rebuild selected book until each selected chapter has generated chunk audio.', 'warn');
      return;
    }
    bookState.generating = true;
    setBookOperationUi(true);
    updateBookProgress(0, Math.max(1, staleChapters.length + 1), 'Rebuilding full book without TTS...');
    try {
      const rebuildChapters = selectedEntries
        .filter((entry) => entry.chapter.needsMerge || !entry.chapter.audioUrls || !entry.chapter.audioUrls.wav);
      for (let i = 0; i < rebuildChapters.length; i += 1) {
        updateBookProgress(i, rebuildChapters.length + 1, 'Rebuilding ' + rebuildChapters[i].chapter.title + '...');
        await mergeGeneratedChapter(rebuildChapters[i].index);
      }
      const result = await mergeFullBookOutput(format === 'mp3' ? 'mp3' : 'wav');
      updateBookProgress(rebuildChapters.length + 1, rebuildChapters.length + 1, 'Selected book rebuilt.');
      triggerBrowserDownload(result.url, result.filename);
      addLog('Rebuilt full-book ' + (format === 'mp3' ? 'MP3' : 'WAV') + ' without calling TTS.', 'success');
      await saveBookProject('book-rebuild');
    } catch (error) {
      addLog('Full-book rebuild failed: ' + error.message, 'error');
    } finally {
      bookState.generating = false;
      setBookOperationUi(false);
      renderBookChapterList();
    }
  };

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
    bookState.needsBookMerge = false;
    bookState.cancelRequested = false;

    statusEl.textContent = 'Analysing manuscript...';
    addLog('Starting audiobook analysis (' + raw.length.toLocaleString() + ' chars).', 'info');

    const parsed = buildChapters(raw, settings);
    const meta = detectMetadata(raw, parsed.preamble);
    parsed.chapters = rebuildTitleChapterFromMetadata(parsed.chapters, meta, parsed.preamble, settings);
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
    renderBookDirectionPanel();
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

  window.bookToggleChunkDirector = function bookToggleChunkDirector(chapterIndex, chunkIndex, event) {
    if (event) event.stopPropagation();
    const plan = getBookDirectionPlan();
    if (plan.mode !== 'adaptive') {
      addLog('Selective Director polish is only available when Narrate:AI Flash is the primary engine and the Director polish toggle is enabled.', 'warn');
      return;
    }
    const chapter = bookState.chapters[chapterIndex];
    const chunk = chapter && chapter.chunks[chunkIndex];
    if (!chapter || !chunk) return;
    chunk.directionMode = chunkDirectionMode(chunk) === 'director' ? 'auto' : 'director';
    renderBookDirectionPanel();
    updateBookEstimate();
    renderBookChapterList();
    addLog(
      (chunk.directionMode === 'director' ? 'Locked Director polish for ' : 'Returned to automatic planning for ') +
      chapter.title + ' chunk ' + (chunkIndex + 1) + '. Regenerate the chunk to apply the updated plan.',
      'info'
    );
    void saveBookProject('direction-' + (chapterIndex + 1) + '-' + (chunkIndex + 1));
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
    const selectedChunks = chapter.chunks.filter(isChunkSelected);
    if (!selectedChunks.length) {
      addLog('No chunks are selected for this chapter.', 'warn');
      return;
    }
    const forceRefresh = selectedChunks.some((chunk) => chunk.status === 'done' && chunk.filename);
    if (!confirmTtsSpend('this chapter', selectedChunks.length, forceRefresh)) {
      addLog('Chapter generation cancelled before calling TTS.', 'warn');
      return;
    }
    if (forceRefresh && !confirmBookOverwrite('this chapter', [chapter])) {
      addLog('Chapter refresh cancelled before overwriting existing chunk references.', 'warn');
      return;
    }
    const directionPlan = getBookDirectionPlan();
    const chapterDirectorCount = directionPlan.mode === 'adaptive'
      ? chapter.chunks.filter((chunk) => {
          const chunkPlan = directionPlan.byChunkId ? directionPlan.byChunkId[chunk.id] : null;
          return chunkPlan && chunkPlan.label === 'Director';
        }).length
      : 0;

    bookState.generating = true;
    bookState.cancelRequested = false;
    setBookOperationUi(true);
    invalidateBookOutputs();
    chapter.audioUrls.wav = '';
    chapter.audioUrls.mp3 = '';

    const progress = { done: 0, total: selectedChunks.length };
    addLog(
      'Generating chapter audio for "' + chapter.title + '"' +
      (chapterDirectorCount ? ' with Director planned on ' + chapterDirectorCount + ' chunk' + (chapterDirectorCount === 1 ? '' : 's') + '.' : '.'),
      'info'
    );
    updateBookProgress(0, progress.total, 'Preparing ' + chapter.title + '...');

    try {
      const completed = await generateChapterChunks(chapterIndex, context, { progress, force: forceRefresh });
      if (bookState.cancelRequested || !completed) {
        addLog('Chapter generation cancelled for "' + chapter.title + '".', 'warn');
        updateBookProgress(progress.done, progress.total, 'Cancelled');
      } else {
        addLog('Chapter ready: ' + chapter.title + '.', 'success');
      }
      await saveBookProject('chapter-' + (chapterIndex + 1));
      if (typeof refreshUsageHistory === 'function') refreshUsageHistory();
    } catch (error) {
      addLog(error.message, 'error');
      await saveBookProject('chapter-error-' + (chapterIndex + 1));
      if (typeof refreshUsageHistory === 'function') refreshUsageHistory();
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
    if (!confirmTtsSpend('this chunk', 1, !!(chunk.status === 'done' && chunk.filename))) {
      addLog('Chunk regeneration cancelled before calling TTS.', 'warn');
      return;
    }
    if (chunk.status === 'done' && chunk.filename && !confirmBookOverwrite('this chunk', [{
      chunks: [chunk]
    }])) {
      addLog('Chunk regeneration cancelled before overwriting the existing chunk reference.', 'warn');
      return;
    }

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
      if (typeof refreshUsageHistory === 'function') refreshUsageHistory();
    } catch (error) {
      addLog(error.message, 'error');
      await saveBookProject('chunk-regen-error-' + (chapterIndex + 1) + '-' + (chunkIndex + 1));
      if (typeof refreshUsageHistory === 'function') refreshUsageHistory();
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
    const selectedEntriesForGeneration = getSelectedChapterEntries();
    if (!selectedEntriesForGeneration.length) {
      addLog('No chapters are selected for full-book generation.', 'warn');
      return;
    }
    const forceRefresh = selectedEntriesForGeneration.some(({ chapter }) => (
      chapter.chunks.some((chunk) => chunk.status === 'done' && chunk.filename)
    ));
    const totalChunksForTts = selectedEntriesForGeneration.reduce((sum, entry) => sum + entry.chapter.chunks.filter(isChunkSelected).length, 0);
    if (!totalChunksForTts) {
      addLog('No chunks are selected for full-book generation.', 'warn');
      return;
    }
    if (!confirmTtsSpend('the full book', totalChunksForTts, forceRefresh)) {
      addLog('Full-book generation cancelled before calling TTS.', 'warn');
      return;
    }
    if (forceRefresh && !confirmBookOverwrite('the selected book', selectedEntriesForGeneration.map((entry) => entry.chapter))) {
      addLog('Full-book regeneration cancelled before overwriting existing chunk references.', 'warn');
      return;
    }

    bookState.generating = true;
    bookState.cancelRequested = false;
    setBookOperationUi(true);
    invalidateBookOutputs();

    const totalChunks = selectedEntriesForGeneration.reduce((sum, entry) => sum + entry.chapter.chunks.filter(isChunkSelected).length, 0);
    const progress = { done: 0, total: totalChunks };
    const directionPlan = getBookDirectionPlan();

    addLog(
      'Starting audiobook generation for ' + totalChunks + ' chunks.' +
      (directionPlan.mode === 'adaptive'
        ? ' Flash is the main engine; Director is planned on ' + directionPlan.directorChunkCount + ' chunk' + (directionPlan.directorChunkCount === 1 ? '' : 's') + '.'
        : directionPlan.mode === 'director_all'
          ? ' Director will render the full book.'
          : directionPlan.mode === 'clone'
            ? ' Clone rendering is active for the full book.'
            : ' Flash will render the full book.'),
      'info'
    );
    updateBookProgress(0, totalChunks, 'Preparing generation...');

    try {
      for (let selectedIndex = 0; selectedIndex < selectedEntriesForGeneration.length; selectedIndex += 1) {
        const { chapter, index: chapterIndex } = selectedEntriesForGeneration[selectedIndex];
        const completed = await generateChapterChunks(chapterIndex, context, { progress, force: forceRefresh });
        if (!completed || bookState.cancelRequested) break;
        addLog('Merged chapter audio for ' + chapter.title + '.', 'debug');
        await saveBookProject('chapter-' + (chapterIndex + 1));
      }

      if (bookState.cancelRequested) {
        addLog('Audiobook generation cancelled by user.', 'warn');
        updateBookProgress(progress.done, progress.total, 'Cancelled');
      } else {
        updateBookProgress(totalChunks, totalChunks, 'Generation complete. Building full-book WAV...');
        await mergeFullBookOutput('wav');
        addLog('Full-book WAV ready.', 'success');
        await saveBookProject('book-complete');
        if (typeof refreshUsageHistory === 'function') refreshUsageHistory();
      }
    } catch (error) {
      addLog(error.message, 'error');
      if (allBookChaptersHaveAudio()) {
        revealBookDownloadPanel(
          'Chapter audio is complete. Use a download button to rebuild the combined file.',
          '✓ Chapter audio complete. Final downloads can be rebuilt:'
        );
        addLog('All chapter audio is available; combined downloads can be rebuilt without regenerating chunks.', 'warn');
      }
      await saveBookProject('generation-error');
      if (typeof refreshUsageHistory === 'function') refreshUsageHistory();
    } finally {
      bookState.generating = false;
      setBookOperationUi(false);
      renderBookChapterList();
      syncRecoverableBookDownloads();
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
      const selectedEntries = getSelectedChapterEntries();
      for (const entry of selectedEntries) {
        if (entry.chapter.needsMerge || !entry.chapter.audioUrls || !entry.chapter.audioUrls.wav) {
          if (entry.chapter.chunks.filter(isChunkSelected).every((chunk) => chunk.status === 'done' && chunk.filename)) {
            await mergeGeneratedChapter(entry.index);
          }
        }
      }
      const result = await mergeFullBookOutput(format);
      syncRecoverableBookDownloads();
      triggerBrowserDownload(result.url, result.filename);
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
      const result = await postJson(BOOK_API.zipBook, {
        projectId: bookState.projectId,
        title: bookState.title,
        language: bookState.language,
        modelId: getBookMergeModelId(),
        chunk_filenames: collectBookChunkFilenames(),
        chapter_filenames: collectBookChapterFilenames(),
        book_filenames: collectBookOutputFilenames(),
        ...getBookFilenameSettings()
      });
      bookState.outputs.zip = result.url;
      syncRecoverableBookDownloads();
      triggerBrowserDownload(result.url, result.filename);
      addLog('ZIP package ready.', 'success');
      await saveBookProject('download-zip');
    } catch (error) {
      addLog('ZIP build failed: ' + error.message, 'error');
    }
  };

  function wireBookInputs() {
    ['bookText', 'bookModeSelect', 'bookSepInput', 'bookChunkSize', 'bookChunkingMode', 'bookEmotionalMax', 'bookModelSelect', 'bookSelectiveDirector', 'bookChunkSilence', 'bookChapterSilence'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        if (!bookState.chapters.length) return;
        if (id === 'bookModelSelect' || id === 'bookSelectiveDirector') {
          bookState.settings = Object.assign({}, bookState.settings || {}, collectBookSettings());
          renderBookDirectionPanel();
          renderBookAssignments();
          renderBookChapterList();
          updateBookEstimate();
        }
      });
      el.addEventListener('change', () => {
        if (!bookState.chapters.length) return;
        if (id === 'bookModelSelect' || id === 'bookSelectiveDirector') {
          bookState.settings = Object.assign({}, bookState.settings || {}, collectBookSettings());
          renderBookDirectionPanel();
          renderBookAssignments();
          renderBookChapterList();
          updateBookEstimate();
        }
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
    renderBookDirectionPanel();
    addLog('Narrate-AI audiobook workflow v' + APP_BOOK_VERSION + ' loaded.', 'success');
  }

  initBookModule();
})();
