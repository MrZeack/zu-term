import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { createErrorStore } from './error.store.ts';

let useErrorStore: ReturnType<typeof createErrorStore>;

beforeEach(() => {
  setActivePinia(createPinia());
  useErrorStore = createErrorStore();
});

test('inicia vacío y sin errores activos', () => {
  const store = useErrorStore();

  assert.equal(store.hasErrors, false);
  assert.equal(store.errorCount, 0);
  assert.equal(store.latestError, undefined);
  assert.equal(store.visible, false);
  assert.deepEqual(store.errors, []);
});

test('registra un error con mensaje de texto y activa la visibilidad del área', () => {
  const store = useErrorStore();

  const err = store.report('No se pudo guardar el workspace.');

  assert.equal(store.hasErrors, true);
  assert.equal(store.errorCount, 1);
  assert.equal(store.visible, true);
  assert.equal(store.latestError?.message, 'No se pudo guardar el workspace.');
  assert.equal(err.message, 'No se pudo guardar el workspace.');
  assert.ok(err.id.length > 0);
  assert.ok(err.timestamp > 0);
});

test('extrae el mensaje de instancias Error y objetos con propiedad message', () => {
  const store = useErrorStore();

  store.report(new Error('Fallo de conexión IPC'));
  assert.equal(store.latestError?.message, 'Fallo de conexión IPC');

  store.report({ message: 'Error de validación de split' });
  assert.equal(store.latestError?.message, 'Error de validación de split');
  assert.equal(store.errorCount, 2);
});

test('utiliza mensaje de respaldo para valores nulos, vacíos o desconocidos', () => {
  const store = useErrorStore();

  store.report(null, 'Operación no completada');
  assert.equal(store.latestError?.message, 'Operación no completada');

  store.report('', undefined);
  assert.equal(store.latestError?.message, 'Ha ocurrido un error inesperado.');
});

test('desduplica mensajes idénticos consecutivos en un intervalo corto', () => {
  const store = useErrorStore();

  const first = store.report('Ese workspace ya está abierto en otra ventana.');
  const second = store.report('Ese workspace ya está abierto en otra ventana.');

  assert.equal(store.errorCount, 1);
  assert.equal(first.id, second.id);
});

test('elimina un error específico por id y oculta el área si era el último', () => {
  const store = useErrorStore();

  const err1 = store.report('Primer error');
  const err2 = store.report('Segundo error');
  assert.equal(store.errorCount, 2);
  assert.equal(store.visible, true);

  store.dismiss(err2.id);
  assert.equal(store.errorCount, 1);
  assert.equal(store.latestError?.id, err1.id);
  assert.equal(store.visible, true);

  store.dismiss(err1.id);
  assert.equal(store.errorCount, 0);
  assert.equal(store.hasErrors, false);
  assert.equal(store.visible, false);
});

test('limpia todos los errores y oculta el área', () => {
  const store = useErrorStore();

  store.report('Error 1');
  store.report('Error 2');
  store.report('Error 3');
  assert.equal(store.errorCount, 3);

  store.clear();
  assert.equal(store.errorCount, 0);
  assert.equal(store.hasErrors, false);
  assert.equal(store.visible, false);
  assert.equal(store.latestError, undefined);
});

test('permite alternar y fijar la visibilidad del área sin borrar los errores', () => {
  const store = useErrorStore();

  store.report('Error persistente');
  assert.equal(store.visible, true);

  store.toggleVisible();
  assert.equal(store.visible, false);
  assert.equal(store.errorCount, 1, 'los errores siguen registrados');

  store.setVisible(true);
  assert.equal(store.visible, true);
});

test('limita el historial a un máximo para evitar fugas de memoria', () => {
  const store = useErrorStore();

  for (let i = 0; i < 60; i++) {
    store.report(`Error número ${i}`);
  }

  assert.equal(store.errorCount, 50);
  assert.equal(store.latestError?.message, 'Error número 59');
});
