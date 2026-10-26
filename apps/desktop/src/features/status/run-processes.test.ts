import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatRunProcessesSummary,
  formatRunProcessesTooltip,
  type RunProcessInfo,
} from './run-processes.ts';

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
