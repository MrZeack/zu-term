import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { gitBranchMap, sameGitBranches, type GitBranchInfo } from './git.ts';

test('gitBranchMap convierte una lista de ramas en un mapa por directorio', () => {
  const branches: GitBranchInfo[] = [
    { cwd: '/home/user/project', branch: 'main' },
    { cwd: '/home/user/api', branch: 'feature/auth' },
  ];

  assert.deepEqual(gitBranchMap(branches), {
    '/home/user/project': 'main',
    '/home/user/api': 'feature/auth',
  });
});

test('sameGitBranches compara mapas de ramas para evitar re-renderizados innecesarios', () => {
  const a = { '/a': 'main', '/b': 'feat' };
  const b = { '/a': 'main', '/b': 'feat' };
  const c = { '/a': 'main', '/b': 'dev' };
  const d = { '/a': 'main' };

  assert.equal(sameGitBranches(a, b), true);
  assert.equal(sameGitBranches(a, c), false);
  assert.equal(sameGitBranches(a, d), false);
});

test('PaneHeader.vue expone la rama de git en cada split cuando existe un repositorio', async () => {
  const headerSource = await readFile(
    new URL('../pane-header/PaneHeader.vue', import.meta.url),
    'utf8',
  );

  assert.match(headerSource, /branch\?:/);
  assert.match(headerSource, /class="branch-badge"/);
  assert.match(headerSource, /branch-icon/);
  assert.match(headerSource, /\{\{\s*branch\s*\}\}/);
});

test('LayoutView.vue pasa la rama correspondiente a cada PaneHeader', async () => {
  const layoutSource = await readFile(new URL('../layout/LayoutView.vue', import.meta.url), 'utf8');

  assert.match(layoutSource, /gitBranches\?:/);
  assert.match(layoutSource, /:branch=/);
});

test('StatusBar.vue y status.ts muestran la rama del split activo cuando existe repositorio', async () => {
  const statusSource = await readFile(new URL('../status/StatusBar.vue', import.meta.url), 'utf8');
  const statusTsSource = await readFile(new URL('../status/status.ts', import.meta.url), 'utf8');

  assert.match(statusTsSource, /branch\?:/);
  assert.match(statusSource, /props\.pane\?\.branch/);
  assert.match(statusSource, /status-branch/);
});

test('App.vue consulta las ramas de git de los splits abiertos y las distribuye reactivamente', async () => {
  const appSource = await readFile(new URL('../../App.vue', import.meta.url), 'utf8');

  assert.match(appSource, /gitClient/);
  assert.match(appSource, /gitBranches/);
  assert.match(appSource, /:git-branches="gitBranches"/);
});
