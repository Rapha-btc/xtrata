import { afterEach, describe, expect, it } from 'vitest';
import {
  applyThemeToDocument,
  coerceThemeMode,
  readThemePreference,
  THEME_MODES,
  resolveInitialTheme,
  THEME_OPTIONS,
  THEME_STORAGE_KEY,
  writeThemePreference
} from '../preferences';

type MemoryStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const createMemoryStorage = (): MemoryStorage => {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    }
  };
};

const setWindowStorage = (storage: MemoryStorage) => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: storage
    }
  });
};

const clearWindow = () => {
  delete (globalThis as { window?: unknown }).window;
};

const setDocumentRoot = () => {
  const root = {
    dataset: {} as Record<string, string>,
    style: {
      colorScheme: ''
    }
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      documentElement: root
    }
  });
  return root;
};

const clearDocument = () => {
  delete (globalThis as { document?: unknown }).document;
};

afterEach(() => {
  clearWindow();
  clearDocument();
});

describe('theme preferences', () => {
  it('defaults to dark when no valid preference exists', () => {
    expect(resolveInitialTheme()).toBe('dark');

    const storage = createMemoryStorage();
    setWindowStorage(storage);
    storage.setItem(THEME_STORAGE_KEY, 'unknown');
    expect(resolveInitialTheme()).toBe('dark');
  });

  it('returns null for malformed preference values', () => {
    const storage = createMemoryStorage();
    setWindowStorage(storage);

    storage.setItem(THEME_STORAGE_KEY, 'sepia');
    expect(readThemePreference()).toBeNull();

    storage.setItem(THEME_STORAGE_KEY, ' DARK ');
    expect(readThemePreference()).toBe('dark');

    storage.setItem(THEME_STORAGE_KEY, ' STACKS-BLUE ');
    expect(readThemePreference()).toBe('stacks-blue');

    storage.setItem(THEME_STORAGE_KEY, ' ORDINALS-NEON ');
    expect(readThemePreference()).toBe('ordinals-neon');
  });

  it('stores valid theme mode values', () => {
    const storage = createMemoryStorage();
    setWindowStorage(storage);

    writeThemePreference('dark');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    writeThemePreference('light');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('light');

    writeThemePreference('mempool-green');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('mempool-green');

    writeThemePreference('op-return-copper');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('op-return-copper');
  });

  it('applies every theme mode to document root', () => {
    const root = setDocumentRoot();

    THEME_MODES.forEach((mode) => {
      applyThemeToDocument(mode);
      expect(root.dataset.theme).toBe(mode);
      expect(root.style.colorScheme).toBe(mode === 'light' ? 'light' : 'dark');
    });
  });

  it('exports selectable theme options with unique values', () => {
    const values = THEME_OPTIONS.map((option) => option.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values.length).toBe(THEME_MODES.length);
    expect(values).toContain('xtrata-orange');
    expect(values).toContain('ordinals-neon');
    expect(values).toContain('op-return-copper');
  });

  it('coerces unknown values to dark', () => {
    expect(coerceThemeMode('noir')).toBe('noir');
    expect(coerceThemeMode('unknown-theme')).toBe('dark');
  });

  it('does not throw when storage or document is unavailable', () => {
    expect(() => readThemePreference()).not.toThrow();
    expect(() => writeThemePreference('dark')).not.toThrow();
    expect(() => applyThemeToDocument('dark')).not.toThrow();
  });
});
