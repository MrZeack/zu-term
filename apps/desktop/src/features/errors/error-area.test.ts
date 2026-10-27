import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('ErrorArea.vue implementa los roles de accesibilidad y acciones para concentrar errores', async () => {
  const source = await readFile(new URL('./ErrorArea.vue', import.meta.url), 'utf8');

  assert.match(source, /role="alert"/);
  assert.match(source, /aria-live="assertive"/);
  assert.match(source, /class="error-area"/);
  assert.match(source, /aria-label="Cerrar"/);
  assert.match(source, /Limpiar/);
  assert.match(source, /emit\('dismiss'/);
  assert.match(source, /emit\('clear'\)/);
  assert.match(source, /emit\('toggle'\)/);
});

test('App.vue integra ErrorArea en la interfaz principal y canaliza errores', async () => {
  const appSource = await readFile(new URL('../../App.vue', import.meta.url), 'utf8');

  assert.match(appSource, /import ErrorArea from '\.\/features\/errors\/ErrorArea\.vue'/);
  assert.match(appSource, /<ErrorArea/);
  assert.match(appSource, /useErrorStore/);
  assert.match(appSource, /:error-count=/);
});

test('StatusBar.vue expone indicador y botón para desplegar u ocultar el área de errores', async () => {
  const statusSource = await readFile(new URL('../status/StatusBar.vue', import.meta.url), 'utf8');

  assert.match(statusSource, /status-error/);
  assert.match(statusSource, /props\.errorCount/);
  assert.match(statusSource, /toggleErrors/);
});
