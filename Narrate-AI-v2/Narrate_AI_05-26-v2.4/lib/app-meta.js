const APP_VERSION = '2.4';
const APP_NAME = 'Narrate AI v' + APP_VERSION;

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
  [DEFAULT_CLONE_MODEL]: 0.115 / 10000,
  [DEFAULT_DESIGN_MODEL]: 0.115 / 10000
};

function modelFamily(modelId) {
  const raw = String(modelId || '').trim();
  if (raw === 'qwen3-tts-flash' || raw.startsWith('qwen3-tts-flash-')) return 'qwen3-tts-flash';
  if (raw === 'qwen3-tts-instruct-flash' || raw.startsWith('qwen3-tts-instruct-flash-')) return 'qwen3-tts-instruct-flash';
  if (raw === DEFAULT_CLONE_MODEL) return DEFAULT_CLONE_MODEL;
  if (raw === DEFAULT_DESIGN_MODEL) return DEFAULT_DESIGN_MODEL;
  return raw;
}

function isInstructModel(modelId) {
  return modelFamily(modelId) === 'qwen3-tts-instruct-flash';
}

function buildModelMetadata() {
  return Object.keys(PRICING).map((modelId) => {
    const family = modelFamily(modelId);
    return {
      id: modelId,
      family,
      rate_per_char_usd: PRICING[modelId],
      rate_per_10k_chars_usd: Number((PRICING[modelId] * 10000).toFixed(6)),
      supports_instructions: isInstructModel(modelId),
      custom_voice_kind: family === DEFAULT_CLONE_MODEL ? 'clone' : family === DEFAULT_DESIGN_MODEL ? 'design' : ''
    };
  });
}

module.exports = {
  APP_VERSION,
  APP_NAME,
  DEFAULT_CLONE_MODEL,
  DEFAULT_DESIGN_MODEL,
  DEFAULT_LIST_PAGE_SIZE,
  MAX_LIST_PAGE_SIZE,
  CUSTOM_VOICE_NAME_MAX,
  INSTRUCT_TEXT_CHAR_LIMIT,
  INSTRUCT_INSTRUCTIONS_CHAR_LIMIT,
  PRICING,
  modelFamily,
  isInstructModel,
  buildModelMetadata
};
