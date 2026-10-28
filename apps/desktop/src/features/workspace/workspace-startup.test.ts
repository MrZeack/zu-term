import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('el arranque no restaura el workspace activo sin una selección explícita', async () => {
  const appSource = await readFile(new URL('../../App.vue', import.meta.url), 'utf8');
  const startupStart = appSource.indexOf('const catalog =');
  const startupEnd = appSource.indexOf('ready.value = true;');
  const startupSource = appSource.slice(startupStart, startupEnd);

  assert.match(startupSource, /const startupCatalog = setActiveWorkspace\(catalog, null\)/);
  assert.doesNotMatch(startupSource, /store\.restore\(/);
  assert.match(startupSource, /store\.init\(launchCwd \?\? homePath\)/);
});

test('el workspace solo se guarda con el botón o al cerrar, nunca con cada cambio', async () => {
  const appSource = await readFile(new URL('../../App.vue', import.meta.url), 'utf8');

  assert.doesNotMatch(appSource, /watch\(\s*\[\s*\(\) => store\.root/);
  assert.doesNotMatch(appSource, /deep: true/);
  assert.match(appSource, /@save="saveWorkspaceFromMenu"/);
  assert.match(appSource, /if \(restore && !\(await saveCurrentWorkspace\(\)\)\) return;/);
});

test('el workspace activo adquiere un lock y lo libera antes de cerrar la ventana', async () => {
  const appSource = await readFile(new URL('../../App.vue', import.meta.url), 'utf8');
  const clientSource = await readFile(
    new URL('./workspace-lock-client.ts', import.meta.url),
    'utf8',
  );

  assert.match(clientSource, /workspace_lock_acquire/);
  assert.match(clientSource, /workspace_lock_release_all/);
  assert.match(appSource, /locks: workspaceLockClient/);
  assert.match(appSource, /session\.acquire\(id\)/);
  assert.match(appSource, /if \(!\(await session\.releaseAll\(\)\)\) return/);
});

test('el cierre espera si otra restauración de workspace sigue en curso', async () => {
  const appSource = await readFile(new URL('../../App.vue', import.meta.url), 'utf8');

  assert.match(appSource, /if \(workspaceOperation\.busy\) return/);
});
