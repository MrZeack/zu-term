export interface WorkspaceSessionDeps {
  writeConfig(data: string): Promise<void>;
  locks: {
    acquire(workspaceId: string): Promise<boolean>;
    release(workspaceId: string): Promise<boolean>;
    releaseAll(): Promise<void>;
  };
  onError(message: string, error?: unknown): void;
}

// Window-side workspace state: config writes run one at a time, in order, and
// the workspace whose lock this window holds is tracked in one place.
export function createWorkspaceSession({ writeConfig, locks, onError }: WorkspaceSessionDeps) {
  let writeQueue: Promise<unknown> = Promise.resolve();
  let lockedId: string | null = null;

  function persist(data: string): Promise<boolean> {
    const write = writeQueue.then(async () => {
      try {
        await writeConfig(data);
        return true;
      } catch (error) {
        onError('No se pudo guardar la configuración en ~/.config/zu-term.', error);
        return false;
      }
    });
    writeQueue = write;
    return write;
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
    persist,
    acquire,
    release,
    claim,
    releaseAll,
    get lockedId() {
      return lockedId;
    },
  };
}
