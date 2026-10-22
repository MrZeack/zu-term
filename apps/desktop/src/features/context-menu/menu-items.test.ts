import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paneMenuItems } from './menu-items.ts';

const ids = (items: ReturnType<typeof paneMenuItems>) =>
  items.map((item) => (item.kind === 'separator' ? '---' : item.id));

test('pane menu lists splits, clipboard and pane actions in order', () => {
  assert.deepEqual(ids(paneMenuItems({ hasSelection: true })), [
    'split-right',
    'split-down',
    '---',
    'copy',
    'paste',
    '---',
    'rename',
    'clear',
    '---',
    'close',
  ]);
});

test('copy is disabled without a selection', () => {
  const copy = paneMenuItems({ hasSelection: false }).find(
    (item) => item.kind === 'action' && item.id === 'copy',
  );
  assert.equal(copy?.kind === 'action' && copy.enabled, false);
});

test('every action has a label', () => {
  for (const item of paneMenuItems({ hasSelection: true })) {
    if (item.kind === 'action') assert.ok(item.label.length > 0, item.id);
  }
});
