export const THEME_MODES = [
  'light',
  'dark',
  'xtrata-orange',
  'stacks-blue',
  'noir',
  'sats-gold',
  'mempool-green',
  'hash-ice',
  'ordinals-neon',
  'blockspace-burn',
  'witness-forest',
  'mempool-storm',
  'genesis-slate',
  'op-return-copper'
] as const;

export type ThemeMode = (typeof THEME_MODES)[number];

export const THEME_OPTIONS: ReadonlyArray<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'xtrata-orange', label: 'Xtrata Orange' },
  { value: 'stacks-blue', label: 'Stacks Blue' },
  { value: 'noir', label: 'Noir' },
  { value: 'sats-gold', label: 'Sats Gold' },
  { value: 'mempool-green', label: 'Mempool Green' },
  { value: 'hash-ice', label: 'Hash Ice' },
  { value: 'ordinals-neon', label: 'Ordinals Neon' },
  { value: 'blockspace-burn', label: 'Blockspace Burn' },
  { value: 'witness-forest', label: 'Witness Forest' },
  { value: 'mempool-storm', label: 'Mempool Storm' },
  { value: 'genesis-slate', label: 'Genesis Slate' },
  { value: 'op-return-copper', label: 'OP_RETURN Copper' }
];

export const THEME_STORAGE_KEY = 'xtrata.theme.mode';

export const isThemeMode = (value: string): value is ThemeMode =>
  (THEME_MODES as readonly string[]).includes(value);

export const coerceThemeMode = (value: string): ThemeMode =>
  isThemeMode(value) ? value : 'dark';

const getLocalStorage = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  return window.localStorage;
};

export const readThemePreference = (): ThemeMode | null => {
  const storage = getLocalStorage();
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(THEME_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const value = raw.trim().toLowerCase();
    return isThemeMode(value) ? value : null;
  } catch {
    return null;
  }
};

export const writeThemePreference = (mode: ThemeMode): void => {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Ignore storage write failures.
  }
};

export const resolveInitialTheme = (): ThemeMode =>
  readThemePreference() ?? 'dark';

const getColorScheme = (mode: ThemeMode): 'light' | 'dark' =>
  mode === 'light' ? 'light' : 'dark';

export const applyThemeToDocument = (mode: ThemeMode): void => {
  if (typeof document === 'undefined' || !document.documentElement) {
    return;
  }
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.style.colorScheme = getColorScheme(mode);
};
