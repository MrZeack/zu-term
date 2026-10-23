import { invoke } from '@tauri-apps/api/core';

export const configClient = {
  read: () => invoke<string | null>('config_read'),
  write: (data: string) => invoke<void>('config_write', { data }),
};
