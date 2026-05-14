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
const LOCAL_CLONES_DIR = path.join(ROOT_DIR, 'qwen3_cloned_voices');
const LOCAL_DESIGNS_DIR = path.join(ROOT_DIR, 'qwen3_designed_voices');

const DASHSCOPE_BASE = 'https://dashscope-intl.aliyuncs.com/api/v1';
const GENERATION_URL = DASHSCOPE_BASE + '/services/aigc/multimodal-generation/generation';
const CUSTOMIZATION_URL = DASHSCOPE_BASE + '/services/audio/tts/customization';
const DEFAULT_CLONE_MODEL = 'qwen3-tts-vc-2026-01-22';
const DEFAULT_DESIGN_MODEL = 'qwen3-tts-vd-2026-01-26';
const PRICING = {
  'qwen3-tts-flash': 0.10 / 10000,
  'qwen3-tts-instruct-flash': 0.115 / 10000,
  'qwen3-tts-vc-2026-01-22': 0.115 / 10000,
  'qwen3-tts-vd-2026-01-26': 0.115 / 10000
};

[OUTPUT_DIR, CHUNKS_DIR, CHAPTERS_DIR, TITLES_DIR, BOOK_DIR, PROJECTS_DIR, PACKAGES_DIR, TEMP_DIR, LOCAL_CLONES_DIR, LOCAL_DESIGNS_DIR].forEach((dir) => {
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
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: res.headers['content-type'] || 'application/octet-stream'
        });
      });
    });
    req.on('error', reject);
  });
}

function generateHash(input) {
  return crypto.createHash('md5').update(String(input)).digest('hex').slice(0, 12);
}

function slugifyFileStem(value) {
  return String(value || 'clone')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'clone';
}

function readLocalCloneRecords() {
  if (!fs.existsSync(LOCAL_CLONES_DIR)) return [];
  return fs.readdirSync(LOCAL_CLONES_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      const fullPath = path.join(LOCAL_CLONES_DIR, file);
      try {
        return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
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
  const ext = path.extname(audioFile.filename || '').toLowerCase() || '.wav';
  const stem = slugifyFileStem(preferredName || voiceId);
  const hash = generateHash(voiceId);
  const audioFileName = stem + '_' + hash + ext;
  const jsonFileName = stem + '_' + hash + '.json';
  const audioPath = path.join(LOCAL_CLONES_DIR, audioFileName);
  const jsonPath = path.join(LOCAL_CLONES_DIR, jsonFileName);
  fs.writeFileSync(audioPath, audioFile.buffer);
  const record = {
    voice: voiceId,
    preferred_name: preferredName,
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

function sanitizeVoiceKeyword(value, fallback) {
  return String(value || fallback || 'voice')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 16) || String(fallback || 'voice');
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
  const previewExt = options.previewFormat === 'mp3' ? '.mp3' : options.previewFormat === 'opus' ? '.opus' : '.wav';
  const previewFileName = stem + '_' + hash + '_preview' + previewExt;
  const jsonFileName = stem + '_' + hash + '.json';
  const previewPath = path.join(LOCAL_DESIGNS_DIR, previewFileName);
  const jsonPath = path.join(LOCAL_DESIGNS_DIR, jsonFileName);
  fs.writeFileSync(previewPath, options.previewBuffer);
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
  const stem = slugifyFileStem(record.display_name || record.preferred_name || record.voice);
  const hash = generateHash(record.voice);
  const mode = options.mode === 'english' ? 'english' : 'native';
  const sampleExt = options.format === 'mp3' ? '.mp3' : options.format === 'opus' ? '.opus' : '.wav';
  const sampleFileName = stem + '_' + hash + '_' + mode + '_sample' + sampleExt;
  const samplePath = path.join(LOCAL_DESIGNS_DIR, sampleFileName);
  const priorFileKey = mode === 'english' ? 'english_sample_audio_file' : 'native_sample_audio_file';
  const priorUrlKey = mode === 'english' ? 'english_sample_audio_url' : 'native_sample_audio_url';
  const priorPath = record[priorFileKey] ? path.join(LOCAL_DESIGNS_DIR, record[priorFileKey]) : '';
  if (priorPath && fs.existsSync(priorPath) && path.basename(priorPath) !== sampleFileName) {
    fs.unlinkSync(priorPath);
  }
  fs.writeFileSync(samplePath, options.buffer);
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

function modelRate(modelId) {
  return PRICING[modelId] || PRICING['qwen3-tts-flash'];
}

async function qwenSynthesizeToBuffer(options) {
  const payload = {
    model: options.model,
    input: {
      text: options.text,
      voice: options.voice,
      language_type: options.language || 'English'
    }
  };
  if (options.instructions) {
    payload.parameters = {
      instructions: options.instructions,
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

async function createClonedVoice(apiKey, preferredName, audioFile) {
  const dataUri = 'data:' + audioFile.contentType + ';base64,' + audioFile.buffer.toString('base64');
  const payload = {
    model: 'qwen-voice-enrollment',
    input: {
      action: 'create',
      target_model: DEFAULT_CLONE_MODEL,
      preferred_name: preferredName,
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
    previewBuffer: Buffer.from(previewData, 'base64'),
    previewFormat: previewAudio.response_format || 'wav',
    previewSampleRate: previewAudio.sample_rate || 24000,
    count: response && response.usage && response.usage.count ? response.usage.count : 1
  };
}

async function listClonedVoices(apiKey, pageSize) {
  const payload = {
    model: 'qwen-voice-enrollment',
    input: {
      action: 'list',
      page_size: pageSize || 100,
      page_index: 0
    }
  };

  const response = await httpRequestJson(CUSTOMIZATION_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    }
  }, payload);

  return (response.output && response.output.voice_list) || [];
}

async function listDesignedVoices(apiKey, pageSize) {
  const payload = {
    model: 'qwen-voice-design',
    input: {
      action: 'list',
      page_size: pageSize || 100,
      page_index: 0
    }
  };

  const response = await httpRequestJson(CUSTOMIZATION_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    }
  }, payload);

  return (response.output && response.output.voice_list) || [];
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
  readLocalCloneRecords().forEach((record) => {
    if (record.voice !== voiceId) return;
    const metadataPath = path.join(LOCAL_CLONES_DIR, slugifyFileStem(record.preferred_name || record.voice) + '_' + generateHash(record.voice) + '.json');
    const audioPath = record.local_audio_file ? path.join(LOCAL_CLONES_DIR, record.local_audio_file) : '';
    if (metadataPath && fs.existsSync(metadataPath)) fs.unlinkSync(metadataPath);
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

function collectBookMergeInputs(projectId, sourceFormat) {
  const inputs = [];
  const titleFile = path.join(TITLES_DIR, projectId + '_titles.' + sourceFormat);
  if (fs.existsSync(titleFile)) inputs.push({ path: titleFile, index: -1 });
  fs.readdirSync(CHAPTERS_DIR)
    .filter((file) => file.startsWith(projectId + '_chapter_') && file.endsWith('.' + sourceFormat))
    .forEach((file) => {
      const match = file.match(/_chapter_(\d+)\./);
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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
      const preferredName = (parsed.fields.name || 'my_voice').trim();
      const audio = parsed.files.audio;
      if (!apiKey || !audio) throw new Error('Missing required clone payload.');
      const voiceId = await createClonedVoice(apiKey, preferredName, audio);
      const localRecord = saveLocalCloneRecord(voiceId, preferredName, DEFAULT_CLONE_MODEL, audio);
      writeJson(res, 200, {
        ok: true,
        name: preferredName,
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
      writeJson(res, 200, {
        ok: true,
        voice_id: designed.voiceId,
        name: designed.preferredName,
        display_name: localRecord.display_name,
        target_model: designed.targetModel,
        preview_audio_url: localRecord.preview_audio_url,
        preview_response_format: designed.previewFormat,
        cost_usd: Number((designed.count * 0.2).toFixed(4))
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
        const hash = generateHash(chunk.text + chunk.voiceId + modelId);
        const filename = body.projectId + '_ch' + chunk.chapterIndex + '_chk' + chunk.chunkIndex + '_' + hash + '.wav';
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
      const hash = generateHash(body.text + body.voiceId + body.modelId + (body.instructions || ''));
      const filename = body.projectId + '_ch' + body.chapterIndex + '_chk' + body.chunkIndex + '_' + hash + '.wav';
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
      const baseName = body.isTitle ? body.projectId + '_titles' : body.projectId + '_chapter_' + body.chapterIndex;
      const outputName = baseName + '.' + format;
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
      let inputs = collectBookMergeInputs(body.projectId, sourceFormat);
      if (!inputs.length && format !== 'wav') {
        sourceFormat = 'wav';
        inputs = collectBookMergeInputs(body.projectId, sourceFormat);
      }
      if (!inputs.length) throw new Error('No chapter files found to merge.');
      const outputName = body.projectId + '_full_book.' + format;
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
      const zipName = body.projectId + '_audiobook_assets.zip';
      const zipPath = path.join(PACKAGES_DIR, zipName);
      const files = [];
      fs.readdirSync(CHUNKS_DIR).filter((file) => file.startsWith(body.projectId + '_')).forEach((file) => files.push(path.join(CHUNKS_DIR, file)));
      fs.readdirSync(CHAPTERS_DIR).filter((file) => file.startsWith(body.projectId + '_')).forEach((file) => files.push(path.join(CHAPTERS_DIR, file)));
      fs.readdirSync(TITLES_DIR).filter((file) => file.startsWith(body.projectId + '_')).forEach((file) => files.push(path.join(TITLES_DIR, file)));
      fs.readdirSync(BOOK_DIR).filter((file) => file.startsWith(body.projectId + '_')).forEach((file) => files.push(path.join(BOOK_DIR, file)));
      const projectPath = projectFilePath(body.projectId);
      if (fs.existsSync(projectPath)) files.push(projectPath);
      if (!files.length) throw new Error('No generated files found for this project.');
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
