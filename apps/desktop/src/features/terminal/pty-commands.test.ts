import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('abrir una PTY no bloquea el hilo principal y la entrada conserva su orden', async () => {
  const source = await readFile(
    new URL('../../../src-tauri/src/pty/commands.rs', import.meta.url),
    'utf8',
  );

  assert.match(source, /pub async fn pty_spawn\(/);
  // Async commands run as independent tasks and could reorder keystrokes.
  assert.match(source, /pub fn pty_write\(/);
  assert.match(source, /pub fn pty_resize\(/);
});
