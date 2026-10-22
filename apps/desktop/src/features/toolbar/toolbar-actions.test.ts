import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitToolbarActions } from './toolbar-actions.ts';

test('split toolbar exposes right and down actions with platform shortcuts', () => {
  assert.deepEqual(splitToolbarActions(true), [
    { id: 'split-right', label: 'Dividir a la derecha', shortcut: '⌘D', direction: 'right' },
    { id: 'split-down', label: 'Dividir hacia abajo', shortcut: '⌘⇧D', direction: 'down' },
  ]);
  assert.deepEqual(splitToolbarActions(false), [
    { id: 'split-right', label: 'Dividir a la derecha', shortcut: 'Ctrl⇧E', direction: 'right' },
    { id: 'split-down', label: 'Dividir hacia abajo', shortcut: 'Ctrl⇧O', direction: 'down' },
  ]);
});
