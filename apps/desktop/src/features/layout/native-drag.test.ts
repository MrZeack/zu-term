import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

// With Tauri's drag-and-drop handler on, macOS never delivers `dragover` or
// `drop` to the page, so splits could not be reordered by dragging.
test('todas las ventanas dejan el arrastre HTML5 a la página', async () => {
  const config = JSON.parse(await read('../../../src-tauri/tauri.conf.json')) as {
    app: { windows: { dragDropEnabled?: boolean }[] };
  };
  for (const window of config.app.windows) assert.equal(window.dragDropEnabled, false);

  const dock = await read('../../../src-tauri/src/dock.rs');
  assert.match(dock, /WebviewWindowBuilder::new\([\s\S]*?\.disable_drag_drop_handler\(\)/);
});

test('un archivo soltado fuera de los splits no navega la ventana', async () => {
  const main = await read('../../main.ts');
  assert.match(main, /addEventListener\('dragover', preventNavigation\)/);
  assert.match(main, /addEventListener\('drop', preventNavigation\)/);
});
