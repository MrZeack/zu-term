import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkspaceCatalog } from '../workspace/workspace.ts';
import { createConfigFile, parseConfigFile } from './config.ts';

test('serializa tema y catálogo en un único archivo de configuración', () => {
  const catalog = createWorkspaceCatalog();
  catalog.activeId = null;
  const config = createConfigFile('mint', catalog);

  assert.deepEqual(parseConfigFile(JSON.stringify(config)), {
    theme: 'mint',
    catalog,
  });
});

test('rechaza configuración corrupta o con una versión desconocida', () => {
  assert.equal(parseConfigFile('{"version":2}'), null);
  assert.equal(parseConfigFile('{"version":1,"theme":"mint"}'), null);
  assert.equal(parseConfigFile('not-json'), null);
});
