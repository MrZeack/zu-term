import assert from 'node:assert/strict';
import test from 'node:test';
import { deferUntilNextFrame } from './webgl-startup.ts';

test('defers WebGL initialization until the next frame', () => {
  let scheduled: (() => void) | undefined;
  let initialized = false;

  deferUntilNextFrame(
    () => {
      initialized = true;
    },
    (callback) => {
      scheduled = callback;
    },
  );

  assert.equal(initialized, false);
  assert.ok(scheduled);
  scheduled();
  assert.equal(initialized, true);
});
