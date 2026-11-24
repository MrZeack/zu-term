import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { paneIds } from '../layout/layout-tree.ts';
import { createLayoutStore } from '../layout/layout.store.ts';
import { createWorkspaceOperationStore } from './workspace-operation.store.ts';
import {
  createWorkspaceCatalog,
  createWorkspaceRecord,
  createWorkspaceSnapshot,
  MAX_WORKSPACES,
  type WorkspaceCatalog,
  type WorkspaceRecord,
} from './workspace.ts';
import { createWorkspaceController } from './workspace-controller.ts';

beforeEach(() => setActivePinia(createPinia()));

function setup(initialCatalog: WorkspaceCatalog = createWorkspaceCatalog()) {
  let seq = 0;
  const store = createLayoutStore(() => `p${++seq}`)();
  store.init('/home/me');
  const operation = createWorkspaceOperationStore()();

  let catalog = initialCatalog;
  let diskCatalog: WorkspaceCatalog | null = initialCatalog;
  let layoutRevision = 0;
  const calls: string[] = [];
  const errors: string[] = [];
  let confirmResult = true;
  let saveOk = true;
  let acquireOk = true;
  let deleteOk = true;
  let releaseAllOk = true;

  const controller = createWorkspaceController({
    store,
    operation,
    getCatalog: () => catalog,
    setCatalog: (next) => {
      catalog = next;
    },
    getHome: () => '/home/me',
    onLayoutChanged: () => {
      layoutRevision += 1;
    },
    readDiskCatalog: async () => diskCatalog,
    session: {
      saveWorkspace: async (workspace: WorkspaceRecord) => {
        calls.push(`save:${workspace.id}:${workspace.name}`);
        if (!saveOk) return false;
        const others = (diskCatalog?.workspaces ?? []).filter((w) => w.id !== workspace.id);
        diskCatalog = { version: 1, activeId: null, workspaces: [...others, workspace] };
        return true;
      },
      deleteWorkspace: async (id: string) => {
        calls.push(`delete:${id}`);
        if (!deleteOk) return false;
        diskCatalog = {
          version: 1,
          activeId: null,
          workspaces: (diskCatalog?.workspaces ?? []).filter((w) => w.id !== id),
        };
        return true;
      },
      acquire: async (id: string) => {
        calls.push(`acquire:${id}`);
        return acquireOk;
      },
      claim: async (id: string) => {
        calls.push(`claim:${id}`);
      },
      release: async (id: string) => {
        calls.push(`release:${id}`);
        return true;
      },
      releaseAll: async () => {
        calls.push('releaseAll');
        return releaseAllOk;
      },
    },
    confirmDelete: async (name: string) => {
      calls.push(`confirm-delete:${name}`);
      return confirmResult;
    },
    onError: (message: string) => errors.push(message),
    clearError: () => {
      errors.length = 0;
    },
  });

  return {
    store,
    operation,
    controller,
    calls,
    errors,
    getCatalog: () => catalog,
    getLayoutRevision: () => layoutRevision,
    setDiskCatalog: (next: WorkspaceCatalog | null) => {
      diskCatalog = next;
    },
    setConfirm: (val: boolean) => {
      confirmResult = val;
    },
    setSaveOk: (val: boolean) => {
      saveOk = val;
    },
    setAcquireOk: (val: boolean) => {
      acquireOk = val;
    },
    setDeleteOk: (val: boolean) => {
      deleteOk = val;
    },
    setReleaseAllOk: (val: boolean) => {
      releaseAllOk = val;
    },
  };
}

test('saveCurrentWorkspace adquiere lock, guarda y reclama un workspace nuevo, y libera lock si falla', async () => {
  const ctx = setup();
  assert.equal(await ctx.controller.saveCurrentWorkspace('Backend'), true);
  const saved = ctx.getCatalog().workspaces[0];
  assert.ok(saved);
  assert.equal(saved.name, 'Backend');
  assert.equal(ctx.getCatalog().activeId, saved.id);
  assert.deepEqual(ctx.calls, [
    `acquire:${saved.id}`,
    `save:${saved.id}:Backend`,
    `claim:${saved.id}`,
  ]);

  // Si falla guardar un workspace nuevo, libera el lock adquirido.
  const failing = setup();
  failing.setSaveOk(false);
  assert.equal(await failing.controller.saveCurrentWorkspace('Fallido'), false);
  assert.equal(failing.getCatalog().activeId, null);
  assert.equal(failing.calls.length, 3);
  assert.match(failing.calls[0]!, /^acquire:/);
  assert.match(failing.calls[1]!, /^save:/);
  assert.match(failing.calls[2]!, /^release:/);
});

test('rechaza guardar o crear cuando se alcanza MAX_WORKSPACES', async () => {
  const snap = createWorkspaceSnapshot({ kind: 'pane', id: 'p1' }, { p1: { id: 'p1' } }, 'p1');
  const full: WorkspaceCatalog = {
    version: 1,
    activeId: null,
    workspaces: Array.from({ length: MAX_WORKSPACES }, (_, i) =>
      createWorkspaceRecord(`ws-${i}`, `WS ${i}`, snap, i + 1),
    ),
  };
  const ctx = setup(full);
  assert.equal(await ctx.controller.saveCurrentWorkspace('Extra'), false);
  assert.match(ctx.errors[0] ?? '', /Ya existen/);
  assert.equal(await ctx.controller.createNewWorkspace('Extra'), false);
});

test('createNewWorkspace guarda el anterior, reinicia el layout y revierte si falla persistir', async () => {
  const ctx = setup();
  await ctx.controller.saveCurrentWorkspace('Uno');
  const [firstPane] = paneIds(ctx.store.root);
  assert.ok(firstPane);
  ctx.store.split(firstPane, 'row');
  assert.equal(paneIds(ctx.store.root).length, 2);

  assert.equal(await ctx.controller.createNewWorkspace('Dos'), true);
  assert.equal(paneIds(ctx.store.root).length, 1);
  assert.equal(ctx.getLayoutRevision(), 1);
  assert.equal(ctx.getCatalog().workspaces.length, 2);

  // Fallo al persistir el nuevo workspace revierte el layout anterior.
  const [paneInDos] = paneIds(ctx.store.root);
  assert.ok(paneInDos);
  ctx.store.split(paneInDos, 'column');
  ctx.setSaveOk(false);
  // Primero intenta guardar 'Dos', falla antes de crear 'Tres'.
  assert.equal(await ctx.controller.createNewWorkspace('Tres'), false);
  assert.equal(paneIds(ctx.store.root).length, 2);
});

test('restoreWorkspace serializa la operación, cambia al snapshot y revierte si falla', async () => {
  const snap1 = createWorkspaceSnapshot(
    { kind: 'pane', id: 'a1' },
    { a1: { id: 'a1', cwd: '/proj-a' } },
    'a1',
  );
  const snap2 = createWorkspaceSnapshot(
    {
      kind: 'split',
      id: 's1',
      direction: 'row',
      ratio: 0.5,
      first: { kind: 'pane', id: 'b1' },
      second: { kind: 'pane', id: 'b2' },
    },
    { b1: { id: 'b1', cwd: '/proj-b1' }, b2: { id: 'b2', cwd: '/proj-b2' } },
    'b2',
  );
  const catalog: WorkspaceCatalog = {
    version: 1,
    activeId: null,
    workspaces: [
      createWorkspaceRecord('ws-a', 'Alpha', snap1, 1),
      createWorkspaceRecord('ws-b', 'Beta', snap2, 2),
    ],
  };
  const ctx = setup(catalog);

  await ctx.controller.restoreWorkspace('ws-b');
  assert.equal(ctx.getCatalog().activeId, 'ws-b');
  assert.deepEqual(paneIds(ctx.store.root), ['b1', 'b2']);
  assert.equal(ctx.store.activeId, 'b2');
  assert.equal(ctx.getLayoutRevision(), 1);
  assert.equal(ctx.operation.busy, false);

  // Si adquirir el lock falla, no restaura y limpia el estado busy.
  ctx.setAcquireOk(false);
  await ctx.controller.restoreWorkspace('ws-a');
  assert.equal(ctx.getCatalog().activeId, 'ws-b');
  assert.equal(ctx.operation.busy, false);
});

test('renameWorkspace adquiere y libera lock temporal para workspaces inactivos y lo conserva si es activo', async () => {
  const snap = createWorkspaceSnapshot({ kind: 'pane', id: 'p1' }, { p1: { id: 'p1' } }, 'p1');
  const catalog: WorkspaceCatalog = {
    version: 1,
    activeId: 'ws-1',
    workspaces: [
      createWorkspaceRecord('ws-1', 'Activo', snap, 1),
      createWorkspaceRecord('ws-2', 'Inactivo', snap, 2),
    ],
  };
  const ctx = setup(catalog);

  assert.equal(await ctx.controller.renameWorkspace('ws-2', 'Renombrado'), true);
  assert.deepEqual(ctx.calls, ['acquire:ws-2', 'save:ws-2:Renombrado', 'release:ws-2']);

  ctx.calls.length = 0;
  assert.equal(await ctx.controller.renameWorkspace('ws-1', 'Activo v2'), true);
  assert.deepEqual(ctx.calls, ['save:ws-1:Activo v2']);
});

test('deleteWorkspace pide confirmación, respeta cancelación y reinicia layout si era el activo', async () => {
  const snap = createWorkspaceSnapshot({ kind: 'pane', id: 'p1' }, { p1: { id: 'p1' } }, 'p1');
  const catalog: WorkspaceCatalog = {
    version: 1,
    activeId: 'ws-1',
    workspaces: [createWorkspaceRecord('ws-1', 'Temporal', snap, 1)],
  };
  const ctx = setup(catalog);
  ctx.setConfirm(false);
  await ctx.controller.deleteWorkspace('ws-1');
  assert.equal(ctx.getCatalog().workspaces.length, 1);

  ctx.setConfirm(true);
  await ctx.controller.deleteWorkspace('ws-1');
  assert.equal(ctx.getCatalog().workspaces.length, 0);
  assert.equal(ctx.getCatalog().activeId, null);
  assert.equal(ctx.getLayoutRevision(), 1);
});

test('prepareWindowClose respeta busy, guarda opcionalmente y libera todos los locks', async () => {
  const ctx = setup();
  // Si hay una restauración en curso, no cierra.
  assert.equal(ctx.operation.begin('restore', 'ws-x'), true);
  assert.equal(await ctx.controller.prepareWindowClose(false), false);
  ctx.operation.finish();

  // Cerrar sin guardar solo libera locks.
  assert.equal(await ctx.controller.prepareWindowClose(false), true);
  assert.deepEqual(ctx.calls, ['releaseAll']);

  // Cerrar guardando persiste el workspace antes de liberar locks.
  ctx.calls.length = 0;
  assert.equal(await ctx.controller.prepareWindowClose(true), true);
  assert.equal(ctx.calls.at(-1), 'releaseAll');
  assert.equal(ctx.getCatalog().workspaces.length, 1);

  // Si falla releaseAll, aborta el cierre.
  ctx.setReleaseAllOk(false);
  assert.equal(await ctx.controller.prepareWindowClose(false), false);
});
