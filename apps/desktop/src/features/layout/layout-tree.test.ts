import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeGeometry } from './layout-geometry.ts';
import {
  closePane,
  movePane,
  paneIds,
  setRatio,
  splitPane,
  type LayoutNode,
} from './layout-tree.ts';

const single: LayoutNode = { kind: 'pane', id: 'a' };

test('splitPane replaces the pane with a split holding old and new panes', () => {
  const tree = splitPane(single, 'a', 'row', 'b', 's1');
  assert.deepEqual(tree, {
    kind: 'split',
    id: 's1',
    direction: 'row',
    ratio: 0.5,
    first: { kind: 'pane', id: 'a' },
    second: { kind: 'pane', id: 'b' },
  });
});

test('splitPane works on nested panes and keeps the rest intact', () => {
  const tree = splitPane(splitPane(single, 'a', 'row', 'b', 's1'), 'b', 'column', 'c', 's2');
  assert.deepEqual(paneIds(tree), ['a', 'b', 'c']);
  assert.equal(
    tree.kind === 'split' && tree.second.kind === 'split' && tree.second.direction,
    'column',
  );
});

test('splitPane leaves the tree unchanged when the pane does not exist', () => {
  assert.equal(splitPane(single, 'zzz', 'row', 'b', 's1'), single);
});

test('movePane cambia de horizontal a vertical y respeta el lado elegido', () => {
  const tree = splitPane(single, 'a', 'row', 'b', 's1');
  const moved = movePane(tree, 'a', 'b', 'bottom', 's2');

  assert.deepEqual(moved, {
    kind: 'split',
    id: 's2',
    direction: 'column',
    ratio: 0.5,
    first: { kind: 'pane', id: 'b' },
    second: { kind: 'pane', id: 'a' },
  });
});

test('movePane conserva el resto del árbol al mover un pane anidado', () => {
  const row = splitPane(single, 'a', 'row', 'b', 's1');
  const tree = splitPane(row, 'b', 'column', 'c', 's2');
  const moved = movePane(tree, 'a', 'c', 'top', 's3');

  assert.deepEqual(paneIds(moved), ['b', 'a', 'c']);
  assert.equal(moved.kind === 'split' && moved.direction, 'column');
  assert.equal(
    moved.kind === 'split' && moved.second.kind === 'split' && moved.second.direction,
    'column',
  );
});

test('movePane puede sacar un pane de una columna y llevarlo al borde del grupo equilibrando los otros 3 a 1/6', () => {
  const grid: LayoutNode = {
    kind: 'split',
    id: 'root',
    direction: 'row',
    ratio: 0.5,
    first: {
      kind: 'split',
      id: 'left',
      direction: 'column',
      ratio: 0.5,
      first: { kind: 'pane', id: 'a' },
      second: { kind: 'pane', id: 'b' },
    },
    second: {
      kind: 'split',
      id: 'right',
      direction: 'column',
      ratio: 0.5,
      first: { kind: 'pane', id: 'c' },
      second: { kind: 'pane', id: 'd' },
    },
  };

  const moved = movePane(grid, 'c', 'a', 'left', 'outer');

  assert.deepEqual(paneIds(moved), ['c', 'a', 'b', 'd']);
  assert.equal(moved.kind, 'split');
  assert.equal(moved.first.kind === 'pane' && moved.first.id, 'c');

  const geom = computeGeometry(moved);
  const cPane = geom.panes.find((p) => p.id === 'c');
  assert.ok(cPane);
  assert.ok(Math.abs(cPane.rect.width * cPane.rect.height - 0.5) < 0.001, 'c ocupa el 50%');

  for (const id of ['a', 'b', 'd']) {
    const pane = geom.panes.find((p) => p.id === id);
    assert.ok(pane);
    const area = pane.rect.width * pane.rect.height;
    assert.ok(Math.abs(area - 1 / 6) < 0.001, `${id} debería ocupar 1/6, pero ocupa ${area}`);
  }
});

test('movePane al borde superior o derecho equilibra los otros 3 a 1/6', () => {
  const grid: LayoutNode = {
    kind: 'split',
    id: 'root',
    direction: 'row',
    ratio: 0.5,
    first: {
      kind: 'split',
      id: 'left',
      direction: 'column',
      ratio: 0.5,
      first: { kind: 'pane', id: 'a' },
      second: { kind: 'pane', id: 'b' },
    },
    second: {
      kind: 'split',
      id: 'right',
      direction: 'column',
      ratio: 0.5,
      first: { kind: 'pane', id: 'c' },
      second: { kind: 'pane', id: 'd' },
    },
  };

  const movedTop = movePane(grid, 'd', 'a', 'top', 'outer-top');
  const geomTop = computeGeometry(movedTop);
  const dPane = geomTop.panes.find((p) => p.id === 'd');
  assert.ok(dPane);
  assert.ok(Math.abs(dPane.rect.width * dPane.rect.height - 0.5) < 0.001);
  for (const id of ['a', 'b', 'c']) {
    const pane = geomTop.panes.find((p) => p.id === id);
    assert.ok(pane);
    const area = pane.rect.width * pane.rect.height;
    assert.ok(Math.abs(area - 1 / 6) < 0.001);
  }

  const movedRight = movePane(grid, 'a', 'c', 'right', 'outer-right');
  const geomRight = computeGeometry(movedRight);
  const aPane = geomRight.panes.find((p) => p.id === 'a');
  assert.ok(aPane);
  assert.ok(Math.abs(aPane.rect.width * aPane.rect.height - 0.5) < 0.001);
  for (const id of ['b', 'c', 'd']) {
    const pane = geomRight.panes.find((p) => p.id === id);
    assert.ok(pane);
    const area = pane.rect.width * pane.rect.height;
    assert.ok(Math.abs(area - 1 / 6) < 0.001);
  }
});

test('movePane puede devolver el pane a una cuadrícula equilibrada', () => {
  const grid: LayoutNode = {
    kind: 'split',
    id: 'root',
    direction: 'row',
    ratio: 0.5,
    first: {
      kind: 'split',
      id: 'left',
      direction: 'column',
      ratio: 0.5,
      first: { kind: 'pane', id: 'a' },
      second: { kind: 'pane', id: 'b' },
    },
    second: {
      kind: 'split',
      id: 'right',
      direction: 'column',
      ratio: 0.5,
      first: { kind: 'pane', id: 'c' },
      second: { kind: 'pane', id: 'd' },
    },
  };
  const pulledOut = movePane(grid, 'c', 'a', 'left', 'outer');
  const restored = movePane(pulledOut, 'c', 'd', 'top', 'restore');

  assert.deepEqual(paneIds(restored), ['a', 'b', 'c', 'd']);
  assert.equal(restored.kind === 'split' && restored.direction, 'row');
  assert.equal(
    restored.kind === 'split' && restored.first.kind === 'split'
      ? restored.first.direction
      : undefined,
    'column',
  );
  assert.equal(
    restored.kind === 'split' && restored.second.kind === 'split'
      ? restored.second.direction
      : undefined,
    'column',
  );
});

test('movePane rechaza mover al mismo pane o usar panes inexistentes', () => {
  const tree = splitPane(single, 'a', 'row', 'b', 's1');
  assert.equal(movePane(tree, 'a', 'a', 'right', 's2'), tree);
  assert.equal(movePane(tree, 'missing', 'b', 'right', 's2'), tree);
  assert.equal(movePane(tree, 'a', 'missing', 'right', 's2'), tree);
});

test('movePane intercambia las posiciones al soltar en el centro', () => {
  const tree = splitPane(single, 'a', 'row', 'b', 's1');
  const moved = movePane(tree, 'a', 'b', 'center', 's2');

  assert.deepEqual(moved, {
    kind: 'split',
    id: 's1',
    direction: 'row',
    ratio: 0.5,
    first: { kind: 'pane', id: 'b' },
    second: { kind: 'pane', id: 'a' },
  });
});

test('closePane promotes the sibling', () => {
  const tree = splitPane(single, 'a', 'row', 'b', 's1');
  assert.deepEqual(closePane(tree, 'a'), { kind: 'pane', id: 'b' });
});

test('closePane of the last pane returns null', () => {
  assert.equal(closePane(single, 'a'), null);
});

test('closePane in a nested tree keeps the other branch', () => {
  const tree = splitPane(splitPane(single, 'a', 'row', 'b', 's1'), 'b', 'column', 'c', 's2');
  assert.deepEqual(paneIds(closePane(tree, 'c') ?? single), ['a', 'b']);
});

test('setRatio updates the split and clamps to [0.1, 0.9]', () => {
  const tree = splitPane(single, 'a', 'row', 'b', 's1');
  const resized = setRatio(tree, 's1', 0.95);
  assert.equal(resized.kind === 'split' && resized.ratio, 0.9);
  const shrunk = setRatio(tree, 's1', 0.3);
  assert.equal(shrunk.kind === 'split' && shrunk.ratio, 0.3);
});
