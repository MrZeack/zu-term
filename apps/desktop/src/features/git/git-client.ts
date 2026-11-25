import { invoke } from '@tauri-apps/api/core';
import type { GitDiff } from './git-diff.ts';
import type { GitCommitDetail, GitLogPage } from './git-log.ts';
import type { GitBranchInfo } from './git.ts';

export interface GitClient {
  detect(cwds: string[]): Promise<GitBranchInfo[]>;
  // Rejects with the backend message (not a repository root, git timed out).
  diff(cwd: string): Promise<GitDiff>;
  log(cwd: string, skip: number): Promise<GitLogPage>;
  show(cwd: string, hash: string): Promise<GitCommitDetail>;
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
  log: (cwd: string, skip: number) => invoke<GitLogPage>('git_log', { cwd, skip }),
  show: (cwd: string, hash: string) => invoke<GitCommitDetail>('git_show', { cwd, hash }),
};
