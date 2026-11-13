export interface GitStatusSummary {
  added: number;
  modified: number;
  deleted: number;
}

export interface GitBranchInfo {
  cwd: string;
  branch: string;
  status?: GitStatusSummary;
}

export interface GitDirectoryInfo {
  branch: string;
  status?: GitStatusSummary;
}

export function gitBranchMap(branches: GitBranchInfo[]): Record<string, GitDirectoryInfo> {
  const map: Record<string, GitDirectoryInfo> = {};
  for (const { cwd, branch, status } of branches) {
    if (cwd && branch) {
      map[cwd] = {
        branch,
        ...(status ? { status } : {}),
      };
    }
  }
  return map;
}

export function formatGitStatus(status: GitStatusSummary | undefined): string | null {
  if (!status) return null;
  const parts: string[] = [];
  if (status.added > 0) parts.push(`+${status.added}`);
  if (status.modified > 0) parts.push(`~${status.modified}`);
  if (status.deleted > 0) parts.push(`-${status.deleted}`);
  return parts.length > 0 ? parts.join(' ') : null;
}

export function formatGitStatusTooltip(status: GitStatusSummary | undefined): string | null {
  if (!status) return null;
  const parts: string[] = [];
  if (status.added > 0) parts.push(`${status.added} nuevo${status.added === 1 ? '' : 's'}`);
  if (status.modified > 0)
    parts.push(`${status.modified} modificado${status.modified === 1 ? '' : 's'}`);
  if (status.deleted > 0)
    parts.push(`${status.deleted} eliminado${status.deleted === 1 ? '' : 's'}`);
  return parts.length > 0 ? parts.join(', ') : 'Directorio de trabajo limpio';
}

export function sameGitStatus(
  a: GitStatusSummary | undefined,
  b: GitStatusSummary | undefined,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.added === b.added && a.modified === b.modified && a.deleted === b.deleted;
}

export function sameGitBranches(
  a: Record<string, GitDirectoryInfo>,
  b: Record<string, GitDirectoryInfo>,
): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => {
    const itemA = a[key];
    const itemB = b[key];
    if (!itemA || !itemB) return false;
    return itemA.branch === itemB.branch && sameGitStatus(itemA.status, itemB.status);
  });
}
