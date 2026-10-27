import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WorkspaceRecord } from './workspace.ts';
import { createWorkspaceSession, type WorkspaceSessionDeps } from './workspace-session.ts';

function record(id: string): WorkspaceRecord {
  return {
    id,
    name: id,
    updatedAt: 1,
    snapshot: { version: 1, root: { kind: 'pane', id: 'p' }, panes: {}, activeId: 'p' },
  };
}

function fakeDeps() {
  const calls: string[] = [];
  const errors: string[] = [];
  const deps: WorkspaceSessionDeps = {
    store: {
      saveWorkspace: async (workspace) => {
        calls.push(`save:${workspace.id}`);
      },
      deleteWorkspace: async (id) => {
        calls.push(`delete:${id}`);
        return true;
      },
      saveSettings: async (settings) => {
        calls.push(`settings:${settings.theme}`);
      },
    },
    locks: {
      acquire: async (id) => {
        calls.push(`acquire:${id}`);
        return true;
      },
      release: async (id) => {
        calls.push(`release:${id}`);
        return true;
      },
      releaseAll: async () => {
        calls.push('releaseAll');
      },
    },
    onError: (message) => errors.push(message),
  };
  return { deps, calls, errors };
}

test('serializa las escrituras y sigue tras un fallo', async () => {
  const order: string[] = [];
  let releaseFirst: () => void = () => {};
  const firstGate = new Promise<void>((resolve) => (releaseFirst = resolve));
  const { deps, errors } = fakeDeps();
  deps.store.saveWorkspace = async (workspace) => {
    if (workspace.id === 'first') await firstGate;
    if (workspace.id === 'broken') throw new Error('not open in this window');
    order.push(workspace.id);
  };
  deps.store.saveSettings = async () => {
    order.push('settings');
  };
  const session = createWorkspaceSession(deps);

  const writes = [
    session.saveWorkspace(record('first')),
    session.saveWorkspace(record('broken')),
    session.saveSettings({ theme: 'mint', fontFamily: 'fira-code', fontSize: 14 }),
  ];
  releaseFirst();

  assert.deepEqual(await Promise.all(writes), [true, false, true]);
  assert.deepEqual(order, ['first', 'settings']);
  assert.deepEqual(errors, ['No se pudo guardar el workspace en ~/.config/zu-term.']);
});

test('rechaza borrar un workspace abierto en otra ventana', async () => {
  const { deps, errors } = fakeDeps();
  deps.store.deleteWorkspace = async () => false;
  const session = createWorkspaceSession(deps);

  assert.equal(await session.deleteWorkspace('ws-1'), false);
  assert.deepEqual(errors, ['Ese workspace está abierto en otra ventana; ciérralo allí primero.']);
});

test('un fallo al borrar se informa como tal, no como workspace abierto', async () => {
  const { deps, errors } = fakeDeps();
  deps.store.deleteWorkspace = async () => {
    throw new Error('io');
  };

  assert.equal(await createWorkspaceSession(deps).deleteWorkspace('ws-1'), false);
  assert.deepEqual(errors, ['No se pudo eliminar el workspace en ~/.config/zu-term.']);
});

test('borra el workspace propio y olvida su lock', async () => {
  const { deps, calls } = fakeDeps();
  const session = createWorkspaceSession(deps);
  await session.claim('ws-1');

  assert.equal(await session.deleteWorkspace('ws-1'), true);
  assert.equal(session.lockedId, null);
  assert.deepEqual(calls, ['delete:ws-1', 'release:ws-1']);
});

test('informa cuando otra ventana ya tiene el workspace o el lock falla', async () => {
  const busy = fakeDeps();
  busy.deps.locks.acquire = async () => false;
  assert.equal(await createWorkspaceSession(busy.deps).acquire('ws-1'), false);
  assert.deepEqual(busy.errors, ['Ese workspace ya está abierto en otra ventana.']);

  const failing = fakeDeps();
  failing.deps.locks.acquire = async () => {
    throw new Error('io');
  };
  assert.equal(await createWorkspaceSession(failing.deps).acquire('ws-1'), false);
  assert.deepEqual(failing.errors, ['No se pudo bloquear el workspace en ~/.config/zu-term.']);
});

test('al reclamar un workspace libera el lock del anterior', async () => {
  const { deps, calls } = fakeDeps();
  const session = createWorkspaceSession(deps);

  await session.claim('ws-1');
  await session.claim('ws-2');
  assert.equal(session.lockedId, 'ws-2');
  assert.deepEqual(calls, ['release:ws-1']);

  assert.equal(await session.release('ws-2'), true);
  assert.equal(session.lockedId, null);
});

test('liberar todo olvida el workspace bloqueado e informa fallos', async () => {
  const { deps, calls, errors } = fakeDeps();
  const session = createWorkspaceSession(deps);
  await session.claim('ws-1');

  assert.equal(await session.releaseAll(), true);
  assert.equal(session.lockedId, null);
  assert.deepEqual(calls, ['releaseAll']);

  deps.locks.releaseAll = async () => {
    throw new Error('io');
  };
  assert.equal(await session.releaseAll(), false);
  assert.deepEqual(errors, ['No se pudieron liberar los locks de workspace.']);
});
