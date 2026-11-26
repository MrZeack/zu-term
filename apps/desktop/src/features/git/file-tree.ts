// File list of a diff as a tree: one row per folder with its path, files
// below with only their name. A folder that holds nothing but another
// folder is merged into it (`src/features/`), so deep paths do not pile up
// indentation and every path stays readable in full.
export type FileTreeRow =
  | { kind: 'folder'; label: string; path: string; depth: number }
  | { kind: 'file'; label: string; path: string; depth: number; index: number };

interface Folder {
  folders: Map<string, Folder>;
  files: { name: string; index: number }[];
}

const emptyFolder = (): Folder => ({ folders: new Map(), files: [] });
const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

export function buildFileTree(paths: string[]): FileTreeRow[] {
  const root = emptyFolder();
  paths.forEach((path, index) => {
    const parts = path.split('/').filter(Boolean);
    const name = parts.pop() ?? path;
    let folder = root;
    for (const part of parts) {
      let next = folder.folders.get(part);
      if (!next) {
        next = emptyFolder();
        folder.folders.set(part, next);
      }
      folder = next;
    }
    folder.files.push({ name, index });
  });

  const rows: FileTreeRow[] = [];
  const walk = (folder: Folder, prefix: string, depth: number) => {
    for (const name of [...folder.folders.keys()].sort(byName)) {
      let child = folder.folders.get(name) as Folder;
      let label = name;
      while (child.files.length === 0 && child.folders.size === 1) {
        const [onlyName, only] = [...child.folders][0] as [string, Folder];
        label = `${label}/${onlyName}`;
        child = only;
      }
      const path = prefix ? `${prefix}/${label}` : label;
      rows.push({ kind: 'folder', label, path, depth });
      walk(child, path, depth + 1);
    }
    for (const file of [...folder.files].sort((a, b) => byName(a.name, b.name))) {
      const path = prefix ? `${prefix}/${file.name}` : file.name;
      rows.push({ kind: 'file', label: file.name, path, depth, index: file.index });
    }
  };
  walk(root, '', 0);
  return rows;
}

// A row is hidden when one of its parent folders is collapsed.
export function hiddenByCollapse(row: FileTreeRow, collapsed: Set<string>): boolean {
  for (const folder of collapsed) {
    if (row.path.startsWith(`${folder}/`)) return true;
  }
  return false;
}
