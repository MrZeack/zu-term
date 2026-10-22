import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';
import { paneIds } from './layout-tree.ts';
import { createLayoutStore } from './layout.store.ts';

let counter = 0;
const nextId = () => `id${++counter}`;

beforeEach(() => {
  counter = 0;
  setActivePinia(createPinia());
});

test('starts with one pane in the initial cwd', () => {
  const store = createLayoutStore(nextId)();
  store.init('/home/me');
  const [first] = paneIds(store.root);
  assert.ok(first);
  assert.equal(store.panes[first]?.cwd, '/home/me');
  assert.equal(store.activeId, first);
});

test('split opens the new pane in the cwd of the source pane and focuses it', () => {
  const store = createLayoutStore(nextId)();
  store.init('/home/me');
  const [first] = paneIds(store.root);
  assert.ok(first);
  store.setCwd(first, '/home/me/project');
  const created = store.split(first, 'row');
  assert.equal(store.panes[created]?.startCwd, '/home/me/project');
  assert.equal(store.activeId, created);
  assert.deepEqual(paneIds(store.root), [first, created]);
});

test('rename trims and empty name clears it', () => {
  const store = createLayoutStore(nextId)();
  store.init('/');
  const [first] = paneIds(store.root);
  assert.ok(first);
  store.rename(first, '  agente  ');
  assert.equal(store.panes[first]?.name, 'agente');
  store.rename(first, '   ');
  assert.equal(store.panes[first]?.name, undefined);
});

test('startRename marks the pane and rename finishes it', () => {
  const store = createLayoutStore(nextId)();
  store.init('/');
  const [first] = paneIds(store.root);
  assert.ok(first);
  store.startRename(first);
  assert.equal(store.renamingId, first);
  store.rename(first, 'logs');
  assert.equal(store.renamingId, null);
});

test('close removes the pane, focuses a remaining one and reports when none are left', () => {
  const store = createLayoutStore(nextId)();
  store.init('/');
  const [first] = paneIds(store.root);
  assert.ok(first);
  const second = store.split(first, 'column');
  assert.equal(store.close(second), true);
  assert.equal(store.panes[second], undefined);
  assert.equal(store.activeId, first);
  assert.equal(store.close(first), false);
});
