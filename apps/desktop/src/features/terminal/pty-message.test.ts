import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toPtyEvent } from './pty-message.ts';

test('la salida llega como bytes crudos y se entrega a xterm sin decodificar', () => {
  const bytes = new TextEncoder().encode('hola ñ\x1b[0m');

  assert.deepEqual(toPtyEvent(bytes.buffer), { event: 'output', data: bytes });
  assert.deepEqual(toPtyEvent(bytes), { event: 'output', data: bytes });
  assert.deepEqual(toPtyEvent([104, 105]), { event: 'output', data: new Uint8Array([104, 105]) });
});

test('el fin del proceso llega como JSON con su código de salida', () => {
  assert.deepEqual(toPtyEvent({ exit: 3 }), { event: 'exit', data: 3 });
  assert.deepEqual(toPtyEvent({ exit: null }), { event: 'exit', data: null });
});

test('ignora mensajes con otra forma', () => {
  assert.equal(toPtyEvent('texto'), undefined);
  assert.equal(toPtyEvent({ exit: '3' }), undefined);
  assert.equal(toPtyEvent(null), undefined);
});
