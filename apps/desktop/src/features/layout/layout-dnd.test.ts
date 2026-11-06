import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dropZoneAt, layoutEdgeAt } from './layout-dnd.ts';

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

test('solo la franja junto al borde de la ventana lleva el pane al borde general', () => {
  const layout = { left: 0, top: 0, width: 1000, height: 600 };
  assert.equal(layoutEdgeAt(layout, 500, 10), 'top');
  assert.equal(layoutEdgeAt(layout, 995, 300), 'right');
  assert.equal(layoutEdgeAt(layout, 500, 590), 'bottom');
  assert.equal(layoutEdgeAt(layout, 4, 300), 'left');
  assert.equal(layoutEdgeAt(layout, 500, 60), null, 'la zona superior de un split no es el borde');
  assert.equal(layoutEdgeAt(layout, -5, 300), null);
  assert.equal(layoutEdgeAt({ ...layout, width: 0 }, 0, 0), null);
});
