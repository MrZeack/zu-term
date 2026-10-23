import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('deja la barra global enfocada en la marca y las acciones', async () => {
  const appSource = await readFile(new URL('../../App.vue', import.meta.url), 'utf8');

  assert.match(appSource, /class="brand"/);
  assert.match(appSource, /WorkspaceMenu/);
  assert.match(appSource, /class="toolbar-actions"/);
  assert.doesNotMatch(appSource, /active-context/);
  assert.doesNotMatch(appSource, /activePane(?:Title|Path)/);
});

test('mantiene el agente, nombre y carpeta en la cabecera de cada split', async () => {
  const paneHeaderSource = await readFile(
    new URL('../pane-header/PaneHeader.vue', import.meta.url),
    'utf8',
  );

  assert.match(paneHeaderSource, /class="command-badge"/);
  assert.match(paneHeaderSource, /class="title"/);
  assert.match(paneHeaderSource, /class="path"/);
});

test('mantiene guardar, nuevo y restaurar dentro del menú principal de workspace', async () => {
  const appSource = await readFile(new URL('../../App.vue', import.meta.url), 'utf8');
  const workspaceMenuSource = await readFile(
    new URL('../workspace/WorkspaceMenu.vue', import.meta.url),
    'utf8',
  );

  assert.match(workspaceMenuSource, /aria-label="Abrir menú principal de workspaces"/);
  assert.match(workspaceMenuSource, /class="workspace-popover"/);
  assert.match(workspaceMenuSource, /Guardar workspace/);
  assert.match(workspaceMenuSource, /Nuevo workspace/);
  assert.match(workspaceMenuSource, /Restaurar workspace/);
  assert.match(appSource, /useWorkspaceOperationStore/);
  assert.match(appSource, /workspaceOperation\.begin\('restore'/);
  assert.match(workspaceMenuSource, /:disabled="busy"/);
  assert.doesNotMatch(workspaceMenuSource, /workspace-quick-actions/);
});

test('cierra el menú de workspace al pulsar fuera y limpia el listener', async () => {
  const workspaceMenuSource = await readFile(
    new URL('../workspace/WorkspaceMenu.vue', import.meta.url),
    'utf8',
  );

  assert.match(workspaceMenuSource, /document\.addEventListener\('pointerdown'/);
  assert.match(workspaceMenuSource, /contains\(event\.target as Node\)/);
  assert.match(workspaceMenuSource, /document\.removeEventListener\('pointerdown'/);
});

test('permite reorganizar splits arrastrando una cabecera hacia una zona de drop', async () => {
  const layoutSource = await readFile(new URL('../layout/LayoutView.vue', import.meta.url), 'utf8');
  const paneHeaderSource = await readFile(
    new URL('../pane-header/PaneHeader.vue', import.meta.url),
    'utf8',
  );

  assert.match(paneHeaderSource, /:draggable/);
  assert.match(layoutSource, /@dragover\.prevent/);
  assert.match(layoutSource, /@drop\.prevent/);
  assert.match(layoutSource, /dropZoneAt/);
  assert.match(layoutSource, /drop-center/);
  assert.match(layoutSource, /store\.move\(/);
});

test('pasa el historial estable de cada pane al proceso de la PTY', async () => {
  const layoutSource = await readFile(new URL('../layout/LayoutView.vue', import.meta.url), 'utf8');
  const terminalSource = await readFile(
    new URL('../terminal/TerminalPane.vue', import.meta.url),
    'utf8',
  );
  const clientSource = await readFile(
    new URL('../terminal/pty-client.ts', import.meta.url),
    'utf8',
  );

  assert.match(layoutSource, /:theme="props\.theme"/);
  assert.match(terminalSource, /historyId/);
  assert.match(terminalSource, /theme: ThemeName/);
  assert.match(clientSource, /historyId/);
});
