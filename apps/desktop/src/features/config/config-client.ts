import { invoke } from '@tauri-apps/api/core';
import type { TerminalFontId } from '../terminal/terminal-font.ts';
import type { ThemeName } from '../theme/theme.ts';
import type { WorkspaceRecord } from '../workspace/workspace.ts';

export interface ConfigSettings {
  theme: ThemeName;
  fontFamily: TerminalFontId;
  fontSize: number;
}

// config.json is written only by the backend, one change at a time; it emits
// WORKSPACES_UPDATED_EVENT to every window after a workspace change.
export const WORKSPACES_UPDATED_EVENT = 'zu-term://workspaces-updated';

export const configClient = {
  read: () => invoke<string | null>('config_read'),
  importConfig: (data: string) => invoke<boolean>('config_import', { data }),
  saveSettings: (settings: ConfigSettings) => invoke<void>('settings_save', { ...settings }),
  saveWorkspace: (workspace: WorkspaceRecord) => invoke<void>('workspace_save', { workspace }),
  deleteWorkspace: (workspaceId: string) => invoke<boolean>('workspace_delete', { workspaceId }),
};
