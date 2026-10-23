import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dropZoneAt } from './layout-dnd.ts';

const bounds = { left: 10, top: 20, width: 100, height: 80 };

test('detecta las cuatro zonas de drop y usa el centro para intercambiar posiciones', () => {
  assert.equal(dropZoneAt(bounds, 60, 28), 'top');
  assert.equal(dropZoneAt(bounds, 102, 60), 'right');
  assert.equal(dropZoneAt(bounds, 60, 92), 'bottom');
  assert.equal(dropZoneAt(bounds, 18, 60), 'left');
  assert.equal(dropZoneAt(bounds, 60, 60), 'center');
});

test('ignora puntos fuera del pane o bounds inválidos', () => {
  assert.equal(dropZoneAt(bounds, 5, 60), null);
  assert.equal(dropZoneAt({ ...bounds, width: 0 }, 60, 28), null);
  assert.equal(dropZoneAt({ ...bounds, height: -1 }, 60, 28), null);
});
