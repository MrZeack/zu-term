export interface GitBranchInfo {
  cwd: string;
  branch: string;
}

export function gitBranchMap(branches: GitBranchInfo[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const { cwd, branch } of branches) {
    if (cwd && branch) {
      map[cwd] = branch;
    }
  }
  return map;
}

export function sameGitBranches(a: Record<string, string>, b: Record<string, string>): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => a[key] === b[key]);
}
