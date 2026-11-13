import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  formatGitStatus,
  formatGitStatusTooltip,
  gitBranchMap,
  sameGitBranches,
  sameGitStatus,
  type GitBranchInfo,
} from './git.ts';

test('gitBranchMap convierte una lista de ramas y estados en un mapa por directorio', () => {
  const branches: GitBranchInfo[] = [
    { cwd: '/home/user/project', branch: 'main', status: { added: 2, modified: 1, deleted: 0 } },
    { cwd: '/home/user/api', branch: 'feature/auth' },
  ];

  assert.deepEqual(gitBranchMap(branches), {
    '/home/user/project': {
      branch: 'main',
      status: { added: 2, modified: 1, deleted: 0 },
    },
    '/home/user/api': {
      branch: 'feature/auth',
    },
  });
});

test('formatGitStatus formatea el resumen de cambios para el badge', () => {
  assert.equal(formatGitStatus(undefined), null);
  assert.equal(formatGitStatus({ added: 0, modified: 0, deleted: 0 }), null);
  assert.equal(formatGitStatus({ added: 2, modified: 1, deleted: 0 }), '+2 ~1');
  assert.equal(formatGitStatus({ added: 0, modified: 3, deleted: 1 }), '~3 -1');
  assert.equal(formatGitStatus({ added: 1, modified: 0, deleted: 0 }), '+1');
  assert.equal(formatGitStatus({ added: 0, modified: 0, deleted: 4 }), '-4');
});

test('formatGitStatusTooltip describe los cambios en texto legible en español', () => {
  assert.equal(formatGitStatusTooltip(undefined), null);
  assert.equal(
    formatGitStatusTooltip({ added: 0, modified: 0, deleted: 0 }),
    'Directorio de trabajo limpio',
  );
  assert.equal(
    formatGitStatusTooltip({ added: 1, modified: 2, deleted: 1 }),
    '1 nuevo, 2 modificados, 1 eliminado',
  );
  assert.equal(formatGitStatusTooltip({ added: 2, modified: 0, deleted: 0 }), '2 nuevos');
});

test('sameGitStatus compara resúmenes de estado', () => {
  assert.equal(sameGitStatus(undefined, undefined), true);
  assert.equal(sameGitStatus({ added: 1, modified: 0, deleted: 0 }, undefined), false);
  assert.equal(
    sameGitStatus({ added: 1, modified: 2, deleted: 0 }, { added: 1, modified: 2, deleted: 0 }),
    true,
  );
  assert.equal(
    sameGitStatus({ added: 1, modified: 2, deleted: 0 }, { added: 1, modified: 3, deleted: 0 }),
    false,
  );
});

test('sameGitBranches compara mapas de ramas y estados para evitar re-renderizados innecesarios', () => {
  const a = { '/a': { branch: 'main', status: { added: 1, modified: 0, deleted: 0 } } };
  const b = { '/a': { branch: 'main', status: { added: 1, modified: 0, deleted: 0 } } };
  const c = { '/a': { branch: 'main', status: { added: 2, modified: 0, deleted: 0 } } };
  const d = { '/a': { branch: 'dev', status: { added: 1, modified: 0, deleted: 0 } } };

  assert.equal(sameGitBranches(a, b), true);
  assert.equal(sameGitBranches(a, c), false);
  assert.equal(sameGitBranches(a, d), false);
});

test('PaneHeader.vue expone la rama de git y estado en cada split cuando existe un repositorio', async () => {
  const headerSource = await readFile(
    new URL('../pane-header/PaneHeader.vue', import.meta.url),
    'utf8',
  );

  assert.match(headerSource, /branch\?:/);
  assert.match(headerSource, /gitStatus\?:/);
  assert.match(headerSource, /class="branch-badge"/);
  assert.match(headerSource, /branch-icon/);
  assert.match(headerSource, /branch-status/);
});

test('LayoutView.vue pasa la rama y estado correspondientes a cada PaneHeader', async () => {
  const layoutSource = await readFile(new URL('../layout/LayoutView.vue', import.meta.url), 'utf8');

  assert.match(layoutSource, /gitBranches\?:/);
  assert.match(layoutSource, /:branch=/);
  assert.match(layoutSource, /:git-status=/);
});

test('StatusBar.vue y status.ts muestran la rama y estado del split activo cuando existe repositorio', async () => {
  const statusSource = await readFile(new URL('../status/StatusBar.vue', import.meta.url), 'utf8');
  const statusTsSource = await readFile(new URL('../status/status.ts', import.meta.url), 'utf8');

  assert.match(statusTsSource, /branch\?:/);
  assert.match(statusTsSource, /gitStatus\?:/);
  assert.match(statusSource, /props\.pane\?\.branch/);
  assert.match(statusSource, /status-branch/);
});

test('App.vue consulta las ramas y estados de git de los splits abiertos y las distribuye reactivamente', async () => {
  const appSource = await readFile(new URL('../../App.vue', import.meta.url), 'utf8');

  assert.match(appSource, /gitClient/);
  assert.match(appSource, /gitBranches/);
  assert.match(appSource, /:git-branches="gitBranches"/);
});
