import type { ConfigSettings } from '../config/config-client.ts';
import type { WorkspaceRecord } from './workspace.ts';

export interface WorkspaceSessionDeps {
  store: {
    saveWorkspace(workspace: WorkspaceRecord): Promise<void>;
    deleteWorkspace(workspaceId: string): Promise<boolean>;
    saveSettings(settings: ConfigSettings): Promise<void>;
  };
  locks: {
    acquire(workspaceId: string): Promise<boolean>;
    release(workspaceId: string): Promise<boolean>;
    releaseAll(): Promise<void>;
  };
  onError(message: string, error?: unknown): void;
}

// Window-side workspace state: writes run one at a time, in order, and the
// workspace whose lock this window holds is tracked in one place. The backend
// merges each write into config.json and only accepts saving the workspace
// this window has open.
export function createWorkspaceSession({ store, locks, onError }: WorkspaceSessionDeps) {
  let writeQueue: Promise<unknown> = Promise.resolve();
  let lockedId: string | null = null;

  function enqueue<T>(task: () => Promise<T>, fallback: T, message: string): Promise<T> {
    const write = writeQueue.then(async () => {
      try {
        return await task();
      } catch (error) {
        onError(message, error);
        return fallback;
      }
    });
    writeQueue = write;
    return write;
  }

  function saveWorkspace(workspace: WorkspaceRecord): Promise<boolean> {
    return enqueue(
      async () => {
        await store.saveWorkspace(workspace);
        return true;
      },
      false,
      'No se pudo guardar el workspace en ~/.config/zu-term.',
    );
  }

  function saveSettings(settings: ConfigSettings): Promise<boolean> {
    return enqueue(
      async () => {
        await store.saveSettings(settings);
        return true;
      },
      false,
      'No se pudo guardar la configuración en ~/.config/zu-term.',
    );
  }

  async function deleteWorkspace(id: string): Promise<boolean> {
    const deleted = await enqueue<boolean | null>(
      () => store.deleteWorkspace(id),
      null,
      'No se pudo eliminar el workspace en ~/.config/zu-term.',
    );
    if (deleted === null) return false;
    if (!deleted) {
      onError('Ese workspace está abierto en otra ventana; ciérralo allí primero.');
      return false;
    }
    if (lockedId === id) await release(id);
    return true;
  }

  async function acquire(id: string): Promise<boolean> {
    try {
      if (await locks.acquire(id)) return true;
      onError('Ese workspace ya está abierto en otra ventana.');
    } catch (error) {
      onError('No se pudo bloquear el workspace en ~/.config/zu-term.', error);
    }
    return false;
  }

  async function release(id: string): Promise<boolean> {
    try {
      if (!(await locks.release(id))) {
        onError('No se pudo liberar el lock del workspace.');
        return false;
      }
      if (lockedId === id) lockedId = null;
      return true;
    } catch (error) {
      onError('No se pudo liberar el lock del workspace en ~/.config/zu-term.', error);
      return false;
    }
  }

  // Records an acquired lock as this window's workspace, freeing the previous one.
  async function claim(id: string): Promise<void> {
    const previousId = lockedId;
    lockedId = id;
    if (previousId && previousId !== id) await release(previousId);
  }

  async function releaseAll(): Promise<boolean> {
    try {
      await locks.releaseAll();
      lockedId = null;
      return true;
    } catch (error) {
      onError('No se pudieron liberar los locks de workspace.', error);
      return false;
    }
  }

  return {
    saveWorkspace,
    saveSettings,
    deleteWorkspace,
    acquire,
    release,
    claim,
    releaseAll,
    get lockedId() {
      return lockedId;
    },
  };
}
