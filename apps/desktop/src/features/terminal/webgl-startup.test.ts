import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createWebglBudget, deferUntilNextFrame } from './webgl-startup.ts';

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

test('limita los terminales con WebGL y libera el cupo al soltarlo', () => {
  const budget = createWebglBudget(2);

  assert.equal(budget.acquire(), true);
  assert.equal(budget.acquire(), true);
  assert.equal(budget.acquire(), false, 'past the limit a pane keeps the DOM renderer');
  budget.release();
  assert.equal(budget.acquire(), true);
  budget.release();
  budget.release();
  budget.release();
  assert.equal(budget.acquire(), true);
  assert.equal(budget.acquire(), true);
  assert.equal(budget.acquire(), false, 'extra releases never raise the limit');
});

test('TerminalPane respeta el cupo y vuelve al renderer DOM si pierde el contexto', async () => {
  const source = await readFile(new URL('./TerminalPane.vue', import.meta.url), 'utf8');

  assert.match(source, /webglBudget\.acquire\(\)/);
  assert.match(source, /\.onContextLoss\(dropWebgl\)/);
  assert.match(source, /onBeforeUnmount\([\s\S]*dropWebgl\(\)/);
});
