import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';
import { paneIds } from './layout-tree.ts';
import { createLayoutStore } from './layout.store.ts';
import { createWorkspaceSnapshot } from '../workspace/workspace.ts';

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

test('asigna un historial separado por pane y lo conserva al restaurar', () => {
  const store = createLayoutStore(nextId)();
  store.init('/home/me');
  const [first] = paneIds(store.root);
  assert.ok(first);
  const firstHistoryId = store.panes[first]?.historyId;
  assert.ok(firstHistoryId);
  const second = store.split(first, 'row');
  const secondHistoryId = store.panes[second]?.historyId;
  assert.ok(secondHistoryId);
  assert.notEqual(firstHistoryId, secondHistoryId);

  const restored = createLayoutStore(nextId)();
  assert.equal(restored.restore(store.snapshot()), true);
  assert.equal(restored.panes[first]?.historyId, firstHistoryId);
  assert.equal(restored.panes[second]?.historyId, secondHistoryId);
});

test('move reorganiza el grupo completo, cambia la orientación y enfoca el pane movido', () => {
  const store = createLayoutStore(nextId)();
  store.init('/home/me');
  const [first] = paneIds(store.root);
  assert.ok(first);
  const second = store.split(first, 'row');
  const third = store.split(second, 'column');

  assert.equal(store.move(first, third, 'bottom'), true);
  assert.deepEqual(paneIds(store.root), [second, third, first]);
  assert.equal(store.activeId, first);
  assert.equal(store.root.kind === 'split' && store.root.direction, 'column');
  assert.equal(
    store.root.kind === 'split' && store.root.first.kind === 'split' && store.root.first.direction,
    'column',
  );
});

test('move intercambia dos posiciones al soltar en el centro del destino', () => {
  const store = createLayoutStore(nextId)();
  store.init('/home/me');
  const [first] = paneIds(store.root);
  assert.ok(first);
  const second = store.split(first, 'row');

  assert.equal(store.move(first, second, 'center'), true);
  assert.deepEqual(paneIds(store.root), [second, first]);
  assert.equal(store.activeId, first);
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

test('tracks and clears the command currently controlling a pane', () => {
  const store = createLayoutStore(nextId)();
  store.init('/');
  const [first] = paneIds(store.root);
  assert.ok(first);
  store.setCommand(first, 'codex');
  assert.equal(store.panes[first]?.command, 'codex');
  store.setCommand(first, null);
  assert.equal(store.panes[first]?.command, undefined);
});

test('tracks agent resume metadata independently from the transient command', () => {
  const store = createLayoutStore(nextId)();
  store.init('/');
  const [first] = paneIds(store.root);
  assert.ok(first);
  store.setAgent(first, { provider: 'codex', sessionId: 'session-1' });
  store.setCommand(first, 'codex');
  store.setCommand(first, null);
  assert.deepEqual(store.panes[first]?.agent, { provider: 'codex', sessionId: 'session-1' });
  store.setAgent(first, { provider: 'codex' });
  assert.deepEqual(store.panes[first]?.agent, { provider: 'codex' });
  store.setAgent(first, null);
  assert.equal(store.panes[first]?.agent, undefined);
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

test('restores a layout and keeps future pane ids unique', () => {
  const store = createLayoutStore(nextId)();
  store.init('/home/me');
  const [first] = paneIds(store.root);
  assert.ok(first);
  const second = store.split(first, 'row');
  store.rename(second, 'API');
  store.setCwd(second, '/home/me/api');
  const snapshot = createWorkspaceSnapshot(store.root, store.panes, second);

  const restored = createLayoutStore(nextId)();
  assert.equal(restored.restore(snapshot), true);
  assert.deepEqual(paneIds(restored.root), [first, second]);
  assert.equal(restored.activeId, second);
  assert.equal(restored.panes[second]?.cwd, '/home/me/api');
  assert.equal(restored.panes[second]?.name, 'API');

  const third = restored.split(second, 'column');
  assert.notEqual(third, first);
  assert.notEqual(third, second);
  assert.equal(restored.panes[third]?.cwd, '/home/me/api');
});
