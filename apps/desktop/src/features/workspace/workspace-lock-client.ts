import { invoke } from '@tauri-apps/api/core';

// The backend uses the calling window as the lock owner.
export const workspaceLockClient = {
  acquire: (workspaceId: string) => invoke<boolean>('workspace_lock_acquire', { workspaceId }),
  release: (workspaceId: string) => invoke<boolean>('workspace_lock_release', { workspaceId }),
  releaseAll: () => invoke<void>('workspace_lock_release_all'),
};
