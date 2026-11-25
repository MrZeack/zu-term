import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeGraph, formatCommitDate, refBadges, type GitCommit } from './git-log.ts';

const commit = (hash: string, parents: string[]): GitCommit => ({
  hash,
  parents,
  author: 'ana',
  time: 0,
  refs: [],
  subject: hash,
});

test('una historia lineal queda en una sola columna', () => {
  const rows = computeGraph([commit('c', ['b']), commit('b', ['a']), commit('a', [])]);

  assert.deepEqual(
    rows.map((row) => row.column),
    [0, 0, 0],
  );
  assert.deepEqual(rows[0]?.lines, [{ from: 0, to: 0, color: 0, part: 'bottom' }]);
  assert.deepEqual(rows[2]?.lines, [{ from: 0, to: 0, color: 0, part: 'top' }]);
  assert.equal(Math.max(...rows.map((row) => row.width)), 1);
});

test('un merge abre una columna para la rama y la vuelve a juntar', () => {
  // m = merge(b, f); f and b both come from a.
  const rows = computeGraph([
    commit('m', ['b', 'f']),
    commit('b', ['a']),
    commit('f', ['a']),
    commit('a', []),
  ]);

  assert.deepEqual(
    rows.map((row) => row.column),
    [0, 0, 1, 0],
  );
  assert.deepEqual(rows[0]?.lines, [
    { from: 0, to: 0, color: 0, part: 'bottom' },
    { from: 0, to: 1, color: 1, part: 'bottom' },
  ]);
  assert.deepEqual(rows[1]?.lines, [
    { from: 0, to: 0, color: 0, part: 'top' },
    { from: 1, to: 1, color: 1, part: 'top' },
    { from: 0, to: 0, color: 0, part: 'bottom' },
    { from: 1, to: 1, color: 1, part: 'bottom' },
  ]);
  // f's lane already expects a: it joins column 0.
  assert.deepEqual(rows[2]?.lines, [
    { from: 0, to: 0, color: 0, part: 'top' },
    { from: 1, to: 1, color: 1, part: 'top' },
    { from: 0, to: 0, color: 0, part: 'bottom' },
    { from: 1, to: 0, color: 1, part: 'bottom' },
  ]);
  assert.deepEqual(rows[3]?.lines, [{ from: 0, to: 0, color: 0, part: 'top' }]);
  assert.equal(rows[1]?.width, 2);
});

test('la punta de otra rama empieza su propia columna', () => {
  const rows = computeGraph([commit('x', ['a']), commit('y', ['a']), commit('a', [])]);

  assert.deepEqual(
    rows.map((row) => row.column),
    [0, 1, 0],
  );
  assert.notEqual(rows[1]?.color, rows[0]?.color);
  // y's lane joins a's column right below y.
  assert.deepEqual(rows[1]?.lines, [
    { from: 0, to: 0, color: 0, part: 'top' },
    { from: 0, to: 0, color: 0, part: 'bottom' },
    { from: 1, to: 0, color: 1, part: 'bottom' },
  ]);
  assert.deepEqual(rows[2]?.lines, [{ from: 0, to: 0, color: 0, part: 'top' }]);
});

test('clasifica las refs como en gitk', () => {
  assert.deepEqual(
    refBadges([
      'HEAD -> refs/heads/main',
      'refs/remotes/origin/main',
      'tag: refs/tags/v1.0',
      'refs/heads/feature/x',
      'HEAD',
      'refs/stash',
    ]),
    [
      { label: 'main', kind: 'head' },
      { label: 'origin/main', kind: 'remote' },
      { label: 'v1.0', kind: 'tag' },
      { label: 'feature/x', kind: 'branch' },
      { label: 'HEAD', kind: 'head' },
      { label: 'stash', kind: 'branch' },
    ],
  );
});

test('formatea la fecha del commit en local', () => {
  const time = Date.UTC(2026, 10, 25, 15, 4) / 1000;
  assert.match(formatCommitDate(time), /^2026-11-2[45] \d{2}:\d{2}$/);
});
