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
