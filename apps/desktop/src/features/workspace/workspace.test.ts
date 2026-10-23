import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PaneState } from '../layout/layout.store.ts';
import type { LayoutNode } from '../layout/layout-tree.ts';
import {
  WORKSPACE_STORAGE_KEY,
  createWorkspaceCatalog,
  createWorkspaceRecord,
  createWorkspaceSnapshot,
  deleteWorkspace,
  loadWorkspaceCatalog,
  saveWorkspaceCatalog,
  setActiveWorkspace,
  upsertWorkspace,
  type WorkspaceStorage,
} from './workspace.ts';

function storage(seed?: string): WorkspaceStorage & { value: string | null } {
  let value = seed ?? null;
  return {
    get value() {
      return value;
    },
    getItem: (key) => (key === WORKSPACE_STORAGE_KEY ? value : null),
    setItem: (key, next) => {
      if (key === WORKSPACE_STORAGE_KEY) value = next;
    },
    removeItem: (key) => {
      if (key === WORKSPACE_STORAGE_KEY) value = null;
    },
  };
}

const root: LayoutNode = {
  kind: 'split',
  id: 'split-1',
  direction: 'row',
  ratio: 0.6,
  first: { kind: 'pane', id: 'pane-1' },
  second: { kind: 'pane', id: 'pane-2' },
};

const panes: Record<string, PaneState> = {
  'pane-1': {
    id: 'pane-1',
    cwd: '/Users/me/project',
    name: 'Frontend',
    terminalTitle: 'zsh',
    agent: { provider: 'codex', sessionId: 'codex-123' },
  },
  'pane-2': { id: 'pane-2', cwd: '/Users/me/project/api', agent: { provider: 'claude' } },
};

test('crea un snapshot de workspace solo con agentes reanudables y sin comandos transitorios', () => {
  const snapshot = createWorkspaceSnapshot(root, panes, 'pane-2');

  assert.deepEqual(snapshot.panes, {
    'pane-1': {
      id: 'pane-1',
      startCwd: '/Users/me/project',
      cwd: '/Users/me/project',
      name: 'Frontend',
      terminalTitle: 'zsh',
      agent: { provider: 'codex', sessionId: 'codex-123' },
    },
    'pane-2': {
      id: 'pane-2',
      startCwd: '/Users/me/project/api',
      cwd: '/Users/me/project/api',
    },
  });
});

test('descarta al cargar agentes guardados sin ID sin invalidar el pane', () => {
  const snapshot = createWorkspaceSnapshot(root, panes, 'pane-1');
  const catalog = upsertWorkspace(
    createWorkspaceCatalog(),
    createWorkspaceRecord('ws-1', 'Proyecto', snapshot, 123),
  );
  const legacy = structuredClone(catalog);
  const legacyPane = legacy.workspaces[0]?.snapshot.panes['pane-2'];
  assert.ok(legacyPane);
  legacyPane.agent = { provider: 'claude' };

  const loaded = loadWorkspaceCatalog(storage(JSON.stringify(legacy)));
  assert.deepEqual(loaded, catalog);
});

test('normaliza las comillas del ID del agente al crear el snapshot', () => {
  const snapshot = createWorkspaceSnapshot(
    { kind: 'pane', id: 'pane-1' },
    { 'pane-1': { id: 'pane-1', agent: { provider: 'codex', sessionId: "'codex-123'" } } },
    'pane-1',
  );

  assert.deepEqual(snapshot.panes['pane-1']?.agent, {
    provider: 'codex',
    sessionId: 'codex-123',
  });

  const snapshotUuid = createWorkspaceSnapshot(
    { kind: 'pane', id: 'pane-1' },
    {
      'pane-1': {
        id: 'pane-1',
        agent: { provider: 'codex', sessionId: "'01a164cb-0da6-7401-9c12-aa73e8a80bb7'" },
      },
    },
    'pane-1',
  );

  assert.deepEqual(snapshotUuid.panes['pane-1']?.agent, {
    provider: 'codex',
    sessionId: '01a164cb-0da6-7401-9c12-aa73e8a80bb7',
  });
});

test('omite metadatos visibles que exceden el límite de almacenamiento', () => {
  const snapshot = createWorkspaceSnapshot(
    root,
    {
      ...panes,
      'pane-1': {
        ...panes['pane-1'],
        id: 'pane-1',
        name: 'n'.repeat(161),
        terminalTitle: 't'.repeat(161),
      },
    },
    'pane-1',
  );

  assert.equal(snapshot.panes['pane-1']?.name, undefined);
  assert.equal(snapshot.panes['pane-1']?.terminalTitle, undefined);
});

test('guarda y carga un catálogo con workspace activo', () => {
  const target = storage();
  const snapshot = createWorkspaceSnapshot(root, panes, 'pane-1');
  let catalog = createWorkspaceCatalog();
  catalog = upsertWorkspace(catalog, createWorkspaceRecord('ws-1', 'Proyecto', snapshot, 123));
  catalog = setActiveWorkspace(catalog, 'ws-1');

  assert.equal(saveWorkspaceCatalog(target, catalog), true);
  assert.deepEqual(loadWorkspaceCatalog(target), catalog);
});

test('elimina un workspace y desactiva solo si era el actual', () => {
  const snapshot = createWorkspaceSnapshot(root, panes, 'pane-1');
  let catalog = createWorkspaceCatalog();
  catalog = upsertWorkspace(catalog, createWorkspaceRecord('ws-1', 'Uno', snapshot));
  catalog = upsertWorkspace(catalog, createWorkspaceRecord('ws-2', 'Dos', snapshot));
  catalog = setActiveWorkspace(catalog, 'ws-1');

  const next = deleteWorkspace(catalog, 'ws-1');
  assert.equal(next.activeId, null);
  assert.deepEqual(
    next.workspaces.map(({ id }) => id),
    ['ws-2'],
  );
});

test('descarta catálogos corruptos o inseguros', () => {
  const target = storage(
    JSON.stringify({
      version: 1,
      activeId: 'ws-1',
      workspaces: [{ id: 'ws-1', name: '', snapshot: {} }],
    }),
  );

  assert.equal(loadWorkspaceCatalog(target), null);
  assert.equal(target.value, null);
});

test('informa cuando el almacenamiento no puede guardar el catálogo', () => {
  const failing: WorkspaceStorage = {
    getItem: () => {
      throw new Error('unavailable');
    },
    setItem: () => {
      throw new Error('full');
    },
    removeItem: () => {
      throw new Error('unavailable');
    },
  };

  assert.equal(loadWorkspaceCatalog(failing), null);
  assert.equal(saveWorkspaceCatalog(failing, createWorkspaceCatalog()), false);
});

test('rechaza guardar un catálogo por encima del límite de workspaces', () => {
  const target = storage();
  const snapshot = createWorkspaceSnapshot(root, panes, 'pane-1');
  const catalog = createWorkspaceCatalog();
  catalog.workspaces = Array.from({ length: 25 }, (_, index) =>
    createWorkspaceRecord(`ws-${index}`, `Workspace ${index}`, snapshot, index),
  );

  assert.equal(saveWorkspaceCatalog(target, catalog), false);
  assert.equal(target.value, null);
});
