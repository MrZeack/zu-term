import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildSearchOptions,
  formatSearchCounter,
  isValidSearchRegex,
  runTerminalSearch,
  type SearchAddonLike,
} from './terminal-search.ts';

test('isValidSearchRegex valida expresiones regulares sin lanzar excepciones', () => {
  assert.equal(isValidSearchRegex('error\\s+\\d+'), true);
  assert.equal(isValidSearchRegex('[unclosed'), false);
  assert.equal(isValidSearchRegex(''), true);
});

test('formatSearchCounter formatea el contador de coincidencias para todos los estados', () => {
  assert.equal(formatSearchCounter('', 0, 0, false), '');
  assert.equal(formatSearchCounter('[bad', 0, 0, true), 'Regex inválida');
  assert.equal(formatSearchCounter('foo', -1, 0, false), '0/0');
  assert.equal(formatSearchCounter('foo', 0, 5, false), '1/5');
  assert.equal(formatSearchCounter('foo', 4, 5, false), '5/5');
  assert.equal(formatSearchCounter('foo', -1, 1000, false), '1000+');
});

test('buildSearchOptions habilita decorations con colores hex válidos para xterm', () => {
  const opts = buildSearchOptions({ caseSensitive: true, regex: false, incremental: true });
  assert.equal(opts.caseSensitive, true);
  assert.equal(opts.regex, false);
  assert.equal(opts.incremental, true);
  assert.match(opts.decorations?.matchBackground ?? '', /^#[0-9a-fA-F]{6}$/);
  assert.match(opts.decorations?.activeMatchBackground ?? '', /^#[0-9a-fA-F]{6}$/);
});

test('runTerminalSearch limpia decoraciones con query vacío o regex inválida y delega en el addon', () => {
  const calls: string[] = [];
  const addon: SearchAddonLike = {
    findNext: (term, opts) => {
      calls.push(`next:${term}:${opts?.caseSensitive ? 'cs' : 'ci'}:${opts?.regex ? 're' : 'txt'}`);
      return true;
    },
    findPrevious: (term, opts) => {
      calls.push(`prev:${term}:${opts?.caseSensitive ? 'cs' : 'ci'}:${opts?.regex ? 're' : 'txt'}`);
      return true;
    },
    clearDecorations: () => calls.push('clear'),
  };

  assert.equal(
    runTerminalSearch(addon, '', 'next', { caseSensitive: false, regex: false }),
    'empty',
  );
  assert.equal(
    runTerminalSearch(addon, '[invalid', 'next', { caseSensitive: false, regex: true }),
    'invalid-regex',
  );
  assert.equal(
    runTerminalSearch(addon, 'error', 'next', { caseSensitive: true, regex: false }),
    'found',
  );
  assert.equal(
    runTerminalSearch(addon, 'err.*\\d', 'previous', { caseSensitive: false, regex: true }),
    'found',
  );

  assert.deepEqual(calls, ['clear', 'clear', 'next:error:cs:txt', 'prev:err.*\\d:ci:re']);
});
