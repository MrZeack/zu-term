import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVisibilityPoller, type TimerHandle } from './window-polling.ts';

function fakeTimers() {
  let nextId = 1;
  const active = new Map<TimerHandle, { fn: () => void; ms: number }>();
  return {
    active,
    setInterval(fn: () => void, ms: number): TimerHandle {
      const id = nextId++;
      active.set(id, { fn, ms });
      return id;
    },
    clearInterval(id: TimerHandle) {
      active.delete(id);
    },
    fireAll() {
      for (const entry of [...active.values()]) entry.fn();
    },
  };
}

test('evita solapamientos in-flight y encola una re-ejecución si llega un trigger en curso', async () => {
  const timers = fakeTimers();
  let runs = 0;
  let releaseFirst!: () => void;

  const poller = createVisibilityPoller({
    intervalMs: 3000,
    isHidden: () => false,
    tick: async () => {
      runs += 1;
      if (runs === 1) {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
    },
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
  });

  const first = poller.trigger();
  // Disparar varias veces mientras el primero sigue en curso solo debe agendar 1 re-ejecución.
  void poller.trigger();
  void poller.trigger();
  assert.equal(runs, 1);

  releaseFirst();
  await first;
  // Permite que corra el microtask del rerun encolado.
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(runs, 2);
});

test('pausa el intervalo cuando la ventana está oculta y refresca al volver a ser visible', async () => {
  const timers = fakeTimers();
  let hidden = false;
  let runs = 0;

  const poller = createVisibilityPoller({
    intervalMs: 3000,
    isHidden: () => hidden,
    tick: async () => {
      runs += 1;
    },
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
  });

  poller.start();
  assert.equal(timers.active.size, 1);
  assert.equal(runs, 1);

  // El intervalo dispara ticks mientras está visible.
  timers.fireAll();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(runs, 2);

  // Al ocultarse se detiene el timer y no corre ningún tick nuevo.
  hidden = true;
  poller.onVisibilityChange();
  assert.equal(timers.active.size, 0);

  // Al volver a ser visible reinicia el timer y dispara un tick inmediato.
  hidden = false;
  poller.onVisibilityChange();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(timers.active.size, 1);
  assert.equal(runs, 3);

  poller.stop();
  assert.equal(timers.active.size, 0);
});

test('no arranca el timer si la ventana inicia oculta', () => {
  const timers = fakeTimers();
  let runs = 0;
  const poller = createVisibilityPoller({
    intervalMs: 3000,
    isHidden: () => true,
    tick: async () => {
      runs += 1;
    },
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
  });

  poller.start();
  assert.equal(timers.active.size, 0);
  assert.equal(runs, 0);
});
