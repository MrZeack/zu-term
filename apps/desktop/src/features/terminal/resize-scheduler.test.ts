import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { coalesce, debounce, type Timer } from './resize-scheduler.ts';

function fakeTimer() {
  const pending = new Map<number, () => void>();
  let next = 0;
  const timer: Timer<number> = {
    set: (callback) => {
      next += 1;
      pending.set(next, callback);
      return next;
    },
    clear: (handle) => pending.delete(handle),
  };
  const fire = () => {
    const callbacks = [...pending.values()];
    pending.clear();
    for (const callback of callbacks) callback();
  };
  return { timer, fire, pending };
}

test('coalesce ejecuta una sola vez por tick aunque se pida muchas veces', () => {
  const { timer, fire, pending } = fakeTimer();
  let runs = 0;
  const fit = coalesce(() => (runs += 1), timer);

  fit.schedule();
  fit.schedule();
  fit.schedule();
  assert.equal(pending.size, 1);
  fire();
  assert.equal(runs, 1);

  fit.schedule();
  fire();
  assert.equal(runs, 2);
});

test('debounce ejecuta solo la última petición cuando dejan de llegar', () => {
  const { timer, fire, pending } = fakeTimer();
  const sizes: [number, number][] = [];
  const resize = debounce((cols: number, rows: number) => sizes.push([cols, rows]), timer);

  resize.schedule(80, 24);
  resize.schedule(90, 30);
  resize.schedule(100, 40);
  assert.equal(pending.size, 1);
  fire();
  assert.deepEqual(sizes, [[100, 40]]);
});

test('cancelar descarta lo pendiente', () => {
  const { timer, fire } = fakeTimer();
  let runs = 0;
  const fit = coalesce(() => (runs += 1), timer);
  const resize = debounce(() => (runs += 1), timer);

  fit.schedule();
  resize.schedule();
  fit.cancel();
  resize.cancel();
  fire();
  assert.equal(runs, 0);
});

test('TerminalPane ajusta una vez por frame y redimensiona la PTY al terminar', async () => {
  const source = await readFile(new URL('./TerminalPane.vue', import.meta.url), 'utf8');

  assert.match(source, /new ResizeObserver\(\(\) => fitFrame\.schedule\(\)\)/);
  assert.match(source, /ptyResize\.schedule\(cols, rows\)/);
});
