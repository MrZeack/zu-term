import {
  clampFontSize,
  DEFAULT_TERMINAL_FONT_ID,
  DEFAULT_TERMINAL_FONT_SIZE,
  isTerminalFontId,
  type TerminalFontId,
} from '../terminal/terminal-font.ts';
import type { ThemeName } from '../theme/theme.ts';
import { parseWorkspaceCatalog, type WorkspaceCatalog } from '../workspace/workspace.ts';

export const CONFIG_VERSION = 1;

export interface ConfigFile {
  version: typeof CONFIG_VERSION;
  theme: ThemeName;
  fontFamily: TerminalFontId;
  fontSize: number;
  workspaceCatalog: WorkspaceCatalog;
}

export function createConfigFile(
  theme: ThemeName,
  workspaceCatalog: WorkspaceCatalog,
  fontFamily: TerminalFontId = DEFAULT_TERMINAL_FONT_ID,
  fontSize: number = DEFAULT_TERMINAL_FONT_SIZE,
): ConfigFile {
  return {
    version: CONFIG_VERSION,
    theme,
    fontFamily: isTerminalFontId(fontFamily) ? fontFamily : DEFAULT_TERMINAL_FONT_ID,
    fontSize: clampFontSize(fontSize),
    workspaceCatalog,
  };
}

export function parseConfigFile(raw: string | null): {
  theme: ThemeName;
  catalog: WorkspaceCatalog;
  fontFamily: TerminalFontId;
  fontSize: number;
} | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (record.version !== CONFIG_VERSION) return null;
    if (record.theme !== 'cyan' && record.theme !== 'mint') return null;
    const catalog = parseWorkspaceCatalog(record.workspaceCatalog);
    if (!catalog) return null;

    const fontFamily: TerminalFontId = isTerminalFontId(record.fontFamily)
      ? record.fontFamily
      : DEFAULT_TERMINAL_FONT_ID;
    const fontSize =
      typeof record.fontSize === 'number'
        ? clampFontSize(record.fontSize)
        : DEFAULT_TERMINAL_FONT_SIZE;

    return {
      theme: record.theme,
      catalog,
      fontFamily,
      fontSize,
    };
  } catch {
    return null;
  }
}
