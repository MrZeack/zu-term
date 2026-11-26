// Uncommitted changes of a repository, as returned by the `git_diff` command.
export interface GitDiff {
  diff: string;
  truncated: boolean;
  untracked: string[];
}

export type DiffLineKind = 'hunk' | 'add' | 'del' | 'context' | 'meta';

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  // Line number in the old and the new file, when the line exists there.
  oldLine?: number;
  newLine?: number;
}

const HUNK_START = /^@@+ -(\d+)(?:,\d+)? \+(\d+)/;

export interface DiffFile {
  path: string;
  oldPath?: string;
  status: 'added' | 'deleted' | 'modified' | 'renamed';
  additions: number;
  deletions: number;
  lines: DiffLine[];
}

function headerPath(line: string, prefix: '--- ' | '+++ '): string | null {
  const value = line.slice(prefix.length);
  if (value === '/dev/null') return null;
  return value.replace(/^[ab]\//, '');
}

// `diff --git a/x b/x`: only used when no `---`/`+++` lines follow (binary or
// rename-only files); paths with " b/" inside them are split at the middle.
function gitHeaderPath(line: string): string {
  const rest = line.slice('diff --git '.length);
  const half = rest.length / 2;
  const split = rest.indexOf(' b/', Math.floor(half) - 1);
  return split >= 0 ? rest.slice(split + 3) : rest.replace(/^a\//, '');
}

export function parseUnifiedDiff(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  let file: DiffFile | undefined;
  let inHunk = false;
  let oldLine = 0;
  let newLine = 0;

  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      file = {
        path: gitHeaderPath(line),
        status: 'modified',
        additions: 0,
        deletions: 0,
        lines: [],
      };
      files.push(file);
      inHunk = false;
      continue;
    }
    if (!file) continue;

    if (line.startsWith('@@')) {
      inHunk = true;
      const start = HUNK_START.exec(line);
      oldLine = Number(start?.[1] ?? 0);
      newLine = Number(start?.[2] ?? 0);
      file.lines.push({ kind: 'hunk', text: line });
    } else if (inHunk && line.startsWith('+')) {
      file.additions += 1;
      file.lines.push({ kind: 'add', text: line, newLine: newLine++ });
    } else if (inHunk && line.startsWith('-')) {
      file.deletions += 1;
      file.lines.push({ kind: 'del', text: line, oldLine: oldLine++ });
    } else if (inHunk && line.startsWith(' ')) {
      file.lines.push({ kind: 'context', text: line, oldLine: oldLine++, newLine: newLine++ });
    } else if (inHunk && line.startsWith('\\')) {
      file.lines.push({ kind: 'meta', text: line });
    } else if (line.startsWith('--- ')) {
      const path = headerPath(line, '--- ');
      if (path === null) file.status = 'added';
    } else if (line.startsWith('+++ ')) {
      const path = headerPath(line, '+++ ');
      if (path === null) file.status = 'deleted';
      else file.path = path;
    } else if (line.startsWith('rename from ')) {
      file.oldPath = line.slice('rename from '.length);
      file.status = 'renamed';
    } else if (line.startsWith('rename to ')) {
      file.path = line.slice('rename to '.length);
    } else if (line.startsWith('Binary files ')) {
      file.lines.push({ kind: 'meta', text: line });
    }
  }
  return files;
}

export function diffSummary(files: DiffFile[]): {
  files: number;
  additions: number;
  deletions: number;
} {
  return {
    files: files.length,
    additions: files.reduce((total, file) => total + file.additions, 0),
    deletions: files.reduce((total, file) => total + file.deletions, 0),
  };
}
