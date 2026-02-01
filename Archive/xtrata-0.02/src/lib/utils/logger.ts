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
  return {
    enabled: parseEnabled(enabledValue),
    level: parseLevel(levelValue) ?? 'warn',
    tags: parseTags(tagsValue)
  };
};

export const shouldLog = (tag: string, level: LogLevel) => {
  const config = getConfig();
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

const emitLog = (
  level: LogLevel,
  tag: string,
  message: string,
  payload?: unknown
) => {
  if (!shouldLog(tag, level)) {
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

export const logDebug = (tag: string, message: string, payload?: unknown) =>
  emitLog('debug', tag, message, payload);
export const logInfo = (tag: string, message: string, payload?: unknown) =>
  emitLog('info', tag, message, payload);
export const logWarn = (tag: string, message: string, payload?: unknown) =>
  emitLog('warn', tag, message, payload);
export const logError = (tag: string, message: string, payload?: unknown) =>
  emitLog('error', tag, message, payload);
