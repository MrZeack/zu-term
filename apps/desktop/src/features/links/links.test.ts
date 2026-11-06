import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findLinks, lineText, opensLink } from './links.ts';

const texts = (line: string) => findLinks(line).map((link) => link.text);

test('detecta URLs http(s) y file sin la puntuación final', () => {
  assert.deepEqual(texts('ver https://example.com/a?b=1#c, y (http://x.dev/y).'), [
    'https://example.com/a?b=1#c',
    'http://x.dev/y',
  ]);
  assert.deepEqual(texts('abre file:///tmp/informe.pdf'), ['file:///tmp/informe.pdf']);
  assert.deepEqual(texts('wiki https://en.wikipedia.org/wiki/Foo_(bar) ok'), [
    'https://en.wikipedia.org/wiki/Foo_(bar)',
  ]);
});

test('detecta rutas absolutas, de home, relativas y nombres con extensión', () => {
  assert.deepEqual(texts('Updated /Users/me/app/src/main.rs:42:7 and ~/notes.md'), [
    '/Users/me/app/src/main.rs:42:7',
    '~/notes.md',
  ]);
  assert.deepEqual(texts('see ./scripts/up.sh, ../docs and src/App.vue:12'), [
    './scripts/up.sh',
    '../docs',
    'src/App.vue:12',
  ]);
  assert.deepEqual(texts('Edited README.md and `package.json`.'), ['README.md', 'package.json']);
});

test('no confunde versiones, palabras ni partes de una URL con rutas', () => {
  assert.deepEqual(texts('Node v24.21.0 en 3.5 s, hola mundo / nada'), []);
  assert.deepEqual(texts('https://example.com/src/main.rs'), ['https://example.com/src/main.rs']);
});

test('da la posición de cada enlace en la línea', () => {
  assert.deepEqual(findLinks('x https://a.dev y'), [{ start: 2, end: 15, text: 'https://a.dev' }]);
});

test('lineText traduce posiciones de texto a columnas de celda con caracteres anchos', () => {
  const line = lineText([
    { chars: '世', width: 2 },
    { chars: '', width: 0 },
    { chars: 'a', width: 1 },
    { chars: '', width: 1 },
    { chars: '😀', width: 2 },
    { chars: '', width: 0 },
    { chars: 'b', width: 1 },
  ]);
  assert.equal(line.text, '世a 😀b');
  // '😀' is two UTF-16 code units, both in the emoji's cell.
  assert.deepEqual(line.columns, [0, 2, 3, 4, 4, 6]);
});

test('solo Ctrl+clic abre un enlace, en macOS y en Linux', () => {
  assert.equal(opensLink({ button: 0, ctrlKey: true, metaKey: false, altKey: false }), true);
  assert.equal(opensLink({ button: 0, ctrlKey: false, metaKey: true, altKey: false }), false);
  assert.equal(opensLink({ button: 0, ctrlKey: false, metaKey: false, altKey: false }), false);
  assert.equal(opensLink({ button: 0, ctrlKey: true, metaKey: false, altKey: true }), false);
  assert.equal(opensLink({ button: 1, ctrlKey: true, metaKey: false, altKey: false }), false);
});
