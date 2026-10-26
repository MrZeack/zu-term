import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  createWorkspaceRecord,
  createWorkspaceSnapshot,
  reconcileWorkspaceCatalog,
  type WorkspaceCatalog,
} from './workspace.ts';

test('reconcilia workspaces entre múltiples ventanas sin importar cuál se abrió antes', () => {
  const root = { kind: 'pane' as const, id: 'p1' };
  const snap1 = createWorkspaceSnapshot(root, { p1: { id: 'p1', cwd: '/dir1' } }, 'p1');
  const snap2 = createWorkspaceSnapshot(root, { p1: { id: 'p1', cwd: '/dir2' } }, 'p1');

  // Ventana 1 se abrió primero y tiene el workspace 1
  const win1Catalog: WorkspaceCatalog = {
    version: 1,
    activeId: 'ws-1',
    workspaces: [createWorkspaceRecord('ws-1', 'Proyecto 1', snap1, 1000)],
  };

  // Ventana 2 se abrió después y guardó el workspace 2 en disco
  const diskCatalog: WorkspaceCatalog = {
    version: 1,
    activeId: 'ws-2',
    workspaces: [
      createWorkspaceRecord('ws-1', 'Proyecto 1', snap1, 1000),
      createWorkspaceRecord('ws-2', 'Proyecto 2', snap2, 2000),
    ],
  };

  // Ventana 1 sincroniza con disco
  const reconciled = reconcileWorkspaceCatalog(win1Catalog, diskCatalog);

  assert.equal(reconciled.workspaces.length, 2);
  assert.equal(reconciled.activeId, 'ws-1', 'preserva el workspace activo en ventana 1');
  assert.equal(
    reconciled.workspaces.some((w) => w.id === 'ws-1'),
    true,
  );
  assert.equal(
    reconciled.workspaces.some((w) => w.id === 'ws-2'),
    true,
  );
});

test('App.vue configura eventos y sincronización reactiva de workspaces para múltiples ventanas', async () => {
  const appSource = await readFile(new URL('../../App.vue', import.meta.url), 'utf8');
  const menuSource = await readFile(new URL('./WorkspaceMenu.vue', import.meta.url), 'utf8');

  // Evento de broadcast
  assert.match(appSource, /WORKSPACES_UPDATED_EVENT/);
  assert.match(appSource, /tauriEmit\(WORKSPACES_UPDATED_EVENT\)/);
  assert.match(appSource, /tauriListen\(WORKSPACES_UPDATED_EVENT/);

  // Recarga al enfocar ventana y al abrir menú
  assert.match(appSource, /window\.addEventListener\('focus'/);
  assert.match(appSource, /@open="reloadWorkspaces"/);
  assert.match(menuSource, /emit\('open'\)/);

  // Funciones de sincronización y reconciliación
  assert.match(appSource, /reloadWorkspaces/);
  assert.match(appSource, /reconcileWorkspaceCatalog/);
});
