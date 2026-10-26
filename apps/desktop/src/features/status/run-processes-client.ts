import { invoke } from '@tauri-apps/api/core';
import type { RunProcessInfo } from './run-processes.ts';

export interface RunProcessesClient {
  detect(cwds: string[]): Promise<RunProcessInfo[]>;
}

export const runProcessesClient: RunProcessesClient = {
  async detect(cwds: string[]): Promise<RunProcessInfo[]> {
    try {
      return await invoke<RunProcessInfo[]>('run_processes_detect', { cwds });
    } catch {
      return [];
    }
  },
};
