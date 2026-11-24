import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('deja la barra global enfocada en la marca y las acciones', async () => {
  const toolbarSource = await readFile(new URL('./AppToolbar.vue', import.meta.url), 'utf8');

  assert.match(toolbarSource, /class="brand"/);
  assert.match(toolbarSource, /WorkspaceMenu/);
  assert.match(toolbarSource, /class="toolbar-actions"/);
  assert.doesNotMatch(toolbarSource, /active-context/);
  assert.doesNotMatch(toolbarSource, /activePane(?:Title|Path)/);
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
  const controllerSource = await readFile(
    new URL('../workspace/workspace-controller.ts', import.meta.url),
    'utf8',
  );
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
  assert.match(controllerSource, /operation\.begin\('restore'/);
  assert.match(workspaceMenuSource, /:disabled="busy"/);
  assert.doesNotMatch(workspaceMenuSource, /workspace-quick-actions/);
});

test('amplía el menú desplegable de workspaces para aprovechar la altura de la ventana', async () => {
  const workspaceMenuSource = await readFile(
    new URL('../workspace/WorkspaceMenu.vue', import.meta.url),
    'utf8',
  );

  assert.match(workspaceMenuSource, /max-height:\s*calc\(100vh/);
  assert.match(workspaceMenuSource, /width:\s*320px/);
  assert.match(workspaceMenuSource, /overflow-y:\s*auto/);
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
  assert.match(layoutSource, /layoutEdgeAt/);
  assert.match(layoutSource, /store\.moveToEdge\(/);
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
  assert.match(layoutSource, /:font-family="props\.fontFamily"/);
  assert.match(layoutSource, /:font-size="props\.fontSize"/);
  assert.match(terminalSource, /historyId/);
  assert.match(terminalSource, /theme: ThemeName/);
  assert.match(terminalSource, /fontFamily\?: string/);
  assert.match(terminalSource, /fontSize\?: number/);
  assert.match(clientSource, /historyId/);
});

test('incorpora selector de tipografía y controles de tamaño en la barra global', async () => {
  const toolbarSource = await readFile(new URL('./AppToolbar.vue', import.meta.url), 'utf8');
  const appSource = await readFile(new URL('../../App.vue', import.meta.url), 'utf8');
  const fontMenuSource = await readFile(new URL('./FontMenu.vue', import.meta.url), 'utf8');

  assert.match(toolbarSource, /<FontMenu/);
  assert.match(toolbarSource, /class="font-size-control"/);
  assert.match(toolbarSource, /class="font-size-btn"/);
  assert.match(appSource, /increaseFontSize/);
  assert.match(appSource, /decreaseFontSize/);
  assert.match(appSource, /resetFontSize/);

  assert.match(fontMenuSource, /class="font-menu"/);
  assert.match(fontMenuSource, /class="font-popover"/);
  assert.match(fontMenuSource, /TERMINAL_FONTS/);
  assert.match(fontMenuSource, /document\.addEventListener\('pointerdown'/);
  assert.match(fontMenuSource, /document\.removeEventListener\('pointerdown'/);
});

test('pide confirmación al cerrar un split con procesos o agentes activos', async () => {
  const appSource = await readFile(new URL('../../App.vue', import.meta.url), 'utf8');
  const layoutSource = await readFile(new URL('../layout/LayoutView.vue', import.meta.url), 'utf8');
  const paneActionsSource = await readFile(
    new URL('../pane-actions/pane-actions.ts', import.meta.url),
    'utf8',
  );

  assert.match(layoutSource, /@close="emit\('close', id\)"/);
  assert.match(layoutSource, /close: \[paneId: string\]/);
  assert.match(appSource, /confirmClose:/);
  assert.match(appSource, /formatClosePaneConfirmation/);
  assert.match(appSource, /@close="\(paneId\) => actions\.run\('close', paneId\)/);
  assert.match(paneActionsSource, /paneHasActiveWork/);
  assert.match(paneActionsSource, /confirmClose/);
});
