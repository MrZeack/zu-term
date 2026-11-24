import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeGeometry, cyclePaneId, findAdjacentPane, ratioAt } from './layout-geometry.ts';
import { splitPane, type LayoutNode } from './layout-tree.ts';

const full = { x: 0, y: 0, width: 1, height: 1 };

test('a single pane fills the area and has no dividers', () => {
  const geometry = computeGeometry({ kind: 'pane', id: 'a' });
  assert.deepEqual(geometry.panes, [{ id: 'a', rect: full }]);
  assert.deepEqual(geometry.dividers, []);
});

test('a row split places panes side by side with a vertical divider', () => {
  const tree = splitPane({ kind: 'pane', id: 'a' }, 'a', 'row', 'b', 's1');
  const geometry = computeGeometry(tree);
  assert.deepEqual(geometry.panes, [
    { id: 'a', rect: { x: 0, y: 0, width: 0.5, height: 1 } },
    { id: 'b', rect: { x: 0.5, y: 0, width: 0.5, height: 1 } },
  ]);
  assert.deepEqual(geometry.dividers, [
    { splitId: 's1', direction: 'row', position: 0.5, area: full },
  ]);
});

test('nested column split divides only its own area', () => {
  const row = splitPane({ kind: 'pane', id: 'a' }, 'a', 'row', 'b', 's1');
  const tree: LayoutNode = splitPane(row, 'b', 'column', 'c', 's2');
  const geometry = computeGeometry(tree);
  assert.deepEqual(geometry.panes.find((pane) => pane.id === 'c')?.rect, {
    x: 0.5,
    y: 0.5,
    width: 0.5,
    height: 0.5,
  });
  assert.deepEqual(geometry.dividers[1], {
    splitId: 's2',
    direction: 'column',
    position: 0.5,
    area: { x: 0.5, y: 0, width: 0.5, height: 1 },
  });
});

test('ratioAt converts a pointer position into the ratio within the split area', () => {
  const area = { x: 0.5, y: 0, width: 0.5, height: 1 };
  assert.equal(ratioAt(area, 'row', 0.625, 0.3), 0.25);
  assert.equal(ratioAt(area, 'column', 0.9, 0.3), 0.3);
});

test('findAdjacentPane navega espacialmente en un layout anidado y devuelve null en bordes', () => {
  // Layout: [a | (b / c)]
  const row = splitPane({ kind: 'pane', id: 'a' }, 'a', 'row', 'b', 's1');
  const tree: LayoutNode = splitPane(row, 'b', 'column', 'c', 's2');
  const { panes } = computeGeometry(tree);

  assert.equal(findAdjacentPane(panes, 'a', 'right'), 'b');
  assert.equal(findAdjacentPane(panes, 'a', 'left'), null);
  assert.equal(findAdjacentPane(panes, 'b', 'down'), 'c');
  assert.equal(findAdjacentPane(panes, 'c', 'up'), 'b');
  assert.equal(findAdjacentPane(panes, 'c', 'left'), 'a');
  assert.equal(findAdjacentPane(panes, 'b', 'left'), 'a');
  assert.equal(findAdjacentPane(panes, 'b', 'up'), null);
  assert.equal(findAdjacentPane(panes, 'c', 'down'), null);
});

test('cyclePaneId recorre panes circularmente hacia adelante y atrás', () => {
  const panes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(cyclePaneId(panes, 'a', 1), 'b');
  assert.equal(cyclePaneId(panes, 'c', 1), 'a');
  assert.equal(cyclePaneId(panes, 'a', -1), 'c');
  assert.equal(cyclePaneId([{ id: 'only' }], 'only', 1), null);
});
