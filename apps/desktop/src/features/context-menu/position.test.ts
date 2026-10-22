import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextMenuPosition } from './position.ts';

test('conserves the webview coordinates for a native context menu', () => {
  assert.deepEqual(contextMenuPosition({ clientX: 184, clientY: 327 }), {
    x: 184,
    y: 327,
  });
});
