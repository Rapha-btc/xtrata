const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { URL } = require('url');

const PORT = parseInt(process.env.PORT || '3000', 10);
const ROOT_DIR = __dirname;
const OUTPUT_DIR = path.join(ROOT_DIR, 'output');
const CHUNKS_DIR = path.join(OUTPUT_DIR, 'chunks');
const CHAPTERS_DIR = path.join(OUTPUT_DIR, 'chapters');
const TITLES_DIR = path.join(OUTPUT_DIR, 'titles');
const BOOK_DIR = path.join(OUTPUT_DIR, 'book');
const PROJECTS_DIR = path.join(OUTPUT_DIR, 'projects');
const PACKAGES_DIR = path.join(OUTPUT_DIR, 'packages');
const TEMP_DIR = path.join(OUTPUT_DIR, 'temp');
const USAGE_HISTORY_PATH = path.join(OUTPUT_DIR, 'usage_history.json');
const PROVIDER_BILLING_STORE_PATH = path.join(OUTPUT_DIR, 'provider_billing_imports.json');
const PREVIEW_LIBRARY_DIR = path.join(ROOT_DIR, 'qwen3_voice_previews');
const LOCAL_CLONES_DIR = path.join(ROOT_DIR, 'qwen3_cloned_voices');
const LOCAL_DESIGNS_DIR = path.join(ROOT_DIR, 'qwen3_designed_voices');

const DASHSCOPE_BASE = 'https://dashscope-intl.aliyuncs.com/api/v1';
const GENERATION_URL = DASHSCOPE_BASE + '/services/aigc/multimodal-generation/generation';
const CUSTOMIZATION_URL = DASHSCOPE_BASE + '/services/audio/tts/customization';
const DEFAULT_CLONE_MODEL = 'qwen3-tts-vc-2026-01-22';
const DEFAULT_DESIGN_MODEL = 'qwen3-tts-vd-2026-01-26';
const DEFAULT_LIST_PAGE_SIZE = 100;
const MAX_LIST_PAGE_SIZE = 200;
const CUSTOM_VOICE_NAME_MAX = 16;
const INSTRUCT_TEXT_CHAR_LIMIT = 600;
const INSTRUCT_INSTRUCTIONS_CHAR_LIMIT = 600;
const PRICING = {
  'qwen3-tts-flash': 0.10 / 10000,
  'qwen3-tts-instruct-flash': 0.115 / 10000,
  'qwen3-tts-vc-2026-01-22': 0.115 / 10000,
  'qwen3-tts-vd-2026-01-26': 0.115 / 10000
};

[OUTPUT_DIR, CHUNKS_DIR, CHAPTERS_DIR, TITLES_DIR, BOOK_DIR, PROJECTS_DIR, PACKAGES_DIR, TEMP_DIR, PREVIEW_LIBRARY_DIR, LOCAL_CLONES_DIR, LOCAL_DESIGNS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

class AsyncQueue {
  constructor(concurrency) {
    this.concurrency = concurrency;
    this.active = 0;
    this.queue = [];
  }

  add(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.next();
    });
  }

  next() {
    if (this.active >= this.concurrency || this.queue.length === 0) return;
    this.active += 1;
    const item = this.queue.shift();
    item.fn()
      .then(item.resolve)
      .catch(item.reject)
      .finally(() => {
        this.active -= 1;
        this.next();
      });
  }
}

const synthQueue = new AsyncQueue(2);
const ffmpegQueue = new AsyncQueue(1);
let requestCounter = 0;

function nextRequestId() {
  requestCounter += 1;
  return 'req-' + String(requestCounter).padStart(4, '0');
}

function logRequest(requestId, message) {
  console.log('[Narrate AI v2.3][' + requestId + '] ' + message);
}

function mimeTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.md') return 'text/markdown; charset=utf-8';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.zip') return 'application/zip';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

function safeJoin(baseDir, requestPath) {
  const joined = path.normalize(path.join(baseDir, requestPath));
  if (!joined.startsWith(baseDir)) return null;
  return joined;
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readRequestBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  const buffer = await readRequestBuffer(req);
  if (!buffer.length) return {};
  return JSON.parse(buffer.toString('utf8'));
}

function parseMultipartBody(buffer, contentType) {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!boundaryMatch) throw new Error('Multipart boundary not found.');
  const boundaryToken = boundaryMatch[1] || boundaryMatch[2];
  const boundary = Buffer.from('--' + boundaryToken);
  const result = { fields: {}, files: {} };
  let cursor = 0;

  while (true) {
    const start = buffer.indexOf(boundary, cursor);
    if (start === -1) break;
    let partStart = start + boundary.length;
    const isFinal = buffer.slice(partStart, partStart + 2).toString() === '--';
    if (isFinal) break;
    if (buffer.slice(partStart, partStart + 2).toString() === '\r\n') partStart += 2;
    const nextBoundary = buffer.indexOf(boundary, partStart);
    if (nextBoundary === -1) break;
    let part = buffer.slice(partStart, nextBoundary);
    if (part.slice(-2).toString() === '\r\n') part = part.slice(0, -2);
    cursor = nextBoundary;

    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd === -1) continue;
    const headerText = part.slice(0, headerEnd).toString('utf8');
    const body = part.slice(headerEnd + 4);

    const disposition = /name="([^"]+)"(?:;\s*filename="([^"]+)")?/i.exec(headerText);
    if (!disposition) continue;
    const fieldName = disposition[1];
    const fileName = disposition[2];
    if (fileName) {
      const contentTypeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(headerText);
      result.files[fieldName] = {
        filename: fileName,
        contentType: contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream',
        buffer: body
      };
    } else {
      result.fields[fieldName] = body.toString('utf8');
    }
  }

  return result;
}

function httpRequestJson(targetUrl, options, payload) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(targetUrl);
    const transport = urlObj.protocol === 'http:' ? http : https;
    const requestOptions = Object.assign({
      method: 'POST',
      hostname: urlObj.hostname,
      port: urlObj.port || undefined,
      path: urlObj.pathname + urlObj.search,
      headers: {}
    }, options || {});

    const req = transport.request(requestOptions, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let data = {};
        if (raw) {
          try {
            data = JSON.parse(raw);
          } catch (error) {
            const preview = raw.slice(0, 300).replace(/\s+/g, ' ').trim();
            reject(new Error('Remote service returned a non-JSON response: ' + preview));
            return;
          }
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          const details = data && typeof data === 'object' ? JSON.stringify(data) : String(raw || '');
          const error = new Error(data.message || data.error || ('Remote request failed: ' + res.statusCode));
          error.statusCode = res.statusCode;
          error.remote = data;
          error.remoteDetails = details.slice(0, 1500);
          reject(error);
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(JSON.stringify(payload));
    req.end();
  });
}

function downloadBinary(targetUrl) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(targetUrl);
    const transport = urlObj.protocol === 'http:' ? http : https;
    const req = transport.get(urlObj, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error('Audio download failed: ' + res.statusCode));
        res.resume();
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const contentType = res.headers['content-type'] || 'application/octet-stream';
        const rawBuffer = Buffer.concat(chunks);
        resolve({
          buffer: /audio\/wav/i.test(contentType) ? normalizeWavBuffer(rawBuffer) : rawBuffer,
          contentType
        });
      });
    });
    req.on('error', reject);
  });
}

function normalizeWavBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44) return buffer;
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    return buffer;
  }

  let dataChunkOffset = -1;
  let cursor = 12;
  while (cursor + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', cursor, cursor + 4);
    const chunkSize = buffer.readUInt32LE(cursor + 4);
    if (chunkId === 'data') {
      dataChunkOffset = cursor;
      break;
    }
    const nextOffset = cursor + 8 + chunkSize + (chunkSize % 2);
    if (nextOffset <= cursor || nextOffset > buffer.length) break;
    cursor = nextOffset;
  }

  if (dataChunkOffset === -1) return buffer;

  const actualRiffSize = Math.max(0, buffer.length - 8);
  const actualDataSize = Math.max(0, buffer.length - (dataChunkOffset + 8));
  const storedRiffSize = buffer.readUInt32LE(4);
  const storedDataSize = buffer.readUInt32LE(dataChunkOffset + 4);
  if (storedRiffSize === actualRiffSize && storedDataSize === actualDataSize) return buffer;

  const normalized = Buffer.from(buffer);
  normalized.writeUInt32LE(actualRiffSize >>> 0, 4);
  normalized.writeUInt32LE(actualDataSize >>> 0, dataChunkOffset + 4);
  return normalized;
}

function repairWavHeaderOnDisk(filePath) {
  if (path.extname(filePath).toLowerCase() !== '.wav' || !fs.existsSync(filePath)) return false;
  const original = fs.readFileSync(filePath);
  const normalized = normalizeWavBuffer(original);
  if (normalized.equals(original)) return false;
  fs.writeFileSync(filePath, normalized);
  return true;
}

function repairWavHeadersInDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;
  let repaired = 0;
  fs.readdirSync(dirPath).forEach((name) => {
    const fullPath = path.join(dirPath, name);
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch (_) {
      return;
    }
    if (!stat.isFile()) return;
    try {
      if (repairWavHeaderOnDisk(fullPath)) repaired += 1;
    } catch (_) {}
  });
  return repaired;
}

const repairedPreviewLibraryCount = repairWavHeadersInDirectory(PREVIEW_LIBRARY_DIR);
const repairedDesignedVoiceCount = repairWavHeadersInDirectory(LOCAL_DESIGNS_DIR);
if (repairedPreviewLibraryCount || repairedDesignedVoiceCount) {
  console.log('[Narrate AI v2.3] Repaired WAV headers on startup. previews=' + repairedPreviewLibraryCount + ' designed=' + repairedDesignedVoiceCount);
}

function generateHash(input) {
  return crypto.createHash('md5').update(String(input)).digest('hex').slice(0, 12);
}

function slugifyFileStem(value, maxLen) {
  return String(value || 'clone')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, maxLen || 80) || 'clone';
}

function modelFileLabel(modelId) {
  const map = {
    'qwen3-tts-flash': 'flash',
    'qwen3-tts-instruct-flash': 'director',
    'qwen3-tts-vc-2026-01-22': 'clone_model',
    'qwen3-tts-vd-2026-01-26': 'design_model'
  };
  return map[String(modelId || '')] || slugifyFileStem(modelId || 'model', 20);
}

function languageFileLabel(language) {
  return slugifyFileStem(language || 'english', 12);
}

function buildTextFileLabel(text) {
  const normalized = String(text || '').trim();
  const snippet = slugifyFileStem(normalized.split(/\s+/).slice(0, 5).join(' '), 28);
  const hash = generateHash(normalized || 'text');
  return snippet ? 'txt_' + snippet + '_' + hash : 'txt_' + hash;
}

function buildFileName(parts, ext) {
  const cleanExt = String(ext || '').replace(/^\./, '') || 'wav';
  const stem = parts
    .map((part) => slugifyFileStem(part, 48))
    .filter(Boolean)
    .join('__')
    .slice(0, 240) || 'audio';
  return stem + '.' + cleanExt;
}

function buildDesignedPreviewFileName(options) {
  const previewExt = options.previewFormat === 'mp3' ? 'mp3' : options.previewFormat === 'opus' ? 'opus' : 'wav';
  return buildFileName([
    'design_lab',
    options.displayName || options.preferredName || options.voiceId,
    options.presetId || 'custom',
    'create_preview',
    options.language || 'english',
    modelFileLabel(options.targetModel),
    buildTextFileLabel(options.previewText || ''),
    generateHash(options.voiceId)
  ], previewExt);
}

function buildDesignedSampleFileName(record, options) {
  const sampleExt = options.format === 'mp3' ? 'mp3' : options.format === 'opus' ? 'opus' : 'wav';
  return buildFileName([
    'design_lab',
    record.display_name || record.preferred_name || record.voice,
    record.preset_id || 'custom',
    options.mode === 'english' ? 'english_check' : 'primary',
    options.language || record.language || 'english',
    modelFileLabel(record.target_model),
    buildTextFileLabel(options.text || ''),
    generateHash(record.voice)
  ], sampleExt);
}

function buildBookChunkFileName(body) {
  const hash = generateHash(body.text + body.voiceId + body.modelId + (body.instructions || ''));
  const chapterNumber = String((Number(body.chapterIndex) || 0) + 1).padStart(2, '0');
  const chunkNumber = String((Number(body.chunkIndex) || 0) + 1).padStart(3, '0');
  return buildFileName([
    body.projectId || 'book_project',
    'audiobook',
    body.projectTitle || body.projectId || 'book',
    'chapter_' + chapterNumber,
    body.chapterTitle || 'chapter',
    'chunk_' + chunkNumber,
    body.roleLabel || body.sourceType || 'narrator',
    body.voiceId || 'voice',
    modelFileLabel(body.modelId),
    languageFileLabel(body.language),
    body.instructions ? (body.sourceType === 'titles' ? 'title_sequence' : 'custom_prompt') : 'default',
    hash
  ], 'wav');
}

function buildMergedChapterFileName(body) {
  const format = body.format === 'mp3' ? 'mp3' : 'wav';
  const hash = generateHash(
    JSON.stringify([
      body.projectId,
      body.chapterIndex,
      body.chapterTitle,
      body.modelId,
      body.language,
      body.isTitle,
      body.silence,
      format,
      body.filenames || []
    ])
  );
  const chapterNumber = String((Number(body.chapterIndex) || 0) + 1).padStart(2, '0');
  return buildFileName([
    body.projectId || 'book_project',
    'audiobook',
    body.projectTitle || body.projectId || 'book',
    body.isTitle ? 'titles' : 'chapter_' + chapterNumber,
    body.chapterTitle || (body.isTitle ? 'titles' : 'chapter'),
    modelFileLabel(body.modelId),
    languageFileLabel(body.language),
    hash
  ], format);
}

function buildFullBookFileName(body) {
  const format = body.format === 'mp3' ? 'mp3' : 'wav';
  const hash = generateHash(
    JSON.stringify([
      body.projectId,
      body.title,
      body.language,
      body.modelId,
      body.silence,
      format,
      body.chapter_filenames || []
    ])
  );
  return buildFileName([
    body.projectId || 'book_project',
    'audiobook',
    body.title || body.projectId || 'book',
    'full_book',
    modelFileLabel(body.modelId),
    languageFileLabel(body.language),
    hash
  ], format);
}

function buildBookZipFileName(body, filenames) {
  const hash = generateHash(JSON.stringify([body.projectId, body.title, body.language, body.modelId, filenames]));
  return buildFileName([
    body.projectId || 'book_project',
    'audiobook_assets',
    body.title || body.projectId || 'book',
    modelFileLabel(body.modelId),
    languageFileLabel(body.language),
    hash
  ], 'zip');
}

function resolveExistingFilePath(filename, dirs) {
  const cleanName = path.basename(String(filename || ''));
  for (const dir of dirs) {
    const candidate = path.join(dir, cleanName);
    if (fs.existsSync(candidate)) return candidate;
  }
  return '';
}

function readLocalCloneRecordEntries() {
  if (!fs.existsSync(LOCAL_CLONES_DIR)) return [];
  return fs.readdirSync(LOCAL_CLONES_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      const fullPath = path.join(LOCAL_CLONES_DIR, file);
      try {
        return {
          fullPath,
          record: JSON.parse(fs.readFileSync(fullPath, 'utf8'))
        };
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
}

function readLocalCloneRecords() {
  return readLocalCloneRecordEntries().map((entry) => entry.record);
}

function readLocalDesignedVoiceRecords() {
  if (!fs.existsSync(LOCAL_DESIGNS_DIR)) return [];
  return fs.readdirSync(LOCAL_DESIGNS_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      const fullPath = path.join(LOCAL_DESIGNS_DIR, file);
      try {
        return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (Date.parse(b.gmt_create || '') || 0) - (Date.parse(a.gmt_create || '') || 0));
}

function saveLocalCloneRecord(voiceId, preferredName, targetModel, audioFile) {
  const safePreferredName = sanitizeVoiceKeyword(preferredName, voiceId || 'voice');
  const displayName = String(preferredName || safePreferredName || voiceId || 'Voice').trim() || safePreferredName || voiceId || 'Voice';
  const ext = path.extname(audioFile.filename || '').toLowerCase() || '.wav';
  const stem = slugifyFileStem(displayName || safePreferredName || voiceId);
  const hash = generateHash(voiceId);
  const audioFileName = stem + '_' + hash + ext;
  const jsonFileName = stem + '_' + hash + '.json';
  const audioPath = path.join(LOCAL_CLONES_DIR, audioFileName);
  const jsonPath = path.join(LOCAL_CLONES_DIR, jsonFileName);
  fs.writeFileSync(audioPath, audioFile.buffer);
  const record = {
    voice: voiceId,
    preferred_name: safePreferredName,
    display_name: displayName,
    target_model: targetModel,
    gmt_create: new Date().toISOString(),
    local_audio_file: audioFileName,
    local_audio_url: '/qwen3_cloned_voices/' + audioFileName,
    original_filename: audioFile.filename || '',
    source: 'local'
  };
  fs.writeFileSync(jsonPath, JSON.stringify(record, null, 2));
  return record;
}

function renameLocalCloneRecord(voiceId, preferredName) {
  const nextName = String(preferredName || '').trim();
  if (!nextName) throw new Error('Missing required field: preferred_name.');
  const entry = readLocalCloneRecordEntries().find((item) => item.record.voice === voiceId);
  if (!entry) throw new Error('Local clone record not found for voice: ' + voiceId);
  const updatedRecord = { ...entry.record, display_name: nextName };
  const nextMetadataPath = path.join(
    LOCAL_CLONES_DIR,
    slugifyFileStem(updatedRecord.display_name || updatedRecord.preferred_name || updatedRecord.voice) + '_' + generateHash(updatedRecord.voice) + '.json'
  );
  fs.writeFileSync(nextMetadataPath, JSON.stringify(updatedRecord, null, 2));
  if (entry.fullPath !== nextMetadataPath && fs.existsSync(entry.fullPath)) {
    fs.unlinkSync(entry.fullPath);
  }
  return updatedRecord;
}

function sanitizeVoiceKeyword(value, fallback) {
  return String(value || fallback || 'voice')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, CUSTOM_VOICE_NAME_MAX) || String(fallback || 'voice');
}

function modelFamily(modelId) {
  const raw = String(modelId || '').trim();
  if (raw === 'qwen3-tts-instruct-flash' || raw.startsWith('qwen3-tts-instruct-flash-')) return 'qwen3-tts-instruct-flash';
  return raw;
}

function isInstructModel(modelId) {
  return modelFamily(modelId) === 'qwen3-tts-instruct-flash';
}

function clampPageSize(pageSize) {
  const numeric = parseInt(pageSize, 10);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_LIST_PAGE_SIZE;
  return Math.min(MAX_LIST_PAGE_SIZE, numeric);
}

function trimTextToLimit(value, maxChars) {
  const text = String(value || '').trim();
  if (!maxChars || text.length <= maxChars) return text;
  return text.slice(0, maxChars).trim();
}

function normalizeSynthesisInstructions(modelId, instructions) {
  if (!isInstructModel(modelId)) return '';
  return trimTextToLimit(instructions, INSTRUCT_INSTRUCTIONS_CHAR_LIMIT);
}

function getSynthesisTextCharLimit(modelId) {
  return isInstructModel(modelId) ? INSTRUCT_TEXT_CHAR_LIMIT : 0;
}

function findSynthesisSplitIndex(text, maxChars) {
  const search = String(text || '').slice(0, maxChars + 1);
  const minIndex = Math.max(80, Math.floor(maxChars * 0.55));
  const patterns = [
    /\n\s*\n/g,
    /\n/g,
    /[.!?…。！？]+(?:\s+|$)/g,
    /[,;:，；：]+(?:\s+|$)/g,
    /\s+/g
  ];

  for (const pattern of patterns) {
    let match;
    let lastIndex = -1;
    while ((match = pattern.exec(search))) {
      const candidate = match.index + match[0].length;
      if (candidate >= minIndex && candidate <= maxChars) lastIndex = candidate;
      if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
    }
    pattern.lastIndex = 0;
    if (lastIndex !== -1) return lastIndex;
  }

  return maxChars;
}

function splitSynthesisText(text, maxChars) {
  const clean = String(text || '').trim();
  if (!clean) return [];
  if (!maxChars || clean.length <= maxChars) return [clean];

  const parts = [];
  let remaining = clean;
  while (remaining.length > maxChars) {
    const splitAt = Math.max(1, findSynthesisSplitIndex(remaining, maxChars));
    const part = remaining.slice(0, splitAt).trim();
    if (!part) break;
    parts.push(part);
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) parts.push(remaining);
  return parts.filter(Boolean);
}

function audioExtensionForContentType(contentType) {
  const clean = String(contentType || '').toLowerCase();
  if (clean.includes('mpeg') || clean.includes('mp3')) return 'mp3';
  return 'wav';
}

async function mergeSynthesisBuffers(results) {
  if (!Array.isArray(results) || !results.length) {
    throw new Error('No synthesized audio segments were produced.');
  }
  if (results.length === 1) return results[0];

  const ext = audioExtensionForContentType(results[0].contentType);
  const mergeId = 'synth_merge_' + generateHash(results.map((item) => String(item.buffer.length)).join(':') + Date.now());
  const outputPath = path.join(TEMP_DIR, mergeId + '_merged.' + ext);
  const inputPaths = results.map((item, index) => {
    const filePath = path.join(TEMP_DIR, mergeId + '_part_' + String(index + 1).padStart(2, '0') + '.' + ext);
    fs.writeFileSync(filePath, item.buffer);
    return filePath;
  });

  try {
    await mergeAudioFiles(inputPaths, outputPath, { format: ext });
    return {
      buffer: fs.readFileSync(outputPath),
      contentType: mimeTypeFor(outputPath)
    };
  } finally {
    inputPaths.forEach((filePath) => {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  }
}

function normalizeDesignLanguage(value) {
  const raw = String(value || '').trim().toLowerCase();
  const map = {
    zh: 'zh',
    chinese: 'zh',
    en: 'en',
    english: 'en',
    de: 'de',
    german: 'de',
    it: 'it',
    italian: 'it',
    pt: 'pt',
    portuguese: 'pt',
    es: 'es',
    spanish: 'es',
    ja: 'ja',
    japanese: 'ja',
    ko: 'ko',
    korean: 'ko',
    fr: 'fr',
    french: 'fr',
    ru: 'ru',
    russian: 'ru'
  };
  return map[raw] || 'en';
}

function saveLocalDesignedVoiceRecord(options) {
  const preferredName = sanitizeVoiceKeyword(options.preferredName, 'custom_voice');
  const stem = slugifyFileStem(options.displayName || preferredName || options.voiceId);
  const hash = generateHash(options.voiceId);
  const jsonFileName = stem + '_' + hash + '.json';
  const previewFileName = buildDesignedPreviewFileName(options);
  const previewPath = path.join(LOCAL_DESIGNS_DIR, previewFileName);
  const jsonPath = path.join(LOCAL_DESIGNS_DIR, jsonFileName);
  const previewBuffer = options.previewFormat === 'wav' ? normalizeWavBuffer(options.previewBuffer) : options.previewBuffer;
  fs.writeFileSync(previewPath, previewBuffer);
  const record = {
    voice: options.voiceId,
    preferred_name: preferredName,
    display_name: options.displayName || preferredName,
    target_model: options.targetModel,
    voice_prompt: options.voicePrompt,
    preview_text: options.previewText,
    language: options.language || 'en',
    preset_id: options.presetId || '',
    gmt_create: new Date().toISOString(),
    preview_audio_file: previewFileName,
    preview_audio_url: '/qwen3_designed_voices/' + previewFileName,
    preview_response_format: options.previewFormat || 'wav',
    source: 'local'
  };
  fs.writeFileSync(jsonPath, JSON.stringify(record, null, 2));
  return record;
}

function findLocalDesignedVoiceRecordPaths(voiceId) {
  const records = readLocalDesignedVoiceRecords();
  for (const record of records) {
    if (record.voice !== voiceId) continue;
    const metadataPath = path.join(LOCAL_DESIGNS_DIR, slugifyFileStem(record.display_name || record.preferred_name || record.voice) + '_' + generateHash(record.voice) + '.json');
    return { record, metadataPath };
  }
  return null;
}

function saveLocalDesignedVoiceSample(options) {
  const found = findLocalDesignedVoiceRecordPaths(options.voiceId);
  if (!found || !found.record || !found.metadataPath || !fs.existsSync(found.metadataPath)) {
    throw new Error('Designed voice record not found locally. Create or refresh the voice first.');
  }
  const record = Object.assign({}, found.record);
  const mode = options.mode === 'english' ? 'english' : 'native';
  const sampleFileName = buildDesignedSampleFileName(record, options);
  const samplePath = path.join(LOCAL_DESIGNS_DIR, sampleFileName);
  const priorFileKey = mode === 'english' ? 'english_sample_audio_file' : 'native_sample_audio_file';
  const priorUrlKey = mode === 'english' ? 'english_sample_audio_url' : 'native_sample_audio_url';
  const priorPath = record[priorFileKey] ? path.join(LOCAL_DESIGNS_DIR, record[priorFileKey]) : '';
  if (priorPath && fs.existsSync(priorPath) && path.basename(priorPath) !== sampleFileName) {
    fs.unlinkSync(priorPath);
  }
  const sampleBuffer = options.format === 'wav' ? normalizeWavBuffer(options.buffer) : options.buffer;
  fs.writeFileSync(samplePath, sampleBuffer);
  record[priorFileKey] = sampleFileName;
  record[priorUrlKey] = '/qwen3_designed_voices/' + sampleFileName;
  record[(mode === 'english' ? 'english_sample_language' : 'native_sample_language')] = options.language || '';
  record[(mode === 'english' ? 'english_sample_text' : 'native_sample_text')] = options.text || '';
  record[(mode === 'english' ? 'english_sample_saved_at' : 'native_sample_saved_at')] = new Date().toISOString();
  fs.writeFileSync(found.metadataPath, JSON.stringify(record, null, 2));
  return record;
}

function mergeCloneVoices(remoteVoices, localVoices) {
  const merged = new Map();
  (localVoices || []).forEach((voice) => {
    if (!voice || !voice.voice) return;
    merged.set(voice.voice, Object.assign({}, voice));
  });
  (remoteVoices || []).forEach((voice) => {
    if (!voice || !voice.voice) return;
    const existing = merged.get(voice.voice) || {};
    merged.set(voice.voice, Object.assign({}, existing, voice, {
      display_name: existing.display_name || voice.display_name || existing.preferred_name || voice.preferred_name || '',
      local_audio_file: existing.local_audio_file || voice.local_audio_file || '',
      local_audio_url: existing.local_audio_url || voice.local_audio_url || '',
      original_filename: existing.original_filename || voice.original_filename || '',
      source: existing.source ? 'local+remote' : 'remote'
    }));
  });
  return Array.from(merged.values()).sort((a, b) => {
    const aTime = Date.parse(a.gmt_create || '') || 0;
    const bTime = Date.parse(b.gmt_create || '') || 0;
    return bTime - aTime;
  });
}

function mergeDesignedVoices(remoteVoices, localVoices) {
  const merged = new Map();
  (localVoices || []).forEach((voice) => {
    if (!voice || !voice.voice) return;
    merged.set(voice.voice, Object.assign({}, voice));
  });
  (remoteVoices || []).forEach((voice) => {
    if (!voice || !voice.voice) return;
    const existing = merged.get(voice.voice) || {};
    merged.set(voice.voice, Object.assign({}, existing, voice, {
      preview_audio_file: existing.preview_audio_file || voice.preview_audio_file || '',
      preview_audio_url: existing.preview_audio_url || voice.preview_audio_url || '',
      source: existing.source ? 'local+remote' : 'remote'
    }));
  });
  return Array.from(merged.values()).sort((a, b) => {
    const aTime = Date.parse(a.gmt_create || '') || 0;
    const bTime = Date.parse(b.gmt_create || '') || 0;
    return bTime - aTime;
  });
}

async function listCustomizationVoices(apiKey, model, pageSize) {
  const safePageSize = clampPageSize(pageSize);
  const voices = [];

  for (let pageIndex = 0; pageIndex < 200; pageIndex += 1) {
    const payload = {
      model,
      input: {
        action: 'list',
        page_size: safePageSize,
        page_index: pageIndex
      }
    };

    const response = await httpRequestJson(CUSTOMIZATION_URL, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      }
    }, payload);

    const pageVoices = (response.output && response.output.voice_list) || [];
    if (!pageVoices.length) break;
    voices.push(...pageVoices);
    if (pageVoices.length < safePageSize) break;
  }

  return voices;
}

function modelRate(modelId) {
  return PRICING[modelId] || PRICING['qwen3-tts-flash'];
}

async function qwenSynthesizeToBuffer(options) {
  const modelId = String(options.model || '').trim();
  const text = String(options.text || '').trim();
  const instructions = normalizeSynthesisInstructions(modelId, options.instructions);
  const textSegments = splitSynthesisText(text, getSynthesisTextCharLimit(modelId));
  if (!textSegments.length) {
    throw new Error('Missing required synthesis text.');
  }

  async function synthesizeSegment(segmentText) {
    const payload = {
      model: modelId,
      input: {
        text: segmentText,
        voice: options.voice,
        language_type: options.language || 'English'
      }
    };
    if (instructions) {
      payload.parameters = {
        instructions,
        optimize_instructions: true
      };
    }

    const response = await synthQueue.add(() => httpRequestJson(GENERATION_URL, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + options.apiKey,
        'Content-Type': 'application/json'
      }
    }, payload));

    const audioUrl =
      response &&
      response.output &&
      response.output.audio &&
      response.output.audio.url;

    if (!audioUrl) {
      throw new Error('DashScope did not return an audio URL.');
    }

    return downloadBinary(audioUrl);
  }

  if (textSegments.length === 1) {
    return synthesizeSegment(textSegments[0]);
  }

  const results = [];
  for (const segmentText of textSegments) {
    results.push(await synthesizeSegment(segmentText));
  }
  return mergeSynthesisBuffers(results);
}

async function createClonedVoice(apiKey, preferredName, audioFile) {
  const safePreferredName = sanitizeVoiceKeyword(preferredName, 'custom_voice');
  const dataUri = 'data:' + audioFile.contentType + ';base64,' + audioFile.buffer.toString('base64');
  const payload = {
    model: 'qwen-voice-enrollment',
    input: {
      action: 'create',
      target_model: DEFAULT_CLONE_MODEL,
      preferred_name: safePreferredName,
      audio: { data: dataUri }
    }
  };

  const response = await httpRequestJson(CUSTOMIZATION_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    }
  }, payload);

  const voiceId = response && response.output && response.output.voice;
  if (!voiceId) throw new Error('Voice cloning succeeded but no voice ID was returned.');
  return voiceId;
}

async function createDesignedVoice(apiKey, options) {
  const preferredName = sanitizeVoiceKeyword(options.preferredName, 'custom_voice');
  const languageCode = normalizeDesignLanguage(options.language);
  const debugMeta = {
    preferredName,
    rawLanguage: String(options.language || ''),
    normalizedLanguage: languageCode,
    targetModel: options.targetModel || DEFAULT_DESIGN_MODEL,
    previewChars: String(options.previewText || '').length,
    promptChars: String(options.voicePrompt || '').length
  };
  const payload = {
    model: 'qwen-voice-design',
    input: {
      action: 'create',
      target_model: options.targetModel || DEFAULT_DESIGN_MODEL,
      voice_prompt: options.voicePrompt,
      preview_text: options.previewText,
      preferred_name: preferredName,
      language: languageCode
    },
    parameters: {
      sample_rate: 24000,
      response_format: 'wav'
    }
  };

  let response;
  try {
    response = await httpRequestJson(CUSTOMIZATION_URL, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      }
    }, payload);
  } catch (error) {
    error.debugMeta = debugMeta;
    throw error;
  }

  const output = response && response.output ? response.output : {};
  const previewAudio = output.preview_audio || {};
  const voiceId = output.voice;
  const previewData = previewAudio.data;
  if (!voiceId || !previewData) throw new Error('Voice design succeeded but no preview audio or voice ID was returned.');
  return {
    voiceId,
    targetModel: output.target_model || options.targetModel || DEFAULT_DESIGN_MODEL,
    preferredName,
    previewBuffer: (previewAudio.response_format || 'wav') === 'wav'
      ? normalizeWavBuffer(Buffer.from(previewData, 'base64'))
      : Buffer.from(previewData, 'base64'),
    previewFormat: previewAudio.response_format || 'wav',
    previewSampleRate: previewAudio.sample_rate || 24000,
    count: response && response.usage && response.usage.count ? response.usage.count : 1
  };
}

async function listClonedVoices(apiKey, pageSize) {
  return listCustomizationVoices(apiKey, 'qwen-voice-enrollment', pageSize);
}

async function listDesignedVoices(apiKey, pageSize) {
  return listCustomizationVoices(apiKey, 'qwen-voice-design', pageSize);
}

async function deleteClonedVoice(apiKey, voiceId) {
  const payload = {
    model: 'qwen-voice-enrollment',
    input: {
      action: 'delete',
      voice: voiceId
    }
  };

  await httpRequestJson(CUSTOMIZATION_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    }
  }, payload);
}

async function deleteDesignedVoice(apiKey, voiceId) {
  const payload = {
    model: 'qwen-voice-design',
    input: {
      action: 'delete',
      voice: voiceId
    }
  };

  await httpRequestJson(CUSTOMIZATION_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    }
  }, payload);
}

function deleteLocalCloneRecord(voiceId) {
  readLocalCloneRecordEntries().forEach((entry) => {
    const record = entry.record;
    if (record.voice !== voiceId) return;
    const audioPath = record.local_audio_file ? path.join(LOCAL_CLONES_DIR, record.local_audio_file) : '';
    if (entry.fullPath && fs.existsSync(entry.fullPath)) fs.unlinkSync(entry.fullPath);
    if (audioPath && fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
  });
}

function deleteLocalDesignedVoiceRecord(voiceId) {
  readLocalDesignedVoiceRecords().forEach((record) => {
    if (record.voice !== voiceId) return;
    const metadataPath = path.join(LOCAL_DESIGNS_DIR, slugifyFileStem(record.display_name || record.preferred_name || record.voice) + '_' + generateHash(record.voice) + '.json');
    const previewPath = record.preview_audio_file ? path.join(LOCAL_DESIGNS_DIR, record.preview_audio_file) : '';
    const nativeSamplePath = record.native_sample_audio_file ? path.join(LOCAL_DESIGNS_DIR, record.native_sample_audio_file) : '';
    const englishSamplePath = record.english_sample_audio_file ? path.join(LOCAL_DESIGNS_DIR, record.english_sample_audio_file) : '';
    if (metadataPath && fs.existsSync(metadataPath)) fs.unlinkSync(metadataPath);
    if (previewPath && fs.existsSync(previewPath)) fs.unlinkSync(previewPath);
    if (nativeSamplePath && fs.existsSync(nativeSamplePath)) fs.unlinkSync(nativeSamplePath);
    if (englishSamplePath && fs.existsSync(englishSamplePath)) fs.unlinkSync(englishSamplePath);
  });
}

const execute = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args);
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
  child.on('error', reject);
  child.on('close', (code) => {
    if (code === 0) resolve();
    else reject(new Error(command + ' exited with ' + code + ': ' + stderr));
  });
});

async function createSilenceFile(duration) {
  const name = 'silence_' + String(duration).replace('.', '_') + 's.wav';
  const filePath = path.join(TEMP_DIR, name);
  if (fs.existsSync(filePath)) return filePath;
  await execute('ffmpeg', [
    '-f', 'lavfi',
    '-i', 'anullsrc=r=24000:cl=mono',
    '-t', String(duration),
    '-ar', '24000',
    '-ac', '1',
    '-c:a', 'pcm_s16le',
    '-y',
    filePath
  ]);
  return filePath;
}

async function mergeAudioFiles(inputPaths, outputPath, options) {
  return ffmpegQueue.add(async () => {
    let files = inputPaths.slice();
    const silence = options && options.silence ? options.silence : 0;
    const format = options && options.format ? options.format : 'wav';

    if (silence > 0) {
      const silenceFile = await createSilenceFile(silence);
      const interleaved = [];
      files.forEach((filePath, index) => {
        interleaved.push(filePath);
        if (index < files.length - 1) interleaved.push(silenceFile);
      });
      files = interleaved;
    }

    const listPath = outputPath + '.list.txt';
    const listContent = files.map((filePath) => "file '" + filePath.replace(/'/g, "'\\''") + "'").join('\n');
    fs.writeFileSync(listPath, listContent);
    const codecArgs = format === 'mp3'
      ? ['-c:a', 'libmp3lame', '-b:a', '128k']
      : ['-c:a', 'pcm_s16le'];

    try {
      await execute('ffmpeg', [
        '-f', 'concat',
        '-safe', '0',
        '-i', listPath,
        '-ar', '24000',
        '-ac', '1',
        ...codecArgs,
        '-y',
        outputPath
      ]);
    } finally {
      if (fs.existsSync(listPath)) fs.unlinkSync(listPath);
    }
  });
}

function collectBookMergeInputs(projectId, sourceFormat, explicitFilenames) {
  if (Array.isArray(explicitFilenames) && explicitFilenames.length) {
    return explicitFilenames
      .map((filename, index) => {
        const filePath = resolveExistingFilePath(filename, [TITLES_DIR, CHAPTERS_DIR]);
        return filePath ? { path: filePath, index } : null;
      })
      .filter(Boolean);
  }
  const inputs = [];
  const titleFile = path.join(TITLES_DIR, projectId + '_titles.' + sourceFormat);
  if (fs.existsSync(titleFile)) inputs.push({ path: titleFile, index: -1 });
  fs.readdirSync(CHAPTERS_DIR)
    .filter((file) => file.startsWith(projectId + '_chapter_') && file.endsWith('.' + sourceFormat))
    .forEach((file) => {
      const match = file.match(/_chapter_(\d+)(?:_|\.|__)/);
      if (match) inputs.push({ path: path.join(CHAPTERS_DIR, file), index: parseInt(match[1], 10) });
    });
  inputs.sort((a, b) => a.index - b.index);
  return inputs;
}

function projectFilePath(projectId) {
  return path.join(PROJECTS_DIR, projectId + '.json');
}

function saveProjectPayload(payload) {
  const projectId = payload.id || ('book_' + Date.now().toString(36));
  payload.id = projectId;
  payload.updatedAt = new Date().toISOString();
  fs.writeFileSync(projectFilePath(projectId), JSON.stringify(payload, null, 2));
  return projectId;
}

function listProjects() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  return fs.readdirSync(PROJECTS_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      const fullPath = path.join(PROJECTS_DIR, file);
      try {
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        return {
          id: data.id || file.replace(/\.json$/, ''),
          title: data.title || 'Untitled',
          author: data.author || 'Unknown',
          updatedAt: data.updatedAt || fs.statSync(fullPath).mtime.toISOString()
        };
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function readUsageHistory() {
  if (!fs.existsSync(USAGE_HISTORY_PATH)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(USAGE_HISTORY_PATH, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeUsageHistory(entries) {
  fs.writeFileSync(USAGE_HISTORY_PATH, JSON.stringify(entries, null, 2));
}

function readProviderBillingStore() {
  if (!fs.existsSync(PROVIDER_BILLING_STORE_PATH)) return { imports: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(PROVIDER_BILLING_STORE_PATH, 'utf8'));
    if (Array.isArray(parsed)) return { imports: parsed };
    if (parsed && Array.isArray(parsed.imports)) return parsed;
  } catch (_) {}
  return { imports: [] };
}

function writeProviderBillingStore(store) {
  const normalized = store && Array.isArray(store.imports) ? store : { imports: [] };
  fs.writeFileSync(PROVIDER_BILLING_STORE_PATH, JSON.stringify(normalized, null, 2));
}

function apiKeyFingerprint(apiKey) {
  const clean = String(apiKey || '').trim();
  if (!clean) return '';
  return crypto.createHash('sha256').update(clean).digest('hex').slice(0, 16);
}

function apiKeyLabel(apiKey) {
  const clean = String(apiKey || '').trim();
  if (!clean) return '';
  const prefix = clean.slice(0, Math.min(6, clean.length));
  const suffix = clean.length > 4 ? clean.slice(-4) : clean;
  return prefix + '…' + suffix;
}

function trimTextPreview(text, maxLen) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length > maxLen ? clean.slice(0, maxLen - 1) + '…' : clean;
}

function normalizeCsvHeader(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseCsvText(csvText) {
  const text = String(csvText || '');
  const rows = [];
  let row = [];
  let field = '';
  let index = 0;
  let inQuotes = false;

  while (index < text.length) {
    const ch = text[index];
    if (inQuotes) {
      if (ch === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += ch;
      index += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      index += 1;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      index += 1;
      continue;
    }
    if (ch === '\r') {
      if (text[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      index += 1;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      index += 1;
      continue;
    }
    field += ch;
    index += 1;
  }

  row.push(field);
  if (row.length > 1 || String(row[0] || '').trim()) rows.push(row);
  return rows;
}

function makeUniqueHeaders(headers) {
  const seen = new Map();
  return headers.map((header, index) => {
    const base = normalizeCsvHeader(header) || ('column_' + index);
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    return count ? (base + '_' + (count + 1)) : base;
  });
}

function csvRowsToObjects(csvText) {
  const rows = parseCsvText(csvText);
  if (!rows.length) return { headers: [], records: [] };
  const headers = makeUniqueHeaders(rows[0]);
  const records = rows
    .slice(1)
    .filter((row) => row.some((cell) => String(cell || '').trim()))
    .map((row) => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = row[index] !== undefined ? row[index] : '';
      });
      return record;
    });
  return { headers, records };
}

function firstPresent(record, keys) {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

function parseLooseNumber(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9+-.]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '+') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function monthKeyFromValue(value) {
  const text = String(value || '').trim();
  const match = /^(\d{4}-\d{2})/.exec(text);
  return match ? match[1] : '';
}

function looksLikeModelStudioModelName(value) {
  return /^(qwen|wan|cosyvoice|text-embedding|multimodal-embedding|omni)/i.test(String(value || '').trim());
}

function parseProviderInstanceId(value) {
  const raw = String(value || '').trim();
  const parts = raw ? raw.split(';').map((part) => part.trim()).filter(Boolean) : [];
  const parsed = {
    raw,
    parts,
    billing_type: '',
    workspace_id: '',
    model_name: '',
    io_type: '',
    invocation_channel: ''
  };
  if (parts.length >= 5) {
    const tail = parts.slice(-5);
    parsed.billing_type = tail[0] || '';
    parsed.workspace_id = tail[1] || '';
    parsed.model_name = tail[2] || '';
    parsed.io_type = tail[3] || '';
    parsed.invocation_channel = tail[4] || '';
  }
  return parsed;
}

function isLikelyModelStudioBillingRow(record, parsedInstance, modelName, productName, productDetail) {
  const productText = [productName, productDetail].join(' ').toLowerCase();
  if (productText.includes('model studio')) return true;
  if (productText.includes('foundation model inference')) return true;
  if (productText.includes('speech synthesis')) return true;
  if (looksLikeModelStudioModelName(modelName)) return true;
  if (looksLikeModelStudioModelName(parsedInstance.model_name)) return true;
  return false;
}

function flattenProviderBillingEntries(store) {
  return (store && Array.isArray(store.imports) ? store.imports : [])
    .flatMap((entry) => Array.isArray(entry.entries) ? entry.entries : []);
}

function summarizeProviderImport(importRecord) {
  const entries = Array.isArray(importRecord.entries) ? importRecord.entries : [];
  const modelSet = new Set(entries.map((entry) => entry.model_name).filter(Boolean));
  const apiKeySet = new Set(entries.map((entry) => entry.api_key_id).filter(Boolean));
  const monthSet = new Set(entries.map((entry) => entry.month_key).filter(Boolean));
  const amount = entries.reduce((sum, entry) => sum + Number(entry.provider_amount_usd || 0), 0);
  return {
    id: importRecord.id,
    source_file: importRecord.source_file || '',
    imported_at: importRecord.imported_at || '',
    source_hash: importRecord.source_hash || '',
    row_count: entries.length,
    parsed_row_count: Number(importRecord.parsed_row_count || entries.length),
    month_keys: Array.from(monthSet).sort(),
    model_count: modelSet.size,
    api_key_count: apiKeySet.size,
    total_amount_usd: Number(amount.toFixed(6))
  };
}

function summarizeProviderEntries(entries) {
  const apiKeySet = new Set();
  const modelSet = new Set();
  const channelSet = new Set();
  let totalAmount = 0;
  entries.forEach((entry) => {
    if (entry.api_key_id) apiKeySet.add(entry.api_key_id);
    if (entry.model_name) modelSet.add(entry.model_name);
    if (entry.invocation_channel) channelSet.add(entry.invocation_channel);
    totalAmount += Number(entry.provider_amount_usd || 0);
  });
  return {
    row_count: entries.length,
    total_amount_usd: Number(totalAmount.toFixed(6)),
    distinct_api_key_count: apiKeySet.size,
    distinct_model_count: modelSet.size,
    distinct_channel_count: channelSet.size
  };
}

function buildProviderBillingImport(csvText, sourceFile) {
  const trimmed = String(csvText || '').trim();
  if (!trimmed) throw new Error('Provider bill CSV is empty.');
  const parsed = csvRowsToObjects(trimmed);
  if (!parsed.records.length) throw new Error('Provider bill CSV did not contain any data rows.');

  const importHash = crypto.createHash('sha256').update(trimmed).digest('hex');
  const importId = 'provider-bill-' + importHash.slice(0, 12);
  const importedAt = new Date().toISOString();
  const entries = [];

  parsed.records.forEach((record, index) => {
    const billingCycle = firstPresent(record, ['billing_cycle', 'billingcycle']);
    const billingDate = firstPresent(record, [
      'billing_date',
      'billingdate',
      'consume_time',
      'consumption_time',
      'service_start_time',
      'service_end_time',
      'usage_start_time'
    ]);
    const instanceId = firstPresent(record, ['instance_id', 'instanceid']);
    const parsedInstance = parseProviderInstanceId(instanceId);
    const productName = firstPresent(record, ['product_name', 'product', 'commodity_name']);
    const productDetail = firstPresent(record, ['product_detail', 'productdetail', 'commodity', 'product_details']);
    const modelName = firstPresent(record, ['model_name', 'model']) || parsedInstance.model_name;

    if (!isLikelyModelStudioBillingRow(record, parsedInstance, modelName, productName, productDetail)) return;

    const pretaxAmount = parseLooseNumber(firstPresent(record, ['pretax_amount', 'pretaxamount', 'amount_payable', 'payable_amount']));
    const pretaxGrossAmount = parseLooseNumber(firstPresent(record, ['pretax_gross_amount', 'pretaxgrossamount', 'catalogue_gross_amount']));
    const providerAmount = pretaxAmount !== null ? pretaxAmount : (pretaxGrossAmount !== null ? pretaxGrossAmount : 0);
    const monthKey = monthKeyFromValue(billingDate) || monthKeyFromValue(billingCycle) || monthKeyFromValue(importedAt);

    entries.push({
      id: importId + '-row-' + String(index + 1).padStart(4, '0'),
      import_id: importId,
      imported_at: importedAt,
      source_file: sourceFile || 'provider-bill.csv',
      billing_cycle: billingCycle,
      billing_date: billingDate,
      month_key: monthKey,
      currency: firstPresent(record, ['currency']) || 'USD',
      product_name: productName,
      product_detail: productDetail,
      billing_item: firstPresent(record, ['billing_item', 'billingitem', 'billing_item_name']),
      api_key_id: firstPresent(record, ['api_key_id', 'apikey_id', 'api_keyid', 'apikeyid']),
      instance_id: instanceId,
      workspace_id: firstPresent(record, ['workspace_id', 'workspaceid']) || parsedInstance.workspace_id,
      model_name: modelName,
      billing_type: firstPresent(record, ['billing_type']) || parsedInstance.billing_type,
      io_type: firstPresent(record, ['input_output_type', 'io_type']) || parsedInstance.io_type,
      invocation_channel: firstPresent(record, ['invocation_channel', 'channel']) || parsedInstance.invocation_channel,
      usage: parseLooseNumber(firstPresent(record, ['usage', 'usage_amount', 'used_quantity'])),
      usage_unit: firstPresent(record, ['usage_unit', 'usageunit', 'list_price_unit', 'unit']),
      pretax_amount_usd: pretaxAmount,
      pretax_gross_amount_usd: pretaxGrossAmount,
      provider_amount_usd: Number(providerAmount.toFixed(6))
    });
  });

  if (!entries.length) {
    throw new Error('No Model Studio billing rows were found in the imported CSV. Export Alibaba Bill Details for Model Studio, then try again.');
  }

  return {
    id: importId,
    source_hash: importHash,
    source_file: sourceFile || 'provider-bill.csv',
    imported_at: importedAt,
    parsed_row_count: parsed.records.length,
    entries
  };
}

function appendUsageEntry(entry) {
  const entries = readUsageHistory();
  entries.unshift(entry);
  if (entries.length > 5000) entries.length = 5000;
  writeUsageHistory(entries);
}

function buildUsageEntryBase(requestId, options) {
  const keyFingerprint = apiKeyFingerprint(options.apiKey);
  return {
    id: requestId,
    request_id: requestId,
    created_at: new Date().toISOString(),
    module: options.module || 'unknown',
    operation: options.operation || 'request',
    source: 'server',
    model: options.model || '',
    language: options.language || '',
    voice: options.voice || '',
    display_label: options.displayLabel || '',
    text_preview: trimTextPreview(options.text || '', 120),
    chars: Number(options.chars || 0),
    gross_cost_usd: Number((options.grossCostUsd || 0).toFixed(6)),
    unit: options.unit || 'chars',
    quantity: Number(options.quantity || 0),
    rate_label: options.rateLabel || '',
    project_id: options.projectId || '',
    project_title: options.projectTitle || '',
    chapter_index: Number.isInteger(options.chapterIndex) ? options.chapterIndex : null,
    chunk_index: Number.isInteger(options.chunkIndex) ? options.chunkIndex : null,
    chapter_title: options.chapterTitle || '',
    role_label: options.roleLabel || '',
    scenario_id: options.scenarioId || '',
    scenario_label: options.scenarioLabel || '',
    preset_id: options.presetId || '',
    settings_tag: options.settingsTag || '',
    instructions_present: !!options.instructionsPresent,
    api_key_fingerprint: keyFingerprint,
    api_key_label: keyFingerprint ? apiKeyLabel(options.apiKey) : '',
    metadata: options.metadata || {}
  };
}

function serveStatic(req, res, pathname) {
  let targetPath = pathname === '/' ? path.join(ROOT_DIR, 'index.html') : safeJoin(ROOT_DIR, pathname.replace(/^\//, ''));
  if (!targetPath || !fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) return false;
  res.writeHead(200, { 'Content-Type': mimeTypeFor(targetPath) });
  fs.createReadStream(targetPath).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  const requestId = nextRequestId();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  res.setHeader('X-Request-Id', requestId);
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, 'http://localhost:' + PORT);
  const pathname = reqUrl.pathname;

  try {
    if (pathname === '/api/health' && req.method === 'GET') {
      writeJson(res, 200, {
        ok: true,
        app: 'Narrate AI v2.3',
        requestId,
        port: PORT,
        rootDir: ROOT_DIR
      });
      return;
    }

    if (pathname === '/api/usage-history' && req.method === 'GET') {
      const requestedApiKey = String(req.headers['x-api-key'] || '').trim();
      const requestedFingerprint = apiKeyFingerprint(requestedApiKey);
      const allEntries = readUsageHistory();
      const matchedEntries = requestedFingerprint
        ? allEntries.filter((entry) => entry && entry.api_key_fingerprint === requestedFingerprint)
        : [];
      const keyedEntries = allEntries.filter((entry) => entry && entry.api_key_fingerprint);
      const unkeyedEntries = allEntries.length - keyedEntries.length;
      writeJson(res, 200, {
        ok: true,
        entries: matchedEntries,
        diagnostics: {
          filter_applied: !!requestedFingerprint,
          requested_key_label: requestedFingerprint ? apiKeyLabel(requestedApiKey) : '',
          requested_key_fingerprint: requestedFingerprint,
          total_server_entries: allEntries.length,
          matched_entries: matchedEntries.length,
          unmatched_entries: requestedFingerprint ? Math.max(0, allEntries.length - matchedEntries.length) : allEntries.length,
          keyed_entry_count: keyedEntries.length,
          unkeyed_entry_count: unkeyedEntries,
          distinct_key_count: new Set(keyedEntries.map((entry) => entry.api_key_fingerprint)).size
        }
      });
      return;
    }

    if (pathname === '/api/usage-history' && req.method === 'DELETE') {
      const requestedApiKey = String(req.headers['x-api-key'] || '').trim();
      const requestedFingerprint = apiKeyFingerprint(requestedApiKey);
      const allEntries = readUsageHistory();
      if (!requestedFingerprint) {
        writeUsageHistory([]);
        writeJson(res, 200, { ok: true, deleted_entries: allEntries.length, scope: 'all' });
        return;
      }
      const keptEntries = allEntries.filter((entry) => !entry || entry.api_key_fingerprint !== requestedFingerprint);
      const deletedEntries = allEntries.length - keptEntries.length;
      writeUsageHistory(keptEntries);
      writeJson(res, 200, {
        ok: true,
        deleted_entries: deletedEntries,
        remaining_entries: keptEntries.length,
        scope: 'filtered',
        requested_key_label: apiKeyLabel(requestedApiKey),
        requested_key_fingerprint: requestedFingerprint
      });
      return;
    }

    if (pathname === '/api/provider-billing' && req.method === 'GET') {
      const monthKey = monthKeyFromValue(reqUrl.searchParams.get('month') || '') || '';
      const store = readProviderBillingStore();
      const allEntries = flattenProviderBillingEntries(store);
      const filteredEntries = monthKey
        ? allEntries.filter((entry) => entry && entry.month_key === monthKey)
        : allEntries.slice();
      filteredEntries.sort((a, b) => {
        const aTime = Date.parse(a.billing_date || a.imported_at || '') || 0;
        const bTime = Date.parse(b.billing_date || b.imported_at || '') || 0;
        return bTime - aTime;
      });
      writeJson(res, 200, {
        ok: true,
        month: monthKey,
        imports: (store.imports || []).map(summarizeProviderImport),
        entries: filteredEntries,
        diagnostics: Object.assign({
          total_imports: (store.imports || []).length,
          total_rows: allEntries.length,
          filtered_rows: filteredEntries.length
        }, summarizeProviderEntries(filteredEntries))
      });
      return;
    }

    if (pathname === '/api/provider-billing/import' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const csvText = body && typeof body.csv_text === 'string' ? body.csv_text : '';
      const sourceFile = body && typeof body.file_name === 'string' ? body.file_name : 'provider-bill.csv';
      const importRecord = buildProviderBillingImport(csvText, sourceFile);
      const store = readProviderBillingStore();
      const nextImports = (store.imports || []).filter((entry) => entry && entry.source_hash !== importRecord.source_hash);
      nextImports.unshift(importRecord);
      if (nextImports.length > 24) nextImports.length = 24;
      writeProviderBillingStore({ imports: nextImports });
      writeJson(res, 200, {
        ok: true,
        import: summarizeProviderImport(importRecord),
        replaced_existing_import: nextImports.length !== (store.imports || []).length + 1,
        diagnostics: summarizeProviderEntries(importRecord.entries)
      });
      return;
    }

    if (pathname === '/api/provider-billing' && req.method === 'DELETE') {
      const store = readProviderBillingStore();
      const deletedImports = (store.imports || []).length;
      const deletedRows = flattenProviderBillingEntries(store).length;
      writeProviderBillingStore({ imports: [] });
      writeJson(res, 200, {
        ok: true,
        deleted_imports: deletedImports,
        deleted_rows: deletedRows
      });
      return;
    }

    if (pathname === '/synthesize' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const charCount = typeof body.text === 'string' ? body.text.length : 0;
      logRequest(requestId, 'Synthesize start voice=' + String(body.voice || '') + ' model=' + String(body.model || '') + ' language=' + String(body.language || 'English') + ' chars=' + charCount);
      if (!body.api_key || !body.text || !body.voice || !body.model) {
        throw new Error('Missing required fields: api_key, text, voice, model.');
      }
      const result = await qwenSynthesizeToBuffer({
        apiKey: body.api_key,
        text: body.text,
        voice: body.voice,
        language: body.language || 'English',
        model: body.model,
        instructions: body.instructions || ''
      });
      const chars = body.text.length;
      const cost = chars * modelRate(body.model);
      appendUsageEntry(buildUsageEntryBase(requestId, {
        apiKey: body.api_key,
        module: body.tracking && body.tracking.module ? body.tracking.module : 'single_sample',
        operation: 'speech_synthesis',
        model: body.model,
        language: body.language || 'English',
        voice: body.voice,
        displayLabel: body.tracking && body.tracking.display_label ? body.tracking.display_label : body.voice,
        text: body.text,
        chars,
        grossCostUsd: cost,
        unit: 'chars',
        quantity: chars,
        rateLabel: PRICING[body.model] ? '$' + (PRICING[body.model] * 10000).toFixed(3).replace(/0+$/,'').replace(/\.$/,'') + '/10K chars' : '',
        scenarioId: body.tracking && body.tracking.scenario_id ? body.tracking.scenario_id : '',
        scenarioLabel: body.tracking && body.tracking.scenario_label ? body.tracking.scenario_label : '',
        presetId: body.tracking && body.tracking.preset_id ? body.tracking.preset_id : '',
        settingsTag: body.tracking && body.tracking.settings_tag ? body.tracking.settings_tag : '',
        instructionsPresent: !!body.instructions,
        metadata: body.tracking || {}
      }));
      logRequest(requestId, 'Synthesize success voice=' + body.voice + ' bytes=' + result.buffer.length + ' contentType=' + (result.contentType || 'audio/wav'));
      res.writeHead(200, {
        'Content-Type': result.contentType || 'audio/wav',
        'X-Usage-Chars': String(chars),
        'X-Usage-Cost': String(cost.toFixed(6))
      });
      res.end(result.buffer);
      return;
    }

    if (pathname === '/clone-voice' && req.method === 'POST') {
      logRequest(requestId, 'Clone voice request received.');
      const buffer = await readRequestBuffer(req);
      const parsed = parseMultipartBody(buffer, req.headers['content-type']);
      const apiKey = (parsed.fields.api_key || '').trim();
      const preferredName = String(parsed.fields.name || '').trim();
      const audio = parsed.files.audio;
      if (!apiKey || !audio || !preferredName) throw new Error('Missing required clone payload.');
      const voiceId = await createClonedVoice(apiKey, preferredName, audio);
      const localRecord = saveLocalCloneRecord(voiceId, preferredName, DEFAULT_CLONE_MODEL, audio);
      appendUsageEntry(buildUsageEntryBase(requestId, {
        apiKey,
        module: 'voice_clone_create',
        operation: 'voice_clone',
        model: DEFAULT_CLONE_MODEL,
        language: '',
        voice: voiceId,
        displayLabel: localRecord.display_name || preferredName,
        text: parsed.fields.script || '',
        chars: 0,
        grossCostUsd: 0.01,
        unit: 'count',
        quantity: 1,
        rateLabel: '$0.01 per clone',
        metadata: {
          original_filename: audio.filename || '',
          source_format: audio.contentType || ''
        }
      }));
      writeJson(res, 200, {
        ok: true,
        name: localRecord.display_name || preferredName,
        display_name: localRecord.display_name || preferredName,
        preferred_name: localRecord.preferred_name || preferredName,
        voice_id: voiceId,
        target_model: DEFAULT_CLONE_MODEL,
        cost_usd: 0,
        local_audio_url: localRecord.local_audio_url
      });
      return;
    }

    if (pathname === '/design-voice' && req.method === 'POST') {
      logRequest(requestId, 'Design voice request received.');
      const body = await readJsonBody(req);
      if (!body.api_key || !body.voice_prompt || !body.preview_text) {
        throw new Error('Missing required fields: api_key, voice_prompt, preview_text.');
      }
      logRequest(
        requestId,
        'Design payload name=' + String(body.display_name || body.preferred_name || 'custom_voice') +
        ' rawLanguage=' + String(body.language || '') +
        ' normalizedLanguage=' + normalizeDesignLanguage(body.language || '') +
        ' targetModel=' + String(body.target_model || DEFAULT_DESIGN_MODEL) +
        ' previewChars=' + String(String(body.preview_text || '').length) +
        ' promptChars=' + String(String(body.voice_prompt || '').length)
      );
      const designed = await createDesignedVoice(body.api_key, {
        preferredName: body.preferred_name || body.display_name || 'custom_voice',
        displayName: body.display_name || body.preferred_name || 'Custom Voice',
        voicePrompt: body.voice_prompt,
        previewText: body.preview_text,
        language: body.language || 'English',
        targetModel: body.target_model || DEFAULT_DESIGN_MODEL
      });
      const localRecord = saveLocalDesignedVoiceRecord({
        voiceId: designed.voiceId,
        preferredName: designed.preferredName,
        displayName: body.display_name || body.preferred_name || designed.preferredName,
        targetModel: designed.targetModel,
        voicePrompt: body.voice_prompt,
        previewText: body.preview_text,
        language: body.language || 'English',
        presetId: body.preset_id || '',
        previewBuffer: designed.previewBuffer,
        previewFormat: designed.previewFormat
      });
      const designCost = Number((designed.count * 0.2).toFixed(4));
      appendUsageEntry(buildUsageEntryBase(requestId, {
        apiKey: body.api_key,
        module: 'design_voice_create',
        operation: 'voice_design',
        model: designed.targetModel,
        language: body.language || 'English',
        voice: designed.voiceId,
        displayLabel: localRecord.display_name,
        text: body.preview_text,
        chars: String(body.preview_text || '').length,
        grossCostUsd: designCost,
        unit: 'count',
        quantity: designed.count || 1,
        rateLabel: '$0.20 per design',
        presetId: body.preset_id || '',
        settingsTag: 'voice_design_create',
        instructionsPresent: true,
        metadata: {
          preferred_name: designed.preferredName,
          prompt_chars: String(body.voice_prompt || '').length
        }
      }));
      writeJson(res, 200, {
        ok: true,
        voice_id: designed.voiceId,
        name: designed.preferredName,
        display_name: localRecord.display_name,
        target_model: designed.targetModel,
        preview_audio_url: localRecord.preview_audio_url,
        preview_response_format: designed.previewFormat,
        cost_usd: designCost
      });
      logRequest(requestId, 'Design voice success voice=' + designed.voiceId + ' targetModel=' + designed.targetModel);
      return;
    }

    if (pathname === '/list-voices' && req.method === 'POST') {
      logRequest(requestId, 'List cloned voices request received.');
      const body = await readJsonBody(req);
      const remoteVoices = await listClonedVoices(body.api_key, body.page_size || 100);
      const localVoices = readLocalCloneRecords();
      const voices = mergeCloneVoices(remoteVoices, localVoices);
      writeJson(res, 200, { voices });
      return;
    }

    if (pathname === '/api/local-clones' && req.method === 'GET') {
      writeJson(res, 200, { voices: readLocalCloneRecords() });
      return;
    }

    if (pathname === '/rename-local-voice' && req.method === 'POST') {
      logRequest(requestId, 'Rename local cloned voice request received.');
      const body = await readJsonBody(req);
      if (!body.voice_id || !String(body.preferred_name || '').trim()) {
        throw new Error('Missing required fields: voice_id, preferred_name.');
      }
      const voice = renameLocalCloneRecord(String(body.voice_id), String(body.preferred_name));
      writeJson(res, 200, { ok: true, voice });
      return;
    }

    if (pathname === '/api/local-designed-voices' && req.method === 'GET') {
      writeJson(res, 200, { voices: readLocalDesignedVoiceRecords() });
      return;
    }

    if (pathname === '/list-designed-voices' && req.method === 'POST') {
      logRequest(requestId, 'List designed voices request received.');
      const body = await readJsonBody(req);
      const localVoices = readLocalDesignedVoiceRecords();
      if (!body.api_key) {
        writeJson(res, 200, { voices: localVoices });
        return;
      }
      const remoteVoices = await listDesignedVoices(body.api_key, body.page_size || 100);
      const voices = mergeDesignedVoices(remoteVoices, localVoices);
      writeJson(res, 200, { voices });
      return;
    }

    if (pathname === '/save-designed-sample' && req.method === 'POST') {
      logRequest(requestId, 'Save designed sample request received.');
      const body = await readJsonBody(req);
      if (!body.voice_id || !body.audio_base64) throw new Error('Missing required fields: voice_id, audio_base64.');
      const buffer = Buffer.from(String(body.audio_base64), 'base64');
      const record = saveLocalDesignedVoiceSample({
        voiceId: body.voice_id,
        mode: body.mode || 'native',
        format: body.format || 'wav',
        buffer,
        language: body.language || '',
        text: body.text || ''
      });
      writeJson(res, 200, {
        ok: true,
        voice_id: body.voice_id,
        mode: body.mode || 'native',
        native_sample_audio_url: record.native_sample_audio_url || '',
        english_sample_audio_url: record.english_sample_audio_url || ''
      });
      return;
    }

    if (pathname === '/delete-voice' && req.method === 'POST') {
      logRequest(requestId, 'Delete cloned voice request received.');
      const body = await readJsonBody(req);
      if (!body.api_key || !body.voice_id) throw new Error('Missing required fields: api_key, voice_id.');
      await deleteClonedVoice(body.api_key, body.voice_id);
      deleteLocalCloneRecord(body.voice_id);
      writeJson(res, 200, { ok: true });
      return;
    }

    if (pathname === '/delete-designed-voice' && req.method === 'POST') {
      logRequest(requestId, 'Delete designed voice request received.');
      const body = await readJsonBody(req);
      if (!body.voice_id) throw new Error('Missing required field: voice_id.');
      if (body.api_key) {
        await deleteDesignedVoice(body.api_key, body.voice_id);
      }
      deleteLocalDesignedVoiceRecord(body.voice_id);
      writeJson(res, 200, { ok: true });
      return;
    }

    if (pathname === '/api/projects' && req.method === 'GET') {
      writeJson(res, 200, listProjects());
      return;
    }

    if (pathname === '/api/projects' && req.method === 'POST') {
      const payload = await readJsonBody(req);
      const projectId = saveProjectPayload(payload);
      writeJson(res, 200, { ok: true, id: projectId });
      return;
    }

    if (pathname.startsWith('/api/projects/') && req.method === 'GET') {
      const projectId = decodeURIComponent(pathname.split('/').pop());
      const filePath = projectFilePath(projectId);
      if (!fs.existsSync(filePath)) {
        writeJson(res, 404, { error: 'Project not found.' });
        return;
      }
      writeJson(res, 200, JSON.parse(fs.readFileSync(filePath, 'utf8')));
      return;
    }

    if (pathname.startsWith('/api/projects/') && req.method === 'DELETE') {
      const projectId = decodeURIComponent(pathname.split('/').pop());
      const filePath = projectFilePath(projectId);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      writeJson(res, 200, { ok: true });
      return;
    }

    if (pathname === '/api/check-cache' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const chunks = Array.isArray(body.chunks) ? body.chunks : [];
      const modelId = body.modelId || 'qwen3-tts-flash';
      const results = chunks.map((chunk) => {
        const filename = buildBookChunkFileName({
          projectId: body.projectId,
          projectTitle: body.projectTitle,
          chapterIndex: chunk.chapterIndex,
          chunkIndex: chunk.chunkIndex,
          chapterTitle: chunk.chapterTitle,
          roleLabel: chunk.roleLabel,
          sourceType: chunk.sourceType,
          text: chunk.text,
          voiceId: chunk.voiceId,
          modelId,
          language: body.language || 'English',
          instructions: chunk.instructions || ''
        });
        return {
          id: chunk.id,
          exists: fs.existsSync(path.join(CHUNKS_DIR, filename)),
          filename,
          url: '/output/chunks/' + filename
        };
      });
      writeJson(res, 200, { chunks: results });
      return;
    }

    if (pathname === '/api/generate-chunk' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!body.text || !body.voiceId || !body.apiKey || !body.modelId) {
        throw new Error('Missing required fields: text, voiceId, apiKey, modelId.');
      }
      const filename = buildBookChunkFileName(body);
      const filePath = path.join(CHUNKS_DIR, filename);
      const alreadyCached = fs.existsSync(filePath);
      const shouldGenerate = !alreadyCached || !!body.force;
      if (shouldGenerate) {
        const result = await qwenSynthesizeToBuffer({
          apiKey: body.apiKey,
          text: body.text,
          voice: body.voiceId,
          language: body.language || 'English',
          model: body.modelId,
          instructions: body.instructions || ''
        });
        fs.writeFileSync(filePath, result.buffer);
        const chars = String(body.text || '').length;
        appendUsageEntry(buildUsageEntryBase(requestId, {
          apiKey: body.apiKey,
          module: body.sourceType === 'titles' ? 'audiobook_titles' : 'audiobook_chunk',
          operation: 'speech_synthesis',
          model: body.modelId,
          language: body.language || 'English',
          voice: body.voiceId,
          displayLabel: body.roleLabel || body.chapterTitle || body.voiceId,
          text: body.text,
          chars,
          grossCostUsd: chars * modelRate(body.modelId),
          unit: 'chars',
          quantity: chars,
          rateLabel: PRICING[body.modelId] ? '$' + (PRICING[body.modelId] * 10000).toFixed(3).replace(/0+$/,'').replace(/\.$/,'') + '/10K chars' : '',
          projectId: body.projectId || '',
          projectTitle: body.projectTitle || '',
          chapterIndex: Number.isInteger(body.chapterIndex) ? body.chapterIndex : null,
          chunkIndex: Number.isInteger(body.chunkIndex) ? body.chunkIndex : null,
          chapterTitle: body.chapterTitle || '',
          roleLabel: body.roleLabel || '',
          settingsTag: body.instructions ? 'custom_chunk_prompt' : 'default_chunk_prompt',
          instructionsPresent: !!body.instructions,
          metadata: {
            source_type: body.sourceType || '',
            forced: !!body.force
          }
        }));
      }
      writeJson(res, 200, {
        ok: true,
        filename,
        url: '/output/chunks/' + filename,
        cached: alreadyCached && !body.force
      });
      return;
    }

    if (pathname === '/api/merge-chapter' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const filenames = Array.isArray(body.filenames) ? body.filenames : [];
      if (!body.projectId || !filenames.length) throw new Error('Missing merge payload.');
      const sourcePaths = filenames.map((filename) => path.join(CHUNKS_DIR, filename));
      sourcePaths.forEach((filePath) => {
        if (!fs.existsSync(filePath)) throw new Error('Missing chunk file: ' + path.basename(filePath));
      });
      const format = body.format === 'mp3' ? 'mp3' : 'wav';
      const dir = body.isTitle ? TITLES_DIR : CHAPTERS_DIR;
      const outputName = buildMergedChapterFileName(body);
      const outputPath = path.join(dir, outputName);
      await mergeAudioFiles(sourcePaths, outputPath, {
        silence: body.silence || 0,
        format
      });
      writeJson(res, 200, {
        ok: true,
        filename: outputName,
        url: '/output/' + (body.isTitle ? 'titles/' : 'chapters/') + outputName
      });
      return;
    }

    if (pathname === '/api/merge-book' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!body.projectId) throw new Error('Project ID is required.');
      const format = body.format === 'mp3' ? 'mp3' : 'wav';
      let sourceFormat = format;
      let inputs = collectBookMergeInputs(body.projectId, sourceFormat, body.chapter_filenames);
      if (!inputs.length && format !== 'wav') {
        sourceFormat = 'wav';
        inputs = collectBookMergeInputs(body.projectId, sourceFormat, body.chapter_filenames);
      }
      if (!inputs.length) throw new Error('No chapter files found to merge.');
      const outputName = buildFullBookFileName(body);
      const outputPath = path.join(BOOK_DIR, outputName);
      await mergeAudioFiles(inputs.map((entry) => entry.path), outputPath, {
        silence: body.silence || 0,
        format
      });
      writeJson(res, 200, {
        ok: true,
        filename: outputName,
        url: '/output/book/' + outputName,
        sourceFormat
      });
      return;
    }

    if (pathname === '/api/book-zip' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!body.projectId) throw new Error('Project ID is required.');
      const files = [];
      if (Array.isArray(body.chunk_filenames) && body.chunk_filenames.length) {
        body.chunk_filenames.forEach((filename) => {
          const filePath = resolveExistingFilePath(filename, [CHUNKS_DIR]);
          if (filePath) files.push(filePath);
        });
      } else {
        fs.readdirSync(CHUNKS_DIR).filter((file) => file.startsWith(body.projectId + '_')).forEach((file) => files.push(path.join(CHUNKS_DIR, file)));
      }
      if (Array.isArray(body.chapter_filenames) && body.chapter_filenames.length) {
        body.chapter_filenames.forEach((filename) => {
          const filePath = resolveExistingFilePath(filename, [TITLES_DIR, CHAPTERS_DIR]);
          if (filePath) files.push(filePath);
        });
      } else {
        fs.readdirSync(CHAPTERS_DIR).filter((file) => file.startsWith(body.projectId + '_')).forEach((file) => files.push(path.join(CHAPTERS_DIR, file)));
        fs.readdirSync(TITLES_DIR).filter((file) => file.startsWith(body.projectId + '_')).forEach((file) => files.push(path.join(TITLES_DIR, file)));
      }
      if (Array.isArray(body.book_filenames) && body.book_filenames.length) {
        body.book_filenames.forEach((filename) => {
          const filePath = resolveExistingFilePath(filename, [BOOK_DIR]);
          if (filePath) files.push(filePath);
        });
      } else {
        fs.readdirSync(BOOK_DIR).filter((file) => file.startsWith(body.projectId + '_')).forEach((file) => files.push(path.join(BOOK_DIR, file)));
      }
      const projectPath = projectFilePath(body.projectId);
      if (fs.existsSync(projectPath)) files.push(projectPath);
      if (!files.length) throw new Error('No generated files found for this project.');
      const zipName = buildBookZipFileName(body, files.map((filePath) => path.basename(filePath)));
      const zipPath = path.join(PACKAGES_DIR, zipName);
      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
      await execute('zip', ['-j', '-y', zipPath, ...files]);
      writeJson(res, 200, { ok: true, filename: zipName, url: '/output/packages/' + zipName });
      return;
    }

    if (serveStatic(req, res, pathname)) return;

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  } catch (error) {
    const details = [];
    if (error && error.debugMeta) details.push('debug=' + JSON.stringify(error.debugMeta));
    if (error && error.remoteDetails) details.push('remote=' + error.remoteDetails);
    console.error('[Narrate AI v2.3][' + requestId + '] ' + req.method + ' ' + pathname + ' failed:', error, details.join(' | '));
    writeJson(res, 500, {
      error: error.message,
      request_id: requestId,
      debug: error.debugMeta || null,
      remote: error.remote || null
    });
  }
});

server.listen(PORT, () => {
  console.log('Narrate AI v2.3 server running at http://localhost:' + PORT);
});
