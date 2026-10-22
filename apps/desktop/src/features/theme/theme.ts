import { APP_SLUG } from '../../core/brand.ts';

export const THEME_STORAGE_KEY = `${APP_SLUG}.theme`;
export const THEME_CHANGE_EVENT = `${APP_SLUG}-theme-change`;

export type ThemeName = 'cyan' | 'mint';

export const themeColors = {
  cyan: { primary: '#00b7d5', secondary: '#00ca91' },
  mint: { primary: '#00ca91', secondary: '#00b7d5' },
} as const;

interface ThemeReader {
  getItem(key: string): string | null;
}

interface ThemeWriter {
  setItem(key: string, value: string): void;
}

export function loadTheme(storage: ThemeReader): ThemeName {
  try {
    const value = storage.getItem(THEME_STORAGE_KEY);
    return value === 'mint' ? 'mint' : 'cyan';
  } catch {
    return 'cyan';
  }
}

export function persistTheme(storage: ThemeWriter, theme: ThemeName): void {
  try {
    storage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // A restricted WebView may deny localStorage; the current session still works.
  }
}

export function nextTheme(theme: ThemeName): ThemeName {
  return theme === 'cyan' ? 'mint' : 'cyan';
}

export function terminalTheme(theme: ThemeName) {
  const colors = themeColors[theme];
  return {
    background: '#111a20',
    foreground: '#e8f2f4',
    cursor: colors.secondary,
    cursorAccent: '#111a20',
    selectionBackground: `${colors.primary}55`,
    black: '#111a20',
    red: '#ff7a8a',
    green: '#70e0a8',
    yellow: '#f3d477',
    blue: '#7bb8ff',
    magenta: '#d0a0ff',
    cyan: colors.primary,
    white: '#e8f2f4',
    brightBlack: '#71808b',
    brightRed: '#ff9ba7',
    brightGreen: '#a0f5c5',
    brightYellow: '#ffe6a0',
    brightBlue: '#a8d1ff',
    brightMagenta: '#e1c4ff',
    brightCyan: colors.secondary,
    brightWhite: '#ffffff',
  };
}
