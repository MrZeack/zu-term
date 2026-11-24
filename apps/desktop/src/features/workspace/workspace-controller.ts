import type { PaneState } from '../layout/layout.store.ts';
import {
  createWorkspaceId,
  createWorkspaceRecord,
  deleteWorkspace as removeWorkspace,
  findWorkspace,
  MAX_WORKSPACES,
  reconcileWorkspaceCatalog,
  renameWorkspace as renameInCatalog,
  setActiveWorkspace,
  upsertWorkspace,
  type WorkspaceCatalog,
  type WorkspaceRecord,
  type WorkspaceSnapshot,
} from './workspace.ts';

export interface WorkspaceControllerLayoutStore {
  readonly panes: Record<string, PaneState>;
  readonly activeId: string;
  snapshot(): WorkspaceSnapshot;
  reset(cwd: string): void;
  restore(snapshot: WorkspaceSnapshot): boolean;
}

export interface WorkspaceControllerOperation {
  readonly busy: boolean;
  begin(action: 'restore', targetId: string): boolean;
  finish(): void;
}

export interface WorkspaceControllerSession {
  saveWorkspace(workspace: WorkspaceRecord): Promise<boolean>;
  deleteWorkspace(id: string): Promise<boolean>;
  acquire(id: string): Promise<boolean>;
  claim(id: string): Promise<void>;
  release(id: string): Promise<boolean>;
  releaseAll(): Promise<boolean>;
}

export interface WorkspaceControllerDeps {
  store: WorkspaceControllerLayoutStore;
  operation: WorkspaceControllerOperation;
  getCatalog(): WorkspaceCatalog;
  setCatalog(next: WorkspaceCatalog): void;
  getHome(): string | undefined;
  onLayoutChanged(): void;
  readDiskCatalog(): Promise<WorkspaceCatalog | null>;
  session: WorkspaceControllerSession;
  confirmDelete(name: string): Promise<boolean>;
  onError(message: string): void;
  clearError(): void;
}

// Orchestrates workspace persistence, cross-window locking and rollback.
export function createWorkspaceController({
  store,
  operation,
  getCatalog,
  setCatalog,
  getHome,
  onLayoutChanged,
  readDiskCatalog,
  session,
  confirmDelete,
  onError,
  clearError,
}: WorkspaceControllerDeps) {
  async function reloadWorkspaces(): Promise<boolean> {
    const disk = await readDiskCatalog();
    if (!disk) return false;
    setCatalog(reconcileWorkspaceCatalog(getCatalog(), disk));
    return true;
  }

  // Saves the one workspace this window has open; `next` is the local catalog
  // once it is stored. The backend rejects any other workspace.
  async function persistWorkspace(id: string, next: WorkspaceCatalog): Promise<boolean> {
    const workspace = findWorkspace(next, id);
    if (!workspace || !(await session.saveWorkspace(workspace))) return false;
    setCatalog(next);
    clearError();
    return true;
  }

  async function saveCurrentWorkspace(name?: string): Promise<boolean> {
    await reloadWorkspaces();
    const catalog = getCatalog();
    const current = findWorkspace(catalog, catalog.activeId);
    if (!current && catalog.workspaces.length >= MAX_WORKSPACES) {
      onError(`Ya existen ${MAX_WORKSPACES} workspaces. Elimina uno antes de guardar otro.`);
      return false;
    }
    const id = current?.id ?? createWorkspaceId();
    const ownsNewLock = !current;
    if (ownsNewLock && !(await session.acquire(id))) return false;
    const workspace = createWorkspaceRecord(
      id,
      name ?? current?.name ?? 'Workspace principal',
      store.snapshot(),
    );
    let next = upsertWorkspace(catalog, workspace);
    next = setActiveWorkspace(next, id);
    if (await persistWorkspace(id, next)) {
      if (ownsNewLock) await session.claim(id);
      return true;
    }
    if (ownsNewLock) await session.release(id);
    return false;
  }

  async function renameWorkspace(id: string, newName: string): Promise<boolean> {
    await reloadWorkspaces();
    const catalog = getCatalog();
    const workspace = findWorkspace(catalog, id);
    if (!workspace) return false;
    const trimmed = newName.trim();
    if (!trimmed) return false;
    if (workspace.name === trimmed) return true;

    const ownsLock = catalog.activeId === id;
    if (!ownsLock && !(await session.acquire(id))) return false;

    try {
      const updated = renameInCatalog(catalog, id, trimmed);
      return await persistWorkspace(id, updated);
    } finally {
      if (!ownsLock) {
        await session.release(id);
      }
    }
  }

  async function createNewWorkspace(name: string): Promise<boolean> {
    await reloadWorkspaces();
    if (getCatalog().workspaces.length >= MAX_WORKSPACES) {
      onError(`Ya existen ${MAX_WORKSPACES} workspaces. Elimina uno antes de crear otro.`);
      return false;
    }
    if (getCatalog().activeId && !(await saveCurrentWorkspace())) return false;
    const id = createWorkspaceId();
    if (!(await session.acquire(id))) return false;
    const previousSnapshot = store.snapshot();
    const cwd = store.panes[store.activeId]?.cwd ?? getHome() ?? '/';
    store.reset(cwd);
    onLayoutChanged();
    const workspace = createWorkspaceRecord(id, name, store.snapshot());
    let next = upsertWorkspace(getCatalog(), workspace);
    next = setActiveWorkspace(next, workspace.id);
    if (await persistWorkspace(id, next)) {
      await session.claim(id);
      return true;
    }
    store.restore(previousSnapshot);
    onLayoutChanged();
    await session.release(id);
    return false;
  }

  async function restoreWorkspace(id: string): Promise<boolean> {
    await reloadWorkspaces();
    const catalog = getCatalog();
    const workspace = findWorkspace(catalog, id);
    if (!workspace || catalog.activeId === id) return false;
    if (!operation.begin('restore', id)) return false;
    if (!(await session.acquire(id))) {
      operation.finish();
      return false;
    }
    let switched = false;
    try {
      if (getCatalog().activeId && !(await saveCurrentWorkspace())) return false;
      const previousSnapshot = store.snapshot();
      if (!store.restore(workspace.snapshot)) return false;
      const restoredWorkspace = { ...workspace, snapshot: store.snapshot() };
      const next = setActiveWorkspace(upsertWorkspace(getCatalog(), restoredWorkspace), id);
      if (!(await persistWorkspace(id, next))) {
        store.restore(previousSnapshot);
        return false;
      }
      await session.claim(id);
      switched = true;
      onLayoutChanged();
      return true;
    } finally {
      if (!switched) await session.release(id);
      operation.finish();
    }
  }

  async function deleteWorkspace(id: string): Promise<boolean> {
    await reloadWorkspaces();
    const catalog = getCatalog();
    const workspace = findWorkspace(catalog, id);
    if (!workspace) return false;
    const confirmed = await confirmDelete(workspace.name);
    if (!confirmed) return false;
    const wasActive = catalog.activeId === id;
    // The backend refuses if another window or instance has it open.
    if (!(await session.deleteWorkspace(id))) return false;
    setCatalog(removeWorkspace(catalog, id));
    clearError();
    if (wasActive) {
      store.reset(store.panes[store.activeId]?.cwd ?? getHome() ?? '/');
      onLayoutChanged();
    }
    return true;
  }

  async function prepareWindowClose(save: boolean): Promise<boolean> {
    clearError();
    if (operation.busy) return false;
    // The open workspace is window state (never persisted), so closing without
    // saving only has to release its lock.
    if (save && !(await saveCurrentWorkspace())) return false;
    return await session.releaseAll();
  }

  return {
    reloadWorkspaces,
    saveCurrentWorkspace,
    renameWorkspace,
    createNewWorkspace,
    restoreWorkspace,
    deleteWorkspace,
    prepareWindowClose,
  };
}
