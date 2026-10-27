import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { agentStatusLabel, formatTerminalSize, workspaceStatusLabel } from './status.ts';

test('formatea los datos compactos de la barra de estado', () => {
  assert.equal(workspaceStatusLabel('  Proyecto  '), 'Proyecto');
  assert.equal(workspaceStatusLabel(''), 'Sin guardar');
  assert.equal(agentStatusLabel({ provider: 'codex', sessionId: 'abc' }), 'Codex · resume');
  assert.equal(agentStatusLabel({ provider: 'claude' }), 'Claude · nueva');
  assert.equal(formatTerminalSize(120, 32), '120 × 32');
  assert.equal(formatTerminalSize(undefined, undefined), '—');
});

test('monta la barra de estado debajo del layout y recibe el tamaño de la PTY', async () => {
  const appSource = await readFile(new URL('../../App.vue', import.meta.url), 'utf8');
  const layoutSource = await readFile(new URL('../layout/LayoutView.vue', import.meta.url), 'utf8');
  const terminalSource = await readFile(
    new URL('../terminal/TerminalPane.vue', import.meta.url),
    'utf8',
  );
  const statusSource = await readFile(new URL('./StatusBar.vue', import.meta.url), 'utf8');

  assert.match(appSource, /<StatusBar/);
  assert.match(appSource, /terminalSizes/);
  assert.match(appSource, /:run-processes="runProcesses"/);
  assert.match(layoutSource, /@size=/);
  assert.match(terminalSource, /size: \[cols: number, rows: number\]/);
  assert.match(terminalSource, /term\.onResize/);
  assert.match(statusSource, /role="status"/);
  assert.match(statusSource, /workspaceName/);
  assert.match(statusSource, /formatTerminalSize/);
  assert.match(statusSource, /status-run/);
  assert.match(statusSource, /runProcesses/);
  assert.match(statusSource, /status-error/);
  assert.match(statusSource, /props\.errorCount/);
});
