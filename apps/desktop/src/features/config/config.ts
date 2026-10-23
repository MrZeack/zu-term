import type { ThemeName } from '../theme/theme.ts';
import { parseWorkspaceCatalog, type WorkspaceCatalog } from '../workspace/workspace.ts';

export const CONFIG_VERSION = 1;

export interface ConfigFile {
  version: typeof CONFIG_VERSION;
  theme: ThemeName;
  workspaceCatalog: WorkspaceCatalog;
}

export function createConfigFile(theme: ThemeName, workspaceCatalog: WorkspaceCatalog): ConfigFile {
  return { version: CONFIG_VERSION, theme, workspaceCatalog };
}

export function parseConfigFile(raw: string | null): {
  theme: ThemeName;
  catalog: WorkspaceCatalog;
} | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (record.version !== CONFIG_VERSION) return null;
    if (record.theme !== 'cyan' && record.theme !== 'mint') return null;
    const catalog = parseWorkspaceCatalog(record.workspaceCatalog);
    return catalog ? { theme: record.theme, catalog } : null;
  } catch {
    return null;
  }
}
