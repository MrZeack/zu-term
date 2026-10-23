import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LayoutNode } from '../layout/layout-tree.ts';
import {
  createWorkspaceCatalog,
  createWorkspaceRecord,
  createWorkspaceSnapshot,
  setActiveWorkspace,
  syncActiveWorkspace,
} from './workspace.ts';

const root: LayoutNode = { kind: 'pane', id: 'pane-1' };

test('actualiza el snapshot del workspace activo cuando cambia el layout o el agente', () => {
  const initial = createWorkspaceSnapshot(
    root,
    { 'pane-1': { id: 'pane-1', cwd: '/tmp/inicial' } },
    'pane-1',
  );
  const nextSnapshot = createWorkspaceSnapshot(
    root,
    {
      'pane-1': {
        id: 'pane-1',
        cwd: '/tmp/actualizado',
        agent: { provider: 'codex', sessionId: 'codex-123' },
      },
    },
    'pane-1',
  );
  let catalog = createWorkspaceCatalog();
  catalog = setActiveWorkspace(
    { ...catalog, workspaces: [createWorkspaceRecord('ws-1', 'Proyecto', initial, 100)] },
    'ws-1',
  );

  const next = syncActiveWorkspace(catalog, nextSnapshot, 200);

  assert.ok(next);
  assert.equal(next.activeId, 'ws-1');
  assert.deepEqual(next.workspaces[0]?.snapshot, nextSnapshot);
  assert.equal(next.workspaces[0]?.updatedAt, 200);
  assert.equal(next.workspaces[0]?.name, 'Proyecto');
});

test('no crea ni modifica workspaces cuando no hay uno seleccionado', () => {
  const catalog = createWorkspaceCatalog();
  const snapshot = createWorkspaceSnapshot(root, { 'pane-1': { id: 'pane-1' } }, 'pane-1');

  assert.equal(syncActiveWorkspace(catalog, snapshot, 200), null);
});
