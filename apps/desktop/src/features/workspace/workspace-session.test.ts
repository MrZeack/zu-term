import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkspaceSession, type WorkspaceSessionDeps } from './workspace-session.ts';

function fakeDeps(overrides: Partial<WorkspaceSessionDeps> = {}) {
  const calls: string[] = [];
  const errors: string[] = [];
  const deps: WorkspaceSessionDeps = {
    writeConfig: async (data) => {
      calls.push(`write:${data}`);
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
    ...overrides,
  };
  return { deps, calls, errors };
}

test('serializa las escrituras de configuración y sigue tras un fallo', async () => {
  const order: string[] = [];
  let releaseFirst: () => void = () => {};
  const firstGate = new Promise<void>((resolve) => (releaseFirst = resolve));
  const { deps, errors } = fakeDeps({
    writeConfig: async (data) => {
      if (data === 'first') await firstGate;
      if (data === 'broken') throw new Error('disk full');
      order.push(data);
    },
  });
  const session = createWorkspaceSession(deps);

  const first = session.persist('first');
  const broken = session.persist('broken');
  const last = session.persist('last');
  releaseFirst();

  assert.deepEqual(await Promise.all([first, broken, last]), [true, false, true]);
  assert.deepEqual(order, ['first', 'last']);
  assert.deepEqual(errors, ['No se pudo guardar la configuración en ~/.config/zu-term.']);
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
