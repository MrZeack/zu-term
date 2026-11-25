import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createAtlasSync, createWebglBudget, deferUntilNextFrame } from './webgl-startup.ts';

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

function fakeRenderer() {
  const listeners: (() => void)[] = [];
  const renderer = {
    clears: 0,
    clearTextureAtlas() {
      renderer.clears += 1;
    },
    onRemoveTextureAtlasCanvas(listener: () => void) {
      listeners.push(listener);
      return {
        dispose() {
          listeners.splice(listeners.indexOf(listener), 1);
        },
      };
    },
    compact() {
      for (const listener of [...listeners]) listener();
    },
  };
  return renderer;
}

test('al compactar el atlas compartido se reconstruyen todos los splits una vez por frame', () => {
  const frames: (() => void)[] = [];
  const sync = createAtlasSync((callback) => frames.push(callback));
  const first = fakeRenderer();
  const second = fakeRenderer();
  sync.register(first);
  sync.register(second);

  first.compact();
  second.compact();
  assert.equal(frames.length, 1, 'one rebuild per frame, however many panes report it');
  assert.equal(first.clears + second.clears, 0, 'never inside the frame that compacts');

  frames.shift()?.();
  assert.equal(first.clears, 1);
  assert.equal(second.clears, 1);

  first.compact();
  assert.equal(frames.length, 1, 'a later compaction schedules again');
});

test('un split dado de baja ya no se reconstruye ni dispara reconstrucciones', () => {
  const frames: (() => void)[] = [];
  const sync = createAtlasSync((callback) => frames.push(callback));
  const kept = fakeRenderer();
  const dropped = fakeRenderer();
  sync.register(kept);
  const unregister = sync.register(dropped);

  unregister.dispose();
  dropped.compact();
  assert.equal(frames.length, 0);

  kept.compact();
  frames.shift()?.();
  assert.equal(kept.clears, 1);
  assert.equal(dropped.clears, 0);
});

test('TerminalPane sincroniza el atlas de WebGL y se da de baja al soltarlo', async () => {
  const source = await readFile(new URL('./TerminalPane.vue', import.meta.url), 'utf8');

  assert.match(source, /webglAtlasSync\.register\(webgl\)/);
  assert.match(source, /function dropWebgl\(\) \{[\s\S]*atlasRegistration\?\.dispose\(\)/);
});
