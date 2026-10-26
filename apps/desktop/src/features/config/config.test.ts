import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkspaceCatalog } from '../workspace/workspace.ts';
import { createConfigFile, parseConfigFile } from './config.ts';

test('serializa tema, catálogo y opciones de tipografía en el archivo de configuración', () => {
  const catalog = createWorkspaceCatalog();
  catalog.activeId = null;
  const config = createConfigFile('mint', catalog, 'fira-code', 14);

  assert.deepEqual(parseConfigFile(JSON.stringify(config)), {
    theme: 'mint',
    catalog,
    fontFamily: 'fira-code',
    fontSize: 14,
  });
});

test('acepta configuraciones heredadas asignando fuente y tamaño por defecto', () => {
  const catalog = createWorkspaceCatalog();
  catalog.activeId = null;
  const legacy = { version: 1, theme: 'cyan', workspaceCatalog: catalog };

  assert.deepEqual(parseConfigFile(JSON.stringify(legacy)), {
    theme: 'cyan',
    catalog,
    fontFamily: 'jetbrains-mono',
    fontSize: 12,
  });
});

test('sanea fuentes desconocidas y tamaños de fuente fuera de rango', () => {
  const catalog = createWorkspaceCatalog();
  catalog.activeId = null;
  const invalid = {
    version: 1,
    theme: 'cyan',
    fontFamily: 'unknown-font',
    fontSize: 999,
    workspaceCatalog: catalog,
  };

  assert.deepEqual(parseConfigFile(JSON.stringify(invalid)), {
    theme: 'cyan',
    catalog,
    fontFamily: 'jetbrains-mono',
    fontSize: 28,
  });
});

test('rechaza configuración corrupta o con una versión desconocida', () => {
  assert.equal(parseConfigFile('{"version":2}'), null);
  assert.equal(parseConfigFile('{"version":1,"theme":"mint"}'), null);
  assert.equal(parseConfigFile('not-json'), null);
});
