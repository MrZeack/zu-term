import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  formatRunProcessesSummary,
  formatRunProcessesTooltip,
  sameRunProcesses,
  splitDirectories,
  type RunProcessInfo,
} from './run-processes.ts';

test('solo consulta la carpeta actual de cada split abierto, sin duplicados', () => {
  assert.deepEqual(
    splitDirectories({
      a: { id: 'a', cwd: '/repo/api', startCwd: '/repo' },
      b: { id: 'b', startCwd: '/repo/web' },
      c: { id: 'c', cwd: '/repo/api' },
      d: { id: 'd' },
    }),
    ['/repo/api', '/repo/web'],
  );
});

test('formatea el resumen de procesos en .run para la barra de estado', () => {
  assert.equal(formatRunProcessesSummary([]), undefined);

  const single: RunProcessInfo[] = [
    { name: 'desktop', pid: 5821, projectDir: '/Users/zeack/personal/zu-term' },
  ];
  assert.equal(formatRunProcessesSummary(single), '.run: desktop (5821)');

  const multiple: RunProcessInfo[] = [
    { name: 'api', pid: 1200, projectDir: '/Users/zeack/project' },
    { name: 'web', pid: 1201, projectDir: '/Users/zeack/project' },
  ];
  assert.equal(formatRunProcessesSummary(multiple), '.run: api (1200), web (1201)');

  const many: RunProcessInfo[] = [
    { name: 'auth', pid: 10, projectDir: '/app' },
    { name: 'db', pid: 20, projectDir: '/app' },
    { name: 'queue', pid: 30, projectDir: '/app' },
  ];
  assert.equal(formatRunProcessesSummary(many), '.run: auth (10), db (20), queue (30)');

  const overflow: RunProcessInfo[] = [
    { name: 'auth', pid: 10, projectDir: '/app' },
    { name: 'db', pid: 20, projectDir: '/app' },
    { name: 'queue', pid: 30, projectDir: '/app' },
    { name: 'worker', pid: 40, projectDir: '/app' },
  ];
  assert.equal(formatRunProcessesSummary(overflow), '.run: auth (10), db (20) (+2)');
});

test('genera el tooltip descriptivo con PIDs y rutas de proyectos', () => {
  assert.equal(formatRunProcessesTooltip([]), undefined);

  const processes: RunProcessInfo[] = [
    { name: 'desktop', pid: 5821, projectDir: '/Users/zeack/personal/zu-term' },
    { name: 'backend', pid: 8080, projectDir: '/Users/zeack/work/api' },
  ];

  const tooltip = formatRunProcessesTooltip(processes, '/Users/zeack');
  assert.ok(tooltip?.includes('Procesos en .run:'));
  assert.ok(tooltip?.includes('• desktop (PID 5821) · ~/personal/zu-term'));
  assert.ok(tooltip?.includes('• backend (PID 8080) · ~/work/api'));
});

test('compara resultados de procesos por nombre, PID y carpeta, en orden', () => {
  const api = { name: 'api', pid: 10, projectDir: '/repo' };
  const web = { name: 'web', pid: 11, projectDir: '/repo' };

  assert.equal(sameRunProcesses([api, web], [{ ...api }, { ...web }]), true);
  assert.equal(sameRunProcesses([], []), true);
  assert.equal(sameRunProcesses([api], [api, web]), false);
  assert.equal(sameRunProcesses([api], [{ ...api, pid: 12 }]), false);
  assert.equal(sameRunProcesses([api, web], [web, api]), false);
});

test('App.vue solo vuelve a consultar procesos cuando cambian las carpetas de los splits', async () => {
  const appSource = await readFile(new URL('../../App.vue', import.meta.url), 'utf8');

  assert.match(appSource, /watch\(activeCwdsKey,/);
  assert.doesNotMatch(appSource, /watch\(activeCwds,/);
  assert.match(appSource, /if \(!sameRunProcesses\(runProcesses\.value, next\)\)/);
});
