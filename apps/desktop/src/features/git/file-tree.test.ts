import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFileTree, hiddenByCollapse } from './file-tree.ts';

const show = (paths: string[]) =>
  buildFileTree(paths).map((row) =>
    row.kind === 'folder'
      ? `${'  '.repeat(row.depth)}${row.label}/`
      : `${'  '.repeat(row.depth)}${row.label} #${row.index}`,
  );

test('agrupa por carpeta y junta las carpetas que solo contienen otra', () => {
  assert.deepEqual(
    show([
      'apps/desktop/src/features/git/git.rs',
      'apps/desktop/src/features/git/DiffView.vue',
      'apps/desktop/src/features/layout/LayoutView.vue',
      'apps/desktop/src-tauri/build.rs',
      'README.md',
    ]),
    [
      'apps/desktop/',
      '  src/features/',
      '    git/',
      '      DiffView.vue #1',
      '      git.rs #0',
      '    layout/',
      '      LayoutView.vue #2',
      '  src-tauri/',
      '    build.rs #3',
      'README.md #4',
    ],
  );
});

test('una carpeta con un solo archivo muestra su ruta entera en una fila', () => {
  assert.deepEqual(show(['a/b/c/d.txt']), ['a/b/c/', '  d.txt #0']);
  assert.deepEqual(show(['x.txt']), ['x.txt #0']);
  assert.deepEqual(show([]), []);
});

test('cada carpeta conoce su ruta completa para colapsarla', () => {
  const rows = buildFileTree(['apps/desktop/a.ts', 'apps/desktop/sub/b.ts', 'c.ts']);
  const sub = rows.find((row) => row.kind === 'folder' && row.label === 'sub');
  assert.equal(sub?.path, 'apps/desktop/sub');

  const hidden = rows.filter((row) => hiddenByCollapse(row, new Set(['apps/desktop'])));
  assert.deepEqual(
    hidden.map((row) => row.path),
    ['apps/desktop/sub', 'apps/desktop/sub/b.ts', 'apps/desktop/a.ts'],
  );
});
