import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closePane, paneIds, setRatio, splitPane, type LayoutNode } from './layout-tree.ts';

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
