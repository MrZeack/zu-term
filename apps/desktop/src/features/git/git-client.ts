import { invoke } from '@tauri-apps/api/core';
import type { GitBranchInfo } from './git.ts';

export interface GitClient {
  detect(cwds: string[]): Promise<GitBranchInfo[]>;
}

export const gitClient: GitClient = {
  async detect(cwds: string[]): Promise<GitBranchInfo[]> {
    try {
      return await invoke<GitBranchInfo[]>('git_branches_detect', { cwds });
    } catch {
      return [];
    }
  },
};
