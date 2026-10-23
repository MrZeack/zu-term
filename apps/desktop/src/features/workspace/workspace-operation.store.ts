import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export const WORKSPACE_OPERATIONS = ['save', 'new', 'restore', 'delete'] as const;
export type WorkspaceOperation = (typeof WORKSPACE_OPERATIONS)[number];

export function createWorkspaceOperationStore() {
  return defineStore('workspace-operation', () => {
    const operation = ref<WorkspaceOperation | null>(null);
    const workspaceId = ref<string | null>(null);
    const busy = computed(() => operation.value !== null);

    function begin(nextOperation: WorkspaceOperation, nextWorkspaceId: string | null = null) {
      if (operation.value !== null) return false;
      operation.value = nextOperation;
      workspaceId.value = nextWorkspaceId;
      return true;
    }

    function finish() {
      operation.value = null;
      workspaceId.value = null;
    }

    return { operation, workspaceId, busy, begin, finish };
  });
}
