import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { diffSummary, parseUnifiedDiff } from './git-diff.ts';

const SAMPLE = [
  'diff --git a/src/app.ts b/src/app.ts',
  'index 1111111..2222222 100644',
  '--- a/src/app.ts',
  '+++ b/src/app.ts',
  '@@ -1,3 +1,3 @@ export function main() {',
  ' const a = 1;',
  '-const b = 2;',
  '+const b = 3;',
  '\\ No newline at end of file',
  'diff --git a/nuevo archivo.md b/nuevo archivo.md',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/nuevo archivo.md',
  '@@ -0,0 +1 @@',
  '+# hola',
  'diff --git a/old.txt b/old.txt',
  'deleted file mode 100644',
  '--- a/old.txt',
  '+++ /dev/null',
  '@@ -1 +0,0 @@',
  '-adiós',
  'diff --git a/before.ts b/after.ts',
  'similarity index 100%',
  'rename from before.ts',
  'rename to after.ts',
  'diff --git a/logo.png b/logo.png',
  'Binary files a/logo.png and b/logo.png differ',
  '',
].join('\n');

test('separa el diff por archivo con su estado y sus líneas', () => {
  const files = parseUnifiedDiff(SAMPLE);

  assert.deepEqual(
    files.map(({ path, status, additions, deletions }) => ({ path, status, additions, deletions })),
    [
      { path: 'src/app.ts', status: 'modified', additions: 1, deletions: 1 },
      { path: 'nuevo archivo.md', status: 'added', additions: 1, deletions: 0 },
      { path: 'old.txt', status: 'deleted', additions: 0, deletions: 1 },
      { path: 'after.ts', status: 'renamed', additions: 0, deletions: 0 },
      { path: 'logo.png', status: 'modified', additions: 0, deletions: 0 },
    ],
  );
  assert.equal(files[3]?.oldPath, 'before.ts');
  assert.deepEqual(
    files[0]?.lines.map((line) => line.kind),
    ['hunk', 'context', 'del', 'add', 'meta'],
  );
  assert.equal(files[0]?.lines[0]?.text, '@@ -1,3 +1,3 @@ export function main() {');
  assert.deepEqual(files[4]?.lines, [
    { kind: 'meta', text: 'Binary files a/logo.png and b/logo.png differ' },
  ]);
});

test('resume archivos, líneas añadidas y borradas', () => {
  assert.deepEqual(diffSummary(parseUnifiedDiff(SAMPLE)), {
    files: 5,
    additions: 2,
    deletions: 2,
  });
  assert.deepEqual(parseUnifiedDiff(''), []);
});

test('el branch del split abre el diff de su carpeta', async () => {
  const header = await readFile(new URL('../pane-header/PaneHeader.vue', import.meta.url), 'utf8');
  const layout = await readFile(new URL('../layout/LayoutView.vue', import.meta.url), 'utf8');
  const client = await readFile(new URL('./git-client.ts', import.meta.url), 'utf8');

  assert.match(header, /<button[^>]*class="branch-badge"[\s\S]*?@click\.stop="emit\('showDiff'\)"/);
  assert.match(layout, /@show-diff="openDiff\(id\)"/);
  assert.match(layout, /<GitDiffDialog/);
  assert.match(client, /invoke<GitDiff>\('git_diff', \{ cwd \}\)/);
});
