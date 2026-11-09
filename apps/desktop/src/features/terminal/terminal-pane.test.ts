import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('TerminalPane previene desbordamiento del split aislando el contenido y delegando el padding a xterm', async () => {
  const source = await readFile(new URL('./TerminalPane.vue', import.meta.url), 'utf8');

  // .terminal debe tener overflow: hidden para que no se desborde sobre headers adyacentes o barra de estado
  assert.match(
    source,
    /\.terminal\s*\{[^}]*overflow:\s*hidden;/,
    'el contenedor .terminal debe tener overflow: hidden',
  );

  // .terminal no debe definir padding directo (FitAddon ignora el padding del parentElement)
  assert.doesNotMatch(
    source,
    /\.terminal\s*\{[^}]*padding:/,
    '.terminal no debe tener padding directo para evitar cálculo erróneo de filas en FitAddon',
  );

  // El padding debe aplicarse a .xterm (donde FitAddon lo lee e incorpora al cálculo de filas)
  assert.match(
    source,
    /\.terminal\s+:deep\(\.xterm\)\s*\{[^}]*padding:\s*8px\s+8px\s+10px;/,
    '.xterm debe recibir el padding para que FitAddon reste 18px de altura antes de calcular filas',
  );

  assert.match(
    source,
    /\.terminal\s+:deep\(\.xterm\)\s*\{[^}]*height:\s*100%;/,
    '.xterm debe ocupar el 100% de la altura del contenedor',
  );
});

test('cálculo de dimensiones de FitAddon no desborda cuando el padding está en xterm', () => {
  const cellHeight = 17;
  const parentHeight = 200;
  const paddingTop = 8;
  const paddingBottom = 10;
  const totalVerticalPadding = paddingTop + paddingBottom;

  // CASO BUG: padding en el padre (.terminal), xterm sin padding
  // FitAddon lee padding de .xterm (0) y altura del padre (200)
  const buggyRows = Math.floor(parentHeight / cellHeight); // Math.floor(200 / 17) = 11 filas
  const buggyTotalHeight = totalVerticalPadding + buggyRows * cellHeight; // 18 + 187 = 205px
  assert.ok(
    buggyTotalHeight > parentHeight,
    `El caso defectuoso desborda el contenedor: ${buggyTotalHeight}px > ${parentHeight}px`,
  );

  // CASO FIX: padding en .xterm
  // FitAddon lee padding de .xterm (18px) y altura del padre (200px)
  const fixedAvailableHeight = parentHeight - totalVerticalPadding; // 182px
  const fixedRows = Math.floor(fixedAvailableHeight / cellHeight); // Math.floor(182 / 17) = 10 filas
  const fixedTotalHeight = totalVerticalPadding + fixedRows * cellHeight; // 18 + 170 = 188px
  assert.ok(
    fixedTotalHeight <= parentHeight,
    `El caso corregido encaja dentro del contenedor: ${fixedTotalHeight}px <= ${parentHeight}px`,
  );
});

// Fits that happen while `pty_spawn` is pending (layout, fonts) are dropped
// by `ptyResize` because there is no PTY yet: without this, programs such as
// nano draw for the spawn size until the next resize.
test('al terminar pty_spawn envía el tamaño actual si cambió durante el arranque', async () => {
  const source = await readFile(new URL('./TerminalPane.vue', import.meta.url), 'utf8');

  assert.match(source, /const spawnSize = \{ cols: term\.cols, rows: term\.rows \};/);
  assert.match(source, /spawnSize\.cols,\s*spawnSize\.rows,/);
  assert.match(
    source,
    /ptyId = id;\s*(?:\/\/.*\s*)?if \(term\.cols !== spawnSize\.cols \|\| term\.rows !== spawnSize\.rows\) \{\s*ptyClient\.resize\(id, term\.cols, term\.rows\)\.catch\(report\);/,
  );
});
