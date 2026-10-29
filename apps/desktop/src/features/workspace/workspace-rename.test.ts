import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('WorkspaceMenu.vue ofrece acciones para renombrar el workspace activo y elementos individuales', async () => {
  const menuSource = await readFile(new URL('./WorkspaceMenu.vue', import.meta.url), 'utf8');

  // Emits debe declarar el evento rename con el id del workspace
  assert.match(menuSource, /rename:\s*\[id:\s*string\]/);

  // Acción en cabecera del menú para renombrar el workspace activo
  assert.match(menuSource, /Renombrar workspace/);
  assert.match(menuSource, /emit\('rename',\s*activeId\)/);

  // Botón individual en cada fila de workspace de la lista
  assert.match(menuSource, /class="workspace-rename"/);
  assert.match(menuSource, /emit\('rename',\s*workspace\.id\)/);
  assert.match(menuSource, /:aria-label="`Renombrar workspace \$\{workspace\.name\}`"/);
});

test('WorkspaceNameDialog.vue soporta prellenado y selección del nombre actual', async () => {
  const dialogSource = await readFile(
    new URL('./WorkspaceNameDialog.vue', import.meta.url),
    'utf8',
  );

  assert.match(dialogSource, /initialName\?:/);
  assert.match(dialogSource, /input\.value\?\.select\(\)/);
});

test('App.vue conecta la acción de renombrar workspace con el diálogo y la persistencia', async () => {
  const appSource = await readFile(new URL('../../App.vue', import.meta.url), 'utf8');

  // Modo rename en el diálogo
  assert.match(appSource, /'rename'/);

  // Manejador @rename conectado a WorkspaceMenu
  assert.match(appSource, /@rename=/);

  // Pasa initial-name al diálogo de workspace
  assert.match(appSource, /:initial-name=/);

  // Función o acción que persiste el nuevo nombre del workspace
  assert.match(appSource, /renameWorkspace/);
});
