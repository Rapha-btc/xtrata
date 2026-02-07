export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

export const LOG_ENABLED_KEY = 'xtrata.log.enabled';
export const LOG_LEVEL_KEY = 'xtrata.log.level';
export const LOG_TAGS_KEY = 'xtrata.log.tags';
export const LOG_DEDUPE_KEY = 'xtrata.log.dedupe';

const getStorageValue = (key: string) => {
  try {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
};

const parseEnabled = (value: string | null | undefined) => {
  if (!value) {
    return true;
  }
  const normalized = value.toLowerCase();
  return normalized !== 'false' && normalized !== '0' && normalized !== 'off';
};

const parseLevel = (value: string | null | undefined): LogLevel | null => {
  if (!value) {
    return null;
  }
  const normalized = value.toLowerCase();
  if (
    normalized === 'debug' ||
    normalized === 'info' ||
    normalized === 'warn' ||
    normalized === 'error'
  ) {
    return normalized;
  }
  return null;
};

const parseDedupe = (value: string | null | undefined) => {
  if (!value) {
    return false;
  }
  const normalized = value.toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'on';
};

const parseTags = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }
  const tags = value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  if (tags.length === 0) {
    return null;
  }
  if (tags.includes('*') || tags.includes('all')) {
    return new Set(['*']);
  }
  return new Set(tags);
};

const getConfig = () => {
  const env = import.meta.env ?? {};
  const enabledValue = getStorageValue(LOG_ENABLED_KEY) ?? env.VITE_LOG_ENABLED;
  const levelValue = getStorageValue(LOG_LEVEL_KEY) ?? env.VITE_LOG_LEVEL;
  const tagsValue = getStorageValue(LOG_TAGS_KEY) ?? env.VITE_LOG_TAGS;
  const dedupeValue = getStorageValue(LOG_DEDUPE_KEY) ?? env.VITE_LOG_DEDUPE;
  return {
    enabled: parseEnabled(enabledValue),
    level: parseLevel(levelValue) ?? 'warn',
    tags: parseTags(tagsValue),
    dedupe: parseDedupe(dedupeValue)
  };
};

const isLogAllowed = (config: ReturnType<typeof getConfig>, tag: string, level: LogLevel) => {
  if (!config.enabled) {
    return false;
  }
  if (LEVEL_RANK[level] < LEVEL_RANK[config.level]) {
    return false;
  }
  if (!config.tags || config.tags.has('*')) {
    return true;
  }
  return config.tags.has(tag.toLowerCase());
};

export const shouldLog = (tag: string, level: LogLevel) => {
  const config = getConfig();
  return isLogAllowed(config, tag, level);
};

const emitLog = (
  level: LogLevel,
  tag: string,
  message: string,
  payload?: unknown
) => {
  const config = getConfig();
  if (!isLogAllowed(config, tag, level)) {
    return;
  }
  if (shouldSuppressByDedupe(config.dedupe, level, tag, message, payload)) {
    return;
  }
  const prefix = `[xtrata:${tag}] ${message}`;
  const logger = console[level] ?? console.log;
  if (payload !== undefined) {
    logger(prefix, payload);
  } else {
    logger(prefix);
  }
};

const dedupeCache = new Set<string>();
let lastDedupeState: boolean | null = null;
const DEDUPE_CACHE_LIMIT = 800;

const normalizeMessage = (message: string) => message.replace(/\s+/g, ' ').trim();

const buildDedupeKey = (
  level: LogLevel,
  tag: string,
  message: string,
  _payload?: unknown
) => {
  const parts = [
    `level:${level}`,
    `tag:${tag}`,
    `msg:${normalizeMessage(message)}`
  ];
  return parts.join('|');
};

const shouldSuppressByDedupe = (
  enabled: boolean,
  level: LogLevel,
  tag: string,
  message: string,
  payload?: unknown
) => {
  if (lastDedupeState !== enabled) {
    dedupeCache.clear();
    lastDedupeState = enabled;
  }
  if (!enabled) {
    return false;
  }
  if (level === 'debug') {
    return false;
  }
  const key = buildDedupeKey(level, tag, message, payload);
  if (dedupeCache.has(key)) {
    return true;
  }
  dedupeCache.add(key);
  if (dedupeCache.size > DEDUPE_CACHE_LIMIT) {
    dedupeCache.clear();
  }
  return false;
};

export const clearLogDedupeCache = () => {
  dedupeCache.clear();
};

export const logDebug = (tag: string, message: string, payload?: unknown) =>
  emitLog('debug', tag, message, payload);
export const logInfo = (tag: string, message: string, payload?: unknown) =>
  emitLog('info', tag, message, payload);
export const logWarn = (tag: string, message: string, payload?: unknown) =>
  emitLog('warn', tag, message, payload);
export const logError = (tag: string, message: string, payload?: unknown) =>
  emitLog('error', tag, message, payload);
