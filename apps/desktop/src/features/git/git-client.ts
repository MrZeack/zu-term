import { invoke } from '@tauri-apps/api/core';
import type { GitDiff } from './git-diff.ts';
import type { GitBranchInfo } from './git.ts';

export interface GitClient {
  detect(cwds: string[]): Promise<GitBranchInfo[]>;
  // Rejects with the backend message (not a repository root, git timed out).
  diff(cwd: string): Promise<GitDiff>;
}

export const gitClient: GitClient = {
  async detect(cwds: string[]): Promise<GitBranchInfo[]> {
    try {
      return await invoke<GitBranchInfo[]>('git_branches_detect', { cwds });
    } catch {
      return [];
    }
  },
  diff: (cwd: string) => invoke<GitDiff>('git_diff', { cwd }),
};
